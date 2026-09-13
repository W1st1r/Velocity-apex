/* Formula-style physics + camera source invariants. Run: node tests/physics_smoke.js */
const fs=require('fs'),path=require('path'),vm=require('vm');const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
for(const file of ['public/js/content.js','public/js/racing-line.js','public/js/track.js','public/js/car.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file});const R=Racing,DT=1/120;
const flat=signed=>({roadWidth:220,theme:{drag:1},samples:[{tx:1,ty:0,nx:0,ny:1}],nearest(x,y){return {index:0,progress:0,signed:signed||0,tx:1,ty:0,nx:0,ny:1,x,y:0,curve:0}}});
const fresh=speed=>{const c=new R.Car({player:true,maxSpeed:400,accel:210,brakePower:320,turnRate:2.32});c.vx=speed;c.vy=0;c.speed=speed;return c;};
const slip=c=>c.speed<1?0:Math.abs(R.angleWrap(Math.atan2(c.vy,c.vx)-c.angle))*180/Math.PI;
let car=fresh(300),fastSlip=0;for(let t=0;t<.8;t+=DT){car.update(DT,{steer:.72,throttle:.5,brake:0},flat());fastSlip=Math.max(fastSlip,slip(car));}
car=fresh(270);for(let t=0;t<.45;t+=DT)car.update(DT,{steer:-1,throttle:.3,brake:0},flat());let cross=null,reverseSlip=0;for(let t=0;t<.55;t+=DT){car.update(DT,{steer:1,throttle:.3,brake:0},flat());if(cross===null&&car.yawRate>0)cross=t;reverseSlip=Math.max(reverseSlip,slip(car));}for(let t=0;t<.35;t+=DT)car.update(DT,{steer:0,throttle:0,brake:0},flat());const releasedSlip=slip(car);
car=fresh(310);let brakeSlip=0;for(let t=0;t<1;t+=DT){car.update(DT,{steer:.7,throttle:0,brake:1},flat());brakeSlip=Math.max(brakeSlip,slip(car));}const brakeEnd=car.speed;
car=fresh(220);car.vy=55;car.speed=Math.hypot(car.vx,car.vy);for(let t=0;t<.7;t+=DT)car.update(DT,{steer:-.25,throttle:.5,brake:0},flat(180));const grassSlip=slip(car);for(let t=0;t<.5;t+=DT)car.update(DT,{steer:0,throttle:.6,brake:0},flat());const recoveredSlip=slip(car);
const game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8'),camera={noPitch:!/(cam\.pitch|zoom\s*\*\s*cam\.pitch)/.test(game),uniformScale:/ctx\.scale\(cam\.zoom,cam\.zoom\)/.test(game)};
const lineStats=Object.values(R.TRACKS).map(cfg=>{const t=new R.Track(cfg),o=t.racingLineOffset,d=o.map((v,i)=>Math.abs(v-o[(i+1)%o.length]));return {track:t.id,maxOffset:+Math.max(...o.map(Math.abs)).toFixed(1),maxAdjacentStep:+Math.max(...d).toFixed(2)};});
const result={fastTurn:{maxSlipDeg:+fastSlip.toFixed(2)},leftRight:{yawSignChangeSec:+cross.toFixed(3),maxSlipDeg:+reverseSlip.toFixed(2),postReleaseSlipDeg:+releasedSlip.toFixed(2)},brakeTurn:{endSpeed:+brakeEnd.toFixed(1),maxSlipDeg:+brakeSlip.toFixed(2)},grassRecovery:{grassSlipDeg:+grassSlip.toFixed(2),recoveredSlipDeg:+recoveredSlip.toFixed(2)},camera,lineStats};
console.log(JSON.stringify(result,null,2));
if(fastSlip>6||reverseSlip>6||releasedSlip>1||brakeEnd>90||recoveredSlip>1||!camera.noPitch||!camera.uniformScale)process.exitCode=1;
