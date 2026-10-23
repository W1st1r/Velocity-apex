import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const gradient={addColorStop(){}};
const drawCalls=[];
const canvasContext={createRadialGradient(){return gradient;},fillRect(){},save(){},restore(){},drawImage(...args){drawCalls.push(args);},beginPath(){},arc(){},fill(){}};
const sandbox={window:{Racing:{worldSpeedFromKmh:kmh=>kmh*120/3.6},navigator:{hardwareConcurrency:8},document:{createElement(){return {getContext(){return canvasContext;}}}}},Math,Number,WeakMap,Array};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/js/tire-smoke.js','utf8'),sandbox,{filename:'tire-smoke.js'});
const smoke=sandbox.window.VelocityTireSmoke.create({maxParticles:24});
const car=(speedKmh,slip,overrides={})=>({x:100,y:200,angle:0,vx:speedKmh*120/3.6*Math.cos(slip),vy:speedKmh*120/3.6*Math.sin(slip),speed:0,yawRate:.4,maxSpeed:500,accel:200,brakePower:300,turnRate:2.4,length:62,width:31,onRoad:true,surface:'asphalt',...overrides});
const tick=(system,hz,seconds,c)=>{for(let i=0;i<Math.round(hz*seconds);i++)system.update([c],1/hz);};
for(const c of [car(100,0),car(100,.12),car(24,.48)]){tick(smoke,60,.5,c);assert.equal(smoke.stats.active,0,'straight, ordinary steering and low speed must not emit smoke');}
smoke.clear();
const drifting=car(100,.42),before=[drifting.x,drifting.y,drifting.vx,drifting.vy,drifting.speed,drifting.angle,drifting.yawRate,drifting.maxSpeed,drifting.accel,drifting.brakePower,drifting.turnRate];
for(let n=0;n<30&&smoke.stats.emitted===0;n++)smoke.update([drifting],1/60);
assert(smoke.stats.active>0,'actual drift emits smoke after a soft entry');assert(smoke.stats.emitted>=2,'both rear tires emit');
assert.equal(smoke.stats.poolSize,24);smoke.draw(canvasContext);assert(drawCalls.length>0,'smoke particles render');
const centers=drawCalls.slice(0,2).map(a=>[a[1]+a[3]/2,a[2]+a[4]/2]);
assert(centers.every(([x,y])=>Math.abs(x-80)<14&&[187,213].some(wheelY=>Math.abs(y-wheelY)<14)),'smoke starts under both rear wheels');
tick(smoke,60,.3,drifting);const early=smoke.stats.emitted;tick(smoke,60,2,drifting);assert(smoke.stats.emitted>early,'sustained drift gradually emits a denser trail');
assert(smoke.stats.active<=smoke.stats.poolSize,'particle pool is bounded');
assert.deepEqual([drifting.x,drifting.y,drifting.vx,drifting.vy,drifting.speed,drifting.angle,drifting.yawRate,drifting.maxSpeed,drifting.accel,drifting.brakePower,drifting.turnRate],before,'visual update cannot alter car physics');
const stopped=car(100,.04);drifting.vx=stopped.vx;drifting.vy=stopped.vy;const afterExit=smoke.stats.emitted;
smoke.update([drifting],1/60);assert.equal(smoke.stats.emitted,afterExit,'exit stops new emission immediately');
tick(smoke,60,2,drifting);assert.equal(smoke.stats.active,0,'existing clouds fade and clear');
for(const hz of [30,60,120]){smoke.clear();const c=car(100,.42);tick(smoke,hz,3,c);assert(smoke.stats.emitted>0&&smoke.stats.active<=smoke.stats.poolSize,hz+' FPS bounded drift smoke');assert.equal(smoke.stats.poolSize,24);}
for(let n=0;n<12;n++){smoke.clear();const c=car(100,.42);tick(smoke,60,.8,c);assert(smoke.stats.active<=24);}
const game=fs.readFileSync('public/js/game.js','utf8'),html=fs.readFileSync('public/index.html','utf8');
assert.match(html,/js\/tire-smoke\.js[^\n]*build=2\.0\.4/,'smoke module is cache-versioned and loaded');
assert.match(game,/tireSmoke\.update\(cars,dt\)/,'renderer advances the visual-only system');assert.match(game,/tireSmoke\.draw\(ctx\)/,'smoke renders in the world layer');
assert.doesNotMatch(game,/spawnParticle\([^;]*['"]smoke['"]/,'legacy center smoke is removed from ordinary and drift paths');
console.log('v204 tire smoke PASS: no ordinary smoke; rear tire emission; gradual sustained density; fade-out; bounded pool; physics isolation; 30/60/120 FPS');
