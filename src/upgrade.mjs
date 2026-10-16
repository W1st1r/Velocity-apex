import {CARS} from './car-catalog.mjs';
import {currentSession,mutateTargetSave,banResponse} from './auth.mjs';
import {settings} from './owner.mjs';
import {writeGameLog} from './logs.mjs';
import {UPGRADE_CONFIG,UPGRADE_EFFECT_VALUES} from './upgrade-config.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const now=()=>Date.now();
const RETURN_BPS=UPGRADE_CONFIG.returnBps;
const RISK_RETURN_BPS=UPGRADE_CONFIG.riskReturnBps;
const MIN_CHANCE_BPS=UPGRADE_CONFIG.minChanceBps;
const MAX_CHANCE_BPS=UPGRADE_CONFIG.maxChanceBps;
const CHANCE_DIVISOR=UPGRADE_CONFIG.chanceDivisor;
const MAX_STAKE_ITEMS=UPGRADE_CONFIG.maxStakeItems;
const MAX_CREDITS=UPGRADE_CONFIG.maxCredits;
const EFFECTS=UPGRADE_EFFECT_VALUES;
const PROTECTION_REFUND_BPS=UPGRADE_CONFIG.protectionRefundBps;
const STANDARD_MAX_STAKE_SHARE_BPS=UPGRADE_CONFIG.standardMaxStakeShareBps;
const RISK_MAX_STAKE_SHARE_BPS=UPGRADE_CONFIG.riskMaxStakeShareBps;
let schemaPromise=null;

const sameOrigin=request=>{const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;};
const safeId=value=>/^[a-zA-Z0-9_-]{1,64}$/.test(String(value||''))?String(value):'';
const safeAttemptId=value=>/^[0-9a-f-]{20,80}$/i.test(String(value||''))?String(value):'';
const uniqueIds=value=>Array.from(new Set((Array.isArray(value)?value:[]).map(safeId).filter(Boolean))).slice(0,MAX_STAKE_ITEMS);
const safeCredits=value=>{const n=Math.floor(Number(value)||0);return Number.isSafeInteger(n)?Math.max(0,Math.min(MAX_CREDITS,n)):0;};
const cleanPayload=body=>({
  stake:{cars:uniqueIds(body?.stake?.cars),effects:uniqueIds(body?.stake?.effects),credits:safeCredits(body?.stake?.credits)},
  target:{kind:body?.target?.kind==='effect'?'effect':'car',id:safeId(body?.target?.id)},
  protection:body?.protection===true,
  mode:body?.mode==='risk'?'risk':'standard'
});
// V69: odds never depend on account identity, player level or previous results.
const baseChanceBps=(stakeValue,targetValue,protection=false,mode='standard')=>{
  if(!(stakeValue>0)||!(targetValue>0))return 0;
  const returnBps=mode==='risk'?RISK_RETURN_BPS:RETURN_BPS;
  // The refund is a payout on failure. This keeps the expected return near selected mode RTP
  // across both settings, instead of silently charging a hidden protection fee.
  if(protection){
    const denominator=10000*targetValue-PROTECTION_REFUND_BPS*stakeValue;
    return denominator>0?Math.max(0,Math.min(MAX_CHANCE_BPS,Math.floor((returnBps-PROTECTION_REFUND_BPS)*stakeValue*10000/denominator))):0;
  }
  return Math.max(0,Math.min(MAX_CHANCE_BPS,Math.floor(stakeValue/targetValue*returnBps)));
};
const chanceBps=(stakeValue,targetValue,protection=false,mode='standard')=>Math.floor(baseChanceBps(stakeValue,targetValue,protection,mode)/CHANCE_DIVISOR);
const refundForStake=(stakeValue,protection)=>protection?Math.floor(Math.max(0,stakeValue)*PROTECTION_REFUND_BPS/10000):0;
// Avoid modulo bias: sample uniformly on [0,10000) with rejection sampling.
const randomTicket=()=>{const a=new Uint32Array(1),limit=0x100000000-(0x100000000%10000);do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%10000;};
const publicConfig=()=>({returnBps:RETURN_BPS,riskReturnBps:RISK_RETURN_BPS,modes:{standard:{returnBps:RETURN_BPS,maxStakeShareBps:STANDARD_MAX_STAKE_SHARE_BPS},risk:{returnBps:RISK_RETURN_BPS,maxStakeShareBps:RISK_MAX_STAKE_SHARE_BPS}},protectionRefundBps:PROTECTION_REFUND_BPS,protectionAvailable:true,accountIndependent:true,minChanceBps:MIN_CHANCE_BPS,maxChanceBps:MAX_CHANCE_BPS,maxStakeItems:MAX_STAKE_ITEMS,oddsPolicy:'STANDARD: 98% nominal expected payout; max stake 10% of account net worth. RISK: 94%; max stake 5%. Protected losses return 25% of assessed stake; payout probability is adjusted so quoted RTP includes this refund. No account- or streak-based odds.'});
const publicOddsProfile=mode=>({returnBps:mode==='risk'?RISK_RETURN_BPS:RETURN_BPS,mode:mode==='risk'?'risk':'standard',protectionRefundBps:PROTECTION_REFUND_BPS,accountIndependent:true});

async function ensureUpgradeSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS upgrade_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      stake_value INTEGER NOT NULL DEFAULT 0,
      target_value INTEGER NOT NULL DEFAULT 0,
      chance_bps INTEGER NOT NULL DEFAULT 0,
      rng_value INTEGER,
      success INTEGER,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_upgrade_user_created ON upgrade_attempts(user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_upgrade_status_created ON upgrade_attempts(status,created_at DESC)')
  ]).catch(e=>{schemaPromise=null;throw e;});
  return schemaPromise;
}

function parseJson(text,fallback={}){try{const v=JSON.parse(text||'{}');return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
async function mutateUpgradeSaveWithReceipt(env,userId,mutator,receipt){
  for(let attempt=0;attempt<4;attempt++){
    const row=await env.DB.prepare('SELECT save_json,revision FROM player_saves WHERE user_id=? LIMIT 1').bind(userId).first();
    const revision=Number(row?.revision)||0,save=parseJson(row?.save_json||'{}');
    const result=mutator(save);if(result?.error)return result;
    const saveJson=JSON.stringify(save);if(new TextEncoder().encode(saveJson).byteLength>64*1024)return {error:'INVALID_SAVE'};
    const nextRevision=revision+1,t=now();
    const statements=revision>0?[
      env.DB.prepare('UPDATE player_saves SET save_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(saveJson,t,userId,revision),
      receipt(result,t,saveJson,nextRevision)
    ]:[
      env.DB.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').bind(userId,saveJson,t,t),
      receipt(result,t,saveJson,nextRevision)
    ];
    try{
      const committed=await env.DB.batch(statements);
      if(Number(committed?.[0]?.meta?.changes||0)===1&&Number(committed?.[1]?.meta?.changes||0)===1)return {ok:true,result,revision:nextRevision,updatedAt:t};
    }catch(error){if(revision===0){const current=await env.DB.prepare('SELECT revision FROM player_saves WHERE user_id=? LIMIT 1').bind(userId).first();if(Number(current?.revision)>0)continue;}throw error;}
  }
  return {error:'SAVE_CONFLICT'};
}
function publicAttempt(row){
  if(!row)return null;
  const payload=parseJson(row.payload_json),result=parseJson(row.result_json);
  return {id:row.id,status:row.status,stake:payload.stake||{cars:[],effects:[],credits:0},target:payload.target||null,mode:payload.mode==='risk'?'risk':'standard',protection:payload.protection===true,refundCredits:Number(result.refundCredits)||0,stakeValue:Number(row.stake_value)||0,targetValue:Number(row.target_value)||0,chanceBps:Number(row.chance_bps)||0,rngValue:row.rng_value===null||row.rng_value===undefined?null:Number(row.rng_value),success:row.success===null||row.success===undefined?null:!!row.success,result,createdAt:Number(row.created_at)||0,completedAt:Number(row.completed_at)||0};
}

async function carCatalog(env){
  const cfg=await settings(env),overrides=cfg?.cars||{};
  return Object.fromEntries(Object.entries(CARS).map(([id,base])=>[id,{...base,...(overrides[id]||{})}]));
}
function itemMeta(kind,id,cars){
  if(kind==='car'){
    const item=cars[id];if(!item)return null;
    return {kind,id,name:item.name||id,category:item.category||'basic',price:Math.max(0,Math.floor(Number(item.price)||0)),enabled:item.enabled!==false,unavailable:!!item.unavailable};
  }
  const item=EFFECTS[id];if(!item)return null;
  return {kind,id,name:item.name||id,category:'effect',price:Math.max(0,Math.floor(Number(item.price)||0)),enabled:true,unavailable:false};
}
function netWorth(save,cars){
  const ownedCars=Array.isArray(save?.ownedLiveries)?save.ownedLiveries:[],ownedEffects=Array.isArray(save?.ownedEffects)?save.ownedEffects:[];
  const carValue=ownedCars.filter(id=>id!=='apexLime').reduce((sum,id)=>sum+Math.max(0,Math.floor(Number(cars[id]?.price)||0)),0);
  const effectValue=ownedEffects.filter(id=>id!=='standard').reduce((sum,id)=>sum+Math.max(0,Math.floor(Number(EFFECTS[id]?.price)||0)),0);
  return safeCredits(save?.credits)+carValue+effectValue;
}
function actualReturnBps(chance,stakeValue,targetValue,refund){
  if(!(stakeValue>0))return 0;
  return Math.max(0,Math.floor((chance*targetValue+(10000-chance)*refund)/stakeValue));
}
function evaluate(save,payload,cars){
  const ownedCars=Array.isArray(save?.ownedLiveries)?save.ownedLiveries:[],ownedEffects=Array.isArray(save?.ownedEffects)?save.ownedEffects:[];
  const stakeCars=payload.stake.cars,stakeEffects=payload.stake.effects,credits=payload.stake.credits;
  if(stakeCars.length+stakeEffects.length>MAX_STAKE_ITEMS)return {error:'TOO_MANY_ITEMS'};
  if(!payload.target.id)return {error:'TARGET_REQUIRED'};
  if(!stakeCars.length&&!stakeEffects.length&&!credits)return {error:'STAKE_REQUIRED'};
  if(credits>safeCredits(save?.credits))return {error:'INSUFFICIENT_CREDITS'};
  if(stakeCars.includes('apexLime')||stakeEffects.includes('standard'))return {error:'PROTECTED_ITEM'};
  for(const id of stakeCars)if(!ownedCars.includes(id)||!cars[id])return {error:'CAR_NOT_OWNED',itemId:id};
  for(const id of stakeEffects)if(!ownedEffects.includes(id)||!EFFECTS[id])return {error:'EFFECT_NOT_OWNED',itemId:id};
  if(payload.target.kind==='car'){
    const t=cars[payload.target.id];
    if(!t||payload.target.id==='apexLime'||!(Number(t.price)>0))return {error:'INVALID_TARGET'};
    if(t.enabled===false||t.unavailable)return {error:'TARGET_UNAVAILABLE'};
    if(ownedCars.includes(payload.target.id))return {error:'TARGET_ALREADY_OWNED'};
    if(stakeCars.includes(payload.target.id))return {error:'TARGET_IN_STAKE'};
  }else{
    if(!EFFECTS[payload.target.id]||payload.target.id==='standard'||!(EFFECTS[payload.target.id].price>0))return {error:'INVALID_TARGET'};
    if(ownedEffects.includes(payload.target.id))return {error:'TARGET_ALREADY_OWNED'};
    if(stakeEffects.includes(payload.target.id))return {error:'TARGET_IN_STAKE'};
  }
  const carItems=stakeCars.map(id=>itemMeta('car',id,cars)),effectItems=stakeEffects.map(id=>itemMeta('effect',id,cars));
  const target=itemMeta(payload.target.kind,payload.target.id,cars);
  const stakeValue=carItems.reduce((s,x)=>s+x.price,0)+effectItems.reduce((s,x)=>s+x.price,0)+credits,targetValue=target?.price||0;
  const maxStakeShareBps=payload.mode==='risk'?RISK_MAX_STAKE_SHARE_BPS:STANDARD_MAX_STAKE_SHARE_BPS,maxStakeValue=Math.floor(netWorth(save,cars)*maxStakeShareBps/10000);
  if(stakeValue>maxStakeValue)return {error:'STAKE_LIMIT',stakeValue,targetValue,maxStakeValue,maxStakeShareBps};
  if(!(targetValue>0))return {error:'INVALID_TARGET'};
  if(stakeValue>=targetValue)return {error:'TARGET_NOT_HIGHER',stakeValue,targetValue};
  const refundOnLoss=refundForStake(stakeValue,payload.protection);
  // Guarantee the displayed protection refund is never truncated by the CR limit.
  if(payload.protection&&refundOnLoss>MAX_CREDITS-(safeCredits(save?.credits)-credits))return {error:'REFUND_BALANCE_LIMIT',stakeValue,targetValue};
  const bps=chanceBps(stakeValue,targetValue,payload.protection,payload.mode);
  if(baseChanceBps(stakeValue,targetValue,payload.protection,payload.mode)<MIN_CHANCE_BPS)return {error:'CHANCE_TOO_LOW',stakeValue,targetValue,chanceBps:bps};
  const nominalReturnBps=payload.mode==='risk'?RISK_RETURN_BPS:RETURN_BPS,quotedReturnBps=actualReturnBps(bps,stakeValue,targetValue,refundOnLoss);
  return {ok:true,stakeValue,targetValue,chanceBps:bps,refundOnLoss,protection:payload.protection===true,mode:payload.mode,returnBps:quotedReturnBps,nominalReturnBps,maxStakeValue,maxStakeShareBps,netWorth:netWorth(save,cars),stakeItems:[...carItems,...effectItems],target};
}
function consumeStake(save,payload){
  save.credits=safeCredits(save.credits)-payload.stake.credits;
  const removeCars=new Set(payload.stake.cars),removeEffects=new Set(payload.stake.effects);
  save.ownedLiveries=(Array.isArray(save.ownedLiveries)?save.ownedLiveries:[]).filter(id=>!removeCars.has(id));
  if(!save.ownedLiveries.includes('apexLime'))save.ownedLiveries.unshift('apexLime');
  save.ownedEffects=(Array.isArray(save.ownedEffects)?save.ownedEffects:[]).filter(id=>!removeEffects.has(id));
  if(!save.ownedEffects.includes('standard'))save.ownedEffects.unshift('standard');
  for(const id of removeCars){if(save.carUpgrades&&typeof save.carUpgrades==='object')delete save.carUpgrades[id];if(save.carCustomizations&&typeof save.carCustomizations==='object')delete save.carCustomizations[id];}
  if(removeCars.has(save.selectedLivery))save.selectedLivery='apexLime';
  if(removeEffects.has(save.selectedEffect))save.selectedEffect='standard';
}
function grantTarget(save,target){
  if(target.kind==='car'){
    if(!Array.isArray(save.ownedLiveries))save.ownedLiveries=['apexLime'];
    if(!save.ownedLiveries.includes(target.id))save.ownedLiveries.push(target.id);
  }else{
    if(!Array.isArray(save.ownedEffects))save.ownedEffects=['standard'];
    if(!save.ownedEffects.includes(target.id))save.ownedEffects.push(target.id);
  }
}

async function access(env,request){
  const session=await currentSession(env,request);if(!session)return {response:json({error:'AUTH_REQUIRED'},401)};
  const banned=await banResponse(env,session.user);if(banned)return {response:banned};
  return {session};
}

async function quote(env,session,payload){
  const row=await env.DB.prepare('SELECT save_json FROM player_saves WHERE user_id=? LIMIT 1').bind(session.user.id).first();
  let save={};try{save=JSON.parse(row?.save_json||'{}');}catch{}
  const cars=await carCatalog(env),ev=evaluate(save,payload,cars);
  if(!ev.ok)return json({error:ev.error,stakeValue:ev.stakeValue||0,targetValue:ev.targetValue||0,chanceBps:ev.chanceBps||0,maxStakeValue:ev.maxStakeValue||0,maxStakeShareBps:ev.maxStakeShareBps||0,config:publicConfig()},409);
  return json({ok:true,stakeValue:ev.stakeValue,targetValue:ev.targetValue,chanceBps:ev.chanceBps,refundOnLoss:ev.refundOnLoss,protection:ev.protection,mode:ev.mode,returnBps:ev.returnBps,nominalReturnBps:ev.nominalReturnBps,maxStakeValue:ev.maxStakeValue,maxStakeShareBps:ev.maxStakeShareBps,netWorth:ev.netWorth,stakeItems:ev.stakeItems,target:ev.target,profile:publicOddsProfile(ev.mode),config:publicConfig()});
}

async function attempt(env,session,body){
  const attemptId=safeAttemptId(body?.upgradeId);if(!attemptId)return json({error:'INVALID_UPGRADE_ID'},400);
  const payload=cleanPayload(body);
  const existing=await env.DB.prepare('SELECT * FROM upgrade_attempts WHERE id=? AND user_id=? LIMIT 1').bind(attemptId,session.user.id).first();
  if(existing){const item=publicAttempt(existing);if(existing.status==='complete'||existing.status==='rejected')return json({ok:existing.status==='complete',attempt:item},existing.status==='complete'?200:409);return json({error:'UPGRADE_PROCESSING',attempt:item},409);}
  const t=now();
  await env.DB.prepare("INSERT OR IGNORE INTO upgrade_attempts (id,user_id,status,payload_json,created_at) VALUES (?,?,'claimed',?,?)").bind(attemptId,session.user.id,JSON.stringify(payload),t).run();
  const claim=await env.DB.prepare("UPDATE upgrade_attempts SET status='processing' WHERE id=? AND user_id=? AND status='claimed'").bind(attemptId,session.user.id).run();
  if(Number(claim?.meta?.changes||0)!==1){const row=await env.DB.prepare('SELECT * FROM upgrade_attempts WHERE id=? AND user_id=? LIMIT 1').bind(attemptId,session.user.id).first();return json({error:'UPGRADE_PROCESSING',attempt:publicAttempt(row)},409);}
  const cars=await carCatalog(env);
  let finalEval=null,ticket=null,success=false,refundCredits=0;
  const mutation=(save)=>{
    const ev=evaluate(save,payload,cars);if(!ev.ok)return {error:ev.error,stakeValue:ev.stakeValue||0,targetValue:ev.targetValue||0,chanceBps:ev.chanceBps||0,maxStakeValue:ev.maxStakeValue||0,maxStakeShareBps:ev.maxStakeShareBps||0};
    finalEval=ev;ticket=randomTicket();success=ticket<ev.chanceBps;
    consumeStake(save,payload);
    if(success)grantTarget(save,payload.target);
    else if(payload.protection){refundCredits=Math.min(ev.refundOnLoss,Math.max(0,MAX_CREDITS-safeCredits(save.credits)));save.credits=safeCredits(save.credits)+refundCredits;}
    return {upgradeId:attemptId,success,rngValue:ticket,stakeValue:ev.stakeValue,targetValue:ev.targetValue,chanceBps:ev.chanceBps,target:ev.target,stakeItems:ev.stakeItems,creditsStaked:payload.stake.credits,protection:payload.protection,refundCredits,mode:ev.mode,returnBps:ev.returnBps};
  };
  const changed=await mutateUpgradeSaveWithReceipt(env,session.user.id,mutation,(out,t,saveJson,revision)=>env.DB.prepare("UPDATE upgrade_attempts SET status='complete',result_json=?,stake_value=?,target_value=?,chance_bps=?,rng_value=?,success=?,completed_at=? WHERE id=? AND user_id=? AND status='processing' AND EXISTS(SELECT 1 FROM player_saves WHERE user_id=? AND revision=? AND save_json=?)").bind(JSON.stringify({success:out.success,stakeItems:out.stakeItems,target:out.target,creditsStaked:out.creditsStaked,protection:out.protection,refundCredits:out.refundCredits,refundOnLoss:finalEval.refundOnLoss,mode:out.mode,returnBps:out.returnBps}),out.stakeValue,out.targetValue,out.chanceBps,out.rngValue,out.success?1:0,t,attemptId,session.user.id,session.user.id,revision,saveJson));
  if(changed.error==='SAVE_CONFLICT')return json({error:'UPGRADE_PROCESSING',attempt:{id:attemptId,status:'processing'}},409);
  if(changed.error){
    const result={error:changed.error,stakeValue:changed.stakeValue||0,targetValue:changed.targetValue||0,chanceBps:changed.chanceBps||0};
    await env.DB.prepare("UPDATE upgrade_attempts SET status='rejected',result_json=?,stake_value=?,target_value=?,chance_bps=?,completed_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(result),result.stakeValue,result.targetValue,result.chanceBps,now(),attemptId,session.user.id).run();
    return json({error:changed.error,attempt:{id:attemptId,status:'rejected',...result}},409);
  }
  const result={success,stakeItems:finalEval.stakeItems,target:finalEval.target,creditsStaked:payload.stake.credits,protection:payload.protection,refundCredits,refundOnLoss:finalEval.refundOnLoss,mode:finalEval.mode,returnBps:finalEval.returnBps};
  const completedAt=now();
  try{await writeGameLog(env,{category:'upgrades',eventType:success?'upgrade_success':'upgrade_failed',actorUserId:session.user.id,actorUsername:session.user.username,actorRole:session.user.isAdmin?'OWNER':'PLAYER',targetUserId:session.user.id,targetUsername:session.user.username,source:'GARAGE_UPGRADE',subject:`${success?'SUCCESS':'FAILED'} · ${finalEval.target.name}`,amount:payload.stake.credits,currency:'CR',relatedId:attemptId,metadata:{upgradeId:attemptId,mode:finalEval.mode,stake:payload.stake,stakeItems:finalEval.stakeItems,stakeValue:finalEval.stakeValue,target:finalEval.target,targetValue:finalEval.targetValue,chanceBps:finalEval.chanceBps,returnBps:finalEval.returnBps,protection:payload.protection,refundCredits,rngValue:ticket,success},createdAt:completedAt});}catch(e){console.error('upgrade log',e);}
  const row=await env.DB.prepare('SELECT * FROM upgrade_attempts WHERE id=? LIMIT 1').bind(attemptId).first();
  return json({ok:true,attempt:publicAttempt(row)});
}

export async function handleUpgradeRequest(request,env,url){
  if(!url.pathname.startsWith('/api/upgrade/'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    await ensureUpgradeSchema(env);
    const a=await access(env,request);if(a.response)return a.response;
    if(url.pathname==='/api/upgrade/config'&&request.method==='GET')return json({ok:true,config:publicConfig()});
    if(url.pathname==='/api/upgrade/profile'&&request.method==='GET')return json({ok:true,profile:publicOddsProfile(),config:publicConfig()});
    if(url.pathname==='/api/upgrade/history'&&request.method==='GET'){
      const r=await env.DB.prepare("SELECT * FROM upgrade_attempts WHERE user_id=? AND status IN ('complete','rejected') ORDER BY created_at DESC LIMIT 30").bind(a.session.user.id).all();
      return json({ok:true,items:(r.results||[]).map(publicAttempt),config:publicConfig()});
    }
    if(url.pathname==='/api/upgrade/quote'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);let body;try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}return quote(env,a.session,cleanPayload(body));
    }
    if(url.pathname==='/api/upgrade/attempt'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);let body;try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}return attempt(env,a.session,body);
    }
    return json({error:'NOT_FOUND'},404);
  }catch(e){console.error('upgrade error',e);return json({error:'UPGRADE_SERVER_ERROR'},500);}
}

export {ensureUpgradeSchema,publicConfig,chanceBps as upgradeChanceBps,refundForStake as upgradeRefundCredits};
