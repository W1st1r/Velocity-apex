import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleAuthRequest} from '../src/auth.mjs';
import {CASES} from '../src/case-catalog.mjs';
import {CARS} from '../src/car-catalog.mjs';
import {GARAGE_ECONOMY} from '../src/tuning-catalog.mjs';

const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let batchTail=Promise.resolve();
const DB={prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){let release;const previous=batchTail;batchTail=new Promise(resolve=>release=resolve);await previous;db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}};
const env={DB},t=Date.now(),realCrypto=globalThis.crypto,hash=Buffer.from(await realCrypto.subtle.digest('SHA-256',new TextEncoder().encode('case-cookie'))).toString('base64url');
db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('u1','tester','Tester','x','x',t,t);
db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').run(hash,'u1',t,t+86400000,t);
db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run('u1',JSON.stringify({saveVersion:6,credits:500000,caseInventory:{basic:0},ownedLiveries:['apexLime'],ownedEffects:['standard']}),1,t,t);
async function callPath(path,body){const url=new URL('https://apex.test/api/economy/'+path),req=new Request(url,{method:'POST',headers:{cookie:'va_session=case-cookie',origin:url.origin,'content-type':'application/json'},body:JSON.stringify(body)}),res=await handleAuthRequest(req,env,url);return{status:res.status,data:await res.json()};}
const call=(route,body)=>callPath('cases/'+route,body);
async function ownerCall(body,cookie='owner-cookie'){
 const url=new URL('https://apex.test/api/admin/self/operation'),res=await handleAuthRequest(new Request(url,{method:'POST',headers:{cookie:'va_session='+cookie,origin:url.origin,'content-type':'application/json'},body:JSON.stringify(body)}),env,url);return {status:res.status,data:await res.json()};
}
const ownerHash=Buffer.from(await realCrypto.subtle.digest('SHA-256',new TextEncoder().encode('owner-cookie'))).toString('base64url');
db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('owner1','w1st1r','Owner fixture','x','x',t,t);
db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').run(ownerHash,'owner1',t,t+86400000,t);
db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner1',JSON.stringify({saveVersion:6,credits:77,ownedLiveries:['apexLime'],ownedEffects:['standard'],caseInventory:{basic:1},careerUnlocked:7,customLegacy:'preserve'}),1,t,t);
const otherBefore=db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('u1').save_json;
const request={requestId:'owner-add-credits-0001',action:'add_credits',value:1000,userId:'u1'};
assert.equal((await ownerCall(request,'case-cookie')).status,403,'a regular account cannot use owner operations');
assert.equal((await ownerCall(request)).data.error,'ADMIN_LOCKED','owner privilege still requires the existing server unlock');
db.prepare('INSERT INTO admin_unlocks(session_token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(ownerHash,'owner1',t,t+60000);
const money=await Promise.all([ownerCall(request),ownerCall(request)]);money.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.data)));assert.equal(money[0].data.save.credits,1077);assert.equal(money[1].data.save.credits,1077);
assert.equal(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('u1').save_json,otherBefore,'client-supplied target cannot modify a different account');
const grant=await ownerCall({requestId:'owner-grant-car-0001',action:'grant',kind:'car',id:'apollo-evo'});assert.equal(grant.status,200);assert.ok(grant.data.save.ownedLiveries.includes('apollo-evo'));assert.equal(grant.data.save.careerUnlocked,7);assert.equal(grant.data.save.customLegacy,'preserve');
const equip=await ownerCall({requestId:'owner-equip-car-0001',action:'equip',kind:'car',id:'apollo-evo'});assert.equal(equip.data.save.selectedLivery,'apollo-evo');
const delta={requestId:'owner-case-delta-0001',action:'case_delta',id:'basic',delta:3};const cases=await Promise.all([ownerCall(delta),ownerCall(delta)]);cases.forEach(r=>assert.equal(r.data.save.caseInventory.basic,4));
assert.equal((await ownerCall({requestId:'owner-negative-0001',action:'set_credits',value:-1})).status,400);
assert.equal((await ownerCall({requestId:'owner-invalid-car-01',action:'grant',kind:'car',id:'invented'})).status,400);
assert.equal((await ownerCall({requestId:'owner-protected-001',action:'revoke',kind:'car',id:'apexLime'})).data.error,'RESOURCE_PROTECTED');
const revoked=await ownerCall({requestId:'owner-revoke-car-001',action:'revoke',kind:'car',id:'apollo-evo'});assert.equal(revoked.data.save.selectedLivery,'apexLime');assert.ok(!revoked.data.save.ownedLiveries.includes('apollo-evo'));
console.log('admin_self_economy_v77_test: real SQLite owner gate/unlock, self-only targeting, server mutations, replay/concurrent delta, negative values and legacy field preservation passed');
db.close();
