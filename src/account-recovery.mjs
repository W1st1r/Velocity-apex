const encoder=new TextEncoder();
const TOKEN_TTL=20*60*1000;
const HOUR=60*60*1000;
const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const validEmail=value=>typeof value==='string'&&value.length<=254&&emailPattern.test(value)&&value.split('@')[0].length<=64;
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const tokenValue=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const tokenHash=async value=>tokenValue(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const safeText=value=>String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function mailConfigured(env){return typeof env.RESEND_API_KEY==='string'&&env.RESEND_API_KEY.startsWith('re_')&&typeof env.EMAIL_FROM==='string'&&env.EMAIL_FROM.includes('@');}
function appOrigin(env){try{const u=new URL(env.PUBLIC_APP_ORIGIN||'https://velocity-apex.maximmanzha20.workers.dev');return u.protocol==='https:'?u.origin:'';}catch{return'';}}
function emailMarkup({title,name,button,url,notice}){return `<!doctype html><html><body style="margin:0;background:#080c12;color:#eef3fa;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080c12;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#111923;border:1px solid #263343;border-radius:16px"><tr><td style="padding:30px 28px"><div style="font-size:12px;letter-spacing:3px;color:#b9ff43;font-weight:bold">VELOCITY APEX</div><h1 style="font-size:26px;line-height:1.2;margin:24px 0 12px;color:#fff">${safeText(title)}</h1><p style="font-size:16px;line-height:1.6;color:#d2dae5">Привет, ${safeText(name)}.</p><p style="font-size:15px;line-height:1.6;color:#d2dae5">${safeText(notice)}</p><p style="margin:28px 0"><a href="${safeText(url)}" style="display:inline-block;background:#b9ff43;color:#111923;text-decoration:none;font-weight:bold;letter-spacing:1px;padding:15px 22px;border-radius:8px">${safeText(button)}</a></p><p style="font-size:13px;line-height:1.6;color:#9ba8b8">Ссылка действует 20 минут и может быть использована один раз. Если запрос сделали не вы, ничего делать не нужно.</p><p style="font-size:12px;word-break:break-all;color:#8794a4">${safeText(url)}</p></td></tr></table></td></tr></table></body></html>`;}
async function sendMail(env,{to,subject,html,text}){if(!mailConfigured(env))return false;try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject,html,text})});return response.ok;}catch{return false;}}
async function audit(env,userId,event){try{await env.DB.prepare('INSERT INTO account_security_events(user_id,event_type,created_at) VALUES(?,?,?)').bind(userId||null,event,Date.now()).run();}catch{}}
async function rateAllowed(env,request,key,limit){const ip=request.headers.get('CF-Connecting-IP')||'unknown';const ua=(request.headers.get('user-agent')||'').slice(0,160);const bucketHash=await tokenHash(ip+'|'+ua+'|'+key);const t=Date.now(),windowStart=Math.floor(t/HOUR)*HOUR;const row=await env.DB.prepare('INSERT INTO account_recovery_limits(bucket_hash,window_start,hits) VALUES(?,?,1) ON CONFLICT(bucket_hash,window_start) DO UPDATE SET hits=hits+1 RETURNING hits').bind(bucketHash,windowStart).first();if(Math.random()<0.02)await env.DB.prepare('DELETE FROM account_recovery_limits WHERE window_start<?').bind(windowStart-24*HOUR).run();return Number(row?.hits||0)<=limit;}
function freshToken(auth){return tokenValue(auth.randomBytes(32));}
async function createToken(env,auth,{userId,kind,email}){const raw=freshToken(auth),hash=await tokenHash(raw),t=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM account_recovery_tokens WHERE user_id=? AND token_kind=? AND consumed_at IS NULL').bind(userId,kind),env.DB.prepare('INSERT INTO account_recovery_tokens(token_hash,user_id,token_kind,pending_email,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(hash,userId,kind,email||null,t,t+TOKEN_TTL)]);return raw;}
function link(env,path,token){const origin=appOrigin(env);return origin?origin+path+'#'+encodeURIComponent(token):'';}
export async function startEmailVerificationForUser(env,auth,{userId,email,username,request}){
  if(!mailConfigured(env)||!validEmail(email)||!appOrigin(env))return false;
  if(request&&!await rateAllowed(env,request,'verify:'+userId,3))return false;
  const normalized=normalizeEmail(email);const raw=await createToken(env,auth,{userId,kind:'verify_email',email:normalized});const url=link(env,'/account-recovery.html?mode=verify',raw);
  if(!url)return false;
  const html=emailMarkup({title:'ПОДТВЕРЖДЕНИЕ EMAIL',name:username,button:'ПОДТВЕРДИТЬ EMAIL',url,notice:'Подтвердите адрес, чтобы использовать его для восстановления доступа.'});
  const sent=await sendMail(env,{to:normalized,subject:'Подтвердите email — Velocity Apex',html,text:`Подтвердите email для аккаунта ${username}: ${url}\nСсылка действует 20 минут.`});
  if(!sent)await env.DB.prepare('DELETE FROM account_recovery_tokens WHERE token_hash=?').bind(await tokenHash(raw)).run();
  return sent;
}
export async function handleEmailRecoveryRequest(request,env,url,auth){
  const path=url.pathname;
  if(!['/api/auth/email/status','/api/auth/email/start','/api/auth/email/verify','/api/auth/password/recovery','/api/auth/password/reset'].includes(path))return null;
  if(path==='/api/auth/email/status'){
    if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
    const session=await auth.currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await auth.banResponse(env,session.user);if(banned)return banned;
    const row=await env.DB.prepare('SELECT email,email_verified_at FROM users WHERE id=?').bind(session.user.id).first();
    const email=row?.email?String(row.email):'',masked=email?email.replace(/^(.).+(@.+)$/,'$1•••$2'):'';
    return json({email:masked,verified:!!row?.email_verified_at});
  }
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!auth.sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
  let body;try{body=await auth.readBody(request);}catch{return json({error:'INVALID_REQUEST'},400);}
  const t=Date.now();
  if(path==='/api/auth/email/start'){
    const session=await auth.currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await auth.banResponse(env,session.user);if(banned)return banned;
    const email=normalizeEmail(body?.email),password=body?.password;if(!validEmail(email)||!auth.validPassword(password))return json({error:'INVALID_EMAIL_OR_PASSWORD'},400);
    if(!mailConfigured(env))return json({error:'EMAIL_NOT_CONFIGURED'},503);
    if(!await rateAllowed(env,request,'verify:'+session.user.id,3))return json({error:'RATE_LIMITED'},429);
    const user=await env.DB.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').bind(session.user.id).first();if(!user)return json({error:'AUTH_REQUIRED'},401);
    const pass=await auth.passwordHash(password,auth.decodeB64url(user.password_salt),Number(user.password_iterations)||100000);if(pass!==user.password_hash)return json({error:'INVALID_EMAIL_OR_PASSWORD'},401);
    const raw=await createToken(env,auth,{userId:session.user.id,kind:'verify_email',email}),target=link(env,'/email-verify.html',raw);
    const html=emailMarkup({title:'ПОДТВЕРЖДЕНИЕ EMAIL',name:session.user.displayName||session.user.username,button:'ПОДТВЕРДИТЬ EMAIL',url:target,notice:'Подтвердите новый адрес, чтобы использовать его для восстановления доступа.'});
    const sent=await sendMail(env,{to:email,subject:'Подтвердите email — Velocity Apex',html,text:`Подтвердите адрес аккаунта ${session.user.username}: ${target}\nСсылка действует 20 минут.`});
    if(!sent){await env.DB.prepare('DELETE FROM account_recovery_tokens WHERE token_hash=?').bind(await tokenHash(raw)).run();return json({error:'EMAIL_DELIVERY_FAILED'},502);}
    await audit(env,session.user.id,'email_verification_requested');return json({ok:true,message:'Письмо с подтверждением отправлено, если адрес доступен.'});
  }
  if(path==='/api/auth/email/verify'){
    const raw=String(body?.token||'');if(!/^[A-Za-z0-9_-]{43}$/.test(raw))return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    const hash=await tokenHash(raw);const token=await env.DB.prepare('SELECT user_id,pending_email,expires_at,consumed_at FROM account_recovery_tokens WHERE token_hash=? AND token_kind=?').bind(hash,'verify_email').first();
    if(!token||token.consumed_at||Number(token.expires_at)<=t||!validEmail(token.pending_email))return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    if(!await rateAllowed(env,request,'verify-token:'+hash,8))return json({error:'RATE_LIMITED'},429);
    const user=await env.DB.prepare('SELECT id,username FROM users WHERE id=?').bind(token.user_id).first();if(!user)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
    const results=await env.DB.batch([
      env.DB.prepare('UPDATE users SET email=?,email_verified_at=?,updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM users WHERE email=? COLLATE NOCASE AND email_verified_at IS NOT NULL AND id<>?)').bind(token.pending_email,t,t,user.id,token.pending_email,user.id),
      env.DB.prepare('UPDATE account_recovery_tokens SET consumed_at=? WHERE token_hash=? AND token_kind=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=? COLLATE NOCASE AND email_verified_at=?)').bind(t,hash,'verify_email',t,user.id,token.pending_email,t)
    ]);
    if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:'EMAIL_ALREADY_IN_USE_OR_EXPIRED'},409);
    await env.DB.prepare('DELETE FROM account_recovery_tokens WHERE user_id=? AND token_kind=? AND token_hash<>?').bind(user.id,'verify_email',hash).run();await audit(env,user.id,'email_verified');return json({ok:true});
  }
  if(path==='/api/auth/password/recovery'){
    const identifier=String(body?.identifier||'').trim().slice(0,254);if(!identifier)return json({ok:true,message:'Если для аккаунта есть подтвержденный email, инструкция отправлена.'});
    const allowed=await rateAllowed(env,request,'recovery:'+identifier.toLowerCase(),5);if(!allowed)return json({ok:true,message:'Если для аккаунта есть подтвержденный email, инструкция отправлена.'});
    const user=await env.DB.prepare('SELECT id,username,email FROM users WHERE (username=? COLLATE NOCASE OR (email=? COLLATE NOCASE AND email_verified_at IS NOT NULL)) LIMIT 1').bind(identifier,normalizeEmail(identifier)).first();
    if(user&&user.email&&mailConfigured(env)&&await auth.canRecover(env,user.id)){
      const raw=await createToken(env,auth,{userId:user.id,kind:'password_reset'}),target=link(env,'/account-recovery.html?mode=reset',raw);
      const html=emailMarkup({title:'ВОССТАНОВЛЕНИЕ ДОСТУПА',name:user.username,button:'СМЕНИТЬ ПАРОЛЬ',url:target,notice:'Получен запрос на смену пароля для вашего аккаунта.'});
      const sent=await sendMail(env,{to:user.email,subject:'Восстановление доступа — Velocity Apex',html,text:`Смена пароля аккаунта ${user.username}: ${target}\nСсылка действует 20 минут.`});
      if(!sent)await env.DB.prepare('DELETE FROM account_recovery_tokens WHERE token_hash=?').bind(await tokenHash(raw)).run();else await audit(env,user.id,'password_recovery_requested');
    }
    return json({ok:true,message:'Если для аккаунта есть подтвержденный email, инструкция отправлена.'});
  }
  const raw=String(body?.token||''),password=body?.password;if(!/^[A-Za-z0-9_-]{43}$/.test(raw)||!auth.validPassword(password))return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
  const hash=await tokenHash(raw),token=await env.DB.prepare('SELECT user_id,expires_at,consumed_at FROM account_recovery_tokens WHERE token_hash=? AND token_kind=?').bind(hash,'password_reset').first();
  if(!token||token.consumed_at||Number(token.expires_at)<=t)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
  if(!await rateAllowed(env,request,'reset:'+hash,6))return json({error:'RATE_LIMITED'},429);
  const user=await env.DB.prepare('SELECT id,username FROM users WHERE id=?').bind(token.user_id).first();if(!user)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
  const banned=await auth.banResponse(env,user);if(banned)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
  const salt=auth.randomBytes(16),passwordHash=await auth.passwordHash(password,salt),encodedSalt=tokenValue(salt);
  const results=await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=100000,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM account_recovery_tokens WHERE token_hash=? AND token_kind=? AND consumed_at IS NULL AND expires_at>?)').bind(passwordHash,encodedSalt,t,user.id,hash,'password_reset',t),
    env.DB.prepare('UPDATE account_recovery_tokens SET consumed_at=? WHERE token_hash=? AND token_kind=? AND consumed_at IS NULL AND expires_at>?').bind(t,hash,'password_reset',t),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND changes()=1').bind(user.id)
  ]);
  if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:'INVALID_OR_EXPIRED_TOKEN'},400);
  await env.DB.prepare('DELETE FROM account_recovery_tokens WHERE user_id=? AND token_kind=?').bind(user.id,'password_reset').run();await audit(env,user.id,'password_reset_completed');
  const changedAt=new Date(t).toISOString();const html=`<!doctype html><html><body style="margin:0;background:#080c12;color:#eef3fa;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" style="max-width:600px;background:#111923;padding:28px;border:1px solid #263343;border-radius:16px"><tr><td><strong style="color:#b9ff43;letter-spacing:3px">VELOCITY APEX</strong><h1>ПАРОЛЬ ИЗМЕНЁН</h1><p>Пароль аккаунта ${safeText(user.username)} изменён ${safeText(changedAt)} UTC.</p><p>Если это сделали не вы, немедленно обратитесь в поддержку.</p></td></tr></table></td></tr></table></body></html>`;
  const account=await env.DB.prepare('SELECT email FROM users WHERE id=? AND email_verified_at IS NOT NULL').bind(user.id).first();if(account?.email)await sendMail(env,{to:account.email,subject:'Пароль изменён — Velocity Apex',html,text:`Пароль аккаунта изменён ${changedAt} UTC. Если изменение не ваше, обратитесь в поддержку.`});
  return json({ok:true});
}
