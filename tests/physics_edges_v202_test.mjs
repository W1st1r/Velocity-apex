import assert from 'node:assert/strict';
import {createRaceRuntime} from '../public/js/race-runtime-v77.mjs';
import {RaceSession} from '../public/js/race-session-v77.mjs';
const R=createRaceRuntime(1),flat={roadWidth:1e9,theme:{drag:1},nearest(x,y){return {index:0,progress:0,signed:0,tx:1,ty:0,nx:0,ny:1,x,y,curve:0};}};
let runs=0;
for(const id of ['apexLime','bmw-m5-f90','ferrari-laferrari'])for(const hz of [30,60,120])for(const initial of [30,100,220]){
 const c=new R.Car({player:true});R.applyCarPerformance(c,id,R.normalizeSave({}));c.vx=c.speed=Math.min(c.maxSpeed,R.worldSpeedFromKmh(initial));
 let previous=c.angle;
 for(let n=0;n<hz*8;n++){
  const t=n/hz,steer=t<6?Math.sin(t*Math.PI)*.8:0;
  c.update(1/hz,{steer,throttle:t<6?.55:0,brake:t>3&&t<5?.6:0},flat);
  for(const key of ['x','y','vx','vy','angle','yawRate','speed'])assert(Number.isFinite(c[key]));
  assert(c.speed<=c.maxSpeed+.001);assert(Math.abs(R.angleWrap(c.angle-previous))<.2,'normal braking/steering must not snap');previous=c.angle;
  assert(Math.abs(R.angleWrap(Math.atan2(c.vy,c.vx)-c.angle))<.25,'normal corner must not become persistent drift');
 }
 assert(Math.abs(c.yawRate)<.005,'released steering must stabilize');runs++;
}
const config={mode:'drift',carId:'bmw-m5-f90',trackId:Object.keys(R.DRIFT_TRACKS)[0],bots:1,laps:1,difficulty:'medium'},save=R.normalizeSave({ownedLiveries:['apexLime','bmw-m5-f90']});
const a=new RaceSession(config,save,123);
for(let n=0;n<180;n++)a.step([.35,1,0,n>100&&n<110?1:0]);
const b=new RaceSession(config,save,123,a.serialize());assert.deepEqual(a.serialize(),b.serialize());
for(let n=0;n<60;n++){const input=[-.3,.7,0,0];a.step(input);b.step(input);}assert.deepEqual(a.serialize(),b.serialize(),'drift blend/HB state must survive server restore exactly');
console.log('v202 edges PASS: '+runs+' multi-FPS high/low-speed steering/trail-braking runs; deterministic drift restart');
