/* V28: Free Roam pause hardening + garage system resale at 70%. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing,id='porsche-911';
const save=R.normalizeSave({credits:1234,ownedLiveries:['apexLime',id],selectedLivery:id});
save.carUpgrades[id]={speed:2,acceleration:1,brakes:1};
save.carCustomizations[id]={colorId:'obsidian',vinylId:'racing-stripe',ownedColors:['stock','obsidian'],ownedVinyls:['none','racing-stripe']};
const upgradeValue=R.getUpgradeCost(id,'speed',0)+R.getUpgradeCost(id,'speed',1)+R.getUpgradeCost(id,'acceleration',0)+R.getUpgradeCost(id,'brakes',0);
const appearanceValue=R.getPaintCost(id,'obsidian')+R.getVinylCost(id,'racing-stripe');
const expectedTotal=R.LIVERIES[id].price+upgradeValue+appearanceValue;
const quote=R.getCarInvestmentValue(save,id);
assert.equal(quote.status,'ok');
assert.equal(quote.total,expectedTotal,'sale total must include car + all permanent tuning');
assert.equal(quote.payout,Math.floor(expectedTotal*.70),'system payout must be exactly 70%');
const beforeCredits=save.credits,result=R.sellOwnedCar(save,id,quote.payout);
assert.equal(result.status,'sold');
assert.equal(save.credits,beforeCredits+quote.payout);
assert.equal(save.ownedLiveries.includes(id),false,'sold car remained owned');
assert.equal(save.carUpgrades[id],undefined,'sold car upgrades were not removed');
assert.equal(save.carCustomizations[id],undefined,'sold car customization was not removed');
assert.equal(save.selectedLivery,'apexLime','selected sold car must fall back to starter');
assert.equal(R.sellOwnedCar(save,'apexLime').status,'protected','starter car must never be sellable');

const free=fs.readFileSync(path.join(ROOT,'public/js/freeroam.js'),'utf8');
assert.ok(free.includes('const driftActive=handbrake>.05&&car.speed>28;'),'free roam drift must require active handbrake input');
assert.ok(!free.includes('car.speed>92&&throttle>.5&&Math.abs(steer)>.82'),'hard steering/throttle must not auto-trigger drift');
assert.ok(!free.includes('state.driftPhysicsTime'),'drift grace timer must be removed so HB release restores grip immediately');
assert.ok(free.includes('if(inDrift&&car.speed>55&&input.handbrake){'),'local drift record must require handbrake');

const garage=fs.readFileSync(path.join(ROOT,'public/js/garage.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
assert.ok(garage.includes('ДА, ПРОДАТЬ')&&garage.includes('НЕТ')&&garage.includes('R.sellOwnedCar'),'garage sell confirmation flow missing');
assert.ok(garage.includes('ПРОДАТЬ · ${formatCredits(quote?.payout||0)} CR'),'garage card resale value missing');
assert.ok(css.includes('.garage-sell-modal')&&css.includes('.sell-btn'),'garage resale mobile styling missing');
assert.ok(free.includes('function bindPauseTap(el,handler)'),'Free Roam pause buttons must use safe tap binding');
assert.ok(free.includes('lockPauseTaps(750)'),'editor close must guard against iOS click retargeting');
assert.ok(free.includes("open?.({source:'freeRoam'})"),'Free Roam control editor source must be explicit');
assert.ok(css.includes('.free-pause-actions{display:grid'),'Free Roam pause actions must use aligned grid');

assert.ok(html.includes('garage.js?v=20260918-v28')&&html.includes('freeroam.js?v=20260920-v49')&&html.includes('content.js?v=20260921-v63'),'V28 cache bust missing');
console.log('garage_sell_freeroam_v26_test: OK');
