/* Velocity Apex case economy + persistence + UI smoke tests. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing;
assert.deepEqual(R.CASE_ORDER,['all','basic','sport','premium','rare','legendary','lux','effects']);
for(const id of R.CASE_ORDER){
  const box=R.CASES[id];assert.ok(box,`missing case ${id}`);assert.ok(box.price>0,`${id} price`);assert.ok(box.rewards.length>0,`${id} rewards`);
  assert.equal(box.rewards.reduce((sum,x)=>sum+x.chanceBps,0),10000,`${id} odds must total 100.00%`);
  assert.ok(box.rewards.every(x=>x.chanceBps>=1),`${id} zero-probability reward`);
  const ev=box.rewards.reduce((sum,x)=>sum+x.price*x.chanceBps/10000,0);assert.ok(box.price>ev,`${id} case price must exceed expected gross item value`);
}
assert.equal(R.CASES.all.rewards.length,48,'general case must contain 41 cars + 7 paid effects');
for(const id of ['basic','sport','premium','rare','legendary','lux'])assert.ok(R.CASES[id].rewards.every(x=>x.kind==='livery'&&x.category===id),`${id} case category leak`);
assert.ok(R.CASES.effects.rewards.every(x=>x.kind==='effect'&&x.price>0),'effects case must contain paid effects only');
const allLux=R.CASES.all.rewards.filter(x=>x.category==='lux');assert.equal(allLux.length,8);assert.ok(allLux.every(x=>x.chanceBps<=8),`general LUX should stay ultra-rare: ${allLux.map(x=>x.chanceBps)}`);
const allLegendary=R.CASES.all.rewards.filter(x=>x.category==='legendary');assert.ok(allLegendary.every(x=>x.chanceBps<=14),'general legendary odds too generous');
const cheapest=R.CASES.basic.rewards.reduce((a,b)=>a.price<b.price?a:b),priciest=R.CASES.basic.rewards.reduce((a,b)=>a.price>b.price?a:b);assert.ok(cheapest.chanceBps>priciest.chanceBps,'higher price should mean lower chance in category case');
let save=R.normalizeSave({credits:R.CASES.basic.price-1});const before=save.credits;assert.equal(R.buyCase(save,'basic'),'insufficient');assert.equal(save.credits,before);assert.equal(save.caseInventory.basic,0);
save=R.normalizeSave({credits:R.CASES.basic.price});assert.equal(R.buyCase(save,'basic'),'purchased');assert.equal(save.credits,0);assert.equal(save.caseInventory.basic,1);
const first=R.CASES.basic.rewards[0];let result=R.openCase(save,'basic',()=>0);assert.equal(result.status,'opened');assert.equal(result.reward.id,first.id);assert.equal(save.caseInventory.basic,0);assert.ok(save.ownedLiveries.includes(first.id));assert.equal(result.duplicate,false);
save.credits=R.CASES.basic.price;assert.equal(R.buyCase(save,'basic'),'purchased');const creditAfterBuy=save.credits;result=R.openCase(save,'basic',()=>0);assert.equal(result.duplicate,true);assert.equal(result.compensation,R.caseDuplicateCompensation(first.price));assert.equal(save.credits,creditAfterBuy+result.compensation);
const legacy=R.normalizeSave({credits:777,ownedLiveries:['apexLime','porsche-911'],ownedEffects:['standard','redFlame'],selectedLivery:'porsche-911',selectedEffect:'redFlame'});assert.equal(legacy.saveVersion,6);assert.equal(legacy.caseInventory.all,0);assert.ok(legacy.ownedLiveries.includes('porsche-911'));assert.equal(legacy.selectedEffect,'redFlame');
const persisted=R.normalizeSave(JSON.parse(JSON.stringify({...legacy,caseInventory:{...legacy.caseInventory,lux:3,effects:2}})));assert.equal(persisted.caseInventory.lux,3);assert.equal(persisted.caseInventory.effects,2);
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),garage=fs.readFileSync(path.join(ROOT,'public/js/garage.js'),'utf8'),css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
for(const token of ['data-tab="case"','id="caseModal"','id="caseRewardList"','id="caseOpenBtn"','id="caseRollStrip"'])assert.ok(html.includes(token),`missing case UI ${token}`);
for(const token of ['R.buyCase','R.openCase','spinActiveCase','translate3d','caseRewardList'])assert.ok(garage.includes(token),`missing case behavior ${token}`);
for(const token of ['.case-card','.case-modal','.case-roll-strip','@keyframes caseFloat','prefers-reduced-motion'])assert.ok(css.includes(token),`missing case styling ${token}`);
console.log(JSON.stringify({prices:Object.fromEntries(R.CASE_ORDER.map(id=>[id,R.CASES[id].price])),generalLuxOdds:allLux.map(x=>x.chanceBps/100),duplicateRate:0.35},null,2));
