import {freeAccountIdentity} from './auth.mjs';
import {crewIdentity} from './crews.mjs';

const DAY=86400000,CHALLENGE_TTL=24*60*60*1000;
const ACTIVE=new Set(['INVITED','ACCEPTED','ROSTER_LOCKED','READY','RUNNING']);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const text=(v,max=80)=>typeof v==='string'?v.trim().slice(0,max):'';
const id=()=>crypto.randomUUID();
const db=env=>env?.DB;

async function expireInvitations(env,t=Date.now()){
  await env.DB.batch([
    env.DB.prepare("UPDATE clan_war_challenges SET state='EXPIRED',updated_at=? WHERE state IN('INVITED','ACCEPTED','ROSTER_LOCKED','READY') AND expires_at<=?").bind(t,t),
    env.DB.prepare("DELETE FROM clan_war_active_crews WHERE battle_id IN(SELECT id FROM clan_war_challenges WHERE state='EXPIRED')"),
    env.DB.prepare("DELETE FROM clan_war_active_users WHERE battle_id IN(SELECT id FROM clan_war_challenges WHERE state='EXPIRED')")
  ]);
}
async function membership(env,userId){return crewIdentity(env,userId);}
async function isLeader(env,crewId,userId){return !!(await env.DB.prepare('SELECT 1 ok FROM crews WHERE id=? AND leader_id=?').bind(crewId,userId).first());}
async function challenge(env,battleId){return env.DB.prepare('SELECT * FROM clan_war_challenges WHERE id=?').bind(battleId).first();}
async function hasAccess(env,b,userId){return !!(await env.DB.prepare('SELECT 1 ok FROM crew_members WHERE user_id=? AND crew_id IN(?,?)').bind(userId,b.attacker_crew_id,b.defender_crew_id).first());}
async function roster(env,battleId){const r=await env.DB.prepare('SELECT r.crew_id,r.user_id,r.ready_at,u.username FROM clan_war_rosters r JOIN users u ON u.id=r.user_id WHERE r.battle_id=? ORDER BY r.crew_id,r.user_id').bind(battleId).all();return r.results||[];}
async function ensurePrivateRoom(env,b){
  if(!env.ROOMS)return {error:'ROOM_SERVICE_UNAVAILABLE',status:503};
  const rows=await roster(env,b.id);if(rows.length!==6)return {error:'ROSTER_INCOMPLETE',status:409};
  const roomName=`CLAN_WAR:${b.id}`,stub=env.ROOMS.get(env.ROOMS.idFromName(roomName));
  const saves=await env.DB.prepare(`SELECT user_id,save_json FROM player_saves WHERE user_id IN(${rows.map(()=>'?').join(',')})`).bind(...rows.map(r=>r.user_id)).all(),byUser=new Map((saves.results||[]).map(r=>{let save={};try{save=JSON.parse(r.save_json||'{}');}catch{}return[r.user_id,{liveryId:save.selectedLivery||'apexLime',effectId:save.selectedEffect||'standard',colorId:save.selectedColor||'stock',vinylId:save.selectedVinyl||'none'}];}));
  const teams=[b.attacker_crew_id,b.defender_crew_id].map(crewId=>({crewId,players:rows.filter(r=>r.crew_id===crewId).map(r=>({userId:r.user_id,name:'@'+r.username,loadout:byUser.get(r.user_id)||{}}))}));
  const response=await stub.fetch(new Request('https://room.internal/clan/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({battleId:b.id,roomName,teams})}));
  if(!response.ok){let detail={};try{detail=await response.json();}catch{}return {error:detail.error||'ROOM_CREATE_FAILED',status:response.status};}
  await env.DB.prepare("UPDATE clan_war_challenges SET room_name=?,updated_at=? WHERE id=? AND state IN('READY','RUNNING')").bind(roomName,Date.now(),b.id).run();
  return {roomName,room:await response.json()};
}
async function details(env,b,userId){
  if(!await hasAccess(env,b,userId))return null;
  const members=await roster(env,b.id);
  const score=await env.DB.prepare('SELECT * FROM clan_war_battle_state WHERE battle_id=?').bind(b.id).first();
  const history=await env.DB.prepare('SELECT round_number,attacker_points,defender_points,results_json,created_at FROM clan_war_rounds WHERE battle_id=? ORDER BY round_number').bind(b.id).all();
  return {id:b.id,state:b.state,attackerCrewId:b.attacker_crew_id,defenderCrewId:b.defender_crew_id,createdAt:b.created_at,expiresAt:b.expires_at,roomAvailable:['READY','RUNNING'].includes(b.state),roundNumber:Number(score?.round_number)||1,score:{attacker:Number(score?.attacker_score)||0,defender:Number(score?.defender_score)||0},winnerCrewId:score?.winner_crew_id||null,tiebreak:score?.tiebreak||null,rounds:(history.results||[]).map(x=>({...x,results:JSON.parse(x.results_json||'[]')})),rosters:[b.attacker_crew_id,b.defender_crew_id].map(crewId=>({crewId,players:members.filter(x=>x.crew_id===crewId).map(x=>({userId:x.user_id,username:x.username,ready:!!x.ready_at}))}))};
}

const ROUND_POINTS=[0,10,7,5,3,2,1];
export async function abortClanWar(env,battleId,reason='PARTICIPANT_DISCONNECTED',at=Date.now()){
  const before=await env.DB.prepare('SELECT status FROM clan_war_battle_state WHERE battle_id=?').bind(battleId).first();
  if(before&&before.status!=='ACTIVE')return{ok:true,aborted:before.status==='ABORTED',finished:before.status==='FINISHED',battleId};
  const result={reason:String(reason).slice(0,48),abortedAt:at};
  await env.DB.batch([
    env.DB.prepare("UPDATE clan_war_battle_state SET status='ABORTED',result_json=?,updated_at=?,completed_at=COALESCE(completed_at,?) WHERE battle_id=? AND status='ACTIVE'").bind(JSON.stringify(result),at,at,battleId),
    env.DB.prepare("UPDATE clan_war_challenges SET state='ABORTED',updated_at=? WHERE id=? AND state IN('READY','RUNNING')").bind(at,battleId),
    env.DB.prepare('DELETE FROM clan_war_active_users WHERE battle_id=?').bind(battleId),
    env.DB.prepare('DELETE FROM clan_war_active_crews WHERE battle_id=?').bind(battleId)
  ]);
  return {ok:true,aborted:true,battleId,result};
}

export async function recordClanWarRound(env,battleId,roundNumber,rawResults,at=Date.now()){
  const b=await challenge(env,battleId);if(!b)throw Error('CLAN_MATCH_NOT_FOUND');
  const state=await env.DB.prepare('SELECT * FROM clan_war_battle_state WHERE battle_id=?').bind(battleId).first();
  const prior=await env.DB.prepare('SELECT * FROM clan_war_rounds WHERE battle_id=? AND round_number=?').bind(battleId,roundNumber).first();
  if(prior?.applied){
    const latest=state,finished=latest.status==='FINISHED';
    if(finished){const summary=JSON.stringify({attackerCrewId:b.attacker_crew_id,defenderCrewId:b.defender_crew_id,score:{attacker:Number(latest.attacker_score),defender:Number(latest.defender_score)},winnerCrewId:latest.winner_crew_id||null,tiebreak:latest.tiebreak||null,roundNumber:Number(roundNumber)});await env.DB.batch([env.DB.prepare("UPDATE clan_war_challenges SET state='FINISHED',updated_at=? WHERE id=? AND state IN('RUNNING','READY')").bind(at,battleId),env.DB.prepare('UPDATE clan_war_battle_state SET result_json=?,completed_at=COALESCE(completed_at,?),updated_at=? WHERE battle_id=? AND status=\'FINISHED\'').bind(summary,at,at,battleId),env.DB.prepare('DELETE FROM clan_war_active_users WHERE battle_id=?').bind(battleId),env.DB.prepare('DELETE FROM clan_war_active_crews WHERE battle_id=?').bind(battleId)]);}
    else await env.DB.prepare("UPDATE clan_war_challenges SET state='READY',updated_at=? WHERE id=? AND state='RUNNING'").bind(at,battleId).run();
    return{ok:true,replay:true,roundNumber:Number(roundNumber),roundPoints:{attacker:Number(prior.attacker_points),defender:Number(prior.defender_points)},score:{attacker:Number(latest.attacker_score),defender:Number(latest.defender_score)},nextRound:Number(latest.round_number),finished,winnerCrewId:latest.winner_crew_id||null,tiebreak:latest.tiebreak||null};
  }
  if(!state||state.status!=='ACTIVE'||Number(state.round_number)!==Number(roundNumber))throw Error('CLAN_ROUND_STATE_CHANGED');
  if(b.state!=='RUNNING')throw Error('CLAN_MATCH_NOT_RUNNING');
  const rosterRows=await env.DB.prepare('SELECT crew_id,user_id FROM clan_war_rosters WHERE battle_id=?').bind(battleId).all(),rosterMap=new Map((rosterRows.results||[]).map(x=>[x.user_id,x.crew_id]));
  if(rosterMap.size!==6||!Array.isArray(rawResults)||rawResults.length!==6)throw Error('CLAN_ROUND_ROSTER_INVALID');
  const results=rawResults.map(x=>({userId:String(x.userId||''),crewId:String(x.crewId||''),place:Number(x.place),timeMs:Math.floor(Number(x.timeMs))}));
  if(new Set(results.map(x=>x.userId)).size!==6||new Set(results.map(x=>x.place)).size!==6||results.some(x=>rosterMap.get(x.userId)!==x.crewId||!Number.isInteger(x.place)||x.place<1||x.place>6||!Number.isSafeInteger(x.timeMs)||x.timeMs<0))throw Error('CLAN_ROUND_RESULTS_INVALID');
  const pointsByCrew=new Map([[b.attacker_crew_id,0],[b.defender_crew_id,0]]);
  for(const r of results)pointsByCrew.set(r.crewId,(pointsByCrew.get(r.crewId)||0)+ROUND_POINTS[r.place]);
  const decisiveCrewId=roundNumber===4?results.slice().sort((x,y)=>x.place-y.place)[0].crewId:null;
  const packed=results.sort((x,y)=>x.place-y.place).map(x=>({...x,points:ROUND_POINTS[x.place]}));
  const created=await env.DB.prepare(`INSERT OR IGNORE INTO clan_war_rounds(battle_id,round_number,attacker_points,defender_points,decisive_crew_id,results_json,applied,created_at) VALUES(?,?,?,?,?,?,0,?)`).bind(battleId,roundNumber,pointsByCrew.get(b.attacker_crew_id),pointsByCrew.get(b.defender_crew_id),decisiveCrewId,JSON.stringify(packed),at).run();
  const roundRow=await env.DB.prepare('SELECT * FROM clan_war_rounds WHERE battle_id=? AND round_number=?').bind(battleId,roundNumber).first();
  if(!roundRow?.applied){
    await env.DB.batch([
      ...packed.map(r=>env.DB.prepare('INSERT OR IGNORE INTO clan_war_round_results(battle_id,round_number,user_id,crew_id,place,points,time_ms,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(battleId,roundNumber,r.userId,r.crewId,r.place,r.points,r.timeMs,at)),
      env.DB.prepare(`UPDATE clan_war_battle_state SET
        attacker_score=attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?),
        defender_score=defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?),
        round_number=CASE WHEN round_number<3 THEN round_number+1 WHEN round_number=3 AND attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)=defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?) THEN 4 ELSE round_number END,
        status=CASE WHEN round_number>=4 OR (round_number=3 AND attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)<>defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)) THEN 'FINISHED' ELSE status END,
        winner_crew_id=CASE WHEN round_number>=4 THEN CASE WHEN attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)>defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?) THEN ? WHEN attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)<defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?) THEN ? ELSE ? END WHEN round_number=3 AND attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)<>defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?) THEN CASE WHEN attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)>defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?) THEN ? ELSE ? END ELSE NULL END,
        tiebreak=CASE WHEN round_number>=4 AND attacker_score+(SELECT attacker_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?)=defender_score+(SELECT defender_points FROM clan_war_rounds WHERE battle_id=? AND round_number=?) THEN 'DECISIVE_RACE_BEST_PLACE' ELSE NULL END,
        updated_at=? WHERE battle_id=? AND round_number=? AND status='ACTIVE'`).bind(
          battleId,roundNumber,battleId,roundNumber,
          battleId,roundNumber,battleId,roundNumber,
          battleId,roundNumber,battleId,roundNumber,
          battleId,roundNumber,battleId,roundNumber,b.attacker_crew_id,battleId,roundNumber,battleId,roundNumber,b.defender_crew_id,decisiveCrewId,
          battleId,roundNumber,battleId,roundNumber,
          battleId,roundNumber,battleId,roundNumber,b.attacker_crew_id,b.defender_crew_id,
          battleId,roundNumber,battleId,roundNumber,at,battleId,roundNumber),
      env.DB.prepare('UPDATE clan_war_rounds SET applied=1 WHERE battle_id=? AND round_number=? AND applied=0').bind(battleId,roundNumber)
    ]);
  }
  const latest=await env.DB.prepare('SELECT * FROM clan_war_battle_state WHERE battle_id=?').bind(battleId).first();
  const finished=latest?.status==='FINISHED';
  if(finished){
    const result={attackerCrewId:b.attacker_crew_id,defenderCrewId:b.defender_crew_id,score:{attacker:Number(latest.attacker_score),defender:Number(latest.defender_score)},winnerCrewId:latest.winner_crew_id||null,tiebreak:latest.tiebreak||null,roundNumber:Number(roundNumber)};
    await env.DB.batch([
      env.DB.prepare("UPDATE clan_war_challenges SET state='FINISHED',updated_at=? WHERE id=? AND state IN('RUNNING','READY')").bind(at,battleId),
      env.DB.prepare('UPDATE clan_war_battle_state SET result_json=?,completed_at=COALESCE(completed_at,?),updated_at=? WHERE battle_id=? AND status=\'FINISHED\'').bind(JSON.stringify(result),at,at,battleId),
      env.DB.prepare('DELETE FROM clan_war_active_users WHERE battle_id=?').bind(battleId),
      env.DB.prepare('DELETE FROM clan_war_active_crews WHERE battle_id=?').bind(battleId)
    ]);
  }else{
    await env.DB.prepare("UPDATE clan_war_challenges SET state='READY',updated_at=? WHERE id=? AND state='RUNNING'").bind(at,battleId).run();
  }
  return {ok:true,replay:!created.meta?.changes,roundNumber:Number(roundNumber),roundPoints:{attacker:Number(roundRow?.attacker_points)||0,defender:Number(roundRow?.defender_points)||0},score:{attacker:Number(latest.attacker_score),defender:Number(latest.defender_score)},nextRound:Number(latest.round_number),finished,winnerCrewId:latest.winner_crew_id||null,tiebreak:latest.tiebreak||null};
}
async function handler(request,env,url){
  if(!/^\/api\/clan-wars(?:\/|$)/.test(url.pathname))return null;
  if(!db(env))return json({error:'DATABASE_UNAVAILABLE'},503);
  if(request.method!=='GET'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'ORIGIN'},403);
  if(url.pathname.endsWith('/ws')&&request.headers.get('origin')!==url.origin)return json({error:'ORIGIN'},403);
  const identity=await freeAccountIdentity(env,request);if(identity.response)return identity.response;if(!identity.user)return json({error:'AUTH_REQUIRED'},401);
  const userId=identity.user.id,base='/api/clan-wars',suffix=url.pathname.slice(base.length),now=Date.now();
  try{
    await expireInvitations(env,now);
    if(suffix===''&&request.method==='POST'){
      const body=await request.json().catch(()=>null);if(!body)return json({error:'INVALID_REQUEST'},400);
      const own=await membership(env,userId),defender=text(body.defenderCrewId,80),key=text(body.idempotencyKey,100);
      if(!own)return json({error:'NO_CREW'},409);if(!await isLeader(env,own.id,userId))return json({error:'LEADER_REQUIRED'},403);
      if(!defender||defender===own.id||!key)return json({error:'INVALID_CHALLENGE'},400);
      const target=await env.DB.prepare('SELECT id FROM crews WHERE id=?').bind(defender).first();if(!target)return json({error:'CREW_NOT_FOUND'},404);
      const scopedKey=`${userId}:${key}`;const prior=await env.DB.prepare('SELECT * FROM clan_war_challenges WHERE idempotency_key=?').bind(scopedKey).first();
      if(prior){if(prior.attacker_crew_id!==own.id||prior.defender_crew_id!==defender)return json({error:'IDEMPOTENCY_CONFLICT'},409);return json({ok:true,replay:true,challenge:await details(env,prior,userId)});}
      const battleId=id(),expires=now+CHALLENGE_TTL;
      try{await env.DB.batch([
        env.DB.prepare("INSERT INTO clan_war_challenges(id,idempotency_key,attacker_crew_id,defender_crew_id,created_by,state,expires_at,room_name,created_at,updated_at) VALUES(?,?,?,?,?,'INVITED',?,NULL,?,?)").bind(battleId,scopedKey,own.id,defender,userId,expires,now,now),
        env.DB.prepare("INSERT INTO clan_war_battle_state(battle_id,round_number,attacker_score,defender_score,status,updated_at) VALUES(?,1,0,0,'ACTIVE',?)").bind(battleId,now),
        env.DB.prepare('INSERT INTO clan_war_active_crews(crew_id,battle_id) VALUES(?,?)').bind(own.id,battleId),
        env.DB.prepare('INSERT INTO clan_war_active_crews(crew_id,battle_id) VALUES(?,?)').bind(defender,battleId)
      ]);}catch(e){if(String(e).includes('UNIQUE')||String(e).includes('constraint')){const replay=await env.DB.prepare('SELECT * FROM clan_war_challenges WHERE idempotency_key=?').bind(scopedKey).first();if(replay&&replay.attacker_crew_id===own.id&&replay.defender_crew_id===defender)return json({ok:true,replay:true,challenge:await details(env,replay,userId)});return json({error:'CLAN_HAS_ACTIVE_MATCH'},409);}throw e;}
      return json({ok:true,challenge:await details(env,await challenge(env,battleId),userId)},201);
    }
    if(suffix===''&&request.method==='GET'){
      const mine=await membership(env,userId);if(!mine)return json({ok:true,challenges:[]});
      const list=await env.DB.prepare('SELECT * FROM clan_war_challenges WHERE attacker_crew_id=? OR defender_crew_id=? ORDER BY created_at DESC LIMIT 100').bind(mine.id,mine.id).all();
      const challenges=[];for(const b of list.results||[])challenges.push(await details(env,b,userId));return json({ok:true,challenges});
    }
    const match=suffix.match(/^\/([0-9a-f-]{36})(?:\/(decision|cancel|roster|ready|connect|ws))?$/i);if(!match)return json({error:'NOT_FOUND'},404);
    const battleId=match[1],action=match[2]||'status',b=await challenge(env,battleId);if(!b)return json({error:'NOT_FOUND'},404);
    if(action==='status'&&request.method==='GET'){
      const data=await details(env,b,userId);if(!data)return json({error:'FORBIDDEN'},403);
      if(b.state==='READY'||b.state==='RUNNING'){const room=await ensurePrivateRoom(env,b);if(room.error&&room.status>=500)return json({ok:true,challenge:data,roomPending:true});}
      return json({ok:true,challenge:data});
    }
    const own=await membership(env,userId);if(!own||![b.attacker_crew_id,b.defender_crew_id].includes(own.id))return json({error:'FORBIDDEN'},403);
    if(action==='decision'&&request.method==='POST'){
      const body=await request.json().catch(()=>null);if(!body||!['accept','reject'].includes(body.decision))return json({error:'INVALID_DECISION'},400);
      if(own.id!==b.defender_crew_id||!await isLeader(env,own.id,userId))return json({error:'DEFENDER_LEADER_REQUIRED'},403);
      if(b.state=== (body.decision==='accept'?'ACCEPTED':'REJECTED'))return json({ok:true,replay:true,challenge:await details(env,b,userId)});
      if(b.state!=='INVITED'||b.expires_at<=now)return json({error:'INVALID_STATE'},409);
      const next=body.decision==='accept'?'ACCEPTED':'REJECTED';await env.DB.batch([env.DB.prepare("UPDATE clan_war_challenges SET state=?,updated_at=? WHERE id=? AND state='INVITED' AND EXISTS(SELECT 1 FROM crews WHERE id=defender_crew_id AND leader_id=?)").bind(next,now,battleId,userId)]);
      const decided=await challenge(env,battleId);if(decided.state!==next)return json({error:'INVALID_STATE'},409);
      if(next==='REJECTED')await env.DB.batch([env.DB.prepare('DELETE FROM clan_war_active_crews WHERE battle_id=?').bind(battleId)]);
      return json({ok:true,challenge:await details(env,await challenge(env,battleId),userId)});
    }
    if(action==='cancel'&&request.method==='POST'){
      if(own.id!==b.attacker_crew_id||!await isLeader(env,own.id,userId))return json({error:'ATTACKER_LEADER_REQUIRED'},403);
      if(['CANCELLED','REJECTED','EXPIRED'].includes(b.state))return json({ok:true,replay:true,state:b.state});if(!['INVITED','ACCEPTED','ROSTER_LOCKED','READY'].includes(b.state))return json({error:'INVALID_STATE'},409);
      await env.DB.batch([env.DB.prepare("UPDATE clan_war_challenges SET state='CANCELLED',updated_at=? WHERE id=?").bind(now,battleId),env.DB.prepare('DELETE FROM clan_war_active_crews WHERE battle_id=?').bind(battleId),env.DB.prepare('DELETE FROM clan_war_active_users WHERE battle_id=?').bind(battleId)]);
      return json({ok:true,state:'CANCELLED'});
    }
    if(action==='roster'&&request.method==='POST'){
      if(b.state!=='ACCEPTED')return json({error:'INVALID_STATE'},409);if(!await isLeader(env,own.id,userId))return json({error:'LEADER_REQUIRED'},403);
      const body=await request.json().catch(()=>null),players=Array.isArray(body?.userIds)?body.userIds.map(x=>text(x,80)):[];
      if(players.length!==3||new Set(players).size!==3||players.some(x=>!x))return json({error:'ROSTER_MUST_HAVE_THREE_UNIQUE_PLAYERS'},400);
      const placeholders=players.map(()=>'?').join(',');const valid=await env.DB.prepare(`SELECT user_id FROM crew_members WHERE crew_id=? AND user_id IN(${placeholders})`).bind(own.id,...players).all();if((valid.results||[]).length!==3)return json({error:'ROSTER_MEMBERSHIP_INVALID'},403);
      const already=await env.DB.prepare('SELECT user_id FROM clan_war_rosters WHERE battle_id=? AND crew_id=?').bind(battleId,own.id).all();
      if((already.results||[]).length){const previous=(already.results||[]).map(x=>x.user_id).sort(),requested=[...players].sort();if(previous.join('|')===requested.join('|'))return json({ok:true,replay:true,challenge:await details(env,b,userId)});return json({error:'ROSTER_ALREADY_LOCKED'},409);}
      try{await env.DB.batch([
        env.DB.prepare('INSERT INTO clan_war_rosters(battle_id,crew_id,user_id) VALUES(?,?,?)').bind(battleId,own.id,players[0]),
        ...players.slice(1).map(player=>env.DB.prepare('INSERT INTO clan_war_rosters(battle_id,crew_id,user_id) VALUES(?,?,?)').bind(battleId,own.id,player)),
        ...players.map(player=>env.DB.prepare('INSERT INTO clan_war_active_users(user_id,battle_id) VALUES(?,?)').bind(player,battleId))
      ]);}catch(e){if(String(e).includes('UNIQUE')||String(e).includes('constraint'))return json({error:'PLAYER_OR_ROSTER_ALREADY_RESERVED'},409);throw e;}
      const count=await env.DB.prepare('SELECT COUNT(*) count FROM clan_war_rosters WHERE battle_id=? AND crew_id=?').bind(battleId,b.defender_crew_id).first();
      if(Number(count?.count)===3)await env.DB.prepare("UPDATE clan_war_challenges SET state='ROSTER_LOCKED',updated_at=? WHERE id=? AND state='ACCEPTED'").bind(now,battleId).run();
      return json({ok:true,challenge:await details(env,await challenge(env,battleId),userId)});
    }
    if(action==='ready'&&request.method==='POST'){
      if(!['ROSTER_LOCKED','READY'].includes(b.state))return json({error:'INVALID_STATE'},409);
      const assigned=await env.DB.prepare('SELECT 1 ok FROM clan_war_rosters WHERE battle_id=? AND user_id=?').bind(battleId,userId).first();if(!assigned)return json({error:'ROSTER_MEMBERSHIP_REQUIRED'},403);
      await env.DB.prepare('UPDATE clan_war_rosters SET ready_at=COALESCE(ready_at,?) WHERE battle_id=? AND user_id=?').bind(now,battleId,userId).run();
      const counts=await env.DB.prepare('SELECT COUNT(*) total,SUM(CASE WHEN ready_at IS NOT NULL THEN 1 ELSE 0 END) ready FROM clan_war_rosters WHERE battle_id=?').bind(battleId).first();
      if(Number(counts?.total)===6&&Number(counts?.ready)===6){await env.DB.prepare("UPDATE clan_war_challenges SET state='READY',room_name=?,updated_at=? WHERE id=? AND state IN('ROSTER_LOCKED','READY')").bind(`CLAN_WAR:${battleId}`,Date.now(),battleId).run();const latest=await challenge(env,battleId),created=await ensurePrivateRoom(env,latest);if(created.error)return json({error:created.error},created.status);}
      return json({ok:true,challenge:await details(env,await challenge(env,battleId),userId)});
    }
    if((action==='connect'||action==='ws')&&(request.method==='POST'||request.method==='GET')){
      if(!['READY','RUNNING'].includes(b.state))return json({error:'MATCH_NOT_READY'},409);
      const assigned=await env.DB.prepare('SELECT 1 ok FROM clan_war_rosters WHERE battle_id=? AND user_id=?').bind(battleId,userId).first();if(!assigned)return json({error:'ROSTER_MEMBERSHIP_REQUIRED'},403);
      const room=await ensurePrivateRoom(env,b);if(room.error)return json({error:room.error},room.status);
      const stub=env.ROOMS.get(env.ROOMS.idFromName(room.roomName));const session=await stub.fetch(new Request('https://room.internal/clan/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId})}));if(!session.ok)return session;
      const credentials=await session.json();
      if(action==='connect')return json({ok:true,roomName:room.roomName,...credentials});
      if(request.headers.get('upgrade')!=='websocket')return json({error:'WEBSOCKET_REQUIRED'},426);
      const wsUrl=new URL('https://room.internal/ws');wsUrl.searchParams.set('playerId',credentials.playerId);wsUrl.searchParams.set('token',credentials.sessionToken);
      return stub.fetch(new Request(wsUrl.toString(),{headers:request.headers}));
    }
    return json({error:'METHOD_NOT_ALLOWED'},405);
  }catch(error){console.error('clan war request',error);return json({error:'CLAN_WAR_UNAVAILABLE'},503);}
}

export async function handleClanWarRequest(request,env,url){return handler(request,env,url);}
