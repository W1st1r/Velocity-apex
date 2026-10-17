import assert from 'node:assert/strict';
import {Room} from '../src/worker.mjs';
import {RACE_RUNTIME_VERSION} from '../src/room-race-authority.mjs';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
const sql=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let batchTail=Promise.resolve();
const DB={prepare(query){let args=[];return{bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){let release;const prior=batchTail;batchTail=new Promise(r=>release=r);await prior;sql.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}finally{release();}}};
function account(id,credits){sql.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,0,0)').run(id,id,id,'x','x');sql.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,0,0)').run(id,JSON.stringify({credits,ownedLiveries:['apexLime']}));}
const credits=id=>JSON.parse(sql.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json).credits;


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
await room.webSocketMessage(hws,JSON.stringify({type:'settings_update',settings:{trackId:'sierraFlow',laps:1,maxPlayers:8,collisions:false,drift:true}}));assert.equal(room.room.settings.trackId,'sierraFlow');assert.equal(room.room.settings.drift,true);assert.equal(room.publicRoom().settings.drift,true);
await room.webSocketMessage(hws,JSON.stringify({type:'settings_update',settings:{trackId:'neonHarbor',laps:5,maxPlayers:8,collisions:false,drift:false}}));assert.equal(room.room.settings.trackId,'neonHarbor');assert.equal(room.room.settings.drift,false);
await room.webSocketMessage(hws,JSON.stringify({type:'ready',ready:true}));await room.webSocketMessage(gws,JSON.stringify({type:'ready',ready:true}));assert.equal(host.ready,true);assert.equal(guest.ready,true);
// Remaining reserved players would count as active, but only connected players gate start.
await room.webSocketMessage(hws,JSON.stringify({type:'start_race',runtimeVersion:RACE_RUNTIME_VERSION}));assert.equal(room.room.status,'countdown');assert.equal(room.room.gridOrder.length,2);const raceId=room.room.raceId;room.room.status='racing';
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


// Wager flow: server requires confirmation, locks a deterministic pot and awards it to server-confirmed P1.
const ctx3=new Ctx(),room3=new Room(ctx3,{DB});
res=await room3.fetch(req('/create',{code:'BET234',name:'BANKER',settings:{trackId:'apexCircuit',laps:3,maxPlayers:2,collisions:false,wager:500},loadout:{effectId:'purpleFlame'}}));const bHostData=await res.json();
res=await room3.fetch(req('/join',{name:'RIVAL',loadout:{effectId:'cyanFlame'}}));const bGuestData=await res.json();
const bh=room3.room.players.find(p=>p.id===bHostData.playerId),bg=room3.room.players.find(p=>p.id===bGuestData.playerId);bh.userId='bet-host';bg.userId='bet-guest';account(bh.userId,400);account(bg.userId,900);bh.connected=bg.connected=true;const bhws=new FakeWS(bh.id),bgws=new FakeWS(bg.id);ctx3.sockets=[bhws,bgws];
await room3.webSocketMessage(bhws,JSON.stringify({type:'ready',v:1,ready:true,runtimeVersion:RACE_RUNTIME_VERSION}));assert.equal(bh.ready,false);assert.ok(bhws.sent.some(m=>m.code==='WAGER_CONFIRM_REQUIRED'));
await room3.webSocketMessage(bhws,JSON.stringify({type:'wager_confirm',v:1,amount:500,balance:400}));assert.equal(bh.wagerConfirmed,false);assert.ok(bhws.sent.some(m=>m.code==='INSUFFICIENT_CR'));
sql.prepare("UPDATE player_saves SET save_json=json_set(save_json,'$.credits',1500) WHERE user_id=?").run(bh.userId);await room3.webSocketMessage(bhws,JSON.stringify({type:'wager_confirm',v:1,amount:500,balance:0}));await room3.webSocketMessage(bgws,JSON.stringify({type:'wager_confirm',v:1,amount:500,balance:900}));assert.equal(bh.wagerConfirmed,true);assert.equal(bg.wagerConfirmed,true);
await room3.webSocketMessage(bhws,JSON.stringify({type:'ready',v:1,ready:true,runtimeVersion:RACE_RUNTIME_VERSION}));await room3.webSocketMessage(bgws,JSON.stringify({type:'ready',v:1,ready:true,runtimeVersion:RACE_RUNTIME_VERSION}));await room3.webSocketMessage(bhws,JSON.stringify({type:'start_race',v:1,runtimeVersion:RACE_RUNTIME_VERSION}));
assert.equal(credits(bh.userId),1000);assert.equal(credits(bg.userId),400);assert.equal(room3.publicRoom().settlement.authority,'server');assert.equal(room3.room.settlement.status,'locked');assert.equal(room3.room.settlement.pot,1000);assert.equal(room3.room.settlement.stakes[bh.id],500);assert.equal(room3.room.settlement.stakes[bg.id],500);
const wagerRaceId=room3.room.raceId;room3.room.status='racing';for(const p of [bh,bg]){p.serverLaps=3;p.state=state(0,3,.95);p.lastSeq=0;p.lastStateAt=Date.now()-100;}
await room3.webSocketMessage(bgws,JSON.stringify({type:'race_finish',v:1,raceId:wagerRaceId,state:state(1,3,.99)}));assert.equal(bg.finishPlace,0,'client finish must not pay a server-authoritative room');assert.equal(room3.room.settlement.status,'locked');assert(bgws.sent.some(m=>m.code==='SERVER_RACE_REQUIRED'));assert.equal(credits(bg.userId),400);assert.equal(credits(bh.userId),1000);await room3.refundActiveWager('FIXTURE_END');assert.equal(credits(bh.userId),1500);assert.equal(credits(bg.userId),900);

// If a participant leaves while a wager is locked, the race is cancelled and escrow is refunded server-side.
const ctx4=new Ctx(),room4=new Room(ctx4,{DB});res=await room4.fetch(req('/create',{code:'REF234',name:'HOSTR',settings:{trackId:'apexCircuit',laps:3,maxPlayers:2,collisions:false,wager:250},loadout:{}}));const rhd=await res.json();res=await room4.fetch(req('/join',{name:'GUESTR',loadout:{}}));const rgd=await res.json();const rh=room4.room.players.find(p=>p.id===rhd.playerId),rg=room4.room.players.find(p=>p.id===rgd.playerId);rh.userId='refund-host';rg.userId='refund-guest';account(rh.userId,1000);account(rg.userId,1000);rh.connected=rg.connected=true;const rhws=new FakeWS(rh.id),rgws=new FakeWS(rg.id);ctx4.sockets=[rhws,rgws];for(const [p,ws] of [[rh,rhws],[rg,rgws]]){await room4.webSocketMessage(ws,JSON.stringify({type:'wager_confirm',v:1,amount:250,balance:1000}));await room4.webSocketMessage(ws,JSON.stringify({type:'ready',v:1,ready:true,runtimeVersion:RACE_RUNTIME_VERSION}));}
await room4.webSocketMessage(rhws,JSON.stringify({type:'start_race',v:1,runtimeVersion:RACE_RUNTIME_VERSION}));assert.equal(room4.room.settlement.status,'locked');await room4.webSocketMessage(rhws,JSON.stringify({type:'leave',v:1}));assert.equal(room4.room.status,'lobby');assert.equal(room4.room.settlement.status,'refunded');assert.equal(room4.room.settlement.reason,'PLAYER_LEFT');assert.ok(rgws.sent.some(m=>m.type==='race_cancelled'));
assert.equal(credits(rh.userId),1000);assert.equal(credits(rg.userId),1000);
console.log('online_wager_flow: OK (confirm + pot + payout + refund)');

// Crash between D1 lock and final Durable Object countdown persistence.
const {lockRoomWager}=await import('../src/room-wager-escrow.mjs');
const interrupted=structuredClone(room4.room);interrupted.status='locking';interrupted.raceId='crash-window';interrupted.players=[{...rh},{...rg}];interrupted.settlement={raceId:'crash-window',authority:'server',status:'locking',wager:250,pot:500,stakes:{[rh.id]:250,[rg.id]:250}};
assert((await lockRoomWager(DB,{raceId:'crash-window',userIds:[rh.userId,rg.userId],stake:250})).ok);assert.equal(credits(rh.userId),750);
const recoveredCtx=new Ctx();await recoveredCtx.storage.put('room',interrupted);const recovered=new Room(recoveredCtx,{DB});await recovered.load();assert.equal(recovered.room.status,'lobby');assert.equal(recovered.room.settlement.status,'refunded');assert.equal(credits(rh.userId),1000);assert.equal(credits(rg.userId),1000);
const secondRecovery=new Room(recoveredCtx,{DB});await secondRecovery.load();assert.equal(credits(rh.userId),1000,'recovery refund must be idempotent');
console.log('online_wager_recovery: OK (D1/DO crash window refunded once)');

// Payout committed in D1 before room state was saved; winner survives restart.
const {settleRoomWager}=await import('../src/room-wager-escrow.mjs');
const payoutRoom=structuredClone(interrupted);payoutRoom.status='racing';payoutRoom.raceId='payout-window';payoutRoom.raceStartAt=Date.now()-10000;payoutRoom.settlement={...payoutRoom.settlement,raceId:'payout-window',status:'locked'};
assert((await lockRoomWager(DB,{raceId:'payout-window',userIds:[rh.userId,rg.userId],stake:250})).ok);assert((await settleRoomWager(DB,{raceId:'payout-window',winnerUserId:rg.userId})).ok);
const payoutCtx=new Ctx();await payoutCtx.storage.put('room',payoutRoom);const payoutRecovery=new Room(payoutCtx,{DB});await payoutRecovery.load();assert.equal(payoutRecovery.room.settlement.status,'awarded');assert.equal(payoutRecovery.room.settlement.winnerId,rg.id);assert.equal(payoutRecovery.room.players.find(p=>p.id===rg.id).finishPlace,1);assert.equal(credits(rg.userId),1250);assert.equal(credits(rh.userId),750);
console.log('online_wager_recovery: OK (durable payout winner restored without double credit)');
// Concurrent start/leave callbacks must not refund before the D1 lock commits.
const serialRoom=structuredClone(payoutRoom);serialRoom.status='lobby';serialRoom.hostId=rh.id;serialRoom.raceId=null;serialRoom.settlement=null;serialRoom.gridOrder=[];serialRoom.finishOrder=[];
for(const p of serialRoom.players){p.connected=true;p.ready=true;p.wagerConfirmed=true;p.finishPlace=0;}
const serialCtx=new Ctx();await serialCtx.storage.put('room',serialRoom);serialCtx.sockets=[rhws,rgws];const serial=new Room(serialCtx,{DB});await serial.load();
const beforeSerial=[credits(rh.userId),credits(rg.userId)];await Promise.all([serial.webSocketMessage(rhws,JSON.stringify({type:'start_race',runtimeVersion:RACE_RUNTIME_VERSION})),serial.webSocketMessage(rgws,JSON.stringify({type:'leave'}))]);
assert.equal(serial.room.settlement.status,'refunded');assert.equal(serial.room.status,'lobby');assert.deepEqual([credits(rh.userId),credits(rg.userId)],beforeSerial);
console.log('online_wager_serialization: OK (concurrent start and leave conserve balances)');
