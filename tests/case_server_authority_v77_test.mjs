import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CASES,CASE_ORDER} from '../src/case-catalog.mjs';
import {duplicateCompensation,openCaseBatch} from '../src/economy.mjs';
import {GARAGE_ECONOMY} from '../src/tuning-catalog.mjs';

const context={window:{}};context.window.window=context.window;vm.createContext(context);
vm.runInContext(readFileSync(new URL('../public/js/content.js',import.meta.url),'utf8'),context);
const client=context.window.Racing;
assert.deepEqual(CASE_ORDER,['all','basic','sport','premium','rare','legendary','lux','effects']);
for(const id of CASE_ORDER){
  assert.equal(CASES[id].price,client.CASES[id].price,`${id} server price must match client display`);
  assert.equal(CASES[id].expectedValue,client.CASES[id].expectedValue,`${id} expected value drift`);
  assert.equal(CASES[id].rewards.reduce((sum,x)=>sum+x.chanceBps,0),10000,`${id} odds must sum to 100%`);
  assert.deepEqual(CASES[id].rewards.map(x=>[x.kind,x.id,x.price,x.chanceBps]),Array.from(client.CASES[id].rewards,x=>[x.kind,x.id,x.price,x.chanceBps]));
  const save={credits:1000,caseInventory:{[id]:2},ownedLiveries:[],ownedEffects:[]};
  const opened=openCaseBatch(save,id,2,{rng:()=>0});
  assert.equal(opened.results.length,2);assert.equal(save.caseInventory[id],0);assert.equal(opened.results[0].reward.id,CASES[id].rewards[0].id);
  assert.equal(opened.results[0].chanceBps,CASES[id].rewards[0].chanceBps);
}
for(const id of client.REAL_CAR_IDS){
  const cfg=GARAGE_ECONOMY.cars[id];assert.ok(cfg,`missing server garage config ${id}`);
  for(const key of Object.keys(client.UPGRADE_TYPES))for(let level=0;level<5;level++)assert.equal(cfg.upgradeCosts[key][level],client.getUpgradeCost(id,key,level),`${id} ${key} upgrade pricing drift`);
  for(const color of client.CAR_COLORS)assert.equal(cfg.paintCosts[color.id],client.getPaintCost(id,color.id),`${id} ${color.id} paint price drift`);
  for(const vinyl of client.VINYLS)assert.equal(cfg.vinylCosts[vinyl.id],client.getVinylCost(id,vinyl.id),`${id} ${vinyl.id} vinyl price drift`);
}
const caseId=CASE_ORDER[0],reward=CASES[caseId].rewards[0],save={credits:0,caseInventory:{[caseId]:2},ownedLiveries:[],ownedEffects:[]};
const value=(reward.price*.0001);
const first=openCaseBatch(save,caseId,1,{rng:()=>0});assert.equal(first.results[0].duplicate,false);
const balance=save.credits;const second=openCaseBatch(save,caseId,1,{rng:()=>0});assert.equal(second.results[0].duplicate,true);
assert.equal(save.credits-balance,duplicateCompensation(reward.price));
assert.equal(duplicateCompensation(reward.price),Math.max(50,Math.round(reward.price*.35/(reward.price*.35<10000?50:100))*(reward.price*.35<10000?50:100)));
console.log('case_server_authority_v77_test: server case catalog parity, full odds, multi-open and duplicate compensation passed');
