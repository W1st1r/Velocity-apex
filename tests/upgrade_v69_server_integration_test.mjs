import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleUpgradeRequest} from '../src/upgrade.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB};
const originalCryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
const realCrypto=globalThis.crypto;
const t=Date.now(),users=[['a','fresh'],['b','veteran']];
const sha256=async v=>Buffer.from(await realCrypto.subtle.digest('SHA-256',new TextEncoder().encode(v))).toString('base64url');
for(const [id,username] of users){
 db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,username,username,'x','x',t,t);
 db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').run(await sha256('cookie-'+id),id,t,t+86400000,t);
 db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,JSON.stringify({saveVersion:6,credits:3000,ownedLiveries:['apexLime'],ownedEffects:['standard'],selectedLivery:'apexLime',selectedEffect:'standard'}),1,t,t);
}
// A veteran is not penalized; history and progression are irrelevant in V69.
for(let i=0;i<25;i++)db.prepare("INSERT INTO upgrade_attempts(id,user_id,status,payload_json,created_at) VALUES (?,?,?,?,?)").run(`old-${i}`,'b','complete','{}',t-i*1000);
async function call(user,endpoint,payload){
 const url=new URL('https://apex.test/api/upgrade/'+endpoint);
 const req=new Request(url,{method:payload===undefined?'GET':'POST',headers:{cookie:'va_session=cookie-'+user,origin:url.origin,'content-type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 const response=await handleUpgradeRequest(req,env,url);
 return {status:response.status,...await response.json()};
}
const bet={stake:{cars:[],effects:[],credits:1000},target:{kind:'effect',id:'blueFlame'},protection:true};
const fresh=await call('a','quote',bet),veteran=await call('b','quote',bet);
assert.equal(fresh.status,200,JSON.stringify(fresh));
assert.equal(veteran.status,200,JSON.stringify(veteran));
assert.equal(fresh.chanceBps,veteran.chanceBps);
assert.equal(fresh.refundOnLoss,250);
assert.equal(fresh.config.accountIndependent,true);
assert.equal(fresh.protection,true);
const unguarded=await call('a','quote',{...bet,protection:false});
assert.ok(unguarded.chanceBps>fresh.chanceBps);
assert.equal(unguarded.refundOnLoss,0);
const save=id=>JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json);
// Rig RNG on this isolated test only, testing both branches without relying on luck.
try{
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:realCrypto.subtle,randomUUID:()=>realCrypto.randomUUID(),getRandomValues(arr){arr[0]=9900;return arr;}}});
 const attemptId='11111111-1111-4111-8111-111111111111';
 const first=await call('a','attempt',{...bet,upgradeId:attemptId});
 assert.equal(first.status,200,JSON.stringify(first));
 assert.equal(first.attempt.success,false);
 assert.equal(first.attempt.protection,true);
 assert.equal(first.attempt.refundCredits,250);
 assert.equal(save('a').credits,2250);
 const repeated=await call('a','attempt',{...bet,upgradeId:attemptId});
 assert.equal(repeated.attempt.refundCredits,250);
 assert.equal(save('a').credits,2250,'duplicate request must never charge or refund twice');
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM upgrade_attempts WHERE user_id='a' AND status='complete'").get().n,1);
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:realCrypto.subtle,randomUUID:()=>realCrypto.randomUUID(),getRandomValues(arr){arr[0]=0;return arr;}}});
 const won=await call('a','attempt',{...bet,upgradeId:'22222222-2222-4222-8222-222222222222'});
 assert.equal(won.status,200,JSON.stringify(won));
 assert.equal(won.attempt.success,true);
 assert.equal(won.attempt.refundCredits,0);
 assert.ok(save('a').ownedEffects.includes('blueFlame'));
 assert.equal(save('a').credits,1250);
 const owned=await call('a','quote',bet);
 assert.equal(owned.status,409);assert.equal(owned.error,'TARGET_ALREADY_OWNED');
 const history=await call('a','history');
 assert.equal(history.items[0].protection,true);
 assert.equal(history.items[1].refundCredits,250);
}finally{Object.defineProperty(globalThis,'crypto',originalCryptoDescriptor);}
console.log('upgrade_v69_server_integration_test: SQLite real session, equal odds per account, quote, refund, double-request protection and success payout OK');
