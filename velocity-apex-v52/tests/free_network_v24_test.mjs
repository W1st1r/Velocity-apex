import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room} from '../src/worker.mjs';

const workerSrc=fs.readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
const ownerSrc=fs.readFileSync(new URL('../src/owner.mjs',import.meta.url),'utf8');
const clientSrc=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
for(const token of [
  "FREE_SERVERS=Object.freeze(['city-01','city-02','city-03'])",
  'FREE_MAX_PLAYERS=50','FREE_NEAR_RADIUS=1900','FREE_FAR_STATE_RATE_MS=240',
  'FREE_RECONNECT_GRACE_MS=5000','FREE_HEARTBEAT_TIMEOUT_MS=6500','FREE_HEARTBEAT_SWEEP_MS=2000',
  "(city-0[1-3])\\/(join|ws|leave)","url.pathname==='/free/leave'",'broadcastFreeState(source,t,except=null)'
])assert.ok(workerSrc.includes(token),`worker missing ${token}`);
assert.ok(ownerSrc.includes('Array.from({length:3}'),'owner tooling must target exactly 3 free servers');
for(const token of ['const MAX=50','RECONNECT_DELAYS=[180,520,1100,2200]','function freeSendInterval()','function leaveBeacon()','pagehide',"bufferedAmount>98304",'viewHalfW=W/(2*zoom)+180'])assert.ok(clientSrc.includes(token),`client missing ${token}`);

class Sock{constructor(id){this.id=id;this.sent=[];}deserializeAttachment(){return{playerId:this.id};}send(x){this.sent.push(JSON.parse(x));}}
const sockets=[new Sock('near'),new Sock('far')];
const ctx={getWebSockets:()=>sockets,storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}}};
const room=new Room(ctx,{});
room.loaded=true;
const source={id:'src',connected:true,state:{x:1000,y:1000},lastFarBroadcastAt:0};
const near={id:'near',connected:true,state:{x:1300,y:1100}};
const far={id:'far',connected:true,state:{x:4700,y:2700}};
room.room={mode:'freeroam',serverId:'city-01',records:{},players:[source,near,far],minigames:{},driftBattle:null,koth:null,dragChallenges:{}};
const publicRoom=room.publicFreeRoom();assert.equal(publicRoom.maxPlayers,50);assert.equal(publicRoom.players.length,3);
far.connected=false;assert.deepEqual(room.publicFreeRoom().players.map(p=>p.id).sort(),['near','src'],'disconnected player must disappear from public roster immediately');far.connected=true;
source.state={seq:1,x:1000,y:1000,vx:0,vy:0,angle:0,speed:0};room.broadcastFreeState(source,1000);assert.equal(sockets[0].sent.length,1);assert.equal(sockets[1].sent.length,1,'far player receives low-rate pulse');
source.state={...source.state,seq:2,x:1010};room.broadcastFreeState(source,1070);assert.equal(sockets[0].sent.length,2,'near player receives high-rate state');assert.equal(sockets[1].sent.length,1,'far player is throttled between pulses');
source.state={...source.state,seq:3,x:1020};room.broadcastFreeState(source,1250);assert.equal(sockets[1].sent.length,2,'far pulse resumes after throttle interval');

// Capacity is enforced against connected and reconnect-reserved sessions: exactly 50 slots.
const capCtx={getWebSockets:()=>[],storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}}};
const capRoom=new Room(capCtx,{});
for(let i=0;i<50;i++){
  const res=await capRoom.fetch(new Request(`https://room.internal/free/join?serverId=city-02`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`P${String(i).padStart(2,'0')}`})}));
  assert.equal(res.status,201,`slot ${i+1} should be accepted`);
}
const full=await capRoom.fetch(new Request('https://room.internal/free/join?serverId=city-02',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'P50'})}));
assert.equal(full.status,409,'51st player must be rejected');assert.equal((await full.json()).error,'SERVER_FULL');

console.log('free_network_v24_test: OK — 3x50 servers, 50-slot capacity, live-only roster, AOI/far throttling, adaptive client pacing, reconnect + page-exit cleanup');
