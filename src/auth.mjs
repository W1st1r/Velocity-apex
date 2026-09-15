const SESSION_COOKIE='va_session';
const SESSION_TTL_MS=30*24*60*60*1000;
const PASSWORD_ITERATIONS=100000;
const SAVE_LIMIT_BYTES=64*1024;
const ADMIN_USERNAME='w1st1r';
const ADMIN_PASSWORD_SHA256='dxEnsDF2QSbEDOepP2HFM_okaUwBB-fBg8fC90XrmIA';
const ADMIN_UNLOCK_TTL_MS=30*60*1000;
const ADMIN_MAX_BAN_MS=365*24*60*60*1000;
const ADMIN_MAX_CREDITS=999999999;
const REFERRAL_REWARD_CREDITS=1500;
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
async function readBody(request){const len=Number(request.headers.get('content-length')||0);if(len>SAVE_LIMIT_BYTES+8192)throw new Error('REQUEST_TOO_LARGE');return request.json();}
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
  await env.DB.prepare('INSERT INTO admin_audit (admin_user_id,target_user_id,action,details,created_at) VALUES (?,?,?,?,?)').bind(adminId,targetId||null,action,text,now()).run();
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
async function processReferral(env,{invitedUserId,inviter,signals,t}){
  let reason='',rewarded=false;
  if(!inviter)return {provided:false,rewarded:false,rewardCredits:0,reason:''};
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
  if(!reason){
    const changed=await mutateTargetSave(env,inviter.id,save=>{const before=Math.max(0,Math.floor(Number(save.credits)||0)),after=Math.min(ADMIN_MAX_CREDITS,before+REFERRAL_REWARD_CREDITS);save.credits=after;return {before,after,delta:after-before};});
    if(changed.ok)rewarded=true;else reason='REWARD_WRITE_FAILED';
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO referrals (invited_user_id,inviter_user_id,status,reward_credits,reason,network_hash,device_hash,created_at,rewarded_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(invitedUserId,inviter.id,rewarded?'rewarded':'rejected',rewarded?REFERRAL_REWARD_CREDITS:0,reason,signals.networkHash||null,signals.deviceHash||null,t,rewarded?t:null).run();
  return {provided:true,rewarded,rewardCredits:rewarded?REFERRAL_REWARD_CREDITS:0,reason};
}
function promoPublic(row){let reward={};try{reward=JSON.parse(row.reward_json||'{}');}catch{}const t=now();return {id:row.id,code:row.code,title:row.title||'',reward,maxUses:Number(row.max_uses)||0,usesCount:Number(row.uses_count)||0,startsAt:Number(row.starts_at)||0,expiresAt:Number(row.expires_at)||0,enabled:!!row.enabled,active:!!row.enabled&&Number(row.starts_at)<=t&&(!Number(row.expires_at)||Number(row.expires_at)>t),createdAt:Number(row.created_at)||0,updatedAt:Number(row.updated_at)||0};}
async function handlePromoRequest(request,env,url){
  await ensureRewardSchema(env);if(!sameOrigin(request)&&request.method!=='GET')return json({error:'ORIGIN_REJECTED'},403);
  const access=await requireUser(env,request);if(access.error)return access.error;
  if(url.pathname==='/api/promocodes/redeem'&&request.method==='POST'){
    const b=await readBody(request),code=normalizePromoCode(b?.code);if(!validPromoCode(code))return json({error:'PROMO_INVALID'},400);
    const promo=await env.DB.prepare('SELECT * FROM promo_codes WHERE code=? COLLATE NOCASE LIMIT 1').bind(code).first();if(!promo)return json({error:'PROMO_NOT_FOUND'},404);
    const t=now();if(!promo.enabled)return json({error:'PROMO_DISABLED'},409);if(Number(promo.starts_at)>t)return json({error:'PROMO_NOT_STARTED'},409);if(Number(promo.expires_at)>0&&Number(promo.expires_at)<=t)return json({error:'PROMO_EXPIRED'},409);
    const prior=await env.DB.prepare('SELECT redeemed_at FROM promo_redemptions WHERE promo_id=? AND user_id=? LIMIT 1').bind(promo.id,access.session.user.id).first();if(prior)return json({error:'PROMO_ALREADY_USED',redeemedAt:Number(prior.redeemed_at)||0},409);
    const reward=normalizePromoReward(JSON.parse(promo.reward_json||'{}'));if(!reward)return json({error:'PROMO_REWARD_INVALID'},500);
    const reserved=await env.DB.prepare(`UPDATE promo_codes SET uses_count=uses_count+1,updated_at=? WHERE id=? AND enabled=1 AND starts_at<=? AND (expires_at=0 OR expires_at>?) AND (max_uses=0 OR uses_count<max_uses)`).bind(t,promo.id,t,t).run();
    if(Number(reserved?.meta?.changes||0)!==1)return json({error:'PROMO_LIMIT_REACHED'},409);
    const redemptionId=crypto.randomUUID();
    try{await env.DB.prepare('INSERT INTO promo_redemptions (id,promo_id,user_id,reward_json,redeemed_at) VALUES (?,?,?,?,?)').bind(redemptionId,promo.id,access.session.user.id,JSON.stringify(reward),t).run();}
    catch(e){await env.DB.prepare('UPDATE promo_codes SET uses_count=MAX(0,uses_count-1),updated_at=? WHERE id=?').bind(now(),promo.id).run();return json({error:'PROMO_ALREADY_USED'},409);}
    const changed=await mutateTargetSave(env,access.session.user.id,save=>applyPromoReward(save,reward));
    if(changed.error){await env.DB.batch([env.DB.prepare('DELETE FROM promo_redemptions WHERE id=?').bind(redemptionId),env.DB.prepare('UPDATE promo_codes SET uses_count=MAX(0,uses_count-1),updated_at=? WHERE id=?').bind(now(),promo.id)]);return json({error:changed.error},changed.error==='SAVE_CONFLICT'?409:500);}
    return json({ok:true,code:promo.code,title:promo.title||'',reward,result:changed.result,revision:changed.revision,updatedAt:changed.updatedAt});
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

export async function handleAuthRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/account/')&&!url.pathname.startsWith('/api/admin/')&&!url.pathname.startsWith('/api/friends')&&!url.pathname.startsWith('/api/promocodes/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    await ensureAdminSchema(env);await ensureRewardSchema(env);
    if(url.pathname.startsWith('/api/promocodes/'))return handlePromoRequest(request,env,url);
    if(url.pathname.startsWith('/api/friends'))return handleFriendsRequest(request,env,url);
    if(url.pathname.startsWith('/api/admin/'))return handleAdminRequest(request,env,url);
    if(url.pathname==='/api/auth/me'&&request.method==='GET'){
      const session=await currentSession(env,request);if(!session)return json({authenticated:false});
      const banned=await banResponse(env,session.user);if(banned)return banned;
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
      if(b?.save&&safeSave(b.save))await writeSave(env,id,b.save);
      let referral={provided:false,rewarded:false,rewardCredits:0,reason:''};if(inviter){try{referral=await processReferral(env,{invitedUserId:id,inviter,signals,t});}catch(e){console.error('referral error',e);referral={provided:true,rewarded:false,rewardCredits:0,reason:'PROCESSING_ERROR'};}}
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
      const b=await readBody(request),expectedRevision=Number.isInteger(b?.revision)?b.revision:null,result=await writeSave(env,session.user.id,b?.save,expectedRevision);
      if(!result.ok)return json({error:result.error,save:result.save??null,revision:result.revision||0,updatedAt:result.updatedAt||0},result.error==='SAVE_CONFLICT'?409:400);return json(result);
    }
    return json({error:'NOT_FOUND'},404);
  }catch(e){
    if(e?.message==='REQUEST_TOO_LARGE')return json({error:'REQUEST_TOO_LARGE'},413);
    console.error('auth error',e);return json({error:'SERVER_ERROR'},500);
  }
}
