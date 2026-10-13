import assert from 'node:assert/strict';
import {Room} from '../src/worker.mjs';

const stored=[];
const storage={async get(){return null},async put(key,value){stored.push([key,value])},async setAlarm(){}};
const sent1=[],sent2=[];
const socket1={deserializeAttachment(){return {playerId:'p1'}},send(text){sent1.push(JSON.parse(text))}};
const socket2={deserializeAttachment(){return {playerId:'p2'}},send(text){sent2.push(JSON.parse(text))}};
const sockets=[socket1,socket2];
const ctx={storage,getWebSockets(){return sockets}};
const room=new Room(ctx,{});room.loaded=true;
const base=Date.now()-80,startAt=base-5000,challengeId='drag-sync-test';
const p1={id:'p1',name:'@fast',connected:true,lastSeq:10,lastStateAt:0,lastSampleTime:base-50,dragChallengeId:challengeId,state:{x:4690,y:2635,vx:500,vy:0,angle:0,speed:500,yawRate:0,sampleTime:base-50,serverTime:base-30}};
const p2={id:'p2',name:'@latepacket',connected:true,lastSeq:20,lastStateAt:0,lastSampleTime:base-40,dragChallengeId:challengeId,state:{x:4690,y:2705,vx:500,vy:0,angle:0,speed:500,yawRate:0,sampleTime:base-40,serverTime:base-20}};
room.room={mode:'freeroam',serverId:'city-01',createdAt:base-6000,updatedAt:base,emptySince:0,records:{speed:0,drift:0},dragQueue:[],dragChallenges:{[challengeId]:{id:challengeId,ids:['p1','p2'],startAt,finishes:{},createdAt:base-6000,lastProgressAt:0}},players:[p1,p2]};

// p2's packet reaches the server first, but its synchronized crossing happened later.
await room.handleFreeMessage(socket2,p2,{type:'free_state',state:{seq:21,x:4730,y:2705,vx:500,vy:0,angle:0,speed:500,yawRate:0,sampleTime:base}});
assert.equal(sent1.some(m=>m.type==='activity_result'),false,'one finish must not settle the drag before the rival snapshot arrives');
await room.handleFreeMessage(socket1,p1,{type:'free_state',state:{seq:11,x:4730,y:2635,vx:500,vy:0,angle:0,speed:500,yawRate:0,sampleTime:base-20}});
const result=sent1.findLast(m=>m.type==='activity_result');
assert.ok(result,'server must publish an authoritative drag result');
assert.equal(result.winnerId,'p1','winner must be based on synchronized crossing time, not packet arrival order');
assert.ok(result.times.p1<result.times.p2,'p1 crossing time must be earlier');
assert.equal(result.photoFinish,true,'15 ms gap should be marked as a photo finish');
assert.ok(result.gapMs>0&&result.gapMs<40,`expected a small positive photo-finish gap, got ${result.gapMs}`);
assert.equal(room.room.dragChallenges[challengeId],undefined,'settled challenge must be removed');
assert.equal(p1.dragChallengeId,undefined);assert.equal(p2.dragChallengeId,undefined);
console.log('free_drag_sync_test: OK — authoritative crossing time beats packet arrival order');
