import {currentSession,requireAdmin,mutateTargetSave,banResponse} from './auth.mjs';
import {staffOnlineLevel} from './admin-system.mjs';
import {crewIdentity} from './crews.mjs';
import {getProgression} from './progression.mjs';
import {writeGameLog} from './logs.mjs';
import {applyAccountTransaction} from './account-transactions.mjs';
import {generateRoomCode,normalizeRoomCode,validRoomCode,RACE_TRACK_IDS,DRIFT_TRACK_IDS} from './protocol.mjs';

const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const now=()=>Date.now(),DAY=86400000;
const schemas=new WeakMap();
const GAME_TYPES=Object.freeze({
  race:{label:'TRACK RACE EVENT',kind:'race',minPlayers:2,maxPlayers:8,defaultPlayers:6,defaultDurationMs:0},
  football_3v3:{label:'MINI FOOTBALL 3×3',kind:'football',minPlayers:2,maxPlayers:6,defaultPlayers:6,defaultDurationMs:150000},
  football_5v5:{label:'MINI FOOTBALL 5×5',kind:'football',minPlayers:2,maxPlayers:10,defaultPlayers:10,defaultDurationMs:180000},
  checkpoint:{label:'CHECKPOINT RUSH',kind:'checkpoint',minPlayers:2,maxPlayers:12,defaultPlayers:8,defaultDurationMs:105000},
  hot_potato:{label:'HOT POTATO',kind:'hot_potato',minPlayers:2,maxPlayers:12,defaultPlayers:8,defaultDurationMs:100000},
  drift_battle:{label:'DRIFT BATTLE',kind:'drift_battle',minPlayers:2,maxPlayers:12,defaultPlayers:8,defaultDurationMs:90000},
  koth:{label:'KING OF THE HILL',kind:'koth',minPlayers:2,maxPlayers:12,defaultPlayers:10,defaultDurationMs:180000},
  drag:{label:'DRAG EVENT',kind:'drag',minPlayers:2,maxPlayers:8,defaultPlayers:2,defaultDurationMs:120000}
});

export async function ensureMediaSchema(env){
  if(!env?.DB)return;let p=schemas.get(env.DB);if(p)return p;
  p=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS media_creators (
      user_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, appointed_at INTEGER NOT NULL,
      appointed_by TEXT NOT NULL, events_blocked INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS media_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), min_prize INTEGER NOT NULL DEFAULT 0, max_prize INTEGER NOT NULL DEFAULT 250000,
      daily_events INTEGER NOT NULL DEFAULT 8, daily_prize INTEGER NOT NULL DEFAULT 750000, updated_at INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare(`INSERT OR IGNORE INTO media_settings (id,min_prize,max_prize,daily_events,daily_prize,updated_at) VALUES (1,0,250000,8,750000,0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS media_events (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, creator_user_id TEXT NOT NULL, title TEXT NOT NULL, game_key TEXT NOT NULL,
      access_type TEXT NOT NULL DEFAULT 'code', organizer_mode TEXT NOT NULL DEFAULT 'spectator', status TEXT NOT NULL DEFAULT 'WAITING',
      prize INTEGER NOT NULL DEFAULT 0, settings_json TEXT NOT NULL DEFAULT '{}', invite_json TEXT NOT NULL DEFAULT '[]',
      winner_json TEXT NOT NULL DEFAULT '[]', result_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL,
      started_at INTEGER, finished_at INTEGER, cancelled_at INTEGER, updated_at INTEGER NOT NULL,
      FOREIGN KEY(creator_user_id) REFERENCES users(id) ON DELETE CASCADE)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_media_events_creator_time ON media_events(creator_user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_media_events_status ON media_events(status,updated_at DESC)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS media_event_participants (
      event_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'player', joined_at INTEGER NOT NULL,
      PRIMARY KEY(event_id,user_id), FOREIGN KEY(event_id) REFERENCES media_events(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_media_participants_user ON media_event_participants(user_id,joined_at DESC)')
  ]).catch(e=>{schemas.delete(env.DB);throw e;});schemas.set(env.DB,p);return p;
}

export async function mediaRole(env,userId){
  if(!env?.DB||!userId)return null;try{await ensureMediaSchema(env);const r=await env.DB.prepare('SELECT active,events_blocked,appointed_at,note FROM media_creators WHERE user_id=? LIMIT 1').bind(userId).first();return r&&Number(r.active)===1?{active:true,eventsBlocked:Number(r.events_blocked)===1,appointedAt:Number(r.appointed_at)||0,note:r.note||''}:null;}catch{return null;}
}
export async function mediaLimits(env){await ensureMediaSchema(env);const r=await env.DB.prepare('SELECT * FROM media_settings WHERE id=1').first();return {minPrize:Number(r?.min_prize)||0,maxPrize:Number(r?.max_prize)||250000,dailyEvents:Number(r?.daily_events)||8,dailyPrize:Number(r?.daily_prize)||750000};}
function clean(v,n=80){return String(v||'').trim().replace(/\s+/g,' ').slice(0,n);}
function parseJson(v,fallback){try{return JSON.parse(v);}catch{return fallback;}}
function publicEvent(r){if(!r)return null;return {id:r.id,code:r.code,creatorUserId:r.creator_user_id,title:r.title,gameKey:r.game_key,accessType:r.access_type,organizerMode:r.organizer_mode,status:r.status,prize:Number(r.prize)||0,settings:parseJson(r.settings_json,{}),winners:parseJson(r.winner_json,[]),result:parseJson(r.result_json,{}),createdAt:Number(r.created_at)||0,startedAt:Number(r.started_at)||0,finishedAt:Number(r.finished_at)||0,cancelledAt:Number(r.cancelled_at)||0};}
function normalizedSettings(gameKey,raw={}){
  const g=GAME_TYPES[gameKey];if(!g)return null;
  const maxPlayers=Math.max(g.minPlayers,Math.min(g.maxPlayers,Math.floor(Number(raw.maxPlayers)||g.defaultPlayers)));
  const minPlayers=Math.max(g.minPlayers,Math.min(maxPlayers,Math.floor(Number(raw.minPlayers)||g.minPlayers)));
  if(g.kind==='race'){
    const drift=raw.drift===true,trackIds=drift?DRIFT_TRACK_IDS:RACE_TRACK_IDS,defaultTrack=drift?'sierraFlow':'apexCircuit';
    const trackId=trackIds.includes(raw.trackId)?raw.trackId:defaultTrack,laps=drift?1:([3,5,7,10,15].includes(Number(raw.laps))?Number(raw.laps):5);
    return {kind:'race',trackId,laps,maxPlayers,minPlayers,collisions:raw.collisions===true,drift,wager:0};
  }
  const durationMs=Math.max(30000,Math.min(10*60*1000,Math.floor(Number(raw.durationMs)||g.defaultDurationMs)));
  const goalLimit=g.kind==='football'?Math.max(1,Math.min(20,Math.floor(Number(raw.goalLimit)||5))):0;
  const rounds=Math.max(1,Math.min(5,Math.floor(Number(raw.rounds)||1)));
  const checkpointCount=g.kind==='checkpoint'?Math.max(4,Math.min(60,Math.floor(Number(raw.checkpointCount)||12))):0;
  const bombIntervalMs=g.kind==='hot_potato'?Math.max(5000,Math.min(30000,Math.floor(Number(raw.bombIntervalMs)||12000))):0;
  const dragFormat=g.kind==='drag'&&(raw.dragFormat==='tournament')?'tournament':'race';
  return {kind:g.kind,maxPlayers,minPlayers,durationMs,goalLimit,rounds,checkpointCount,bombIntervalMs,dragFormat,teamSize:g.kind==='football'?Math.max(1,Math.floor(maxPlayers/2)):0};
}
async function currentUser(env,request){const s=await currentSession(env,request);if(!s)return {error:json({error:'AUTH_REQUIRED'},401)};const ban=await banResponse(env,s.user);if(ban)return {error:ban};return {session:s,user:s.user};}
async function uniqueCode(env){for(let i=0;i<12;i++){const code=generateRoomCode();const row=await env.DB.prepare('SELECT 1 ok FROM media_events WHERE code=? LIMIT 1').bind(code).first();if(!row)return code;}throw new Error('MEDIA_CODE_EXHAUSTED');}
async function eventByCode(env,code){await ensureMediaSchema(env);return env.DB.prepare('SELECT * FROM media_events WHERE code=? LIMIT 1').bind(normalizeRoomCode(code)).first();}

export async function markMediaEventRunning(env,eventId){await ensureMediaSchema(env);const t=now();await env.DB.prepare("UPDATE media_events SET status='RUNNING',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status IN ('WAITING','STARTING')").bind(t,t,eventId).run();}
export async function refundMediaEvent(env,eventId,reason='CANCELLED'){
  await ensureMediaSchema(env);const row=await env.DB.prepare('SELECT * FROM media_events WHERE id=? LIMIT 1').bind(eventId).first();if(!row)return {ok:false,error:'EVENT_NOT_FOUND'};
  if(['CANCELLED','FINISHED'].includes(row.status))return {ok:true,duplicate:true};
  if(!['WAITING','STARTING','RUNNING'].includes(row.status))return {ok:false,error:'EVENT_REQUIRES_RECONCILIATION'};
  const prize=Math.max(0,Number(row.prize)||0),t=now();
  if(prize){
    const changed=await applyAccountTransaction(env,{actorId:row.creator_user_id,accountIds:[row.creator_user_id],requestId:`media-refund-${eventId}`,type:'media_event_refund',plan:saves=>{
      const save=saves[row.creator_user_id],before=Math.max(0,Math.floor(Number(save.credits)||0)),after=Math.min(999999999,before+prize);save.credits=after;
      return {result:{refunded:after-before},guardSql:"EXISTS(SELECT 1 FROM media_events WHERE id=? AND status IN ('WAITING','STARTING','RUNNING'))",guardArgs:[eventId],statements:({receiptSql,receiptArgs})=>[env.DB.prepare(`UPDATE media_events SET status='CANCELLED',cancelled_at=?,finished_at=?,result_json=?,updated_at=? WHERE id=? AND status IN ('WAITING','STARTING','RUNNING') AND ${receiptSql}`).bind(t,t,JSON.stringify({reason,refunded:after-before}),t,eventId,...receiptArgs)]};
    }});
    if(changed.error)return {ok:false,error:changed.error};
  }else{
    const updated=await env.DB.prepare("UPDATE media_events SET status='CANCELLED',cancelled_at=?,finished_at=?,result_json=?,updated_at=? WHERE id=? AND status IN ('WAITING','STARTING','RUNNING')").bind(t,t,JSON.stringify({reason,refunded:0}),t,eventId).run();
    if(Number(updated?.meta?.changes||0)!==1)return {ok:false,error:'EVENT_NOT_SETTLEABLE'};
  }
  try{await writeGameLog(env,{category:'system',eventType:'media_event_refund',actorRole:'SYSTEM',targetUserId:row.creator_user_id,source:'MEDIA_EVENT',subject:'MEDIA EVENT · возврат призового фонда',amount:prize,currency:'CR',relatedId:eventId,metadata:{code:row.code,reason},createdAt:t});}catch{}
  return {ok:true,refunded:prize};
}
export async function settleMediaEvent(env,eventId,winnerUserIds=[],result={}){
  await ensureMediaSchema(env);const row=await env.DB.prepare('SELECT * FROM media_events WHERE id=? LIMIT 1').bind(eventId).first();if(!row)return {ok:false,error:'EVENT_NOT_FOUND'};if(row.status==='FINISHED')return {ok:true,duplicate:true,event:publicEvent(row)};
  if(!['WAITING','STARTING','RUNNING'].includes(row.status))return {ok:false,error:'EVENT_REQUIRES_RECONCILIATION'};
  const unique=[...new Set((winnerUserIds||[]).filter(id=>typeof id==='string'&&id).slice(0,12))],prize=Math.max(0,Number(row.prize)||0),t=now();
  if(prize>0&&!unique.length)return refundMediaEvent(env,eventId,'NO_WINNER');
  let payouts=[];
  if(prize>0){
    const base=Math.floor(prize/unique.length),remainder=prize%unique.length,amounts=new Map(unique.map((id,i)=>[id,base+(i<remainder?1:0)]));
    const changed=await applyAccountTransaction(env,{actorId:unique[0],accountIds:unique,requestId:`media-settle-${eventId}`,type:'media_event_settlement',plan:saves=>{
      const pays=[];for(const id of unique){const save=saves[id],before=Math.max(0,Math.floor(Number(save.credits)||0)),amount=amounts.get(id);save.credits=Math.min(999999999,before+amount);pays.push({userId:id,amount:save.credits-before});}
      return {result:{payouts:pays},guardSql:"EXISTS(SELECT 1 FROM media_events WHERE id=? AND status IN ('WAITING','STARTING','RUNNING'))",guardArgs:[eventId],statements:({receiptSql,receiptArgs})=>[env.DB.prepare(`UPDATE media_events SET status='FINISHED',winner_json=?,result_json=?,finished_at=?,updated_at=? WHERE id=? AND status IN ('WAITING','STARTING','RUNNING') AND ${receiptSql}`).bind(JSON.stringify(unique),JSON.stringify({...result,payouts:pays}),t,t,eventId,...receiptArgs)]};
    }});
    if(changed.error)return {ok:false,error:changed.error};payouts=changed.result?.payouts||[];
  }else{
    const updated=await env.DB.prepare("UPDATE media_events SET status='FINISHED',winner_json=?,result_json=?,finished_at=?,updated_at=? WHERE id=? AND status IN ('WAITING','STARTING','RUNNING')").bind(JSON.stringify(unique),JSON.stringify({...result,payouts:[]}),t,t,eventId).run();
    if(Number(updated?.meta?.changes||0)!==1)return {ok:false,error:'EVENT_NOT_SETTLEABLE'};
  }
  for(const p of payouts){try{await writeGameLog(env,{category:'system',eventType:'media_event_payout',actorRole:'SYSTEM',targetUserId:p.userId,source:'MEDIA_EVENT',subject:'MEDIA EVENT · приз',amount:p.amount,currency:'CR',relatedId:eventId,metadata:{code:row.code,gameKey:row.game_key,creatorUserId:row.creator_user_id},createdAt:t});}catch{}}
  return {ok:true,payouts,winners:unique};
}

export async function handleMediaRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/media/'))return null;if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);await ensureMediaSchema(env);
  if(url.pathname==='/api/media/me'&&request.method==='GET'){
    const a=await currentUser(env,request);if(a.error)return a.error;const role=await mediaRole(env,a.user.id),limits=await mediaLimits(env);const hist=await env.DB.prepare('SELECT * FROM media_events WHERE creator_user_id=? ORDER BY created_at DESC LIMIT 30').bind(a.user.id).all();return json({ok:true,media:!!role,isMedia:!!role,owner:a.user.isAdmin===true,role,limits,history:(hist.results||[]).map(publicEvent)});
  }
  if(url.pathname==='/api/media/owner/list'&&request.method==='GET'){
    const a=await requireAdmin(env,request);if(a.error)return a.error;const [staff,limits]=await Promise.all([env.DB.prepare(`SELECT m.*,u.username,u.display_name,(SELECT COUNT(*) FROM media_events e WHERE e.creator_user_id=m.user_id) events_total,(SELECT COALESCE(SUM(prize),0) FROM media_events e WHERE e.creator_user_id=m.user_id AND e.status='FINISHED') prize_total,(SELECT COUNT(*) FROM media_event_participants p JOIN media_events e2 ON e2.id=p.event_id WHERE e2.creator_user_id=m.user_id AND p.role='player') participants_total,(SELECT MAX(created_at) FROM media_events e WHERE e.creator_user_id=m.user_id) last_event_at FROM media_creators m JOIN users u ON u.id=m.user_id WHERE m.active=1 ORDER BY m.appointed_at DESC`).all(),mediaLimits(env)]);return json({ok:true,creators:(staff.results||[]).map(x=>({userId:x.user_id,username:x.username,displayName:x.display_name,eventsBlocked:Number(x.events_blocked)===1,appointedAt:Number(x.appointed_at)||0,eventsTotal:Number(x.events_total)||0,prizeTotal:Number(x.prize_total)||0,participantsTotal:Number(x.participants_total)||0,lastEventAt:Number(x.last_event_at)||0,note:x.note||''})),limits});
  }
  if(url.pathname==='/api/media/owner/assign'&&request.method==='POST'){
    const a=await requireAdmin(env,request);if(a.error)return a.error;let b={};try{b=await request.json();}catch{}const username=clean(String(b.username||'').replace(/^@/,''),24).toLowerCase();const u=await env.DB.prepare('SELECT id,username FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first();if(!u)return json({error:'USER_NOT_FOUND'},404);const t=now();await env.DB.prepare(`INSERT INTO media_creators(user_id,active,appointed_at,appointed_by,events_blocked,note,updated_at) VALUES(?,1,?,?,0,?,?) ON CONFLICT(user_id) DO UPDATE SET active=1,appointed_at=excluded.appointed_at,appointed_by=excluded.appointed_by,note=excluded.note,updated_at=excluded.updated_at`).bind(u.id,t,a.session.user.id,clean(b.note,200),t).run();try{await writeGameLog(env,{category:'system',eventType:'media_role_assigned',actorUserId:a.session.user.id,actorUsername:a.session.user.username,actorRole:'OWNER',targetUserId:u.id,targetUsername:u.username,source:'MEDIA',subject:'Назначена роль MEDIA',createdAt:t});}catch{}return json({ok:true,userId:u.id,username:u.username});
  }
  const ownerCreator=url.pathname.match(/^\/api\/media\/owner\/creators\/([^/]+)\/(remove|block)$/);if(ownerCreator&&request.method==='POST'){
    const a=await requireAdmin(env,request);if(a.error)return a.error;const id=decodeURIComponent(ownerCreator[1]),op=ownerCreator[2],t=now();let b={};try{b=await request.json();}catch{}if(op==='remove')await env.DB.prepare('UPDATE media_creators SET active=0,updated_at=? WHERE user_id=?').bind(t,id).run();else await env.DB.prepare('UPDATE media_creators SET events_blocked=?,updated_at=? WHERE user_id=? AND active=1').bind(b.blocked===false?0:1,t,id).run();return json({ok:true});
  }
  if(url.pathname==='/api/media/owner/limits'&&request.method==='POST'){
    const a=await requireAdmin(env,request);if(a.error)return a.error;let b={};try{b=await request.json();}catch{}const minPrize=Math.max(0,Math.min(1000000,Math.floor(Number(b.minPrize)||0))),maxPrize=Math.max(minPrize,Math.min(10000000,Math.floor(Number(b.maxPrize)||250000))),dailyEvents=Math.max(1,Math.min(100,Math.floor(Number(b.dailyEvents)||8))),dailyPrize=Math.max(maxPrize,Math.min(50000000,Math.floor(Number(b.dailyPrize)||750000)));await env.DB.prepare('UPDATE media_settings SET min_prize=?,max_prize=?,daily_events=?,daily_prize=?,updated_at=? WHERE id=1').bind(minPrize,maxPrize,dailyEvents,dailyPrize,now()).run();return json({ok:true,limits:await mediaLimits(env)});
  }
  if(url.pathname==='/api/media/events/create'&&request.method==='POST'){
    const a=await currentUser(env,request);if(a.error)return a.error;const role=await mediaRole(env,a.user.id);if(!role&&!a.user.isAdmin)return json({error:'MEDIA_REQUIRED'},403);if(role?.eventsBlocked)return json({error:'MEDIA_EVENTS_BLOCKED'},403);let b={};try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}const gameKey=String(b.gameKey||''),game=GAME_TYPES[gameKey],settings=normalizedSettings(gameKey,b.settings||{});if(!game||!settings)return json({error:'INVALID_GAME'},400);const limits=await mediaLimits(env),prize=Math.floor(Number(b.prize)||0);if(prize<limits.minPrize||prize>limits.maxPrize)return json({error:'INVALID_PRIZE',limits},400);const since=now()-DAY,usage=await env.DB.prepare("SELECT COUNT(*) cnt,COALESCE(SUM(prize),0) sum FROM media_events WHERE creator_user_id=? AND created_at>=? AND status NOT IN ('CANCELLED','FAILED')").bind(a.user.id,since).first();if(Number(usage?.cnt)||0>=limits.dailyEvents)return json({error:'MEDIA_DAILY_EVENT_LIMIT',limits},429);if((Number(usage?.sum)||0)+prize>limits.dailyPrize)return json({error:'MEDIA_DAILY_PRIZE_LIMIT',limits},429);
    let charged={ok:true,result:{delta:0}};if(prize>0){charged=await mutateTargetSave(env,a.user.id,s=>{const before=Math.max(0,Math.floor(Number(s.credits)||0));if(before<prize)return {error:'INSUFFICIENT_CR'};s.credits=before-prize;return {before,after:s.credits,delta:-prize};});if(!charged.ok)return json({error:charged.error||'INSUFFICIENT_CR'},409);}
    const t=now(),id=crypto.randomUUID(),code=await uniqueCode(env),title=clean(b.title,48)||game.label,access=['code','open','invite'].includes(b.accessType)?b.accessType:'code',organizerMode=b.organizerMode==='player'?'player':'spectator';
    let inviteIds=Array.isArray(b.invitedUserIds)?[...new Set(b.invitedUserIds.map(x=>String(x)).filter(Boolean))].slice(0,50):[];const inviteNames=Array.isArray(b.invitedUsernames)?[...new Set(b.invitedUsernames.map(x=>clean(String(x).replace(/^@/,''),24).toLowerCase()).filter(Boolean))].slice(0,50):[];if(inviteNames.length){const marks=inviteNames.map(()=>'?').join(','),found=await env.DB.prepare(`SELECT id FROM users WHERE lower(username) IN (${marks})`).bind(...inviteNames).all();inviteIds=[...new Set([...inviteIds,...(found.results||[]).map(x=>x.id)])].slice(0,50);}
    try{await env.DB.prepare(`INSERT INTO media_events(id,code,creator_user_id,title,game_key,access_type,organizer_mode,status,prize,settings_json,invite_json,winner_json,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'WAITING',?,?,?,?,?, ?,?)`).bind(id,code,a.user.id,title,gameKey,access,organizerMode,prize,JSON.stringify(settings),JSON.stringify(inviteIds),'[]','{}',t,t).run();const stub=env.ROOMS.get(env.ROOMS.idFromName('MEDIA:'+code)),roomPath=game.kind==='race'?'/media-race/create':'/media/create';const r=await stub.fetch(new Request('https://room.internal'+roomPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:{id,code,creatorUserId:a.user.id,creatorUsername:a.user.username,title,gameKey,accessType:access,organizerMode,prize,settings}})}));if(!r.ok)throw new Error('ROOM_CREATE_FAILED');}catch(e){if(prize>0)await mutateTargetSave(env,a.user.id,s=>{const before=Math.max(0,Math.floor(Number(s.credits)||0));s.credits=Math.min(999999999,before+prize);return {before,after:s.credits,delta:prize};});await env.DB.prepare('DELETE FROM media_events WHERE id=?').bind(id).run().catch(()=>{});throw e;}
    try{await writeGameLog(env,{category:'system',eventType:'media_event_created',actorUserId:a.user.id,actorUsername:a.user.username,actorRole:'MEDIA',targetUserId:a.user.id,targetUsername:a.user.username,source:'MEDIA_EVENT',subject:`MEDIA EVENT · ${game.label}`,amount:-prize,currency:'CR',relatedId:id,metadata:{code,gameKey,settings,organizerMode,accessType:access},createdAt:t});}catch{}return json({ok:true,event:{id,code,title,gameKey,status:'WAITING',prize,settings,accessType:access,organizerMode},balance:charged.detail?.save?.credits});
  }
  const em=url.pathname.match(/^\/api\/media\/events\/([A-Z0-9]+)\/(join|ws|leave|cancel|status)$/i);if(em){const code=normalizeRoomCode(em[1]);if(!validRoomCode(code))return json({error:'INVALID_CODE'},400);const action=em[2].toLowerCase(),row=await eventByCode(env,code);if(!row)return json({error:'EVENT_NOT_FOUND'},404);
    if(action==='status'&&request.method==='GET')return json({ok:true,event:publicEvent(row)});
    if(action==='join'&&request.method==='POST'){
      if(!['WAITING','STARTING','RUNNING'].includes(row.status))return json({error:'EVENT_CLOSED'},409);const a=await currentUser(env,request);if(a.error)return a.error;let b={};try{b=await request.json();}catch{}const invites=parseJson(row.invite_json,[]);if(row.access_type==='invite'&&a.user.id!==row.creator_user_id&&!invites.includes(a.user.id))return json({error:'EVENT_INVITE_REQUIRED'},403);const spectator=b.spectator===true&&a.user.id===row.creator_user_id;const [crew,adminLevel,progress,media]=await Promise.all([crewIdentity(env,a.user.id),staffOnlineLevel(env,a.user.id),getProgression(env,a.user.id),mediaRole(env,a.user.id)]);const stub=env.ROOMS.get(env.ROOMS.idFromName('MEDIA:'+code)),joinPath=row.game_key==='race'?'/media-race/join':'/media/join';const response=await stub.fetch(new Request('https://room.internal'+joinPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:a.user.id,name:'@'+a.user.username,owner:a.user.isAdmin===true,adminLevel,media:!!media,crew,progress,loadout:b.loadout||{},spectator})}));if(response.ok)await env.DB.prepare('INSERT OR IGNORE INTO media_event_participants(event_id,user_id,role,joined_at) VALUES(?,?,?,?)').bind(row.id,a.user.id,spectator?'spectator':'player',now()).run();return response;
    }
    const stub=env.ROOMS.get(env.ROOMS.idFromName('MEDIA:'+code));
    if(action==='ws')return stub.fetch(new Request('https://room.internal'+(row.game_key==='race'?'/media-race/ws':'/media/ws')+'?playerId='+encodeURIComponent(url.searchParams.get('playerId')||'')+'&token='+encodeURIComponent(url.searchParams.get('token')||''),{headers:request.headers}));
    if(action==='leave'&&request.method==='POST')return stub.fetch(new Request('https://room.internal'+(row.game_key==='race'?'/media-race/leave':'/media/leave')+'?playerId='+encodeURIComponent(url.searchParams.get('playerId')||'')+'&token='+encodeURIComponent(url.searchParams.get('token')||''),{method:'POST'}));
    if(action==='cancel'&&request.method==='POST'){const a=await currentUser(env,request);if(a.error)return a.error;if(a.user.id!==row.creator_user_id&&!a.user.isAdmin)return json({error:'EVENT_OWNER_ONLY'},403);if(!['WAITING','STARTING'].includes(row.status))return json({error:'EVENT_ALREADY_STARTED'},409);await stub.fetch(new Request('https://room.internal'+(row.game_key==='race'?'/media-race/cancel':'/media/cancel'),{method:'POST'}));const result=await refundMediaEvent(env,row.id,'ORGANIZER_CANCELLED');return json(result,result.ok?200:409);}
  }
  return json({error:'NOT_FOUND'},404);
}

export {GAME_TYPES,publicEvent};
