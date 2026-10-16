// Shared human-vs-human physics. Entrants/carSave must come from authenticated
// server saves, never from a client result or a client performance snapshot.
import {RaceSession,RACE_HZ,validateInputs} from './race-session-v77.mjs';
const scalar=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null&&['number','boolean','string'].includes(typeof v)));
const emptyScore=()=>({score:0,scoreCarry:0,chainDistance:0,chainTime:0,idleTime:0,combo:1,peakCombo:1,lastProgress:0,lapStartFrame:0,bestLapMs:0});
export class RaceRoomSession {
 constructor(config,entrants,seed,state=null){
  if(!['normal','drift'].includes(config?.mode)||!Number.isInteger(config.laps)||config.laps<1||config.laps>15||typeof config.collisions!=='boolean'||!Array.isArray(entrants)||entrants.length<2||entrants.length>8||new Set(entrants.map(e=>e.id)).size!==entrants.length)throw Error('INVALID_ROOM_RACE');
  this.config={...config};this.entrants=entrants;this.seed=seed;
  const first=entrants[0],base=new RaceSession({...config,bots:0,difficulty:'extreme',carId:first.carId},first.carSave,seed);
  if(base.track.id!==config.trackId)throw Error('INVALID_TRACK');
  this.base=base;this.R=base.R;this.track=base.track;this.frame=0;this.finishOrder=[];this.scores={};this.results={};this.lastInputs={};
  this.cars=entrants.map((e,i)=>{
   if(typeof e.id!=='string'||!/^[A-Za-z0-9-]{1,40}$/.test(e.id)||!this.R.LIVERIES[e.carId]||!e.carSave?.ownedLiveries?.includes(e.carId))throw Error('CAR_NOT_OWNED');
   const c=new this.R.Car({id:e.id,name:e.id,player:true,...this.R.RACE_PHYSICS});
   c.setLoadout(e.carId,'standard');this.R.ownerCars=e.carSave.ownerCars||{};this.R.ownerTuning=e.carSave.ownerTuning||{};this.R.applyCarPerformance(c,e.carId,e.carSave);
   c.place(this.track,-(65+Math.floor(i/2)*140)/this.track.length,i%2===0?-34:34);c.raceFinished=false;c.finishPlace=0;c.finishTime=0;
   this.scores[e.id]={...emptyScore(),lastProgress:c.progress};return c;
  });
  base.cars=this.cars;if(state)this.restore(state);
 }
 restore(s){
  if(!Number.isSafeInteger(s?.frame)||s.frame<0||s.cars?.length!==this.cars.length)throw Error('INVALID_ROOM_STATE');
  this.frame=s.frame;this.lastInputs=structuredClone(s.lastInputs||{});this.finishOrder=s.finishOrder.slice();this.results=structuredClone(s.results);this.scores=structuredClone(s.scores);this.R.setRandomState(s.rng);
  for(let i=0;i<this.cars.length;i++){if(s.cars[i].id!==this.cars[i].id)throw Error('INVALID_ROOM_STATE');Object.assign(this.cars[i],s.cars[i]);}
 }
 serialize(){return {frame:this.frame,lastInputs:structuredClone(this.lastInputs),finishOrder:this.finishOrder.slice(),results:structuredClone(this.results),scores:structuredClone(this.scores),rng:this.R.getRandomState(),cars:this.cars.map(scalar)};}
 step(inputs){
  if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.keys(inputs).some(id=>!Object.hasOwn(this.scores,id)))throw Error('INVALID_ROOM_INPUT');
  // Validate every supplied control before mutating any car or advancing time.
  for(const frame of Object.values(inputs))validateInputs([frame]);
  const controls=new Map(this.cars.map(c=>{const v=inputs[c.id]||[0,0,.2,0];return[c.id,{steer:v[0],throttle:c.raceFinished?0:v[1],brake:c.raceFinished?1:v[2],handbrake:this.config.mode==='drift'?v[3]:0,drift:this.config.mode==='drift'}];}));
  this.lastInputs=Object.fromEntries([...controls].map(([id,c])=>[id,[c.steer,c.throttle,c.brake,c.handbrake]]));
  const collisions=new Set();this.frame++;
  for(let sub=0;sub<2;sub++){
   for(const c of this.cars){const hit=c.update(1/120,controls.get(c.id),this.track);if(hit.impact>.05)collisions.add(c.id);}
   if(this.config.collisions){const before=this.cars.map(c=>[c.vx,c.vy]);this.base.collide();this.cars.forEach((c,i)=>{if(Math.hypot(c.vx-before[i][0],c.vy-before[i][1])>1.5)collisions.add(c.id);});}
   for(const c of this.cars)if(c.finishedLap&&!c.raceFinished){const score=this.scores[c.id],lapMs=Math.round((this.frame-score.lapStartFrame)/RACE_HZ*1000);score.lapStartFrame=this.frame;score.bestLapMs=score.bestLapMs?Math.min(score.bestLapMs,lapMs):lapMs;}
   const finished=this.cars.filter(c=>c.finishedLap&&!c.raceFinished&&c.laps>=this.config.laps).sort((a,b)=>b.progress-a.progress||a.id.localeCompare(b.id));
   for(const c of finished){c.raceFinished=true;c.finishPlace=this.finishOrder.length+1;c.finishTime=this.frame/RACE_HZ;this.finishOrder.push(c.id);}
  }
  const ranked=this.cars.slice().sort((a,b)=>a.raceFinished&&b.raceFinished?a.finishPlace-b.finishPlace:a.raceFinished?-1:b.raceFinished?1:b.raceMetric()-a.raceMetric());ranked.forEach((c,i)=>c.rank=i+1);
  for(const c of this.cars){
   if(this.results[c.id])continue;const score=this.scores[c.id];
   if(this.config.mode==='drift'){const context={...score,player:c,track:this.track,R:this.R};RaceSession.prototype.driftScore.call(context,collisions.has(c.id));for(const k of Object.keys(score))if(k in context)score[k]=context[k];}
   if(c.raceFinished)this.results[c.id]={completed:true,place:c.finishPlace,timeMs:Math.round(c.finishTime*1000),score:Math.floor(score.score),bestLapMs:score.bestLapMs,peakCombo:score.peakCombo};
  }
  return this.summary();
 }
 summary(){return{frame:this.frame,finishOrder:this.finishOrder.slice(),results:structuredClone(this.results),cars:this.cars.map(c=>({id:c.id,x:c.x,y:c.y,vx:c.vx,vy:c.vy,angle:c.angle,speed:c.speed,yawRate:c.yawRate,progress:c.progress,laps:c.laps,checkpoint:c.checkpoint,place:c.rank,finished:!!c.raceFinished,driftScore:this.scores[c.id].score}))};}
}
