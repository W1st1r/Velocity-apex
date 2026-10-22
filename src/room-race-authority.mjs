import {RoomRaceInputs} from './room-race-inputs.mjs';
import {RACE_RUNTIME_VERSION} from '../public/js/race-session-v77.mjs';
import {freezeRaceLoadout} from './race-loadout.mjs';
import {awardProgression,PROGRESSION_REWARDS} from './progression.mjs';
import {recordResult} from './owner.mjs';
import {settleRoomWager} from './room-wager-escrow.mjs';
import {settleMediaEvent} from './media.mjs';
import {PROTOCOL_VERSION} from './protocol.mjs';
import {awardClanInfluence,recordClanWarRound} from './clan-wars.mjs';
export {RACE_RUNTIME_VERSION};
export async function prepareRoomAuthority(room,live){
 if(live.some(p=>!p.userId)||new Set(live.map(p=>p.userId)).size!==live.length)throw Error('DUPLICATE_RACE_ACCOUNT');
 const entrants=[];for(const p of live)entrants.push({id:p.id,carId:p.liveryId,carSave:await freezeRaceLoadout(room.env,p.userId,p.liveryId,{isAdmin:p.owner===true})});
 const config={mode:room.room.settings.drift?'drift':'normal',trackId:room.room.settings.trackId,laps:room.room.settings.drift?1:room.room.settings.laps,collisions:!!room.room.settings.collisions};
 return {runtimeVersion:RACE_RUNTIME_VERSION,config,entrants,seed:crypto.getRandomValues(new Uint32Array(1))[0],identities:Object.fromEntries(live.map(p=>[p.id,{id:p.id,userId:p.userId,name:p.name}])),settledPlayers:{}};
}
export function roomEngine(room){
 const a=room.room?.raceAuthority;if(!a)return null;
 if(a.runtimeVersion!==RACE_RUNTIME_VERSION)throw Error('RACE_CLIENT_UPDATE_REQUIRED');
 if(room.authorityRaceId!==room.room.raceId){room.authorityEngine=new RoomRaceInputs(a.config,a.entrants,a.seed,room.room.raceStartAt,a.state);room.authorityRaceId=room.room.raceId;}
 return room.authorityEngine;
}
export function publicRoomAuthority(room){
 const a=room.room?.raceAuthority;if(!a)return null;
 return {runtimeVersion:a.runtimeVersion,config:a.config,entrants:a.entrants,seed:a.seed,startsAt:room.room.raceStartAt,state:a.state?.world,sequences:a.state?.sequences||{}};
}
export async function saveRoomWorld(room){const e=roomEngine(room);if(e){room.room.raceAuthority.state=e.serialize();await room.save();}}
export async function settleRoomWorld(room){
 const a=room.room.raceAuthority,e=roomEngine(room),world=e.world;
 for(const id of world.finishOrder){
  if(a.settledPlayers[id])continue;const identity=a.identities[id],p=room.room.players.find(p=>p.id===id),result=world.results[id];if(!identity?.userId||!result)throw Error('RACE_IDENTITY_MISSING');
  // Clan orchestration is being introduced without economics/territory settlement.
  // Preserve the server-confirmed finish in the DO, but do not run online rewards,
  // wager settlement, profile progression, or ordinary online leaderboard writes.
  if(room.room.mode==='clan_war'){
   const confirmed={...result,credits:0,exp:0,clanMatchOnly:true};a.settledPlayers[id]=confirmed;
   if(p){p.finishPlace=result.place;p.finishTime=result.timeMs;p.serverLaps=a.config.laps;p.state={...world.summary().cars.find(c=>c.id===id),finished:true,serverTime:Date.now()};}
   room.room.finishOrder=world.finishOrder.filter(playerId=>a.settledPlayers[playerId]);await saveRoomWorld(room);
   room.broadcast({type:'race_finish',v:PROTOCOL_VERSION,raceId:room.room.raceId,playerId:id,finishPlace:result.place,finishTime:result.timeMs,reward:null,room:room.publicRoom(),serverTime:Date.now()});continue;
  }
  if(result.place===1&&room.room.settlement?.status==='locked'){
   const paid=await settleRoomWager(room.env.DB,{raceId:room.room.raceId,winnerUserId:identity.userId});if(!paid.ok)throw Error(paid.code);
   Object.assign(room.room.settlement,{status:'awarded',winnerId:id,awardedAt:Date.now()});
  }
  const driftCredits=a.config.mode==='drift'&&room.room.mode!=='media_race'?world.R.driftReward({bots:a.entrants.length-1,difficulty:'medium',laps:1,trackId:a.config.trackId},result.place,result.score,world.track.length):0;
  const reward=await awardProgression(room.env,identity.userId,{source:'online',eventId:room.room.raceId,exp:PROGRESSION_REWARDS.ONLINE_FINISH.exp,credits:driftCredits,meta:{place:result.place,timeMs:result.timeMs,score:result.score,authority:RACE_RUNTIME_VERSION}});
  if(!reward.ok)throw Error(reward.error||'REWARD_PENDING');
  if(room.room.mode!=='media_race')await awardClanInfluence(room.env,identity.userId,result.place===1,room.room.raceId,Date.now());
  const recorded=await room.env.DB.prepare("SELECT exp,credits FROM progression_rewards WHERE user_id=? AND source='online' AND event_id=?").bind(identity.userId,room.room.raceId).first();
  await recordResult(room.env,room.room.raceId,identity.userId,'online',result.place===1,result.timeMs);
  if(result.place===1&&room.room.mode==='media_race'&&room.room.mediaEvent){
   const media=await settleMediaEvent(room.env,room.room.mediaEvent.id,[identity.userId],{type:'track_race',raceId:room.room.raceId,trackId:a.config.trackId,drift:a.config.mode==='drift',winnerPlayerId:id,finishTime:result.timeMs});
   if(!media.ok)throw Error(media.error||'MEDIA_REWARD_PENDING');room.room.mediaEvent.status='FINISHED';room.room.mediaEvent.result={winnerPlayerId:id,winnerUserId:identity.userId,finishTime:result.timeMs,payouts:media.payouts||[]};
  }
  const confirmed={...result,credits:Number(recorded?.credits)||0,exp:Number(recorded?.exp)||0,balance:reward.balance};
  a.settledPlayers[id]=confirmed;if(p){p.finishPlace=result.place;p.finishTime=result.timeMs;p.serverLaps=a.config.laps;p.state={...world.summary().cars.find(c=>c.id===id),finished:true,serverTime:Date.now()};}
  room.room.finishOrder=world.finishOrder.filter(id=>a.settledPlayers[id]);await saveRoomWorld(room);
  room.broadcast({type:'race_finish',v:PROTOCOL_VERSION,raceId:room.room.raceId,playerId:id,finishPlace:result.place,finishTime:result.timeMs,reward:confirmed,room:room.publicRoom(),serverTime:Date.now()});
 }
  if(room.room.mode==='clan_war'&&!room.room.clanMatch.roundSettled&&Object.keys(a.settledPlayers).length===6){
   const roundNumber=Number(room.room.clanMatch.roundNumber)||1;
   const results=room.room.players.map(p=>{const r=a.settledPlayers[p.id];return{userId:p.userId,crewId:p.crew,place:Number(r?.place),timeMs:Number(r?.timeMs)};});
   const result=await recordClanWarRound(room.env,room.room.clanMatch.battleId,roundNumber,results,Date.now());
   room.room.clanMatch.roundSettled=true;room.room.clanMatch.roundResult=result;room.room.clanMatch.roundNumber=result.nextRound;room.room.clanMatch.complete=result.finished;
   await room.save();room.broadcast({type:'clan_round_result',v:PROTOCOL_VERSION,raceId:room.room.raceId,result,room:room.publicRoom(),serverTime:Date.now()});
  }
}
export async function tickRoomAuthority(room,serverNow,{force=false}={}){
 const e=roomEngine(room);if(!e)return;
 e.advance(serverNow);if(serverNow>=room.room.raceStartAt&&room.room.status==='countdown')room.room.status='racing';
 for(const c of e.world.summary().cars){const p=room.room.players.find(p=>p.id===c.id);if(p){p.state={...c,serverTime:serverNow};p.serverLaps=c.laps;}}
 // Persist the physics proof before crossing into any economic operation.
 await saveRoomWorld(room);await settleRoomWorld(room);
 if(force||serverNow-(room.lastAuthorityBroadcast||0)>=100){room.lastAuthorityBroadcast=serverNow;room.broadcast({type:'race_world',v:PROTOCOL_VERSION,raceId:room.room.raceId,runtimeVersion:RACE_RUNTIME_VERSION,state:e.world.serialize(),serverTime:serverNow,sequences:{...e.sequences}});}
}
export async function handleRoomAuthorityMessage(room,ws,p,m){
 if(!room.room.raceAuthority)return false;
 if(['player_state','race_finish'].includes(m.type)){room.error(ws,'SERVER_RACE_REQUIRED','Результат рассчитывается сервером');return true;}
 if(!['race_inputs','race_sync'].includes(m.type))return false;
 try{
  if(m.raceId!==room.room.raceId||m.runtimeVersion!==RACE_RUNTIME_VERSION)throw Error('RACE_CLIENT_UPDATE_REQUIRED');
  const allowed=m.type==='race_inputs'?['type','v','raceId','runtimeVersion','packet']:['type','v','raceId','runtimeVersion'];if(Object.keys(m).some(k=>!allowed.includes(k)))throw Error('UNTRUSTED_RACE_FIELDS');
  const e=roomEngine(room);if(!Object.hasOwn(e.sequences,p.id)&&!p.spectator)throw Error('NOT_RACE_PARTICIPANT');
  let ack=null;if(m.type==='race_inputs'){if(p.spectator)throw Error('SPECTATOR_ONLY');ack=e.submit(p.id,m.packet,Date.now());}
  await tickRoomAuthority(room,Date.now(),{force:m.type==='race_sync'});
  room.send(ws,{type:'race_input_ack',v:PROTOCOL_VERSION,raceId:room.room.raceId,sequence:e.sequences[p.id]||0,frame:e.world.frame,replay:!!ack?.replay,serverTime:Date.now()});
  if(m.type==='race_sync')room.send(ws,{type:'race_sync',v:PROTOCOL_VERSION,raceId:room.room.raceId,authority:publicRoomAuthority(room),room:room.publicRoom(),serverTime:Date.now()});
  if(m.type==='race_sync'&&room.room.raceAuthority.settledPlayers[p.id]){const r=room.room.raceAuthority.settledPlayers[p.id];room.send(ws,{type:'race_finish',v:PROTOCOL_VERSION,raceId:room.room.raceId,playerId:p.id,finishPlace:r.place,finishTime:r.timeMs,reward:r,room:room.publicRoom(),serverTime:Date.now()});}
 }catch(e){room.error(ws,e.message,'Не удалось подтвердить команды заезда');}
 return true;
}
