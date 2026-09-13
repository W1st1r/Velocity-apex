import assert from 'node:assert/strict';
import {Room} from '../src/worker.mjs';

class Storage{
  constructor(){this.m=new Map();this.alarm=0;}
  async get(k){return this.m.get(k)} async put(k,v){this.m.set(k,structuredClone(v))} async setAlarm(v){this.alarm=v} async deleteAll(){this.m.clear();this.deleted=true}
}
class Ctx{
  constructor(){this.storage=new Storage();this.sockets=[];} getWebSockets(){return this.sockets;} acceptWebSocket(ws){this.sockets.push(ws);}
}
class FakeWS{
  constructor(playerId){this.a={playerId};this.sent=[];this.closed=false;} deserializeAttachment(){return this.a;} serializeAttachment(a){this.a=a;} send(t){this.sent.push(JSON.parse(t));} close(){this.closed=true;}
}
const req=(path,body)=>new Request('https://room.internal'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const state=(seq,laps=0,progress=.1)=>({seq,clientTime:Date.now(),x:100+seq,y:50,vx:30,vy:0,angle:0,speed:120,yawRate:0,progress,laps,checkpoint:1,steer:0,throttle:1,brake:0,finished:false});

const ctx=new Ctx(),room=new Room(ctx,{});
let res=await room.fetch(req('/create',{code:'ABC234',name:'HOST',settings:{trackId:'apexCircuit',laps:3,maxPlayers:8,collisions:false},loadout:{liveryId:'koenigsegg-jesko',effectId:'rainbowFlame'}}));assert.equal(res.status,201);let hostData=await res.json();
const joins=[];for(let i=0;i<7;i++){res=await room.fetch(req('/join',{name:'P'+(i+2),loadout:{liveryId:i===0?'mercedes-amg-one':'apexLime',effectId:'standard'}}));assert.equal(res.status,201);joins.push(await res.json());}
res=await room.fetch(req('/join',{name:'P9',loadout:{}}));assert.equal(res.status,409);assert.equal((await res.json()).error,'ROOM_FULL');

// Simulate two connected clients for lobby and permissions.
const host=room.room.players[0],guest=room.room.players[1];assert.equal(host.liveryId,'koenigsegg-jesko');assert.equal(host.effectId,'rainbowFlame');assert.equal(guest.liveryId,'mercedes-amg-one');host.connected=true;guest.connected=true;const hws=new FakeWS(host.id),gws=new FakeWS(guest.id);ctx.sockets=[hws,gws];
await room.webSocketMessage(gws,JSON.stringify({type:'settings_update',settings:{trackId:'neonHarbor',laps:5,maxPlayers:8,collisions:false}}));assert.equal(room.room.settings.trackId,'apexCircuit');assert.ok(gws.sent.some(m=>m.code==='HOST_ONLY'));
await room.webSocketMessage(hws,JSON.stringify({type:'settings_update',settings:{trackId:'neonHarbor',laps:5,maxPlayers:8,collisions:false}}));assert.equal(room.room.settings.trackId,'neonHarbor');
await room.webSocketMessage(hws,JSON.stringify({type:'ready',ready:true}));await room.webSocketMessage(gws,JSON.stringify({type:'ready',ready:true}));assert.equal(host.ready,true);assert.equal(guest.ready,true);
// Remaining reserved players would count as active, but only connected players gate start.
await room.webSocketMessage(hws,JSON.stringify({type:'start_race'}));assert.equal(room.room.status,'countdown');assert.equal(room.room.gridOrder.length,2);const raceId=room.room.raceId;room.room.status='racing';
// Impossible lap jumps are ignored; then simulate legitimate accumulated race progress before the final lap.
await room.webSocketMessage(hws,JSON.stringify({type:'player_state',raceId,state:state(1,5,.9)}));assert.equal(host.state,null);
for(const p of [host,guest]){p.serverLaps=4;p.lastLapAt=Date.now()-9000;p.state=state(0,4,.7);p.lastSeq=0;p.lastStateAt=Date.now()-100;}
await room.webSocketMessage(hws,JSON.stringify({type:'player_state',raceId,state:state(1,5,.9)}));await room.webSocketMessage(gws,JSON.stringify({type:'player_state',raceId,state:state(1,5,.8)}));
await room.webSocketMessage(gws,JSON.stringify({type:'race_finish',raceId,state:state(2,5,.99)}));await room.webSocketMessage(hws,JSON.stringify({type:'race_finish',raceId,state:state(2,5,.99)}));assert.equal(guest.finishPlace,1);assert.equal(host.finishPlace,2);assert.deepEqual(room.room.finishOrder,[guest.id,host.id]);
// Lobby reset is host-only and allowed only after every racer in the server grid has finished.
await room.webSocketMessage(gws,JSON.stringify({type:'return_lobby'}));assert.equal(room.room.status,'racing');assert.ok(gws.sent.some(m=>m.code==='HOST_ONLY'));
await room.webSocketMessage(hws,JSON.stringify({type:'return_lobby'}));assert.equal(room.room.status,'lobby');assert.equal(host.ready,false);assert.equal(guest.ready,false);assert.equal(room.room.gridOrder.length,0);
// Restore a racing state to verify duplicate finish handling and later cleanup logic without changing finish order.
room.room.status='racing';room.room.raceId=raceId;room.room.gridOrder=[host.id,guest.id];room.room.finishOrder=[guest.id,host.id];guest.finishPlace=1;host.finishPlace=2;
// Duplicate finish cannot reorder.
await room.webSocketMessage(gws,JSON.stringify({type:'race_finish',raceId,state:state(3,5,.99)}));assert.deepEqual(room.room.finishOrder,[guest.id,host.id]);
// Malformed messages do not crash.
await room.webSocketMessage(hws,'{not json');assert.equal(room.room.status,'racing');await room.webSocketMessage(hws,JSON.stringify({type:'ready',v:999,ready:true}));assert.ok(hws.sent.some(m=>m.code==='PROTOCOL_VERSION'));

// Host migration only after grace expiry/removal.
room.room.status='lobby';host.connected=false;host.disconnectedUntil=Date.now()-1;guest.connected=true;guest.disconnectedUntil=0;for(const p of room.room.players.slice(2)){p.connected=false;p.disconnectedUntil=Date.now()-1;}await room.alarm();assert.equal(room.room.hostId,guest.id);assert.equal(room.room.players.length,1);assert.equal(room.room.players[0].liveryId,'mercedes-amg-one');
// Reconnect stale-close protection: another live socket with same player means no duplicate/removal.
const replacement=new FakeWS(guest.id);ctx.sockets=[gws,replacement];guest.connected=true;const countBefore=room.room.players.length;await room.handleDisconnect(gws);assert.equal(room.room.players.length,countBefore);assert.equal(guest.connected,true);
// Empty-room cleanup after grace removes storage.
ctx.sockets=[];guest.connected=false;guest.disconnectedUntil=Date.now()-1;await room.alarm();assert.equal(room.room,null);assert.equal(ctx.storage.deleted,true);
// Explicit lobby leave removes the player immediately and migrates HOST without waiting for reconnect grace.
const ctx2=new Ctx(),room2=new Room(ctx2,{});res=await room2.fetch(req('/create',{code:'XYZ234',name:'HOST2',settings:{trackId:'apexCircuit',laps:3,maxPlayers:2,collisions:false},loadout:{}}));const h2=await res.json();res=await room2.fetch(req('/join',{name:'GUEST2',loadout:{}}));const g2=await res.json();const hp2=room2.room.players.find(p=>p.id===h2.playerId),gp2=room2.room.players.find(p=>p.id===g2.playerId);hp2.connected=gp2.connected=true;const hws2=new FakeWS(hp2.id),gws2=new FakeWS(gp2.id);ctx2.sockets=[hws2,gws2];await room2.webSocketMessage(hws2,JSON.stringify({type:'leave',v:1}));assert.equal(room2.room.players.length,1);assert.equal(room2.room.hostId,gp2.id);
console.log('online_room_test: OK (2-client flow + 8-player capacity)');
