import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleEmailRecoveryRequest,startEmailVerificationForUser} from '../src/account-recovery.mjs';
import {passwordHash,decodeB64url,randomBytes,validPassword} from '../src/auth.mjs';

class TestD1{
  constructor(db){this.db=db;}
  prepare(sql){const db=this.db;let args=[];return {bind(...values){args=values;return this;},first(){return db.prepare(sql).get(...args)||null;},all(){return {results:db.prepare(sql).all(...args)};},run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes||0)}};},_run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes||0)}};}};}
  batch(items){this.db.exec('BEGIN IMMEDIATE');try{const out=items.map(x=>x._run());this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0022_account_email_recovery.sql',import.meta.url),'utf8'));
db.exec(`CREATE TABLE account_bans(id TEXT PRIMARY KEY,user_id TEXT,reason TEXT,created_at INTEGER,expires_at INTEGER,revoked_at INTEGER);
INSERT INTO users(id,username,display_name,password_hash,password_salt,password_iterations,created_at,updated_at,last_login_at) VALUES('u1','driver_one','Driver One','','',100000,1,1,1);
INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES('u1','{"credits":98765,"ownedLiveries":["apexLime","car-x"],"career":{"level":7}}',3,1,1);
INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES('session-hash','u1',1,9999999999999,1);`);
const DB=new TestD1(db),sent=[];
globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');assert.ok(init.headers.authorization.startsWith('Bearer '));sent.push(JSON.parse(init.body));return new Response('{}',{status:200});};
const env={DB,RESEND_API_KEY:'re_test_secret',EMAIL_FROM:'Velocity Apex <noreply@example.com>',PUBLIC_APP_ORIGIN:'https://game.test'};
const helpers={
  randomBytes,n:Date.now,validPassword,passwordHash,decodeB64url,
  sameOrigin:req=>req.headers.get('origin')===new URL(req.url).origin,
  readBody:req=>req.json(),
  currentSession:async(_env,req)=>req.headers.get('cookie')?.includes('va_session=ok')?{hash:'session-hash',user:{id:'u1',username:'driver_one',displayName:'Driver One'}}:null,
  banResponse:async(_env,user)=>{const row=db.prepare('SELECT 1 FROM account_bans WHERE user_id=? AND (revoked_at IS NULL OR revoked_at=0) AND expires_at>?').get(user.id,Date.now());return row?new Response(JSON.stringify({error:'ACCOUNT_BANNED'}),{status:423}):null;},
  canRecover:async(_env,userId)=>!db.prepare('SELECT 1 FROM account_bans WHERE user_id=? AND expires_at>?').get(userId,Date.now())
};
const req=(path,body,options={})=>new Request('https://game.test'+path,{method:options.method||'POST',headers:{origin:'https://game.test','content-type':'application/json','cf-connecting-ip':options.ip||'192.0.2.10',...(options.cookie?{cookie:options.cookie}:{})},body:options.method==='GET'?undefined:JSON.stringify(body||{})});
const route=(path,body,options)=>handleEmailRecoveryRequest(req(path,body,options),env,new URL('https://game.test'+path),helpers);
const tokenFromMail=mail=>{const match=mail.text.match(/#([A-Za-z0-9_-]{43})/);assert.ok(match,'message includes opaque token only in URL fragment');return match[1];};

const oldSalt=randomBytes(16);db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(await passwordHash('old-password',oldSalt),Buffer.from(oldSalt).toString('base64url'),'u1');
assert.equal(await startEmailVerificationForUser(env,{randomBytes},{userId:'u1',email:'Driver@One.Example',username:'driver_one',request:req('/api/auth/email/start',{}, {cookie:'va_session=ok'})}),true);
assert.equal(sent.length,1);
assert.match(sent[0].subject,/Подтвердите email/);
const verifyToken=tokenFromMail(sent[0]);
let response=await route('/api/auth/email/verify',{token:verifyToken});assert.equal(response.status,200);
assert.equal(db.prepare('SELECT email FROM account_emails WHERE user_id=?').get('u1').email,'driver@one.example');
response=await route('/api/auth/email/verify',{token:verifyToken});assert.equal(response.status,400,'verification token is single-use');

const saveBefore=db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('u1').save_json;
const generic=await route('/api/auth/password/recovery',{identifier:'driver_one'});assert.equal(generic.status,200);
assert.equal(sent.length,2);const resetToken=tokenFromMail(sent[1]);
const unknown=await route('/api/auth/password/recovery',{identifier:'nobody@example.net'});assert.equal(unknown.status,200);assert.equal(sent.length,2,'unknown account does not receive email');
response=await route('/api/auth/password/reset',{token:resetToken,password:'new-password-123'});assert.equal(response.status,200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get('u1').n,0,'password reset revokes every session');
assert.equal(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('u1').save_json,saveBefore,'game progress is unchanged');
const row=db.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').get('u1');
assert.notEqual(await passwordHash('old-password',decodeB64url(row.password_salt),row.password_iterations),row.password_hash,'old password no longer works');
assert.equal(await passwordHash('new-password-123',decodeB64url(row.password_salt),row.password_iterations),row.password_hash);
response=await route('/api/auth/password/reset',{token:resetToken,password:'another-password'});assert.equal(response.status,400,'reset token is single-use');

const expired=await (async()=>{const raw='A'.repeat(43),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))).toString('base64url');db.prepare("INSERT INTO account_recovery_tokens(token_hash,user_id,token_kind,created_at,expires_at) VALUES(?,?,'password_reset',?,?)").run(hash,'u1',1,2);return route('/api/auth/password/reset',{token:raw,password:'another-password'});})();assert.equal(expired.status,400,'expired token is rejected');
const noMailEnv={DB};response=await handleEmailRecoveryRequest(req('/api/auth/password/recovery',{identifier:'driver_one'}),noMailEnv,new URL('https://game.test/api/auth/password/recovery'),helpers);assert.equal((await response.json()).deliveryUnavailable,true,'missing mail service is reported honestly');
assert.equal(sent.length,3);
db.prepare("INSERT INTO account_bans(id,user_id,reason,created_at,expires_at,revoked_at) VALUES('b1','u1','test',1,9999999999999,NULL)").run();
response=await route('/api/auth/password/recovery',{identifier:'driver_one'});assert.equal(response.status,200);assert.equal(sent.length,3,'banned account receives no reset link');
assert.ok(db.prepare("SELECT COUNT(*) n FROM account_security_events").get().n>=3);

// Old accounts without a verified address never receive reset mail.
db.prepare("INSERT INTO users(id,username,display_name,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES('u2','driver_two','Driver Two','','',100000,1,1)").run();
const sentBeforeLegacy=sent.length;response=await route('/api/auth/password/recovery',{identifier:'driver_two'});assert.equal(response.status,200);assert.equal(sent.length,sentBeforeLegacy,'unverified legacy account does not receive a reset link');
// A second account cannot claim an email already verified on another account.
assert.equal(await startEmailVerificationForUser(env,{randomBytes},{userId:'u2',email:'driver@one.example',username:'driver_two'}),true);
const duplicateToken=tokenFromMail(sent.at(-1));response=await route('/api/auth/email/verify',{token:duplicateToken});assert.equal(response.status,409,'confirmed email remains unique');
assert.equal(db.prepare('SELECT verified_at FROM account_emails WHERE user_id=?').get('u2'),undefined);
// Per-IP request throttling stays neutral and sends no messages for unknown accounts.
const countBeforeThrottle=sent.length;let throttledResponse;
for(let i=0;i<16;i++)throttledResponse=await route('/api/auth/password/recovery',{identifier:'unknown-'+i+'@example.net'},{ip:'192.0.2.99'});
assert.equal(throttledResponse.status,200);assert.equal(sent.length,countBeforeThrottle);

console.log('account_recovery_v77_test: verified email, neutral recovery, token expiry/reuse, session invalidation, ban gate, and save preservation passed');
db.close();

