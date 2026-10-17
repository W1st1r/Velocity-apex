import {CASES} from './case-catalog.mjs';

function secureTicket(){
  const range=0x100000000,limit=range-(range%10000),bytes=new Uint32Array(1);let value;
  do{crypto.getRandomValues(bytes);value=bytes[0];}while(value>=limit);
  return value%10000;
}
export function duplicateCompensation(price){const raw=Math.max(0,(Number(price)||0)*.35),step=raw<10000?50:100;return Math.max(step,Math.round(raw/step)*step);}

// Mutates only a server-loaded save. rng is injected exclusively for deterministic tests.
export function openCaseBatch(save,caseId,quantity,{rng=null}={}){
  const box=CASES[caseId];if(!box)return {error:'INVALID_CASE'};
  const inventory=save.caseInventory&&typeof save.caseInventory==='object'&&!Array.isArray(save.caseInventory)?save.caseInventory:(save.caseInventory={});
  const owned=Math.max(0,Math.floor(Number(inventory[caseId])||0)),count=Math.min(quantity,owned);
  if(count<1)return {error:'NO_CASES'};
  const results=[];
  for(let i=0;i<count;i++){
    let ticket=rng?Math.max(0,Math.min(9999,Math.floor(Number(rng())*10000))):secureTicket(),reward=box.rewards.at(-1);
    for(const candidate of box.rewards){if(ticket<candidate.chanceBps){reward=candidate;break;}ticket-=candidate.chanceBps;}
    inventory[caseId]=Math.max(0,Math.floor(Number(inventory[caseId])||0)-1);
    const key=reward.kind==='livery'?'ownedLiveries':'ownedEffects';if(!Array.isArray(save[key]))save[key]=[];
    const duplicate=save[key].includes(reward.id),compensation=duplicate?duplicateCompensation(reward.price):0;
    if(duplicate)save.credits=Math.min(999999999,Math.max(0,Math.floor(Number(save.credits)||0))+compensation);else save[key].push(reward.id);
    results.push({status:'opened',caseId,reward,duplicate,compensation,chanceBps:reward.chanceBps,remaining:inventory[caseId]});
  }
  return {results,opened:results.length,remaining:Math.max(0,Math.floor(Number(inventory[caseId])||0))};
}
