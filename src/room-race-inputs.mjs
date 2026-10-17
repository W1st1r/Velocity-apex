import {RaceRoomSession} from '../public/js/race-room-session-v77.mjs';
import {RACE_HZ,validateInputs} from '../public/js/race-session-v77.mjs';
export const ROOM_INPUT_DELAY_MS=200;
// No coordinates, claimed checkpoints, lap counts, scores or reward fields are
// accepted. Server wall time and the shared physics determine world progression.
export class RoomRaceInputs {
 constructor(config,entrants,seed,startsAt,state=null){
  if(!Number.isSafeInteger(startsAt))throw Error('INVALID_START_TIME');
  this.startsAt=startsAt;this.world=new RaceRoomSession(config,entrants,seed,state?.world);this.sequences={};this.pending={};this.receipts={};
  for(const e of entrants){this.sequences[e.id]=state?.sequences?.[e.id]||0;this.pending[e.id]=new Map(state?.pending?.[e.id]||[]);this.receipts[e.id]=state?.receipts?.[e.id]||[];}
 }
 serialize(){return {world:this.world.serialize(),sequences:{...this.sequences},pending:Object.fromEntries(Object.entries(this.pending).map(([id,q])=>[id,[...q]])),receipts:structuredClone(this.receipts)};}
 submit(playerId,packet,serverNow){
  if(!Object.hasOwn(this.sequences,playerId))throw Error('NOT_RACE_PARTICIPANT');
  if(!packet||typeof packet!=='object'||Array.isArray(packet)||Object.keys(packet).some(k=>!['sequence','fromFrame','inputs'].includes(k)))throw Error('UNTRUSTED_RACE_FIELDS');
  const {sequence,fromFrame,inputs}=packet;validateInputs(inputs);
  if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isSafeInteger(fromFrame)||fromFrame<1||!Number.isFinite(serverNow))throw Error('INVALID_INPUT_SEQUENCE');
  const fingerprint=JSON.stringify([fromFrame,inputs]),expected=this.sequences[playerId];
  if(sequence<expected){const old=this.receipts[playerId].find(r=>r.sequence===sequence);if(!old)throw Error('INPUT_SEQUENCE_OLD');if(old.fingerprint!==fingerprint)throw Error('INPUT_SEQUENCE_REUSED');return this.ack(playerId,true);}
  if(sequence!==expected)throw Error('INPUT_SEQUENCE_GAP');
  const end=fromFrame+inputs.length-1,wall=Math.max(0,Math.floor((serverNow-this.startsAt)/1000*RACE_HZ));
  if(end>wall+12||end>this.world.frame+180)throw Error('RACE_CLOCK_AHEAD');
  const queue=this.pending[playerId];
  for(let i=0;i<inputs.length;i++){const frame=fromFrame+i,prior=queue.get(frame);if(prior&&JSON.stringify(prior)!==JSON.stringify(inputs[i]))throw Error('INPUT_FRAME_REUSED');}
  for(let i=0;i<inputs.length;i++)if(fromFrame+i>this.world.frame)queue.set(fromFrame+i,inputs[i].slice());
  this.sequences[playerId]++;this.receipts[playerId].push({sequence,fingerprint});if(this.receipts[playerId].length>2)this.receipts[playerId].shift();
  this.advance(serverNow);return this.ack(playerId,false);
 }
 advance(serverNow){
  if(!Number.isFinite(serverNow))throw Error('INVALID_SERVER_TIME');
  const target=Math.max(0,Math.floor((serverNow-this.startsAt-ROOM_INPUT_DELAY_MS)/1000*RACE_HZ)),limit=Math.min(target,this.world.frame+120);
  while(this.world.frame<limit&&this.world.finishOrder.length<this.world.cars.length){const frame=this.world.frame+1,inputs={};for(const [id,q] of Object.entries(this.pending)){if(q.has(frame))inputs[id]=q.get(frame);q.delete(frame);}this.world.step(inputs);}
  return this.world.summary();
 }
 ack(playerId,replay){return{sequence:this.sequences[playerId],replay,...this.world.summary()};}
}
