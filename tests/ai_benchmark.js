/* Deterministic AI benchmark: 6 tracks x 4 difficulties, clean air + 3/7/13-car traffic, two seeds. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
let rng=1;const seed=v=>rng=v>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
for(const f of ['public/js/content.js','public/js/racing-line.js','public/js/track.js','public/js/car.js','public/js/ai.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,f),'utf8'),{filename:f});
const R=Racing,FRAME=1/60,SUB=1/120,DIFF=['easy','medium','hard','extreme'];
const make=(id)=>new R.Car({id,...R.RACE_PHYSICS});
const lane=(c,t)=>{const p=t.samples[c.trackIndex];return(c.x-p.x)*p.nx+(c.y-p.y)*p.ny;};
function clean(cfg,d,carFactory=make,lapTarget=3,trackInstance=null,seedSalt=0){seed((cfg.id.length*131+d.length*977+seedSalt)>>>0);const t=trackInstance||new R.Track(cfg),c=carFactory(1);c.place(t,0,0);c.ai=new R.AIController(c,1,d);let time=0,lapStart=0,laps=[],sumV=0,n=0,minV=1e9,maxV=0,thr=0,full=0,br=0,coast=0,below=0,maxLane=0,imp=0;const sectors=Array.from({length:4},()=>({time:0,entry:0,min:1e9,exit:0}));let lastSector=0,sectorStart=0;
while(c.laps<lapTarget&&time<240){const o=c.ai.think(FRAME,t,[c]),target=c.ai.speedProfile[c.trackIndex];thr+=o.throttle;full+=o.throttle>.95;br+=o.brake;coast+=o.throttle<.08&&o.brake<.08;below+=c.speed<target-12;sumV+=c.speed;minV=Math.min(minV,c.speed);maxV=Math.max(maxV,c.speed);maxLane=Math.max(maxLane,Math.abs(lane(c,t)));n++;for(let q=0;q<2;q++){const r=c.update(SUB,o,t);time+=SUB;if(r.impact>.04)imp++;const s=Math.min(3,Math.floor(c.progress*4));sectors[s].min=Math.min(sectors[s].min,c.speed);if(s!==lastSector){sectors[lastSector].time+=time-sectorStart;sectors[lastSector].exit=c.speed;sectors[s].entry=c.speed;sectorStart=time;lastSector=s;}if(c.finishedLap){laps.push(time-lapStart);lapStart=time;}}}
return{track:t.id,difficulty:d,avgLap:+(laps.reduce((a,b)=>a+b,0)/laps.length).toFixed(2),bestLap:+Math.min(...laps).toFixed(2),variance:+(laps.reduce((a,b)=>a+b*b,0)/laps.length-Math.pow(laps.reduce((a,b)=>a+b,0)/laps.length,2)).toFixed(3),avgSpeed:+(sumV/n).toFixed(1),minSpeed:+minV.toFixed(1),maxSpeed:+maxV.toFixed(1),throttlePct:+(100*thr/n).toFixed(1),fullThrottlePct:+(100*full/n).toFixed(1),brakePct:+(100*br/n).toFixed(1),coastPct:+(100*coast/n).toFixed(1),belowTargetPct:+(100*below/n).toFixed(1),offroad:+c.trueOffroadTime.toFixed(2),shoulder:+c.controlledShoulderTime.toFixed(2),barrierImpacts:imp,maxLane:+maxLane.toFixed(1)};}
function resolve(cars,active){const now=new Set();let episodes=0,heavy=0;for(let it=0;it<3;it++){let hits=0;for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){const a=cars[i],b=cars[j],dx=b.x-a.x,dy=b.y-a.y,broad=a.collisionRadius+b.collisionRadius+4;if(dx*dx+dy*dy>broad*broad)continue;const h=R.intersectCarOBBs(a,b);if(!h)continue;hits++;const key=i+':'+j,closing=Math.max(0,-((b.vx-a.vx)*h.nx+(b.vy-a.vy)*h.ny));now.add(key);if(it===0&&!active.has(key)&&closing>8){episodes++;if(closing>50)heavy++;}const corr=(h.depth+.03)*.5;a.x-=h.nx*corr;a.y-=h.ny*corr;b.x+=h.nx*corr;b.y+=h.ny*corr;if(closing>0){const impulse=closing*.52;a.vx-=h.nx*impulse;a.vy-=h.ny*impulse;b.vx+=h.nx*impulse;b.vy+=h.ny*impulse;}}if(!hits)break;}return{now,episodes,heavy};}
function traffic(cfg,d,count,s){seed(s);const t=new R.Track(cfg),cars=[];for(let i=0;i<count;i++){const c=make(i+1);c.place(t,-(60+Math.floor(i/2)*125)/t.length,i%2?-32:32);c.ai=new R.AIController(c,i,d);c.raceFinished=false;cars.push(c);}let time=0,active=new Set(),episodes=0,heavy=0,off=0,bar=0,passes=0;const order=new Map();while(time<100&&cars.some(c=>!c.raceFinished)){for(const c of cars)c._o=c.ai.think(FRAME,t,cars);for(let q=0;q<2;q++){for(const c of cars){if(c.raceFinished)continue;const r=c.update(SUB,c._o,t);if(c.surface==='offroad')off+=SUB;if(r.impact>.04)bar++;if(c.laps>=1)c.raceFinished=true;}const rr=resolve(cars,active);active=rr.now;episodes+=rr.episodes;heavy+=rr.heavy;}for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){if(cars[i].raceFinished||cars[j].raceFinished)continue;const g=(cars[i].raceMetric()-cars[j].raceMetric())*t.length;if(Math.abs(g)<30)continue;const k=i+':'+j,sg=Math.sign(g),old=order.get(k);if(old&&old!==sg)passes++;order.set(k,sg);}time+=FRAME;}return{track:t.id,difficulty:d,cars:count,seed:s,completed:cars.filter(c=>c.raceFinished).length,time:+time.toFixed(2),contactEpisodes:episodes,heavyContacts:heavy,passes,offroad:+off.toFixed(2),barrierImpacts:bar};}
const cleanAir=[];for(const d of DIFF)for(const t of Object.values(R.TRACKS))cleanAir.push(clean(t,d));
const hierarchy=Object.values(R.TRACKS).map(t=>{const x={};cleanAir.filter(r=>r.track===t.id).forEach(r=>x[r.difficulty]=r.avgLap);return{track:t.id,easy:x.easy,medium:x.medium,hard:x.hard,extreme:x.extreme,ok:x.extreme<x.hard&&x.hard<x.medium&&x.medium<x.easy};});
const trafficRuns=[];for(const s of [0x51a7,0xa11e])for(const d of DIFF)for(const t of Object.values(R.TRACKS))for(const count of [3,7,13])trafficRuns.push(traffic(t,d,count,s));
const stress=trafficRuns.filter(r=>r.cars===13),quality={hierarchy:hierarchy.every(x=>x.ok),cleanFinish:cleanAir.every(x=>x.avgLap<80),cleanNoBarrier:cleanAir.every(x=>x.barrierImpacts===0),trafficFinish:trafficRuns.every(x=>x.completed===x.cars),stressNoPileup:stress.every(x=>x.barrierImpacts<=2&&x.heavyContacts<Math.max(18,x.cars*2)),stressOffroad:stress.every(x=>x.offroad<4)};
const economy=DIFF.map(d=>{const lap=cleanAir.filter(r=>r.difficulty===d).reduce((a,r)=>a+r.avgLap,0)/Object.keys(R.TRACKS).length,settings={bots:7,laps:5,difficulty:d},reward=R.raceReward(settings,4),crPerHour=reward*3600/(lap*5+6);return{difficulty:d,averageLapSec:+lap.toFixed(2),fourthPlaceCR:reward,estimatedCRPerHour:+crPerHour.toFixed(0)};});
const extremeRate=economy.find(x=>x.difficulty==='extreme').estimatedCRPerHour,hardRate=economy.find(x=>x.difficulty==='hard').estimatedCRPerHour;
quality.extremeNotDisproportionatelyFarmable=extremeRate<=hardRate*1.15;

const modelIds=Object.keys(R.CAR_PERFORMANCE).filter(id=>R.LIVERIES[id]&&!R.LIVERIES[id].legacy&&!R.LIVERIES[id].shopHidden);
const upgradeProfiles=[['stock',{}],['speed5',{speed:5}],['acceleration5',{acceleration:5}],['brakes5',{brakes:5}],['all5',{speed:5,acceleration:5,brakes:5}]];
const modelTracks=['apexCircuit','desertCanyon'].map(id=>R.TRACKS[id]);
const modelTrackObjects=Object.fromEntries(modelTracks.map(cfg=>[cfg.id,new R.Track(cfg)]));
const modelHash=value=>{let h=2166136261;for(const ch of value)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;};
const modelMatrix=[];let upgradesMonotonic=true;
for(const model of modelIds){
  const catalog=R.LIVERIES[model];
  for(const key of Object.keys(R.UPGRADE_TYPES)){
    let prior=R.getCarPerformance(model,{carUpgrades:{[model]:{[key]:0}}},false)[R.UPGRADE_TYPES[key].stat];
    for(let level=1;level<=R.UPGRADE_MAX_LEVEL;level++){
      const value=R.getCarPerformance(model,{carUpgrades:{[model]:{[key]:level}}},false)[R.UPGRADE_TYPES[key].stat];
      if(value<prior)upgradesMonotonic=false;prior=value;
    }
  }
  for(const [profile,levels] of upgradeProfiles){
    for(const difficulty of DIFF){
      if(profile!=='stock'&&profile!=='all5'&&difficulty!=='extreme')continue;
      const save={carUpgrades:{[model]:levels}},factory=id=>{const car=make(id);R.applyCarPerformance(car,model,save);return car;};
      for(const cfg of modelTracks){
        const result=clean(cfg,difficulty,factory,1,modelTrackObjects[cfg.id],modelHash(`${model}:${profile}:${difficulty}:${cfg.id}`));
        modelMatrix.push({...result,model,category:catalog.category,upgrade:profile});
      }
    }
  }
}
const modelLadder=DIFF.map(d=>{const rows=modelMatrix.filter(r=>r.difficulty===d&&(r.upgrade==='stock'||r.upgrade==='all5'));const avgLap=rows.reduce((a,r)=>a+r.avgLap,0)/Math.max(1,rows.length),reward=R.raceReward({bots:7,laps:5,difficulty:d},4);return{difficulty:d,simulations:rows.length,averageLapSec:+avgLap.toFixed(2),fourthPlaceCR:reward,estimatedCRPerHour:+(reward*3600/(avgLap*5+6)).toFixed(0)};});
const modelLadderOrder=modelLadder[3].averageLapSec<modelLadder[2].averageLapSec&&modelLadder[2].averageLapSec<modelLadder[1].averageLapSec&&modelLadder[1].averageLapSec<modelLadder[0].averageLapSec;
const modelExtremeRate=modelLadder[3].estimatedCRPerHour,modelHardRate=modelLadder[2].estimatedCRPerHour;
quality.vehicleUpgradeMatrix=modelIds.length>=40&&modelMatrix.length===modelIds.length*22;
quality.upgradesMonotonic=upgradesMonotonic;
quality.vehicleDifficultyLadder=modelLadderOrder;
quality.vehicleExtremeNotDisproportionatelyFarmable=modelExtremeRate<=modelHardRate*1.15;
quality.vehicleMatrixFinished=modelMatrix.every(r=>Number.isFinite(r.avgLap)&&r.avgLap<90&&r.barrierImpacts===0);

console.log(JSON.stringify({vehicleUpgradeSummary:{models:modelIds.length,categories:[...new Set(modelIds.map(id=>R.LIVERIES[id].category))],simulations:modelMatrix.length,ladder:modelLadder,failed:modelMatrix.filter(r=>!Number.isFinite(r.avgLap)||r.avgLap>=90||r.barrierImpacts>0).slice(0,20)},cleanAir,hierarchy,trafficSummary:{runs:trafficRuns.length,avgContacts:+(trafficRuns.reduce((a,b)=>a+b.contactEpisodes,0)/trafficRuns.length).toFixed(2),avgHeavy:+(trafficRuns.reduce((a,b)=>a+b.heavyContacts,0)/trafficRuns.length).toFixed(2),passes:trafficRuns.reduce((a,b)=>a+b.passes,0),stress13:stress},economy,quality},null,2));
if(!Object.values(quality).every(Boolean))process.exitCode=1;
