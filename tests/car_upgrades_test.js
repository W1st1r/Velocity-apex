const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
global.window=global;window.Racing={};
for(const file of ['content','racing-line','track','car'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'));
const R=Racing,ids=Object.keys(R.LIVERIES);
const flat={roadWidth:220,theme:{drag:1},samples:[{tx:1,ty:0,nx:0,ny:1}],nearest(x,y){return {index:0,progress:0,signed:0,tx:1,ty:0,nx:0,ny:1,x,y:0,curve:0}}};
function run(id,save,brake=false){const c=new R.Car({player:true});R.applyCarPerformance(c,id,save);if(brake){c.vx=250;c.speed=250;}for(let i=0;i<(brake?30:1200);i++)c.update(1/120,{steer:0,throttle:brake?0:1,brake:brake?1:0},flat);return c;}
let checked=0;
for(const id of ids){
 const s=R.normalizeSave({ownedLiveries:[id],credits:1e9});let total=0;
 for(const key of Object.keys(R.UPGRADE_TYPES)){
  let previous=0;
  for(let level=0;level<5;level++){
   const cost=R.getUpgradeCost(id,key,level);assert(cost>previous);previous=cost;
   assert.equal(R.buyCarUpgrade(s,id,key,level).status,'purchased');total+=cost;
   const before=s.credits;assert.notEqual(R.buyCarUpgrade(s,id,key,level).status,'purchased');assert.equal(s.credits,before);
  }
  assert.equal(R.buyCarUpgrade(s,id,key,5).status,'max');
 }
 assert.equal(s.credits,1e9-total);assert.deepEqual(R.normalizeSave(JSON.parse(JSON.stringify(s))).carUpgrades,s.carUpgrades);
 const base=run(id,null),tuned=run(id,s);assert(tuned.x>base.x&&tuned.speed>base.speed,id+' acceleration');assert(run(id,s,true).speed<run(id,null,true).speed,id+' brakes');assert(tuned.maxSpeed<650&&tuned.speed<=650,id+' network cap');
 for(const key of Object.keys(R.UPGRADE_TYPES)){const only=R.normalizeSave({ownedLiveries:[id],credits:1e9});for(let n=0;n<5;n++)R.buyCarUpgrade(only,id,key,n);const car=run(id,only);if(key==='speed')assert(car.speed>base.speed,id+' speed-only gain');}
 checked++;
}
const poor=R.normalizeSave({credits:0}),before=JSON.stringify(poor);assert.equal(R.buyCarUpgrade(poor,'apexLime','speed',0).status,'insufficient');assert.equal(JSON.stringify(poor),before);
assert.equal(R.buyCarUpgrade(poor,'porsche-911','speed',0).status,'invalid');assert.equal(R.buyCarUpgrade(poor,'__proto__','speed',0).status,'invalid');assert.equal(R.buyCarUpgrade(poor,'apexLime','__proto__',0).status,'invalid');
const bad=R.normalizeSave({carUpgrades:{apexLime:{speed:99,acceleration:-5,brakes:NaN},'porsche-911':{speed:5}}});assert.deepEqual(bad.carUpgrades,{apexLime:{speed:5,acceleration:0,brakes:0}});
const isolated=R.normalizeSave({credits:1e6,ownedLiveries:['vw-golf-gti','porsche-911']});R.buyCarUpgrade(isolated,'vw-golf-gti','speed',0);assert.equal(R.getUpgradeLevels(isolated,'porsche-911').speed,0);assert.equal(R.getUpgradeLevels(isolated,'apexLime').speed,0);
for(const category of R.CAR_CATEGORY_ORDER.filter(x=>x!=='all')){const group=ids.filter(id=>R.LIVERIES[id].category===category).sort((a,b)=>R.LIVERIES[a].price-R.LIVERIES[b].price);for(let i=1;i<group.length;i++)assert(R.getCarPerformance(group[i]).maxSpeed>=R.getCarPerformance(group[i-1]).maxSpeed);}
console.log('Car tuning: '+checked+' cars; 15 purchases each, persistence, isolation, insufficient funds, stale purchases, physical gains and online speed limit OK');
