import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleAuthRequest} from '../src/auth.mjs';
import {CASES} from '../src/case-catalog.mjs';

// Isolated in-memory D1-style adapter. All account operations use the real
// Worker handler and are serialized as D1 batches would be.
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
  db.exec(fs.readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
let tail=Promise.resolve();
const DB={
  prepare(sql){let args=[];return{
    bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return{results:db.prepare(sql).all(...args)};},
    async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}
  };},
  async batch(statements){let release;const previous=tail;tail=new Promise(resolve=>release=resolve);await previous;db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}
};
const env={DB},now=Date.now(),cost=CASES.basic.price,groups=[10,50,100],accounts=[];
const digest=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');
for(const group of groups){
  const batch=[],offset=accounts.length;
  for(let i=0;i<group;i++){
    const n=offset+i+1,id=`qa${String(n).padStart(4,'0')}`,token=`qa-cookie-${id}`;
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'fixture','fixture',now,now);
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(await digest(token),id,now,now+86400000,now);
    const initialCredits=15000+(n%7)*cost;
    db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,JSON.stringify({saveVersion:6,credits:initialCredits,caseInventory:{basic:0},ownedLiveries:['apexLime'],ownedEffects:['standard']}),1,now,now);
    batch.push({id,token,initialCredits,requestId:`parallel-case-${id}`});
  }
  accounts.push(...batch);
}
async function buy(account,{requestId=account.requestId,spoofIdentity=false}={}){
  const url=new URL('https://apex.test/api/economy/cases/buy'),body={requestId,caseId:'basic',quantity:1,...(spoofIdentity?{userId:accounts[1].id,credits:999999999}: {})};
  const response=await handleAuthRequest(new Request(url,{method:'POST',headers:{origin:url.origin,'content-type':'application/json',cookie:`va_session=${account.token}`},body:JSON.stringify(body)}),env,url);
  return{status:response.status,data:await response.json()};
}
try{
  assert.equal(accounts.length,160);
  assert.equal((await handleAuthRequest(new Request('https://apex.test/api/economy/cases/buy',{method:'POST',headers:{origin:'https://apex.test','content-type':'application/json'},body:JSON.stringify({requestId:'no-session-qa-0001',caseId:'basic',quantity:1})}),env,new URL('https://apex.test/api/economy/cases/buy'))).status,401);
  let offset=0;
  for(const size of groups){
    const cohort=accounts.slice(offset,offset+size);offset+=size;
    const results=await Promise.all(cohort.map(a=>buy(a,{spoofIdentity:a===accounts[0]})));
    assert.equal(results.filter(r=>r.status===200).length,size,`${size}-account parallel cohort succeeds`);
    for(let i=0;i<size;i++){
      assert.equal(results[i].data.result.cost,cost);
      assert.equal(results[i].data.save.credits,cohort[i].initialCredits-cost);
      assert.equal(results[i].data.save.caseInventory.basic,1);
    }
    const replays=await Promise.all(cohort.map(a=>buy(a)));
    assert(replays.every(r=>r.status===200&&r.data.replay),`${size}-account cohort replays without recharging`);
  }
  for(const size of groups){
    const id=`qasame${size}`,token=`qa-concurrency-${size}`,initialCredits=cost*(size+3);
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'fixture','fixture',now,now);
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(await digest(token),id,now,now+86400000,now);
    db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,JSON.stringify({saveVersion:6,credits:initialCredits,caseInventory:{basic:0},ownedLiveries:['apexLime'],ownedEffects:['standard']}),1,now,now);
    const account={id,token,initialCredits};
    const concurrent=await Promise.all(Array.from({length:size},(_,i)=>buy(account,{requestId:`same-account-${size}-${i}`})));
    assert(concurrent.every(r=>r.status===200),`${size} concurrent unique operations against one wallet succeed`);
    let save=JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json);
    assert.equal(save.credits,initialCredits-size*cost,`${size} same-wallet operations debit exactly once each`);
    assert.equal(save.caseInventory.basic,size,`${size} same-wallet operations preserve every item`);
    const duplicateKey=`same-account-${size}-duplicate`,first=await buy(account,{requestId:duplicateKey});assert.equal(first.status,200);
    const duplicateBurst=await Promise.all(Array.from({length:size},()=>buy(account,{requestId:duplicateKey})));
    assert(duplicateBurst.every(r=>r.status===200&&r.data.replay),`${size} same-key retries replay one committed operation`);
    save=JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json);
    assert.equal(save.credits,initialCredits-(size+1)*cost,`${size} same-key retries do not debit more than once`);
    assert.equal(save.caseInventory.basic,size+1,`${size} same-key retries do not duplicate inventory`);
  }
  const operations=db.prepare("SELECT COUNT(*) n FROM economy_operations WHERE operation_type='case_buy'").get().n;
  assert.equal(operations,323,'one durable operation per unique purchase');
  for(const account of accounts){
    const save=JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(account.id).save_json);
    assert.equal(save.credits,account.initialCredits-cost,`${account.id} exact wallet balance`);
    assert.equal(save.caseInventory.basic,1,`${account.id} exact inventory`);
  }
  const target=db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(accounts[1].id).save_json;
  assert.equal(JSON.parse(target).credits,accounts[1].initialCredits-cost,'spoofed userId and credits fields do not mutate the target account');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('v2_qa_parallel_economy_test: 10/50/100-account cohorts, 10/50/100 same-wallet operations, concurrent duplicate bursts, varied balances, identity spoof, 323 journal entries and SQLite invariants passed');
}finally{db.close();}
