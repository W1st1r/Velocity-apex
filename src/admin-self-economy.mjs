import {CARS} from './car-catalog.mjs';
import {UPGRADE_EFFECT_VALUES as EFFECTS} from './upgrade-config.mjs';
import {CASES} from './case-catalog.mjs';
const catalog=kind=>kind==='car'?CARS:kind==='effect'?EFFECTS:null;
export function adminSelfMutation(save,b){
 const action=b.action,before=Number(save.credits)||0;
 const cleanup=()=>{const owned=new Set(save.ownedLiveries||['apexLime']);for(const key of ['carUpgrades','carCustomizations'])if(save[key])save[key]=Object.fromEntries(Object.entries(save[key]).filter(([id])=>owned.has(id)));};
 const bulk=(kind,grant)=>{const car=kind==='car',key=car?'ownedLiveries':'ownedEffects',selected=car?'selectedLivery':'selectedEffect',fallback=car?'apexLime':'standard';save[key]=grant?Object.keys(catalog(kind)):[fallback];if(!save[key].includes(save[selected]))save[selected]=fallback;cleanup();};
 if(action==='set_credits'||action==='add_credits'){
  const value=b.value;if(!Number.isSafeInteger(value)||action==='set_credits'&&value<0)return {error:'INVALID_AMOUNT'};
  const next=action==='set_credits'?value:before+value;if(!Number.isSafeInteger(next)||next<0)return {error:'INVALID_AMOUNT'};save.credits=next;
 }else if(['grant_all','revoke_extras'].includes(action)){
  if(!catalog(b.kind))return {error:'INVALID_RESOURCE_ACTION'};bulk(b.kind,action==='grant_all');
 }else if(action==='unlock'){
  bulk('car',true);bulk('effect',true);save.caseInventory=Object.fromEntries(Object.keys(CASES).map(id=>[id,10]));
 }else if(action==='reset_inventory'){
  bulk('car',false);bulk('effect',false);save.caseInventory=Object.fromEntries(Object.keys(CASES).map(id=>[id,0]));
 }else if(action==='reset_progress'){
  for(const key of Object.keys(save))delete save[key];Object.assign(save,{saveVersion:6,credits:200,ownedLiveries:['apexLime'],ownedEffects:['standard'],caseInventory:{},selectedLivery:'apexLime',selectedEffect:'standard',careerUnlocked:1,careerCompleted:[],careerBestTimes:{}});
 }else if(action==='case_delta'){
  if(!Object.hasOwn(CASES,b.id)||!Number.isInteger(b.delta)||Math.abs(b.delta)>999)return {error:'INVALID_RESOURCE_ACTION'};
  if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};save.caseInventory[b.id]=Math.max(0,Math.min(999,(Number(save.caseInventory[b.id])||0)+b.delta));
 }else if(['grant','revoke','equip'].includes(action)){
  const c=catalog(b.kind);if(!c||!Object.hasOwn(c,b.id))return {error:'INVALID_RESOURCE_ACTION'};
  const car=b.kind==='car',key=car?'ownedLiveries':'ownedEffects',selected=car?'selectedLivery':'selectedEffect',fallback=car?'apexLime':'standard';save[key]=Array.isArray(save[key])?save[key]:[fallback];
  if(action==='grant')save[key]=[...new Set([...save[key],b.id])];
  else if(action==='revoke'){if(b.id===fallback)return {error:'RESOURCE_PROTECTED'};save[key]=save[key].filter(id=>id!==b.id);if(save[selected]===b.id)save[selected]=fallback;cleanup();}
  else {if(!save[key].includes(b.id))return {error:'ITEM_NOT_OWNED'};save[selected]=b.id;}
 }else return {error:'INVALID_RESOURCE_ACTION'};
 return {status:'applied',action,kind:b.kind||null,id:b.id||null,before,after:Number(save.credits)||0};
}
