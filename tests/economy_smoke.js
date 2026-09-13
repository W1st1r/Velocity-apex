/* Velocity Apex economy validation. Run: node tests/economy_smoke.js */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing,assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const expectedPrices={
  livery:{apexLime:0,crimsonVelocity:1400,iceVector:3200,auroraPulse:6500,'porsche-911':40000},
  effect:{standard:0,blueFlame:1100,redFlame:2500,rainbowFlame:5200}
};
for(const [id,price] of Object.entries(expectedPrices.livery))assert(R.LIVERIES[id].price===price,`bad livery price ${id}`);
for(const [id,price] of Object.entries(expectedPrices.effect))assert(R.EFFECTS[id].price===price,`bad effect price ${id}`);

const standard=[1,2,4,8].map(place=>R.raceReward({bots:7,laps:5,difficulty:'medium'},place));
assert(JSON.stringify(standard)===JSON.stringify([343,319,272,178]),`standard rewards ${standard}`);
const lapWins=[3,5,7,10,15].map(laps=>R.raceReward({bots:7,laps,difficulty:'medium'},1));
assert(JSON.stringify(lapWins)===JSON.stringify([217,343,469,658,973]),`lap rewards ${lapWins}`);

const rows=[];
for(const bots of [1,7,13])for(const laps of [3,5,7,10,15])for(const difficulty of ['easy','medium','hard','extreme']){
  const places=[1,Math.ceil((bots+1)/2),bots+1];
  const rewards=places.map(place=>R.raceReward({bots,laps,difficulty},place));
  rewards.forEach((reward,i)=>assert(Number.isFinite(reward)&&reward>=1&&Number.isInteger(reward),`invalid reward ${bots}/${laps}/${difficulty}/${places[i]}=${reward}`));
  assert(rewards[0]>=rewards[1]&&rewards[1]>=rewards[2],`placement order broken ${bots}/${laps}/${difficulty}: ${rewards}`);
  rows.push({bots,laps,difficulty,first:rewards[0],middle:rewards[1],last:rewards[2]});
}
for(const difficulty of ['easy','medium','hard','extreme']){
  const winLaps=[3,5,7,10,15].map(laps=>R.raceReward({bots:7,laps,difficulty},1));
  assert(winLaps.every((v,i)=>i===0||v>winLaps[i-1]),`laps not increasing ${difficulty}: ${winLaps}`);
}
for(const malformed of [null,undefined,{}, {bots:NaN,laps:Infinity,difficulty:'???'}]){
  const reward=R.raceReward(malformed,NaN);assert(Number.isFinite(reward)&&reward>=1,`malformed reward ${reward}`);
}

function fresh(credits=200){return R.normalizeSave({credits});}
let save=fresh(1099);assert(R.shopAction(save,'effect','blueFlame')==='insufficient','insufficient should fail');assert(save.credits===1099,'insufficient changed credits');
save=fresh(1100);assert(R.shopAction(save,'effect','blueFlame')==='purchased','exact-price purchase failed');assert(save.credits===0,'exact-price deduction wrong');assert(save.ownedEffects.includes('blueFlame'),'purchase not owned');
assert(R.shopAction(save,'effect','blueFlame')==='selected','repeat tap should select');assert(save.credits===0,'repeat tap deducted again');assert(save.selectedEffect==='blueFlame','owned item not selectable');
let free=fresh();assert(free.ownedLiveries.includes('apexLime')&&free.ownedEffects.includes('standard'),'free defaults missing');
const old=R.normalizeSave({credits:777,ownedLiveries:['apexLime','crimsonVelocity'],ownedEffects:['standard','redFlame'],selectedLivery:'crimsonVelocity',selectedEffect:'redFlame',bestScore:99,bestLap:1234,maxLaps:8,botCount:13,raceLaps:15,difficulty:'hard',trackId:'neonHarbor',controlMode:'wheel',tiltSensitivity:'high',muted:true});
assert(old.credits===777&&old.ownedLiveries.includes('crimsonVelocity')&&old.ownedEffects.includes('redFlame'),'old ownership/credits lost');
assert(old.selectedLivery==='crimsonVelocity'&&old.selectedEffect==='redFlame','old selection lost');
assert(old.bestScore===99&&old.bestLap===1234&&old.maxLaps===8&&old.botCount===13&&old.raceLaps===15&&old.difficulty==='hard'&&old.trackId==='neonHarbor'&&old.controlMode==='wheel'&&old.tiltSensitivity==='high'&&old.muted===true,'old settings/records lost');


assert(R.LIVERIES.apexLime.category==='regular'&&R.LIVERIES.crimsonVelocity.category==='regular'&&R.LIVERIES.iceVector.category==='regular'&&R.LIVERIES.auroraPulse.category==='regular','existing cars must be regular');
assert(R.LIVERIES['porsche-911'].category==='premium'&&R.LIVERIES['porsche-911'].price===40000,'Porsche premium metadata incorrect');
assert(Object.values(R.LIVERIES).filter(x=>(x.category||'regular')==='sport').length===0,'sport category must stay empty');
let porsche=R.normalizeSave({credits:39999});assert(R.shopAction(porsche,'livery','porsche-911')==='insufficient','Porsche 39999 CR must fail');assert(porsche.credits===39999&&!porsche.ownedLiveries.includes('porsche-911'),'failed Porsche purchase changed state');
porsche=R.normalizeSave({credits:40000});assert(R.shopAction(porsche,'livery','porsche-911')==='purchased','Porsche exact-price purchase failed');assert(porsche.credits===0&&porsche.ownedLiveries.includes('porsche-911'),'Porsche purchase did not deduct/own correctly');
assert(R.shopAction(porsche,'livery','porsche-911')==='selected','owned Porsche must select');assert(porsche.credits===0&&porsche.selectedLivery==='porsche-911','repeat Porsche action deducted or did not select');
const persisted=R.normalizeSave(JSON.parse(JSON.stringify(porsche)));assert(persisted.ownedLiveries.includes('porsche-911')&&persisted.selectedLivery==='porsche-911'&&persisted.credits===0,'Porsche state did not survive normalization');

const afterTwoWins=200+2*R.raceReward({bots:7,laps:5,difficulty:'medium'},1);
assert(afterTwoWins===886&&afterTwoWins<R.EFFECTS.blueFlame.price,'two wins should not buy cheapest item');
const afterThreeWins=200+3*R.raceReward({bots:7,laps:5,difficulty:'medium'},1);
assert(afterThreeWins>=R.EFFECTS.blueFlame.price,'third win should unlock first purchase');
console.log(JSON.stringify({standard,lapWins,afterTwoWins,afterThreeWins,checkedRewardCases:rows.length,prices:expectedPrices},null,2));
