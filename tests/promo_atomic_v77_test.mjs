import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAuthRequest} from '../src/auth.mjs';
import {CARS} from '../src/car-catalog.mjs';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const n of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
let tail=Promise.resolve(),failOn='',failures=0;
const DB={prepare(query){let args=[];const runNow=()=>{if(failOn&&query.startsWith(failOn)){failOn='';failures++;throw Error('INJECTED_MARKET_FAILURE');}const r=db.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};};return{bind(...v){args=v;return this;},async first(){return db.prepare(query).get(...args)||null;},async all(){return{results:db.prepare(query).all(...args)};},runNow,async run(){return runNow();}};},async batch(statements){let release;const prior=tail;tail=new Promise(r=>release=r);await prior;db.exec('BEGIN');try{const out=statements.map(s=>s.runNow());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}};


const t=Date.now(),env={DB},tokens={};
for(const id of ['alice','bob']){db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'x','x',t,t);db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(id,JSON.stringify({credits:1000,ownedLiveries:['apexLime'],legacy:{keep:true}}),t,t);tokens[id]='isolated-promo-'+id;const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tokens[id]))).toString('base64url');db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(hash,id,t,t+86400000,t);}
const promo=crypto.randomUUID();db.prepare('INSERT INTO promo_codes(id,code,title,reward_json,max_uses,starts_at,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(promo,'ATOMIC77','fixture',JSON.stringify({credits:250,cars:[],effects:[],cases:{basic:1}}),1,t-1000,t,t,'alice');
const save=id=>JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json);
async function call(id){const url=new URL('https://apex.test/api/promocodes/redeem'),r=await handleAuthRequest(new Request(url,{method:'POST',headers:{cookie:'va_session='+tokens[id],origin:url.origin,'content-type':'application/json'},body:JSON.stringify({code:'ATOMIC77',reward:{credits:999999}})}),env,url);return{status:r.status,data:await r.json()};}
try{
 failOn='INSERT INTO promo_redemptions';assert.equal((await call('alice')).status,500);assert.equal(save('alice').credits,1000);assert.equal(db.prepare('SELECT uses_count FROM promo_codes').get().uses_count,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM economy_operations').get().n,0);
 const results=await Promise.all([call('alice'),call('bob')]);assert.equal(results.filter(x=>x.status===200).length,1,JSON.stringify(results));const winner=results[0].status===200?'alice':'bob',loser=winner==='alice'?'bob':'alice';assert.equal(save(winner).credits,1250);assert.equal(save(loser).credits,1000);assert.equal(save(winner).caseInventory.basic,1);assert.equal(db.prepare('SELECT uses_count FROM promo_codes').get().uses_count,1);
 db.prepare('UPDATE promo_codes SET enabled=0,reward_json=? WHERE id=?').run(JSON.stringify({credits:9999}),promo);
 const replay=await call(winner);assert.equal(replay.status,200);assert.equal(replay.data.replay,true);assert.equal(replay.data.reward.credits,250);assert.equal(save(winner).credits,1250);assert.equal((await call(loser)).data.error,'PROMO_DISABLED');assert.deepEqual(save(winner).legacy,{keep:true});assert.equal(failures,1);
 console.log('promo_atomic_v77_test: reward/use/redemption atomic rollback, competing last use, server reward, replay after disable and legacy preservation passed');
}finally{db.close();}
