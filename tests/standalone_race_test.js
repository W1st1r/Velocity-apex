/* Velocity Apex deterministic AI / traffic validation. Run: node tests/standalone_race_test.js */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
let rngState=1;function setSeed(v){rngState=v>>>0||1;}Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};
for(const file of ['public/js/content.js','public/js/racing-line.js','public/js/track.js','public/js/car.js','public/js/ai.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file});
const R=global.Racing,clamp=R.clamp,FRAME=1/60,SUB=1/120;
const hash=s=>{let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h;};
const slipDeg=c=>c.speed<3?0:Math.abs(R.angleWrap(Math.atan2(c.vy,c.vx)-c.angle))*180/Math.PI;
const laneOf=(c,t)=>{const p=t.samples[c.trackIndex];return (c.x-p.x)*p.nx+(c.y-p.y)*p.ny;};
function makeCar(id){return new R.Car({id,...R.RACE_PHYSICS});}

function apexLookup(track){
  const lookup=new Int16Array(track.samples.length);lookup.fill(-1);
  track.apexes.forEach((a,id)=>{for(let q=-2;q<=2;q++)lookup[(a.index+q+track.samples.length)%track.samples.length]=id;});
  return lookup;
}

function single(trackCfg,difficulty,laps=3){
  setSeed(hash(trackCfg.id+':'+difficulty));const track=new R.Track(trackCfg),car=makeCar(1);car.place(track,0,0);car.ai=new R.AIController(car,1,difficulty);
  const line=track.getRacingLine(difficulty),lookup=apexLookup(track);let apexMin=Array(track.apexes.length).fill(Infinity),apexErrors=[];
  let time=0,lapStart=0,barrierImpacts=0,maxSlip=0,maxLane=0,steerVariation=0,lastSteer=0,steerSignChanges=0,majorCorrections=0,lastMajor=-9;
  let shoulderEpisode=0,controlledCuts=0,lastShoulder=false;const lapTimes=[];
  while(car.laps<laps&&time<240){
    const ctl=car.ai.think(FRAME,track,[car]);steerVariation+=Math.abs(ctl.steer-lastSteer);
    if(Math.abs(ctl.steer)>.22&&Math.abs(lastSteer)>.22&&Math.sign(ctl.steer)!==Math.sign(lastSteer))steerSignChanges++;
    if(time-lastMajor>.12&&Math.abs(ctl.steer-lastSteer)>.82&&Math.max(Math.abs(ctl.steer),Math.abs(lastSteer))>.55){majorCorrections++;lastMajor=time;}
    lastSteer=ctl.steer;
    for(let q=0;q<2;q++){
      const r=car.update(SUB,ctl,track);time+=SUB;if(r.impact>.04)barrierImpacts++;
      maxSlip=Math.max(maxSlip,slipDeg(car));const lane=laneOf(car,track);maxLane=Math.max(maxLane,Math.abs(lane));
      const ai=lookup[car.trackIndex];if(ai>=0)apexMin[ai]=Math.min(apexMin[ai],Math.abs(lane-line[track.apexes[ai].index]));
      if(car.surface==='shoulder'){shoulderEpisode+=SUB;lastShoulder=true;}else if(lastShoulder){if(shoulderEpisode>=.05)controlledCuts++;shoulderEpisode=0;lastShoulder=false;}
      if(car.finishedLap){lapTimes.push(time-lapStart);lapStart=time;for(const e of apexMin)if(Number.isFinite(e))apexErrors.push(e);apexMin=Array(track.apexes.length).fill(Infinity);}
    }
  }
  if(lastShoulder&&shoulderEpisode>=.05)controlledCuts++;
  const avgApex=apexErrors.length?apexErrors.reduce((a,b)=>a+b,0)/apexErrors.length:0,minApex=apexErrors.length?Math.min(...apexErrors):0;
  const avgLap=lapTimes.length?lapTimes.reduce((a,b)=>a+b,0)/lapTimes.length:time/Math.max(1,car.laps),bestLap=lapTimes.length?Math.min(...lapTimes):avgLap;
  return {track:track.id,difficulty,laps:car.laps,completionRate:+(car.laps/laps).toFixed(3),totalSec:+time.toFixed(2),avgLapSec:+avgLap.toFixed(2),bestLapSec:+bestLap.toFixed(2),barrierImpacts,trueOffroadSec:+car.trueOffroadTime.toFixed(2),curbShoulderSec:+car.controlledShoulderTime.toFixed(2),controlledCuts,maxLane:+maxLane.toFixed(1),avgApexError:+avgApex.toFixed(2),minApexError:+minApex.toFixed(2),maxSlipDeg:+maxSlip.toFixed(2),steeringOscillationPerSec:+(steerSignChanges/Math.max(1,time)).toFixed(3),steerVariationPerSec:+(steerVariation/Math.max(1,time)).toFixed(2),majorCorrections};
}

function resolveCars(cars,activePairs){
  const now=new Set();let heavy=0,episodes=0,maxClosing=0;
  for(let iteration=0;iteration<4;iteration++){
    let contacts=0;
    for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
      const a=cars[i],b=cars[j],dx=b.x-a.x,dy=b.y-a.y,broad=a.collisionRadius+b.collisionRadius+Math.abs(a.collisionOffsetX||0)+Math.abs(b.collisionOffsetX||0);
      if(dx*dx+dy*dy>broad*broad)continue;const hit=R.intersectCarOBBs(a,b);if(!hit)continue;contacts++;
      const key=i+':'+j;now.add(key);const correction=(hit.depth+.025)*.5,nx=hit.nx,ny=hit.ny;a.x-=nx*correction;a.y-=ny*correction;b.x+=nx*correction;b.y+=ny*correction;
      const rvx=b.vx-a.vx,rvy=b.vy-a.vy,rvn=rvx*nx+rvy*ny;
      if(rvn<0){
        const closing=-rvn,active=!a.raceFinished&&!b.raceFinished;if(iteration===0&&active&&!activePairs.has(key)&&closing>8){episodes++;if(closing>50)heavy++;maxClosing=Math.max(maxClosing,closing);}
        const impulse=-(1.035)*rvn*.5;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;
        const postRvx=b.vx-a.vx,postRvy=b.vy-a.vy,tangentSpeed=postRvx*(-ny)+postRvy*nx,maxFriction=impulse*.12,friction=clamp(-tangentSpeed*.5,-maxFriction,maxFriction);
        a.vx-=(-ny)*friction;a.vy-=nx*friction;b.vx+=(-ny)*friction;b.vy+=nx*friction;a.speed=Math.hypot(a.vx,a.vy);b.speed=Math.hypot(b.vx,b.vy);a.markImpact(Math.min(1,.28+closing/150));b.markImpact(Math.min(1,.28+closing/150));
      }
    }
    if(!contacts)break;
  }
  return {active:now,episodes,heavy,maxClosing};
}

function multi(trackCfg,difficulty,count,laps,seed){
  setSeed(seed);const track=new R.Track(trackCfg),cars=[];
  for(let i=0;i<count;i++){const c=makeCar(i);c.place(track,-(65+Math.floor(i/2)*140)/track.length,i%2===0?-34:34);c.ai=new R.AIController(c,i,difficulty);c.raceFinished=false;cars.push(c);}
  let time=0,trueOffroad=0,shoulder=0,barrierImpacts=0,contactEpisodes=0,heavyContacts=0,maxClosing=0,maxLaneSpread=0,activePairs=new Set(),confirmedPasses=0;const relation=new Map(),finishTimes=[];
  while(time<180&&cars.some(c=>!c.raceFinished)){
    for(const c of cars)c._ctl=c.ai.think(FRAME,track,cars);
    for(let q=0;q<2;q++){
      for(const c of cars){const active=!c.raceFinished,r=c.update(SUB,c._ctl,track);if(active){if(c.surface==='offroad')trueOffroad+=SUB;else if(c.surface==='shoulder')shoulder+=SUB;if(r.impact>.04)barrierImpacts++;}if(active&&c.laps>=laps){c.raceFinished=true;c.laps=laps;finishTimes.push(time+SUB);}}
      const rr=resolveCars(cars,activePairs);activePairs=rr.active;contactEpisodes+=rr.episodes;heavyContacts+=rr.heavy;maxClosing=Math.max(maxClosing,rr.maxClosing);
    }
    const active=cars.filter(c=>!c.raceFinished),lanes=(active.length?active:cars).map(c=>laneOf(c,track));maxLaneSpread=Math.max(maxLaneSpread,Math.max(...lanes)-Math.min(...lanes));
    for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
      if(cars[i].raceFinished||cars[j].raceFinished)continue;const gap=(cars[i].raceMetric()-cars[j].raceMetric())*track.length;if(Math.abs(gap)<35)continue;const sign=Math.sign(gap),key=i+':'+j,prev=relation.get(key);if(prev&&prev!==sign)confirmedPasses++;relation.set(key,sign);
    }
    time+=FRAME;
  }
  return {track:track.id,difficulty,cars:count,laps,completed:cars.filter(c=>c.raceFinished).length,completionRate:+(cars.filter(c=>c.raceFinished).length/count).toFixed(3),totalSec:+time.toFixed(2),lastFinishSec:+(finishTimes.length?Math.max(...finishTimes):time).toFixed(2),trueOffroadSec:+trueOffroad.toFixed(2),curbShoulderSec:+shoulder.toFixed(2),barrierImpacts,contactEpisodes,heavyContacts,maxClosing:+maxClosing.toFixed(1),confirmedPasses,maxLaneSpread:+maxLaneSpread.toFixed(1)};
}

const singles=[];for(const d of ['easy','medium','hard','extreme'])for(const t of Object.values(R.TRACKS))singles.push(single(t,d,3));
const byTrack={};for(const r of singles)(byTrack[r.track]??={})[r.difficulty]=r.avgLapSec;
const hierarchy=Object.entries(byTrack).map(([track,v])=>({track,ok:v.extreme<v.hard&&v.hard<v.medium&&v.medium<v.easy,easy:v.easy,medium:v.medium,hard:v.hard,extreme:v.extreme}));
const traffic=[multi(R.TRACKS.neonHarbor,'hard',8,2,0x51a7),multi(R.TRACKS.alpineRing,'extreme',10,2,0xa11e),multi(R.TRACKS.desertCanyon,'extreme',13,2,0xd35e47)];
const extreme=singles.filter(r=>r.difficulty==='extreme'),shoulderTracks=extreme.filter(r=>r.curbShoulderSec>.05).length;
const quality={allSinglesFinish:singles.every(r=>r.laps===3),hierarchy:hierarchy.every(r=>r.ok),cleanTrueOffroad:singles.every(r=>r.trueOffroadSec<=.05),noSingleBarrierHits:singles.every(r=>r.barrierImpacts===0),controlledShoulderTracks:shoulderTracks,extremeUsesWidth:extreme.filter(r=>r.maxLane>55).length,trafficCompletes:traffic.every(r=>r.completed===r.cars),trafficNoBarrierPileup:traffic.every(r=>r.barrierImpacts<=1),trafficTrueOffroadControlled:traffic.every(r=>r.trueOffroadSec<1)};
console.log(JSON.stringify({singles,hierarchy,traffic,quality},null,2));
if(!quality.allSinglesFinish||!quality.hierarchy||!quality.cleanTrueOffroad||!quality.noSingleBarrierHits||quality.controlledShoulderTracks<2||quality.extremeUsesWidth<4||!quality.trafficCompletes||!quality.trafficNoBarrierPileup||!quality.trafficTrueOffroadControlled)process.exitCode=1;
