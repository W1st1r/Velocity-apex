import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room} from '../src/worker.mjs';
import {PROGRESSION_REWARDS} from '../src/progression.mjs';

const ctx={
  storage:{get:async()=>null,put:async()=>{},setAlarm:async()=>{},deleteAll:async()=>{}},
  getWebSockets:()=>[]
};
const room=new Room(ctx,{});
room.loaded=true;
const mkPlayer=(id,i)=>({id,userId:`u${i}`,name:`@p${i}`,connected:true,level:i,totalExp:0,lastSeq:i+1,lastSampleTime:0,lastStateAt:0,state:{seq:i+1,x:1600+i*8,y:430,vx:0,vy:0,angle:0,speed:0,sampleTime:1000,serverTime:1000}});
room.room={mode:'freeroam',serverId:'city-test',players:Array.from({length:10},(_,i)=>mkPlayer(`p${i}`,i)),records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{}};

// Football 3x3: exact roster, balanced teams, arena spawns and team score.
const t=10_000;
const e3=room.makeEvent('minigame',room.room.players.slice(0,6).map(p=>p.id),t,{gameKey:'football_3v3',points:{},strikes:{},score:{red:0,blue:0}});
e3.status='countdown';e3.startAt=t;
room.room.minigames.football_3v3=e3;
room.startMinigame(e3,t);
assert.equal(e3.status,'running');
assert.equal(e3.teams.red.length,3);
assert.equal(e3.teams.blue.length,3);
assert.equal(Object.keys(e3.spawns).length,6);
assert.ok(Object.values(e3.spawns).every(s=>s.x>=1250&&s.x<=3750&&s.y>=750&&s.y<=2250));
e3.ball.x=3785;e3.ball.y=1500;e3.ball.vx=400;e3.ball.vy=0;e3.ball.lastAt=t;
room.updateFootballBall(e3,room.room.players[0],room.room.players[0].state,t+100);
assert.equal(e3.score.red,1);
assert.equal(e3.ball.x,2500);
assert.equal(e3.ball.y,1500);

// Football 5x5: 10 racers split 5/5.
const e5=room.makeEvent('minigame',room.room.players.map(p=>p.id),t,{gameKey:'football_5v5',points:{},strikes:{},score:{red:0,blue:0}});
e5.status='countdown';e5.startAt=t;
room.room.minigames={football_5v5:e5};
room.startMinigame(e5,t);
assert.equal(e5.teams.red.length,5);
assert.equal(e5.teams.blue.length,5);

// Checkpoint Rush: reaching a checkpoint increments score and rotates the target.
const cpPlayers=room.room.players.slice(0,3);
const cp=room.makeEvent('minigame',cpPlayers.map(p=>p.id),t,{gameKey:'checkpoint',points:{},strikes:{},score:{red:0,blue:0}});
cp.status='countdown';cp.startAt=t;
room.room.minigames={checkpoint:cp};
room.startMinigame(cp,t);
const runner=cpPlayers[0];delete runner.minigameTeleportedAt;
const target={...cp.checkpoint};
runner.state={...runner.state,x:target.x,y:target.y,speed:80,sampleTime:t+1000,serverTime:t+1000};
room.updateMinigameMetrics(runner,{...runner.state,x:target.x-40,y:target.y,sampleTime:t+900,serverTime:t+900},runner.state,t+1000);
assert.equal(cp.points[runner.id],1);
assert.equal(cp.checkpointSerial,1);

// Hot Potato: close contact transfers the bomb and refreshes its timer.
const hpPlayers=room.room.players.slice(0,3);
const hp=room.makeEvent('minigame',hpPlayers.map(p=>p.id),t,{gameKey:'hot_potato',points:{},strikes:{},score:{red:0,blue:0}});
hp.status='countdown';hp.startAt=t;
room.room.minigames={hot_potato:hp};
room.startMinigame(hp,t);
const holder=room.room.players.find(p=>p.id===hp.bombHolderId);
const receiver=hpPlayers.find(p=>p.id!==holder.id);
delete receiver.minigameTeleportedAt;
holder.state={...holder.state,x:2500,y:1500};
receiver.state={...receiver.state,x:2540,y:1500,speed:35,sampleTime:t+2000,serverTime:t+2000};
hp.lastBombTransferAt=t;
room.updateMinigameMetrics(receiver,{...receiver.state,x:2570,sampleTime:t+1900,serverTime:t+1900},receiver.state,t+2000);
assert.equal(hp.bombHolderId,receiver.id);
assert.ok(hp.bombDeadline>t+2000);

// Release assets and reward keys must exist.
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/css/style.css',import.meta.url),'utf8');
for(const id of ['freeMinigameHud','freeMinigamePanel','freeMinigameChoices'])assert.ok(html.includes(id),`missing ${id}`);
for(const token of ['footballHub','checkpointHub','hotPotatoHub','minigame_goal','velocity-red','electric-blue','drawMinigameArena'])assert.ok(client.includes(token),`missing ${token}`);
assert.ok(css.includes('APEX MINI GAMES V21'));
for(const key of ['FOOTBALL_WIN','FOOTBALL_DRAW','FOOTBALL_LOSS','MINIGAME_FIRST','MINIGAME_SECOND','MINIGAME_THIRD','MINIGAME_PARTICIPATION'])assert.ok(PROGRESSION_REWARDS[key],`missing reward ${key}`);
console.log('free minigames V21 test: OK');
