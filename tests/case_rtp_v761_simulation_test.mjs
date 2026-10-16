import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={window:{}};context.window.window=context.window;vm.createContext(context);
vm.runInContext(readFileSync(new URL('../public/js/content.js',import.meta.url),'utf8'),context);
const R=context.window.Racing;
function seeded(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const result={};
for(const [index,id] of R.CASE_ORDER.entries()){
  const box=R.CASES[id],roll=seeded(0x76f100+index),samples=100000;
  let total=0;
  for(let i=0;i<samples;i++){
    let ticket=Math.floor(roll()*10000),reward=box.rewards.at(-1);
    for(const candidate of box.rewards){if(ticket<candidate.chanceBps){reward=candidate;break;}ticket-=candidate.chanceBps;}
    total+=reward.price;
  }
  const theoretical=box.expectedValue/box.price,observed=total/samples/box.price;
  assert.ok(Math.abs(observed-theoretical)<.012,`${id}: observed ${(observed*100).toFixed(2)}% vs expected ${(theoretical*100).toFixed(2)}%`);
  result[id]={samples,price:box.price,expectedValue:box.expectedValue,theoreticalRtpPct:+(theoretical*100).toFixed(2),sampleRtpPct:+(observed*100).toFixed(2)};
}
console.log('case_rtp_v761_simulation_test: deterministic 800k reward draw checks passed\n'+JSON.stringify(result,null,2));
