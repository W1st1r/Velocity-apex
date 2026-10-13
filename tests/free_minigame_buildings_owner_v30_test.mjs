import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Room} from '../src/worker.mjs';

const client=readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const city=readFileSync(new URL('../public/js/free-city.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');

// Hubs are no longer the old road-intersection circles.
for(const old of ['footballHub:{x:1680,y:430','checkpointHub:{x:3660,y:1010','hotPotatoHub:{x:1050,y:1590'])assert.ok(!client.includes(old),`old road hub remains: ${old}`);
for(const now of ["footballHub:{x:1835,y:300", "checkpointHub:{x:3338,y:865", "hotPotatoHub:{x:820,y:1410"])assert.ok(client.includes(now),`new venue entrance missing: ${now}`);
assert.ok(!client.includes("drawZone(ctx,ZONES.footballHub"),'football road circle should be removed');
assert.ok(!client.includes("drawZone(ctx,ZONES.checkpointHub"),'checkpoint road circle should be removed');
assert.ok(!client.includes("drawZone(ctx,ZONES.hotPotatoHub"),'hot potato road circle should be removed');
assert.ok(client.includes('drawMinigameEntrance(ctx,ZONES.footballHub'),'rectangular venue entrance marker missing');

// City owns three dedicated, named venue buildings and driveable aprons.
for(const token of ['minigameVenues','APEX STADIUM','CHECKPOINT RUSH','BOMB ARENA','MINI FOOTBALL · 3×3 / 5×5','HOT POTATO','minigameVenue(c,v)','eventPad(c,a,accent'])assert.ok(city.includes(token),`city venue token missing: ${token}`);
assert.ok(html.includes('freeMinigameOwnerStart'),'owner start button missing');
assert.ok(client.includes("type:'owner_minigame_start'"),'owner start client message missing');
assert.ok(server.includes("if(p?.owner!==true)return this.error(ws,'OWNER_ONLY'"),'server owner authorization missing');
assert.ok(server.includes("if(m.type==='owner_minigame_start')"),'server owner start handler missing');

// Server method: owner can start a one-player minigame immediately; normal player cannot.
const ctx={storage:{put:async()=>{},deleteAll:async()=>{},get:async()=>null},getWebSockets:()=>[]};
const room=new Room(ctx,{});const t=1_800_000_000_000;
const owner={id:'owner',userId:'u-owner',name:'@w1st1r',owner:true,connected:true,level:0,totalExp:0,state:{x:1835,y:300,vx:0,vy:0,angle:0,speed:0,sampleTime:t,serverTime:t},lastSeq:0,lastStateAt:t,lastSampleTime:t};
const normal={id:'normal',userId:'u-normal',name:'@driver',owner:false,connected:true,level:0,totalExp:0,state:{x:1835,y:300,vx:0,vy:0,angle:0,speed:0,sampleTime:t,serverTime:t},lastSeq:0,lastStateAt:t,lastSampleTime:t};
room.room={mode:'freeroam',serverId:'v30-test',players:[owner,normal],records:{},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{}};
room.save=async()=>{};room.sendToPlayers=()=>{};
const errors=[];room.error=(_ws,code,msg)=>{errors.push([code,msg]);return null;};
await room.joinMinigame({},owner,'football_3v3',t);
let e=room.room.minigames.football_3v3;assert.equal(e.status,'waiting');assert.equal(e.participants.length,1);
await room.ownerStartMinigame({},owner,t+1000);e=room.room.minigames.football_3v3;assert.equal(e.status,'running');assert.equal(e.participants.length,1);assert.equal(e.startAt,t+1000);assert.ok(e.endAt>e.startAt);
// reset and verify a non-owner is rejected server-side.
room.room.minigames={};await room.joinMinigame({},normal,'football_3v3',t+2000);await room.ownerStartMinigame({},normal,t+3000);assert.equal(room.room.minigames.football_3v3.status,'waiting');assert.equal(errors.at(-1)?.[0],'OWNER_ONLY');

console.log('free_minigame_buildings_owner_v30_test: OK — dedicated venues + secure owner instant start');
