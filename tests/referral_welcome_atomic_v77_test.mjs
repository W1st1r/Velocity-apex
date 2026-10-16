import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {processReferral,settlePendingReferral} from '../src/auth.mjs';
import {CARS} from '../src/car-catalog.mjs';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const n of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
let tail=Promise.resolve(),failOn='',failures=0;
const DB={prepare(query){let args=[];const runNow=()=>{if(failOn&&query.startsWith(failOn)){failOn='';failures++;throw Error('INJECTED_MARKET_FAILURE');}const r=db.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};};return{bind(...v){args=v;return this;},async first(){return db.prepare(query).get(...args)||null;},async all(){return{results:db.prepare(query).all(...args)};},runNow,async run(){return runNow();}};},async batch(statements){let release;const prior=tail;tail=new Promise(r=>release=r);await prior;db.exec('BEGIN');try{const out=statements.map(s=>s.runNow());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}};


const t=Date.now(),env={DB};
for(const id of ['inviter','first','second','third','legacy']){db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'x','x',t-30*86400000,t);db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(id,JSON.stringify({credits:1000,ownedLiveries:['apexLime'],legacy:{keep:true}}),t,t);}
const save=id=>JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json),inviter=db.prepare("SELECT * FROM users WHERE id='inviter'").get();
async function welcome(id,device){return processReferral(env,{invitedUserId:id,inviter,signals:{deviceHash:device,networkHash:''},t});}
try{
 failOn="UPDATE referrals SET status='rewarded'";await assert.rejects(welcome('first','device-first'),/INJECTED/);assert.equal(save('first').credits,1000);assert.equal(save('inviter').credits,1000);assert.equal(db.prepare("SELECT reason FROM referrals WHERE invited_user_id='first'").get().reason,'authority-v77');assert.equal(db.prepare('SELECT COUNT(*) n FROM economy_operations').get().n,0);
 // Change inviter tier after interrupted registration: retry must use its frozen intent.
 db.prepare('INSERT INTO referral_profiles(user_id,level,total_spent,updated_at) VALUES(?,10,0,?)').run('inviter',t);
 const recovered=await settlePendingReferral(env,'first');assert.equal(recovered.rewarded,true);assert.equal(recovered.inviterLevel,1);assert.equal(save('first').credits,1500);assert.equal(save('inviter').credits,2500);assert.equal((await settlePendingReferral(env,'first')).replay,true);assert.equal(save('inviter').credits,2500);
 const duplicate=await Promise.all([welcome('second','same-device'),welcome('third','same-device')]);assert.equal(duplicate.filter(r=>r.rewarded).length,1,JSON.stringify(duplicate));assert.equal(db.prepare("SELECT COUNT(*) n FROM referrals WHERE device_hash='same-device' AND status='rewarded'").get().n,1);
 const count=db.prepare("SELECT COUNT(*) n FROM economy_operations WHERE operation_type='referral:welcome'").get().n;assert.equal(count,2);const before=save('inviter').credits;
 db.prepare("INSERT INTO referrals(invited_user_id,inviter_user_id,status,reward_credits,reason,created_at) VALUES('legacy','inviter','processing',0,'',?)").run(t);assert.equal((await settlePendingReferral(env,'legacy')).reason,'LEGACY_RECONCILIATION_REQUIRED');assert.equal(save('inviter').credits,before);assert.equal(save('legacy').credits,1000);assert.equal(failures,1);for(const id of ['inviter','first','second','third','legacy'])assert.deepEqual(save(id).legacy,{keep:true});
 console.log('referral_welcome_atomic_v77_test: dual-account rollback, durable interrupted-registration recovery, frozen tier, receipt replay, competing device gate, legacy pending preservation passed');
}finally{db.close();}
