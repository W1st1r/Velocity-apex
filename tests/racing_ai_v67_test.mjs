/* Velocity Apex V67: deterministic offline racing AI and handling contract. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window=globalThis;
globalThis.Racing={};
for(const f of ['content.js','racing-line.js','track.js','car.js','ai.js']){
  vm.runInThisContext(fs.readFileSync(path.join(root,'public/js',f),'utf8'),{filename:f});
}
const R=Racing;
const game=fs.readFileSync(path.join(root,'public/js/game.js'),'utf8');
assert.match(game,/playerGrid=total-1/,'The player must be the last grid entrant');
assert.match(game,/isPlayer\?76:0/,'The player must start behind the last bot row');
assert.match(game,/R\.botSkillProfile\(botName-1,raceSettings\.bots,raceSettings\.difficulty\)/);
assert.match(game,/c\.gripFactor=skill\.grip/);
const result={difficulty:{},drivers:[],tracks:[],physics:{}};
for(const difficulty of ['easy','medium','hard','extreme']){
  const specs=Array.from({length:13},(_,i)=>R.botSkillProfile(i,13,difficulty));
  for(const s of specs){
    for(const key of ['topSpeed','acceleration','braking','steering','grip','pace','cornering','racecraft']){
      assert(Number.isFinite(s[key])&&s[key]>.5&&s[key]<1.3,`${difficulty} ${key}`);
    }
  }
  assert(new Set(specs.map(x=>x.topSpeed.toFixed(5))).size>=9,'AI cars must have different top speeds');
  assert(new Set(specs.map(x=>x.acceleration.toFixed(5))).size>=9,'AI cars must have different acceleration');
  result.difficulty[difficulty]={minTop:+Math.min(...specs.map(x=>x.topSpeed)).toFixed(3),maxTop:+Math.max(...specs.map(x=>x.topSpeed)).toFixed(3)};
}
assert(result.difficulty.extreme.minTop>result.difficulty.easy.minTop);
assert(result.difficulty.extreme.maxTop>result.difficulty.hard.maxTop);
const extreme=Array.from({length:13},(_,i)=>R.botSkillProfile(i,13,'extreme'));
const exampleSave={carUpgrades:{}};
const reference=R.getCarPerformance('apexLime',exampleSave,true);
const cars=extreme.map((skill,i)=>{
  const car=new R.Car({id:i+1,...reference});
  car.maxSpeed=Math.round(car.maxSpeed*skill.topSpeed);
  car.accel=Math.round(car.accel*skill.acceleration);
  car.brakePower=Math.round(car.brakePower*skill.braking);
  car.gripFactor=skill.grip;
  return car;
});
assert(new Set(cars.map(c=>c.maxSpeed)).size>=8);
assert(new Set(cars.map(c=>c.accel)).size>=8);
result.drivers=cars.map((c,i)=>({id:i+1,maxSpeed:c.maxSpeed,accel:c.accel,brakes:c.brakePower,grip:+c.gripFactor.toFixed(3)}));
const low=new R.Car({maxSpeed:510,accel:268,brakePower:368,turnRate:2.4});
const lowAuthority=low.steeringAuthority(115,'asphalt'),fastAuthority=low.steeringAuthority(470,'asphalt');
assert(fastAuthority<lowAuthority*.84,'Steering must be reduced at high speed');
assert(low.steeringAuthority(115,'asphalt')>low.steeringAuthority(30,'asphalt'),'Steering must remain controllable at low speed');
result.physics={authority115:+lowAuthority.toFixed(3),authority470:+fastAuthority.toFixed(3)};
for(const cfg of Object.values(R.TRACKS)){
  const track=new R.Track(cfg);
  const bot=cars[4];bot.place(track,0,0);bot.ai=new R.AIController(bot,4,'extreme');
  const profile=track.getSpeedProfile(bot,{difficulty:'extreme',gripUsage:1,brakeUsage:1,accelUsage:1,pace:1});
  assert(profile.length===track.samples.length);
  assert(profile.every(v=>Number.isFinite(v)&&v>20&&v<=bot.maxSpeed+.01));
  const curbs=track.racingLines.extreme.filter(offset=>Math.abs(offset)>=track.asphaltCenterLimit).length;
  const futureTurns=track.apexes.length;
  result.tracks.push({track:cfg.id,samples:track.samples.length,apices:futureTurns,curbLineSamples:curbs,profileMin:+Math.min(...profile).toFixed(1),profileMax:+Math.max(...profile).toFixed(1)});
  assert(futureTurns>=1,`No corners on ${cfg.id}`);
}
console.log(JSON.stringify({version:'V67',result,status:'PASS'},null,2));
