import {currentSession,requireAdmin,banResponse} from './auth.mjs';
import {getProgression} from './progression.mjs';
import {CARS} from './car-catalog.mjs';
import {writeGameLog} from './logs.mjs';
const SCHEMA="CREATE TABLE IF NOT EXISTS crews (id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,tag TEXT NOT NULL COLLATE NOCASE UNIQUE,emblem TEXT NOT NULL,color TEXT NOT NULL,leader_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS crew_members (user_id TEXT PRIMARY KEY REFERENCES users(id),crew_id TEXT NOT NULL REFERENCES crews(id),joined_at INTEGER NOT NULL);\nCREATE INDEX IF NOT EXISTS crew_member_group ON crew_members(crew_id);\nCREATE TABLE IF NOT EXISTS crew_cooldowns (user_id TEXT PRIMARY KEY,until_at INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS crew_settings (crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,privacy TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public','private')),updated_at INTEGER NOT NULL DEFAULT 0);\nCREATE TABLE IF NOT EXISTS crew_join_requests (crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(crew_id,user_id));\nCREATE INDEX IF NOT EXISTS crew_join_requests_user ON crew_join_requests(user_id,created_at);\nCREATE TABLE IF NOT EXISTS street_rep (user_id TEXT NOT NULL,source TEXT NOT NULL,event_id TEXT NOT NULL,crew_id TEXT,week INTEGER NOT NULL,points INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,source,event_id));\nCREATE INDEX IF NOT EXISTS crew_rep_week ON street_rep(week,crew_id,user_id);\nCREATE INDEX IF NOT EXISTS street_rep_user_time ON street_rep(user_id,created_at);\nCREATE TABLE IF NOT EXISTS crew_payouts (week INTEGER NOT NULL,user_id TEXT NOT NULL,crew_id TEXT NOT NULL,rank INTEGER NOT NULL,amount INTEGER NOT NULL,paid INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(week,user_id));\nCREATE TABLE IF NOT EXISTS crew_settlements (week INTEGER PRIMARY KEY,created_at INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS player_reports (id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,evidence TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'new',created_at INTEGER NOT NULL,reviewed_at INTEGER,reviewer_id TEXT);\nCREATE INDEX IF NOT EXISTS report_created ON player_reports(created_at DESC);\n";
const DAY=86400000,WEEK=7*DAY,ANCHOR=Date.UTC(2026,8,13,18),COST=22500;
export const weekStart=(t=Date.now())=>ANCHOR+Math.floor((t-ANCHOR)/WEEK)*WEEK;
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const schemas=new WeakMap();
export async function ensureCrews(env){if(!env?.DB)return;let p=schemas.get(env.DB);if(!p){p=env.DB.batch(SCHEMA.split(';').filter(s=>s.trim()).map(s=>env.DB.prepare(s))).catch(e=>{schemas.delete(env.DB);throw e;});schemas.set(env.DB,p);}await p;}
export async function crewIdentity(env,id){if(!env?.DB||!id)return null;await ensureCrews(env);return await env.DB.prepare("SELECT c.id,c.tag,c.color,c.name,c.emblem,COALESCE((SELECT privacy FROM crew_settings s WHERE s.crew_id=c.id),'public') privacy FROM crews c JOIN crew_members m ON m.crew_id=c.id WHERE m.user_id=?").bind(id).first();}
// One immutable ledger entry per server event. Daily cap is evaluated inside the INSERT.
export async function awardCrewRep(env,userId,source,eventId,exp){
 if(!env?.DB||!userId||!exp)return;await ensureCrews(env);await crewRepStatement(env,userId,source,eventId,exp).run();
}
export function crewRepStatement(env,userId,source,eventId,exp,t=Date.now()){
 const points=source==='online_time'?10:source==='drag'?20:source==='online'?30:Math.min(80,Math.max(20,Math.floor(exp/3)));
 return env.DB.prepare(`INSERT OR IGNORE INTO street_rep(user_id,source,event_id,crew_id,week,points,created_at)
 SELECT ?,?,?,(SELECT crew_id FROM crew_members WHERE user_id=?),?,MIN(?,MAX(0,500-COALESCE((SELECT SUM(points) FROM street_rep WHERE user_id=? AND created_at>=?),0))),?`).bind(userId,source,eventId,userId,weekStart(t),points,userId,Math.floor(t/DAY)*DAY,t);
}
export async function settleCrews(env,t=Date.now()){
 await ensureCrews(env);
 const weeks=await env.DB.prepare('SELECT DISTINCT week FROM street_rep WHERE week<? AND crew_id IS NOT NULL AND week NOT IN (SELECT week FROM crew_settlements) ORDER BY week LIMIT 12').bind(weekStart(t)).all();
 for(const {week} of weeks.results){
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO crew_payouts(week,user_id,crew_id,rank,amount)
    WITH ranked AS (SELECT crew_id,SUM(points) rep,ROW_NUMBER() OVER(ORDER BY SUM(points) DESC,crew_id) place FROM street_rep WHERE week=? AND crew_id IS NOT NULL GROUP BY crew_id HAVING SUM(points)>=500)
    SELECT ?,m.user_id,m.crew_id,r.place,CASE WHEN c.leader_id=m.user_id THEN CASE WHEN r.place=1 THEN 12000 WHEN r.place<=3 THEN 9000 WHEN r.place<=10 THEN 6000 ELSE 3000 END ELSE CASE WHEN r.place=1 THEN 4000 WHEN r.place<=3 THEN 3000 WHEN r.place<=10 THEN 2000 ELSE 1000 END END
    FROM ranked r JOIN crews c ON c.id=r.crew_id JOIN crew_members m ON m.crew_id=c.id
    WHERE m.joined_at<=? AND (SELECT COALESCE(SUM(points),0) FROM street_rep s WHERE s.week=? AND s.user_id=m.user_id AND s.crew_id=m.crew_id AND s.created_at>=m.joined_at)>=100 AND NOT EXISTS(SELECT 1 FROM crew_settlements WHERE week=?)`).bind(week,week,week+WEEK-DAY,week,week),
   env.DB.prepare(`INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) SELECT user_id,json_object('credits',0),1,?,? FROM crew_payouts WHERE week=? AND paid=0 AND user_id NOT IN(SELECT user_id FROM player_saves)`).bind(t,t,week),
   env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',MIN(999999999,COALESCE(json_extract(save_json,'$.credits'),0)+(SELECT amount FROM crew_payouts WHERE week=? AND user_id=player_saves.user_id AND paid=0))),revision=revision+1,updated_at=? WHERE user_id IN(SELECT user_id FROM crew_payouts WHERE week=? AND paid=0)`).bind(week,t,week),
   env.DB.prepare('UPDATE crew_payouts SET paid=1 WHERE week=? AND paid=0').bind(week),
   env.DB.prepare('INSERT OR IGNORE INTO crew_settlements(week,created_at) VALUES(?,?)').bind(week,t)
  ]);
  try{const payouts=await env.DB.prepare('SELECT user_id,crew_id,rank,amount FROM crew_payouts WHERE week=? AND paid=1').bind(week).all();for(const row of payouts.results||[])await writeGameLog(env,{category:'system',eventType:'crew_weekly_reward',actorRole:'SYSTEM',targetUserId:row.user_id,source:'CREW_SETTLEMENT',subject:'Еженедельная награда клана',amount:Number(row.amount)||0,currency:'CR',relatedId:String(week),metadata:{week,crewId:row.crew_id,rank:Number(row.rank)||0,amount:Number(row.amount)||0},createdAt:t});}catch(e){console.error('crew payout log',e);}
 }
}
const EMBLEMS=['⚡','🔥','👑','🏁','🐺','🦅','💎','🛡️'];
const COLORS=['#a9ff5a','#66c7ff','#ff63ba','#ffc85a','#b891ff','#ff6868'];
const validPrivacy=v=>v==='private'?'private':'public';
async function overview(env,uid,search=''){
 const w=weekStart(),mine=await crewIdentity(env,uid);
 const ranking=await env.DB.prepare(`SELECT c.*,COALESCE((SELECT privacy FROM crew_settings s WHERE s.crew_id=c.id),'public') privacy,(SELECT COUNT(*) FROM crew_members m WHERE m.crew_id=c.id) members,COALESCE((SELECT SUM(points) FROM street_rep WHERE crew_id=c.id AND week=?),0) rep,COALESCE((SELECT SUM(points) FROM street_rep WHERE crew_id=c.id),0) totalRep FROM crews c WHERE (?='' OR instr(lower(c.name),lower(?))>0 OR instr(lower(c.tag),lower(?))>0) ORDER BY rep DESC,c.id LIMIT 100`).bind(w,search,search,search).all();
 const members=mine?await env.DB.prepare(`SELECT u.id,u.username,m.joined_at,COALESCE((SELECT SUM(points) FROM street_rep WHERE user_id=u.id AND crew_id=m.crew_id AND week=? AND created_at>=m.joined_at),0) rep FROM crew_members m JOIN users u ON u.id=m.user_id WHERE m.crew_id=? ORDER BY m.joined_at,u.username`).bind(w,mine.id).all():{results:[]};
 const crew=mine?await env.DB.prepare(`SELECT c.*,COALESCE((SELECT privacy FROM crew_settings s WHERE s.crew_id=c.id),'public') privacy,COALESCE((SELECT SUM(points) FROM street_rep WHERE crew_id=c.id AND week=?),0) rep,COALESCE((SELECT SUM(points) FROM street_rep WHERE crew_id=c.id),0) totalRep FROM crews c WHERE id=?`).bind(w,mine.id).first():null;
 const requests=crew&&crew.leader_id===uid?await env.DB.prepare(`SELECT r.user_id id,u.username,r.created_at FROM crew_join_requests r JOIN users u ON u.id=r.user_id WHERE r.crew_id=? AND NOT EXISTS(SELECT 1 FROM crew_members m WHERE m.user_id=r.user_id) ORDER BY r.created_at`).bind(crew.id).all():{results:[]};
 const pending=await env.DB.prepare('SELECT crew_id FROM crew_join_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(uid).all();
 const history=await env.DB.prepare('SELECT * FROM crew_payouts WHERE user_id=? AND paid=1 ORDER BY week DESC LIMIT 8').bind(uid).all();
 return {ok:true,crew,members:members.results,requests:requests.results,pendingCrewIds:pending.results.map(x=>x.crew_id),ranking:ranking.results,history:history.results,search,weekEnd:w+WEEK,cost:COST,emblems:EMBLEMS,colors:COLORS,userId:uid};
}
export async function handleCrewRequest(request,env,url){
 const path=url.pathname;if(!/^\/api\/(crews|player-profile|reports)(\/|$)/.test(path))return null;
 try{
  if(request.method!=='GET'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'ORIGIN'},403);
  const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
  await ensureCrews(env);const uid=session.user.id,t=Date.now();
  if(path.startsWith('/api/reports/owner')){
   const a=await requireAdmin(env,request);if(a.error)return a.error;
   const id=url.searchParams.get('id');
   if(request.method==='GET'){
    if(id){const report=await env.DB.prepare('SELECT r.*,a.username reporter,b.username target FROM player_reports r JOIN users a ON a.id=r.reporter_id JOIN users b ON b.id=r.target_id WHERE r.id=?').bind(id).first();return report?json({report}):json({error:'NOT_FOUND'},404);}
    const page=Math.max(0,Math.floor(Number(url.searchParams.get('page'))||0));const r=await env.DB.prepare('SELECT r.id,r.reason,r.status,r.created_at,a.username reporter,b.username target FROM player_reports r JOIN users a ON a.id=r.reporter_id JOIN users b ON b.id=r.target_id ORDER BY r.created_at DESC LIMIT 51 OFFSET ?').bind(page*50).all();return json({reports:r.results.slice(0,50),hasMore:r.results.length>50,page});
   }
   const b=await request.json();if(!['new','reviewed','dismissed'].includes(b.status))return json({error:'INVALID_STATUS'},400);
   await env.DB.prepare('UPDATE player_reports SET status=?,reviewed_at=?,reviewer_id=? WHERE id=?').bind(b.status,t,uid,b.id).run();return json({ok:true});
  }
  if(path==='/api/player-profile'&&request.method==='GET'){
   const user=await env.DB.prepare('SELECT id,username FROM users WHERE id=? OR username=? COLLATE NOCASE LIMIT 1').bind(url.searchParams.get('id')||'',(url.searchParams.get('username')||'').replace(/^@/,'')).first();if(!user)return json({error:'USER_NOT_FOUND'},404);
   const row=await env.DB.prepare('SELECT save_json FROM player_saves WHERE user_id=?').bind(user.id).first();let save={};try{save=JSON.parse(row?.save_json||'{}');}catch{}
   const rep=await env.DB.prepare('SELECT COALESCE(SUM(points),0) rep FROM street_rep WHERE user_id=?').bind(user.id).first();const requestedCar=url.searchParams.get('carId');const carId=requestedCar&&Array.isArray(save.ownedLiveries)&&save.ownedLiveries.includes(requestedCar)?requestedCar:(save.selectedLivery||'apexLime');
   return json({user,prefix:user.username==='w1st1r'?'OWNER':user.username==='mary'?'QUEEN':'',crew:await crewIdentity(env,user.id),progress:await getProgression(env,user.id),streetRep:rep.rep,car:{id:carId,name:CARS[carId]?.name||carId,upgrades:save.carUpgrades?.[carId]||{}}});
  }
  if(path==='/api/reports'&&request.method==='POST'){
   if(Number(request.headers.get('content-length'))>450000)return json({error:'IMAGE_TOO_LARGE'},413);
   const raw=await request.text();if(raw.length>450000)return json({error:'IMAGE_TOO_LARGE'},413);const b=JSON.parse(raw),reason=String(b.reason||'').trim(),evidence=String(b.evidence||'');
   if(reason.length<10||reason.length>1500)return json({error:'REASON_LENGTH'},400);
   if(evidence&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(evidence))return json({error:'INVALID_IMAGE'},400);
   if(evidence){const bytes=atob(evidence.split(',')[1]);if(!(bytes.startsWith('\xff\xd8\xff')||bytes.startsWith('\x89PNG\r\n\x1a\n')||(bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP')))return json({error:'INVALID_IMAGE'},400);}
   const target=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(String(b.targetId||'')).first();if(!target||target.id===uid)return json({error:'INVALID_TARGET'},400);
   const id=crypto.randomUUID();const r=await env.DB.prepare(`INSERT INTO player_reports(id,reporter_id,target_id,reason,evidence,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM player_reports WHERE reporter_id=? AND created_at>?)<5 AND NOT EXISTS(SELECT 1 FROM player_reports WHERE reporter_id=? AND target_id=? AND created_at>?)`).bind(id,uid,target.id,reason,evidence,t,uid,t-DAY,uid,target.id,t-3600000).run();return r.meta.changes?json({ok:true,id},201):json({error:'REPORT_LIMIT'},429);
  }
  if(path==='/api/crews'&&request.method==='GET')return json(await overview(env,uid,(url.searchParams.get('search')||'').trim().slice(0,24)));
  if(request.method!=='POST')return json({error:'NOT_FOUND'},404);
  await settleCrews(env,t);const b=await request.json();
  if(path==='/api/crews/create'){
   const name=String(b.name||'').trim(),tag=String(b.tag||'').trim().toUpperCase(),privacy=validPrivacy(b.privacy);if(!/^[\p{L}\p{N} _-]{3,24}$/u.test(name)||!/^[A-Z0-9]{2,5}$/.test(tag)||!EMBLEMS.includes(b.emblem)||!COLORS.includes(b.color))return json({error:'INVALID_CREW'},400);
   const id=crypto.randomUUID();await env.DB.batch([
    env.DB.prepare(`INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM crew_members WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM crew_cooldowns WHERE user_id=? AND until_at>?) AND EXISTS(SELECT 1 FROM player_saves WHERE user_id=? AND json_extract(save_json,'$.credits')>=?)`).bind(id,name,tag,b.emblem,b.color,uid,t,uid,uid,t,uid,COST),
    env.DB.prepare('INSERT INTO crew_settings(crew_id,privacy,updated_at) SELECT id,?,? FROM crews WHERE id=?').bind(privacy,t,id),
    env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',json_extract(save_json,'$.credits')-?),revision=revision+1,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM crews WHERE id=?)`).bind(COST,t,uid,id),
    env.DB.prepare('INSERT INTO crew_members(user_id,crew_id,joined_at) SELECT ?,id,? FROM crews WHERE id=?').bind(uid,t,id)
   ]);if(!(await crewIdentity(env,uid)))return json({error:'CREATE_UNAVAILABLE'},409);return json(await overview(env,uid));
  }
  if(path==='/api/crews/settings'){
   const name=String(b.name||'').trim(),tag=String(b.tag||'').trim().toUpperCase(),privacy=validPrivacy(b.privacy);if(!/^[\p{L}\p{N} _-]{3,24}$/u.test(name)||!/^[A-Z0-9]{2,5}$/.test(tag)||!EMBLEMS.includes(b.emblem)||!COLORS.includes(b.color))return json({error:'INVALID_CREW'},400);
   const r=await env.DB.prepare('UPDATE crews SET name=?,tag=?,emblem=?,color=? WHERE leader_id=?').bind(name,tag,b.emblem,b.color,uid).run();if(!r.meta.changes)return json({error:'LEADER_REQUIRED'},403);
   await env.DB.prepare(`INSERT INTO crew_settings(crew_id,privacy,updated_at) SELECT id,?,? FROM crews WHERE leader_id=? ON CONFLICT(crew_id) DO UPDATE SET privacy=excluded.privacy,updated_at=excluded.updated_at`).bind(privacy,t,uid).run();return json(await overview(env,uid));
  }
  if(path==='/api/crews/join'){
   const crewId=String(b.crewId||'');const target=await env.DB.prepare(`SELECT c.id,COALESCE((SELECT privacy FROM crew_settings s WHERE s.crew_id=c.id),'public') privacy,(SELECT COUNT(*) FROM crew_members m WHERE m.crew_id=c.id) members FROM crews c WHERE c.id=?`).bind(crewId).first();if(!target||target.members>=20)return json({error:'JOIN_UNAVAILABLE'},409);
   if(target.privacy==='private'){
    const r=await env.DB.prepare(`INSERT OR IGNORE INTO crew_join_requests(crew_id,user_id,created_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM crew_members WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM crew_cooldowns WHERE user_id=? AND until_at>?)`).bind(crewId,uid,t,uid,uid,t).run();
    const out=await overview(env,uid);return json({...out,requestPending:true,requestCreated:!!r.meta.changes});
   }
   const r=await env.DB.prepare(`INSERT INTO crew_members(user_id,crew_id,joined_at) SELECT ?,id,? FROM crews WHERE id=? AND (SELECT COUNT(*) FROM crew_members WHERE crew_id=crews.id)<20 AND NOT EXISTS(SELECT 1 FROM crew_members WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM crew_cooldowns WHERE user_id=? AND until_at>?)`).bind(uid,t,crewId,uid,uid,t).run();if(!r.meta.changes)return json({error:'JOIN_UNAVAILABLE'},409);await env.DB.prepare('DELETE FROM crew_join_requests WHERE user_id=?').bind(uid).run();return json(await overview(env,uid));
  }
  if(path==='/api/crews/requests/approve'){
   const applicant=String(b.userId||'');const r=await env.DB.prepare(`INSERT INTO crew_members(user_id,crew_id,joined_at) SELECT r.user_id,r.crew_id,? FROM crew_join_requests r JOIN crews c ON c.id=r.crew_id WHERE r.user_id=? AND c.leader_id=? AND (SELECT COUNT(*) FROM crew_members WHERE crew_id=r.crew_id)<20 AND NOT EXISTS(SELECT 1 FROM crew_members WHERE user_id=r.user_id) AND NOT EXISTS(SELECT 1 FROM crew_cooldowns WHERE user_id=r.user_id AND until_at>?)`).bind(t,applicant,uid,t).run();if(!r.meta.changes)return json({error:'JOIN_APPROVAL_UNAVAILABLE'},409);await env.DB.prepare('DELETE FROM crew_join_requests WHERE user_id=?').bind(applicant).run();return json(await overview(env,uid));
  }
  if(path==='/api/crews/requests/reject'){
   const r=await env.DB.prepare('DELETE FROM crew_join_requests WHERE user_id=? AND crew_id IN(SELECT id FROM crews WHERE leader_id=?)').bind(String(b.userId||''),uid).run();if(!r.meta.changes)return json({error:'JOIN_REQUEST_NOT_FOUND'},404);return json(await overview(env,uid));
  }
  if(path==='/api/crews/leave'){
   const mine=await crewIdentity(env,uid);if(!mine)return json({error:'NO_CREW'},400);const crew=await env.DB.prepare('SELECT leader_id FROM crews WHERE id=?').bind(mine.id).first();if(crew.leader_id===uid)return json({error:'LEADER_TRANSFER_FIRST'},400);
   await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO crew_cooldowns(user_id,until_at) VALUES(?,?)').bind(uid,t+DAY),env.DB.prepare('DELETE FROM crew_members WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM crews WHERE leader_id=?)').bind(uid,uid),env.DB.prepare('DELETE FROM crew_join_requests WHERE user_id=?').bind(uid)]);return json(await overview(env,uid));
  }
  if(path==='/api/crews/transfer'){
   const r=await env.DB.prepare(`UPDATE crews SET leader_id=? WHERE leader_id=? AND EXISTS(SELECT 1 FROM crew_members m WHERE m.user_id=? AND m.crew_id=crews.id)`).bind(String(b.userId||''),uid,String(b.userId||'')).run();return r.meta.changes?json(await overview(env,uid)):json({error:'INVALID_TARGET'},400);
  }
  if(path==='/api/crews/disband'){
   const mine=await crewIdentity(env,uid);if(!mine)return json({error:'NO_CREW'},400);
   await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO crew_cooldowns(user_id,until_at) SELECT ?,? FROM crews WHERE id=? AND leader_id=? AND (SELECT COUNT(*) FROM crew_members WHERE crew_id=crews.id)=1').bind(uid,t+DAY,mine.id,uid),env.DB.prepare('DELETE FROM crew_members WHERE user_id=? AND crew_id IN(SELECT id FROM crews WHERE leader_id=? AND (SELECT COUNT(*) FROM crew_members WHERE crew_id=crews.id)=1)').bind(uid,uid),env.DB.prepare('DELETE FROM crews WHERE id=? AND leader_id=? AND NOT EXISTS(SELECT 1 FROM crew_members WHERE crew_id=crews.id)').bind(mine.id,uid)]);
   if(await crewIdentity(env,uid))return json({error:'CREW_NOT_EMPTY'},400);return json(await overview(env,uid));
  }
  return json({error:'NOT_FOUND'},404);
 }catch(e){if(!String(e.message).includes('UNIQUE'))console.error('crews/reports',e);return json({error:String(e.message).includes('UNIQUE')?'CREW_NAME_TAKEN':'CREW_SERVER_ERROR'},String(e.message).includes('UNIQUE')?409:500);}
}
