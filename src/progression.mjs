import {awardCrewRep,ensureCrews,crewRepStatement} from './crews.mjs';
import {writeGameLog} from './logs.mjs';

export const MAX_LEVEL=100;
export const PROGRESSION_REWARDS=Object.freeze({
  ONLINE_FINISH:{exp:90,credits:0},
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

export async function awardProgression(env,userId,{source,eventId,exp=0,credits=0,meta={}}={}){
  if(!env?.DB||!userId||!source||!eventId)return {ok:false,error:'REWARD_IDENTITY_MISSING'};
  let t,safeSource,safeEvent,requestedExp,requestedCredits,existing,cap,rewardId,metaText='{}';
  try{
    await ensureProgressionSchema(env);t=now();safeSource=String(source).slice(0,40);safeEvent=String(eventId).slice(0,120);requestedExp=clampInt(exp,0,100000);requestedCredits=clampInt(credits,0,1000000);
    existing=await env.DB.prepare('SELECT exp,credits,requested_credits,created_at,meta_json FROM progression_rewards WHERE user_id=? AND source=? AND event_id=? LIMIT 1').bind(userId,safeSource,safeEvent).first();
    if(existing){await awardCrewRep(env,userId,safeSource,safeEvent,existing.exp);const progress=await getProgression(env,userId);return {ok:true,duplicate:true,expAdded:0,creditsAdded:0,requestedCredits:clampInt(existing.requested_credits),...progress};}
    rewardId=crypto.randomUUID();try{metaText=JSON.stringify(meta||{}).slice(0,3000);}catch{}
    const before=await getProgression(env,userId);await ensureCrews(env);
    // D1 batches are atomic. Only the freshly inserted UUID may change balances.
    const writes=await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES (?,json_object('credits',0),1,?,?)`).bind(userId,t,t),
      env.DB.prepare(`INSERT OR IGNORE INTO progression_rewards(id,user_id,source,event_id,exp,credits,requested_credits,created_at,meta_json)
        SELECT ?,?,?,?,?,MAX(0,MIN(?,
          ?-COALESCE((SELECT SUM(credits) FROM progression_rewards WHERE user_id=? AND created_at>=?),0),
          ?-COALESCE((SELECT SUM(credits) FROM progression_rewards WHERE user_id=? AND created_at>=?),0),
          CASE WHEN ?='online_time' THEN ?-COALESCE((SELECT SUM(credits) FROM progression_rewards WHERE user_id=? AND source='online_time' AND created_at>=?),0) ELSE ? END,
          999999999-COALESCE((SELECT json_extract(save_json,'$.credits') FROM player_saves WHERE user_id=?),0))),?,?,?`)
        .bind(rewardId,userId,safeSource,safeEvent,requestedExp,requestedCredits,
          REWARD_LIMITS.ACTIVITY_CR_ROLLING_HOUR,userId,t-3600000,
          REWARD_LIMITS.ACTIVITY_CR_ROLLING_24H,userId,t-86400000,
          safeSource,REWARD_LIMITS.ONLINE_CR_ROLLING_24H,userId,t-86400000,requestedCredits,userId,requestedCredits,t,metaText),
      env.DB.prepare('UPDATE player_progress SET total_exp=total_exp+?,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM progression_rewards WHERE id=?)').bind(requestedExp,t,userId,rewardId),
      env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',COALESCE(json_extract(save_json,'$.credits'),0)+(SELECT credits FROM progression_rewards WHERE id=?)),revision=revision+1,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM progression_rewards WHERE id=?)`).bind(rewardId,t,userId,rewardId),
      crewRepStatement(env,userId,safeSource,safeEvent,requestedExp,t)
    ]);
    if(Number(writes[1]?.meta?.changes||0)!==1)return {ok:true,duplicate:true,expAdded:0,creditsAdded:0,requestedCredits,...await getProgression(env,userId)};
    const recorded=await env.DB.prepare('SELECT credits FROM progression_rewards WHERE id=?').bind(rewardId).first();
    const creditsAdded=clampInt(recorded?.credits),saved=await env.DB.prepare('SELECT save_json FROM player_saves WHERE user_id=?').bind(userId).first();
    const balance=clampInt(JSON.parse(saved.save_json).credits),info=await getProgression(env,userId);
    try{await writeGameLog(env,{category:'system',eventType:'progress_reward',actorRole:'SYSTEM',targetUserId:userId,source:'PROGRESSION',subject:`Награда · ${safeSource}`,amount:creditsAdded,currency:'CR',relatedId:safeEvent,metadata:{rewardId,source:safeSource,eventId:safeEvent,expAdded:requestedExp,creditsAdded,requestedCredits,capped:creditsAdded<requestedCredits,balance,levelBefore:before.level,levelAfter:info.level,meta},createdAt:t});}catch(e){console.error('progression log',e);}
    return {ok:true,duplicate:false,expAdded:requestedExp,creditsAdded,requestedCredits,capped:creditsAdded<requestedCredits,balance,levelBefore:before.level,...info};
  }catch(e){console.error('progression reward',e);return {ok:false,error:'REWARD_WRITE_FAILED'};}
}
