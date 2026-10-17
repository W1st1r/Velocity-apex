// Server-only persistence primitive; callers must authenticate room identities and
// independently validate the race result before selecting a winner.
const schema=`CREATE TABLE IF NOT EXISTS room_wager_escrows (
 race_id TEXT PRIMARY KEY, participants_json TEXT NOT NULL,
 stake INTEGER NOT NULL CHECK(stake>0),
 status TEXT NOT NULL CHECK(status IN ('locked','awarded','refunded')),
 winner_user_id TEXT, lock_token TEXT NOT NULL, settlement_token TEXT,
 created_at INTEGER NOT NULL, settled_at INTEGER)`;
const ready=new WeakMap();
async function ensure(DB){if(!DB)throw Error('WAGER_DB_UNAVAILABLE');let pending=ready.get(DB);if(!pending){pending=DB.prepare(schema).run().catch(e=>{ready.delete(DB);throw e;});ready.set(DB,pending);}await pending;}
const fail=code=>({ok:false,code});
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128;
async function row(DB,id){return DB.prepare('SELECT * FROM room_wager_escrows WHERE race_id=?').bind(id).first();}
export async function lockRoomWager(DB,{raceId,userIds,stake}){
 if(!validId(raceId)||!Array.isArray(userIds)||userIds.length<2||userIds.length>14||userIds.some(id=>!validId(id))||new Set(userIds).size!==userIds.length||!Number.isSafeInteger(stake)||stake<=0||!Number.isSafeInteger(stake*userIds.length))return fail('INVALID_WAGER');
 await ensure(DB);const ids=JSON.stringify([...userIds].sort()),token=crypto.randomUUID(),t=Date.now();
 await DB.batch([
  DB.prepare(`INSERT OR IGNORE INTO room_wager_escrows(race_id,participants_json,stake,status,lock_token,created_at)
   SELECT ?,?,?,'locked',?,? WHERE
   (SELECT COUNT(*) FROM player_saves WHERE user_id IN (SELECT value FROM json_each(?))
    AND json_type(save_json,'$.credits') IN ('integer','real') AND json_extract(save_json,'$.credits')=CAST(json_extract(save_json,'$.credits') AS INTEGER) AND json_extract(save_json,'$.credits')>=?)=?`)
   .bind(raceId,ids,stake,token,t,ids,stake,userIds.length),
  DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',CAST(json_extract(save_json,'$.credits')-? AS INTEGER)),revision=revision+1,updated_at=?
   WHERE user_id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM room_wager_escrows WHERE race_id=? AND lock_token=?)`)
   .bind(stake,t,ids,raceId,token)
 ]);
 const r=await row(DB,raceId);if(!r)return fail('INSUFFICIENT_CR');
 if(r.participants_json!==ids||r.stake!==stake)return fail('IDEMPOTENCY_KEY_REUSED');
 return {ok:true,status:r.status,replayed:r.lock_token!==token,pot:stake*userIds.length};
}
export async function settleRoomWager(DB,{raceId,winnerUserId=null,refund=false}){
 if(!validId(raceId)||typeof refund!=='boolean'||!refund&&!validId(winnerUserId))return fail('INVALID_SETTLEMENT');
 await ensure(DB);const r=await row(DB,raceId);if(!r)return fail('WAGER_NOT_FOUND');
 const users=JSON.parse(r.participants_json),status=refund?'refunded':'awarded',winner=refund?null:winnerUserId;
 if(!refund&&!users.includes(winner))return fail('WAGER_WINNER_MISSING');
 if(r.status!=='locked')return r.status===status&&r.winner_user_id===winner?{ok:true,status,replayed:true}:fail('WAGER_ALREADY_SETTLED');
 const recipients=refund?users:[winner],amount=refund?r.stake:r.stake*users.length,ids=JSON.stringify(recipients),token=crypto.randomUUID(),t=Date.now();
 await DB.batch([
  DB.prepare(`UPDATE room_wager_escrows SET status=?,winner_user_id=?,settlement_token=?,settled_at=? WHERE race_id=? AND status='locked'
   AND (SELECT COUNT(*) FROM player_saves WHERE user_id IN (SELECT value FROM json_each(?))
    AND json_type(save_json,'$.credits') IN ('integer','real') AND json_extract(save_json,'$.credits')=CAST(json_extract(save_json,'$.credits') AS INTEGER) AND json_extract(save_json,'$.credits')>=0
    AND json_extract(save_json,'$.credits')<=?)=?`)
   .bind(status,winner,token,t,raceId,ids,Number.MAX_SAFE_INTEGER-amount,recipients.length),
  DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',CAST(json_extract(save_json,'$.credits')+? AS INTEGER)),revision=revision+1,updated_at=?
   WHERE user_id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM room_wager_escrows WHERE race_id=? AND settlement_token=?)`)
   .bind(amount,t,ids,raceId,token)
 ]);
 const settled=await row(DB,raceId);
 if(settled.status===status&&settled.winner_user_id===winner)return {ok:true,status,replayed:settled.settlement_token!==token};
 return fail(settled.status==='locked'?'WAGER_PAYOUT_BLOCKED':'WAGER_ALREADY_SETTLED');
}

export async function readRoomWager(DB,raceId){if(!validId(raceId))return null;await ensure(DB);return row(DB,raceId);}
