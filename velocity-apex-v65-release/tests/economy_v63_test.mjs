import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CARS} from '../src/car-catalog.mjs';
import {PAYMENT_PACKAGES} from '../src/payments.mjs';
import {UPGRADE_EFFECT_VALUES} from '../src/upgrade-config.mjs';

const context={window:{}};context.window.window=context.window;vm.createContext(context);
vm.runInContext(readFileSync(new URL('../public/js/content.js',import.meta.url),'utf8'),context);
const R=context.window.Racing;
assert.equal(R.ECONOMY_VERSION,63);
assert.deepEqual({...R.ECONOMY_V63_CAR_MULTIPLIERS},{basic:1.15,sport:1.30,premium:1.45,rare:1.70,legendary:1.95,lux:2.20});
assert.equal(R.ECONOMY_V63_EFFECT_MULTIPLIER,1.40);

const samples=[
  ['vw-golf-gti','basic',5500,6250],
  ['bmw-m5-f90','sport',56000,72750],
  ['porsche-911','premium',144500,209500],
  ['audi-r8','rare',170500,290000],
  ['bugatti-veyron','legendary',481000,938000],
  ['apollo-evo','lux',795000,1749000]
];
for(const [id,category,oldPrice,newPrice] of samples){
  assert.equal(R.LIVERIES[id].category,category);
  assert.equal(R.LIVERIES[id].economyV62Price,oldPrice);
  assert.equal(R.LIVERIES[id].price,newPrice);
  assert.equal(CARS[id].price,newPrice,'server/client price mismatch for '+id);
}
for(const [id,item] of Object.entries(CARS)){assert.ok(R.LIVERIES[id],'missing client catalog '+id);assert.equal(item.price,R.LIVERIES[id].price,'server/client price mismatch for '+id);}

for(const id of R.CASE_ORDER){
  const box=R.CASES[id];
  assert.ok(box.price>0&&box.expectedValue>0);
  assert.equal(box.rewards.reduce((a,r)=>a+r.chanceBps,0),10000,'case odds changed for '+id);
  for(const r of box.rewards){
    const source=r.kind==='livery'?R.LIVERIES[r.id]:R.EFFECTS[r.id];
    assert.equal(r.price,source.price,'stale reward price in '+id+':'+r.id);
  }
}

const expectedPacks=[
  ['cr_5000',99,17000],['cr_12000',199,40000],['cr_35000',499,120000],['cr_80000',999,270000],['cr_180000',1990,600000]
];
assert.deepEqual(PAYMENT_PACKAGES.map(p=>[p.id,p.rub,p.credits]),expectedPacks);
assert.equal(PAYMENT_PACKAGES.at(-1).rub,1990);
assert.equal(PAYMENT_PACKAGES.at(-1).credits,600000);
for(const [id,item] of Object.entries(UPGRADE_EFFECT_VALUES))assert.equal(item.price,R.EFFECTS[id].price,'server/client effect price mismatch for '+id);

console.log('economy_v63_test: OK — tiered cars/services/effects/cases + 600k CR top donation');
