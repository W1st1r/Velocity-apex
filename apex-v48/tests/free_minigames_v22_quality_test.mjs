import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Room} from '../src/worker.mjs';

// City-side hubs must be reachable on the exact collision geometry used by free roam.
const citySource=fs.readFileSync(new URL('../public/js/free-city.js',import.meta.url),'utf8');
const scope={window:{}};vm.createContext(scope);vm.runInContext(citySource,scope);
const city=scope.window.ApexCity;
const hubs=[[1835,300,'APEX STADIUM'],[3480,865,'RUSH CENTER'],[880,1430,'BOMB ARENA']];
for(const [x,y,name] of hubs){
  assert(city.roadAt(x,y,-20),`${name} center must be drivable`);
  for(let a=0;a<Math.PI*2;a+=Math.PI/6){const p=city.nearestRoad(x+Math.cos(a)*130,y+Math.sin(a)*130);assert(city.roadAt(p.x,p.y,-20),`${name} approach must snap to usable road`);}
}

// Server spawns must stay well inside the minigame arena and never overlap each other.
const ctx={storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}},getWebSockets:()=>[]};
const room=new Room(ctx,{});room.loaded=true;
const mk=(id,i)=>({id,userId:`u${i}`,name:`@q${i}`,connected:true,level:0,totalExp:0,lastSeq:i+1,lastSampleTime:0,lastStateAt:0,state:{seq:i+1,x:1680,y:430,vx:0,vy:0,angle:0,speed:0,sampleTime:1000,serverTime:1000}});
room.room={mode:'freeroam',serverId:'quality',players:Array.from({length:10},(_,i)=>mk(`p${i}`,i)),records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{}};
const t=20000;
for(const [gameKey,count] of [['football_3v3',6],['football_5v5',10],['checkpoint',8],['hot_potato',8]]){
  const e=room.makeEvent('minigame',room.room.players.slice(0,count).map(p=>p.id),t,{gameKey,points:{},strikes:{},score:{red:0,blue:0}});e.status='countdown';e.startAt=t;room.startMinigame(e,t);
  const spawns=Object.values(e.spawns);assert.equal(spawns.length,count,`${gameKey} spawn count`);
  for(const s of spawns)assert(s.x>=1290&&s.x<=3710&&s.y>=790&&s.y<=2210,`${gameKey} spawn inside safe arena`);
  for(let i=0;i<spawns.length;i++)for(let j=i+1;j<spawns.length;j++)assert(Math.hypot(spawns[i].x-spawns[j].x,spawns[i].y-spawns[j].y)>=150,`${gameKey} spawn overlap`);
}

// Football ball should rebound cleanly and score only through the goal mouth.
const e=room.makeEvent('minigame',room.room.players.slice(0,6).map(p=>p.id),t,{gameKey:'football_3v3',points:{},strikes:{},score:{red:0,blue:0}});e.status='countdown';e.startAt=t;room.startMinigame(e,t);
const p=room.room.players[0];
e.ball={x:2500,y:775,vx:0,vy:-500,lastAt:t,lastTouchAt:0,lastTouchId:null};room.updateFootballBall(e,p,{...p.state,x:1400,y:2100,speed:0},t+80);assert(e.ball.y>=778&&e.ball.vy>0,'ball rebounds from top wall');
e.ball={x:1260,y:900,vx:-500,vy:0,lastAt:t+80,lastTouchAt:0,lastTouchId:null};room.updateFootballBall(e,p,{...p.state,x:3000,y:2100,speed:0},t+160);assert.equal(e.score.blue,0,'side wall outside goal does not score');assert(e.ball.x>=1278&&e.ball.vx>0,'ball rebounds from left side wall outside goal');
e.ball={x:1270,y:1500,vx:-650,vy:0,lastAt:t+160,lastTouchAt:0,lastTouchId:null};room.updateFootballBall(e,p,{...p.state,x:3000,y:2100,speed:0},t+240);assert.equal(e.score.blue,1,'left goal scores for blue');assert.equal(e.ball.x,2500);assert.equal(e.ball.y,1500);

// Client/server geometry constants and V22 presentation quality hooks must stay aligned.
const client=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
for(const token of [
  "const MINI_ARENA={x:2500,y:1500,left:1250,right:3750,top:750,bottom:2250}",
  'function minigameBallVisual(e)',
  '_ballServerTime:m.serverTime',
  'Stadium apron and stands',
  'Penalty boxes + goal frames/nets',
  "ctx.setLineDash([18,24])",
  "Math.sin(performance.now()/180)"
])assert(client.includes(token),`missing quality hook: ${token}`);

console.log('free_minigames_v22_quality_test: OK — hub access, spawn safety, ball walls/goals, client smoothing and arena presentation');
