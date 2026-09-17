import {currentSession,requireAdmin,ensureAdminSchema,accountDetail,audit,mutateTargetSave,banResponse} from './auth.mjs';

const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const now=()=>Date.now();
const DAY_MS=86400000;
const RANKS=Object.freeze({
  1:{name:'HELPER',label:'Helper',norm:12,base:700,maxMuteMs:0,maxBanMs:0},
  2:{name:'MODER',label:'Moder',norm:16,base:1000,maxMuteMs:60*60*1000,maxBanMs:0},
  3:{name:'ST.MODER',label:'St.Moder',norm:20,base:1400,maxMuteMs:24*60*60*1000,maxBanMs:0},
  4:{name:'ADMIN',label:'Admin',norm:24,base:2000,maxMuteMs:24*60*60*1000,maxBanMs:7*DAY_MS},
  5:{name:'CURATOR',label:'Curator',norm:28,base:2800,maxMuteMs:365*DAY_MS,maxBanMs:100*365*DAY_MS}
});
const schema=new WeakMap();

function dayKey(ts=now()){return new Date(ts).toISOString().slice(0,10);}
function dayStart(ts=now()){const d=new Date(ts);d.setUTCHours(0,0,0,0);return d.getTime();}
function clean(v,max=4000){return String(v||'').trim().replace(/\r/g,'').slice(0,max);}
function safeCategory(v){return clean(v,48).replace(/[^\p{L}\p{N}_\- ]/gu,'').slice(0,48)||'Другое';}
function publicTicket(row){
  let evidence=[];try{evidence=JSON.parse(row.evidence_json||'[]');}catch{}
  return {id:row.id,no:Number(row.ticket_no)||0,type:row.type,reporterId:row.reporter_user_id,reporter:row.reporter_username||'',targetId:row.target_user_id||null,target:row.target_username||'',targetAdminId:row.target_admin_user_id||null,targetAdmin:row.target_admin_username||'',category:row.category,description:row.description,evidence:Array.isArray(evidence)?evidence.slice(0,3):[],status:row.status,assignedAdminId:row.assigned_admin_id||null,assignedAdmin:row.assigned_admin_username||'',createdAt:Number(row.created_at)||0,updatedAt:Number(row.updated_at)||0,closedAt:Number(row.closed_at)||0};
}
function salaryFor(level,points){const rank=RANKS[level]||RANKS[1],ratio=rank.norm?points/rank.norm:0,pct=ratio<.5?.5:ratio<.8?.7:ratio<1?.9:ratio<1.2?1:ratio<1.3?1.1:1.2;return {amount:Math.round(rank.base*pct),percent:Math.round(pct*100),completion:Math.round(ratio*100),base:rank.base,norm:rank.norm};}
async function readBody(request){try{return await request.json();}catch{return {};}}
function sameOrigin(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}

export async function ensureAdminSystem(env){
  if(!env.DB)return;
  let p=schema.get(env.DB);if(p)return p;
  p=(async()=>{
    await ensureAdminSchema(env);
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_admins (
        user_id TEXT PRIMARY KEY, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5), active INTEGER NOT NULL DEFAULT 1,
        appointed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, appointed_by TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_admins_active_level ON staff_admins(active,level)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_admin_warnings (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,reason TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,created_by TEXT NOT NULL,resolved_at INTEGER,resolved_by TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_warnings_user ON staff_admin_warnings(user_id,active,created_at)'),
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
async function requireUser(env,request){const session=await currentSession(env,request);if(!session)return {error:json({error:'AUTH_REQUIRED'},401)};const banned=await banResponse(env,session.user);if(banned)return {error:banned};return {session};}
async function requireStaff(env,request,min=1){const access=await requireUser(env,request);if(access.error)return access;const staff=await staffRow(env,access.session.user.id);if(!staff||Number(staff.level)<min)return {error:json({error:'STAFF_REQUIRED'},403)};return {...access,staff,level:Number(staff.level)};}
async function userByUsername(env,username){const u=clean(username,32).replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(u))return null;return env.DB.prepare('SELECT id,username,display_name FROM users WHERE username=? COLLATE NOCASE LIMIT 1').bind(u).first();}
async function ticketRow(env,id){return env.DB.prepare(`SELECT t.*,ru.username reporter_username,tu.username target_username,au.username target_admin_username,sa.username assigned_admin_username
    FROM support_tickets t JOIN users ru ON ru.id=t.reporter_user_id LEFT JOIN users tu ON tu.id=t.target_user_id LEFT JOIN users au ON au.id=t.target_admin_user_id LEFT JOIN users sa ON sa.id=t.assigned_admin_id WHERE t.id=? LIMIT 1`).bind(id).first();}
async function ticketMessages(env,id){const r=await env.DB.prepare(`SELECT m.id,m.author_user_id,m.author_role,m.message,m.created_at,u.username FROM support_messages m JOIN users u ON u.id=m.author_user_id WHERE m.ticket_id=? ORDER BY m.created_at ASC LIMIT 200`).bind(id).all();return (r.results||[]).map(x=>({id:Number(x.id),authorId:x.author_user_id,author:x.username,role:x.author_role,message:x.message,createdAt:Number(x.created_at)||0}));}
async function activeWarnings(env,userId){const r=await env.DB.prepare('SELECT id,reason,created_at FROM staff_admin_warnings WHERE user_id=? AND active=1 ORDER BY created_at DESC').bind(userId).all();return (r.results||[]).map(x=>({id:x.id,reason:x.reason,createdAt:Number(x.created_at)||0}));}
async function dailyWork(env,userId,day=dayKey()){const row=await env.DB.prepare('SELECT * FROM staff_daily_work WHERE user_id=? AND day=?').bind(userId,day).first();return {questions:Number(row?.questions_closed)||0,reports:Number(row?.reports_closed)||0,activeMs:Number(row?.active_ms)||0,reopened:Number(row?.reopened)||0,reversed:Number(row?.reversed_actions)||0};}
async function verifiedReferrals(env,userId,start=dayStart(),end=start+DAY_MS){
  try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM referrals r JOIN owner_activity a ON a.user_id=r.invited_user_id WHERE r.inviter_user_id=? AND r.status='rewarded' AND r.created_at>=? AND r.created_at<? AND a.total_ms>=1800000`).bind(userId,start,end).first();return Number(r?.n)||0;}catch{return 0;}
}
async function workSnapshot(env,userId,level,day=dayKey()){
  const work=await dailyWork(env,userId,day),start=Date.parse(day+'T00:00:00.000Z'),refs=await verifiedReferrals(env,userId,start,start+DAY_MS);
  const onlinePoints=Math.min(4,Math.floor(work.activeMs/(30*60*1000))),refPoints=Math.min(3,refs),points=Math.max(0,work.questions+work.reports*2+onlinePoints+refPoints-work.reversed*2-work.reopened);
  return {day,level,questions:work.questions,reports:work.reports,activeMs:work.activeMs,referrals:refs,onlinePoints,referralPoints:refPoints,reopened:work.reopened,reversedActions:work.reversed,points,...salaryFor(level,points)};
}
async function bumpClosed(env,userId,type){const day=dayKey(),q=type==='question'?1:0,r=type==='player'?1:0,t=now();await env.DB.prepare(`INSERT INTO staff_daily_work (user_id,day,questions_closed,reports_closed,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET questions_closed=questions_closed+excluded.questions_closed,reports_closed=reports_closed+excluded.reports_closed,updated_at=excluded.updated_at`).bind(userId,day,q,r,t).run();}
async function addMessage(env,ticketId,user,role,message){const text=clean(message,2000);if(!text)return;await env.DB.prepare('INSERT INTO support_messages (ticket_id,author_user_id,author_role,message,created_at) VALUES (?,?,?,?,?)').bind(ticketId,user.id,role,text,now()).run();}

async function supportRoutes(request,env,url){
  const access=await requireUser(env,request);if(access.error)return access.error;const me=access.session.user;
  if(url.pathname==='/api/support/me'&&request.method==='GET'){
    const staff=await staffRow(env,me.id),warnings=staff?await activeWarnings(env,me.id):[];return json({ok:true,user:me,owner:!!me.isAdmin,staff:staff?{level:Number(staff.level),rank:RANKS[Number(staff.level)],warnings}:null});
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

async function staffRoutes(request,env,url){
  const access=await requireStaff(env,request,1);if(access.error)return access.error;const me=access.session.user,level=access.level;
  if(url.pathname==='/api/staff-admin/heartbeat'&&request.method==='POST'){
    const t=now(),day=dayKey(t),p=await env.DB.prepare('SELECT last_heartbeat,last_day FROM staff_presence WHERE user_id=?').bind(me.id).first();let delta=0;if(p&&p.last_day===day){const d=t-Number(p.last_heartbeat||0);if(d>0&&d<=90000)delta=Math.min(d,60000);}await env.DB.batch([
      env.DB.prepare('INSERT INTO staff_presence (user_id,last_heartbeat,last_day) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_heartbeat=excluded.last_heartbeat,last_day=excluded.last_day').bind(me.id,t,day),
      env.DB.prepare('INSERT INTO staff_daily_work (user_id,day,active_ms,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET active_ms=active_ms+excluded.active_ms,updated_at=excluded.updated_at').bind(me.id,day,delta,t)
    ]);return json({ok:true,addedMs:delta});
  }
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
      const rank=RANKS[level];if(kind==='mute'){if(level<2||durationMs<1000||durationMs>rank.maxMuteMs)return json({error:'MUTE_LIMIT',maxMs:rank.maxMuteMs},403);}if(kind==='ban'){if(permanent&&level===5)durationMs=rank.maxBanMs;if(level<4||durationMs<1000||durationMs>rank.maxBanMs)return json({error:'BAN_LIMIT',maxMs:rank.maxBanMs},403);}
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
    const today=dayKey(),t=now(),staff=(await env.DB.prepare(`SELECT s.user_id,s.level,s.appointed_at,u.username,u.display_name,p.last_heartbeat FROM staff_admins s JOIN users u ON u.id=s.user_id LEFT JOIN staff_presence p ON p.user_id=s.user_id WHERE s.active=1 ORDER BY s.level DESC,lower(u.username)`).all()).results||[];const rows=[];
    for(const s of staff){const work=await workSnapshot(env,s.user_id,Number(s.level),today),warnings=await activeWarnings(env,s.user_id),reports=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE user_id=? AND status='accepted'").bind(s.user_id).first(),rejected=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE user_id=? AND status='rejected'").bind(s.user_id).first(),paid=await env.DB.prepare("SELECT COALESCE(SUM(paid_amount),0) n FROM staff_reports WHERE user_id=?").bind(s.user_id).first();rows.push({id:s.user_id,username:s.username,displayName:s.display_name,level:Number(s.level),rank:RANKS[Number(s.level)],appointedAt:Number(s.appointed_at)||0,online:Number(s.last_heartbeat||0)>t-90000,warnings,work,acceptedReports:Number(reports?.n)||0,rejectedReports:Number(rejected?.n)||0,totalSalary:Number(paid?.n)||0});}
    const counts=await env.DB.prepare(`SELECT SUM(CASE WHEN type='player' AND status NOT IN ('resolved','rejected') THEN 1 ELSE 0 END) player_reports,SUM(CASE WHEN type='question' AND status NOT IN ('resolved','rejected') THEN 1 ELSE 0 END) questions,SUM(CASE WHEN type='admin' AND status NOT IN ('resolved','rejected') THEN 1 ELSE 0 END) admin_reports FROM support_tickets`).first();const pending=await env.DB.prepare("SELECT COUNT(*) n FROM staff_reports WHERE status='pending'").first();return json({ok:true,summary:{online:rows.filter(x=>x.online).length,total:rows.length,playerReports:Number(counts?.player_reports)||0,questions:Number(counts?.questions)||0,pendingReports:Number(pending?.n)||0,adminComplaints:Number(counts?.admin_reports)||0},staff:rows});
  }
  if(url.pathname==='/api/admin-system/owner/assign'&&request.method==='POST'){const b=await readBody(request),level=Number(b.level),target=await userByUsername(env,b.username);if(!target)return json({error:'USER_NOT_FOUND'},404);if(target.id===owner.id)return json({error:'OWNER_ALREADY_PRIVILEGED'},400);if(!RANKS[level])return json({error:'INVALID_LEVEL'},400);const t=now(),before=await env.DB.prepare('SELECT level,active FROM staff_admins WHERE user_id=?').bind(target.id).first();await env.DB.prepare(`INSERT INTO staff_admins (user_id,level,active,appointed_at,updated_at,appointed_by) VALUES (?,?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET level=excluded.level,active=1,updated_at=excluded.updated_at,appointed_by=excluded.appointed_by`).bind(target.id,level,t,t,owner.id).run();await audit(env,owner.id,target.id,before?'admin_rank_change':'admin_appointed',{before:before?Number(before.level):0,after:level});return json({ok:true});}
  const rank=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/rank$/i);if(rank&&request.method==='POST'){const b=await readBody(request),level=Number(b.level);if(!RANKS[level])return json({error:'INVALID_LEVEL'},400);const prev=await env.DB.prepare('SELECT level FROM staff_admins WHERE user_id=? AND active=1').bind(rank[1]).first();if(!prev)return json({error:'STAFF_NOT_FOUND'},404);await env.DB.prepare('UPDATE staff_admins SET level=?,updated_at=? WHERE user_id=?').bind(level,now(),rank[1]).run();await audit(env,owner.id,rank[1],'admin_rank_change',{before:Number(prev.level),after:level});return json({ok:true});}
  const remove=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/remove$/i);if(remove&&request.method==='POST'){const prev=await env.DB.prepare('SELECT level FROM staff_admins WHERE user_id=? AND active=1').bind(remove[1]).first();if(!prev)return json({error:'STAFF_NOT_FOUND'},404);await env.DB.prepare('UPDATE staff_admins SET active=0,updated_at=? WHERE user_id=?').bind(now(),remove[1]).run();await audit(env,owner.id,remove[1],'admin_removed',{level:Number(prev.level)});return json({ok:true});}
  const warn=url.pathname.match(/^\/api\/admin-system\/owner\/staff\/([0-9a-f-]{16,64})\/warning$/i);if(warn&&request.method==='POST'){const b=await readBody(request),reason=clean(b.reason,240);if(reason.length<3)return json({error:'REASON_REQUIRED'},400);if(!await staffRow(env,warn[1]))return json({error:'STAFF_NOT_FOUND'},404);const id=crypto.randomUUID(),t=now();await env.DB.prepare('INSERT INTO staff_admin_warnings (id,user_id,reason,active,created_at,created_by) VALUES (?,?,?,1,?,?)').bind(id,warn[1],reason,t,owner.id).run();await audit(env,owner.id,warn[1],'admin_warning',{id,reason});return json({ok:true,id});}
  const resolveWarn=url.pathname.match(/^\/api\/admin-system\/owner\/warnings\/([0-9a-f-]{20,64})\/resolve$/i);if(resolveWarn&&request.method==='POST'){const t=now(),r=await env.DB.prepare('UPDATE staff_admin_warnings SET active=0,resolved_at=?,resolved_by=? WHERE id=? AND active=1').bind(t,owner.id,resolveWarn[1]).run();if(Number(r?.meta?.changes||0)!==1)return json({error:'WARNING_NOT_FOUND'},404);return json({ok:true});}
  if(url.pathname==='/api/admin-system/owner/reports'&&request.method==='GET'){const r=await env.DB.prepare(`SELECT r.*,u.username,u.display_name FROM staff_reports r JOIN users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.day DESC,r.created_at DESC LIMIT 200`).all();return json({ok:true,reports:(r.results||[]).map(x=>{let snapshot={};try{snapshot=JSON.parse(x.snapshot_json);}catch{}return {id:x.id,userId:x.user_id,username:x.username,displayName:x.display_name,day:x.day,level:Number(x.level),snapshot,calculatedSalary:Number(x.calculated_salary),status:x.status,ownerComment:x.owner_comment||'',createdAt:Number(x.created_at)||0,reviewedAt:Number(x.reviewed_at)||0,paidAmount:Number(x.paid_amount)||0};})});}
  const review=url.pathname.match(/^\/api\/admin-system\/owner\/reports\/([0-9a-f-]{20,64})\/review$/i);if(review&&request.method==='POST'){const b=await readBody(request),decision=b.decision==='accepted'?'accepted':b.decision==='rejected'?'rejected':'';if(!decision)return json({error:'INVALID_DECISION'},400);const row=await env.DB.prepare('SELECT * FROM staff_reports WHERE id=? AND status=\'pending\'').bind(review[1]).first();if(!row)return json({error:'REPORT_NOT_PENDING'},409);const comment=clean(b.comment,800);if(decision==='rejected'&&comment.length<3)return json({error:'COMMENT_REQUIRED'},400);const claimed=await env.DB.prepare("UPDATE staff_reports SET status='processing' WHERE id=? AND status='pending'").bind(row.id).run();if(Number(claimed?.meta?.changes||0)!==1)return json({error:'REPORT_NOT_PENDING'},409);let paid=0;if(decision==='accepted'){paid=Number(row.calculated_salary)||0;const changed=await mutateTargetSave(env,row.user_id,s=>{const before=Math.max(0,Math.floor(Number(s.credits)||0));s.credits=Math.min(999999999,before+paid);return {before,after:s.credits,delta:s.credits-before};});if(changed.error){await env.DB.prepare("UPDATE staff_reports SET status='pending' WHERE id=? AND status='processing'").bind(row.id).run();return json({error:changed.error},409);}paid=changed.result.delta;}const t=now();await env.DB.prepare("UPDATE staff_reports SET status=?,owner_comment=?,reviewed_at=?,reviewed_by=?,paid_amount=? WHERE id=? AND status='processing'").bind(decision,comment,t,owner.id,paid,row.id).run();await audit(env,owner.id,row.user_id,'admin_report_'+decision,{reportId:row.id,calculatedSalary:Number(row.calculated_salary),paidAmount:paid,comment});return json({ok:true,status:decision,paidAmount:paid});}
  if(url.pathname==='/api/admin-system/owner/admin-complaints'&&request.method==='GET'){const r=await env.DB.prepare(`SELECT t.*,ru.username reporter_username,tu.username target_username,au.username target_admin_username,sa.username assigned_admin_username FROM support_tickets t JOIN users ru ON ru.id=t.reporter_user_id LEFT JOIN users tu ON tu.id=t.target_user_id LEFT JOIN users au ON au.id=t.target_admin_user_id LEFT JOIN users sa ON sa.id=t.assigned_admin_id WHERE t.type='admin' ORDER BY CASE t.status WHEN 'new' THEN 0 ELSE 1 END,t.created_at DESC LIMIT 200`).all();return json({ok:true,tickets:(r.results||[]).map(publicTicket)});}
  const adminComplaint=url.pathname.match(/^\/api\/admin-system\/owner\/admin-complaints\/([0-9a-f-]{20,64})\/resolve$/i);if(adminComplaint&&request.method==='POST'){const row=await ticketRow(env,adminComplaint[1]);if(!row||row.type!=='admin')return json({error:'TICKET_NOT_FOUND'},404);const b=await readBody(request),status=b.status==='rejected'?'rejected':'resolved',comment=clean(b.comment,2000);if(comment)await addMessage(env,row.id,owner,'owner',comment);const t=now();await env.DB.prepare('UPDATE support_tickets SET status=?,assigned_admin_id=?,closed_at=?,updated_at=? WHERE id=?').bind(status,owner.id,t,t,row.id).run();await audit(env,owner.id,row.target_admin_user_id,'admin_complaint_'+status,{ticketId:row.id,comment});return json({ok:true});}
  return json({error:'NOT_FOUND'},404);
}

export async function staffOnlineLevel(env,userId){
  if(!env.DB||!userId)return 0;
  try{
    await ensureAdminSystem(env);
    const row=await env.DB.prepare('SELECT level FROM staff_admins WHERE user_id=? AND active=1 LIMIT 1').bind(userId).first();
    const level=Number(row?.level)||0;
    return level>=1&&level<=5?level:0;
  }catch{return 0;}
}

export async function activeMute(env,userId,t=now()){
  if(!env.DB||!userId)return null;await ensureAdminSystem(env);const row=await env.DB.prepare('SELECT id,reason,expires_at FROM player_mutes WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY expires_at DESC LIMIT 1').bind(userId,t).first();return row?{id:row.id,reason:row.reason,expiresAt:Number(row.expires_at)||0}:null;
}

export async function handleAdminSystemRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/support/')&&!url.pathname.startsWith('/api/staff-admin/')&&!url.pathname.startsWith('/api/admin-system/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{await ensureAdminSystem(env);if(url.pathname.startsWith('/api/support/'))return supportRoutes(request,env,url);if(url.pathname.startsWith('/api/staff-admin/'))return staffRoutes(request,env,url);if(url.pathname.startsWith('/api/admin-system/owner/'))return ownerRoutes(request,env,url);return json({error:'NOT_FOUND'},404);}catch(e){console.error('admin-system',e);return json({error:'ADMIN_SYSTEM_ERROR'},500);}
}

export {RANKS,salaryFor,workSnapshot};
