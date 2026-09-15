import {mutateTargetSave} from './auth.mjs';

export const MAX_LEVEL=100;
export const PROGRESSION_REWARDS=Object.freeze({
  DRIFT_FIRST:{exp:180,credits:450},
  DRIFT_SECOND:{exp:140,credits:320},
  DRIFT_THIRD:{exp:110,credits:240},
  DRIFT_PARTICIPATION:{exp:70,credits:140},
  KOTH_FIRST:{exp:220,credits:550},
  KOTH_SECOND:{exp:170,credits:400},
  KOTH_THIRD:{exp:130,credits:300},
  KOTH_PARTICIPATION:{exp:80,credits:170},
  DRAG_WIN:{exp:60,credits:100},
  DRAG_LOSS:{exp:30,credits:50},
  DRAG_DRAW:{exp:40,credits:70},
  ONLINE_REWARD:{exp:30,credits:60}
});

export const REWARD_LIMITS=Object.freeze({
  ACTIVITY_CR_ROLLING_HOUR:1800,
  ACTIVITY_CR_ROLLING_24H:6500,
  ONLINE_CR_ROLLING_24H:720
});

let schemaPromise=null;
const now=()=>Date.now();
const clampInt=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Math.max(min,Math.min(max,Math.floor(Number(v)||0)));

export function expRequired(level){
  const l=Math.max(0,Math.min(MAX_LEVEL-1,Math.floor(Number(level)||0)));
  const raw=100+10*l+.25*l*l;
  // Project balance uses nearest 10 EXP with exact x5 ties rounded down (e.g. 1225 -> 1220).
  return Math.floor((raw+5-1e-9)/10)*10;
}
export function levelFromTotalExp(totalExp){
  let left=Math.max(0,Math.floor(Number(totalExp)||0)),level=0;
  while(level<MAX_LEVEL){const need=expRequired(level);if(left<need)break;left-=need;level++;}
  return {level,levelExp:level>=MAX_LEVEL?0:left,requiredExp:level>=MAX_LEVEL?0:expRequired(level),toNext:level>=MAX_LEVEL?0:Math.max(0,expRequired(level)-left)};
}
export function totalExpForLevel(target){
  const n=Math.max(0,Math.min(MAX_LEVEL,Math.floor(Number(target)||0)));let total=0;for(let l=0;l<n;l++)total+=expRequired(l);return total;
}

export async function ensureProgressionSchema(env){
  if(!env?.DB)return;
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_progress (
        user_id TEXT PRIMARY KEY,
        total_exp INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_progress_exp ON player_progress(total_exp)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS progression_rewards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        event_id TEXT NOT NULL,
        exp INTEGER NOT NULL DEFAULT 0,
        credits INTEGER NOT NULL DEFAULT 0,
        requested_credits INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        meta_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(user_id,source,event_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_progression_rewards_user_time ON progression_rewards(user_id,created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_progression_rewards_source_time ON progression_rewards(user_id,source,created_at)')
    ]);
  })().catch(e=>{schemaPromise=null;throw e;});
  return schemaPromise;
}

export async function getProgression(env,userId){
  if(!env?.DB||!userId)return {totalExp:0,...levelFromTotalExp(0)};
  try{
    await ensureProgressionSchema(env);const t=now();
    await env.DB.prepare('INSERT OR IGNORE INTO player_progress (user_id,total_exp,created_at,updated_at) VALUES (?,0,?,?)').bind(userId,t,t).run();
    const row=await env.DB.prepare('SELECT total_exp FROM player_progress WHERE user_id=? LIMIT 1').bind(userId).first();
    const totalExp=clampInt(row?.total_exp);return {totalExp,...levelFromTotalExp(totalExp)};
  }catch{return {totalExp:0,...levelFromTotalExp(0)};}
}

export async function setProgressionLevel(env,userId,targetLevel){
  if(!env?.DB||!userId)return {ok:false,error:'PROGRESSION_IDENTITY_MISSING'};
  const level=Math.max(0,Math.min(MAX_LEVEL,Math.floor(Number(targetLevel))));
  if(!Number.isFinite(Number(targetLevel))||level!==Number(targetLevel))return {ok:false,error:'INVALID_LEVEL'};
  try{
    await ensureProgressionSchema(env);const t=now(),before=await getProgression(env,userId),totalExp=totalExpForLevel(level);
    await env.DB.prepare(`INSERT INTO player_progress (user_id,total_exp,created_at,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET total_exp=excluded.total_exp,updated_at=excluded.updated_at`).bind(userId,totalExp,t,t).run();
    return {ok:true,before,...{totalExp,...levelFromTotalExp(totalExp)}};
  }catch(e){console.error('set progression level',e);return {ok:false,error:'PROGRESSION_WRITE_FAILED'};}
}

async function rewardCap(env,userId,source,requested,t){
  if(requested<=0)return {credits:0,capped:false,hourTotal:0,dayTotal:0,onlineDayTotal:0};
  const hour=await env.DB.prepare('SELECT COALESCE(SUM(credits),0) AS total FROM progression_rewards WHERE user_id=? AND created_at>=?').bind(userId,t-60*60*1000).first();
  const day=await env.DB.prepare('SELECT COALESCE(SUM(credits),0) AS total FROM progression_rewards WHERE user_id=? AND created_at>=?').bind(userId,t-24*60*60*1000).first();
  const hourTotal=clampInt(hour?.total),dayTotal=clampInt(day?.total);let allowed=Math.min(requested,Math.max(0,REWARD_LIMITS.ACTIVITY_CR_ROLLING_HOUR-hourTotal),Math.max(0,REWARD_LIMITS.ACTIVITY_CR_ROLLING_24H-dayTotal));let onlineDayTotal=0;
  if(source==='online_time'){
    const online=await env.DB.prepare("SELECT COALESCE(SUM(credits),0) AS total FROM progression_rewards WHERE user_id=? AND source='online_time' AND created_at>=?").bind(userId,t-24*60*60*1000).first();
    onlineDayTotal=clampInt(online?.total);allowed=Math.min(allowed,Math.max(0,REWARD_LIMITS.ONLINE_CR_ROLLING_24H-onlineDayTotal));
  }
  allowed=Math.max(0,Math.floor(allowed));return {credits:allowed,capped:allowed<requested,hourTotal,dayTotal,onlineDayTotal};
}

export async function awardProgression(env,userId,{source,eventId,exp=0,credits=0,meta={}}={}){
  if(!env?.DB||!userId||!source||!eventId)return {ok:false,error:'REWARD_IDENTITY_MISSING'};
  let t,safeSource,safeEvent,requestedExp,requestedCredits,existing,cap,rewardId,metaText='{}';
  try{
    await ensureProgressionSchema(env);t=now();safeSource=String(source).slice(0,40);safeEvent=String(eventId).slice(0,120);requestedExp=clampInt(exp,0,100000);requestedCredits=clampInt(credits,0,1000000);
    existing=await env.DB.prepare('SELECT exp,credits,requested_credits,created_at,meta_json FROM progression_rewards WHERE user_id=? AND source=? AND event_id=? LIMIT 1').bind(userId,safeSource,safeEvent).first();
    if(existing){const progress=await getProgression(env,userId);return {ok:true,duplicate:true,expAdded:0,creditsAdded:0,requestedCredits:clampInt(existing.requested_credits),...progress};}
    cap=await rewardCap(env,userId,safeSource,requestedCredits,t);rewardId=crypto.randomUUID();try{metaText=JSON.stringify(meta||{}).slice(0,3000);}catch{}
    const reserved=await env.DB.prepare('INSERT OR IGNORE INTO progression_rewards (id,user_id,source,event_id,exp,credits,requested_credits,created_at,meta_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(rewardId,userId,safeSource,safeEvent,requestedExp,0,requestedCredits,t,metaText).run();
    if(Number(reserved?.meta?.changes||0)!==1){const progress=await getProgression(env,userId);return {ok:true,duplicate:true,expAdded:0,creditsAdded:0,requestedCredits,...progress};}
    const before=await getProgression(env,userId),afterTotal=Math.max(0,before.totalExp+requestedExp);
    await env.DB.prepare('UPDATE player_progress SET total_exp=?,updated_at=? WHERE user_id=?').bind(afterTotal,t,userId).run();
    let creditsAdded=0,balance=null;
    if(cap.credits>0){
      const changed=await mutateTargetSave(env,userId,save=>{const old=clampInt(save.credits,0,999999999),next=Math.min(999999999,old+cap.credits);save.credits=next;return {before:old,after:next,delta:next-old};});
      if(changed.ok){creditsAdded=clampInt(changed.result?.delta);balance=clampInt(changed.result?.after);}
    }
    await env.DB.prepare('UPDATE progression_rewards SET credits=? WHERE id=?').bind(creditsAdded,rewardId).run();
    const info={totalExp:afterTotal,...levelFromTotalExp(afterTotal)};
    return {ok:true,duplicate:false,expAdded:requestedExp,creditsAdded,requestedCredits,capped:creditsAdded<requestedCredits,balance,levelBefore:before.level,...info};
  }catch(e){console.error('progression reward',e);return {ok:false,error:'REWARD_WRITE_FAILED'};}
}
