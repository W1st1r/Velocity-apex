import {applyAccountTransaction} from './account-transactions.mjs';
import {validatePreferences} from '../public/js/account-preferences-v77.mjs';
import {backupAccountState} from './account-authority-backup.mjs';
import {adminSelfMutation} from './admin-self-economy.mjs';
import {handleRaceAuthority} from './race-authority.mjs';
import {maintenanceGate,settings} from './owner.mjs';
import {writeGameLog,classifyAuditAction,detectSavePurchases} from './logs.mjs';
import {CASES as SERVER_CASES} from './case-catalog.mjs';
import {openCaseBatch} from './economy.mjs';
import {CARS as SERVER_CARS} from './car-catalog.mjs';
import {UPGRADE_EFFECT_VALUES as SERVER_EFFECTS} from './upgrade-config.mjs';
import {GARAGE_ECONOMY} from './tuning-catalog.mjs';
const SESSION_COOKIE='va_session';
const SESSION_TTL_MS=30*24*60*60*1000;
const PASSWORD_ITERATIONS=100000;
const RECOVERY_TOKEN_TTL_MS=20*60*1000;
const RECOVERY_RATE_WINDOW_MS=60*60*1000;
const SAVE_LIMIT_BYTES=64*1024;
const ADMIN_USERNAME='w1st1r';
const ADMIN_PASSWORD_SHA256='dxEnsDF2QSbEDOepP2HFM_okaUwBB-fBg8fC90XrmIA';
const ADMIN_UNLOCK_TTL_MS=30*60*1000;
const ADMIN_MAX_BAN_MS=365*24*60*60*1000;
const ADMIN_MAX_CREDITS=999999999;
const REFERRAL_REWARD_CREDITS=1500;
const REFERRAL_LEVELS=Object.freeze([
  Object.freeze({level:1,requiredInvites:0,cost:0,inviterReward:1500,inviteeReward:Object.freeze({credits:500,cases:Object.freeze({})})}),
  Object.freeze({level:2,requiredInvites:10,cost:10000,inviterReward:1800,inviteeReward:Object.freeze({credits:750,cases:Object.freeze({})})}),
  Object.freeze({level:3,requiredInvites:25,cost:25000,inviterReward:2200,inviteeReward:Object.freeze({credits:1000,cases:Object.freeze({effects:1})})}),
  Object.freeze({level:4,requiredInvites:45,cost:45000,inviterReward:2700,inviteeReward:Object.freeze({credits:1250,cases:Object.freeze({effects:1})})}),
  Object.freeze({level:5,requiredInvites:70,cost:75000,inviterReward:3300,inviteeReward:Object.freeze({credits:1500,cases:Object.freeze({basic:1})})}),
  Object.freeze({level:6,requiredInvites:100,cost:120000,inviterReward:4000,inviteeReward:Object.freeze({credits:2000,cases:Object.freeze({basic:1})})}),
  Object.freeze({level:7,requiredInvites:140,cost:180000,inviterReward:4800,inviteeReward:Object.freeze({credits:2500,cases:Object.freeze({basic:1,effects:1})})}),
  Object.freeze({level:8,requiredInvites:190,cost:270000,inviterReward:5700,inviteeReward:Object.freeze({credits:3000,cases:Object.freeze({basic:2})})}),
  Object.freeze({level:9,requiredInvites:250,cost:400000,inviterReward:6700,inviteeReward:Object.freeze({credits:4000,cases:Object.freeze({basic:1,sport:1})})}),
  Object.freeze({level:10,requiredInvites:325,cost:600000,inviterReward:8000,inviteeReward:Object.freeze({credits:5000,cases:Object.freeze({sport:1})})})
]);
const REFERRAL_MIN_INVITER_AGE_MS=24*60*60*1000;
const REFERRAL_DAILY_LIMIT=5;
const REFERRAL_MONTHLY_LIMIT=20;
const REFERRAL_NETWORK_7D_LIMIT=3;
const PROMO_MAX_REWARD_CREDITS=10000000;
const PROMO_MAX_USES=1000000;
const PROMO_MAX_DURATION_MS=365*24*60*60*1000;
const enc=new TextEncoder();
let adminSchemaPromise=null;
let socialSchemaPromise=null;
let rewardSchemaPromise=null;

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const now=()=>Date.now();
const b64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const randomBytes=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return a;};
const sha256=async value=>b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value)));
const normalizeUsername=v=>String(v||'').trim().toLowerCase();
const validUsername=v=>/^[a-z0-9_]{3,24}$/.test(v);
const normalizeEmail=v=>String(v||'').trim().toLowerCase();
const validEmail=v=>typeof v==='string'&&v.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v);
const validRecoveryPassword=v=>typeof v==='string'&&v.length>=10&&v.length<=128&&/\p{L}/u.test(v)&&/\d/.test(v);
const normalizeDisplayName=v=>String(v||'').trim().replace(/\s+/g,' ');
const validDisplayName=v=>v.length>=2&&v.length<=24&&/^[\p{L}\p{N}_\- .]+$/u.test(v)&&!/[<>"'`\\/]/.test(v);
const validPassword=v=>typeof v==='string'&&v.length>=8&&v.length<=128;
const isAdminUsername=v=>normalizeUsername(v)===ADMIN_USERNAME;
const adminUser=user=>({...user,isAdmin:isAdminUsername(user?.username)});

function cookieValue(request,name){
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());}
  return '';
}
function sessionCookie(request,value,maxAge=Math.floor(SESSION_TTL_MS/1000)){
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}
function sameOrigin(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
async function readBody(request){
  const limit=SAVE_LIMIT_BYTES+8192,len=Number(request.headers.get('content-length')||0);if(len>limit)throw new Error('REQUEST_TOO_LARGE');
  if(!request.body)return JSON.parse('');
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('REQUEST_TOO_LARGE');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));
}
async function passwordHash(password,salt,iterations=PASSWORD_ITERATIONS){
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
  return b64url(new Uint8Array(bits));
}
function decodeB64url(input){
  const s=String(input||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=s+'='.repeat((4-s.length%4)%4),raw=atob(padded),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
function safeSave(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  let text;try{text=JSON.stringify(raw);}catch{return null;}
  if(enc.encode(text).byteLength>SAVE_LIMIT_BYTES)return null;
  return text;
}
function defaultSave(){return {saveVersion:6,credits:200,ownedLiveries:['apexLime'],ownedEffects:['standard'],caseInventory:{},selectedLivery:'apexLime',selectedEffect:'standard'};}
function safeResourceId(v){const s=String(v||'');return /^[a-zA-Z0-9_-]{1,64}$/.test(s)?s:'';}
function normalizeReason(v){return String(v||'').trim().replace(/\s+/g,' ').slice(0,240);}

async function ensureAdminSchema(env){
  if(adminSchemaPromise)return adminSchemaPromise;
  adminSchemaPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS account_bans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        revoked_at INTEGER,
        revoked_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_account_bans_user_active ON account_bans(user_id,revoked_at,expires_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_unlocks (
        session_token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_unlocks_expires ON admin_unlocks(expires_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id TEXT NOT NULL,
        target_user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at INTEGER NOT NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at)')
    ]);
  })().catch(e=>{adminSchemaPromise=null;throw e;});
  return adminSchemaPromise;
}
async function audit(env,adminId,targetId,action,details={}){
  let text='{}';try{text=JSON.stringify(details).slice(0,2000);}catch{}
  const createdAt=now();
  await env.DB.prepare('INSERT INTO admin_audit (admin_user_id,target_user_id,action,details,created_at) VALUES (?,?,?,?,?)').bind(adminId,targetId||null,action,text,createdAt).run();
  try{
    const amount=Number.isFinite(Number(details?.delta))?Number(details.delta):Number.isFinite(Number(details?.paidAmount))?Number(details.paidAmount):null;
    await writeGameLog(env,{category:classifyAuditAction(action),eventType:action,actorUserId:adminId,targetUserId:targetId||null,source:'ADMIN_AUDIT',subject:String(action||'system').replace(/_/g,' '),reason:details?.reason||details?.comment||'',amount,currency:amount===null?'':'CR',relatedId:details?.ticketId||details?.reportId||details?.id||'',metadata:details,createdAt});
  }catch(e){console.error('game log audit',e);}
}
async function createSession(env,request,userId){
  const raw=b64url(randomBytes(32)),hash=await sha256(raw),t=now(),expires=t+SESSION_TTL_MS;
  await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').bind(hash,userId,t,expires,t).run();
  return {raw,expires};
}
async function currentSession(env,request){
  const raw=cookieValue(request,SESSION_COOKIE);if(!raw)return null;
  const hash=await sha256(raw),t=now();
  const row=await env.DB.prepare(`SELECT s.token_hash,s.user_id,s.expires_at,s.last_seen_at,u.username,u.display_name,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1`).bind(hash).first();
  if(!row)return null;
  if(Number(row.expires_at)<=t){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return null;}
  if(t-Number(row.last_seen_at||0)>6*60*60*1000)await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').bind(t,hash).run();
  return {hash,user:adminUser({id:row.user_id,username:row.username,displayName:row.display_name,createdAt:Number(row.created_at)||0})};
}
async function activeBan(env,userId,t=now()){
  const row=await env.DB.prepare(`SELECT id,reason,created_at,expires_at FROM account_bans
    WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY expires_at DESC,created_at DESC LIMIT 1`).bind(userId,t).first();
  if(!row)return null;
  return {id:row.id,reason:row.reason,createdAt:Number(row.created_at)||0,expiresAt:Number(row.expires_at)||0,remainingMs:Math.max(0,Number(row.expires_at)-t)};
}
async function banResponse(env,user,status=423){const ban=await activeBan(env,user.id);return ban?json({error:'ACCOUNT_BANNED',user:adminUser(user),ban},status):null;}
async function saveRow(env,userId){
  await backupAccountState(env,userId);
  const row=await env.DB.prepare('SELECT save_json,revision,updated_at FROM player_saves WHERE user_id=? LIMIT 1').bind(userId).first();
  if(!row)return {save:null,revision:0,updatedAt:0};
  let save=null;try{save=JSON.parse(row.save_json);}catch{}
  return {save,revision:Number(row.revision)||0,updatedAt:Number(row.updated_at)||0};
}
async function writeSave(env,userId,raw,expectedRevision=null){
  const text=safeSave(raw);if(!text)return {ok:false,error:'INVALID_SAVE'};
  const t=now(),current=await saveRow(env,userId),expected=Number.isInteger(expectedRevision)?expectedRevision:null;
  if(expected!==null&&expected!==current.revision)return {ok:false,error:'SAVE_CONFLICT',save:current.save,revision:current.revision,updatedAt:current.updatedAt};
  if(current.revision>0){
    const result=await env.DB.prepare('UPDATE player_saves SET save_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(text,t,userId,current.revision).run();
    if(Number(result?.meta?.changes||0)!==1){const latest=await saveRow(env,userId);return {ok:false,error:'SAVE_CONFLICT',save:latest.save,revision:latest.revision,updatedAt:latest.updatedAt};}
  }else{
    try{await env.DB.prepare('INSERT INTO player_saves (user_id,save_json,revision,created_at,updated_at) VALUES (?,?,1,?,?)').bind(userId,text,t,t).run();}
    catch(e){const latest=await saveRow(env,userId);if(latest.revision>0)return {ok:false,error:'SAVE_CONFLICT',save:latest.save,revision:latest.revision,updatedAt:latest.updatedAt};throw e;}
  }
  const row=await saveRow(env,userId);return {ok:true,revision:row.revision||1,updatedAt:row.updatedAt||t};
}
async function requireAdmin(env,request,{unlocked=true}={}){
  const session=await currentSession(env,request);if(!session)return {error:json({error:'AUTH_REQUIRED'},401)};
  if(!session.user.isAdmin)return {error:json({error:'ADMIN_REQUIRED'},403)};
  const ban=await activeBan(env,session.user.id);if(ban)return {error:json({error:'ACCOUNT_BANNED',ban},423)};
  if(unlocked){
    const row=await env.DB.prepare('SELECT expires_at FROM admin_unlocks WHERE session_token_hash=? AND user_id=? LIMIT 1').bind(session.hash,session.user.id).first();
    if(!row||Number(row.expires_at)<=now())return {error:json({error:'ADMIN_LOCKED'},403)};
    return {session,unlockExpiresAt:Number(row.expires_at)||0};
  }
  return {session};
}
async function targetUser(env,id){
  return env.DB.prepare('SELECT id,username,display_name,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(id).first();
}
async function accountDetail(env,id){
  const user=await targetUser(env,id);if(!user)return null;
  const row=await saveRow(env,id),save=row.save&&typeof row.save==='object'?row.save:defaultSave(),ban=await activeBan(env,id);
  const cases=save.caseInventory&&typeof save.caseInventory==='object'&&!Array.isArray(save.caseInventory)?save.caseInventory:{};
  return {user:adminUser({id:user.id,username:user.username,displayName:user.display_name,createdAt:Number(user.created_at)||0,lastLoginAt:Number(user.last_login_at)||0}),save:{credits:Math.max(0,Math.floor(Number(save.credits)||0)),ownedLiveries:Array.isArray(save.ownedLiveries)?save.ownedLiveries:[],ownedEffects:Array.isArray(save.ownedEffects)?save.ownedEffects:[],caseInventory:cases,selectedLivery:String(save.selectedLivery||'apexLime'),selectedEffect:String(save.selectedEffect||'standard')},revision:row.revision,updatedAt:row.updatedAt,ban};
}
async function mutateTargetSave(env,id,mutator){
  const exists=await targetUser(env,id);if(!exists)return {error:'USER_NOT_FOUND'};
  for(let attempt=0;attempt<4;attempt++){
    const row=await saveRow(env,id),save=row.save&&typeof row.save==='object'&&!Array.isArray(row.save)?structuredClone(row.save):defaultSave();
    const result=mutator(save);if(result?.error)return result;
    const written=await writeSave(env,id,save,row.revision);
    if(written.ok)return {ok:true,result:result||{},revision:written.revision,updatedAt:written.updatedAt,detail:await accountDetail(env,id)};
    if(written.error!=='SAVE_CONFLICT')return {error:written.error};
  }
  return {error:'SAVE_CONFLICT'};
}

async function ensureEconomySchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS economy_operations (
    user_id TEXT NOT NULL, request_id TEXT NOT NULL, operation_type TEXT NOT NULL,
    response_json TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,request_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}
async function applyEconomyOperation(env,userId,requestId,type,mutator,options={}){
  const existing=await env.DB.prepare('SELECT operation_type,response_json FROM economy_operations WHERE user_id=? AND request_id=?').bind(userId,requestId).first();
  if(existing){if(existing.operation_type!==type)return {error:'IDEMPOTENCY_KEY_REUSED'};try{return {replay:true,...JSON.parse(existing.response_json)};}catch{return {error:'OPERATION_RECORD_INVALID'};}}
  for(let attempt=0;attempt<6;attempt++){
    let row=await saveRow(env,userId);
    if(!row.save){const initialized=await writeSave(env,userId,defaultSave(),row.revision);if(!initialized.ok&&initialized.error!=='SAVE_CONFLICT')return {error:initialized.error};row=await saveRow(env,userId);}
    const save=structuredClone(row.save),result=mutator(save);if(result?.error)return result;
    const nextRevision=row.revision+1,t=now(),response={ok:true,transactionId:crypto.randomUUID(),result:result||{},save,revision:nextRevision,updatedAt:t},text=safeSave(save);
    if(!text)return {error:'INVALID_SAVE'};
    try{
      const batch=await env.DB.batch([
        env.DB.prepare('UPDATE player_saves SET save_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?'+(options.guardSql?' AND ('+options.guardSql+')':'')).bind(text,t,userId,row.revision,...(options.guardArgs||[])),
        env.DB.prepare('INSERT INTO economy_operations(user_id,request_id,operation_type,response_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(userId,requestId,type,JSON.stringify(response),t),
        ...(options.additionalStatements?.(response)||[])
      ]);
      if(Number(batch?.[0]?.meta?.changes||0)===1)return response;
    }catch(error){
      const replay=await env.DB.prepare('SELECT operation_type,response_json FROM economy_operations WHERE user_id=? AND request_id=?').bind(userId,requestId).first();
      if(replay){if(replay.operation_type!==type)return {error:'IDEMPOTENCY_KEY_REUSED'};try{return {replay:true,...JSON.parse(replay.response_json)};}catch{return {error:'OPERATION_RECORD_INVALID'};}}
      throw error;
    }
    const replay=await env.DB.prepare('SELECT operation_type,response_json FROM economy_operations WHERE user_id=? AND request_id=?').bind(userId,requestId).first();
    if(replay){if(replay.operation_type!==type)return {error:'IDEMPOTENCY_KEY_REUSED'};try{return {replay:true,...JSON.parse(replay.response_json)};}catch{return {error:'OPERATION_RECORD_INVALID'};}}
  }
  return {error:'SAVE_CONFLICT'};
}


async function ensureRewardSchema(env){
  if(rewardSchemaPromise)return rewardSchemaPromise;
  rewardSchemaPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_registration_signals (
        user_id TEXT PRIMARY KEY, network_hash TEXT, device_hash TEXT, created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_registration_network ON user_registration_signals(network_hash)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_registration_device ON user_registration_signals(device_hash)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS referrals (
        invited_user_id TEXT PRIMARY KEY, inviter_user_id TEXT NOT NULL, status TEXT NOT NULL,
        reward_credits INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', network_hash TEXT, device_hash TEXT,
        created_at INTEGER NOT NULL, rewarded_at INTEGER,
        FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_referrals_inviter_created ON referrals(inviter_user_id,created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_referrals_network_created ON referrals(network_hash,created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_referrals_device ON referrals(device_hash)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_profiles (
        user_id TEXT PRIMARY KEY, level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 10), total_spent INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_level_purchases (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, from_level INTEGER NOT NULL, to_level INTEGER NOT NULL, cost INTEGER NOT NULL, verified_invites INTEGER NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_referral_level_purchases_user ON referral_level_purchases(user_id,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_reward_details (
        invited_user_id TEXT PRIMARY KEY, inviter_level INTEGER NOT NULL, invitee_reward_json TEXT NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS promo_codes (
        id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', reward_json TEXT NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 0, uses_count INTEGER NOT NULL DEFAULT 0, starts_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, created_by TEXT NOT NULL)`),
      env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_nocase ON promo_codes(code COLLATE NOCASE)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(enabled,starts_at,expires_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS promo_redemptions (
        id TEXT PRIMARY KEY, promo_id TEXT NOT NULL, user_id TEXT NOT NULL, reward_json TEXT NOT NULL,
        redeemed_at INTEGER NOT NULL, UNIQUE(promo_id,user_id),
        FOREIGN KEY (promo_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id,redeemed_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promo_redemptions(promo_id,redeemed_at)')
    ]);
  })().catch(e=>{rewardSchemaPromise=null;throw e;});
  return rewardSchemaPromise;
}
function normalizeDeviceId(v){const s=String(v||'').trim();return /^[A-Za-z0-9_-]{16,128}$/.test(s)?s:'';}
function requestNetworkValue(request){return String(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,96);}
async function registrationSignals(request,deviceId){
  const network=requestNetworkValue(request),device=normalizeDeviceId(deviceId);
  return {networkHash:network?await sha256('va-referral-network-v1:'+network):'',deviceHash:device?await sha256('va-referral-device-v1:'+device):''};
}
function normalizePromoCode(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
function validPromoCode(v){return /^[A-Z0-9_-]{3,32}$/.test(v);}
function normalizePromoReward(raw){
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const ids=value=>Array.from(new Set((Array.isArray(value)?value:[]).map(safeResourceId).filter(Boolean))).slice(0,8);
  const credits=Math.max(0,Math.min(PROMO_MAX_REWARD_CREDITS,Math.floor(Number(r.credits)||0))),cars=ids(r.cars),effects=ids(r.effects),cases={};
  if(r.cases&&typeof r.cases==='object'&&!Array.isArray(r.cases))for(const [key,value] of Object.entries(r.cases).slice(0,8)){const id=safeResourceId(key),qty=Math.max(0,Math.min(99,Math.floor(Number(value)||0)));if(id&&qty)cases[id]=qty;}
  if(!credits&&!cars.length&&!effects.length&&!Object.keys(cases).length)return null;
  return {credits,cars,effects,cases};
}
function applyPromoReward(save,reward){
  const before=Math.max(0,Math.floor(Number(save.credits)||0));save.credits=Math.min(ADMIN_MAX_CREDITS,before+reward.credits);
  if(!Array.isArray(save.ownedLiveries))save.ownedLiveries=['apexLime'];if(!save.ownedLiveries.includes('apexLime'))save.ownedLiveries.unshift('apexLime');
  if(!Array.isArray(save.ownedEffects))save.ownedEffects=['standard'];if(!save.ownedEffects.includes('standard'))save.ownedEffects.unshift('standard');
  for(const id of reward.cars)if(!save.ownedLiveries.includes(id))save.ownedLiveries.push(id);
  for(const id of reward.effects)if(!save.ownedEffects.includes(id))save.ownedEffects.push(id);
  if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};
  for(const [id,qty] of Object.entries(reward.cases))save.caseInventory[id]=Math.min(999,Math.max(0,Math.floor(Number(save.caseInventory[id])||0))+qty);
  return {creditsAdded:save.credits-before,reward};
}
function referralTier(level){return REFERRAL_LEVELS[Math.max(1,Math.min(10,Math.floor(Number(level)||1)))-1]||REFERRAL_LEVELS[0];}
async function referralLevelForUser(env,userId){
  const row=await env.DB.prepare('SELECT level FROM referral_profiles WHERE user_id=? LIMIT 1').bind(userId).first();
  return Math.max(1,Math.min(10,Math.floor(Number(row?.level)||1)));
}
function cloneReferralReward(reward){return {credits:Math.max(0,Math.floor(Number(reward?.credits)||0)),cases:{...(reward?.cases||{})}};}
function applyReferralInviteeReward(save,reward){
  const before=Math.max(0,Math.floor(Number(save.credits)||0));save.credits=Math.min(ADMIN_MAX_CREDITS,before+Math.max(0,Math.floor(Number(reward.credits)||0)));
  if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};
  const cases={};for(const [id,qtyRaw] of Object.entries(reward.cases||{})){const qty=Math.max(0,Math.min(9,Math.floor(Number(qtyRaw)||0)));if(!qty)continue;const old=Math.max(0,Math.floor(Number(save.caseInventory[id])||0));save.caseInventory[id]=Math.min(999,old+qty);cases[id]=save.caseInventory[id]-old;}
  return {creditsAdded:save.credits-before,cases};
}
async function referralStats(env,userId){
  const row=await env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='rewarded' THEN 1 ELSE 0 END) AS rewarded,COALESCE(SUM(CASE WHEN status='rewarded' THEN reward_credits ELSE 0 END),0) AS earned FROM referrals WHERE inviter_user_id=?").bind(userId).first();
  return {total:Number(row?.total||0),rewarded:Number(row?.rewarded||0),earned:Number(row?.earned||0)};
}
function publicReferralTiers(){return REFERRAL_LEVELS.map(t=>({level:t.level,requiredInvites:t.requiredInvites,cost:t.cost,inviterReward:t.inviterReward,inviteeReward:cloneReferralReward(t.inviteeReward)}));}
async function referralProfile(env,userId){
  const t=now();await env.DB.prepare('INSERT OR IGNORE INTO referral_profiles (user_id,level,total_spent,updated_at) VALUES (?,1,0,?)').bind(userId,t).run();
  const [profile,stats,cloud]=await Promise.all([env.DB.prepare('SELECT level,total_spent,updated_at FROM referral_profiles WHERE user_id=? LIMIT 1').bind(userId).first(),referralStats(env,userId),saveRow(env,userId)]);
  const level=Math.max(1,Math.min(10,Math.floor(Number(profile?.level)||1))),tier=referralTier(level),next=level<10?referralTier(level+1):null;
  const balance=Math.max(0,Math.floor(Number((cloud.save&&typeof cloud.save==='object'?cloud.save:defaultSave()).credits)||0));
  return {level,totalSpent:Number(profile?.total_spent)||0,updatedAt:Number(profile?.updated_at)||0,balance,stats,current:{...tier,inviteeReward:cloneReferralReward(tier.inviteeReward)},next:next?{...next,inviteeReward:cloneReferralReward(next.inviteeReward)}:null,canUpgrade:!!next&&stats.rewarded>=next.requiredInvites&&balance>=next.cost,tiers:publicReferralTiers(),limits:{daily:REFERRAL_DAILY_LIMIT,monthly:REFERRAL_MONTHLY_LIMIT,network7d:REFERRAL_NETWORK_7D_LIMIT}};
}
async function settlePendingReferral(env,invitedUserId){
  const row=await env.DB.prepare('SELECT r.*,d.inviter_level,d.invitee_reward_json FROM referrals r LEFT JOIN referral_reward_details d ON d.invited_user_id=r.invited_user_id WHERE r.invited_user_id=?').bind(invitedUserId).first();
  if(!row)return null;
  const inviterLevel=Number(row.inviter_level)||1,inviteeReward=cloneReferralReward(JSON.parse(row.invitee_reward_json||'{}')),ownerReward=referralTier(inviterLevel).inviterReward;
  const response=(rewarded,reason='')=>({provided:true,rewarded,rewardCredits:rewarded?ownerReward:0,inviterLevel,inviteeReward:rewarded?inviteeReward:{credits:0,cases:{}},reason});
  if(row.status==='rewarded')return {...response(true),rewardCredits:Number(row.reward_credits)||0,replay:true};
  if(row.status!=='processing'||row.reason!=='authority-v77'||!row.invitee_reward_json)return response(false,row.status==='processing'?'LEGACY_RECONCILIATION_REQUIRED':row.reason);
  const t=Number(row.created_at),inviterId=row.inviter_user_id;
  const limits=[{sql:"(SELECT COUNT(*) FROM referrals WHERE inviter_user_id=? AND status='rewarded' AND created_at>=?)<?",args:[inviterId,t-86400000,REFERRAL_DAILY_LIMIT],reason:'DAILY_LIMIT'},{sql:"(SELECT COUNT(*) FROM referrals WHERE inviter_user_id=? AND status='rewarded' AND created_at>=?)<?",args:[inviterId,t-30*86400000,REFERRAL_MONTHLY_LIMIT],reason:'MONTHLY_LIMIT'}];
  if(row.device_hash)limits.push({sql:"NOT EXISTS(SELECT 1 FROM referrals WHERE device_hash=? AND status='rewarded')",args:[row.device_hash],reason:'DEVICE_ALREADY_USED'});
  if(row.network_hash)limits.push({sql:"(SELECT COUNT(*) FROM referrals WHERE network_hash=? AND status='rewarded' AND created_at>=?)<?",args:[row.network_hash,t-7*86400000,REFERRAL_NETWORK_7D_LIMIT],reason:'NETWORK_LIMIT'});
  const outcome=await applyAccountTransaction(env,{actorId:invitedUserId,requestId:'referral-welcome-'+invitedUserId,type:'referral:welcome',accountIds:[inviterId,invitedUserId],plan:async saves=>{
    for(const gate of limits){const allowed=await env.DB.prepare('SELECT ('+gate.sql+') AS ok').bind(...gate.args).first();if(!allowed?.ok)return {error:gate.reason};}
    const before=saves[inviterId].credits;saves[inviterId].credits=Math.min(ADMIN_MAX_CREDITS,before+ownerReward);const granted=saves[inviterId].credits-before;
    const welcome=applyReferralInviteeReward(saves[invitedUserId],inviteeReward);
    return {result:{...response(true),ownerCreditsAdded:granted,welcome},guardSql:"EXISTS(SELECT 1 FROM referrals WHERE invited_user_id=? AND inviter_user_id=? AND status='processing' AND reason='authority-v77') AND "+limits.map(g=>'('+g.sql+')').join(' AND '),guardArgs:[invitedUserId,inviterId,...limits.flatMap(g=>g.args)],statements:({time,receiptSql,receiptArgs})=>[
      env.DB.prepare("UPDATE referrals SET status='rewarded',reward_credits=?,reason='',rewarded_at=? WHERE invited_user_id=? AND "+receiptSql).bind(granted,time,invitedUserId,...receiptArgs)
    ]};
  }});
  if(outcome.error){if(limits.some(g=>g.reason===outcome.error))await env.DB.prepare("UPDATE referrals SET status='rejected',reason=? WHERE invited_user_id=? AND status='processing' AND reason='authority-v77'").bind(outcome.error,invitedUserId).run();return response(false,outcome.error);}
  return {...outcome.result,replay:!!outcome.replay};
}
async function processReferral(env,{invitedUserId,inviter,signals,t}){
  let reason='',rewarded=false;
  if(!inviter)return {provided:false,rewarded:false,rewardCredits:0,inviterLevel:0,inviteeReward:{credits:0,cases:{}},reason:''};
  if(inviter.id===invitedUserId)reason='SELF_REFERRAL';
  if(!reason&&!isAdminUsername(inviter.username)&&t-Number(inviter.created_at||0)<REFERRAL_MIN_INVITER_AGE_MS)reason='INVITER_TOO_NEW';
  if(!reason&&(signals.deviceHash||signals.networkHash)){
    const invSig=await env.DB.prepare('SELECT network_hash,device_hash FROM user_registration_signals WHERE user_id=? LIMIT 1').bind(inviter.id).first();
    if(signals.deviceHash&&invSig?.device_hash===signals.deviceHash)reason='SAME_DEVICE';
    else if(signals.networkHash&&invSig?.network_hash===signals.networkHash)reason='SAME_NETWORK';
  }
  if(!reason&&signals.deviceHash){const used=await env.DB.prepare("SELECT 1 AS ok FROM referrals WHERE device_hash=? AND status='rewarded' LIMIT 1").bind(signals.deviceHash).first();if(used)reason='DEVICE_ALREADY_USED';}
  if(!reason&&signals.networkHash){const row=await env.DB.prepare("SELECT COUNT(*) AS c FROM referrals WHERE network_hash=? AND status='rewarded' AND created_at>=?").bind(signals.networkHash,t-7*24*60*60*1000).first();if(Number(row?.c||0)>=REFERRAL_NETWORK_7D_LIMIT)reason='NETWORK_LIMIT';}
  if(!reason){const day=await env.DB.prepare("SELECT COUNT(*) AS c FROM referrals WHERE inviter_user_id=? AND status='rewarded' AND created_at>=?").bind(inviter.id,t-24*60*60*1000).first();if(Number(day?.c||0)>=REFERRAL_DAILY_LIMIT)reason='DAILY_LIMIT';}
  if(!reason){const month=await env.DB.prepare("SELECT COUNT(*) AS c FROM referrals WHERE inviter_user_id=? AND status='rewarded' AND created_at>=?").bind(inviter.id,t-30*24*60*60*1000).first();if(Number(month?.c||0)>=REFERRAL_MONTHLY_LIMIT)reason='MONTHLY_LIMIT';}
  const inviterLevel=await referralLevelForUser(env,inviter.id),tier=referralTier(inviterLevel),inviteeReward=cloneReferralReward(tier.inviteeReward),ownerReward=tier.inviterReward;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO referrals (invited_user_id,inviter_user_id,status,reward_credits,reason,network_hash,device_hash,created_at,rewarded_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(invitedUserId,inviter.id,reason?'rejected':'processing',0,reason||'authority-v77',signals.networkHash||null,signals.deviceHash||null,t,null),
    env.DB.prepare("INSERT OR IGNORE INTO referral_reward_details (invited_user_id,inviter_level,invitee_reward_json,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM referrals WHERE invited_user_id=? AND status='processing' AND reason='authority-v77')").bind(invitedUserId,inviterLevel,JSON.stringify(inviteeReward),t,invitedUserId)
  ]);
  const settled=await settlePendingReferral(env,invitedUserId);rewarded=!!settled?.rewarded;reason=settled?.reason||reason;
  if(rewarded&&!settled?.replay){
    try{await writeGameLog(env,{category:'system',eventType:'referral_reward',actorRole:'SYSTEM',targetUserId:inviter.id,targetUsername:inviter.username,source:'REFERRAL',subject:`Реферальная награда · LVL ${inviterLevel}`,amount:ownerReward,currency:'CR',relatedId:invitedUserId,metadata:{invitedUserId,inviterLevel,rewardCredits:ownerReward,inviteeReward},createdAt:t});}catch(e){console.error('referral log',e);}
    try{await writeGameLog(env,{category:'system',eventType:'referral_welcome_reward',actorRole:'SYSTEM',targetUserId:invitedUserId,source:'REFERRAL',subject:`Бонус новичка · реферал LVL ${inviterLevel}`,amount:inviteeReward.credits,currency:'CR',relatedId:inviter.id,metadata:{inviterUserId:inviter.id,inviterUsername:inviter.username,inviterLevel,inviteeReward},createdAt:t});}catch(e){console.error('referral welcome log',e);}
  }
  return settled||{provided:true,rewarded:false,rewardCredits:0,inviterLevel,inviteeReward:{credits:0,cases:{}},reason};
}
async function handleReferralRequest(request,env,url){
  await ensureRewardSchema(env);if(!sameOrigin(request)&&request.method!=='GET')return json({error:'ORIGIN_REJECTED'},403);
  const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
  if(url.pathname==='/api/referrals/profile'&&request.method==='GET')return json({ok:true,profile:await referralProfile(env,session.user.id)});
  if(url.pathname==='/api/referrals/upgrade'&&request.method==='POST'){
    const body=await readBody(request);if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'INVALID_REQUEST'},400);
    if(!body.requestId)return json({error:'CLIENT_UPDATE_REQUIRED',updateRequired:true},409);
    const target=Number(body.level);if(!Number.isInteger(target)||target<2||target>10)return json({error:'INVALID_REFERRAL_LEVEL'},400);
    const userId=session.user.id;await referralProfile(env,userId);
    const outcome=await applyAccountTransaction(env,{actorId:userId,requestId:body.requestId,type:'referral:upgrade:'+target,accountIds:[userId],plan:async saves=>{
      const profile=await env.DB.prepare('SELECT level FROM referral_profiles WHERE user_id=?').bind(userId).first(),level=Number(profile?.level),next=referralTier(target),stats=await referralStats(env,userId);
      if(level!==target-1)return {error:level>=10?'REFERRAL_MAX_LEVEL':'REFERRAL_LEVEL_CONFLICT'};
      if(stats.rewarded<next.requiredInvites)return {error:'REFERRAL_INVITES_REQUIRED'};
      if(saves[userId].credits<next.cost)return {error:'REFERRAL_CREDITS_REQUIRED'};
      saves[userId].credits-=next.cost;
      return {result:{fromLevel:level,level:target,cost:next.cost},guardSql:'EXISTS(SELECT 1 FROM referral_profiles WHERE user_id=? AND level=?) AND (SELECT COUNT(*) FROM referrals WHERE inviter_user_id=? AND status=\'rewarded\')>=?',guardArgs:[userId,level,userId,next.requiredInvites],statements:({transactionId,time,receiptSql,receiptArgs})=>[
        env.DB.prepare('UPDATE referral_profiles SET level=?,total_spent=total_spent+?,updated_at=? WHERE user_id=? AND '+receiptSql).bind(target,next.cost,time,userId,...receiptArgs),
        env.DB.prepare('INSERT INTO referral_level_purchases(id,user_id,from_level,to_level,cost,verified_invites,created_at) SELECT ?,?,?,?,?,?,? WHERE '+receiptSql).bind(transactionId,userId,level,target,next.cost,stats.rewarded,time,...receiptArgs)
      ]};
    }});
    if(outcome.error)return json({error:outcome.error,profile:await referralProfile(env,userId)},409);
    if(!outcome.replay)try{await writeGameLog(env,{category:'purchases',eventType:'referral_level_upgrade',actorUserId:userId,actorUsername:session.user.username,targetUserId:userId,source:'REFERRAL',subject:`Реферальная система · LVL ${target}`,amount:outcome.result.cost,currency:'CR',relatedId:outcome.transactionId,metadata:outcome.result});}catch(e){console.error('referral upgrade log',e);}
    const profile=await referralProfile(env,userId);return json({...outcome,profile,result:{...outcome.result,profile}});
  }
  return json({error:'NOT_FOUND'},404);
}

function promoPublic(row){let reward={};try{reward=JSON.parse(row.reward_json||'{}');}catch{}const t=now();return {id:row.id,code:row.code,title:row.title||'',reward,maxUses:Number(row.max_uses)||0,usesCount:Number(row.uses_count)||0,startsAt:Number(row.starts_at)||0,expiresAt:Number(row.expires_at)||0,enabled:!!row.enabled,active:!!row.enabled&&Number(row.starts_at)<=t&&(!Number(row.expires_at)||Number(row.expires_at)>t),createdAt:Number(row.created_at)||0,updatedAt:Number(row.updated_at)||0};}
async function handlePromoRequest(request,env,url){
  await ensureRewardSchema(env);if(!sameOrigin(request)&&request.method!=='GET')return json({error:'ORIGIN_REJECTED'},403);
  const access=await requireUser(env,request);if(access.error)return access.error;
  if(url.pathname==='/api/promocodes/redeem'&&request.method==='POST'){
    const b=await readBody(request),code=normalizePromoCode(b?.code);if(!validPromoCode(code))return json({error:'PROMO_INVALID'},400);
    const promo=await env.DB.prepare('SELECT * FROM promo_codes WHERE code=? COLLATE NOCASE LIMIT 1').bind(code).first();if(!promo)return json({error:'PROMO_NOT_FOUND'},404);
    const t=now();
    const reward=normalizePromoReward(JSON.parse(promo.reward_json||'{}'));if(!reward)return json({error:'PROMO_REWARD_INVALID'},500);
    const userId=access.session.user.id;
    const changed=await applyAccountTransaction(env,{actorId:userId,requestId:'promo-'+promo.id,type:'promo:redeem',accountIds:[userId],plan:async saves=>{
      if(await env.DB.prepare('SELECT 1 AS ok FROM promo_redemptions WHERE promo_id=? AND user_id=?').bind(promo.id,userId).first())return {error:'PROMO_ALREADY_USED'};
      const current=await env.DB.prepare('SELECT * FROM promo_codes WHERE id=?').bind(promo.id).first(),time=now();
      if(!current?.enabled)return {error:'PROMO_DISABLED'};
      if(Number(current.starts_at)>time)return {error:'PROMO_NOT_STARTED'};
      if(Number(current.expires_at)>0&&Number(current.expires_at)<=time)return {error:'PROMO_EXPIRED'};
      if(Number(current.max_uses)>0&&Number(current.uses_count)>=Number(current.max_uses))return {error:'PROMO_LIMIT_REACHED'};
      const frozen=normalizePromoReward(JSON.parse(current.reward_json||'{}'));if(!frozen)return {error:'PROMO_REWARD_INVALID'};
      const result=applyPromoReward(saves[userId],frozen);
      return {result:{...result,code:current.code,title:current.title||'',reward:frozen},guardSql:'EXISTS(SELECT 1 FROM promo_codes WHERE id=? AND enabled=1 AND starts_at<=? AND (expires_at=0 OR expires_at>?) AND (max_uses=0 OR uses_count<max_uses) AND reward_json=?) AND NOT EXISTS(SELECT 1 FROM promo_redemptions WHERE promo_id=? AND user_id=?)',guardArgs:[promo.id,time,time,current.reward_json,promo.id,userId],statements:({transactionId,time,receiptSql,receiptArgs})=>[
        env.DB.prepare('UPDATE promo_codes SET uses_count=uses_count+1,updated_at=? WHERE id=? AND '+receiptSql).bind(time,promo.id,...receiptArgs),
        env.DB.prepare('INSERT INTO promo_redemptions(id,promo_id,user_id,reward_json,redeemed_at) SELECT ?,?,?,?,? WHERE '+receiptSql).bind(transactionId,promo.id,userId,JSON.stringify(frozen),time,...receiptArgs)
      ]};
    }});
    if(changed.error)return json({error:changed.error},409);
    if(!changed.replay)try{await writeGameLog(env,{category:'system',eventType:'promo_redeem',actorUserId:userId,actorUsername:access.session.user.username,targetUserId:userId,source:'PROMOCODE',subject:`Промокод ${promo.code}`,amount:Number(changed.result?.creditsAdded)||0,currency:'CR',relatedId:changed.transactionId,metadata:{promoId:promo.id,reward:changed.result.reward},createdAt:t});}catch(e){console.error('promo log',e);}
    return json({...changed,code:changed.result.code,title:changed.result.title,reward:changed.result.reward});
  }
  return json({error:'NOT_FOUND'},404);
}

async function ensureSocialSchema(env){
  if(socialSchemaPromise)return socialSchemaPromise;
  socialSchemaPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS friendships (
        user_low TEXT NOT NULL,
        user_high TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_low,user_high),
        FOREIGN KEY (user_low) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user_high) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_friendships_low ON friendships(user_low)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_friendships_high ON friendships(user_high)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS friend_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user TEXT NOT NULL,
        to_user TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(from_user,to_user),
        FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user,created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_presence (
        user_id TEXT PRIMARY KEY,
        last_seen_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_presence_seen ON user_presence(last_seen_at)')
    ]);
  })().catch(e=>{socialSchemaPromise=null;throw e;});
  return socialSchemaPromise;
}
async function touchPresence(env,userId){
  const t=now();await env.DB.prepare(`INSERT INTO user_presence (user_id,last_seen_at) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(userId,t).run();return t;
}
async function requireUser(env,request){
  const session=await currentSession(env,request);if(!session)return {error:json({error:'AUTH_REQUIRED'},401)};
  const ban=await activeBan(env,session.user.id);if(ban)return {error:json({error:'ACCOUNT_BANNED',ban},423)};
  return {session};
}
async function handleFriendsRequest(request,env,url){
  await ensureSocialSchema(env);if(request.method!=='GET'&&!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
  const access=await requireUser(env,request);if(access.error)return access.error;const me=access.session.user;await touchPresence(env,me.id);
  if(url.pathname==='/api/friends/presence'&&request.method==='POST')return json({ok:true,seenAt:now()});
  if(url.pathname==='/api/friends'&&request.method==='GET'){
    const cutoff=now()-90000;
    const result=await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.created_at,p.last_seen_at
      FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low=? THEN f.user_high ELSE f.user_low END
      LEFT JOIN user_presence p ON p.user_id=u.id
      WHERE f.user_low=? OR f.user_high=? ORDER BY lower(u.username) ASC`).bind(me.id,me.id,me.id).all();
    const incoming=await env.DB.prepare(`SELECT fr.id,fr.created_at,u.id AS user_id,u.username,u.display_name
      FROM friend_requests fr JOIN users u ON u.id=fr.from_user
      WHERE fr.to_user=? ORDER BY fr.created_at DESC`).bind(me.id).all();
    const outgoing=await env.DB.prepare(`SELECT fr.id,fr.created_at,u.id AS user_id,u.username,u.display_name
      FROM friend_requests fr JOIN users u ON u.id=fr.to_user
      WHERE fr.from_user=? ORDER BY fr.created_at DESC`).bind(me.id).all();
    const friends=(result.results||[]).map(r=>({id:r.id,username:r.username,displayName:r.display_name,createdAt:Number(r.created_at)||0,lastSeenAt:Number(r.last_seen_at)||0,online:Number(r.last_seen_at||0)>=cutoff}));
    const mapRequest=r=>({requestId:Number(r.id),id:r.user_id,username:r.username,displayName:r.display_name,createdAt:Number(r.created_at)||0});
    return json({ok:true,friends,incomingRequests:(incoming.results||[]).map(mapRequest),outgoingRequests:(outgoing.results||[]).map(mapRequest)});
  }
  if((url.pathname==='/api/friends/request'||url.pathname==='/api/friends/add')&&request.method==='POST'){
    const b=await readBody(request),username=normalizeUsername(String(b?.username||'').replace(/^@/,''));if(!validUsername(username))return json({error:'INVALID_USERNAME'},400);
    const target=await env.DB.prepare('SELECT id,username,display_name FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();if(!target)return json({error:'USER_NOT_FOUND'},404);if(target.id===me.id)return json({error:'CANNOT_ADD_SELF'},400);
    const low=me.id<target.id?me.id:target.id,high=me.id<target.id?target.id:me.id;
    const exists=await env.DB.prepare('SELECT 1 AS ok FROM friendships WHERE user_low=? AND user_high=? LIMIT 1').bind(low,high).first();if(exists)return json({error:'ALREADY_FRIENDS'},409);
    const reverse=await env.DB.prepare('SELECT id FROM friend_requests WHERE from_user=? AND to_user=? LIMIT 1').bind(target.id,me.id).first();if(reverse)return json({error:'REQUEST_ALREADY_RECEIVED',requestId:Number(reverse.id)},409);
    const pending=await env.DB.prepare('SELECT id FROM friend_requests WHERE from_user=? AND to_user=? LIMIT 1').bind(me.id,target.id).first();if(pending)return json({error:'REQUEST_ALREADY_SENT',requestId:Number(pending.id)},409);
    const inserted=await env.DB.prepare('INSERT INTO friend_requests (from_user,to_user,created_at) VALUES (?,?,?)').bind(me.id,target.id,now()).run();
    return json({ok:true,request:{requestId:Number(inserted.meta?.last_row_id)||0,id:target.id,username:target.username,displayName:target.display_name}},201);
  }
  if(url.pathname==='/api/friends/accept'&&request.method==='POST'){
    const b=await readBody(request),requestId=Math.floor(Number(b?.requestId)||0);if(requestId<1)return json({error:'INVALID_REQUEST'},400);
    const req=await env.DB.prepare(`SELECT fr.id,fr.from_user,fr.to_user,u.username,u.display_name FROM friend_requests fr JOIN users u ON u.id=fr.from_user WHERE fr.id=? AND fr.to_user=? LIMIT 1`).bind(requestId,me.id).first();
    if(!req)return json({error:'REQUEST_NOT_FOUND'},404);
    const low=me.id<req.from_user?me.id:req.from_user,high=me.id<req.from_user?req.from_user:me.id,t=now();
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO friendships (user_low,user_high,created_at) VALUES (?,?,?)').bind(low,high,t),
      env.DB.prepare('DELETE FROM friend_requests WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)').bind(me.id,req.from_user,req.from_user,me.id)
    ]);
    return json({ok:true,friend:{id:req.from_user,username:req.username,displayName:req.display_name}});
  }
  if(url.pathname==='/api/friends/decline'&&request.method==='POST'){
    const b=await readBody(request),requestId=Math.floor(Number(b?.requestId)||0);if(requestId<1)return json({error:'INVALID_REQUEST'},400);
    const req=await env.DB.prepare('SELECT id FROM friend_requests WHERE id=? AND to_user=? LIMIT 1').bind(requestId,me.id).first();if(!req)return json({error:'REQUEST_NOT_FOUND'},404);
    await env.DB.prepare('DELETE FROM friend_requests WHERE id=?').bind(requestId).run();return json({ok:true});
  }
  if(url.pathname==='/api/friends/cancel'&&request.method==='POST'){
    const b=await readBody(request),requestId=Math.floor(Number(b?.requestId)||0);if(requestId<1)return json({error:'INVALID_REQUEST'},400);
    const req=await env.DB.prepare('SELECT id FROM friend_requests WHERE id=? AND from_user=? LIMIT 1').bind(requestId,me.id).first();if(!req)return json({error:'REQUEST_NOT_FOUND'},404);
    await env.DB.prepare('DELETE FROM friend_requests WHERE id=?').bind(requestId).run();return json({ok:true});
  }
  if(url.pathname==='/api/friends/remove'&&request.method==='POST'){
    const b=await readBody(request),username=normalizeUsername(String(b?.username||'').replace(/^@/,''));if(!validUsername(username))return json({error:'INVALID_USERNAME'},400);
    const target=await env.DB.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();if(!target)return json({error:'USER_NOT_FOUND'},404);if(target.id===me.id)return json({error:'CANNOT_ADD_SELF'},400);
    const low=me.id<target.id?me.id:target.id,high=me.id<target.id?target.id:me.id;
    await env.DB.prepare('DELETE FROM friendships WHERE user_low=? AND user_high=?').bind(low,high).run();return json({ok:true});
  }
  return json({error:'NOT_FOUND'},404);
}

async function handleAdminRequest(request,env,url){
  await ensureAdminSchema(env);
  if(!sameOrigin(request)&&request.method!=='GET')return json({error:'ORIGIN_REJECTED'},403);

  if(url.pathname==='/api/admin/status'&&request.method==='GET'){
    const access=await requireAdmin(env,request,{unlocked:false});if(access.error)return access.error;
    const row=await env.DB.prepare('SELECT expires_at FROM admin_unlocks WHERE session_token_hash=? AND user_id=? LIMIT 1').bind(access.session.hash,access.session.user.id).first();
    const expiresAt=Number(row?.expires_at)||0;return json({ok:true,isAdmin:true,unlocked:expiresAt>now(),expiresAt});
  }
  if(url.pathname==='/api/admin/unlock'&&request.method==='POST'){
    const access=await requireAdmin(env,request,{unlocked:false});if(access.error)return access.error;
    const b=await readBody(request),digest=await sha256(String(b?.password||''));if(digest!==ADMIN_PASSWORD_SHA256)return json({error:'ADMIN_PASSWORD_INVALID'},403);
    const t=now(),expiresAt=t+ADMIN_UNLOCK_TTL_MS;
    await env.DB.prepare(`INSERT INTO admin_unlocks (session_token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)
      ON CONFLICT(session_token_hash) DO UPDATE SET user_id=excluded.user_id,created_at=excluded.created_at,expires_at=excluded.expires_at`).bind(access.session.hash,access.session.user.id,t,expiresAt).run();
    await audit(env,access.session.user.id,null,'admin_unlock',{expiresAt});return json({ok:true,expiresAt});
  }
  if(url.pathname==='/api/admin/lock'&&request.method==='POST'){
    const access=await requireAdmin(env,request,{unlocked:false});if(access.error)return access.error;
    await env.DB.prepare('DELETE FROM admin_unlocks WHERE session_token_hash=?').bind(access.session.hash).run();return json({ok:true});
  }

  if(url.pathname==='/api/admin/self/operation'&&request.method==='POST'){
    const access=await requireAdmin(env,request);if(access.error)return access.error;
    const b=await readBody(request);if(!/^[\w-]{16,80}$/.test(String(b?.requestId||'')))return json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
    await ensureEconomySchema(env);const result=await applyEconomyOperation(env,access.session.user.id,b.requestId,'owner_self:'+String(b.action),save=>adminSelfMutation(save,b));
    if(result.error)return json({error:result.error},400);
    if(!result.replay)await audit(env,access.session.user.id,access.session.user.id,'self_'+String(b.action),result.result);
    return json(result);
  }
  const access=await requireAdmin(env,request);if(access.error)return access.error;
  if(url.pathname==='/api/admin/accounts'&&request.method==='GET'){
    const q=normalizeUsername(url.searchParams.get('q')||'').replace(/^@/,'').slice(0,24),blocked=url.searchParams.get('blocked')==='1',like='%'+q+'%',t=now();
    let sql=`SELECT u.id,u.username,u.display_name,u.created_at,u.last_login_at,ps.revision,ps.updated_at AS save_updated_at,
      (SELECT b.reason FROM account_bans b WHERE b.user_id=u.id AND b.revoked_at IS NULL AND b.expires_at>? ORDER BY b.expires_at DESC,b.created_at DESC LIMIT 1) AS ban_reason,
      (SELECT b.expires_at FROM account_bans b WHERE b.user_id=u.id AND b.revoked_at IS NULL AND b.expires_at>? ORDER BY b.expires_at DESC,b.created_at DESC LIMIT 1) AS ban_expires_at
      FROM users u LEFT JOIN player_saves ps ON ps.user_id=u.id
      WHERE (lower(u.username) LIKE ? OR lower(u.display_name) LIKE ?)`;
    const binds=[t,t,like,like];
    if(blocked){sql+=` AND EXISTS (SELECT 1 FROM account_bans bx WHERE bx.user_id=u.id AND bx.revoked_at IS NULL AND bx.expires_at>?)`;binds.push(t);}
    sql+=' ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT 50';
    const result=await env.DB.prepare(sql).bind(...binds).all();
    const accounts=(result.results||[]).map(r=>({id:r.id,username:r.username,displayName:r.display_name,createdAt:Number(r.created_at)||0,lastLoginAt:Number(r.last_login_at)||0,revision:Number(r.revision)||0,saveUpdatedAt:Number(r.save_updated_at)||0,ban:r.ban_expires_at?{reason:r.ban_reason||'',expiresAt:Number(r.ban_expires_at)||0,remainingMs:Math.max(0,Number(r.ban_expires_at)-t)}:null,isAdmin:isAdminUsername(r.username)}));
    return json({ok:true,accounts});
  }
  if(url.pathname==='/api/admin/promocodes'&&request.method==='GET'){
    const result=await env.DB.prepare('SELECT * FROM promo_codes ORDER BY enabled DESC,created_at DESC LIMIT 200').all();return json({ok:true,promocodes:(result.results||[]).map(promoPublic)});
  }
  if(url.pathname==='/api/admin/promocodes'&&request.method==='POST'){
    const b=await readBody(request),id=String(b?.id||''),code=normalizePromoCode(b?.code),title=String(b?.title||'').trim().replace(/\s+/g,' ').slice(0,64),reward=normalizePromoReward(b?.reward),maxUses=Math.floor(Number(b?.maxUses)||0),enabled=b?.enabled!==false,t=now();
    const startsAt=Math.floor(Number(b?.startsAt)||t),expiresAt=Math.floor(Number(b?.expiresAt)||0);
    if(!validPromoCode(code))return json({error:'PROMO_INVALID'},400);if(!reward)return json({error:'PROMO_REWARD_INVALID'},400);if(maxUses<0||maxUses>PROMO_MAX_USES)return json({error:'PROMO_LIMIT_INVALID'},400);if(startsAt<t-60000||startsAt>t+PROMO_MAX_DURATION_MS)return json({error:'PROMO_TIME_INVALID'},400);if(expiresAt&&((expiresAt<=startsAt)||(expiresAt-startsAt>PROMO_MAX_DURATION_MS)))return json({error:'PROMO_TIME_INVALID'},400);
    if(id){
      const old=await env.DB.prepare('SELECT id,uses_count FROM promo_codes WHERE id=? LIMIT 1').bind(id).first();if(!old)return json({error:'PROMO_NOT_FOUND'},404);if(maxUses&&maxUses<Number(old.uses_count||0))return json({error:'PROMO_LIMIT_BELOW_USED'},400);
      try{await env.DB.prepare('UPDATE promo_codes SET code=?,title=?,reward_json=?,max_uses=?,starts_at=?,expires_at=?,enabled=?,updated_at=? WHERE id=?').bind(code,title,JSON.stringify(reward),maxUses,startsAt,expiresAt,enabled?1:0,t,id).run();}
      catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return json({error:'PROMO_CODE_TAKEN'},409);throw e;}
      await audit(env,access.session.user.id,null,'promocode_update',{id,code,maxUses,startsAt,expiresAt,enabled,reward});const row=await env.DB.prepare('SELECT * FROM promo_codes WHERE id=?').bind(id).first();return json({ok:true,promocode:promoPublic(row)});
    }
    const promoId=crypto.randomUUID();try{await env.DB.prepare('INSERT INTO promo_codes (id,code,title,reward_json,max_uses,uses_count,starts_at,expires_at,enabled,created_at,updated_at,created_by) VALUES (?,?,?,?,?,0,?,?,?,?,?,?)').bind(promoId,code,title,JSON.stringify(reward),maxUses,startsAt,expiresAt,enabled?1:0,t,t,access.session.user.id).run();}
    catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return json({error:'PROMO_CODE_TAKEN'},409);throw e;}
    await audit(env,access.session.user.id,null,'promocode_create',{id:promoId,code,maxUses,startsAt,expiresAt,enabled,reward});const row=await env.DB.prepare('SELECT * FROM promo_codes WHERE id=?').bind(promoId).first();return json({ok:true,promocode:promoPublic(row)},201);
  }
  const promoAction=url.pathname.match(/^\/api\/admin\/promocode\/([0-9a-f-]{16,64})\/(toggle)$/i);
  if(promoAction&&request.method==='POST'){
    const b=await readBody(request),enabled=!!b?.enabled,id=promoAction[1],row=await env.DB.prepare('SELECT id FROM promo_codes WHERE id=? LIMIT 1').bind(id).first();if(!row)return json({error:'PROMO_NOT_FOUND'},404);
    await env.DB.prepare('UPDATE promo_codes SET enabled=?,updated_at=? WHERE id=?').bind(enabled?1:0,now(),id).run();await audit(env,access.session.user.id,null,'promocode_toggle',{id,enabled});const updated=await env.DB.prepare('SELECT * FROM promo_codes WHERE id=?').bind(id).first();return json({ok:true,promocode:promoPublic(updated)});
  }
  const detailMatch=url.pathname.match(/^\/api\/admin\/account\/([0-9a-f-]{16,64})$/i);
  if(detailMatch&&request.method==='GET'){
    const detail=await accountDetail(env,detailMatch[1]);if(!detail)return json({error:'USER_NOT_FOUND'},404);return json({ok:true,...detail});
  }
  const actionMatch=url.pathname.match(/^\/api\/admin\/account\/([0-9a-f-]{16,64})\/(credits|resource|ban|unban)$/i);
  if(actionMatch&&request.method==='POST'){
    const userId=actionMatch[1],action=actionMatch[2],target=await targetUser(env,userId);if(!target)return json({error:'USER_NOT_FOUND'},404);
    if(action==='credits'){
      const b=await readBody(request),delta=Number(b?.delta);if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>ADMIN_MAX_CREDITS)return json({error:'INVALID_AMOUNT'},400);
      const changed=await mutateTargetSave(env,userId,save=>{const before=Math.max(0,Math.floor(Number(save.credits)||0)),after=Math.max(0,Math.min(ADMIN_MAX_CREDITS,before+delta));save.credits=after;return {before,after,delta:after-before};});
      if(changed.error)return json({error:changed.error},changed.error==='SAVE_CONFLICT'?409:400);await audit(env,access.session.user.id,userId,'credits',{requestedDelta:delta,...changed.result,liveSync:true});return json(changed);
    }
    if(action==='resource'){
      const b=await readBody(request),kind=String(b?.kind||''),resourceId=safeResourceId(b?.id),op=String(b?.action||''),quantity=Math.max(1,Math.min(999,Math.floor(Number(b?.quantity)||1)));
      if(!['car','effect','case'].includes(kind)||!resourceId||!['grant','revoke'].includes(op))return json({error:'INVALID_RESOURCE_ACTION'},400);
      const changed=await mutateTargetSave(env,userId,save=>{
        if(kind==='case'){
          if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};
          const before=Math.max(0,Math.min(999,Math.floor(Number(save.caseInventory[resourceId])||0))),after=op==='grant'?Math.min(999,before+quantity):Math.max(0,before-quantity);save.caseInventory[resourceId]=after;return {kind,id:resourceId,action:op,before,after,quantity:Math.abs(after-before)};
        }
        const key=kind==='car'?'ownedLiveries':'ownedEffects',selectedKey=kind==='car'?'selectedLivery':'selectedEffect',fallback=kind==='car'?'apexLime':'standard';
        if(resourceId===fallback&&op==='revoke')return {error:'SYSTEM_RESOURCE'};
        if(!Array.isArray(save[key]))save[key]=[fallback];if(!save[key].includes(fallback))save[key].unshift(fallback);
        const before=save[key].includes(resourceId);if(op==='grant'&&!before)save[key].push(resourceId);if(op==='revoke'&&before)save[key]=save[key].filter(x=>x!==resourceId);
        if(op==='revoke'&&save[selectedKey]===resourceId)save[selectedKey]=fallback;
        return {kind,id:resourceId,action:op,before,after:save[key].includes(resourceId)};
      });
      if(changed.error)return json({error:changed.error},changed.error==='SAVE_CONFLICT'?409:400);await audit(env,access.session.user.id,userId,'resource',{...changed.result,liveSync:true});return json(changed);
    }
    if(action==='ban'){
      if(isAdminUsername(target.username))return json({error:'ADMIN_ACCOUNT_PROTECTED'},403);
      const b=await readBody(request),durationMs=Math.floor(Number(b?.durationMs)),reason=normalizeReason(b?.reason);if(!Number.isFinite(durationMs)||durationMs<1000||durationMs>ADMIN_MAX_BAN_MS)return json({error:'INVALID_BAN_DURATION'},400);if(reason.length<3)return json({error:'INVALID_BAN_REASON'},400);
      const t=now(),expiresAt=t+durationMs,id=crypto.randomUUID();
      await env.DB.prepare('UPDATE account_bans SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(t,access.session.user.id,userId,t).run();
      await env.DB.prepare('INSERT INTO account_bans (id,user_id,reason,created_at,expires_at,created_by) VALUES (?,?,?,?,?,?)').bind(id,userId,reason,t,expiresAt,access.session.user.id).run();
      await audit(env,access.session.user.id,userId,'ban',{reason,expiresAt,durationMs});
      return json({ok:true,ban:{id,reason,createdAt:t,expiresAt,remainingMs:durationMs},detail:await accountDetail(env,userId)});
    }
    if(action==='unban'){
      const t=now();await env.DB.prepare('UPDATE account_bans SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(t,access.session.user.id,userId,t).run();await audit(env,access.session.user.id,userId,'unban',{});return json({ok:true,detail:await accountDetail(env,userId)});
    }
  }
  return json({error:'NOT_FOUND'},404);
}

// Used only by the outer worker. Never derive roles from a supplied nickname.
export async function freeAccountIdentity(env,request){
  if(!env.DB)return {user:null};
  const session=await currentSession(env,request);if(!session)return {user:null};
  const response=await banResponse(env,session.user);if(response)return {user:null,response};
  return {user:session.user,owner:isAdminUsername(session.user.username)};
}

function strictSameOrigin(request){
  const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin;
}
function recoveryResponse(){return json({ok:true,message:'Если этот адрес подтверждён в аккаунте, инструкция придёт на почту.'},202);}
function maskEmail(email){const [local,domain]=String(email||'').split('@');return local&&domain?`${local.slice(0,1)}***@${domain}`:'';}
function htmlEscape(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function recoveryRateAllowed(env,scope,limit,t=now()){
  const rateKey=await sha256(`velocity-apex-recovery:${scope}`),windowStart=Math.floor(t/RECOVERY_RATE_WINDOW_MS)*RECOVERY_RATE_WINDOW_MS;
  await env.DB.prepare('DELETE FROM recovery_rate_limits WHERE window_start<?').bind(windowStart-RECOVERY_RATE_WINDOW_MS).run();
  await env.DB.prepare(`INSERT INTO recovery_rate_limits (rate_key,window_start,request_count) VALUES (?,?,1)
    ON CONFLICT(rate_key) DO UPDATE SET
      request_count=CASE WHEN recovery_rate_limits.window_start=excluded.window_start THEN recovery_rate_limits.request_count+1 ELSE 1 END,
      window_start=excluded.window_start`).bind(rateKey,windowStart).run();
  const row=await env.DB.prepare('SELECT request_count FROM recovery_rate_limits WHERE rate_key=? LIMIT 1').bind(rateKey).first();
  return Number(row?.request_count||0)<=limit;
}
async function recoveryRateAllowedForRequest(env,request,scopeKey,accountLimit,t=now()){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const [ipAllowed,accountAllowed]=await Promise.all([
    recoveryRateAllowed(env,`${scopeKey}:ip:${ip}`,12,t),
    recoveryRateAllowed(env,`${scopeKey}:subject:${accountLimit.key}`,accountLimit.limit,t)
  ]);
  return ipAllowed&&accountAllowed;
}
async function sendAccountEmail(env,kind,{email,displayName,token=''}){
  const apiKey=String(env.RESEND_API_KEY||''),from=String(env.EMAIL_FROM||''),configuredOrigin=String(env.PUBLIC_APP_ORIGIN||'');
  let origin;
  try{const parsed=new URL(configuredOrigin);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return false;origin=parsed.origin;}catch{return false;}
  if(!apiKey||!from||!validEmail(normalizeEmail(email)))return false;
  const name=htmlEscape(displayName||'гонщик'),date=new Date().toLocaleString('ru-RU',{timeZone:'UTC',timeZoneName:'short'});
  let subject='',title='',copy='',label='',url='',warning='Если вы не запрашивали это действие, проигнорируйте письмо. Ваш пароль и игровой прогресс останутся без изменений.';
  if(kind==='verify'){
    subject='Подтверждение email · Velocity Apex';title='ПОДТВЕРДИТЕ EMAIL';copy=`Здравствуйте, ${name}. Подтвердите адрес, чтобы защитить аккаунт и использовать восстановление пароля.`;label='ПОДТВЕРДИТЬ EMAIL';url=`${origin}/#verify-email=${encodeURIComponent(token)}`;
  }else if(kind==='reset'){
    subject='Восстановление доступа · Velocity Apex';title='ВОССТАНОВЛЕНИЕ ДОСТУПА';copy=`Здравствуйте, ${name}. Мы получили запрос на смену пароля вашего аккаунта.`;label='СМЕНИТЬ ПАРОЛЬ';url=`${origin}/#password-reset=${encodeURIComponent(token)}`;warning='Ссылка действует 20 минут и используется один раз. Если запрос сделали не вы, проигнорируйте письмо: пароль не изменится.';
  }else{
    subject='Пароль изменён · Velocity Apex';title='ПАРОЛЬ ИЗМЕНЁН';copy=`Пароль аккаунта Velocity Apex изменён ${htmlEscape(date)}.`;warning='Если вы не меняли пароль, обратитесь в поддержку игры и защитите почту. Старые игровые сессии уже завершены.';
  }
  const action=url?`<a href="${htmlEscape(url)}" style="display:inline-block;padding:15px 24px;border-radius:12px;background:#31b9ef;color:#04111e;text-decoration:none;font:800 14px Arial,sans-serif;letter-spacing:1px">${label}</a>`:'';
  const html=`<!doctype html><html lang="ru"><body style="margin:0;padding:24px;background:#071426;color:#eaf6ff;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:auto;background:#0d2037;border:1px solid #1c4667;border-radius:18px"><tr><td style="padding:30px 28px"><div style="color:#55cfff;font-size:12px;font-weight:bold;letter-spacing:3px">VELOCITY APEX</div><h1 style="margin:24px 0 12px;font-size:24px;line-height:1.2">${title}</h1><p style="color:#c2d6e5;font-size:15px;line-height:1.6">${copy}</p>${action?`<p style="margin:26px 0">${action}</p>`:''}<p style="color:#8eaac0;font-size:13px;line-height:1.55">${warning}</p><div style="margin-top:26px;padding-top:18px;border-top:1px solid #1c4667;color:#7694ab;font-size:11px">VELOCITY APEX · ACCOUNT SECURITY</div></td></tr></table></body></html>`;
  const text=[title,copy,url?`${label}: ${url}`:'',warning].filter(Boolean).join('\n\n');
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from,to:[email],subject,html,text})});
    return response.ok;
  }catch{return false;}
}
async function handleRecoveryRequest(request,env,url,executionCtx){
  const path=url.pathname,t=now();
  if(path==='/api/auth/email'&&request.method==='GET'){
    const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
    const verified=await env.DB.prepare('SELECT email,verified_at FROM account_emails WHERE user_id=? LIMIT 1').bind(session.user.id).first();
    const pending=await env.DB.prepare('SELECT expires_at FROM pending_account_emails WHERE user_id=? AND expires_at>? LIMIT 1').bind(session.user.id,t).first();
    return json({verified:!!verified,maskedEmail:verified?maskEmail(verified.email):'',verificationPending:!!pending});
  }
  if(path==='/api/auth/email/attach'&&request.method==='POST'){
    if(!strictSameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
    let b;try{b=await readBody(request);}catch{return json({error:'INVALID_REQUEST'},400);}
    const email=normalizeEmail(b?.email),password=b?.currentPassword;if(!validEmail(email))return json({error:'INVALID_EMAIL'},400);
    const allowed=await recoveryRateAllowedForRequest(env,request,'email-bind',{key:session.user.id,limit:6},t);if(!allowed)return json({error:'RATE_LIMITED'},429);
    const credentials=await env.DB.prepare('SELECT password_hash,password_salt,password_iterations,username,display_name FROM users WHERE id=? LIMIT 1').bind(session.user.id).first();if(!credentials||typeof password!=='string'||password.length>128)return json({error:'INVALID_CREDENTIALS'},401);
    const passwordCheck=await passwordHash(password,decodeB64url(credentials.password_salt),Number(credentials.password_iterations)||PASSWORD_ITERATIONS);if(passwordCheck!==credentials.password_hash)return json({error:'INVALID_CREDENTIALS'},401);
    const existing=await env.DB.prepare('SELECT user_id FROM account_emails WHERE email_normalized=? LIMIT 1').bind(email).first();if(existing&&existing.user_id!==session.user.id)return json({error:'EMAIL_UNAVAILABLE'},409);
    const pendingOwner=await env.DB.prepare('SELECT user_id FROM pending_account_emails WHERE email_normalized=? AND expires_at>? LIMIT 1').bind(email,t).first();if(pendingOwner&&pendingOwner.user_id!==session.user.id)return json({error:'EMAIL_UNAVAILABLE'},409);
    if(existing?.user_id===session.user.id)return json({ok:true,verified:true,maskedEmail:maskEmail(email)});
    const rawToken=b64url(randomBytes(32)),tokenHash=await sha256(rawToken),expires=t+RECOVERY_TOKEN_TTL_MS;
    try{
      await env.DB.batch([
        env.DB.prepare('DELETE FROM pending_account_emails WHERE expires_at<=?').bind(t),
        env.DB.prepare('DELETE FROM email_verification_tokens WHERE expires_at<=?').bind(t),
        env.DB.prepare('DELETE FROM email_verification_tokens WHERE user_id=?').bind(session.user.id),
        env.DB.prepare(`INSERT INTO pending_account_emails (user_id,email,email_normalized,expires_at,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,email_normalized=excluded.email_normalized,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).bind(session.user.id,email,email,expires,t),
        env.DB.prepare('INSERT INTO email_verification_tokens (token_hash,user_id,email_normalized,created_at,expires_at) VALUES (?,?,?,?,?)').bind(tokenHash,session.user.id,email,t,expires)
      ]);
    }catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return json({error:'EMAIL_UNAVAILABLE'},409);throw e;}
    const delivered=await sendAccountEmail(env,'verify',{email,displayName:credentials.display_name,token:rawToken});
    if(!delivered)return json({error:'EMAIL_DELIVERY_UNAVAILABLE'},503);
    return json({ok:true,verificationPending:true},202);
  }
  if(path==='/api/auth/email/verify'&&request.method==='POST'){
    if(!strictSameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const verifyIp=request.headers.get('CF-Connecting-IP')||'unknown';if(!await recoveryRateAllowed(env,`email-verify:ip:${verifyIp}`,20,t))return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    let b;try{b=await readBody(request);}catch{return json({error:'INVALID_REQUEST'},400);}
    const raw=typeof b?.token==='string'?b.token:'';if(!/^[A-Za-z0-9_-]{40,64}$/.test(raw))return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    const tokenHash=await sha256(raw),row=await env.DB.prepare(`SELECT v.user_id,v.email_normalized,p.email,u.display_name,u.username
      FROM email_verification_tokens v JOIN pending_account_emails p ON p.user_id=v.user_id AND p.email_normalized=v.email_normalized
      JOIN users u ON u.id=v.user_id WHERE v.token_hash=? AND v.used_at IS NULL AND v.expires_at>? AND p.expires_at>? LIMIT 1`).bind(tokenHash,t,t).first();
    if(!row)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    const user=adminUser({id:row.user_id,username:row.username,displayName:row.display_name}),banned=await banResponse(env,user);if(banned)return banned;
    const claimHash=await sha256(`email-verify-claim:${b64url(randomBytes(32))}`);
    try{
      const results=await env.DB.batch([
        env.DB.prepare('UPDATE email_verification_tokens SET token_hash=?,used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(claimHash,t,tokenHash,t),
        env.DB.prepare(`INSERT INTO account_emails (user_id,email,email_normalized,verified_at,updated_at)
          SELECT p.user_id,p.email,p.email_normalized,?,? FROM pending_account_emails p
          WHERE p.user_id=? AND p.email_normalized=? AND p.expires_at>? AND EXISTS(SELECT 1 FROM email_verification_tokens v WHERE v.token_hash=? AND v.used_at=?)
          ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,email_normalized=excluded.email_normalized,verified_at=excluded.verified_at,updated_at=excluded.updated_at`).bind(t,t,row.user_id,row.email_normalized,t,claimHash,t),
        env.DB.prepare('DELETE FROM pending_account_emails WHERE user_id=? AND email_normalized=? AND EXISTS(SELECT 1 FROM account_emails a WHERE a.user_id=? AND a.email_normalized=?)').bind(row.user_id,row.email_normalized,row.user_id,row.email_normalized),
        env.DB.prepare('DELETE FROM email_verification_tokens WHERE token_hash=?').bind(claimHash)
      ]);
      if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    }catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return json({error:'EMAIL_UNAVAILABLE'},409);throw e;}
    return json({ok:true,verified:true,maskedEmail:maskEmail(row.email)});
  }
  if(path==='/api/auth/password/reset/request'&&request.method==='POST'){
    if(!strictSameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    let b;try{b=await readBody(request);}catch{return recoveryResponse();}
    const email=normalizeEmail(b?.email);if(!validEmail(email))return recoveryResponse();
    const allowed=await recoveryRateAllowedForRequest(env,request,'password-reset',{key:email,limit:3},t);if(!allowed)return recoveryResponse();
    const row=await env.DB.prepare(`SELECT a.user_id,a.email,u.username,u.display_name FROM account_emails a JOIN users u ON u.id=a.user_id
      WHERE a.email_normalized=? AND a.verified_at>0 LIMIT 1`).bind(email).first();
    if(!row||await activeBan(env,row.user_id,t))return recoveryResponse();
    const rawToken=b64url(randomBytes(32)),tokenHash=await sha256(rawToken),expires=t+RECOVERY_TOKEN_TTL_MS;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE expires_at<=?').bind(t),
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(row.user_id),
      env.DB.prepare('INSERT INTO password_reset_tokens (token_hash,user_id,email_normalized,created_at,expires_at) VALUES (?,?,?,?,?)').bind(tokenHash,row.user_id,email,t,expires)
    ]);
    const delivery=sendAccountEmail(env,'reset',{email:row.email,displayName:row.display_name,token:rawToken});if(executionCtx?.waitUntil)executionCtx.waitUntil(delivery.then(()=>undefined));else await delivery;
    return recoveryResponse();
  }
  if(path==='/api/auth/password/reset/complete'&&request.method==='POST'){
    if(!strictSameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    let b;try{b=await readBody(request);}catch{return json({error:'INVALID_REQUEST'},400);}
    const raw=typeof b?.token==='string'?b.token:'',password=b?.password,confirm=b?.passwordConfirm;
    if(password!==confirm)return json({error:'PASSWORD_MISMATCH'},400);
    if(!validRecoveryPassword(password))return json({error:'WEAK_PASSWORD'},400);
    const tokenHash=await sha256(raw),rateOk=await recoveryRateAllowedForRequest(env,request,'password-reset-complete',{key:tokenHash,limit:8},t);if(!rateOk)return json({error:'RATE_LIMITED'},429);
    const row=await env.DB.prepare(`SELECT r.user_id,r.email_normalized,u.username,u.display_name,u.password_hash
      FROM password_reset_tokens r JOIN account_emails a ON a.user_id=r.user_id AND a.email_normalized=r.email_normalized AND a.verified_at>0
      JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? LIMIT 1`).bind(tokenHash,t).first();
    if(!row)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    const banned=await banResponse(env,adminUser({id:row.user_id,username:row.username,displayName:row.display_name}));if(banned)return banned;
    if(password.toLowerCase()===String(row.username||'').toLowerCase())return json({error:'WEAK_PASSWORD'},400);
    const salt=randomBytes(16),hash=await passwordHash(password,salt),saltText=b64url(salt),claimHash=await sha256(`password-reset-claim:${b64url(randomBytes(32))}`);
    const results=await env.DB.batch([
      env.DB.prepare('UPDATE password_reset_tokens SET token_hash=?,used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(claimHash,t,tokenHash,t),
      env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE id=?
        AND EXISTS(SELECT 1 FROM password_reset_tokens r WHERE r.token_hash=? AND r.used_at=?)`).bind(hash,saltText,PASSWORD_ITERATIONS,t,row.user_id,claimHash,t),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM password_reset_tokens r JOIN users u ON u.id=r.user_id
        WHERE r.token_hash=? AND r.used_at=? AND u.password_hash=? AND u.password_salt=?)`).bind(row.user_id,claimHash,t,hash,saltText),
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id=? AND EXISTS(SELECT 1 FROM password_reset_tokens r WHERE r.user_id=? AND r.token_hash=? AND r.used_at=?)').bind(row.user_id,row.user_id,claimHash,t)
    ]);
    if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    await sendAccountEmail(env,'changed',{email:(await env.DB.prepare('SELECT email FROM account_emails WHERE user_id=? LIMIT 1').bind(row.user_id).first())?.email,displayName:row.display_name});
    return json({ok:true,passwordChanged:true},200,{'set-cookie':sessionCookie(request,'',0)});
  }
  return null;
}

export async function handleAuthRequest(request,env,url=new URL(request.url),executionCtx){
  if(!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/account/')&&!url.pathname.startsWith('/api/economy/')&&!url.pathname.startsWith('/api/admin/')&&!url.pathname.startsWith('/api/friends')&&!url.pathname.startsWith('/api/promocodes/')&&!url.pathname.startsWith('/api/referrals/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    await ensureAdminSchema(env);await ensureRewardSchema(env);
    const recoveryResponseValue=await handleRecoveryRequest(request,env,url,executionCtx);if(recoveryResponseValue)return recoveryResponseValue;
    if(url.pathname.startsWith('/api/economy/'))await ensureEconomySchema(env);
    if(url.pathname.startsWith('/api/economy/races/')){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
      return await handleRaceAuthority(request,env,url,session,{readBody,saveRow,applyEconomyOperation,settings});
    }
    if(url.pathname.startsWith('/api/promocodes/'))return await handlePromoRequest(request,env,url);
    if(url.pathname.startsWith('/api/referrals/'))return await handleReferralRequest(request,env,url);
    if(url.pathname.startsWith('/api/friends'))return handleFriendsRequest(request,env,url);
    if(url.pathname.startsWith('/api/admin/'))return handleAdminRequest(request,env,url);
    if((url.pathname.startsWith('/api/economy/cases/')||/^\/api\/economy\/(store\/(buy|sell|select)|tuning\/(upgrade|style))$/.test(url.pathname))&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
      let b;try{b=await readBody(request);}catch{return json({error:'INVALID_REQUEST'},400);}
      const requestId=String(b?.requestId||''),caseId=String(b?.caseId||''),quantity=Number(b?.quantity);
      if(!/^[\w-]{16,80}$/.test(requestId))return json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
      if(url.pathname==='/api/economy/store/select'){
        const kind=b?.kind==='livery'?'livery':b?.kind==='effect'?'effect':'',id=String(b?.id||''),catalog=kind==='livery'?SERVER_CARS:kind==='effect'?SERVER_EFFECTS:null;
        if(!catalog?.[id])return json({error:'INVALID_ITEM'},400);
        const owner=kind==='livery'?await settings(env):null;if(!session.user.isAdmin&&(owner?.cars?.[id]?.enabled===false||owner?.cars?.[id]?.unavailable))return json({error:'ITEM_UNAVAILABLE'},400);
        const result=await applyEconomyOperation(env,session.user.id,requestId,'store_select',save=>{const owned=kind==='livery'?'ownedLiveries':'ownedEffects',selected=kind==='livery'?'selectedLivery':'selectedEffect';if(!Array.isArray(save[owned])||!save[owned].includes(id))return {error:'ITEM_NOT_OWNED'};save[selected]=id;return {status:'selected',kind,id,cost:0};});
        return json(result,result.error?400:200);
      }
      if(url.pathname==='/api/economy/store/buy'){
        const kind=b?.kind==='livery'?'livery':b?.kind==='effect'?'effect':'';const id=String(b?.id||''),catalog=kind==='livery'?SERVER_CARS:kind==='effect'?SERVER_EFFECTS:null,item=catalog?.[id];
        if(!item||!kind||kind==='livery'&&(!item.enabled||item.unavailable||item.limited))return json({error:'INVALID_ITEM'},400);
        const result=await applyEconomyOperation(env,session.user.id,requestId,'store_buy',save=>{
          const key=kind==='livery'?'ownedLiveries':'ownedEffects',selected=kind==='livery'?'selectedLivery':'selectedEffect';if(!Array.isArray(save[key]))save[key]=[];
          if(save[key].includes(id)){save[selected]=id;return {status:'selected',kind,id,cost:0};}
          const cost=Math.max(0,Math.floor(Number(item.price)||0)),balance=Math.max(0,Math.floor(Number(save.credits)||0));if(balance<cost)return {error:'INSUFFICIENT_CR'};
          save.credits=balance-cost;save[key].push(id);return {status:'purchased',kind,id,cost};
        });
        if(result.error)return json({error:result.error},result.error==='INSUFFICIENT_CR'?409:400);
        if(!result.replay){try{await writeGameLog(env,{category:'purchases',eventType:'store_purchase',actorUserId:session.user.id,actorUsername:session.user.username,actorRole:session.user.isAdmin?'OWNER':'PLAYER',targetUserId:session.user.id,targetUsername:session.user.username,source:'SERVER_STORE_API',subject:`${kind}: ${item.name||id}`,amount:-(result.result?.cost||0),currency:'CR',metadata:{kind,id}});}catch(e){console.error('store economy log',e);}}
        return json(result);
      }
      if(url.pathname==='/api/economy/store/sell'){
        const id=String(b?.id||''),item=SERVER_CARS[id],cfg=GARAGE_ECONOMY.cars[id];if(!item||!cfg)return json({error:'INVALID_ITEM'},400);
        const result=await applyEconomyOperation(env,session.user.id,requestId,'car_sell',save=>{
          if(!Array.isArray(save.ownedLiveries)||!save.ownedLiveries.includes(id))return {error:'CAR_NOT_OWNED'};if(id==='apexLime')return {error:'CAR_PROTECTED'};
          let total=Math.max(0,Math.floor(Number(item.price)||0));const levels=save.carUpgrades?.[id]||{};
          for(const [key,costs] of Object.entries(cfg.upgradeCosts)){const level=Math.max(0,Math.min(5,Math.floor(Number(levels[key])||0)));for(let i=0;i<level;i++)total+=Math.max(0,Math.floor(Number(costs[i])||0));}
          const style=save.carCustomizations?.[id]||{};for(const color of style.ownedColors||[])total+=Math.max(0,Math.floor(Number(cfg.paintCosts[color])||0));for(const vinyl of style.ownedVinyls||[])total+=Math.max(0,Math.floor(Number(cfg.vinylCosts[vinyl])||0));
          const payout=Math.max(0,Math.floor(total*GARAGE_ECONOMY.sellRate));save.credits=Math.min(ADMIN_MAX_CREDITS,Math.max(0,Math.floor(Number(save.credits)||0))+payout);save.ownedLiveries=save.ownedLiveries.filter(x=>x!==id);if(save.carUpgrades)delete save.carUpgrades[id];if(save.carCustomizations)delete save.carCustomizations[id];if(save.selectedLivery===id)save.selectedLivery=save.ownedLiveries.includes('apexLime')?'apexLime':(save.ownedLiveries[0]||'apexLime');
          return {status:'sold',id,total,payout,credits:save.credits,selectedLivery:save.selectedLivery};
        });
        if(result.error)return json({error:result.error},result.error==='SAVE_CONFLICT'?409:400);
        return json(result);
      }
      if(url.pathname==='/api/economy/tuning/upgrade'||url.pathname==='/api/economy/tuning/style'){
        const id=String(b?.id||''),cfg=GARAGE_ECONOMY.cars[id],car=SERVER_CARS[id];if(!cfg||!car?.enabled||car.unavailable||car.limited)return json({error:'INVALID_ITEM'},400);
        const styleAction=url.pathname.endsWith('/style'),type=styleAction?'tuning_style':'tuning_upgrade';
        const result=await applyEconomyOperation(env,session.user.id,requestId,type,save=>{
          if(!Array.isArray(save.ownedLiveries)||!save.ownedLiveries.includes(id))return {error:'CAR_NOT_OWNED'};
          if(!styleAction){const key=String(b?.key||''),costs=cfg.upgradeCosts[key],level=Math.max(0,Math.floor(Number(save.carUpgrades?.[id]?.[key])||0));if(!costs)return {error:'INVALID_UPGRADE'};if(level>=5)return {error:'UPGRADE_MAX'};if(Number(b?.expectedLevel)!==level)return {error:'STALE_UPGRADE'};const cost=Math.max(0,Math.floor(Number(costs[level])||0)),balance=Math.max(0,Math.floor(Number(save.credits)||0));if(balance<cost)return {error:'INSUFFICIENT_CR'};save.credits=balance-cost;if(!save.carUpgrades||typeof save.carUpgrades!=='object')save.carUpgrades={};if(!save.carUpgrades[id])save.carUpgrades[id]={speed:0,acceleration:0,brakes:0};save.carUpgrades[id][key]=level+1;return {status:'purchased',id,key,cost,level:level+1};}
          const kind=b?.kind==='color'?'color':b?.kind==='vinyl'?'vinyl':'';if(!kind)return {error:'INVALID_STYLE'};const value=String(b?.value||''),costMap=kind==='color'?cfg.paintCosts:cfg.vinylCosts;if(!Object.hasOwn(costMap,value))return {error:'INVALID_STYLE'};
          const free=kind==='color'?'stock':'none',ownedKey=kind==='color'?'ownedColors':'ownedVinyls',selectedKey=kind==='color'?'colorId':'vinylId';if(!save.carCustomizations||typeof save.carCustomizations!=='object')save.carCustomizations={};const current=save.carCustomizations[id]&&typeof save.carCustomizations[id]==='object'?save.carCustomizations[id]:{};const owned=Array.isArray(current[ownedKey])?current[ownedKey]:[free];if(!owned.includes(free))owned.unshift(free);const cost=owned.includes(value)?0:Math.max(0,Math.floor(Number(costMap[value])||0)),balance=Math.max(0,Math.floor(Number(save.credits)||0));if(balance<cost)return {error:'INSUFFICIENT_CR'};if(cost)save.credits=balance-cost;if(!owned.includes(value))owned.push(value);current[ownedKey]=owned;current[selectedKey]=value;save.carCustomizations[id]=current;return {status:cost?'purchased':'applied',id,kind,value,cost};
        });
        if(result.error)return json({error:result.error},result.error==='INSUFFICIENT_CR'?409:400);return json(result);
      }
      if(!Object.hasOwn(SERVER_CASES,caseId)||!Number.isInteger(quantity)||quantity<1||quantity>10)return json({error:'INVALID_CASE_REQUEST'},400);
      const action=url.pathname.endsWith('/buy')?'case_buy':url.pathname.endsWith('/open')?'case_open':'';if(!action)return json({error:'NOT_FOUND'},404);
      const box=SERVER_CASES[caseId],result=await applyEconomyOperation(env,session.user.id,requestId,action,save=>{
        const credits=Math.max(0,Math.floor(Number(save.credits)||0)),inventory=save.caseInventory&&typeof save.caseInventory==='object'&&!Array.isArray(save.caseInventory)?save.caseInventory:(save.caseInventory={});
        if(action==='case_buy'){
          const cost=box.price*quantity,owned=Math.max(0,Math.floor(Number(inventory[caseId])||0));
          if(credits<cost)return {error:'INSUFFICIENT_CR'};if(owned+quantity>999)return {error:'CASE_LIMIT'};
          save.credits=credits-cost;inventory[caseId]=owned+quantity;return {status:'purchased',caseId,quantity,cost,remaining:inventory[caseId]};
        }
        const owned=Math.max(0,Math.floor(Number(inventory[caseId])||0)),count=Math.min(quantity,owned);if(count<1)return {error:'NO_CASES'};
          const opened=openCaseBatch(save,caseId,count);return opened.error?opened:{status:'opened',caseId,...opened};
      });
      if(result.error){const status=result.error==='INSUFFICIENT_CR'?409:result.error==='NO_CASES'?409:result.error==='SAVE_CONFLICT'?409:400;return json({error:result.error},status);}
      if(!result.replay){try{await writeGameLog(env,{category:action==='case_buy'?'purchases':'rewards',eventType:action,actorUserId:session.user.id,actorUsername:session.user.username,actorRole:session.user.isAdmin?'OWNER':'PLAYER',targetUserId:session.user.id,targetUsername:session.user.username,source:'SERVER_CASE_API',subject:box.name,amount:action==='case_buy'?-box.price*quantity:(result.result?.results||[]).reduce((sum,x)=>sum+(x.compensation||0),0),currency:'CR',metadata:{caseId,quantity,resultCount:result.result?.results?.length||0}});}catch(e){console.error('case economy log',e);}}
      return json(result);
    }
    if(url.pathname==='/api/auth/me'&&request.method==='GET'){
      const session=await currentSession(env,request);if(!session)return json({authenticated:false});
      const banned=await banResponse(env,session.user);if(banned)return banned;
      try{await settlePendingReferral(env,session.user.id);}catch(e){console.error('referral recovery',e);}
      const cloud=await saveRow(env,session.user.id);
      return json({authenticated:true,user:session.user,saveRevision:cloud.revision,saveUpdatedAt:cloud.updatedAt});
    }
    if(url.pathname==='/api/auth/register'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const b=await readBody(request),username=normalizeUsername(b?.username),displayName=normalizeDisplayName(b?.displayName),password=b?.password,inviterUsername=normalizeUsername(String(b?.inviterUsername||'').replace(/^@/,''));
      if(!validUsername(username))return json({error:'INVALID_USERNAME'},400);
      if(!validDisplayName(displayName))return json({error:'INVALID_DISPLAY_NAME'},400);
      if(!validPassword(password))return json({error:'INVALID_PASSWORD'},400);
      if(inviterUsername&&!validUsername(inviterUsername))return json({error:'INVALID_INVITER'},400);
      if(inviterUsername===username&&inviterUsername)return json({error:'CANNOT_INVITE_SELF'},400);
      const exists=await env.DB.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();
      if(exists)return json({error:'USERNAME_TAKEN'},409);
      const inviter=inviterUsername?await env.DB.prepare('SELECT id,username,created_at FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(inviterUsername).first():null;
      if(inviterUsername&&!inviter)return json({error:'INVITER_NOT_FOUND'},404);
      const id=crypto.randomUUID(),salt=randomBytes(16),hash=await passwordHash(password,salt),t=now(),signals=await registrationSignals(request,b?.deviceId);
      try{
        await env.DB.prepare('INSERT INTO users (id,username,display_name,password_hash,password_salt,password_iterations,created_at,updated_at,last_login_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(id,username,displayName,hash,b64url(salt),PASSWORD_ITERATIONS,t,t,t).run();
      }catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return json({error:'USERNAME_TAKEN'},409);throw e;}
      await env.DB.prepare('INSERT OR REPLACE INTO user_registration_signals (user_id,network_hash,device_hash,created_at) VALUES (?,?,?,?)').bind(id,signals.networkHash||null,signals.deviceHash||null,t).run();
      // A new account starts from the server-defined baseline. Never bootstrap
      // credits, items, levels, or completion state from a client snapshot.
      await writeSave(env,id,defaultSave());
      let referral={provided:false,rewarded:false,rewardCredits:0,inviterLevel:0,inviteeReward:{credits:0,cases:{}},reason:''};if(inviter){try{referral=await processReferral(env,{invitedUserId:id,inviter,signals,t});}catch(e){console.error('referral error',e);referral={provided:true,rewarded:false,rewardCredits:0,inviterLevel:0,inviteeReward:{credits:0,cases:{}},reason:'PROCESSING_ERROR'};}}
      const session=await createSession(env,request,id);
      return json({ok:true,user:adminUser({id,username,displayName,createdAt:t}),referral},201,{'set-cookie':sessionCookie(request,session.raw)});
    }
    if(url.pathname==='/api/auth/login'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const b=await readBody(request),username=normalizeUsername(b?.username),password=b?.password;
      if(!validUsername(username)||!validPassword(password))return json({error:'INVALID_CREDENTIALS'},401);
      const row=await env.DB.prepare('SELECT id,username,display_name,password_hash,password_salt,password_iterations,created_at FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();
      if(!row)return json({error:'INVALID_CREDENTIALS'},401);
      const hash=await passwordHash(password,decodeB64url(row.password_salt),Number(row.password_iterations)||PASSWORD_ITERATIONS);
      if(hash!==row.password_hash)return json({error:'INVALID_CREDENTIALS'},401);
      const user=adminUser({id:row.id,username:row.username,displayName:row.display_name,createdAt:Number(row.created_at)||0});
      if(!user.isAdmin&&(await settings(env)).maintenance)return json({error:'MAINTENANCE'},503);
      const banned=await banResponse(env,user);if(banned)return banned;
      const t=now();await env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').bind(t,t,row.id).run();
      const session=await createSession(env,request,row.id);
      return json({ok:true,user},200,{'set-cookie':sessionCookie(request,session.raw)});
    }
    if(url.pathname==='/api/auth/logout'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const session=await currentSession(env,request);if(session){await env.DB.prepare('DELETE FROM admin_unlocks WHERE session_token_hash=?').bind(session.hash).run();await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.hash).run();}
      return json({ok:true},200,{'set-cookie':sessionCookie(request,'',0)});
    }
    if(url.pathname==='/api/account/save'&&request.method==='GET'){
      const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
      return json({ok:true,...await saveRow(env,session.user.id)});
    }
    if(url.pathname==='/api/account/save'&&(request.method==='PUT'||request.method==='POST')){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
      const b=await readBody(request),before=await saveRow(env,session.user.id);
      if(b&&Object.hasOwn(b,'save'))return json({error:'CLIENT_UPDATE_REQUIRED',updateRequired:true,save:before.save,revision:before.revision},409);
      if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['preferences','revision'].includes(k)))return json({error:'SERVER_STATE_ONLY'},400);
      let preferences;try{preferences=validatePreferences(b.preferences);}catch(e){return json({error:e.message},400);}
      if(!Number.isSafeInteger(b.revision)||b.revision<0)return json({error:'INVALID_REVISION'},400);
      if(b.revision!==before.revision)return json({error:'SAVE_CONFLICT',save:before.save,revision:before.revision,updatedAt:before.updatedAt},409);
      const next={...(before.save||defaultSave()),...preferences},result=await writeSave(env,session.user.id,next,b.revision);
      if(!result.ok)return json({error:result.error,save:result.save??null,revision:result.revision||0,updatedAt:result.updatedAt||0},result.error==='SAVE_CONFLICT'?409:400);
      return json({ok:true,...await saveRow(env,session.user.id)});
    }
    return json({error:'NOT_FOUND'},404);
  }catch(e){
    if(e?.message==='REQUEST_TOO_LARGE')return json({error:'REQUEST_TOO_LARGE'},413);
    console.error('auth error',e);return json({error:'SERVER_ERROR'},500);
  }
}

export {currentSession,requireAdmin,ensureAdminSchema,ensureRewardSchema,ensureSocialSchema,accountDetail,audit,mutateTargetSave,banResponse,REFERRAL_LEVELS,readBody,processReferral,settlePendingReferral};
