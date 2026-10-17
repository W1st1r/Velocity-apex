import {RaceRoomSession} from './race-room-session-v77.mjs';
import {RACE_RUNTIME_VERSION} from './race-session-v77.mjs';
export {RACE_RUNTIME_VERSION};
export class RoomRaceClient {
 constructor({raceId,playerId,authority,network}){
  if(authority?.runtimeVersion!==RACE_RUNTIME_VERSION)throw Error('RACE_CLIENT_UPDATE_REQUIRED');
  this.raceId=raceId;this.playerId=playerId;this.network=network;this.data=authority;this.inputs=new Map();this.unsent=new Map();this.packet=null;this.sequence=authority.sequences[playerId]||0;this.serverFrame=authority.state.frame;this.lastSend=-Infinity;this.error=null;this.disposed=false;
  this.engine=new RaceRoomSession(authority.config,authority.entrants,authority.seed,authority.state);
  this.listener=e=>this.receive(e.detail);network.addEventListener('message',this.listener);
 }
 acceptSequence(sequence){
  if(!Number.isSafeInteger(sequence)||sequence<this.sequence)return;
  if(this.packet&&sequence>this.packet.sequence){for(let i=0;i<this.packet.inputs.length;i++)this.unsent.delete(this.packet.fromFrame+i);this.packet=null;}
  this.sequence=sequence;
 }
 receive(m){
  if(this.disposed||!m)return;
  if(m.type==='error'&&['INPUT_SEQUENCE_OLD','INPUT_SEQUENCE_GAP','INPUT_SEQUENCE_REUSED','RACE_CLOCK_AHEAD'].includes(m.code)){this.sync();return;}
  const room=m.room,authority=m.authority||room?.authority;
  if(['hello','race_sync'].includes(m.type)&&room?.raceId===this.raceId&&authority){
   const expected=authority.sequences[this.playerId]||0;this.sequence=expected;this.packet=null;this.data=authority;this.reconcile(authority.state);this.unsent=new Map(this.inputs);this.lastSend=-Infinity;return;
  }
  if(m.raceId!==this.raceId)return;
  if(m.type==='race_input_ack')this.acceptSequence(m.sequence);
  if(m.type==='race_world'){
   if(m.runtimeVersion!==RACE_RUNTIME_VERSION){this.error='RACE_CLIENT_UPDATE_REQUIRED';return;}
   this.acceptSequence(m.sequences?.[this.playerId]);this.reconcile(m.state);
  }
 }
 reconcile(state){
  if(!state||state.frame<this.serverFrame)return;const target=Math.min(this.engine.frame,state.frame+180);this.serverFrame=state.frame;
  for(const frame of this.inputs.keys())if(frame<=state.frame)this.inputs.delete(frame);
  for(const frame of this.unsent.keys())if(frame<=state.frame)this.unsent.delete(frame);
  this.engine=new RaceRoomSession(this.data.config,this.data.entrants,this.data.seed,state);
  const held=state.lastInputs||{};while(this.engine.frame<target){const frame=this.engine.frame+1;this.engine.step({...held,[this.playerId]:this.inputs.get(frame)||[0,0,.2,0]});}
 }
 advance(control,serverNow){
  if(this.disposed)return false;const participant=this.data.entrants.some(e=>e.id===this.playerId),target=Math.max(0,Math.floor((serverNow-this.data.startsAt)/1000*60)+1),limit=Math.min(target,this.engine.frame+8,this.serverFrame+180);
  while(this.engine.frame<limit&&this.engine.finishOrder.length<this.engine.cars.length){
   const frame=this.engine.frame+1,inputs={...this.engine.lastInputs};
   if(participant){const value=control.slice();this.inputs.set(frame,value);this.unsent.set(frame,value);inputs[this.playerId]=value;}
   this.engine.step(inputs);
  }
  if(participant)this.flush(serverNow);return this.engine.frame>=target;
 }
 flush(serverNow){
  if(this.disposed)return;
  if(!this.packet){if(!this.unsent.size||this.unsent.size<6&&serverNow-this.lastSend<100)return;const frames=[...this.unsent.keys()].sort((a,b)=>a-b),fromFrame=frames[0],inputs=[];for(let f=fromFrame;inputs.length<12&&this.unsent.has(f);f++)inputs.push(this.unsent.get(f));this.packet={sequence:this.sequence,fromFrame,inputs};}
  if(serverNow-this.lastSend<400&&this.sentSequence===this.packet.sequence)return;
  if(this.network.send({type:'race_inputs',v:1,raceId:this.raceId,runtimeVersion:RACE_RUNTIME_VERSION,packet:this.packet})){this.lastSend=serverNow;this.sentSequence=this.packet.sequence;}
 }
 sync(){this.network.send({type:'race_sync',v:1,raceId:this.raceId,runtimeVersion:RACE_RUNTIME_VERSION});}
 dispose(){this.disposed=true;this.network.removeEventListener('message',this.listener);}
}
