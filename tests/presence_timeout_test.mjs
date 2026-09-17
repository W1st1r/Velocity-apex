import assert from 'node:assert/strict';
import {Room} from '../src/worker.mjs';
import {CONNECTION_HEARTBEAT_TIMEOUT_MS,CONNECTION_HEARTBEAT_SWEEP_MS,RECONNECT_GRACE_MS} from '../src/protocol.mjs';

class FakeSocket {
  constructor(playerId,lastSeenAt){this.attachment={playerId,lastSeenAt};this.closed=false;this.sent=[];}
  deserializeAttachment(){return this.attachment;}
  serializeAttachment(v){this.attachment=v;}
  close(code,reason){this.closed=true;this.closeCode=code;this.closeReason=reason;}
  send(value){this.sent.push(value);}
}

class FakeStorage {
  constructor(){this.value=null;this.alarmAt=0;this.deleted=false;}
  async get(key){return key==='room'?this.value:null;}
  async put(key,value){if(key==='room')this.value=structuredClone(value);}
  async setAlarm(at){this.alarmAt=at;}
  async deleteAll(){this.value=null;this.deleted=true;}
}

const t=Date.now();
assert.equal(RECONNECT_GRACE_MS,15000,'disconnect grace must be 15s');
assert.equal(CONNECTION_HEARTBEAT_TIMEOUT_MS,12000,'heartbeat timeout must be 12s');
assert.equal(CONNECTION_HEARTBEAT_SWEEP_MS,3000,'heartbeat sweep must be 3s');

const stale=new FakeSocket('stale',t-CONNECTION_HEARTBEAT_TIMEOUT_MS-100);
const live=new FakeSocket('live',t-1000);
const storage=new FakeStorage();
const ctx={storage,getWebSockets:()=>[stale,live]};
const room=new Room(ctx,{});
room.loaded=true;
room.room={
  mode:'freeroam',serverId:'city-01',createdAt:t-60000,updatedAt:t,emptySince:0,
  records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,
  players:[
    {id:'stale',name:'@old',connected:true,disconnectedUntil:0,adminLevel:0,level:0,totalExp:0,activePlayMs:0,onlineRewardCounter:0},
    {id:'live',name:'@current',connected:true,disconnectedUntil:0,adminLevel:0,level:0,totalExp:0,activePlayMs:0,onlineRewardCounter:0}
  ]
};
await room.alarm();
assert.equal(stale.closed,true,'stale websocket must be closed');
assert.equal(stale.closeCode,4008);
assert.equal(stale.closeReason,'heartbeat_timeout');
assert.deepEqual(room.room.players.map(p=>p.id),['live'],'stale player must be removed from freeroam roster');
assert.equal(room.room.players[0].connected,true,'live player must stay connected');
assert.ok(storage.alarmAt>0,'heartbeat sweep must remain scheduled while players are connected');
assert.ok(storage.alarmAt-Date.now()<=CONNECTION_HEARTBEAT_SWEEP_MS+1200,'next sweep should be scheduled within a few seconds');

// A socket with no matching accepted WebSocket is also stale, preventing "ghost" players
// from surviving after an app is force-closed and the platform misses the close event.
const storage2=new FakeStorage();
const ctx2={storage:storage2,getWebSockets:()=>[]};
const ghostRoom=new Room(ctx2,{});ghostRoom.loaded=true;ghostRoom.room={
  mode:'freeroam',serverId:'city-02',createdAt:t-60000,updatedAt:t,emptySince:0,
  records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,
  players:[{id:'ghost',name:'@yesterday',connected:true,disconnectedUntil:0,adminLevel:0,level:0,totalExp:0,activePlayMs:0,onlineRewardCounter:0}]
};
await ghostRoom.alarm();
assert.equal(ghostRoom.room,null,'ghost-only room should be cleared');
assert.equal(storage2.deleted,true,'ghost-only room storage should be deleted');

console.log('presence_timeout_test: OK (12s heartbeat timeout + 3s sweep + 15s reconnect grace)');
