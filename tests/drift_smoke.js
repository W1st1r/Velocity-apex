/* Drift-mode regression + AI traversal checks. Run: node tests/drift_smoke.js */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
for(const file of ['public/js/content.js','public/js/racing-line.js','public/js/track.js','public/js/car.js','public/js/ai.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file});
const R=Racing,DT=1/120,DIFF=['easy','medium','hard','extreme'];

assert.equal(Object.keys(R.DRIFT_TRACKS||{}).length,2,'exactly two drift-only maps required');
for(const id of Object.keys(R.DRIFT_TRACKS))assert.ok(!R.TRACKS[id],`${id} leaked into normal track catalog`);
const trackReport=[];
for(const cfg of Object.values(R.DRIFT_TRACKS)){
  const track=new R.Track(cfg);
  assert.ok(track.length>=8000&&track.length<=13000,`${cfg.id}: drift map must be about 8–12+ km`);
  assert.ok(track.samples.length>250,`${cfg.id}: map sampling unexpectedly sparse`);
  trackReport.push({id:cfg.id,length:+track.length.toFixed(0),samples:track.samples.length});
}

// A handbrake initiation should create a useful slip angle, then settle when released.
const flat={roadWidth:260,theme:{drag:1},samples:[{tx:1,ty:0,nx:0,ny:1}],nearest(x,y){return{index:0,progress:(((x%10000)+10000)%10000)/10000,signed:y,tx:1,ty:0,nx:0,ny:1,x,y:0,curve:0};}};
const slipDeg=c=>c.speed<1?0:Math.abs(R.angleWrap(Math.atan2(c.vy,c.vx)-c.angle))*180/Math.PI;
const car=new R.Car({player:true,...R.RACE_PHYSICS});car.vx=260;car.speed=260;
let peakSlip=0;
for(let t=0;t<1.15;t+=DT){car.update(DT,{steer:.62,throttle:.78,brake:0,handbrake:t<.34?1:0,drift:true},flat);peakSlip=Math.max(peakSlip,slipDeg(car));}
assert.ok(peakSlip>=18&&peakSlip<80,`handbrake drift slip out of useful range: ${peakSlip.toFixed(1)}°`);
for(let t=0;t<1.45;t+=DT)car.update(DT,{steer:0,throttle:.52,brake:0,handbrake:0,drift:true},flat);
const recoveredSlip=slipDeg(car);assert.ok(recoveredSlip<12,`drift should recover grip after release: ${recoveredSlip.toFixed(1)}°`);

// Every difficulty must be able to finish each long drift route without AI-specific drift physics.
const aiReport=[];
for(const cfg of Object.values(R.DRIFT_TRACKS))for(const difficulty of DIFF){
  const track=new R.Track(cfg),bot=new R.Car({id:1,...R.RACE_PHYSICS});bot.place(track,0,0);bot.ai=new R.AIController(bot,1,difficulty);
  let time=0,barrierImpacts=0;
  while(bot.laps<1&&time<130){const out=bot.ai.think(1/60,track,[bot]);for(let q=0;q<2;q++){const r=bot.update(DT,out,track);if(r.impact>.08)barrierImpacts++;time+=DT;}}
  assert.ok(bot.laps>=1,`${cfg.id}/${difficulty}: AI failed to complete drift route`);
  assert.ok(barrierImpacts<=2,`${cfg.id}/${difficulty}: too many barrier impacts (${barrierImpacts})`);
  aiReport.push({track:cfg.id,difficulty,time:+time.toFixed(1),barrierImpacts});
}

// Drift payout is tied to completion context but score contribution is capped.
const settings={bots:7,difficulty:'medium'};
const base=R.driftReward(settings,8,0,10400),winner=R.driftReward(settings,1,0,10400),scored=R.driftReward(settings,1,9000,10400),huge=R.driftReward(settings,1,99999999,10400);
assert.ok(base>0&&winner>base&&scored>winner,'drift payout should reward placement and drift score');
assert.equal(huge,scored,'drift score payout must be capped against farming');
assert.ok(R.driftReward({...settings,difficulty:'extreme'},1,9000,11800)>scored,'higher difficulty/longer route should pay more');
const save=R.normalizeSave({credits:1234,driftBotCount:11,driftDifficulty:'hard',driftTrackId:'midnightSwitchbacks',bestDriftScore:4321});
assert.equal(save.credits,1234);assert.equal(save.driftBotCount,11);assert.equal(save.driftDifficulty,'hard');assert.equal(save.driftTrackId,'midnightSwitchbacks');assert.equal(save.bestDriftScore,4321);

// Static integration guards: mobile control, separate mode choice, and forward-progress anti-farm gate.
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8'),controls=fs.readFileSync(path.join(ROOT,'public/js/controls.js'),'utf8');
for(const id of ['localMode','normalModeBtn','driftModeBtn','handbrakeBtn'])assert.ok(html.includes(`id="${id}"`),`missing drift UI ${id}`);
assert.ok(controls.includes("this._bindHold(this.handbrakeBtn,'handbrake',()=>this.driftMode)"),'handbrake must use independent hold/multitouch control');
assert.ok(game.includes("forward>48")&&game.includes("meters>.03")&&game.includes("progressMeters"),'drift scoring must require forward track progress');
assert.ok(game.includes("playerControl.drift=localMode==='drift'"),'normal and drift physics must remain mode-separated');

console.log(JSON.stringify({tracks:trackReport,physics:{peakSlipDeg:+peakSlip.toFixed(1),recoveredSlipDeg:+recoveredSlip.toFixed(1)},ai:aiReport,payout:{base,winner,scored,capped:huge}},null,2));
console.log('drift_smoke: OK');
