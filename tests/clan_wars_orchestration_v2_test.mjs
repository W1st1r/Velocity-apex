import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleClanWarRequest} from '../src/clan-wars.mjs';
import {Room} from '../src/worker.mjs';
import {RACE_RUNTIME_VERSION,roomEngine} from '../src/room-race-authority.mjs';

const sql=new DatabaseSync(':memory:');
const migrations=new URL('../migrations/',import.meta.url);
for(const name of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL(name,migrations),'utf8'));
const copy=(v)=>structuredClone(v);
let batchTail=Promise.resolve();
const DB={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){let release;const prior=batchTail;batchTail=new Promise(resolve=>release=resolve);await prior;sql.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}finally{release();}}};
class Storage{constructor(){this.map=new Map();}async get(k){return copy(this.map.get(k));}async put(k,v){this.map.set(k,copy(v));}async setAlarm(){}}
class Ctx{constructor(storage=new Storage()){this.storage=storage;this.sockets=[];}getWebSockets(){return this.sockets;}}
class Socket{constructor(playerId){this.a={playerId};this.sent=[];}deserializeAttachment(){return this.a;}serializeAttachment(a){this.a=a;}send(value){this.sent.push(JSON.parse(value));}close(){}}
const roomCtx=new Ctx(),room=new Room(roomCtx,{DB});
const roomNamespace={idFromName:name=>name,get:name=>({fetch:req=>room.fetch(req)})};
const env={DB,ROOMS:roomNamespace};
const userIds={red:['red-lead','red-two','red-three'],blue:['blue-lead','blue-two','blue-three'],green:['green-lead','green-two','green-three'],gold:['gold-lead','gold-two','gold-three']};
const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;const t=clock;
for(const [crew,ids] of Object.entries(userIds)){
  for(const uid of ids){sql.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(uid,uid,uid,'x','x',t,t);sql.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(createHash('sha256').update(`session-${uid}`).digest('base64url'),uid,t,t+90*86400000,t);sql.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(uid,JSON.stringify({credits:1000,ownedLiveries:['apexLime'],ownedEffects:['standard'],selectedLivery:'apexLime',selectedEffect:'standard'}),t,t);}
  sql.prepare('INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES(?,?,?,?,?,?,?)').run(crew,crew.toUpperCase(),crew.toUpperCase(),'*','#00aaff',ids[0],t);
  for(const uid of ids)sql.prepare('INSERT INTO crew_members(user_id,crew_id,joined_at) VALUES(?,?,?)').run(uid,crew,t);
}
const call=async(uid,path,method='POST',body={})=>{
  const raw=`session-${uid}`,request=new Request(`https://game.test${path}`,{method,headers:{cookie:`va_session=${raw}`,'content-type':'application/json',origin:'https://game.test'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  const response=await handleClanWarRequest(request,env,new URL(request.url));return{status:response.status,data:await response.json()};
};
const req=(path,body)=>new Request(`https://room.internal${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

try{
  // Idempotent calls, state permissions, conflict handling.
  const denied=await call('red-two','/api/clan-wars','POST',{defenderCrewId:'blue',idempotencyKey:'member-call'});assert.equal(denied.status,403);
  const made=await call('red-lead','/api/clan-wars','POST',{defenderCrewId:'blue',idempotencyKey:'attack-1'});assert.equal(made.status,201);const battleId=made.data.challenge.id;
  const replay=await call('red-lead','/api/clan-wars','POST',{defenderCrewId:'blue',idempotencyKey:'attack-1'});assert.equal(replay.data.replay,true);assert.equal(replay.data.challenge.id,battleId);
  assert.equal((await call('red-lead','/api/clan-wars','POST',{defenderCrewId:'green',idempotencyKey:'attack-conflict'})).status,409);
  assert.equal((await call('blue-lead',`/api/clan-wars/${battleId}/decision`,'POST',{decision:'accept'})).data.challenge.state,'ACCEPTED');
  assert.equal((await call('blue-lead',`/api/clan-wars/${battleId}/decision`,'POST',{decision:'accept'})).data.replay,true);
  const rejected=await call('green-lead','/api/clan-wars','POST',{defenderCrewId:'gold',idempotencyKey:'attack-reject'});assert.equal(rejected.status,201);
  assert.equal((await call('gold-lead',`/api/clan-wars/${rejected.data.challenge.id}/decision`,'POST',{decision:'reject'})).data.challenge.state,'REJECTED');
  // Three-member server validation and roster lock.
  const rosterPath=`/api/clan-wars/${battleId}/roster`;
  assert.equal((await call('red-lead',rosterPath,'POST',{userIds:['red-lead','red-two','red-two']})).status,400);
  assert.equal((await call('blue-lead',rosterPath,'POST',{userIds:['blue-lead','blue-two','green-three']})).status,403);
  const redRoster=await call('red-lead',rosterPath,'POST',{userIds:userIds.red});assert.equal(redRoster.status,200);
  assert.equal((await call('red-lead',rosterPath,'POST',{userIds:userIds.red})).data.replay,true);
  const blueRoster=await call('blue-lead',rosterPath,'POST',{userIds:userIds.blue});assert.equal(blueRoster.data.challenge.state,'ROSTER_LOCKED');
  // Ready only for assigned users. Last ready provisions the private DO room.
  assert.equal((await call('green-lead',`/api/clan-wars/${battleId}/ready`)).status,403);
  for(const uid of [...userIds.red,...userIds.blue]){const ready=await call(uid,`/api/clan-wars/${battleId}/ready`);assert.equal(ready.status,200);}
  let current=await call('red-lead',`/api/clan-wars/${battleId}`,'GET');assert.equal(current.data.challenge.state,'READY');
  // Authenticated Worker session derives the DO token from the fixed roster.
  const connected=[];for(const uid of [...userIds.red,...userIds.blue]){const credentials=await call(uid,`/api/clan-wars/${battleId}/connect`);assert.equal(credentials.status,200);assert.equal(credentials.data.ok,true);connected.push(credentials.data);}
  assert.equal(new Set(connected.map(x=>x.playerId)).size,6);assert.equal(room.room.players.length,6);
  const credentials=await call('red-two',`/api/clan-wars/${battleId}/connect`);assert.equal(credentials.data.playerId,connected[1].playerId,'same account reconnect must recover the same server participant');
  assert.equal((await call('green-lead',`/api/clan-wars/${battleId}/connect`)).status,403);
  const outsider=await(await room.fetch(req('/clan/session',{userId:'green-lead'}))).json();assert.equal(outsider.error,'ROSTER_MEMBERSHIP_REQUIRED');
  const join=await room.fetch(req('/join',{userId:'green-lead',name:'outsider'}));assert.equal(join.status,403);
  // Six virtual sockets can enter the existing server-authoritative race path.
  roomCtx.sockets=room.room.players.map(p=>new Socket(p.id));for(const p of room.room.players){p.connected=true;p.everConnected=true;p.disconnectedUntil=0;}
  for(const socket of roomCtx.sockets)await room.webSocketMessage(socket,JSON.stringify({type:'ready',v:1,ready:true,runtimeVersion:RACE_RUNTIME_VERSION}));
  await room.webSocketMessage(roomCtx.sockets[0],JSON.stringify({type:'start_race',v:1,runtimeVersion:RACE_RUNTIME_VERSION}));
  assert.equal(room.room.status,'countdown');assert.ok(roomEngine(room),'clan room uses the existing raceAuthority engine');
  assert.equal(sql.prepare('SELECT state FROM clan_war_challenges WHERE id=?').get(battleId).state,'RUNNING');
  assert.equal((await call('red-lead',rosterPath,'POST',{userIds:userIds.red})).status,409,'locked roster cannot be edited once the match starts');
  // Re-instantiating the DO preserves the same roster-bound player/session identity.
  const recovered=new Room(new Ctx(roomCtx.storage),{DB});const restored=await(await recovered.fetch(req('/clan/session',{userId:'red-two'}))).json();assert.equal(restored.playerId,credentials.data.playerId);assert.equal(restored.sessionToken,credentials.data.sessionToken);
  const recoveredRace=new Room(new Ctx(roomCtx.storage),{DB});await recoveredRace.load();assert.equal(recoveredRace.room.status,'countdown');assert.deepEqual(roomEngine(recoveredRace).serialize(),roomEngine(room).serialize(),'authority state survives DO reconstruction');
  const cancellable=await call('gold-lead','/api/clan-wars','POST',{defenderCrewId:'green',idempotencyKey:'cancel-test'});assert.equal(cancellable.status,201);
  assert.equal((await call('gold-lead',`/api/clan-wars/${cancellable.data.challenge.id}/cancel`)).data.state,'CANCELLED');
  assert.equal((await call('gold-lead',`/api/clan-wars/${cancellable.data.challenge.id}/cancel`)).data.replay,true);
  const expiring=await call('green-lead','/api/clan-wars','POST',{defenderCrewId:'gold',idempotencyKey:'expires'});assert.equal(expiring.status,201);
  clock=t+25*60*60*1000;const expired=await call('green-lead',`/api/clan-wars/${expiring.data.challenge.id}`,'GET');assert.equal(expired.data.challenge.state,'EXPIRED');
  assert.equal((await call('green-lead','/api/clan-wars','POST',{defenderCrewId:'gold',idempotencyKey:'after-expiry'})).status,201,'expired invitations release both clan reservations');
  // Migration is repeatable on the isolated database.
  sql.exec(fs.readFileSync(new URL('0024_clan_war_orchestration.sql',migrations),'utf8'));
  console.log('clan_wars_orchestration_v2_test: PASS (challenge, idempotency, permissions, rosters, readiness, private room, reconnect persistence, migration replay)');
}finally{Date.now=originalNow;sql.close();}
