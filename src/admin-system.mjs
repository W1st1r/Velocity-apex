import {currentSession,requireAdmin,ensureAdminSchema,accountDetail,audit,mutateTargetSave,banResponse} from './auth.mjs';
import {queryGameLogs,ensureGameLogs} from './logs.mjs';
import {handleBugReportRequest} from './bug-reports.mjs';

const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const now=()=>Date.now();
const DAY_MS=86400000;
const ADMIN_DAY_OFFSET_MS=3*60*60*1000;
const RANKS=Object.freeze({
  1:{name:'HELPER',label:'Helper',norm:12,base:600,maxMuteMs:0,maxBanMs:0,manageBelow:0},
  2:{name:'MODER',label:'Moder',norm:16,base:1200,maxMuteMs:60*60*1000,maxBanMs:0,manageBelow:0},
  3:{name:'ST.MODER',label:'St.Moder',norm:20,base:2000,maxMuteMs:24*60*60*1000,maxBanMs:0,manageBelow:0},
  4:{name:'ADMIN',label:'Admin',norm:24,base:3000,maxMuteMs:24*60*60*1000,maxBanMs:7*DAY_MS,manageBelow:0},
  5:{name:'ST.ADMIN',label:'ST.Admin',norm:28,base:3600,maxMuteMs:30*DAY_MS,maxBanMs:30*DAY_MS,manageBelow:4},
  6:{name:'CURATOR',label:'Curator',norm:32,base:4000,maxMuteMs:365*DAY_MS,maxBanMs:365*DAY_MS,manageBelow:5},
  7:{name:'GL.ADMIN',label:'GL.Admin',norm:36,base:5000,maxMuteMs:365*DAY_MS,maxBanMs:10*365*DAY_MS,manageBelow:6},
  8:{name:'ROOT',label:'ROOT',norm:40,base:6000,maxMuteMs:100*365*DAY_MS,maxBanMs:100*365*DAY_MS,manageBelow:7}
});
const schema=new WeakMap();

function dayKey(ts=now()){return new Date(ts+ADMIN_DAY_OFFSET_MS).toISOString().slice(0,10);}
function dayBounds(day=dayKey()){const start=Date.parse(day+'T00:00:00.000Z')-ADMIN_DAY_OFFSET_MS;return {start,end:start+DAY_MS};}
function dayStart(ts=now()){return dayBounds(dayKey(ts)).start;}
function clean(v,max=4000){return String(v||'').trim().replace(/\r/g,'').slice(0,max);}
function safeCategory(v){return clean(v,48).replace(/[^\p{L}\p{N}_\- ]/gu,'').slice(0,48)||'Другое';}
function publicTicket(row){
  let evidence=[];try{evidence=JSON.parse(row.evidence_json||'[]');}catch{}
  return {id:row.id,no:Number(row.ticket_no)||0,type:row.type,reporterId:row.reporter_user_id,reporter:row.reporter_username||'',targetId:row.target_user_id||null,target:row.target_username||'',targetAdminId:row.target_admin_user_id||null,targetAdmin:row.target_admin_username||'',category:row.category,description:row.description,evidence:Array.isArray(evidence)?evidence.slice(0,3):[],status:row.status,assignedAdminId:row.assigned_admin_id||null,assignedAdmin:row.assigned_admin_username||'',createdAt:Number(row.created_at)||0,updatedAt:Number(row.updated_at)||0,closedAt:Number(row.closed_at)||0};
}
function salaryFor(level,points){const rank=RANKS[level]||RANKS[1],ratio=rank.norm?points/rank.norm:0,pct=ratio<.5?.5:ratio<.8?.7:ratio<1?.9:1;return {amount:Math.round(rank.base*pct),percent:Math.round(pct*100),completion:Math.round(ratio*100),base:rank.base,norm:rank.norm};}
async function readBody(request){try{return await request.json();}catch{return {};}}
function sameOrigin(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}

export async function ensureAdminSystem(env){
  if(!env.DB)return;
  let p=schema.get(env.DB);if(p)return p;
  p=(async()=>{
    await ensureAdminSchema(env);
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_admins (
        user_id TEXT PRIMARY KEY, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 8), active INTEGER NOT NULL DEFAULT 1,
        appointed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, appointed_by TEXT NOT NULL,
        suspended_until INTEGER NOT NULL DEFAULT 0, suspension_reason TEXT NOT NULL DEFAULT '', suspended_by TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_admins_active_level ON staff_admins(active,level)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_admin_warnings (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,reason TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,resolved_at INTEGER,resolved_by TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_warnings_user ON staff_admin_warnings(user_id,active,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_admin_notes (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,note TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_notes_user ON staff_admin_notes(user_id,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS support_tickets (
        ticket_no INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,type TEXT NOT NULL,reporter_user_id TEXT NOT NULL,target_user_id TEXT,target_admin_user_id TEXT,
        category TEXT NOT NULL,description TEXT NOT NULL,evidence_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'new',assigned_admin_id TEXT,
        created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,closed_at INTEGER,
        FOREIGN KEY(reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(target_admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_support_queue ON support_tickets(type,status,created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_support_reporter ON support_tickets(reporter_user_id,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS support_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT NOT NULL,author_user_id TEXT NOT NULL,author_role TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL,
        FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_mutes (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,created_by TEXT NOT NULL,ticket_id TEXT,revoked_at INTEGER,revoked_by TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_mutes_active ON player_mutes(user_id,revoked_at,expires_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_daily_work (
        user_id TEXT NOT NULL,day TEXT NOT NULL,questions_closed INTEGER NOT NULL DEFAULT 0,reports_closed INTEGER NOT NULL DEFAULT 0,active_ms INTEGER NOT NULL DEFAULT 0,
        reopened INTEGER NOT NULL DEFAULT 0,reversed_actions INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,day))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_presence (
        user_id TEXT PRIMARY KEY,last_heartbeat INTEGER NOT NULL,last_day TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_reports (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,day TEXT NOT NULL,level INTEGER NOT NULL,snapshot_json TEXT NOT NULL,calculated_salary INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',owner_comment TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,reviewed_at INTEGER,reviewed_by TEXT,paid_amount INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,day),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_reports_status ON staff_reports(status,created_at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_actions (
        id TEXT PRIMARY KEY,admin_user_id TEXT NOT NULL,target_user_id TEXT,action TEXT NOT NULL,reason TEXT NOT NULL,duration_ms INTEGER NOT NULL DEFAULT 0,ticket_id TEXT,created_at INTEGER NOT NULL,revoked_at INTEGER,revoked_by TEXT)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_actions_admin ON staff_actions(admin_user_id,created_at)')
    ]);
  })().catch(e=>{schema.delete(env.DB);throw e;});schema.set(env.DB,p);return p;
}

async function staffRow(env,userId){return env.DB.prepare(`SELECT s.*,u.username,u.display_name FROM staff_admins s JOIN users u ON u.id=s.user_id WHERE s.user_id=? AND s.active=1 LIMIT 1`).bind(userId).first();}
function staffSuspended(row,t=now()){return !!row&&Number(row.suspended_until||0)>t;}
function canManageLevel(actorLevel,targetLevel){const actor=RANKS[Number(actorLevel)];return !!actor&&Number(targetLevel)>=1&&Number(targetLevel)<=Number(actor.manageBelow||0);}
async function staffNotes(env,userId){const r=await env.DB.prepare(`SELECT n.id,n.note,n.created_at,n.created_by,u.username created_by_username FROM staff_admin_notes n LEFT JOIN users u ON u.id=n.created_by WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 30`).bind(userId).all();return (r.results||[]).map(x=>({id:x.id,note:x.note,createdAt:Number(x.created_at)||0,createdBy:x.created_by,createdByUsername:x.created_by_username||''}));}
async function publicStaffCard(env,row,day=dayKey()){
  const level=Number(row.level)||0,work=await workSnapshot(env,row.user_id,level,day),warnings=await activeWarnings(env,row.user_id),notes=await staffNotes(env,row.user_id);
  return {id:row.user_id,username:row.username,displayName:row.display_name,level,rank:RANKS[level],appointedAt:Number(row.appointed_at)||0,active:Number(row.active)!==0,suspendedUntil:Number(row.suspended_until)||0,suspensionReason:row.suspension_reason||'',suspended:staffSuspended(row),warnings,notes,work};
}
async function requireUser(env,request){const session=await currentSession(env,request);if(!session)return {error:json({error:'AUTH_REQUIRED'},401)};const banned=await banResponse(env,session.user);if(banned)return {error:banned};return {session};}
async function requireStaff(env,request,min=1){const access=await requireUser(env,request);if(access.error)return access;const staff=await staffRow(env,access.session.user.id);if(!staff||Number(staff.level)<min)return {error:json({error:'STAFF_REQUIRED'},403)};if(staffSuspended(staff))return {error:json({error:'STAFF_SUSPENDED',suspendedUntil:Number(staff.suspended_until)||0,reason:staff.suspension_reason||''},403)};return {...access,staff,level:Number(staff.level)};}
async function userByUsername(env,username){const u=clean(username,32).replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(u))return null;return env.DB.prepare('SELECT id,username,display_name FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(u).first();}
async function ticketRow(env,id){return env.DB.prepare(`SELECT t.*,ru.username reporter_username,tu.username target_username,au.username target_admin_username,sa.username assigned_admin_username
    FROM support_tickets t JOIN users ru ON ru.id=t.reporter_user_id LEFT JOIN users tu ON tu.id=t.target_user_id LEFT JOIN users au ON au.id=t.target_admin_user_id LEFT JOIN users sa ON sa.id=t.assigned_admin_id WHERE t.id=? LIMIT 1`).bind(id).first();}
async function ticketMessages(env,id){const r=await env.DB.prepare(`SELECT m.id,m.author_user_id,m.author_role,m.message,m.created_at,u.username FROM support_messages m JOIN users u ON u.id=m.author_user_id WHERE m.ticket_id=? ORDER BY m.created_at ASC LIMIT 200`).bind(id).all();return (r.results||[]).map(x=>({id:Number(x.id),authorId:x.author_user_id,author:x.username,role:x.author_role,message:x.message,createdAt:Number(x.created_at)||0}));}
async function activeWarnings(env,userId){const r=await env.DB.prepare('SELECT id,reason,created_at FROM staff_admin_warnings WHERE user_id=? AND active=1 ORDER BY created_at DESC').bind(userId).all();return (r.results||[]).map(x=>({id:x.id,reason:x.reason,createdAt:Number(x.created_at)||0}));}
async function dailyWork(env,userId,day=dayKey()){const row=await env.DB.prepare('SELECT * FROM staff_daily_work WHERE user_id=? AND day=?').bind(userId,day).first();return {questions:Number(row?.questions_closed)||0,reports:Number(row?.reports_closed)||0,activeMs:Number(row?.active_ms)||0,reopened:Number(row?.reopened)||0,reversed:Number(row?.reversed_actions)||0};}
async function handledTickets(env,userId,start,end){
  try{const r=await env.DB.prepare(`SELECT
      SUM(CASE WHEN type='question' THEN 1 ELSE 0 END) questions,
      SUM(CASE WHEN type='player' THEN 1 ELSE 0 END) reports
    FROM support_tickets
    WHERE assigned_admin_id=? AND closed_at>=? AND closed_at<? AND status IN ('resolved','rejected') AND type IN ('question','player')`).bind(userId,start,end).first();
    return {questions:Number(r?.questions)||0,reports:Number(r?.reports)||0};
  }catch{return {questions:0,reports:0};}
}
async function verifiedReferrals(env,userId,start=dayStart(),end=start+DAY_MS){
  try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM referrals WHERE inviter_user_id=? AND status='rewarded' AND created_at>=? AND created_at<?`).bind(userId,start,end).first();return Number(r?.n)||0;}catch{return 0;}
}
async function workSnapshot(env,userId,level,day=dayKey()){
  const work=await dailyWork(env,userId,day),bounds=dayBounds(day),handled=await handledTickets(env,userId,bounds.start,bounds.end),refs=await verifiedReferrals(env,userId,bounds.start,bounds.end);
  const questions=handled.questions,reports=handled.reports,onlinePoints=Math.min(4,Math.floor(work.activeMs/(30*60*1000))),refPoints=Math.min(3,refs),points=Math.max(0,questions+reports*2+onlinePoints+refPoints-work.reversed*2-work.reopened);
  return {day,dayStart:bounds.start,dayEnd:bounds.end,timezone:'UTC+03:00',level,questions,reports,activeMs:work.activeMs,referrals:refs,onlinePoints,referralPoints:refPoints,reopened:work.reopened,reversedActions:work.reversed,points,...salaryFor(level,points)};
}
async function bumpClosed(env,userId,type){const day=dayKey(),q=type==='question'?1:0,r=type==='player'?1:0,t=now();await env.DB.prepare(`INSERT INTO staff_daily_work (user_id,day,questions_closed,reports_closed,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET questions_closed=questions_closed+excluded.questions_closed,reports_closed=reports_closed+excluded.reports_closed,updated_at=excluded.updated_at`).bind(userId,day,q,r,t).run();}
export async function recordStaffRuntimeHeartbeat(env,userId,t=now()){
  if(!env?.DB||!userId)return {staff:false,addedMs:0};
  await ensureAdminSystem(env);
  const staff=await env.DB.prepare('SELECT suspended_until FROM staff_admins WHERE user_id=? AND active=1 LIMIT 1').bind(userId).first();
  if(!staff||Number(staff.suspended_until||0)>t)return {staff:false,addedMs:0};
  const day=dayKey(t),p=await env.DB.prepare('SELECT last_heartbeat,last_day FROM staff_presence WHERE user_id=?').bind(userId).first();
  let delta=0;if(p&&p.last_day===day){const d=t-Number(p.last_heartbeat||0);if(d>0&&d<=90000)delta=Math.min(d,60000);}
  await env.DB.batch([
    env.DB.prepare('INSERT INTO staff_presence (user_id,last_heartbeat,last_day) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_heartbeat=excluded.last_heartbeat,last_day=excluded.last_day').bind(userId,t,day),
    env.DB.prepare('INSERT INTO staff_daily_work (user_id,day,active_ms,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET active_ms=active_ms+excluded.active_ms,updated_at=excluded.updated_at').bind(userId,day,delta,t)
  ]);
  return {staff:true,day,addedMs:delta};
}
async function addMessage(env,ticketId,user,role,message){const text=clean(message,2000);if(!text)return;await env.DB.prepare('INSERT INTO support_messages (ticket_id,author_user_id,author_role,message,created_at) VALUES (?,?,?,?,?)').bind(ticketId,user.id,role,text,now()).run();}

async function supportRoutes(request,env,url){
  const access=await requireUser(env,request);if(access.error)return access.error;const me=access.session.user;
  if(url.pathname==='/api/support/me'&&request.method==='GET'){
    const staff=await staffRow(env,me.id),warnings=staff?await activeWarnings(env,me.id):[];return json({ok:true,user:me,owner:!!me.isAdmin,staff:staff?{level:Number(staff.level),rank:RANKS[Number(staff.level)],warnings,suspended:staffSuspended(staff),suspendedUntil:Number(staff.suspended_until)||0,suspensionReason:staff.suspension_reason||''}:null});
  }
  if(url.pathname==='/api/support/tickets'&&request.method==='GET'){
    const r=await env.DB.prepare(`SELECT t.*,ru.username reporter_username,tu.username target_username,au.username target_admin_username,sa.username assigned_admin_username FROM support_tickets t JOIN users ru ON ru.id=t.reporter_user_id LEFT JOIN users tu ON tu.id=t.target_user_id LEFT JOIN users au ON au.id=t.target_admin_user_id LEFT JOIN users sa ON sa.id=t.assigned_admin_id WHERE t.reporter_user_id=? ORDER BY t.created_at DESC LIMIT 100`).bind(me.id).all();return json({ok:true,tickets:(r.results||[]).map(publicTicket)});
  }
  if(url.pathname==='/api/support/tickets'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const b=await readBody(request),type=['question','player','admin'].includes(b.type)?b.type:'';if(!type)return json({error:'INVALID_TICKET_TYPE'},400);
    const description=clean(b.description,4000);if(description.length<5)return json({error:'DESCRIPTION_REQUIRED'},400);let target=null;
    if(type!=='question'){target=await userByUsername(env,b.targetUsername);if(!target)return json({error:'TARGET_NOT_FOUND'},404);if(target.id===me.id)return json({error:'CANNOT_REPORT_SELF'},400);}
    if(type==='admin'){const st=await staffRow(env,target.id);if(!st)return json({error:'TARGET_NOT_STAFF'},400);}
    let evidence=Array.isArray(b.evidence)?b.evidence.slice(0,3).map(x=>clean(x,280000)).filter(Boolean):[];const evidenceJson=JSON.stringify(evidence);if(evidenceJson.length>850000)return json({error:'EVIDENCE_TOO_LARGE'},413);
    const id=crypto.randomUUID(),t=now(),category=safeCategory(b.category);const inserted=await env.DB.prepare(`INSERT INTO support_tickets (id,type,reporter_user_id,target_user_id,target_admin_user_id,category,description,evidence_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,type,me.id,type==='player'?target?.id:null,type==='admin'?target?.id:null,category,description,evidenceJson,'new',t,t).run();const no=Number(inserted?.meta?.last_row_id)||0;return json({ok:true,ticket:{id,no,type,reporterId:me.id,reporter:me.username||'',targetId:type==='player'?target?.id:null,target:type==='player'?(target?.username||''):'',targetAdminId:type==='admin'?target?.id:null,targetAdmin:type==='admin'?(target?.username||''):'',category,description,evidence,status:'new',assignedAdminId:null,assignedAdmin:'',createdAt:t,updatedAt:t,closedAt:0}},201);
  }
  const detail=url.pathname.match(/^\/api\/support\/tickets\/([0-9a-f-]{20,64})$/i);
  if(detail&&request.method==='GET'){const row=await ticketRow(env,detail[1]);if(!row||row.reporter_user_id!==me.id)return json({error:'TICKET_NOT_FOUND'},404);return json({ok:true,ticket:publicTicket(row),messages:await ticketMessages(env,row.id)});}
  const reply=url.pathname.match(/^\/api\/support\/tickets\/([0-9a-f-]{20,64})\/reply$/i);
  if(reply&&request.method==='POST'){if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const row=await ticketRow(env,reply[1]);if(!row||row.reporter_user_id!==me.id)return json({error:'TICKET_NOT_FOUND'},404);if(['resolved','rejected'].includes(row.status))return json({error:'TICKET_CLOSED'},409);const b=await readBody(request),message=clean(b.message,2000);if(!message)return json({error:'MESSAGE_REQUIRED'},400);await addMessage(env,row.id,me,'player',message);await env.DB.prepare("UPDATE support_tickets SET status=CASE WHEN status='waiting_player' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=?").bind(now(),row.id).run();return json({ok:true});}
  return json({error:'NOT_FOUND'},404);
}

const ADMIN_FREE_SERVERS=Object.freeze(['city-01','city-02','city-03']);
async function roomAdminCall(env,path,body={}){
  if(!env.ROOMS)return [];
  return Promise.all(ADMIN_FREE_SERVERS.map(async server=>{
    try{
      const stub=env.ROOMS.get(env.ROOMS.idFromName('FREE:'+server));
      const r=await stub.fetch(new Request('https://room.internal'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
      const data=await r.json().catch(()=>({}));
      return {server,ok:r.ok,...data};
    }catch(e){return {server,ok:false,error:'ROOM_UNAVAILABLE'};}
  }));
}
async function staffManagementRows(env,actorLevel){
  const max=Math.max(0,Number(RANKS[actorLevel]?.manageBelow)||0);
  if(!max)return [];
  const rows=(await env.DB.prepare(`SELECT s.*,u.username,u.display_name,p.last_heartbeat
    FROM staff_admins s JOIN users u ON u.id=s.user_id LEFT JOIN staff_presence p ON p.user_id=s.user_id
    WHERE s.active=1 AND s.level<=? ORDER BY s.level DESC,lower(u.username)`).bind(max).all()).results||[];
  const out=[];
  for(const row of rows){
    const card=await publicStaffCard(env,row);
    card.online=Number(row.last_heartbeat||0)>now()-90000&&!card.suspended;
    const accepted=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE user_id=? AND status='accepted'").bind(row.user_id).first();
    const rejected=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE user_id=? AND status='rejected'").bind(row.user_id).first();
    const paid=await env.DB.prepare("SELECT COALESCE(SUM(paid_amount),0) n FROM staff_reports WHERE user_id=?").bind(row.user_id).first();
    card.acceptedReports=Number(accepted?.n)||0;card.rejectedReports=Number(rejected?.n)||0;card.totalSalary=Number(paid?.n)||0;
    out.push(card);
  }
  return out;
}
async function reviewManagedReport(env,manager,row,decision,comment=''){
  const target=await staffRow(env,row.user_id);
  if(!target||!canManageLevel(manager.level,Number(target.level)))return {error:'HIERARCHY_DENIED',status:403};
  if(decision==='rejected'&&clean(comment,800).length<3)return {error:'COMMENT_REQUIRED',status:400};
  const claimed=await env.DB.prepare("UPDATE staff_reports SET status='processing' WHERE id=? AND status='pending'").bind(row.id).run();
  if(Number(claimed?.meta?.changes||0)!==1)return {error:'REPORT_NOT_PENDING',status:409};
  let paid=0;
  if(decision==='accepted'){
    paid=Math.max(0,Math.min(RANKS[Number(row.level)]?.base||0,Number(row.calculated_salary)||0));
    const changed=await mutateTargetSave(env,row.user_id,save=>{const before=Math.max(0,Math.floor(Number(save.credits)||0));save.credits=Math.min(999999999,before+paid);return {before,after:save.credits,delta:save.credits-before};});
    if(changed.error){await env.DB.prepare("UPDATE staff_reports SET status='pending' WHERE id=? AND status='processing'").bind(row.id).run();return {error:changed.error,status:409};}
    paid=changed.result.delta;
  }
  const t=now(),note=clean(comment,800);
  await env.DB.prepare("UPDATE staff_reports SET status=?,owner_comment=?,reviewed_at=?,reviewed_by=?,paid_amount=? WHERE id=? AND status='processing'").bind(decision,note,t,manager.user.id,paid,row.id).run();
  await audit(env,manager.user.id,row.user_id,'admin_report_'+decision,{reportId:row.id,calculatedSalary:Number(row.calculated_salary),paidAmount:paid,comment:note,reviewerLevel:manager.level});
  return {ok:true,status:decision,paidAmount:paid};
}
async function managementRoutes(request,env,url,access){
  const me=access.session.user,level=access.level,manageBelow=Number(RANKS[level]?.manageBelow)||0;
  if(url.pathname==='/api/staff-admin/management/summary'&&request.method==='GET'){
    if(level<5)return json({error:'INSUFFICIENT_LEVEL'},403);
    const staff=await staffManagementRows(env,level);
    let reports=[];
    if(level>=6&&manageBelow>0){
      const r=await env.DB.prepare(`SELECT r.*,u.username,u.display_name,s.level current_level FROM staff_reports r JOIN users u ON u.id=r.user_id LEFT JOIN staff_admins s ON s.user_id=r.user_id AND s.active=1 WHERE r.status='pending' AND COALESCE(s.level,99)<=? ORDER BY r.day DESC,r.created_at ASC LIMIT 100`).bind(manageBelow).all();
      reports=(r.results||[]).map(x=>{let snapshot={};try{snapshot=JSON.parse(x.snapshot_json);}catch{}return {id:x.id,userId:x.user_id,username:x.username,displayName:x.display_name,day:x.day,level:Number(x.level),currentLevel:Number(x.current_level)||0,snapshot,calculatedSalary:Number(x.calculated_salary)||0,status:x.status};});
    }
    const actions=(await env.DB.prepare(`SELECT a.*,u.username admin_username,tu.username target_username,s.level admin_level FROM staff_actions a JOIN users u ON u.id=a.admin_user_id LEFT JOIN users tu ON tu.id=a.target_user_id LEFT JOIN staff_admins s ON s.user_id=a.admin_user_id WHERE COALESCE(s.level,0)<=? ORDER BY a.created_at DESC LIMIT 80`).bind(Math.max(1,manageBelow)).all()).results||[];
    return json({ok:true,actor:{level,rank:RANKS[level],manageBelow},staff,reports,actions:actions.map(a=>({id:a.id,adminId:a.admin_user_id,admin:a.admin_username,adminLevel:Number(a.admin_level)||0,targetId:a.target_user_id||null,target:a.target_username||'',action:a.action,reason:a.reason,durationMs:Number(a.duration_ms)||0,createdAt:Number(a.created_at)||0,revokedAt:Number(a.revoked_at)||0,revokedBy:a.revoked_by||null}))});
  }
  if(url.pathname==='/api/staff-admin/management/assign'&&request.method==='POST'){
    if(level<6)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const b=await readBody(request),newLevel=Number(b.level),target=await userByUsername(env,b.username);
    if(!target)return json({error:'USER_NOT_FOUND'},404);if(target.id===me.id||target.username.toLowerCase()==='w1st1r')return json({error:'HIERARCHY_DENIED'},403);
    if(!canManageLevel(level,newLevel))return json({error:'HIERARCHY_DENIED'},403);
    const current=await staffRow(env,target.id);if(current&&!canManageLevel(level,Number(current.level)))return json({error:'HIERARCHY_DENIED'},403);
    const t=now();
    await env.DB.prepare(`INSERT INTO staff_admins (user_id,level,active,appointed_at,updated_at,appointed_by,suspended_until,suspension_reason,suspended_by)
      VALUES (?,?,1,?,?,?,0,'',NULL)
      ON CONFLICT(user_id) DO UPDATE SET level=excluded.level,active=1,updated_at=excluded.updated_at,appointed_by=excluded.appointed_by,suspended_until=0,suspension_reason='',suspended_by=NULL`).bind(target.id,newLevel,t,t,me.id).run();
    await audit(env,me.id,target.id,current?'admin_rank_change':'admin_appointed',{before:current?Number(current.level):0,after:newLevel,managerLevel:level});return json({ok:true});
  }
  const m=url.pathname.match(/^\/api\/staff-admin\/management\/staff\/([0-9a-f-]{16,64})\/(rank|remove|warning|note|suspend|resume)$/i);
  if(m&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const target=await staffRow(env,m[1]);if(!target)return json({error:'STAFF_NOT_FOUND'},404);
    if(!canManageLevel(level,Number(target.level)))return json({error:'HIERARCHY_DENIED'},403);
    const action=m[2],b=await readBody(request),t=now();
    if(action==='note'){
      if(level<5)return json({error:'INSUFFICIENT_LEVEL'},403);const note=clean(b.note,500);if(note.length<3)return json({error:'NOTE_REQUIRED'},400);
      const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO staff_admin_notes (id,user_id,note,created_at,created_by) VALUES (?,?,?,?,?)').bind(id,target.user_id,note,t,me.id).run();await audit(env,me.id,target.user_id,'admin_note',{id,note,managerLevel:level});return json({ok:true,id});
    }
    if(level<6)return json({error:'INSUFFICIENT_LEVEL'},403);
    if(action==='rank'){
      const newLevel=Number(b.level);if(!canManageLevel(level,newLevel))return json({error:'HIERARCHY_DENIED'},403);
      await env.DB.prepare('UPDATE staff_admins SET level=?,updated_at=? WHERE user_id=? AND active=1').bind(newLevel,t,target.user_id).run();await audit(env,me.id,target.user_id,'admin_rank_change',{before:Number(target.level),after:newLevel,managerLevel:level});return json({ok:true});
    }
    if(action==='remove'){
      await env.DB.prepare("UPDATE staff_admins SET active=0,updated_at=?,suspended_until=0,suspension_reason='',suspended_by=NULL WHERE user_id=?").bind(t,target.user_id).run();await audit(env,me.id,target.user_id,'admin_removed',{level:Number(target.level),managerLevel:level});return json({ok:true});
    }
    if(action==='warning'){
      const reason=clean(b.reason,240);if(reason.length<3)return json({error:'REASON_REQUIRED'},400);const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO staff_admin_warnings (id,user_id,reason,active,created_at,created_by) VALUES (?,?,?,1,?,?)').bind(id,target.user_id,reason,t,me.id).run();await audit(env,me.id,target.user_id,'admin_warning',{id,reason,managerLevel:level});return json({ok:true,id});
    }
    if(action==='suspend'){
      const reason=clean(b.reason,240),durationMs=Math.max(60_000,Math.min(30*DAY_MS,Math.floor(Number(b.durationMs)||0)));if(reason.length<3)return json({error:'REASON_REQUIRED'},400);
      await env.DB.prepare('UPDATE staff_admins SET suspended_until=?,suspension_reason=?,suspended_by=?,updated_at=? WHERE user_id=?').bind(t+durationMs,reason,me.id,t,target.user_id).run();await audit(env,me.id,target.user_id,'admin_suspended',{reason,durationMs,managerLevel:level});return json({ok:true,suspendedUntil:t+durationMs});
    }
    if(action==='resume'){
      await env.DB.prepare("UPDATE staff_admins SET suspended_until=0,suspension_reason='',suspended_by=NULL,updated_at=? WHERE user_id=?").bind(t,target.user_id).run();await audit(env,me.id,target.user_id,'admin_resumed',{managerLevel:level});return json({ok:true});
    }
  }
  const reportReview=url.pathname.match(/^\/api\/staff-admin\/management\/reports\/([0-9a-f-]{20,64})\/review$/i);
  if(reportReview&&request.method==='POST'){
    if(level<6)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const row=await env.DB.prepare("SELECT * FROM staff_reports WHERE id=? AND status='pending'").bind(reportReview[1]).first();if(!row)return json({error:'REPORT_NOT_PENDING'},409);
    const b=await readBody(request),decision=b.decision==='accepted'?'accepted':b.decision==='rejected'?'rejected':'';if(!decision)return json({error:'INVALID_DECISION'},400);
    const result=await reviewManagedReport(env,{user:me,level},row,decision,b.comment||'');if(result.error)return json({error:result.error},result.status||400);return json(result);
  }
  const revoke=url.pathname.match(/^\/api\/staff-admin\/management\/actions\/([0-9a-f-]{20,64})\/revoke$/i);
  if(revoke&&request.method==='POST'){
    if(level<5)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const row=await env.DB.prepare(`SELECT a.*,s.level admin_level FROM staff_actions a LEFT JOIN staff_admins s ON s.user_id=a.admin_user_id WHERE a.id=? LIMIT 1`).bind(revoke[1]).first();if(!row)return json({error:'ACTION_NOT_FOUND'},404);
    const creatorLevel=Number(row.admin_level)||0;if(creatorLevel>=level||creatorLevel<1)return json({error:'HIERARCHY_DENIED'},403);if(Number(row.revoked_at)||0)return json({error:'ACTION_ALREADY_REVOKED'},409);
    const t=now();if(row.action==='mute')await env.DB.prepare('UPDATE player_mutes SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL').bind(t,me.id,row.id).run();
    if(row.action==='ban')await env.DB.prepare('UPDATE account_bans SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL').bind(t,me.id,row.id).run();
    await env.DB.prepare('UPDATE staff_actions SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL').bind(t,me.id,row.id).run();
    const d=dayKey(t);await env.DB.prepare(`INSERT INTO staff_daily_work (user_id,day,reversed_actions,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id,day) DO UPDATE SET reversed_actions=reversed_actions+1,updated_at=excluded.updated_at`).bind(row.admin_user_id,d,t).run();
    await audit(env,me.id,row.target_user_id,'admin_action_revoked',{actionId:row.id,originalAction:row.action,originalAdminId:row.admin_user_id,managerLevel:level});return json({ok:true});
  }
  if(url.pathname==='/api/staff-admin/control/servers'&&request.method==='GET'){
    if(level<7)return json({error:'INSUFFICIENT_LEVEL'},403);const servers=await roomAdminCall(env,'/free/admin-status',{});return json({ok:true,servers,serverTime:now()});
  }
  if(url.pathname==='/api/staff-admin/control/kick'&&request.method==='POST'){
    if(level<5)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const b=await readBody(request),target=await userByUsername(env,b.username);if(!target)return json({error:'USER_NOT_FOUND'},404);
    const targetStaff=await staffRow(env,target.id);if(targetStaff&&Number(targetStaff.level)>=level)return json({error:'HIERARCHY_DENIED'},403);if(target.username.toLowerCase()==='w1st1r')return json({error:'HIERARCHY_DENIED'},403);
    const result=await roomAdminCall(env,'/free/admin-control',{action:'kick_user',userId:target.id,reason:clean(b.reason,160)||'Отключён администрацией'});
    await audit(env,me.id,target.id,'staff_server_kick',{reason:clean(b.reason,160),managerLevel:level,result});return json({ok:true,result,kicked:result.reduce((n,x)=>n+(Number(x.kicked)||0),0)});
  }
  if(url.pathname==='/api/staff-admin/control/announce'&&request.method==='POST'){
    if(level<7)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const b=await readBody(request),message=clean(b.message,220);if(message.length<3)return json({error:'MESSAGE_REQUIRED'},400);
    const result=await roomAdminCall(env,'/free/admin-control',{action:'announcement',message,by:me.username,adminLevel:level});await audit(env,me.id,null,'staff_announcement',{message,managerLevel:level});return json({ok:true,result});
  }
  if(url.pathname==='/api/staff-admin/control/clear-events'&&request.method==='POST'){
    if(level<7)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const result=await roomAdminCall(env,'/free/admin-control',{action:'clear_events',by:me.username,adminLevel:level});await audit(env,me.id,null,'staff_clear_events',{managerLevel:level});return json({ok:true,result});
  }
  if(url.pathname==='/api/staff-admin/control/events-disabled'&&request.method==='POST'){
    if(level<8)return json({error:'INSUFFICIENT_LEVEL'},403);if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const b=await readBody(request);if(typeof b.disabled!=='boolean')return json({error:'INVALID_VALUE'},400);
    const result=await roomAdminCall(env,'/free/admin-control',{action:'events_disabled',disabled:b.disabled,by:me.username,adminLevel:level});await audit(env,me.id,null,'staff_events_disabled',{disabled:b.disabled,managerLevel:level});return json({ok:true,result});
  }
  if(url.pathname==='/api/staff-admin/control/profile'&&request.method==='GET'){
    if(level<7)return json({error:'INSUFFICIENT_LEVEL'},403);const target=await userByUsername(env,url.searchParams.get('username')||'');if(!target)return json({error:'USER_NOT_FOUND'},404);const detail=await accountDetail(env,target.id);if(!detail)return json({error:'USER_NOT_FOUND'},404);
    const st=await staffRow(env,target.id);if(st&&Number(st.level)>=level)return json({error:'HIERARCHY_DENIED'},403);
    const referralStats=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='rewarded' THEN 1 ELSE 0 END) rewarded FROM referrals WHERE inviter_user_id=?").bind(target.id).first();
    return json({ok:true,profile:{user:detail.user,save:detail.save,ban:detail.ban,revision:detail.revision,updatedAt:detail.updatedAt,staff:st?{level:Number(st.level),rank:RANKS[Number(st.level)],suspended:staffSuspended(st),suspendedUntil:Number(st.suspended_until)||0}:null,referrals:{total:Number(referralStats?.total)||0,rewarded:Number(referralStats?.rewarded)||0}}});
  }
  if(url.pathname==='/api/staff-admin/control/logs'&&request.method==='GET'){
    if(level<7)return json({error:'INSUFFICIENT_LEVEL'},403);await ensureGameLogs(env);const category=url.searchParams.get('category')||'all',q=url.searchParams.get('q')||'',server=url.searchParams.get('server')||'',before=Number(url.searchParams.get('before')||0),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||40)));const result=await queryGameLogs(env,{category,q,server,before,limit});return json({ok:true,...result});
  }
  if(url.pathname==='/api/staff-admin/control/diagnostics'&&request.method==='GET'){
    if(level<8)return json({error:'INSUFFICIENT_LEVEL'},403);const [users,tickets,pending,staff]=await Promise.all([
      env.DB.prepare('SELECT COUNT(*) n FROM users').first(),env.DB.prepare("SELECT COUNT(*) n FROM support_tickets WHERE status NOT IN ('resolved','rejected')").first(),env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE status='pending'").first(),env.DB.prepare('SELECT COUNT(*) n FROM staff_admins WHERE active=1').first()
    ]);const servers=await roomAdminCall(env,'/free/admin-status',{});return json({ok:true,diagnostics:{users:Number(users?.n)||0,openTickets:Number(tickets?.n)||0,pendingReports:Number(pending?.n)||0,activeStaff:Number(staff?.n)||0,servers,serverTime:now()}});
  }
  return null;
}

async function staffRoutes(request,env,url){
  const access=await requireStaff(env,request,1);if(access.error)return access.error;const me=access.session.user,level=access.level;
  const managed=await managementRoutes(request,env,url,access);if(managed)return managed;
  if(url.pathname==='/api/staff-admin/heartbeat'&&request.method==='POST'){const beat=await recordStaffRuntimeHeartbeat(env,me.id);return json({ok:true,addedMs:beat.addedMs,day:beat.day});}
  if(url.pathname==='/api/staff-admin/dashboard'&&request.method==='GET'){
    const qTypes=level>=2?['question','player']:['question'];const placeholders=qTypes.map(()=>'?').join(',');const r=await env.DB.prepare(`SELECT t.*,ru.username reporter_username,tu.username target_username,au.username target_admin_username,sa.username assigned_admin_username FROM support_tickets t JOIN users ru ON ru.id=t.reporter_user_id LEFT JOIN users tu ON tu.id=t.target_user_id LEFT JOIN users au ON au.id=t.target_admin_user_id LEFT JOIN users sa ON sa.id=t.assigned_admin_id WHERE t.type IN (${placeholders}) AND t.status NOT IN ('resolved','rejected') ORDER BY CASE t.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,t.created_at ASC LIMIT 100`).bind(...qTypes).all();const snapshot=await workSnapshot(env,me.id,level);return json({ok:true,staff:{level,rank:RANKS[level],warnings:await activeWarnings(env,me.id)},snapshot,tickets:(r.results||[]).map(publicTicket)});
  }
  if(url.pathname==='/api/staff-admin/reports'&&request.method==='GET'){const r=await env.DB.prepare('SELECT * FROM staff_reports WHERE user_id=? ORDER BY day DESC LIMIT 60').bind(me.id).all();return json({ok:true,reports:(r.results||[]).map(x=>{let snapshot={};try{snapshot=JSON.parse(x.snapshot_json);}catch{}return {id:x.id,day:x.day,level:Number(x.level),snapshot,calculatedSalary:Number(x.calculated_salary),status:x.status,ownerComment:x.owner_comment||'',createdAt:Number(x.created_at)||0,reviewedAt:Number(x.reviewed_at)||0,paidAmount:Number(x.paid_amount)||0};})});}
  if(url.pathname==='/api/staff-admin/report/submit'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);const day=dayKey(),existing=await env.DB.prepare('SELECT id,status FROM staff_reports WHERE user_id=? AND day=?').bind(me.id,day).first();if(existing)return json({error:'REPORT_ALREADY_SUBMITTED',status:existing.status},409);const snapshot=await workSnapshot(env,me.id,level,day),id=crypto.randomUUID(),t=now();await env.DB.prepare('INSERT INTO staff_reports (id,user_id,day,level,snapshot_json,calculated_salary,status,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,me.id,day,level,JSON.stringify(snapshot),snapshot.amount,'pending',t).run();return json({ok:true,report:{id,day,snapshot,calculatedSalary:snapshot.amount,status:'pending'}},201);
  }
  const tmatch=url.pathname.match(/^\/api\/staff-admin\/tickets\/([0-9a-f-]{20,64})(?:\/(claim|message|resolve|punish))?$/i);
  if(tmatch){
    const id=tmatch[1],action=tmatch[2]||'detail',row=await ticketRow(env,id);if(!row||row.type==='admin'||(row.type==='player'&&level<2))return json({error:'TICKET_NOT_FOUND'},404);
    if(action==='detail'&&request.method==='GET')return json({ok:true,ticket:publicTicket(row),messages:await ticketMessages(env,id)});
    if(request.method!=='POST'||!sameOrigin(request))return json({error:request.method==='POST'?'ORIGIN_REJECTED':'METHOD_NOT_ALLOWED'},request.method==='POST'?403:405);
    if(action==='claim'){if(['resolved','rejected'].includes(row.status))return json({error:'TICKET_CLOSED'},409);const result=await env.DB.prepare("UPDATE support_tickets SET assigned_admin_id=?,status=CASE WHEN status='new' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=? AND (assigned_admin_id IS NULL OR assigned_admin_id=?)").bind(me.id,now(),id,me.id).run();if(Number(result?.meta?.changes||0)!==1)return json({error:'TICKET_ALREADY_ASSIGNED'},409);return json({ok:true});}
    const fresh=await ticketRow(env,id);if(fresh.assigned_admin_id!==me.id)return json({error:'CLAIM_REQUIRED'},409);
    if(action==='message'){const b=await readBody(request),message=clean(b.message,2000);if(!message)return json({error:'MESSAGE_REQUIRED'},400);await addMessage(env,id,me,'admin',message);if(b.waitingPlayer===true)await env.DB.prepare("UPDATE support_tickets SET status='waiting_player',updated_at=? WHERE id=?").bind(now(),id).run();return json({ok:true});}
    if(action==='resolve'){const b=await readBody(request),status=b.status==='rejected'?'rejected':'resolved',before=fresh.status;if(['resolved','rejected'].includes(before))return json({error:'TICKET_CLOSED'},409);if(clean(b.message,2000))await addMessage(env,id,me,'admin',b.message);const t=now();await env.DB.prepare('UPDATE support_tickets SET status=?,closed_at=?,updated_at=? WHERE id=?').bind(status,t,t,id).run();if(status==='resolved')await bumpClosed(env,me.id,fresh.type);await audit(env,me.id,fresh.target_user_id||fresh.reporter_user_id,'support_ticket_'+status,{ticketId:id,type:fresh.type});return json({ok:true});}
    if(action==='punish'){
      if(fresh.type!=='player'||!fresh.target_user_id)return json({error:'PUNISHMENT_NOT_ALLOWED'},400);const b=await readBody(request),kind=String(b.action||''),reason=clean(b.reason,240);let durationMs=Math.floor(Number(b.durationMs)||0);const permanent=b.permanent===true;if(reason.length<3)return json({error:'REASON_REQUIRED'},400);if(!['warning','mute','ban'].includes(kind))return json({error:'INVALID_PUNISHMENT'},400);if(kind==='warning'&&level<2)return json({error:'INSUFFICIENT_LEVEL'},403);
      if(String(fresh.target_username||'').toLowerCase()==='w1st1r')return json({error:'HIERARCHY_DENIED'},403);const targetStaff=await staffRow(env,fresh.target_user_id);if(targetStaff&&Number(targetStaff.level)>=level)return json({error:'HIERARCHY_DENIED'},403);
      const rank=RANKS[level];if(kind==='mute'){if(level<2||durationMs<1000||durationMs>rank.maxMuteMs)return json({error:'MUTE_LIMIT',maxMs:rank.maxMuteMs},403);}if(kind==='ban'){if(permanent&&level>=8)durationMs=rank.maxBanMs;if(permanent&&level<8)return json({error:'BAN_LIMIT',maxMs:rank.maxBanMs},403);if(level<4||durationMs<1000||durationMs>rank.maxBanMs)return json({error:'BAN_LIMIT',maxMs:rank.maxBanMs},403);}
      const aid=crypto.randomUUID(),t=now();if(kind==='mute'){await env.DB.prepare('INSERT INTO player_mutes (id,user_id,reason,created_at,expires_at,created_by,ticket_id) VALUES (?,?,?,?,?,?,?)').bind(aid,fresh.target_user_id,reason,t,t+durationMs,me.id,id).run();}
      if(kind==='ban'){await env.DB.prepare('UPDATE account_bans SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(t,me.id,fresh.target_user_id,t).run();await env.DB.prepare('INSERT INTO account_bans (id,user_id,reason,created_at,expires_at,created_by) VALUES (?,?,?,?,?,?)').bind(aid,fresh.target_user_id,reason,t,t+durationMs,me.id).run();}
      await env.DB.prepare('INSERT INTO staff_actions (id,admin_user_id,target_user_id,action,reason,duration_ms,ticket_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(aid,me.id,fresh.target_user_id,kind,reason,durationMs,id,t).run();await audit(env,me.id,fresh.target_user_id,kind,{reason,durationMs,ticketId:id,adminLevel:level});return json({ok:true,action:{id:aid,kind,reason,durationMs,expiresAt:durationMs?t+durationMs:0}});
    }
  }
  return json({error:'NOT_FOUND'},404);
}

async function ownerRoutes(request,env,url){
  const access=await requireAdmin(env,request);if(access.error)return access.error;const owner=access.session.user;if(request.method!=='GET'&&!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
  if(url.pathname==='/api/admin-system/owner/summary'&&request.method==='GET'){
    const today=dayKey(),bounds=dayBounds(today),t=now(),staff=(await env.DB.prepare(`SELECT s.user_id,s.level,s.appointed_at,s.suspended_until,s.suspension_reason,u.username,u.display_name,p.last_heartbeat FROM staff_admins s JOIN users u ON u.id=s.user_id LEFT JOIN staff_presence p ON p.user_id=s.user_id WHERE s.active=1 ORDER BY s.level DESC,lower(u.username)`).all()).results||[];const rows=[];
    for(const s of staff){const work=await workSnapshot(env,s.user_id,Number(s.level),today),warnings=await activeWarnings(env,s.user_id),reports=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE user_id=? AND status='accepted'").bind(s.user_id).first(),rejected=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE user_id=? AND status='rejected'").bind(s.user_id).first(),paid=await env.DB.prepare("SELECT COALESCE(SUM(paid_amount),0) n FROM staff_reports WHERE user_id=?").bind(s.user_id).first();rows.push({id:s.user_id,username:s.username,displayName:s.display_name,level:Number(s.level),rank:RANKS[Number(s.level)],appointedAt:Number(s.appointed_at)||0,online:Number(s.last_heartbeat||0)>t-90000&&Number(s.suspended_until||0)<=t,suspended:Number(s.suspended_until||0)>t,suspendedUntil:Number(s.suspended_until)||0,suspensionReason:s.suspension_reason||'',warnings,notes:await staffNotes(env,s.user_id),work,acceptedReports:Number(reports?.n)||0,rejectedReports:Number(rejected?.n)||0,totalSalary:Number(paid?.n)||0});}
    const counts=await env.DB.prepare(`SELECT SUM(CASE WHEN type='player' AND status NOT IN ('resolved','rejected') THEN 1 ELSE 0 END) player_reports,SUM(CASE WHEN type='question' AND status NOT IN ('resolved','rejected') THEN 1 ELSE 0 END) questions,SUM(CASE WHEN type='admin' AND status NOT IN ('resolved','rejected') THEN 1 ELSE 0 END) admin_reports FROM support_tickets`).first();const pending=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE status='pending'").first();return json({ok:true,summary:{online:rows.filter(x=>x.online).length,total:rows.length,playerReports:Number(counts?.player_reports)||0,questions:Number(counts?.questions)||0,pendingReports:Number(pending?.n)||0,adminComplaints:Number(counts?.admin_reports)||0,day:today,dayStart:bounds.start,dayEnd:bounds.end,timezone:'UTC+03:00'},staff:rows});
  }
  if(url.pathname==='/api/admin-system/owner/assign'&&request.method==='POST'){const b=await readBody(request),level=Number(b.level),target=await userByUsername(env,b.username);if(!target)return json({error:'USER_NOT_FOUND'},404);if(target.id===owner.id)return json({error:'OWNER_ALREADY_PRIVILEGED'},400);if(!RANKS[level])return json({error:'INVALID_LEVEL'},400);const t=now(),before=await env.DB.prepare('SELECT level,active FROM staff_admins WHERE user_id=?').bind(target.id).first();await env.DB.prepare(`INSERT INTO staff_admins (user_id,level,active,appointed_at,updated_at,appointed_by) VALUES (?,?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET level=excluded.level,active=1,updated_at=excluded.updated_at,appointed_by=excluded.appointed_by`).bind(target.id,level,t,t,owner.id).run();await audit(env,owner.id,target.id,before?'admin_rank_change':'admin_appointed',{before:before?Number(before.level):0,after:level});return json({ok:true});}
  const rank=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/rank$/i);if(rank&&request.method==='POST'){const b=await readBody(request),level=Number(b.level);if(!RANKS[level])return json({error:'INVALID_LEVEL'},400);const prev=await env.DB.prepare('SELECT level FROM staff_admins WHERE user_id=? AND active=1').bind(rank[1]).first();if(!prev)return json({error:'STAFF_NOT_FOUND'},404);await env.DB.prepare('UPDATE staff_admins SET level=?,updated_at=? WHERE user_id=?').bind(level,now(),rank[1]).run();await audit(env,owner.id,rank[1],'admin_rank_change',{before:Number(prev.level),after:level});return json({ok:true});}
  const remove=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/remove$/i);if(remove&&request.method==='POST'){const prev=await env.DB.prepare('SELECT level FROM staff_admins WHERE user_id=? AND active=1').bind(remove[1]).first();if(!prev)return json({error:'STAFF_NOT_FOUND'},404);await env.DB.prepare('UPDATE staff_admins SET active=0,updated_at=? WHERE user_id=?').bind(now(),remove[1]).run();await audit(env,owner.id,remove[1],'admin_removed',{level:Number(prev.level)});return json({ok:true});}
  const suspension=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/(suspend|resume)$/i);if(suspension&&request.method==='POST'){const target=await staffRow(env,suspension[1]);if(!target)return json({error:'STAFF_NOT_FOUND'},404);const b=await readBody(request),t=now();if(suspension[2]==='resume'){await env.DB.prepare("UPDATE staff_admins SET suspended_until=0,suspension_reason='',suspended_by=NULL,updated_at=? WHERE user_id=?").bind(t,target.user_id).run();await audit(env,owner.id,target.user_id,'admin_resumed',{owner:true});return json({ok:true});}const reason=clean(b.reason,240),durationMs=Math.max(60_000,Math.min(365*DAY_MS,Math.floor(Number(b.durationMs)||0)));if(reason.length<3)return json({error:'REASON_REQUIRED'},400);await env.DB.prepare('UPDATE staff_admins SET suspended_until=?,suspension_reason=?,suspended_by=?,updated_at=? WHERE user_id=?').bind(t+durationMs,reason,owner.id,t,target.user_id).run();await audit(env,owner.id,target.user_id,'admin_suspended',{reason,durationMs,owner:true});return json({ok:true,suspendedUntil:t+durationMs});}
  const warn=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/warning$/i);if(warn&&request.method==='POST'){const b=await readBody(request),reason=clean(b.reason,240);if(reason.length<3)return json({error:'REASON_REQUIRED'},400);if(!await staffRow(env,warn[1]))return json({error:'STAFF_NOT_FOUND'},404);const id=crypto.randomUUID(),t=now();await env.DB.prepare('INSERT INTO staff_admin_warnings (id,user_id,reason,active,created_at,created_by) VALUES (?,?,?,1,?,?)').bind(id,warn[1],reason,t,owner.id).run();await audit(env,owner.id,warn[1],'admin_warning',{id,reason});return json({ok:true,id});}
  const resolveWarn=url.pathname.match(/^\/api\/admin-system\/owner\/warnings\/([0-9a-f-]{20,64})\/resolve$/i);if(resolveWarn&&request.method==='POST'){const t=now(),r=await env.DB.prepare('UPDATE staff_admin_warnings SET active=0,resolved_at=?,resolved_by=? WHERE id=? AND active=1').bind(t,owner.id,resolveWarn[1]).run();if(Number(r?.meta?.changes||0)!==1)return json({error:'WARNING_NOT_FOUND'},404);return json({ok:true});}
  if(url.pathname==='/api/admin-system/owner/reports'&&request.method==='GET'){const r=await env.DB.prepare(`SELECT r.*,u.username,u.display_name FROM staff_reports r JOIN users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.day DESC,r.created_at DESC LIMIT 200`).all();return json({ok:true,reports:(r.results||[]).map(x=>{let snapshot={};try{snapshot=JSON.parse(x.snapshot_json);}catch{}return {id:x.id,userId:x.user_id,username:x.username,displayName:x.display_name,day:x.day,level:Number(x.level),snapshot,calculatedSalary:Number(x.calculated_salary),status:x.status,ownerComment:x.owner_comment||'',createdAt:Number(x.created_at)||0,reviewedAt:Number(x.reviewed_at)||0,paidAmount:Number(x.paid_amount)||0};})});}
  const review=url.pathname.match(/^\/api\/admin-system\/owner\/reports\/([0-9a-f-]{20,64})\/review$/i);if(review&&request.method==='POST'){const b=await readBody(request),decision=b.decision==='accepted'?'accepted':b.decision==='rejected'?'rejected':'';if(!decision)return json({error:'INVALID_DECISION'},400);const row=await env.DB.prepare('SELECT * FROM staff_reports WHERE id=? AND status=\'pending\'').bind(review[1]).first();if(!row)return json({error:'REPORT_NOT_PENDING'},409);const comment=clean(b.comment,800);if(decision==='rejected'&&comment.length<3)return json({error:'COMMENT_REQUIRED'},400);const claimed=await env.DB.prepare("UPDATE staff_reports SET status='processing' WHERE id=? AND status='pending'").bind(row.id).run();if(Number(claimed?.meta?.changes||0)!==1)return json({error:'REPORT_NOT_PENDING'},409);let paid=0;if(decision==='accepted'){paid=Math.max(0,Math.min(RANKS[row.level]?.base||0,Number(row.calculated_salary)||0));const changed=await mutateTargetSave(env,row.user_id,s=>{const before=Math.max(0,Math.floor(Number(s.credits)||0));s.credits=Math.min(999999999,before+paid);return {before,after:s.credits,delta:s.credits-before};});if(changed.error){await env.DB.prepare("UPDATE staff_reports SET status='pending' WHERE id=? AND status='processing'").bind(row.id).run();return json({error:changed.error},409);}paid=changed.result.delta;}const t=now();await env.DB.prepare("UPDATE staff_reports SET status=?,owner_comment=?,reviewed_at=?,reviewed_by=?,paid_amount=? WHERE id=? AND status='processing'").bind(decision,comment,t,owner.id,paid,row.id).run();await audit(env,owner.id,row.user_id,'admin_report_'+decision,{reportId:row.id,calculatedSalary:Number(row.calculated_salary),paidAmount:paid,comment});return json({ok:true,status:decision,paidAmount:paid});}
  if(url.pathname==='/api/admin-system/owner/admin-complaints'&&request.method==='GET'){const r=await env.DB.prepare(`SELECT t.*,ru.username reporter_username,tu.username target_username,au.username target_admin_username,sa.username assigned_admin_username FROM support_tickets t JOIN users ru ON ru.id=t.reporter_user_id LEFT JOIN users tu ON tu.id=t.target_user_id LEFT JOIN users au ON au.id=t.target_admin_user_id LEFT JOIN users sa ON sa.id=t.assigned_admin_id WHERE t.type='admin' ORDER BY CASE t.status WHEN 'new' THEN 0 ELSE 1 END,t.created_at DESC LIMIT 200`).all();return json({ok:true,tickets:(r.results||[]).map(publicTicket)});}
  const adminComplaint=url.pathname.match(/^\/api\/admin-system\/owner\/admin-complaints\/([0-9a-f-]{20,64})\/resolve$/i);if(adminComplaint&&request.method==='POST'){const row=await ticketRow(env,adminComplaint[1]);if(!row||row.type!=='admin')return json({error:'TICKET_NOT_FOUND'},404);const b=await readBody(request),status=b.status==='rejected'?'rejected':'resolved',comment=clean(b.comment,2000);if(comment)await addMessage(env,row.id,owner,'owner',comment);const t=now();await env.DB.prepare('UPDATE support_tickets SET status=?,assigned_admin_id=?,closed_at=?,updated_at=? WHERE id=?').bind(status,owner.id,t,t,row.id).run();await audit(env,owner.id,row.target_admin_user_id,'admin_complaint_'+status,{ticketId:row.id,comment});return json({ok:true});}
  return json({error:'NOT_FOUND'},404);
}

export async function staffOnlineLevel(env,userId){
  if(!env.DB||!userId)return 0;
  try{
    await ensureAdminSystem(env);
    const row=await env.DB.prepare('SELECT level,suspended_until FROM staff_admins WHERE user_id=? AND active=1 LIMIT 1').bind(userId).first();
    const level=Number(row?.level)||0;
    if(Number(row?.suspended_until||0)>now())return 0;
    return level>=1&&level<=8?level:0;
  }catch{return 0;}
}

export async function activeMute(env,userId,t=now()){
  if(!env.DB||!userId)return null;await ensureAdminSystem(env);const row=await env.DB.prepare('SELECT id,reason,expires_at FROM player_mutes WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY expires_at DESC LIMIT 1').bind(userId,t).first();return row?{id:row.id,reason:row.reason,expiresAt:Number(row.expires_at)||0}:null;
}

export async function handleAdminSystemRequest(request,env,url=new URL(request.url),ctx=null){
  const bugResponse=await handleBugReportRequest(request,env,url,ctx);if(bugResponse)return bugResponse;
  if(!url.pathname.startsWith('/api/support/')&&!url.pathname.startsWith('/api/staff-admin/')&&!url.pathname.startsWith('/api/admin-system/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{await ensureAdminSystem(env);if(url.pathname.startsWith('/api/support/'))return supportRoutes(request,env,url);if(url.pathname.startsWith('/api/staff-admin/'))return staffRoutes(request,env,url);if(url.pathname.startsWith('/api/admin-system/owner/'))return ownerRoutes(request,env,url);return json({error:'NOT_FOUND'},404);}catch(e){console.error('admin-system',e);return json({error:'ADMIN_SYSTEM_ERROR'},500);}
}

export {RANKS,salaryFor,workSnapshot,dayKey,dayBounds};
