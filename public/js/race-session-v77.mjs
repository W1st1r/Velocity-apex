import {createRaceRuntime,RACE_RUNTIME_VERSION} from './race-runtime-v77.mjs';
export {RACE_RUNTIME_VERSION};
export const RACE_HZ=60,MAX_BATCH_FRAMES=120;
const tracks=new Map();
function sharedTrack(R,config){const key=config.trackId;let t=tracks.get(key);if(!t){const catalog=config.mode==='career'?R.CAREER_TRACKS:config.mode==='drift'?R.DRIFT_TRACKS:R.TRACKS;t=new R.Track(catalog[key]);if(tracks.size>=4)tracks.delete(tracks.keys().next().value);tracks.set(key,t);}if(t._speedProfileCache.size>128)t._speedProfileCache.clear();return t;}
const scalars=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null&&['string','number','boolean'].includes(typeof v)));
export function validateRaceConfig(raw,save){
  const R=createRaceRuntime(1),mode=raw?.mode;
  if(!['normal','career','drift'].includes(mode))throw Error('INVALID_RACE_MODE');
  const carId=raw.carId;
  if(typeof carId!=='string'||!R.LIVERIES[carId]||!save?.ownedLiveries?.includes(carId))throw Error('CAR_NOT_OWNED');
  if(mode==='career'){
    const level=raw.level;
    if(!Number.isInteger(level)||level<1||level>R.CAREER_LEVELS.length||level>Math.max(1,Number(save.careerUnlocked)||1))throw Error('CAREER_LOCKED');
    return {mode,carId,level,trackId:R.getCareerLevel(level).trackId,bots:0,laps:1,difficulty:'extreme'};
  }
  if(!Object.hasOwn(R.DIFFICULTY_LABELS,raw.difficulty))throw Error('INVALID_DIFFICULTY');
  const catalog=mode==='drift'?R.DRIFT_TRACKS:R.TRACKS;
  if(typeof raw.trackId!=='string'||!Object.hasOwn(catalog,raw.trackId))throw Error('INVALID_TRACK');
  if(!Number.isInteger(raw.bots)||raw.bots<1||raw.bots>13)throw Error('INVALID_BOT_COUNT');
  if(mode==='normal'&&![3,5,7,10,15].includes(raw.laps))throw Error('INVALID_LAPS');
  return {mode,carId,trackId:raw.trackId,bots:raw.bots,laps:mode==='drift'?1:raw.laps,difficulty:raw.difficulty};
}
export function validateInputs(inputs){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>MAX_BATCH_FRAMES)throw Error('INVALID_INPUT_BATCH');
  for(const frame of inputs)if(!Array.isArray(frame)||frame.length!==4||frame.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||v<(i===0?-1:0)||v>1))throw Error('INVALID_CONTROLS');
}
export class RaceSession {
  constructor(config,carSave,seed,state=null){
    this.config=config;this.carSave=carSave;this.seed=seed;this.R=createRaceRuntime(seed);const R=this.R;R.ownerCars=carSave.ownerCars||{};R.ownerTuning=carSave.ownerTuning||{};
    const catalog=config.mode==='career'?R.CAREER_TRACKS:config.mode==='drift'?R.DRIFT_TRACKS:R.TRACKS;
    this.track=sharedTrack(R,config);this.frame=0;this.score=0;this.scoreCarry=0;this.chainDistance=0;this.chainTime=0;this.idleTime=0;this.combo=1;this.peakCombo=1;this.finishOrder=[];this.result=null;this.lapStartFrame=0;this.bestLapMs=0;this.lastRank=config.bots+1;
    this.cars=[];
    for(let i=0;i<=config.bots;i++){
      const player=i===config.bots,c=new R.Car({id:i,player,name:player?'YOU':'BOT '+(i+1),...R.RACE_PHYSICS});
      c.place(this.track,-(65+Math.floor(i/2)*140+(player?76:0))/this.track.length,i%2===0?-34:34);
      c.raceFinished=false;c.finishPlace=0;c.finishTime=0;c.setLoadout(player?config.carId:'apexLime','standard');R.applyCarPerformance(c,config.carId,carSave);
      if(player)this.player=c;
      else {
        c.ai=new R.AIController(c,i,config.difficulty);c.ai.driftMode=config.mode==='drift';const s=R.botSkillProfile(i,config.bots,config.difficulty);
        c.maxSpeed=Math.round(c.maxSpeed*s.topSpeed);c.accel=Math.round(c.accel*s.acceleration);c.brakePower=Math.round(c.brakePower*s.braking);c.turnRate*=s.steering;c.gripFactor=s.grip;
        c.ai.pace=R.clamp(c.ai.pace*s.pace,.54,1);c.ai.gripUsage=R.clamp(c.ai.gripUsage*s.cornering,.54,1.04);c.ai.brakeConfidence=R.clamp(c.ai.brakeConfidence*s.brakeConfidence,.50,1.02);c.ai.trafficSkill=R.clamp(c.ai.trafficSkill*s.racecraft,.48,1.04);c.ai.followGap*=s.followGap;
      }
      this.cars.push(c);
    }
    this.lastProgress=this.player.progress;
    if(state)this.restore(state);
  }
  restore(s){
    for(const k of ['frame','score','scoreCarry','chainDistance','chainTime','idleTime','combo','peakCombo','lastProgress','lapStartFrame','bestLapMs','lastRank'])this[k]=s[k];
    this.finishOrder=s.finishOrder.slice();this.result=s.result;
    for(let i=0;i<this.cars.length;i++){Object.assign(this.cars[i],s.cars[i].car);if(this.cars[i].ai){Object.assign(this.cars[i].ai,s.cars[i].ai);this.cars[i].ai.output={...s.cars[i].output};}}
    this.R.setRandomState(s.rng);
  }
  serialize(){return {frame:this.frame,score:this.score,scoreCarry:this.scoreCarry,chainDistance:this.chainDistance,chainTime:this.chainTime,idleTime:this.idleTime,combo:this.combo,peakCombo:this.peakCombo,lastProgress:this.lastProgress,lapStartFrame:this.lapStartFrame,bestLapMs:this.bestLapMs,lastRank:this.lastRank,finishOrder:this.finishOrder.slice(),result:this.result,rng:this.R.getRandomState(),cars:this.cars.map(c=>({car:scalars(c),ai:c.ai?scalars(c.ai):null,output:c.ai?{...c.ai.output}:null}))};}
  collide(){
    let impact=0;
    for(let it=0;it<4;it++){
      let contacts=0;
      for(let i=0;i<this.cars.length;i++)for(let j=i+1;j<this.cars.length;j++){
        const a=this.cars[i],b=this.cars[j],dx=b.x-a.x,dy=b.y-a.y,broad=a.collisionRadius+b.collisionRadius+Math.hypot(a.collisionOffsetX||0,a.collisionOffsetY||0)+Math.hypot(b.collisionOffsetX||0,b.collisionOffsetY||0);
        if(dx*dx+dy*dy>broad*broad)continue;
        const h=this.R.intersectCarOBBs(a,b);if(!h)continue;contacts++;
        const correction=(h.depth+.025)*.5,nx=h.nx,ny=h.ny;a.x-=nx*correction;a.y-=ny*correction;b.x+=nx*correction;b.y+=ny*correction;
        const rvn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(rvn<0){const impulse=-1.035*rvn*.5;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;const tangent=(b.vx-a.vx)*(-ny)+(b.vy-a.vy)*nx,f=this.R.clamp(-tangent*.5,-impulse*.12,impulse*.12);a.vx-=(-ny)*f;a.vy-=nx*f;b.vx+=(-ny)*f;b.vy+=nx*f;a.speed=Math.hypot(a.vx,a.vy);b.speed=Math.hypot(b.vx,b.vy);a.markImpact?.(Math.min(1,.28-rvn/150));b.markImpact?.(Math.min(1,.28-rvn/150));if(a.player||b.player)impact=Math.max(impact,-rvn);}
        a.collisionThisLap=b.collisionThisLap=true;
      }
      if(!contacts)break;
    }
    return impact;
  }
  driftScore(collision){
    const p=this.player,t=this.track,dt=1/RACE_HZ;let delta=p.progress-this.lastProgress;if(delta<-.5)delta++;else if(delta>.5)delta--;this.lastProgress=p.progress;
    const sample=t.samples[p.trackIndex],forward=p.vx*sample.tx+p.vy*sample.ty,slip=Math.abs(this.R.angleWrap(Math.atan2(p.vy,p.vx)-p.angle))*180/Math.PI;
    const meters=Math.min(delta>0&&delta<.035?delta*t.length:0,Math.max(0,p.speed*dt*1.38));
    if(!collision&&p.onRoad&&p.speed>78&&forward>42&&slip>=9&&slip<=58&&meters>.025){
      this.idleTime=0;this.chainDistance+=meters;this.chainTime+=dt;const d=this.chainDistance;this.combo=d>760?5:d>520?4:d>330?3:d>190?2.5:d>95?2:d>40?1.5:1;this.peakCombo=Math.max(this.peakCombo,this.combo);
      this.scoreCarry+=meters*(.64+1.58*this.R.clamp(1-Math.abs(slip-32)/29,.30,1))*this.R.clamp(p.speed/235,.45,1.62)*this.combo*(1+Math.min(.48,this.chainTime*.032));const n=Math.floor(this.scoreCarry);this.score+=n;this.scoreCarry-=n;
    }else{this.idleTime+=dt;if(collision||p.speed<24||forward<5||this.idleTime>.82){this.combo=1;this.chainDistance=0;this.chainTime=0;}}
  }
  step(input){
    if(this.result)return false;
    const ctl={steer:input[0],throttle:input[1],brake:input[2],handbrake:this.config.mode==='drift'?input[3]:0,drift:this.config.mode==='drift'};
    for(const c of this.cars)if(!c.player)c._control=c.ai.think(1/RACE_HZ,this.track,this.cars);
    let collision=false;this.frame++;
    for(let q=0;q<2;q++){
      for(const c of this.cars){const r=c.update(1/120,c.player?ctl:c._control,this.track);if(c.player&&r.impact>.05)collision=true;}
      if(this.collide()>3)collision=true;
      if(this.player.finishedLap){const lapMs=Math.round((this.frame-this.lapStartFrame)/RACE_HZ*1000);this.lapStartFrame=this.frame;this.bestLapMs=this.bestLapMs?Math.min(this.bestLapMs,lapMs):lapMs;if(this.config.mode==='normal')this.score+=750+Math.max(0,this.cars.length+1-this.player.rank)*45+(!this.player.collisionThisLap&&!this.player.offroadThisLap?350:0);this.player.collisionThisLap=false;this.player.offroadThisLap=false;}
      const finish=this.cars.filter(c=>c.finishedLap&&!c.raceFinished&&c.laps>=this.config.laps).sort((a,b)=>b.progress-a.progress);
      for(const c of finish){c.raceFinished=true;c.finishPlace=this.finishOrder.length+1;c.finishTime=this.frame/RACE_HZ;this.finishOrder.push(c.id);}
    }
    const ranked=this.cars.slice().sort((a,b)=>a.raceFinished&&b.raceFinished?a.finishPlace-b.finishPlace:a.raceFinished?-1:b.raceFinished?1:b.raceMetric()-a.raceMetric());ranked.forEach((c,i)=>c.rank=i+1);
    if(this.config.mode==='drift')this.driftScore(collision);
    else if(this.config.mode==='normal'){this.scoreCarry+=this.player.speed/RACE_HZ*(.055+(this.cars.length+1-this.player.rank)*.0018);const n=Math.floor(this.scoreCarry);this.score+=n;this.scoreCarry-=n;if(this.player.rank<this.lastRank)this.score+=100*(this.lastRank-this.player.rank);}this.lastRank=this.player.rank;
    const timeout=this.config.mode==='career'&&this.frame/RACE_HZ>this.R.getCareerLevel(this.config.level).bronze;
    if(this.player.raceFinished||timeout){
      const seconds=this.frame/RACE_HZ;this.result={completed:this.player.raceFinished,timeMs:Math.round(seconds*1000),place:this.player.finishPlace||ranked.length,score:this.score,bestLapMs:this.bestLapMs,peakCombo:this.peakCombo,tier:this.config.mode==='career'&&this.player.raceFinished?this.R.careerTimeTier(this.config.level,seconds):null};
    }
    return true;
  }
  advance(inputs){validateInputs(inputs);for(const input of inputs){if(!this.step(input))break;}return this.summary();}
  summary(){return {frame:this.frame,timeMs:Math.round(this.frame/RACE_HZ*1000),player:{x:this.player.x,y:this.player.y,speed:this.player.speed,laps:this.player.laps,checkpoint:this.player.checkpoint,place:this.player.rank},result:this.result};}
}
export function settleRace(save,config,result){
  const R=createRaceRuntime(1);if(!result)throw Error('RACE_NOT_FINISHED');let credits=0;
  if(config.mode==='career'){
    const level=R.getCareerLevel(config.level),before=Number(save.careerBestTimes?.[config.trackId])||0,completed=(save.careerCompleted||[]).includes(config.trackId),record=!before||result.timeMs<before;
    if(result.completed){save.careerBestTimes={...save.careerBestTimes,[config.trackId]:record?result.timeMs:before};}
    if(result.tier){credits=Math.round(level.rewards[result.tier]*(!completed||record?1:.5));save.careerCompleted=[...new Set([...(save.careerCompleted||[]),config.trackId])];save.careerUnlocked=Math.max(Number(save.careerUnlocked)||1,Math.min(R.CAREER_LEVELS.length,config.level+1));}
  }else if(result.completed)credits=config.mode==='drift'?R.driftReward(config,result.place,result.score,R.DRIFT_TRACKS[config.trackId].targetLength||10000):R.raceReward(config,result.place);
  credits=Math.max(0,Math.floor(credits));const exp=0; // The authoritative handler selects EXP from the server reward catalog.
  save.credits=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(Number(save.credits)||0))+credits);
  if(result.completed){if(config.mode==='drift')save.bestDriftScore=Math.max(Number(save.bestDriftScore)||0,result.score);else if(config.mode==='normal'){save.maxLaps=Math.max(Number(save.maxLaps)||0,config.laps);save.bestScore=Math.max(Number(save.bestScore)||0,result.score);if(result.bestLapMs&&(!save.bestLap||result.bestLapMs<save.bestLap))save.bestLap=result.bestLapMs;}}
  return {credits,exp,...result};
}
