import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve('public/js');
function runtime(root){const context={window:{Racing:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}}};vm.createContext(context);for(const name of ['content.js','car.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name});return context.window.Racing;}
const R=runtime(root),baseline=process.env.BASELINE_DIR?runtime(path.resolve(process.env.BASELINE_DIR,'public/js')):null;
const speedFromKmh=(runtime,kmh)=>runtime.worldSpeedFromKmh?runtime.worldSpeedFromKmh(kmh):kmh*12/3.6;
const kmhFromSpeed=(runtime,speed)=>runtime.kmhFromWorldSpeed?runtime.kmhFromWorldSpeed(speed):speed*3.6/12;
const flat={roadWidth:1e9,theme:{drag:1},nearest(x,y){return {index:0,progress:0,signed:0,tx:1,ty:0,nx:0,ny:1,x,y,curve:0};}};
function car(R,id,kmh=0,player=true){const c=new R.Car({player});R.applyCarPerformance(c,id,R.normalizeSave({}));c.vx=c.speed=speedFromKmh(R,kmh);return c;}
function measure(R,id,hz){
 const pull=target=>{const c=car(R,id);let t=0;while(kmhFromSpeed(R,c.speed)<target&&t<40){c.update(1/hz,{steer:0,throttle:1,brake:0},flat);t+=1/hz;}return t<40?t:null;};
 const b=car(R,id,100);for(let n=0;n<hz*10&&b.speed>.1;n++)b.update(1/hz,{steer:0,throttle:0,brake:1},flat);
 const turn=car(R,id,100);let response=null;
 for(let n=0;n<hz;n++){turn.update(1/hz,{steer:.7,throttle:.4,brake:0},flat);if(response===null&&turn.yawRate>.2)response=(n+1)/hz;}
 return {zero60:pull(60),zero100:pull(100),zero160:pull(160),zero200:pull(200),brakeMeters:b.x/12,yaw:turn.yawRate,turnRadiusMeters:turn.speed/Math.abs(turn.yawRate)/12,exitKmh:kmhFromSpeed(R,turn.speed),responseSeconds:response};
}
const rows=[];
for(const id of ['apexLime','bmw-m5-f90','apollo-evo']){
 const series=[];
 for(const hz of [30,60,120]){
  const after=measure(R,id,hz),before=baseline?measure(baseline,id,hz):null;series.push(after);rows.push({id,hz,before,after});
  assert(after.zero60>0&&after.zero60<8);assert(after.brakeMeters>5&&after.brakeMeters<80);
  if(before)assert.deepEqual(after,before,`${id} at ${hz} FPS must match fe9bbb0 ordinary physics`);
 }
 for(const key of ['zero60','brakeMeters','exitKmh']){const v=series.map(s=>s[key]);assert((Math.max(...v)-Math.min(...v))/Math.max(1,...v)<.05,key+' depends on FPS');}
}
// Whole catalogue: legacy ordinary stats/upgrades, unchanged bots, current UI stats.
for(const id of Object.keys(R.LIVERIES)){
 const p=new R.Car({player:true}),up=new R.Car({player:true}),save=R.normalizeSave({ownedLiveries:['apexLime',id],carUpgrades:{[id]:{speed:2,acceleration:2,brakes:2}}}),display=R.getCarPerformance(id,save),legacy=R.getLegacyCarPerformance(id,save,true);R.applyCarPerformance(p,id,R.normalizeSave({}));R.applyCarPerformance(up,id,save);
 assert.equal(p.maxSpeed,R.getLegacyCarPerformance(id,R.normalizeSave({}),true).maxSpeed,id+' ordinary max speed');assert.equal(p.accel,R.getLegacyCarPerformance(id,R.normalizeSave({}),true).accel,id+' ordinary acceleration');assert.equal(p.brakePower,R.getLegacyCarPerformance(id,R.normalizeSave({}),true).brakePower,id+' ordinary brakes');
 assert.equal(up.maxSpeed,legacy.maxSpeed,id+' legacy speed upgrade');assert.equal(up.accel,legacy.accel,id+' legacy acceleration upgrade');assert.equal(up.brakePower,legacy.brakePower,id+' legacy brake upgrade');
 assert.equal(up.maxSpeedKmh,display.maxSpeed,id+' visible max speed');assert.equal(up.accelKmhPerSecond,display.accel,id+' visible acceleration');assert.equal(up.brakePowerKmhPerSecond,display.brakePower,id+' visible brake stat');
 if(baseline){const oldSave=baseline.normalizeSave({ownedLiveries:['apexLime',id],carUpgrades:{[id]:{speed:2,acceleration:2,brakes:2}}}),oldStats=baseline.getCarPerformance(id,oldSave,true);for(const key of ['maxSpeed','accel','brakePower','turnRate','drift'])assert.equal(legacy[key],oldStats[key],id+' upgraded ordinary '+key+' must match fe9bbb0');}
 if(baseline){const a=car(R,id,100,false),b=car(baseline,id,100,false);for(let n=0;n<180;n++){const input={steer:Math.sin(n/31)*.6,throttle:.7,brake:n>100?.2:0,drift:n>60&&n<100,handbrake:n>60&&n<65?1:0};a.update(1/60,input,flat);b.update(1/60,input,flat);}for(const key of ['x','y','vx','vy','angle','yawRate','speed'])assert.equal(a[key],b[key],id+' changed bot '+key);}
}
// Drift stays bit-for-bit identical to the production 2.0.2 trace through the
// complete slide and its immediate release/regrip window.
const driftReference=JSON.parse(fs.readFileSync('tests/fixtures/v202-drift-hashes.json','utf8'));
for(const ref of driftReference.cases){const [id,hzText,speedText]=ref.key.split('|'),hz=Number(hzText),speed=Number(speedText),c=car(R,id,Math.min(speed,R.getCarPerformance(id,R.normalizeSave({})).maxSpeed)),states=[];
 for(let n=0;n<Math.round(hz*driftReference.seconds);n++){const t=n/hz,steer=t<2?.55:t<4?-.55:0;c.update(1/hz,{steer,throttle:t<4?.7:0,brake:0,handbrake:t<.15||t>=2&&t<2.15?1:0,drift:t<4},flat);states.push([c.x,c.y,c.vx,c.vy,c.angle,c.yawRate,c.speed]);}
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(states)).digest('hex'),ref.sha256,`${ref.key} drift trace changed from 2.0.2`);
}
// Drift: left/right initiation, sustained controlled slip, countersteer, lift and smooth grip return.
const drift=[];
for(const id of ['apexLime','bmw-m5-f90','apollo-evo'])for(const hz of [30,60,120])for(const speed of [60,100,160]){
 const c=car(R,id,Math.min(speed,R.getCarPerformance(id,R.normalizeSave({})).maxSpeed)),samples=[];
 let peak=0,lastAngle=c.angle,maxStep=0,maxSpeedStep=0,transitionSpeedStep=0;
 for(let n=0;n<hz*7;n++){
  const wasDrifting=c._driftingPhysics,previousSpeed=c.speed;
  const t=n/hz,steer=t<2?.55:t<4?-.55:0;
  c.update(1/hz,{steer,throttle:t<4?.7:0,brake:t>5?.2:0,handbrake:t<.15||t>=2&&t<2.15?1:0,drift:t<4},flat);
  const slip=R.angleWrap(Math.atan2(c.vy,c.vx)-c.angle);peak=Math.max(peak,Math.abs(slip));maxStep=Math.max(maxStep,Math.abs(R.angleWrap(c.angle-lastAngle)));lastAngle=c.angle;
  const speedStep=Math.abs(c.speed-previousSpeed);maxSpeedStep=Math.max(maxSpeedStep,speedStep);if(wasDrifting&&!c._driftingPhysics)transitionSpeedStep=speedStep;
  for(const key of ['x','y','vx','vy','angle','speed','yawRate'])assert(Number.isFinite(c[key]),id+' invalid '+key);
  if(n===hz*2-1||n===hz*4-1||n===hz*7-1)samples.push(slip);
 }
 assert(samples[0]<-.07&&samples[1]>.07,'drift must be controllable in both directions');
 assert(peak<Math.PI/3&&maxStep<.13,'short HB must not spin or snap the car');
 assert(maxSpeedStep<20&&transitionSpeedStep<20,'switching back to normal physics must not snap speed');
 assert(Math.abs(samples[2])<.04,'grip must recover on lift and straightening');
 drift.push({id,hz,speed,peakDegrees:peak*180/Math.PI,maxAngleStep:maxStep,maxSpeedStep,transitionSpeedStep,finalSlip:samples[2]});
}
// Client and server must use exactly the same player formulas.
const {createRaceRuntime}=await import('../public/js/race-runtime-v77.mjs');
const server=createRaceRuntime(1),a=car(R,'bmw-m5-f90',100),b=car(server,'bmw-m5-f90',100);
for(let n=0;n<300;n++){const input={steer:Math.sin(n/60)*.6,throttle:.7,brake:n>240?.4:0,drift:n>60&&n<200,handbrake:n>60&&n<68?1:0};a.update(1/60,input,flat);b.update(1/60,input,flat);}
for(const key of ['x','y','vx','vy','angle','speed'])assert.equal(a[key],b[key],'client/server '+key);
fs.mkdirSync('artifacts/v202',{recursive:true});fs.writeFileSync('artifacts/v202/physics.json',JSON.stringify({catalogue:Object.keys(R.LIVERIES).length,rows,drift},null,2));
console.log(`v203 physics PASS: ${rows.length} baseline comparisons, ${driftReference.cases.length} exact 2.0.2 drift traces, ${drift.length} stability runs, full-catalogue legacy upgrades/bot isolation, client/server parity`);
