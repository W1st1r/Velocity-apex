/* Velocity Apex economy validation. Run: node tests/economy_smoke.js */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing,assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const expectedSamples={apexLime:0,'vw-golf-gti':2800,'porsche-911':68000,'bugatti-veyron':208000,'aston-martin-valkyrie-mary':280000,'koenigsegg-jesko':310000};
for(const [id,price] of Object.entries(expectedSamples))assert(R.LIVERIES[id].price===Math.round(price*1.25),`bad livery price ${id}`);
for(const [id,price] of Object.entries({standard:0,blueFlame:1100,redFlame:2500,rainbowFlame:5200}))assert(R.EFFECTS[id].price===Math.round(price*1.25),`bad effect price ${id}`);

const standard=[1,2,4,8].map(place=>R.raceReward({bots:7,laps:5,difficulty:'medium'},place));
assert(JSON.stringify(standard)===JSON.stringify([343,319,272,178]),`standard rewards ${standard}`);
const lapWins=[3,5,7,10,15].map(laps=>R.raceReward({bots:7,laps,difficulty:'medium'},1));
assert(JSON.stringify(lapWins)===JSON.stringify([217,343,469,658,973]),`lap rewards ${lapWins}`);

const rows=[];for(const bots of [1,7,13])for(const laps of [3,5,7,10,15])for(const difficulty of ['easy','medium','hard','extreme']){
  const places=[1,Math.ceil((bots+1)/2),bots+1],rewards=places.map(place=>R.raceReward({bots,laps,difficulty},place));rewards.forEach((reward,i)=>assert(Number.isFinite(reward)&&reward>=1&&Number.isInteger(reward),`invalid reward ${bots}/${laps}/${difficulty}/${places[i]}=${reward}`));assert(rewards[0]>=rewards[1]&&rewards[1]>=rewards[2],`placement order broken ${rewards}`);rows.push({bots,laps,difficulty,first:rewards[0],middle:rewards[1],last:rewards[2]});
}
for(const malformed of [null,undefined,{}, {bots:NaN,laps:Infinity,difficulty:'???'}]){const reward=R.raceReward(malformed,NaN);assert(Number.isFinite(reward)&&reward>=1,`malformed reward ${reward}`);}

const byCategory={};for(const id of R.REAL_CAR_IDS){const c=R.LIVERIES[id];(byCategory[c.category]??=[]).push(c.price);}
const order=['basic','sport','premium','rare','legendary','lux'];for(let i=1;i<order.length;i++){const prev=byCategory[order[i-1]],cur=byCategory[order[i]];assert(Math.max(...prev)<Math.min(...cur),`${order[i-1]} must remain cheaper than ${order[i]}`);}
assert(Math.min(...byCategory.lux)>=240000&&Math.max(...byCategory.lux)<=400000,'LUX range must be several hundred thousand, not millions');
// AI benchmark medium average is ~32.06 s/lap across the five bundled tracks. Add 6 s for countdown/UI turnover.
// Use ordinary 4th/5th places, not constant wins, to estimate realistic CR/hour.
const typicalReward=(R.raceReward({bots:7,laps:5,difficulty:'medium'},4)+R.raceReward({bots:7,laps:5,difficulty:'medium'},5))/2;
const typicalRaceSeconds=5*32.058+6,crPerHour=typicalReward*3600/typicalRaceSeconds;
const maryHours=R.LIVERIES['aston-martin-valkyrie-mary'].price/crPerHour,medianLux=[...byCategory.lux].sort((a,b)=>a-b)[Math.floor(byCategory.lux.length/2)]/crPerHour;
assert(maryHours>=50&&maryHours<=65,`Mary progression target ${maryHours.toFixed(1)}h`);assert(medianLux>=50&&medianLux<=65,`median LUX progression target ${medianLux.toFixed(1)}h`);

function fresh(credits=200){return R.normalizeSave({credits});}
let save=fresh(1099);assert(R.shopAction(save,'effect','blueFlame')==='insufficient','insufficient should fail');assert(save.credits===1099,'insufficient changed credits');save=fresh(1375);assert(R.shopAction(save,'effect','blueFlame')==='purchased'&&save.credits===0,'exact-price effect purchase failed');
const old=R.normalizeSave({credits:777,ownedLiveries:['apexLime','crimsonVelocity','porsche-911'],ownedEffects:['standard','redFlame'],selectedLivery:'porsche-911',selectedEffect:'redFlame',bestScore:99,bestLap:1234,maxLaps:8,botCount:13,raceLaps:15,difficulty:'hard',trackId:'neonHarbor',controlMode:'wheel',tiltSensitivity:'high',muted:true});assert(old.credits===777&&old.ownedLiveries.includes('porsche-911')&&old.selectedLivery==='porsche-911','old ownership/selection lost');
let porsche=R.normalizeSave({credits:84999});assert(R.shopAction(porsche,'livery','porsche-911')==='insufficient'&&porsche.credits===84999,'Porsche insufficient failed');porsche=R.normalizeSave({credits:85000});assert(R.shopAction(porsche,'livery','porsche-911')==='purchased'&&porsche.credits===0,'Porsche exact-price purchase failed');
console.log(JSON.stringify({standard,lapWins,typicalReward,crPerHour:+crPerHour.toFixed(1),maryHours:+maryHours.toFixed(1),medianLuxHours:+medianLux.toFixed(1),checkedRewardCases:rows.length,categoryRanges:Object.fromEntries(order.map(k=>[k,[Math.min(...byCategory[k]),Math.max(...byCategory[k])]]))},null,2));
