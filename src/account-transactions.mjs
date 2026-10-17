import {backupAccountState} from './account-authority-backup.mjs';
const ready=new WeakMap();
async function schema(env){let p=ready.get(env.DB);if(!p){p=env.DB.prepare('CREATE TABLE IF NOT EXISTS economy_operations (user_id TEXT NOT NULL,request_id TEXT NOT NULL,operation_type TEXT NOT NULL,response_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,request_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)').run().catch(e=>{ready.delete(env.DB);throw e;});ready.set(env.DB,p);}await p;}
// Multi-account extension of the existing economy_operations ledger. The same
// receipt/token model protects all balance, ownership and domain-row writes.
export async function applyAccountTransaction(env,{actorId,requestId,type,accountIds,plan}){
 if(!/^[\w-]{16,80}$/.test(requestId||''))return {error:'IDEMPOTENCY_KEY_REQUIRED'};
 const ids=[...new Set(accountIds)];if(!ids.includes(actorId)||ids.length>12||!ids.length)return {error:'INVALID_TRANSACTION'};
 await schema(env);for(const id of ids)await backupAccountState(env,id);
 const previous=async()=>{const r=await env.DB.prepare('SELECT operation_type,response_json FROM economy_operations WHERE user_id=? AND request_id=?').bind(actorId,requestId).first();if(!r)return null;if(r.operation_type!==type)return {error:'IDEMPOTENCY_KEY_REUSED'};const saved=await env.DB.prepare('SELECT save_json,revision,updated_at FROM player_saves WHERE user_id=?').bind(actorId).first();return {replay:true,...JSON.parse(r.response_json),...(saved?{save:JSON.parse(saved.save_json),revision:saved.revision,updatedAt:saved.updated_at}:{})};};
 for(let attempt=0;attempt<6;attempt++){
  const prior=await previous();if(prior)return prior;
  const rows={},saves={};for(const id of ids){const row=await env.DB.prepare('SELECT save_json,revision FROM player_saves WHERE user_id=?').bind(id).first();if(!row)return {error:'SAVE_NOT_FOUND'};rows[id]=row;saves[id]=JSON.parse(row.save_json);}
  const planned=await plan(saves);if(planned?.error)return await previous()||planned;
  for(const id of ids){const s=saves[id];if(!Number.isSafeInteger(s.credits)||s.credits<0)return {error:'INVALID_BALANCE'};if(new TextEncoder().encode(JSON.stringify(s)).length>65536)return {error:'INVALID_SAVE'};}
  const transactionId=crypto.randomUUID(),time=Date.now(),response={ok:true,transactionId,result:planned.result||{},save:saves[actorId],revision:rows[actorId].revision+1,updatedAt:time};
  const receiptSql="EXISTS(SELECT 1 FROM economy_operations WHERE user_id=? AND request_id=? AND json_extract(response_json,'$.transactionId')=?)",receiptArgs=[actorId,requestId,transactionId];
  const revisions=ids.map(()=>'(SELECT revision FROM player_saves WHERE user_id=?)=?').join(' AND '),revisionArgs=ids.flatMap(id=>[id,rows[id].revision]);
  const commands=[
   env.DB.prepare('INSERT OR IGNORE INTO economy_operations(user_id,request_id,operation_type,response_json,created_at) SELECT ?,?,?,?,? WHERE '+revisions+(planned.guardSql?' AND ('+planned.guardSql+')':''))
    .bind(actorId,requestId,type,JSON.stringify(response),time,...revisionArgs,...(planned.guardArgs||[])),
   ...ids.map(id=>env.DB.prepare('UPDATE player_saves SET save_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND '+receiptSql).bind(JSON.stringify(saves[id]),time,id,...receiptArgs)),
   ...(planned.statements?.({transactionId,time,receiptSql,receiptArgs,response})||[])
  ];
  try{const out=await env.DB.batch(commands);if(Number(out[0]?.meta?.changes)===1)return response;}
  catch(e){const replay=await previous();if(replay)return replay;throw e;}
 }
 const replay=await previous();return replay||{error:'SAVE_CONFLICT'};
}
