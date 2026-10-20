import {freezeRaceLoadout} from './race-loadout.mjs';
import {RaceSession,validateRaceConfig,validateInputs,validateGhostKeyframes,settleRace,RACE_RUNTIME_VERSION,RACE_HZ} from '../public/js/race-session-v77.mjs';
import {ensureProgressionSchema,getProgression,PROGRESSION_REWARDS} from './progression.mjs';
const raceSchema=["-- Additive only: existing player_saves, inventories and progress are not rewritten.\nCREATE TABLE IF NOT EXISTS race_sessions (\n id TEXT PRIMARY KEY,\n user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n start_request_id TEXT NOT NULL,\n start_hash TEXT NOT NULL,\n runtime_version TEXT NOT NULL,\n config_json TEXT NOT NULL,\n car_save_json TEXT NOT NULL,\n seed INTEGER NOT NULL,\n state_json TEXT NOT NULL,\n sequence INTEGER NOT NULL DEFAULT 0,\n revision INTEGER NOT NULL DEFAULT 1,\n status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paid','cancelled','expired')),\n created_at INTEGER NOT NULL,\n starts_at INTEGER NOT NULL,\n expires_at INTEGER NOT NULL,\n updated_at INTEGER NOT NULL,\n UNIQUE(user_id,start_request_id)\n)", "CREATE UNIQUE INDEX IF NOT EXISTS idx_race_one_active_user ON race_sessions(user_id) WHERE status='active'", "CREATE TABLE IF NOT EXISTS race_input_receipts (\n race_id TEXT NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE,\n sequence INTEGER NOT NULL,\n payload_hash TEXT NOT NULL,\n response_json TEXT NOT NULL,\n created_at INTEGER NOT NULL,\n PRIMARY KEY(race_id,sequence)\n)"];
const initialized=new WeakMap();
const ghostSchema=["CREATE TABLE IF NOT EXISTS ghost_records(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,track_id TEXT NOT NULL,track_version TEXT NOT NULL,runtime_version TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('normal','career')),car_id TEXT NOT NULL,time_ms INTEGER NOT NULL CHECK(time_ms>0),keyframes_json TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,track_id,track_version,runtime_version,mode))","CREATE INDEX IF NOT EXISTS idx_ghost_records_track ON ghost_records(track_id,track_version,runtime_version,mode,time_ms)"];
async function ensureRaceSchema(env){let ready=initialized.get(env.DB);if(!ready){ready=(async()=>{await env.DB.batch(raceSchema.map(sql=>env.DB.prepare(sql)));try{await env.DB.prepare("ALTER TABLE race_sessions ADD COLUMN ghost_samples_json TEXT NOT NULL DEFAULT '[]'").run();}catch(e){if(!/duplicate column/i.test(String(e?.message||e)))throw e;}await env.DB.batch(ghostSchema.map(sql=>env.DB.prepare(sql)));})().catch(e=>{initialized.delete(env.DB);throw e;});initialized.set(env.DB,ready);}await ready;}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const id=v=>typeof v==='string'&&/^[\w-]{16,80}$/.test(v);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(v=>v.toString(16).padStart(2,'0')).join('');
const publicSession=row=>({raceId:row.id,runtimeVersion:row.runtime_version,config:JSON.parse(row.config_json),carSave:JSON.parse(row.car_save_json),seed:row.seed,startsAt:row.starts_at,expiresAt:row.expires_at,sequence:row.sequence,state:JSON.parse(row.state_json),status:row.status});
export async function handleRaceAuthority(request,env,url,session,{readBody,saveRow,applyEconomyOperation,settings}){
  await ensureRaceSchema(env);
  const route=url.pathname.slice('/api/economy/races/'.length),userId=session.user.id;
  if(route==='ghosts'&&request.method==='GET'){
    const trackId=url.searchParams.get('trackId')||'',mode=url.searchParams.get('mode')||'normal',trackVersion=RACE_RUNTIME_VERSION;
    if(!/^[a-z0-9_-]{1,64}$/i.test(trackId)||!['normal','career'].includes(mode))return json({error:'INVALID_GHOST_QUERY'},400);
    const own=await env.DB.prepare('SELECT g.*,u.username FROM ghost_records g JOIN users u ON u.id=g.user_id WHERE g.user_id=? AND g.track_id=? AND g.track_version=? AND g.runtime_version=? AND g.mode=?').bind(userId,trackId,trackVersion,trackVersion,mode).first();
    const top=(await env.DB.prepare('SELECT g.id,g.user_id,g.car_id,g.time_ms,g.created_at,u.username FROM ghost_records g JOIN users u ON u.id=g.user_id WHERE g.track_id=? AND g.track_version=? AND g.runtime_version=? AND g.mode=? ORDER BY g.time_ms ASC LIMIT 1').bind(trackId,trackVersion,trackVersion,mode).all()).results||[];
    const friends=(await env.DB.prepare(`SELECT g.id,g.user_id,g.car_id,g.time_ms,g.created_at,u.username FROM ghost_records g JOIN users u ON u.id=g.user_id JOIN friendships f ON (f.user_low=? AND f.user_high=g.user_id) OR (f.user_high=? AND f.user_low=g.user_id) WHERE g.track_id=? AND g.track_version=? AND g.runtime_version=? AND g.mode=? ORDER BY g.time_ms ASC LIMIT 50`).bind(userId,userId,trackId,trackVersion,trackVersion,mode).all()).results||[];
    let friend=null;const friendId=url.searchParams.get('friendId');if(friendId){const linked=await env.DB.prepare('SELECT 1 ok FROM friendships WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)').bind(userId,friendId,friendId,userId).first();if(!linked)return json({error:'NOT_A_FRIEND'},403);friend=await env.DB.prepare('SELECT g.*,u.username FROM ghost_records g JOIN users u ON u.id=g.user_id WHERE g.user_id=? AND g.track_id=? AND g.track_version=? AND g.runtime_version=? AND g.mode=?').bind(friendId,trackId,trackVersion,trackVersion,mode).first();}
    const selected=url.searchParams.get('ghostId');let replay=null;if(selected){replay=await env.DB.prepare('SELECT g.*,u.username FROM ghost_records g JOIN users u ON u.id=g.user_id WHERE g.id=? AND g.track_id=? AND g.track_version=? AND g.runtime_version=? AND g.mode=?').bind(selected,trackId,trackVersion,trackVersion,mode).first();if(!replay)return json({error:'GHOST_NOT_FOUND'},404);if(replay.user_id!==userId){const linked=await env.DB.prepare('SELECT 1 ok FROM friendships WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)').bind(userId,replay.user_id,replay.user_id,userId).first();if(!linked&&top[0]?.id!==replay.id)return json({error:'GHOST_FORBIDDEN'},403);}}
    const summary=x=>x?{id:x.id,userId:x.user_id,username:x.username,carId:x.car_id,timeMs:Number(x.time_ms),createdAt:Number(x.created_at)}:null;
    return json({ok:true,trackVersion,own:summary(own),global:top.map(summary),friends:friends.map(summary),friend:summary(friend),ghost:replay?{...summary(replay),keyframes:JSON.parse(replay.keyframes_json)}:null});
  }
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  let b;try{b=await readBody(request);}catch(e){return json({error:e.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_REQUEST'},e.message==='REQUEST_TOO_LARGE'?413:400);}
  if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'INVALID_REQUEST'},400);
  const t=Date.now();
  if(route==='start'){
    if(!id(b.requestId))return json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
    if(b.runtimeVersion!==RACE_RUNTIME_VERSION)return json({error:'RACE_CLIENT_UPDATE_REQUIRED',runtimeVersion:RACE_RUNTIME_VERSION},409);
    const startHash=await hash(b.config);
    const prior=await env.DB.prepare('SELECT * FROM race_sessions WHERE user_id=? AND start_request_id=?').bind(userId,b.requestId).first();
    if(prior)return prior.start_hash===startHash?json({ok:true,replay:true,...publicSession(prior)}):json({error:'IDEMPOTENCY_KEY_REUSED'},409);
    const row=await saveRow(env,userId);if(!row.save)return json({error:'SAVE_NOT_FOUND'},409);
    let config;try{config=validateRaceConfig(b.config,row.save);}catch(e){return json({error:e.message},400);}
    let carSave;try{carSave=await freezeRaceLoadout(env,userId,config.carId,{isAdmin:session.user.isAdmin,save:row.save,owner:await settings(env)});}catch(e){return json({error:e.message},400);}
    const seed=crypto.getRandomValues(new Uint32Array(1))[0],engine=new RaceSession(config,carSave,seed),raceId=crypto.randomUUID();
    try{
      await env.DB.batch([
        env.DB.prepare("UPDATE race_sessions SET status='expired',updated_at=? WHERE user_id=? AND status='active' AND expires_at<? AND json_type(state_json,'$.result') IS NOT 'object'").bind(t,userId,t),
        env.DB.prepare('INSERT INTO race_sessions(id,user_id,start_request_id,start_hash,runtime_version,config_json,car_save_json,seed,state_json,created_at,starts_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(raceId,userId,b.requestId,startHash,RACE_RUNTIME_VERSION,JSON.stringify(config),JSON.stringify(carSave),seed,JSON.stringify(engine.serialize()),t,t+2500,t+1800000,t)
      ]);
    }catch(e){
      const replay=await env.DB.prepare('SELECT * FROM race_sessions WHERE user_id=? AND start_request_id=?').bind(userId,b.requestId).first();
      if(replay)return replay.start_hash===startHash?json({ok:true,replay:true,...publicSession(replay)}):json({error:'IDEMPOTENCY_KEY_REUSED'},409);
      const active=await env.DB.prepare("SELECT id FROM race_sessions WHERE user_id=? AND status='active'").bind(userId).first();
      if(active)return json({error:'ACTIVE_RACE_EXISTS',raceId:active.id},409);throw e;
    }
    const created=await env.DB.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').bind(raceId,userId).first();return json({ok:true,...publicSession(created)});
  }
  if(!id(b.raceId))return json({error:'INVALID_RACE_ID'},400);
  let row=await env.DB.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').bind(b.raceId,userId).first();
  if(!row)return json({error:'RACE_NOT_FOUND'},404);
  if(route==='resume')return json({ok:true,...publicSession(row)});
  if(route==='cancel'){
    await env.DB.prepare("UPDATE race_sessions SET status='cancelled',revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='active' AND json_type(state_json,'$.result') IS NOT 'object'").bind(t,row.id,userId).run();
    row=await env.DB.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').bind(row.id,userId).first();return json({ok:true,...publicSession(row)});
  }
  if(row.runtime_version!==RACE_RUNTIME_VERSION)return json({error:'RACE_CLIENT_UPDATE_REQUIRED'},409);
  if(route==='input'){
    if(b.runtimeVersion!==row.runtime_version)return json({error:'RACE_CLIENT_UPDATE_REQUIRED'},409);
    if(!Number.isSafeInteger(b.sequence)||b.sequence<0)return json({error:'INVALID_SEQUENCE'},400);
    try{validateInputs(b.inputs);}catch(e){return json({error:e.message},400);}
    // Positions, checkpoint claims, clocks, places and rewards have no input channel.
    if(Object.keys(b).some(k=>!['raceId','sequence','inputs','runtimeVersion'].includes(k)))return json({error:'UNTRUSTED_RACE_FIELDS'},400);
    const payloadHash=await hash(b.inputs);
    const replay=await env.DB.prepare('SELECT payload_hash,response_json FROM race_input_receipts WHERE race_id=? AND sequence=?').bind(row.id,b.sequence).first();
    if(replay)return replay.payload_hash===payloadHash?json({...JSON.parse(replay.response_json),replay:true}):json({error:'INPUT_SEQUENCE_REUSED'},409);
    if(row.status!=='active')return json({error:'RACE_CLOSED'},409);
    if(t>row.expires_at)return json({error:'RACE_EXPIRED'},409);
    if(b.sequence!==row.sequence)return json({error:'INPUT_SEQUENCE_CONFLICT',sequence:row.sequence},409);
    const state=JSON.parse(row.state_json);
    if(state.result)return json({error:'RACE_ALREADY_FINISHED'},409);
    if(t<row.starts_at||state.frame+b.inputs.length>Math.max(0,Math.floor((t-row.starts_at)*RACE_HZ/1000))+30)return json({error:'RACE_CLOCK_AHEAD'},409);
    const engine=new RaceSession(JSON.parse(row.config_json),JSON.parse(row.car_save_json),row.seed,state);
    const advanced=engine.advanceWithSamples(b.inputs),summary=advanced.summary,response={ok:true,raceId:row.id,sequence:row.sequence+1,...summary,state:engine.serialize()};
    let ghostFrames=[];try{ghostFrames=JSON.parse(row.ghost_samples_json||'[]');}catch{}if(!Array.isArray(ghostFrames))ghostFrames=[];
    if(!ghostFrames.length){const p=new RaceSession(JSON.parse(row.config_json),JSON.parse(row.car_save_json),row.seed,JSON.parse(row.state_json)).player;ghostFrames.push([0,+p.x.toFixed(2),+p.y.toFixed(2),+p.angle.toFixed(4),+p.progress.toFixed(6),p.laps|0,p.checkpoint|0]);}
    ghostFrames.push(...advanced.frames);if(ghostFrames.length>1800)ghostFrames=ghostFrames.slice(-1800);
    try{
      const writes=await env.DB.batch([
        env.DB.prepare("UPDATE race_sessions SET state_json=?,ghost_samples_json=?,sequence=sequence+1,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? AND status='active'").bind(JSON.stringify(engine.serialize()),JSON.stringify(ghostFrames),t,row.id,userId,row.revision),
        env.DB.prepare('INSERT INTO race_input_receipts(race_id,sequence,payload_hash,response_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(row.id,b.sequence,payloadHash,JSON.stringify(response),t),
        env.DB.prepare('DELETE FROM race_input_receipts WHERE race_id=? AND sequence<?').bind(row.id,row.sequence-1)
      ]);
      if(Number(writes[0]?.meta?.changes||0)===1)return json(response);
    }catch(e){const found=await env.DB.prepare('SELECT payload_hash,response_json FROM race_input_receipts WHERE race_id=? AND sequence=?').bind(row.id,b.sequence).first();if(found)return found.payload_hash===payloadHash?json({...JSON.parse(found.response_json),replay:true}):json({error:'INPUT_SEQUENCE_REUSED'},409);throw e;}
    const found=await env.DB.prepare('SELECT payload_hash,response_json FROM race_input_receipts WHERE race_id=? AND sequence=?').bind(row.id,b.sequence).first();
    if(found)return found.payload_hash===payloadHash?json({...JSON.parse(found.response_json),replay:true}):json({error:'INPUT_SEQUENCE_REUSED'},409);
    return json({error:'INPUT_SEQUENCE_CONFLICT'},409);
  }
  if(route==='finish'){
    if(Object.keys(b).some(k=>k!=='raceId'))return json({error:'UNTRUSTED_RACE_FIELDS'},400);
    const config=JSON.parse(row.config_json),result=JSON.parse(row.state_json).result;
    if(!result)return json({error:'RACE_NOT_FINISHED'},409);
    if(!['active','paid'].includes(row.status))return json({error:'RACE_CLOSED'},409);
    let verifiedGhostFrames=[];if(['normal','career'].includes(config.mode))try{verifiedGhostFrames=JSON.parse(row.ghost_samples_json||'[]');}catch{}
    if(Array.isArray(verifiedGhostFrames)&&verifiedGhostFrames.length&&verifiedGhostFrames.length<1800){const engine=new RaceSession(config,JSON.parse(row.car_save_json),row.seed,JSON.parse(row.state_json)),p=engine.player,last=verifiedGhostFrames[verifiedGhostFrames.length-1];if(last?.[0]!==engine.frame)verifiedGhostFrames.push([engine.frame,+p.x.toFixed(2),+p.y.toFixed(2),+p.angle.toFixed(4),+p.progress.toFixed(6),p.laps|0,p.checkpoint|0]);}
    if(!validateGhostKeyframes(verifiedGhostFrames))verifiedGhostFrames=[];
    await ensureProgressionSchema(env);
    const requestId='race-finish:'+row.id,receiptId='race:'+row.id;
    const settled=await applyEconomyOperation(env,userId,requestId,'race_finish',save=>({...settleRace(save,config,result),exp:result.completed?PROGRESSION_REWARDS.ONLINE_FINISH.exp:0}),{
      guardSql:"EXISTS(SELECT 1 FROM race_sessions WHERE id=? AND user_id=? AND revision=? AND status='active')",guardArgs:[row.id,userId,row.revision],
      additionalStatements:(response)=>{
        const r=response.result,exists="EXISTS(SELECT 1 FROM economy_operations WHERE user_id=? AND request_id=? AND json_extract(response_json,'$.transactionId')=?)";
        return [
          env.DB.prepare(`INSERT INTO player_progress(user_id,total_exp,created_at,updated_at) SELECT ?,?,?,? WHERE ${exists} ON CONFLICT(user_id) DO UPDATE SET total_exp=total_exp+excluded.total_exp,updated_at=excluded.updated_at`).bind(userId,r.exp,t,t,userId,requestId,response.transactionId),
          env.DB.prepare(`INSERT INTO progression_rewards(id,user_id,source,event_id,exp,credits,requested_credits,created_at,meta_json) SELECT ?,?,'solo_race',?,?,?,?,?,? WHERE ${exists}`).bind(receiptId,userId,row.id,r.exp,r.credits,r.credits,t,JSON.stringify({mode:config.mode,trackId:config.trackId,place:r.place,timeMs:r.timeMs}),userId,requestId,response.transactionId),
          env.DB.prepare(`DELETE FROM race_input_receipts WHERE race_id=? AND ${exists}`).bind(row.id,userId,requestId,response.transactionId),
          env.DB.prepare(`INSERT OR IGNORE INTO owner_results(race_id,user_id,kind,won,time_ms,created_at) SELECT ?,?,?,?,?,? WHERE ${exists}`).bind(row.id,userId,config.mode==='normal'?'solo':config.mode,r.completed&&(config.mode==='career'?!!r.tier:r.place===1)?1:0,r.timeMs,t,userId,requestId,response.transactionId),
          env.DB.prepare(`UPDATE race_sessions SET status='paid',revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND ${exists}`).bind(t,row.id,userId,userId,requestId,response.transactionId),
          env.DB.prepare(`INSERT INTO ghost_records(id,user_id,track_id,track_version,runtime_version,mode,car_id,time_ms,keyframes_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${exists} AND ?=1 AND ?=1 AND json_array_length(?) BETWEEN 2 AND 1800 AND json_extract(?,'$[0][0]')=0 ON CONFLICT(user_id,track_id,track_version,runtime_version,mode) DO UPDATE SET id=excluded.id,car_id=excluded.car_id,time_ms=excluded.time_ms,keyframes_json=excluded.keyframes_json,created_at=excluded.created_at WHERE excluded.time_ms<ghost_records.time_ms`).bind(crypto.randomUUID(),userId,config.trackId,RACE_RUNTIME_VERSION,row.runtime_version,config.mode,config.carId,r.timeMs,JSON.stringify(verifiedGhostFrames),t,userId,requestId,response.transactionId,r.completed?1:0,['normal','career'].includes(config.mode)?1:0,JSON.stringify(verifiedGhostFrames),JSON.stringify(verifiedGhostFrames))
        ];
      }
    });
    if(settled.error)return json({error:settled.error},409);
    return json({...settled,progression:await getProgression(env,userId)});
  }
  return json({error:'NOT_FOUND'},404);
}
