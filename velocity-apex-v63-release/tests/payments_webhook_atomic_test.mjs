import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handlePaymentRequest,canonicalNotification} from '../src/payments.mjs';

const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,YOOMONEY_RECEIVER:'41000000000',YOOMONEY_NOTIFICATION_SECRET:'secret123'};
const t=Date.now();
db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('u1','tester','Tester','x','x',t,t);
db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run('u1',JSON.stringify({saveVersion:6,credits:200,ownedLiveries:['apexLime'],ownedEffects:['standard']}),1,t,t);
db.prepare("INSERT INTO payment_orders(id,user_id,username,package_id,rub_amount,credits,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)").run('APEX-1234567890ABCDEF','u1','tester','cr_5000',99,5000,t,t);

async function sign(params){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.YOOMONEY_NOTIFICATION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonicalNotification(params))));return [...sig].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function notify(){const p=new URLSearchParams({notification_type:'card-incoming',operation_id:'op-001',amount:'96.03',withdraw_amount:'99.00',currency:'643',datetime:'2026-09-17T19:00:00Z',sender:'',codepro:'false',label:'APEX-1234567890ABCDEF',unaccepted:'false'});p.set('sign',await sign(p));return handlePaymentRequest(new Request('https://apex.test/api/payments/yoomoney',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:p.toString()}),env,new URL('https://apex.test/api/payments/yoomoney'));}
let r=await notify();assert.equal(r.status,200);assert.equal(await r.text(),'OK');
let save=JSON.parse(db.prepare("SELECT save_json FROM player_saves WHERE user_id='u1'").get().save_json);assert.equal(save.credits,5200,'first valid webhook credits exactly once');
let order=db.prepare("SELECT status,operation_id FROM payment_orders WHERE id='APEX-1234567890ABCDEF'").get();assert.equal(order.status,'paid');assert.equal(order.operation_id,'op-001');
assert.equal(db.prepare("SELECT COUNT(*) n FROM payment_receipts WHERE credited=1").get().n,1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM game_logs WHERE category='purchases' AND event_type='yoomoney_purchase'").get().n,1);
r=await notify();assert.equal(r.status,200);save=JSON.parse(db.prepare("SELECT save_json FROM player_saves WHERE user_id='u1'").get().save_json);assert.equal(save.credits,5200,'duplicate webhook must not credit twice');
assert.equal(db.prepare("SELECT COUNT(*) n FROM game_logs WHERE category='purchases' AND event_type='yoomoney_purchase'").get().n,1,'duplicate must not duplicate purchase log');
console.log('payments_webhook_atomic_test: OK — HMAC, exact amount, atomic credit, duplicate protection, purchase log');
