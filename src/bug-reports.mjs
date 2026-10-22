import {currentSession,requireAdmin,banResponse} from './auth.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(v,n)=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,n);
const locations=new Set(['Главное меню','Гараж','Магазин','Карьера','Свободный режим','Онлайн','Кланы','Другое']);
const statuses=new Set(['new','in_progress','fixed','closed','rejected']);
const owner=(env,request)=>requireAdmin(env,request);
export function imageType(bytes){
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return '';
}
export function imageDimensions(b,mime){
  if(mime==='image/png'&&b.length>=24)return {w:(b[16]*0x1000000+b[17]*0x10000+b[18]*256+b[19])>>>0,h:(b[20]*0x1000000+b[21]*0x10000+b[22]*256+b[23])>>>0};
  if(mime==='image/webp'&&b.length>=30){const tag=String.fromCharCode(...b.slice(12,16));if(tag==='VP8X')return {w:1+b[24]+(b[25]<<8)+(b[26]<<16),h:1+b[27]+(b[28]<<8)+(b[29]<<16)};if(tag==='VP8L'&&b[20]===0x2f)return {w:1+b[21]+((b[22]&0x3f)<<8),h:1+(b[22]>>6)+(b[23]<<2)+((b[24]&0x0f)<<10)};if(tag==='VP8 '&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a)return {w:(b[26]|b[27]<<8)&0x3fff,h:(b[28]|b[29]<<8)&0x3fff};}
  if(mime==='image/jpeg'){let i=2;while(i+4<b.length){if(b[i++]!==0xff)continue;while(b[i]===0xff)i++;const marker=b[i++];if(marker===0xd9||marker===0xda)break;if(marker===0xd8||(marker>=0xd0&&marker<=0xd7))continue;const len=(b[i]<<8)|b[i+1];if(len<2||i+len>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {h:(b[i+3]<<8)|b[i+4],w:(b[i+5]<<8)|b[i+6]};i+=len;}}
  return null;
}
export function safeDiagnostics(raw){
  let d={};try{d=JSON.parse(String(raw||'{}').slice(0,2000));}catch{}
  const token=(x,re)=>{const s=String(x||'');return re.test(s)?s:'';};
  return {gameVersion:token(d.gameVersion,/^[A-Za-z0-9.-]{1,24}$/),build:token(d.build,/^[A-Za-z0-9.-]{1,64}$/),occurredAt:Number.isFinite(Number(d.occurredAt))?Math.min(Date.now(),Math.max(0,Number(d.occurredAt))):Date.now(),screen:token(d.screen,/^(menu|setup|career|garage|shop|online|friends|clans|free-roam|game|support)$/),device:token(d.device,/^(iPhone|iPad|Android|Macintosh|Windows|Linux)$/),browser:token(d.browser,/^(Safari|Chrome|Firefox|Edge|Other)$/),recentErrors:Array.isArray(d.recentErrors)?d.recentErrors.slice(-5).map(x=>token(x,/^[A-Za-z][A-Za-z0-9]{0,30}Error$/)).filter(Boolean):[]};
}
async function readReport(env,row,isOwner=false){
  const files=(await env.DB.prepare('SELECT id,mime_type,size_bytes FROM bug_report_attachments WHERE report_id=? ORDER BY created_at').bind(row.id).all()).results||[];
  const replies=(await env.DB.prepare("SELECT event_json,created_at FROM bug_report_events WHERE report_id=? AND event_type='reply_public' ORDER BY created_at").bind(row.id).all()).results||[];
  return {id:row.id,no:Number(row.report_no),playerId:row.reporter_user_id,username:row.username||'',title:row.title,description:row.description,steps:row.steps,location:row.location,diagnostics:JSON.parse(row.diagnostics_json||'{}'),status:row.status,...(isOwner?{internalComment:row.internal_comment||''}:{}),createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),attachments:files.map(x=>({id:x.id,mime:x.mime_type,size:Number(x.size_bytes)})),replies:replies.map(x=>({message:JSON.parse(x.event_json).message,createdAt:Number(x.created_at)}))};
}
function originOk(request){const o=request.headers.get('origin');return !o||o===new URL(request.url).origin;}
export async function handleBugReportRequest(request,env,url=new URL(request.url),ctx=null){
  if(url.pathname!=='/api/bugs'&&!url.pathname.startsWith('/api/bugs/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  if(request.method!=='GET'&&!originOk(request))return json({error:'ORIGIN_REJECTED'},403);
  const me=await currentSession(env,request);if(!me)return json({error:'AUTH_REQUIRED'},401);
  const banned=await banResponse(env,me.user);if(banned)return banned;
  if(url.pathname==='/api/bugs/mine'&&request.method==='GET'){
    const rows=(await env.DB.prepare('SELECT * FROM bug_reports WHERE reporter_user_id=? ORDER BY created_at DESC LIMIT 50').bind(me.user.id).all()).results||[];
    return json({ok:true,reports:await Promise.all(rows.map(r=>readReport(env,r)))});
  }
  if(url.pathname==='/api/bugs'&&request.method==='POST'){
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))return json({error:'MULTIPART_REQUIRED'},415);
    const length=Number(request.headers.get('content-length')||0);if(length>11*1024*1024)return json({error:'REQUEST_TOO_LARGE'},413);
    let form;try{form=await request.formData();}catch{return json({error:'INVALID_FORM'},400);}
    const clientId=clean(form.get('requestId'),64),title=clean(form.get('title'),100),description=clean(form.get('description'),4000),steps=clean(form.get('steps'),2000),location=clean(form.get('location'),40);
    if(!/^[a-f0-9-]{30,64}$/i.test(clientId))return json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
    if(title.length<4||description.length<10)return json({error:'TITLE_AND_DESCRIPTION_REQUIRED'},400);
    if(!locations.has(location))return json({error:'INVALID_LOCATION'},400);
    const prior=await env.DB.prepare('SELECT * FROM bug_reports WHERE reporter_user_id=? AND client_request_id=?').bind(me.user.id,clientId).first();if(prior)return json({ok:true,replay:true,report:await readReport(env,prior)});
    const t=Date.now(),windowStart=Math.floor(t/86400000)*86400000;
    const files=form.getAll('attachments').filter(f=>f&&typeof f.arrayBuffer==='function');if(files.length>5)return json({error:'TOO_MANY_ATTACHMENTS'},413);
    if(files.length&&!env.BUG_REPORTS_BUCKET)return json({error:'ATTACHMENTS_NOT_CONFIGURED'},503);
    const prepared=[];
    for(const file of files){
      if(file.size<1||file.size>2*1024*1024)return json({error:'ATTACHMENT_TOO_LARGE'},413);
      const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageType(bytes),dimensions=mime&&imageDimensions(bytes,mime);if(!mime||file.type!==mime||!dimensions?.w||!dimensions?.h||dimensions.w*dimensions.h>40000000)return json({error:'INVALID_IMAGE'},415);
      const key=`bug-reports/${me.user.id}/${crypto.randomUUID()}`;prepared.push({key,mime,bytes});
    }
    if(prepared.reduce((n,f)=>n+f.bytes.length,0)>10*1024*1024)return json({error:'REQUEST_TOO_LARGE'},413);
    await env.DB.batch([env.DB.prepare('DELETE FROM bug_report_rate_limits WHERE window_start<?').bind(windowStart),env.DB.prepare('DELETE FROM bug_report_ip_rate_limits WHERE window_start<?').bind(windowStart)]);
    const rate=await env.DB.prepare(`INSERT INTO bug_report_rate_limits(user_id,window_start,request_count) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET request_count=request_count+1 WHERE request_count<3`).bind(me.user.id,windowStart).run();if(Number(rate?.meta?.changes||0)!==1)return json({error:'RATE_LIMITED'},429);
    const ip=request.headers.get('cf-connecting-ip')||'';if(ip){const ipHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(x=>x.toString(16).padStart(2,'0')).join('');const ipRate=await env.DB.prepare('INSERT INTO bug_report_ip_rate_limits(ip_hash,window_start,request_count) VALUES(?,?,1) ON CONFLICT(ip_hash,window_start) DO UPDATE SET request_count=request_count+1 WHERE request_count<5').bind(ipHash,windowStart).run();if(Number(ipRate?.meta?.changes||0)!==1)return json({error:'RATE_LIMITED'},429);}
    const id=crypto.randomUUID(),diagnostics=safeDiagnostics(form.get('diagnostics'));
    const stored=[];let dbCommitted=false;
    try{
      for(const f of prepared){await env.BUG_REPORTS_BUCKET.put(f.key,f.bytes,{httpMetadata:{contentType:f.mime,cacheControl:'private, no-store'}});stored.push(f.key);}
      const writes=await env.DB.batch([
        env.DB.prepare(`INSERT INTO bug_reports(id,reporter_user_id,client_request_id,title,description,steps,location,diagnostics_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'new',?,?)`).bind(id,me.user.id,clientId,title,description,steps,location,JSON.stringify(diagnostics),t,t),
        env.DB.prepare("INSERT INTO bug_report_events(id,report_id,actor_user_id,event_type,event_json,created_at) VALUES(?,?,?,'created','{}',?)").bind(crypto.randomUUID(),id,me.user.id,t),
        ...prepared.map(f=>env.DB.prepare('INSERT INTO bug_report_attachments(id,report_id,object_key,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,f.key,f.mime,f.bytes.length,t))
      ]);
      const no=Number(writes?.[0]?.meta?.last_row_id)||0;
      dbCommitted=true;
      const row=await env.DB.prepare('SELECT * FROM bug_reports WHERE id=?').bind(id).first();if(env.BUG_REPORTS_TELEGRAM_BOT_TOKEN&&env.BUG_REPORTS_TELEGRAM_CHAT_ID&&env.PUBLIC_GAME_URL){const notice=`Velocity Apex bug report #${no}\n${title}\n${location} · ${diagnostics.gameVersion||'unknown'}\n${String(env.PUBLIC_GAME_URL).replace(/\/$/,'')}/#ownerAdminSystem`;ctx?.waitUntil?.(fetch(`https://api.telegram.org/bot${env.BUG_REPORTS_TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:env.BUG_REPORTS_TELEGRAM_CHAT_ID,text:notice,disable_web_page_preview:true})}).catch(()=>{}));}return json({ok:true,report:{...await readReport(env,{...row,report_no:no})}},201);
    }catch(e){if(!dbCommitted)for(const key of stored)try{await env.BUG_REPORTS_BUCKET.delete(key);}catch{};throw e;}
  }
  const mine=url.pathname.match(/^\/api\/bugs\/([0-9a-f-]{30,64})$/i);
  if(mine&&request.method==='GET'){const row=await env.DB.prepare('SELECT * FROM bug_reports WHERE id=? AND reporter_user_id=?').bind(mine[1],me.user.id).first();return row?json({ok:true,report:await readReport(env,row)}):json({error:'NOT_FOUND'},404);}
  const attachment=url.pathname.match(/^\/api\/bugs\/attachments\/([0-9a-f-]{30,64})$/i);
  if(attachment&&request.method==='GET'){
    const row=await env.DB.prepare('SELECT a.*,r.reporter_user_id FROM bug_report_attachments a JOIN bug_reports r ON r.id=a.report_id WHERE a.id=?').bind(attachment[1]).first();if(!row)return json({error:'NOT_FOUND'},404);
    const isOwner=await owner(env,request);if(isOwner.error&&row.reporter_user_id!==me.user.id)return json({error:'FORBIDDEN'},403);
    if(!env.BUG_REPORTS_BUCKET)return json({error:'ATTACHMENTS_NOT_CONFIGURED'},503);const obj=await env.BUG_REPORTS_BUCKET.get(row.object_key);if(!obj)return json({error:'NOT_FOUND'},404);
    return new Response(obj.body,{headers:{'content-type':row.mime_type,'cache-control':'private, no-store','content-disposition':'inline','x-content-type-options':'nosniff'}});
  }
  if(url.pathname==='/api/bugs/owner'&&request.method==='GET'){
    const access=await owner(env,request);if(access.error)return access.error;
    const status=url.searchParams.get('status')||'',category=url.searchParams.get('location')||'';
    const sinceText=url.searchParams.get('day')||'',since=/^\d{4}-\d{2}-\d{2}$/.test(sinceText)?Date.parse(sinceText+'T00:00:00Z'):0,player=url.searchParams.get('player')||'';
    const rows=(await env.DB.prepare(`SELECT b.*,u.username FROM bug_reports b JOIN users u ON u.id=b.reporter_user_id WHERE (?='' OR b.status=?) AND (?='' OR b.location=?) AND (?=0 OR b.created_at>=?) AND (?='' OR lower(u.username) LIKE lower('%'||?||'%')) ORDER BY b.created_at DESC LIMIT 100`).bind(status,status,category,category,since,since,player,player).all()).results||[];
    const unread=await env.DB.prepare("SELECT COUNT(*) n FROM bug_reports WHERE status='new'").first();return json({ok:true,unread:Number(unread?.n)||0,reports:await Promise.all(rows.map(r=>readReport(env,r,true)))});
  }
  const update=url.pathname.match(/^\/api\/bugs\/owner\/([0-9a-f-]{30,64})$/i);
  if(update&&request.method==='POST'){
    const access=await owner(env,request);if(access.error)return access.error;let body={};try{body=await request.json();}catch{return json({error:'INVALID_JSON'},400);}
    if(!statuses.has(body.status))return json({error:'INVALID_STATUS'},400);const comment=clean(body.internalComment,1000),t=Date.now();
    const reply=clean(body.response,1000),exists=await env.DB.prepare('SELECT id FROM bug_reports WHERE id=?').bind(update[1]).first();if(!exists)return json({error:'NOT_FOUND'},404);
    const writes=await env.DB.batch([env.DB.prepare('UPDATE bug_reports SET status=?,internal_comment=?,updated_at=? WHERE id=?').bind(body.status,comment,t,update[1]),env.DB.prepare("INSERT INTO bug_report_events(id,report_id,actor_user_id,event_type,event_json,created_at) VALUES(?,?,?,'status',?,?)").bind(crypto.randomUUID(),update[1],access.session.user.id,JSON.stringify({status:body.status,comment}),t),...(reply?[env.DB.prepare("INSERT INTO bug_report_events(id,report_id,actor_user_id,event_type,event_json,created_at) VALUES(?,?,?,'reply_public',?,?)").bind(crypto.randomUUID(),update[1],access.session.user.id,JSON.stringify({message:reply}),t)]:[])]);
    if(!Number(writes?.[0]?.meta?.changes||0))return json({error:'NOT_FOUND'},404);return json({ok:true});
  }
  return json({error:'NOT_FOUND'},404);
}

export async function cleanupExpiredBugAttachments(env,t=Date.now(),limit=100){
  if(!env?.DB||!env?.BUG_REPORTS_BUCKET)return {deleted:0,configured:false};
  const cutoff=t-90*86400000,rows=(await env.DB.prepare('SELECT id,object_key FROM bug_report_attachments WHERE created_at<? ORDER BY created_at LIMIT ?').bind(cutoff,Math.max(1,Math.min(500,limit|0))).all()).results||[];let deleted=0;
  for(const row of rows){try{await env.BUG_REPORTS_BUCKET.delete(row.object_key);await env.DB.prepare('DELETE FROM bug_report_attachments WHERE id=? AND created_at<?').bind(row.id,cutoff).run();deleted++;}catch{}}
  return {deleted,configured:true};
}
