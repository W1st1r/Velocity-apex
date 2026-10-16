import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAuthRequest} from '../src/auth.mjs';
import {RaceSession,validateRaceConfig,validateInputs,RACE_RUNTIME_VERSION} from '../public/js/race-session-v77.mjs';
import {createRaceRuntime} from '../public/js/race-runtime-v77.mjs';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let tail=Promise.resolve(),failProgressOnce=false;
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){if(failProgressOnce&&sql.startsWith('INSERT INTO player_progress(')){failProgressOnce=false;throw Error('injected EXP write failure');}const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(items){let done;const prev=tail;tail=new Promise(r=>done=r);await prev;db.exec('BEGIN');try{const r=[];for(const s of items)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}finally{done();}}};
const env={DB},realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const userSave={saveVersion:6,credits:123456,ownedLiveries:['apexLime','apollo-evo'],ownedEffects:['standard'],caseInventory:{basic:2},carUpgrades:{'apollo-evo':{speed:5,acceleration:5,brakes:5}},careerUnlocked:1,careerCompleted:[],careerBestTimes:{},achievements:['legacy-proof']};
const cookie='race-test-cookie',cookieHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookie))).toString('base64url');
db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('r1','racer','Racer','x','x',clock,clock);
db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(cookieHash,'r1',clock,clock+86400000,clock);
db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run('r1',JSON.stringify(userSave),1,clock,clock);
// New migration is additive and re-runnable; the legacy save stays byte-identical.
const before=db.prepare('SELECT save_json FROM player_saves').get().save_json;
db.exec(fs.readFileSync(new URL('../migrations/0019_race_authority.sql',import.meta.url),'utf8'));
assert.equal(db.prepare('SELECT save_json FROM player_saves').get().save_json,before);
async function call(route,body,authenticated=true){const url=new URL('https://apex.test/api/economy/races/'+route),res=await handleAuthRequest(new Request(url,{method:'POST',headers:{origin:url.origin,'content-type':'application/json',...(authenticated?{cookie:'va_session='+cookie}:{})},body:JSON.stringify(body)}),env,url);return {status:res.status,data:await res.json()};}
const career={mode:'career',carId:'apollo-evo',level:1};
const start=(requestId,config=career)=>call('start',{requestId,config,runtimeVersion:RACE_RUNTIME_VERSION});
try{
 assert.equal((await call('start',{requestId:'unauthorized-0001',config:career,runtimeVersion:RACE_RUNTIME_VERSION},false)).status,401);
 assert.equal((await start('locked-career-001',{...career,level:2})).data.error,'CAREER_LOCKED');
 assert.equal((await start('unowned-car-00001',{...career,carId:'mary'})).data.error,'CAR_NOT_OWNED');
 assert.equal((await call('start',{requestId:'oversized-body-0001',runtimeVersion:RACE_RUNTIME_VERSION,config:career,padding:'x'.repeat(80000)})).status,413,'stream body limit applies without Content-Length');
 const begun=await start('honest-career-0001');assert.equal(begun.status,200,JSON.stringify(begun.data));
 assert.equal((await start('honest-career-0001')).data.raceId,begun.data.raceId);
 assert.equal((await start('honest-career-0001',{...career,level:2})).data.error,'IDEMPOTENCY_KEY_REUSED');
 assert.equal((await start('concurrent-start-01')).data.error,'ACTIVE_RACE_EXISTS');
 const raceId=begun.data.raceId,base={raceId,runtimeVersion:RACE_RUNTIME_VERSION,sequence:0,inputs:[[0,1,0,0]]};
 assert.equal((await call('finish',{raceId,result:{completed:true},credits:9999999})).data.error,'UNTRUSTED_RACE_FIELDS');
 assert.equal((await call('finish',{raceId})).data.error,'RACE_NOT_FINISHED');
 assert.equal((await call('input',{...base,inputs:[[Infinity,1,0,0]]})).data.error,'INVALID_CONTROLS');
 assert.equal((await call('input',{...base,x:99999,checkpoint:3})).data.error,'UNTRUSTED_RACE_FIELDS');
 assert.equal((await call('input',base)).data.error,'RACE_CLOCK_AHEAD');
 const local=new RaceSession(begun.data.config,begun.data.carSave,begun.data.seed,begun.data.state);
 const driverR=createRaceRuntime(173),driver=new driverR.AIController(local.player,100,'extreme');
 clock=begun.data.startsAt+3000;let sequence=0,frames=0;
 while(!local.result&&frames<9000){
   const inputs=[];for(let i=0;i<120&&!local.result;i++){const o=driver.think(1/60,local.track,local.cars);const frame=[o.steer,o.throttle,o.brake,0];inputs.push(frame);local.step(frame);frames++;}
   clock+=2100;
   const packet={raceId,runtimeVersion:RACE_RUNTIME_VERSION,sequence,inputs};
   const replies=sequence===0?await Promise.all([call('input',packet),call('input',packet)]):[await call('input',packet)];
   for(const response of replies){assert.equal(response.status,200,JSON.stringify(response.data));assert.equal(response.data.frame,local.frame);assert.equal(response.data.player.x,local.player.x);assert.equal(response.data.player.y,local.player.y);}
   if(sequence===0){const changed={...packet,inputs:inputs.map((x,i)=>i?x:[0,0,0,0])};assert.equal((await call('input',changed)).data.error,'INPUT_SEQUENCE_REUSED');}
   sequence++;
   // Restoring a saved session produces exactly the same deterministic next state.
   const restored=new RaceSession(begun.data.config,begun.data.carSave,begun.data.seed,local.serialize());assert.deepEqual(restored.serialize(),local.serialize());
 }
 assert.ok(local.result?.completed,'honest physics-driven career must finish before timeout');assert.ok(local.result.tier,'honest driver must earn a medal');
 const resume=await call('resume',{raceId});assert.equal(resume.data.state.frame,local.frame);
 const saveBeforeFailure=db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('r1').save_json;
 failProgressOnce=true;const originalError=console.error;console.error=()=>{};let failed;try{failed=await call('finish',{raceId});}finally{console.error=originalError;}assert.equal(failed.status,500);assert.equal(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('r1').save_json,saveBeforeFailure);assert.equal(db.prepare('SELECT status FROM race_sessions WHERE id=?').get(raceId).status,'active');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM economy_operations').get().n,0);
 const finish=await Promise.all([call('finish',{raceId}),call('finish',{raceId})]);for(const f of finish)assert.equal(f.status,200,JSON.stringify(f.data));
 const paid=finish[0].data;assert.ok(paid.result.credits>0);assert.ok(paid.result.exp>0);assert.equal(paid.save.credits,userSave.credits+paid.result.credits);assert.equal(paid.save.careerUnlocked,2);assert.deepEqual(paid.save.careerCompleted,['career01']);assert.deepEqual(paid.save.achievements,['legacy-proof']);assert.equal(paid.save.caseInventory.basic,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM progression_rewards WHERE event_id=?').get(raceId).n,1);
 assert.equal(db.prepare('SELECT total_exp FROM player_progress WHERE user_id=?').get('r1').total_exp,paid.result.exp);
 assert.equal(JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('r1').save_json).credits,paid.save.credits);
 assert.equal((await call('finish',{raceId})).data.replay,true);
 const state=db.prepare('SELECT state_json FROM race_sessions WHERE id=?').get(raceId).state_json;
 assert.equal((await call('input',{...base,sequence:sequence,inputs:[[0,1,0,0]]})).data.error,'RACE_CLOSED');assert.equal(db.prepare('SELECT state_json FROM race_sessions WHERE id=?').get(raceId).state_json,state);
 // User isolation: changing race ID never selects another user's session.
 assert.equal((await call('resume',{raceId:crypto.randomUUID()})).status,404);
 const expired=await start('expiring-career-001');assert.equal(expired.status,200);clock=expired.data.expiresAt+1;const late=await call('input',{raceId:expired.data.raceId,runtimeVersion:RACE_RUNTIME_VERSION,sequence:0,inputs:[[0,1,0,0]]});assert.equal(late.data.error,'RACE_EXPIRED');assert.equal((await call('finish',{raceId:expired.data.raceId})).data.error,'RACE_NOT_FINISHED');assert.equal((await call('start',{requestId:'stale-runtime-0001',config:career,runtimeVersion:'obsolete'})).data.error,'RACE_CLIENT_UPDATE_REQUIRED');
 assert.throws(()=>validateInputs([[0,1,0,0,999]]),/INVALID_CONTROLS/);
 console.log(`race_authority_v77_test: real deterministic physics career (${frames} input frames), checkpoint finish, server reward/EXP, migration preservation, fake coordinates/results/time, input replay and concurrent finish protection passed`);
}finally{Date.now=realNow;db.close();}
