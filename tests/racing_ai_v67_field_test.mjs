/* V67 actual 13-driver field test (individual tuning + same physics + traffic). */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window=globalThis;window.Racing={};
let seed=0x681301;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const f of ['content.js','racing-line.js','track.js','car.js','ai.js'])vm.runInThisContext(fs.readFileSync(path.join(root,'public/js',f),'utf8'),{filename:f});
const R=Racing,DT=1/60,PHYS_DT=DT/2;
function run(cfg,count=13,difficulty='extreme'){
  const t=new R.Track(cfg),cars=[];
  for(let i=0;i<count;i++){
    const skill=R.botSkillProfile(i,count,difficulty),c=new R.Car({id:i+1,...R.RACE_PHYSICS});
    c.maxSpeed=Math.round(c.maxSpeed*skill.topSpeed);c.accel=Math.round(c.accel*skill.acceleration);
    c.brakePower=Math.round(c.brakePower*skill.braking);c.turnRate*=skill.steering;c.gripFactor=skill.grip;
    c.place(t,-(65+Math.floor(i/2)*140)/t.length,i%2?-34:34);
    c.ai=new R.AIController(c,i,difficulty);
    c.ai.pace=R.clamp(c.ai.pace*skill.pace,.54,1);
    c.ai.gripUsage=R.clamp(c.ai.gripUsage*skill.cornering,.54,1.04);
    c.ai.brakeConfidence=R.clamp(c.ai.brakeConfidence*skill.brakeConfidence,.5,1.02);
    c.ai.trafficSkill=R.clamp(c.ai.trafficSkill*skill.racecraft,.48,1.04);
    c.ai.followGap*=skill.followGap;c.raceFinished=false;
    cars.push(c);
  }
  let time=0,barrierHits=0,offroad=0,shoulder=0,passes=0;const firstTimes=[],previous=new Map();
  while(time<110&&cars.some(c=>!c.raceFinished)){
    for(const c of cars)if(!c.raceFinished)c.ctl=c.ai.think(DT,t,cars);
    for(let sub=0;sub<2;sub++){
      for(const c of cars){if(c.raceFinished)continue;const result=c.update(PHYS_DT,c.ctl,t);
        if(result.impact>.04)barrierHits++;if(c.surface==='offroad')offroad+=PHYS_DT;if(c.surface==='shoulder')shoulder+=PHYS_DT;
        if(c.laps>=1){c.raceFinished=true;firstTimes.push([c.id,time+(sub+1)*PHYS_DT]);}
      }
      // Same SAT-based collision separation as the offline race renderer.
      for(let iter=0;iter<3;iter++){
        let hits=0;
        for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
          const a=cars[i],b=cars[j],dx=b.x-a.x,dy=b.y-a.y;
          if(dx*dx+dy*dy>(a.collisionRadius+b.collisionRadius+5)**2)continue;
          const h=R.intersectCarOBBs(a,b);if(!h)continue;hits++;
          const delta=(h.depth+.025)*.5;a.x-=h.nx*delta;a.y-=h.ny*delta;b.x+=h.nx*delta;b.y+=h.ny*delta;
          const closing=-((b.vx-a.vx)*h.nx+(b.vy-a.vy)*h.ny);
          if(closing>0){const impulse=closing*.52;a.vx-=h.nx*impulse;a.vy-=h.ny*impulse;b.vx+=h.nx*impulse;b.vy+=h.ny*impulse;}
        }
        if(!hits)break;
      }
    }
    for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
      const a=cars[i],b=cars[j];if(a.raceFinished||b.raceFinished)continue;
      const delta=(a.raceMetric()-b.raceMetric())*t.length;if(Math.abs(delta)<35)continue;
      const key=`${i}:${j}`,s=Math.sign(delta),prev=previous.get(key);
      if(prev&&prev!==s)passes++;previous.set(key,s);
    }
    time+=DT;
  }
  return {track:cfg.id,drivers:count,completed:firstTimes.length,passes,barrierHits,offroad:+offroad.toFixed(2),shoulder:+shoulder.toFixed(2),finishSpread:+(firstTimes.length?Math.max(...firstTimes.map(x=>x[1]))-Math.min(...firstTimes.map(x=>x[1])):0).toFixed(2),finishingOrder:firstTimes.map(x=>x[0])};
}
const runs=[run(R.TRACKS.neonHarbor,13),run(R.TRACKS.desertCanyon,13),run(R.TRACKS.alpineRing,13)];
for(const run of runs){assert.equal(run.completed,run.drivers,`All drivers finish ${run.track}`);assert.equal(run.barrierHits,0,`Barrier on ${run.track}`);assert(run.offroad<2,`Offroad on ${run.track}`);assert(run.finishSpread>1,`Cars must have distinct lap times on ${run.track}`);}
assert(runs.reduce((a,b)=>a+b.passes,0)>=5,'Bots must overtake each other');
console.log(JSON.stringify({version:'V67',runs,passed:true},null,2));
