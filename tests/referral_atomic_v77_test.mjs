import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAuthRequest} from '../src/auth.mjs';
import {CARS} from '../src/car-catalog.mjs';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const n of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
let tail=Promise.resolve(),failOn='',failures=0;
const DB={prepare(query){let args=[];const runNow=()=>{if(failOn&&query.startsWith(failOn)){failOn='';failures++;throw Error('INJECTED_MARKET_FAILURE');}const r=db.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};};return{bind(...v){args=v;return this;},async first(){return db.prepare(query).get(...args)||null;},async all(){return{results:db.prepare(query).all(...args)};},runNow,async run(){return runNow();}};},async batch(statements){let release;const prior=tail;tail=new Promise(r=>release=r);await prior;db.exec('BEGIN');try{const out=statements.map(s=>s.runNow());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}};

const t=Date.now(),env={DB},token='referral-isolated-token';
for(let i=0;i<=25;i++){const id='ref-'+i;db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'x','x',t,t);db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(id,JSON.stringify({credits:100000,ownedLiveries:['apexLime'],legacy:{keep:true}}),t,t);if(i)db.prepare("INSERT INTO referrals(invited_user_id,inviter_user_id,status,reward_credits,created_at) VALUES(?,?,'rewarded',1500,?)").run(id,'ref-0',t);}
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('base64url');db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(hash,'ref-0',t,t+86400000,t);
const save=()=>JSON.parse(db.prepare("SELECT save_json FROM player_saves WHERE user_id='ref-0'").get().save_json);
async function call(body){const url=new URL('https://apex.test/api/referrals/upgrade'),r=await handleAuthRequest(new Request(url,{method:'POST',headers:{cookie:'va_session='+token,origin:url.origin,'content-type':'application/json'},body:JSON.stringify(body)}),env,url);return {status:r.status,data:await r.json()};}
try{
 assert.equal((await call({level:2})).data.error,'CLIENT_UPDATE_REQUIRED');assert.equal((await call({requestId:crypto.randomUUID(),level:10})).data.error,'REFERRAL_LEVEL_CONFLICT');
 failOn='INSERT INTO referral_level_purchases';const failed=await call({requestId:crypto.randomUUID(),level:2});assert.equal(failed.status,500);assert.equal(save().credits,100000);assert.equal(db.prepare("SELECT level FROM referral_profiles WHERE user_id='ref-0'").get().level,1);
 const key=crypto.randomUUID(),body={requestId:key,level:2,price:0};const duplicate=await Promise.all([call(body),call(body)]);assert(duplicate.every(x=>x.status===200),JSON.stringify(duplicate));assert.equal(save().credits,90000);assert.equal(db.prepare('SELECT COUNT(*) n FROM referral_level_purchases').get().n,1);
 const competing=await Promise.all([call({requestId:crypto.randomUUID(),level:3}),call({requestId:crypto.randomUUID(),level:3})]);assert.equal(competing.filter(x=>x.status===200).length,1);assert.equal(save().credits,65000);assert.equal(db.prepare("SELECT total_spent FROM referral_profiles WHERE user_id='ref-0'").get().total_spent,35000);
 const replay=await call(body);assert.equal(replay.status,200);assert.equal(replay.data.replay,true);assert.equal(replay.data.save.credits,65000);assert.equal((await call({requestId:key,level:4})).data.error,'IDEMPOTENCY_KEY_REUSED');assert.deepEqual(save().legacy,{keep:true});assert.equal(failures,1);
 console.log('referral_atomic_v77_test: purchase/profile/history rollback, concurrent duplicate and competing level, server cost, old receipt replay and legacy preservation passed');
}finally{db.close();}
