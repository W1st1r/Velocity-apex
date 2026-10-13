import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Room} from '../src/worker.mjs';

const ctx={storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}},getWebSockets:()=>[]};
const room=new Room(ctx,{});room.loaded=true;
const player={id:'p1',speedLimit:700,netRttMs:70,state:{x:2500,y:1500,vx:200,vy:0,angle:0,speed:200,sampleTime:10000,serverTime:10000}};
room.room={mode:'freeroam',serverId:'smooth',players:[player],minigames:{}};
const event={id:'match',gameKey:'football_3v3',participants:['p1'],status:'running',ball:{x:2570,y:1500,vx:0,vy:0,lastAt:10000,lastTouchBy:{},seq:0},score:{red:0,blue:0}};
room.room.minigames.football_3v3=event;

// A long nose-to-ball dribble must never pump the ball up to the speed cap.
for(let i=1;i<=70;i++){
  const t=10000+i*40;
  player.state={...player.state,x:2500+i*8,sampleTime:t,serverTime:t};
  room.stepFootballBall(event,t);
  room.applyFootballContact(event,player,player.state,t);
  assert.ok(Math.hypot(event.ball.vx,event.ball.vy)<420,`unbounded impulse at tick ${i}`);
  assert.ok(event.ball.x>player.state.x+70,`ball passed inside car at tick ${i}`);
}

// Exercise the real browser functions in isolation at 60 fps while authoritative
// packets arrive at 50 ms intervals, then replay a late packet out of order.
const source=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
function functionSource(name){
  const start=source.indexOf(`  function ${name}(`);assert.ok(start>=0,name);
  let depth=0,body=false;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    if(source[i]==='{'){depth++;body=true;}else if(source[i]==='}'&&!--depth&&body)return source.slice(start,i+1);
  }
  throw new Error(`Unclosed function ${name}`);
}
const sent=[];
const sandbox={Math,Date,performance:{now:()=>0},state:{serverOffset:0,lastFootballTouchAt:0,playerId:'p1',spectator:false},car:{x:2500,y:1500,vx:200,vy:0,angle:0},MINI_ARENA:{x:2500,y:1500,left:1250,right:3750,top:750,bottom:2250},FOOTBALL_BALL_R:30,FOOTBALL_GOAL_HALF:245,FOOTBALL_CONTACT_R:78,FOOTBALL_MAX_BALL_SPEED:1050,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),send:message=>sent.push(message)};
vm.createContext(sandbox);
vm.runInContext(['projectMinigameBall','acceptFootballBall','advanceFootballBall'].map(functionSource).join('\n'),sandbox);
const game={status:'running',ball:{x:2578,y:1500,vx:200,vy:0,seq:1},_ballServerTime:20000};
const points=[];
for(let frame=1;frame<=180;frame++){
  const now=20000+frame*1000/60;
  sandbox.car.x=2500+200*(frame/60);
  if(frame%3===0){
    const stamp=now-70;
    sandbox.acceptFootballBall(game,{x:2578+200*((stamp-20000)/1000),y:1500,vx:200,vy:0,seq:frame/3,lastTouchId:'p1'},stamp);
  }
  sandbox.advanceFootballBall(game,1/60,now);
  points.push(game._ballPred.x);
  if(frame===61){const old=game.ball.x;sandbox.acceptFootballBall(game,{x:1500,y:1500,vx:-900,vy:0,seq:0},now-400);assert.equal(game.ball.x,old,'late packet must not rewind the ball');}
}
const steps=points.slice(1).map((x,i)=>x-points[i]);
assert.ok(Math.min(...steps)>-.2,`backward motion during dribble: ${Math.min(...steps)}`);
assert.ok(Math.max(...steps)<14,`visible position jump during dribble: ${Math.max(...steps)}`);
assert.ok(sent.length>20&&sent.length<100,'touch packets are throttled while local physics stays at frame rate');
console.log('free_football_smooth_v61_test: OK — smooth 60 fps dribble, bounded impulses, late packet ignored');
