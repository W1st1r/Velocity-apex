import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room} from '../src/worker.mjs';

const clientSrc=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const workerSrc=fs.readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');

for(const token of [
  'REMOTE_BASE_BACKTIME_MS=88','REMOTE_ACTIVITY_BACKTIME_MS=62','REMOTE_DRAG_BACKTIME_MS=46',
  'REMOTE_HOLD_MS=260','REMOTE_DECAY_MS=780','function mixRemote(','function projectRemote(',
  'function advanceRemoteClock(','function remoteDelayTarget(','error>760','state.ws.bufferedAmount>4096'
])assert.ok(clientSrc.includes(token),`Free Roam NetSmooth token missing: ${token}`);
for(const token of ['FREE_STATE_RATE_MS=48','FREE_MINIGAME_STATE_RATE_MS=30','FREE_DRAG_STATE_RATE_MS=23','FREE_SOCKET_BACKPRESSURE_BYTES=8192','broadcastVolatile('])assert.ok(workerSrc.includes(token),`server NetSmooth token missing: ${token}`);

// Execute the actual Free Roam sampling functions in isolation. This keeps the test
// tied to production code without constructing the complete canvas/DOM game shell.
const begin=clientSrc.indexOf('function angleLerp('),end=clientSrc.indexOf('function resetRemoteToGrid(');
assert.ok(begin>=0&&end>begin,'unable to isolate Free Roam smoothing functions');
const state={drag:null,minigame:null,liveEvent:null,serverOffset:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const makeFns=new Function('state','clamp','TAU','FREE_SEND_MS','MINIGAME_SEND_MS','DRAG_SEND_MS','REMOTE_BASE_BACKTIME_MS','REMOTE_ACTIVITY_BACKTIME_MS','REMOTE_DRAG_BACKTIME_MS','REMOTE_HOLD_MS','REMOTE_DECAY_MS',`${clientSrc.slice(begin,end)};return {sampleRemote,remoteDelayTarget,advanceRemoteClock};`);
const {sampleRemote,remoteDelayTarget,advanceRemoteClock}=makeFns(state,clamp,Math.PI*2,50,32,25,88,62,46,260,780);

const moving={snapshots:[
  {seq:1,x:0,y:0,vx:100,vy:0,speed:100,angle:0,yawRate:0,_at:1000},
  {seq:2,x:5,y:0,vx:100,vy:0,speed:100,angle:0,yawRate:0,_at:1050},
  {seq:3,x:10,y:0,vx:100,vy:0,speed:100,angle:0,yawRate:0,_at:1100}
]};
const between=sampleRemote(moving,1075);assert.ok(between.x>7.4&&between.x<7.6,'Hermite playback must stay continuous between packets');
const shortLoss=sampleRemote(moving,1300);assert.ok(shortLoss.x>29&&shortLoss.x<31,'a short packet loss must not freeze a remote car');
const longLoss=sampleRemote(moving,2500);assert.ok(longLoss.x>90&&longLoss.x<105,'a long gap must ease forward instead of snapping or freezing');assert.ok(longLoss.speed<30,'stale velocity must decay safely');

const cleanDelay=remoteDelayTarget({cadenceMs:50,jitterMs:2,transitMs:28,lossRate:0},'other');
const roughDelay=remoteDelayTarget({cadenceMs:82,jitterMs:65,transitMs:115,lossRate:.18},'other');
assert.ok(roughDelay>cleanDelay+80,'playback buffer must grow when jitter/loss increases');
const clock={playbackTime:1000,teleportPending:false};const first=advanceRemoteClock(clock,1200,100,.016),second=advanceRemoteClock(clock,1216,260,.016);assert.ok(first>1000&&second>first,'adaptive playback time must never rewind when its delay changes');

class Sock{
  constructor(id,bufferedAmount=0){this.id=id;this.bufferedAmount=bufferedAmount;this.sent=[];}
  deserializeAttachment(){return{playerId:this.id};}
  send(raw){this.sent.push(JSON.parse(raw));}
}
const clear=new Sock('clear'),congested=new Sock('congested',9000),ctx={getWebSockets:()=>[clear,congested],storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}}},room=new Room(ctx,{});
room.loaded=true;const source={id:'source',connected:true,state:{seq:1,x:1000,y:1000,vx:120,vy:0,angle:0,speed:120},lastFarBroadcastAt:0};room.room={mode:'freeroam',serverId:'city-01',records:{},players:[source,{id:'clear',connected:true,state:{x:1100,y:1000}},{id:'congested',connected:true,state:{x:1150,y:1000}}],minigames:{},driftBattle:null,koth:null,dragChallenges:{}};
room.broadcastFreeState(source,1000);assert.equal(clear.sent.length,1,'healthy socket must receive the newest snapshot');assert.equal(congested.sent.length,0,'congested socket must drop volatile snapshots instead of building stale lag');

console.log('network_smoothing_v65_test: OK — adaptive buffer, Hermite motion, dead reckoning, monotonic playback, backpressure drop');
