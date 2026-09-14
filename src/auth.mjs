const SESSION_COOKIE='va_session';
const SESSION_TTL_MS=30*24*60*60*1000;
const PASSWORD_ITERATIONS=210000;
const SAVE_LIMIT_BYTES=64*1024;
const enc=new TextEncoder();

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const now=()=>Date.now();
const b64url=bytes=>{
  let s='';for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const randomBytes=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return a;};
const sha256=async value=>b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value)));
const normalizeUsername=v=>String(v||'').trim().toLowerCase();
const validUsername=v=>/^[a-z0-9_]{3,24}$/.test(v);
const normalizeDisplayName=v=>String(v||'').trim().replace(/\s+/g,' ');
const validDisplayName=v=>v.length>=2&&v.length<=24&&/^[\p{L}\p{N}_\- .]+$/u.test(v)&&!/[<>"'`\\/]/.test(v);
const validPassword=v=>typeof v==='string'&&v.length>=8&&v.length<=128;

function cookieValue(request,name){
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());}
  return '';
}
function sessionCookie(request,value,maxAge=Math.floor(SESSION_TTL_MS/1000)){
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}
function sameOrigin(request){
  const origin=request.headers.get('origin');
  return !origin||origin===new URL(request.url).origin;
}
async function readBody(request){
  const len=Number(request.headers.get('content-length')||0);if(len>SAVE_LIMIT_BYTES+8192)throw new Error('REQUEST_TOO_LARGE');
  return request.json();
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
  return {hash,user:{id:row.user_id,username:row.username,displayName:row.display_name,createdAt:Number(row.created_at)||0}};
}
async function saveRow(env,userId){
  const row=await env.DB.prepare('SELECT save_json,revision,updated_at FROM player_saves WHERE user_id=? LIMIT 1').bind(userId).first();
  if(!row)return {save:null,revision:0,updatedAt:0};
  let save=null;try{save=JSON.parse(row.save_json);}catch{}
  return {save,revision:Number(row.revision)||0,updatedAt:Number(row.updated_at)||0};
}
async function writeSave(env,userId,raw){
  const text=safeSave(raw);if(!text)return {ok:false,error:'INVALID_SAVE'};
  const t=now();
  await env.DB.prepare(`INSERT INTO player_saves (user_id,save_json,revision,created_at,updated_at)
    VALUES (?,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET save_json=excluded.save_json,revision=player_saves.revision+1,updated_at=excluded.updated_at`)
    .bind(userId,text,t,t).run();
  const row=await env.DB.prepare('SELECT revision,updated_at FROM player_saves WHERE user_id=?').bind(userId).first();
  return {ok:true,revision:Number(row?.revision)||1,updatedAt:Number(row?.updated_at)||t};
}

export async function handleAuthRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/account/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    if(url.pathname==='/api/auth/me'&&request.method==='GET'){
      const session=await currentSession(env,request);if(!session)return json({authenticated:false});
      return json({authenticated:true,user:session.user});
    }
    if(url.pathname==='/api/auth/register'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const b=await readBody(request),username=normalizeUsername(b?.username),displayName=normalizeDisplayName(b?.displayName),password=b?.password;
      if(!validUsername(username))return json({error:'INVALID_USERNAME'},400);
      if(!validDisplayName(displayName))return json({error:'INVALID_DISPLAY_NAME'},400);
      if(!validPassword(password))return json({error:'INVALID_PASSWORD'},400);
      const exists=await env.DB.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();
      if(exists)return json({error:'USERNAME_TAKEN'},409);
      const id=crypto.randomUUID(),salt=randomBytes(16),hash=await passwordHash(password,salt),t=now();
      try{
        await env.DB.prepare('INSERT INTO users (id,username,display_name,password_hash,password_salt,password_iterations,created_at,updated_at,last_login_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(id,username,displayName,hash,b64url(salt),PASSWORD_ITERATIONS,t,t,t).run();
      }catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return json({error:'USERNAME_TAKEN'},409);throw e;}
      if(b?.save&&safeSave(b.save))await writeSave(env,id,b.save);
      const session=await createSession(env,request,id);
      return json({ok:true,user:{id,username,displayName,createdAt:t}},201,{'set-cookie':sessionCookie(request,session.raw)});
    }
    if(url.pathname==='/api/auth/login'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const b=await readBody(request),username=normalizeUsername(b?.username),password=b?.password;
      if(!validUsername(username)||!validPassword(password))return json({error:'INVALID_CREDENTIALS'},401);
      const row=await env.DB.prepare('SELECT id,username,display_name,password_hash,password_salt,password_iterations,created_at FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();
      if(!row)return json({error:'INVALID_CREDENTIALS'},401);
      const hash=await passwordHash(password,decodeB64url(row.password_salt),Number(row.password_iterations)||PASSWORD_ITERATIONS);
      if(hash!==row.password_hash)return json({error:'INVALID_CREDENTIALS'},401);
      const t=now();await env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').bind(t,t,row.id).run();
      const session=await createSession(env,request,row.id);
      return json({ok:true,user:{id:row.id,username:row.username,displayName:row.display_name,createdAt:Number(row.created_at)||0}},200,{'set-cookie':sessionCookie(request,session.raw)});
    }
    if(url.pathname==='/api/auth/logout'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const session=await currentSession(env,request);if(session)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.hash).run();
      return json({ok:true},200,{'set-cookie':sessionCookie(request,'',0)});
    }
    if(url.pathname==='/api/account/save'&&request.method==='GET'){
      const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);
      return json({ok:true,...await saveRow(env,session.user.id)});
    }
    if(url.pathname==='/api/account/save'&&(request.method==='PUT'||request.method==='POST')){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
      const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);
      const b=await readBody(request),result=await writeSave(env,session.user.id,b?.save);
      if(!result.ok)return json({error:result.error},400);return json(result);
    }
    return json({error:'NOT_FOUND'},404);
  }catch(e){
    if(e?.message==='REQUEST_TOO_LARGE')return json({error:'REQUEST_TOO_LARGE'},413);
    console.error('auth error',e);return json({error:'SERVER_ERROR'},500);
  }
}
