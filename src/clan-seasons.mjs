import {freeAccountIdentity} from './auth.mjs';
import {CLAN_DIVISIONS,CLAN_DIVISION_LABELS,CLAN_DIVISION_REWARDS,CLAN_DIVISION_ADVANCE_QUOTA,CLAN_DIVISION_RELEGATION_QUOTA,CLAN_SEASON_PARTICIPATION_REWARD,CLAN_SEASON_POINTS,CLAN_TASK_CONFIG} from './clan-season-config.mjs';

const DAY=86400000,WEEK=7*DAY;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const makeId=()=>crypto.randomUUID();
export function utcClanSeason(at=Date.now()){
  const d=new Date(at),daysSinceMonday=(d.getUTCDay()+6)%7;
  const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-daysSinceMonday);
  const end=start+WEEK;
  return{id:new Date(start).toISOString().slice(0,10),startsAt:start,endsAt:end};
}
export function utcClanDay(at=Date.now()){
  const d=new Date(at),start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  return{id:new Date(start).toISOString().slice(0,10),startsAt:start,endsAt:start+DAY};
}
async function ensureSeason(env,at=Date.now(),snapshot=true){
  const w=utcClanSeason(at),created=Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO clan_seasons(id,starts_at,ends_at,status,created_at) VALUES(?,?,?,'OPEN',?)").bind(w.id,w.startsAt,w.endsAt,created).run();
  if(snapshot)await env.DB.prepare(`INSERT OR IGNORE INTO clan_season_members(season_id,crew_id,division_at_start)
    SELECT ?,c.id,COALESCE(d.division,'BRONZE') FROM crews c LEFT JOIN clan_divisions d ON d.crew_id=c.id`).bind(w.id).run();
  return w;
}
async function ensureTaskPeriod(env,type,at){
  const w=type==='DAILY'?utcClanDay(at):utcClanSeason(at),tasks=type==='DAILY'?CLAN_TASK_CONFIG.DAILY:CLAN_TASK_CONFIG.WEEKLY;
  await env.DB.prepare('INSERT OR IGNORE INTO clan_task_periods(period_type,period_key,starts_at,ends_at,config_json,created_at) VALUES(?,?,?,?,?,?)').bind(type,w.id,w.startsAt,w.endsAt,JSON.stringify(tasks),Date.now()).run();
  const row=await env.DB.prepare('SELECT * FROM clan_task_periods WHERE period_type=? AND period_key=?').bind(type,w.id).first();
  return{...w,row,tasks:JSON.parse(row?.config_json||'[]')};
}
const TASK_EVENT_TYPE={ONLINE_FINISH:'ONLINE_FINISH',INFLUENCE:'INFLUENCE',CONTRIBUTION:'CONTRIBUTION',MATCH_WIN:'CLAN_MATCH',MATCH_LOSS:'CLAN_MATCH',DISTRICT_CAPTURE:'DISTRICT_CAPTURE'};
const SEASON_EVENT_VALUES={
  MATCH_WIN:e=>({type:'MATCH_WIN',points:CLAN_SEASON_POINTS.MATCH_WIN,wins:1,captures:0,influence:0}),
  MATCH_LOSS:e=>({type:'MATCH_LOSS',points:CLAN_SEASON_POINTS.MATCH_LOSS,wins:0,captures:0,influence:0}),
  DISTRICT_CAPTURE:e=>({type:'DISTRICT_CAPTURE',points:CLAN_SEASON_POINTS.DISTRICT_CAPTURE,wins:0,captures:1,influence:0}),
  DISTRICT_HOLD:e=>({type:'DISTRICT_HOLD',points:CLAN_SEASON_POINTS.DISTRICT_HOLD,wins:0,captures:0,influence:0}),
  INFLUENCE:e=>({type:'INFLUENCE',points:0,wins:0,captures:0,influence:e.amount})
};
function createTaskChain(env,type,period,crewId,task,eventId,amount,at){
  const key=`${type}:${period.id}:${crewId}:${task.id}`,rewardKey=`quest:${type.toLowerCase()}:${period.id}:${crewId}:${task.id}`;
  const meta=JSON.stringify({periodType:type,periodKey:period.id,taskId:task.id,target:task.target});
  return[
    env.DB.prepare('INSERT OR IGNORE INTO clan_task_events(period_type,period_key,crew_id,task_id,source_id,amount,created_at) VALUES(?,?,?,?,?,?,?)').bind(type,period.id,crewId,task.id,eventId,amount,at),
    env.DB.prepare(`INSERT OR IGNORE INTO clan_task_claims(period_type,period_key,crew_id,task_id,target,reward,completed_at)
      SELECT ?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(amount),0) FROM clan_task_events WHERE period_type=? AND period_key=? AND crew_id=? AND task_id=?)>=?`).bind(type,period.id,crewId,task.id,task.target,task.reward,at,type,period.id,crewId,task.id,task.target),
    env.DB.prepare(`INSERT OR IGNORE INTO crew_treasuries(crew_id,balance,updated_at) SELECT ?,0,? WHERE EXISTS(SELECT 1 FROM clan_task_claims WHERE period_type=? AND period_key=? AND crew_id=? AND task_id=?)`).bind(crewId,at,type,period.id,crewId,task.id),
    env.DB.prepare(`INSERT OR IGNORE INTO crew_treasury_ledger(id,crew_id,actor_user_id,kind,amount,idempotency_key,metadata_json,created_at)
      SELECT ?,?,NULL,'QUEST_REWARD',?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_task_claims WHERE period_type=? AND period_key=? AND crew_id=? AND task_id=?)`).bind(makeId(),crewId,task.reward,rewardKey,meta,at,type,period.id,crewId,task.id),
    env.DB.prepare('UPDATE crew_treasuries SET balance=balance+?,updated_at=? WHERE crew_id=? AND (SELECT changes())>0').bind(task.reward,at,crewId)
  ];
}
async function processOutboxRow(env,event){
  const finalized=await finalizeSeasonsThrough(env,event.created_at);
  const w=await ensureSeason(env,event.created_at,true),daily=await ensureTaskPeriod(env,'DAILY',event.created_at),weekly=await ensureTaskPeriod(env,'WEEKLY',event.created_at),statements=[];
  const metric=SEASON_EVENT_VALUES[event.event_type]?.(event);
  if(metric){
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO clan_season_events(season_id,crew_id,event_type,source_id,points,wins,captures,influence_points,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(w.id,event.crew_id,metric.type,event.source_id,metric.points,metric.wins,metric.captures,metric.influence,event.created_at));
  }
  const taskType=TASK_EVENT_TYPE[event.event_type];
  if(taskType){
    for(const [type,period] of [['DAILY',daily],['WEEKLY',weekly]]){
      for(const task of period.tasks){if(task.eventType!==taskType||event.amount<=0)continue;statements.push(...createTaskChain(env,type,period,event.crew_id,task,event.id,event.amount,event.created_at));}
    }
  }
  statements.push(env.DB.prepare('UPDATE clan_competition_outbox SET processed_at=? WHERE id=? AND processed_at IS NULL').bind(Date.now(),event.id));
  await env.DB.batch(statements);return{finalized};
}
export async function processClanCompetitionOutbox(env,limit=200){
  if(!env?.DB)return{processed:0,finalized:[]};let processed=0;const finalized=[];
  for(let page=0;page<20;page++){
    const rows=await env.DB.prepare('SELECT * FROM clan_competition_outbox WHERE processed_at IS NULL ORDER BY created_at,id LIMIT ?').bind(Math.min(500,Math.max(1,limit))).all();
    if(!rows.results?.length)break;
    for(const event of rows.results){const settled=await processOutboxRow(env,event);finalized.push(...settled.finalized);processed++;}
    if(rows.results.length<limit)break;
  }
  return{processed,finalized};
}
export async function settleClanDistrictHolds(env,at=Date.now(),districtId=null){
  if(!env?.DB)return{settled:0};
  const query=districtId?'SELECT id,owner_crew_id,captured_at FROM clan_war_districts WHERE owner_crew_id IS NOT NULL AND captured_at IS NOT NULL AND id=?':'SELECT id,owner_crew_id,captured_at FROM clan_war_districts WHERE owner_crew_id IS NOT NULL AND captured_at IS NOT NULL';
  const rows=await env.DB.prepare(query).bind(...(districtId?[districtId]:[])).all();let settled=0;
  for(const d of rows.results||[]){const start=Number(d.captured_at),last=await env.DB.prepare('SELECT COALESCE(MAX(period_number),0) n FROM clan_district_hold_settlements WHERE district_id=? AND crew_id=? AND ownership_started_at=?').bind(d.id,d.owner_crew_id,start).first();
    const complete=Math.max(0,Math.floor((at-start)/DAY));for(let n=Number(last?.n||0)+1;n<=complete;n++){
      // Attribute a completed interval to the season that owned its elapsed time;
      // a full day ending Monday 00:00 UTC belongs to the week just completed.
      const eventAt=start+n*DAY-1,source=`${d.id}:${d.owner_crew_id}:${start}:${n}`,eventId=`DISTRICT_HOLD:${source}`;
      const result=await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO clan_district_hold_settlements(district_id,crew_id,ownership_started_at,period_number,settled_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_war_districts WHERE id=? AND owner_crew_id=? AND captured_at=?)').bind(d.id,d.owner_crew_id,start,n,at,d.id,d.owner_crew_id,start),
        env.DB.prepare(`INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
          SELECT ?,'DISTRICT_HOLD',?,?,1,? WHERE (SELECT changes())>0`).bind(eventId,d.owner_crew_id,source,eventAt)
      ]);if(result[0]?.meta?.changes)settled++;
    }
  }
  return{settled};
}
function cmpMetric(a,b){return b.points-a.points||b.wins-a.wins||b.captures-a.captures||b.influence-a.influence;}
export function rankClanSeasonRows(rows){const sorted=[...rows].sort(cmpMetric);let previous=null,rank=0;for(let i=0;i<sorted.length;i++){const row=sorted[i];if(!previous||cmpMetric(previous,row)!==0)rank=i+1;row.rank=rank;previous=row;}for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&cmpMetric(sorted[i],sorted[j])===0)j++;for(let k=i;k<j;k++)sorted[k].tieSize=j-i;i=j;}return sorted;}
async function seasonRoster(env,seasonId,at){
  await env.DB.prepare(`INSERT OR IGNORE INTO clan_season_members(season_id,crew_id,division_at_start)
    SELECT ?,c.id,COALESCE(d.division,'BRONZE') FROM crews c LEFT JOIN clan_divisions d ON d.crew_id=c.id`).bind(seasonId).run();
  const members=await env.DB.prepare(`SELECT m.crew_id,m.division_at_start,c.name,c.tag FROM clan_season_members m JOIN crews c ON c.id=m.crew_id WHERE m.season_id=?`).bind(seasonId).all();
  const totals=await env.DB.prepare(`SELECT crew_id,SUM(points) points,SUM(wins) wins,SUM(captures) captures,SUM(influence_points) influence,
    SUM(CASE WHEN event_type IN('MATCH_WIN','MATCH_LOSS') THEN 1 ELSE 0 END) matches
    FROM clan_season_events WHERE season_id=? GROUP BY crew_id`).bind(seasonId).all(),byCrew=new Map((totals.results||[]).map(r=>[r.crew_id,r]));
  return(members.results||[]).map(m=>{const t=byCrew.get(m.crew_id)||{};return{crewId:m.crew_id,name:m.name,tag:m.tag,division:m.division_at_start,points:Number(t.points)||0,wins:Number(t.wins)||0,captures:Number(t.captures)||0,influence:Number(t.influence)||0,matches:Number(t.matches)||0,rank:0,tieSize:1};});
}
function moveDivision(div,delta){const n=CLAN_DIVISIONS.indexOf(div);return CLAN_DIVISIONS[Math.max(0,Math.min(CLAN_DIVISIONS.length-1,n+delta))]||'BRONZE';}
async function finalizeSeason(env,season,at){
  await env.DB.prepare("UPDATE clan_seasons SET status='FINALIZING' WHERE id=? AND status='OPEN' AND ends_at<=?").bind(season.id,at).run();
  const all=await seasonRoster(env,season.id,at),rankedByDivision=new Map();
  for(const division of CLAN_DIVISIONS){const ranked=rankClanSeasonRows(all.filter(x=>x.division===division));rankedByDivision.set(division,ranked);}
  const allRows=[];
  for(const [division,ranked] of rankedByDivision){const count=ranked.length,hasAnyScore=ranked.some(x=>x.points||x.influence),divisionIndex=CLAN_DIVISIONS.indexOf(division);
    for(const row of ranked){let delta=0;const promote=row.rank<=CLAN_DIVISION_ADVANCE_QUOTA&&divisionIndex<CLAN_DIVISIONS.length-1;const relegate=row.rank>count-CLAN_DIVISION_RELEGATION_QUOTA&&divisionIndex>0;
      if(hasAnyScore&&promote!==relegate)delta=promote?1:-1;const to=moveDivision(division,delta),participated=row.matches>0,reward=participated?(CLAN_DIVISION_REWARDS[division]||0)+CLAN_SEASON_PARTICIPATION_REWARD:0;
      allRows.push({...row,divisionTo:to,participated,reward});
    }
  }
  for(const row of allRows){
    const key=`season:${season.id}:${row.crewId}`,metadata=JSON.stringify({seasonId:season.id,division:row.division,points:row.points,wins:row.wins,captures:row.captures,influence:row.influence,rank:row.rank});
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO clan_season_results(season_id,crew_id,division_from,points,wins,matches,captures,influence,rank,tie_size,division_to,participated,reward,finalized_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(season.id,row.crewId,row.division,row.points,row.wins,row.matches,row.captures,row.influence,row.rank,row.tieSize,row.divisionTo,row.participated?1:0,row.reward,at),
      env.DB.prepare(`INSERT OR IGNORE INTO clan_division_history(season_id,crew_id,division_from,division_to,rank,points,changed_at)
       SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_season_results WHERE season_id=? AND crew_id=?)`).bind(season.id,row.crewId,row.division,row.divisionTo,row.rank,row.points,at,season.id,row.crewId),
      env.DB.prepare(`UPDATE clan_divisions SET division=?,updated_at=? WHERE crew_id=? AND EXISTS(SELECT 1 FROM clan_division_history WHERE season_id=? AND crew_id=?)`).bind(row.divisionTo,at,row.crewId,season.id,row.crewId),
      env.DB.prepare(`INSERT OR IGNORE INTO crew_treasuries(crew_id,balance,updated_at) SELECT ?,0,? WHERE ? > 0 AND NOT EXISTS(SELECT 1 FROM clan_season_settlements WHERE season_id=? AND crew_id=?)`).bind(row.crewId,at,row.reward,season.id,row.crewId),
      env.DB.prepare(`INSERT OR IGNORE INTO clan_season_settlements(season_id,crew_id,reward,paid_at) VALUES(?,?,?,?)`).bind(season.id,row.crewId,row.reward,at),
      env.DB.prepare(`INSERT OR IGNORE INTO crew_treasury_ledger(id,crew_id,actor_user_id,kind,amount,idempotency_key,metadata_json,created_at)
       SELECT ?,?,NULL,'SEASON_REWARD',?,?,?,? WHERE ? > 0 AND EXISTS(SELECT 1 FROM clan_season_settlements WHERE season_id=? AND crew_id=?) AND NOT EXISTS(SELECT 1 FROM crew_treasury_ledger WHERE idempotency_key=?)`).bind(makeId(),row.crewId,row.reward,key,metadata,at,row.reward,season.id,row.crewId,key),
      env.DB.prepare('UPDATE crew_treasuries SET balance=balance+?,updated_at=? WHERE crew_id=? AND (SELECT changes())>0').bind(row.reward,at,row.crewId)
    ]);
  }
  await env.DB.prepare("UPDATE clan_seasons SET status='FINISHED',finalized_at=COALESCE(finalized_at,?) WHERE id=? AND NOT EXISTS(SELECT 1 FROM clan_season_members m WHERE m.season_id=? AND NOT EXISTS(SELECT 1 FROM clan_season_results r WHERE r.season_id=m.season_id AND r.crew_id=m.crew_id))").bind(at,season.id,season.id).run();
  return{seasonId:season.id,clans:allRows.length};
}
async function ensureSeasonWindows(env,at){
  const current=utcClanSeason(at),last=await env.DB.prepare('SELECT MAX(starts_at) value FROM clan_seasons').first();
  if(last?.value!=null){for(let start=Number(last.value)+WEEK;start<current.startsAt;start+=WEEK){const w=utcClanSeason(start);await env.DB.prepare("INSERT OR IGNORE INTO clan_seasons(id,starts_at,ends_at,status,created_at) VALUES(?,?,?,'OPEN',?)").bind(w.id,w.startsAt,w.endsAt,Date.now()).run();}}
  await ensureSeason(env,at,false);
}
async function finalizeSeasonsThrough(env,at){
  await ensureSeasonWindows(env,at);
  const expired=await env.DB.prepare("SELECT * FROM clan_seasons WHERE ends_at<=? AND status IN('OPEN','FINALIZING') ORDER BY starts_at").bind(at).all(),done=[];
  for(const season of expired.results||[])done.push(await finalizeSeason(env,season,at));return done.map(x=>x.seasonId);
}
export async function settleClanCompetition(env,at=Date.now()){
  if(!env?.DB)return{ok:false,processed:0,finalized:[]};
  const holds=await settleClanDistrictHolds(env,at),first=await processClanCompetitionOutbox(env);
  await ensureSeasonWindows(env,at);const expired=await env.DB.prepare("SELECT * FROM clan_seasons WHERE ends_at<=? AND status IN('OPEN','FINALIZING') ORDER BY starts_at").bind(at).all(),finalized=[];
  for(const season of expired.results||[])finalized.push(await finalizeSeason(env,season,at));
  await ensureSeason(env,at,true);await ensureTaskPeriod(env,'DAILY',at);await ensureTaskPeriod(env,'WEEKLY',at);
  return{ok:true,holds:settledHold(holds),processed:first.processed,finalized:[...first.finalized,...finalized.map(x=>x.seasonId)]};
}
function settledHold(value){return value?.settled||0;}
async function standingsForSeason(env,season){
  const rows=await seasonRoster(env,season.id,Date.now()),ranked=[];for(const division of CLAN_DIVISIONS)ranked.push(...rankClanSeasonRows(rows.filter(x=>x.division===division)));
  const current=await env.DB.prepare('SELECT crew_id,division FROM clan_divisions').all(),currentMap=new Map((current.results||[]).map(x=>[x.crew_id,x.division]));
  return ranked.sort((a,b)=>CLAN_DIVISIONS.indexOf(a.division)-CLAN_DIVISIONS.indexOf(b.division)||a.rank-b.rank||a.crewId.localeCompare(b.crewId)).map(x=>({...x,currentDivision:currentMap.get(x.crewId)||x.division,divisionLabel:CLAN_DIVISION_LABELS[x.division]}));
}
async function readTaskProgress(env,type,period,crewId){
  const progress=await env.DB.prepare('SELECT task_id,SUM(amount) amount FROM clan_task_events WHERE period_type=? AND period_key=? AND crew_id=? GROUP BY task_id').bind(type,period.id,crewId).all(),claims=await env.DB.prepare('SELECT task_id,completed_at FROM clan_task_claims WHERE period_type=? AND period_key=? AND crew_id=?').bind(type,period.id,crewId).all();
  const byProgress=new Map((progress.results||[]).map(x=>[x.task_id,Number(x.amount)||0])),byClaims=new Map((claims.results||[]).map(x=>[x.task_id,x.completed_at]));
  return period.tasks.map(task=>({id:task.id,title:task.title,description:task.description,target:task.target,reward:task.reward,progress:Math.min(task.target,byProgress.get(task.id)||0),completedAt:byClaims.get(task.id)||null,completed:byClaims.has(task.id)}));
}
async function seasonEndpoint(request,env,url){
  if(url.pathname!=='/api/clan-seasons')return null;
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!env?.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  const identity=await freeAccountIdentity(env,request);if(identity.response)return identity.response;if(!identity.user)return json({error:'AUTH_REQUIRED'},401);
  try{
    await settleClanCompetition(env,Date.now());const userId=identity.user.id,membership=await env.DB.prepare('SELECT c.id,c.name,c.tag,COALESCE(d.division,\'BRONZE\') division FROM crew_members m JOIN crews c ON c.id=m.crew_id LEFT JOIN clan_divisions d ON d.crew_id=c.id WHERE m.user_id=?').bind(userId).first(),w=utcClanSeason(Date.now());
    const season=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(w.id).first(),standings=await standingsForSeason(env,season),dailyPeriod=await ensureTaskPeriod(env,'DAILY',Date.now()),weeklyPeriod=await ensureTaskPeriod(env,'WEEKLY',Date.now());
    const history=membership?await env.DB.prepare(`SELECT r.*,s.starts_at,s.ends_at FROM clan_season_results r JOIN clan_seasons s ON s.id=r.season_id WHERE r.crew_id=? ORDER BY s.starts_at DESC LIMIT 12`).bind(membership.id).all():{results:[]};
    return json({ok:true,now:Date.now(),membership,season:{id:w.id,startsAt:w.startsAt,endsAt:w.endsAt,status:season?.status||'OPEN',division:membership?.division||null,standings},daily:{id:dailyPeriod.id,startsAt:dailyPeriod.startsAt,endsAt:dailyPeriod.endsAt,resetInMs:Math.max(0,dailyPeriod.endsAt-Date.now()),tasks:membership?await readTaskProgress(env,'DAILY',dailyPeriod,membership.id):[]},weekly:{id:weeklyPeriod.id,startsAt:weeklyPeriod.startsAt,endsAt:weeklyPeriod.endsAt,resetInMs:Math.max(0,weeklyPeriod.endsAt-Date.now()),tasks:membership?await readTaskProgress(env,'WEEKLY',weeklyPeriod,membership.id):[]},history:history.results||[],config:{divisions:CLAN_DIVISION_LABELS,divisionRewards:CLAN_DIVISION_REWARDS,participationReward:CLAN_SEASON_PARTICIPATION_REWARD,advanceQuota:CLAN_DIVISION_ADVANCE_QUOTA,relegationQuota:CLAN_DIVISION_RELEGATION_QUOTA}});
  }catch(e){console.error('clan seasons',e);return json({error:'CLAN_SEASONS_UNAVAILABLE'},503);}
}
export async function handleClanSeasonRequest(request,env,url){return seasonEndpoint(request,env,url);}
