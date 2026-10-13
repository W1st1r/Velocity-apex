import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room} from '../src/worker.mjs';

const ctx={storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}},getWebSockets:()=>[]};
const room=new Room(ctx,{});room.loaded=true;
const player={id:'p1',userId:'u1',name:'@driver',connected:true,level:1,totalExp:0,lastSeq:1,lastSampleTime:1000,lastStateAt:1000,speedLimit:700,netRttMs:50,state:{seq:1,x:2500,y:1500,vx:0,vy:0,angle:0,speed:0,sampleTime:1000,serverTime:1000}};
room.room={mode:'freeroam',serverId:'football-v33',players:[player],records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{}};
const t=10_000;
const makeEvent=()=>{const e=room.makeEvent('minigame',[player.id],t,{gameKey:'football_3v3',points:{},strikes:{},score:{red:0,blue:0}});e.status='countdown';e.startAt=t;room.startMinigame(e,t);room.room.minigames={football_3v3:e};return e;};

// Regression: a moderate/slow ball must be able to cross the open goal mouth over several small server steps.
{
  const e=makeEvent();
  e.ball={x:1272,y:1500,vx:-145,vy:0,lastAt:t,lastTouchAt:0,lastTouchId:null,lastTouchBy:{},seq:0};
  for(let i=1;i<=12&&e.score.blue===0;i++)room.stepFootballBall(e,t+i*40);
  assert.equal(e.score.blue,1,'slow ball crossing the left goal line must count for blue');
  assert.equal(e.ball.x,2500,'ball resets to center after goal');
  assert.equal(e.ball.y,1500,'ball resets to center after goal');
}

// Outside the posts the same motion must bounce instead of scoring.
{
  const e=makeEvent();
  e.ball={x:1272,y:900,vx:-220,vy:0,lastAt:t,lastTouchAt:0,lastTouchId:null,lastTouchBy:{},seq:0};
  room.stepFootballBall(e,t+100);
  assert.equal(e.score.blue,0,'side wall outside the goal mouth must not score');
  assert.ok(e.ball.x>=1280,'ball remains inside the pitch outside the goal mouth');
  assert.ok(e.ball.vx>0,'side wall produces a positive rebound');
}

// A moving car should transfer momentum immediately and smoothly rather than replacing the ball velocity with a delayed fixed kick.
{
  const e=makeEvent();
  e.ball={x:2570,y:1500,vx:0,vy:0,lastAt:t,lastTouchAt:0,lastTouchId:null,lastTouchBy:{},seq:0};
  const car={x:2500,y:1500,vx:360,vy:0,angle:0,speed:360,sampleTime:t+20,serverTime:t+20};
  const hit=room.applyFootballContact(e,player,car,t+20,false);
  assert.equal(hit,true,'contact must be detected');
  assert.ok(e.ball.vx>350,'car momentum must be transferred to the ball on contact');
  assert.ok(Math.abs(e.ball.vy)<1,'straight hit should not create lateral jitter');
  assert.equal(e.ball.lastTouchId,player.id,'server tracks last ball touch');
}

// Touch snapshots may refine a recent authoritative player state, but large teleports are rejected.
{
  player.state={seq:2,x:2500,y:1500,vx:300,vy:0,angle:0,speed:300,sampleTime:t,serverTime:t};player.speedLimit=700;
  const near=room.validatedFootballTouchState(player,{x:2520,y:1500,vx:310,vy:0,angle:0,speed:310,sampleTime:t+40},t+40);
  assert.equal(near.x,2520,'nearby current touch snapshot should be accepted');
  const far=room.validatedFootballTouchState(player,{x:3300,y:1500,vx:310,vy:0,angle:0,speed:310,sampleTime:t+40},t+40);
  assert.notEqual(far.x,3300,'teleported touch snapshot must be rejected');
}

const client=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
for(const token of ['predictLocalFootballTouch','football_touch','minigame_ball','FOOTBALL_SEND_MS=40','rate=error>120?20:14'])assert.ok(client.includes(token),`missing client football V33 hook: ${token}`);
for(const token of ['FREE_FOOTBALL_STATE_RATE_MS=36','stepFootballBall(e,t)','applyFootballContact(e,p,current,t,broadcast=false)','validatedFootballTouchState','FREE_FOOTBALL_PROGRESS_MS=50'])assert.ok(worker.includes(token),`missing server football V33 hook: ${token}`);

console.log('free_football_v33_test: OK — open goals, smooth ball physics, immediate touch path, anti-teleport validation');
