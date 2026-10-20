import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window=globalThis;window.Racing={};
for(const file of ['content.js','racing-line.js','track.js','car.js'])vm.runInThisContext(fs.readFileSync(new URL('../public/js/'+file,import.meta.url),'utf8'),{filename:file});
const R=window.Racing;
const flat={roadWidth:220,theme:{drag:1},samples:[{tx:1,ty:0,nx:0,ny:1}],nearest(x,y){return {index:0,progress:0,signed:0,tx:1,ty:0,nx:0,ny:1,x,y:0,curve:0}}};
assert.equal(R.worldSpeedFromKmh(200),200*12/3.6);
assert.equal(R.kmhFromWorldSpeed(R.worldSpeedFromKmh(200)),200);
const drive=(hz,initialKmh=0,seconds=3,carId='apexLime')=>{const c=new R.Car({player:true});R.applyCarPerformance(c,carId,R.normalizeSave({}));c.vx=R.worldSpeedFromKmh(initialKmh);c.speed=c.vx;for(let i=0;i<hz*seconds;i++)c.update(1/hz,{steer:0,throttle:initialKmh?0:1,brake:0},flat);return {distance:c.x,speed:c.speed};};
const runs=[30,60,120].map(hz=>drive(hz,0,5.2));
for(const run of runs){assert(run.speed>R.worldSpeedFromKmh(90),'starter car reaches 90 km/h during a 5.2-second full-throttle pull');assert(run.speed<R.worldSpeedFromKmh(180),'starter car remains within its class');}
const distances=runs.map(x=>x.distance),spread=(Math.max(...distances)-Math.min(...distances))/Math.max(...distances);assert(spread<.025,`frame-rate distance drift ${spread}`);
const coast=drive(60,200,2,'apollo-evo');assert(coast.distance>R.worldSpeedFromKmh(200)*1.75,`200 km/h should cover close to 111 m in 2 sec: ${coast.distance/12} m`);
for(const category of ['basic','sport','premium','rare','legendary','lux']){
 const values=Object.entries(R.CAR_PERFORMANCE).filter(([id])=>R.normalizeCarCategory(R.LIVERIES[id].category)===category).map(([,v])=>v.maxSpeed);
 assert(values.length&&Math.min(...values)>=140&&Math.max(...values)<=286,`${category} max speed band`);
}
console.log(JSON.stringify({unitsPerMeter:R.WORLD_UNITS_PER_METER,oneHundredKmPerHourWorldSpeed:R.worldSpeedFromKmh(100),fps:[30,60,120],distancesWorldUnits:distances.map(x=>Math.round(x)),driftPercent:+(spread*100).toFixed(2),distanceAt200KmhMeters:+(coast.distance/12).toFixed(1)}));
