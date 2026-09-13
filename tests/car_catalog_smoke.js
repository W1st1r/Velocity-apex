/* 40-car catalog, asset, economy, save and loadout regression test. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing;
const expected={
  'vw-golf-gti':['basic',3500],'honda-civic-type-r':['basic',6500],'toyota-gt86':['basic',5000],'ford-mustang-gt':['basic',17500],'subaru-wrx-sti':['basic',13500],'bmw-330i':['basic',10000],
  'bmw-m5-f90':['sport',39000],'mercedes-cls-63-amg':['sport',23000],'bmw-m4-competition':['sport',30000],'mercedes-amg-c63-s':['sport',34000],'audi-rs5':['sport',28000],'nissan-gtr-r35':['sport',49000],'chevrolet-corvette-c8':['sport',44000],
  'porsche-911':['premium',95000],'mercedes-amg-gt-63-s':['premium',82000],'bmw-m8-competition':['premium',76000],'bentley-continental-gt':['premium',68000],'aston-martin-vantage':['premium',60000],'maserati-mc20':['premium',88000],
  'audi-r8':['rare',110000],'lamborghini-huracan':['rare',145000],'ferrari-488-gtb':['rare',132000],'mclaren-720s':['rare',165000],'porsche-918-spyder':['rare',235000],'lamborghini-aventador':['rare',185000],'ford-gt':['rare',210000],
  'bugatti-veyron':['legendary',540000],'ferrari-enzo':['legendary',320000],'mclaren-p1':['legendary',470000],'lamborghini-sian':['legendary',410000],'pagani-huayra':['legendary',360000],'koenigsegg-agera-rs':['legendary',610000],'mercedes-benz-slr-mclaren':['legendary',275000],
  'ferrari-laferrari':['lux',720000],'bugatti-chiron-super-sport':['lux',1550000],'bugatti-divo':['lux',1320000],'koenigsegg-jesko':['lux',1850000],'pagani-huayra-bc':['lux',830000],'lamborghini-veneno':['lux',970000],'mercedes-amg-one':['lux',1120000]
};
const ids=Object.keys(expected);assert.equal(ids.length,40);assert.equal(R.REAL_CAR_IDS.length,40);assert.equal(new Set(R.REAL_CAR_IDS).size,40,'IDs must be unique');
assert.deepEqual(new Set(R.REAL_CAR_IDS),new Set(ids),'catalog IDs differ from required list');
const prices=[];const counts={};
for(const id of ids){
  const car=R.LIVERIES[id];assert.ok(car,`missing ${id}`);const [category,price]=expected[id];
  assert.equal(car.category,category,`${id} category`);assert.equal(car.price,price,`${id} price`);prices.push(car.price);counts[category]=(counts[category]||0)+1;
  assert.equal(car.currency,'CR');assert.equal(car.realCar,true);assert.ok(car.sprite,`${id} sprite metadata`);assert.equal(car.sprite.preserveAspectRatio,true,`${id} preserveAspectRatio`);assert.equal(car.sprite.orientation,'nose-right',`${id} sprite orientation`);
  assert.ok(car.sprite.raceScale>=1.15&&car.sprite.raceScale<=1.32,`${id} raceScale`);assert.ok(car.sprite.previewScale>=1.12&&car.sprite.previewScale<=1.30,`${id} previewScale`);assert.ok(car.price>0,`${id} positive price`);
  for(const key of ['src','thumbnail']){const rel=car.sprite[key],abs=path.join(ROOT,'public',rel);assert.ok(fs.existsSync(abs),`${id} missing ${key}: ${rel}`);assert.ok(fs.statSync(abs).size>1500,`${id} empty/tiny ${key}`);assert.equal(rel,rel.toLowerCase(),`${id} asset path must be lowercase`);}
}
assert.deepEqual(counts,{basic:6,sport:7,premium:6,rare:7,legendary:7,lux:7});assert.equal(new Set(prices).size,40,'required car prices should be unique');
assert.deepEqual(R.REAL_CAR_IDS.filter(id=>R.LIVERIES[id].category==='lux'),['ferrari-laferrari','bugatti-chiron-super-sport','bugatti-divo','koenigsegg-jesko','pagani-huayra-bc','lamborghini-veneno','mercedes-amg-one']);
const r8=R.LIVERIES['audi-r8'];assert.equal(r8.brownVisual,true);assert.match(r8.bodyColor,/^#5a3527$/i);assert.equal(r8.primary,'#5a3527');
const porsche=R.LIVERIES['porsche-911'];assert.equal(porsche.name,'Porsche 911 Turbo S');assert.equal(porsche.price,95000);
for(const legacy of ['apexLime','crimsonVelocity','iceVector','auroraPulse'])assert.ok(R.LIVERIES[legacy]?.legacy&&R.LIVERIES[legacy]?.shopHidden,`legacy ${legacy} support missing`);
let old=R.normalizeSave({credits:777,ownedLiveries:['apexLime','crimsonVelocity','porsche-911'],ownedEffects:['standard','redFlame'],selectedLivery:'porsche-911',selectedEffect:'redFlame',bestScore:99,bestLap:1234,maxLaps:8,botCount:13,raceLaps:15,difficulty:'hard',trackId:'neonHarbor',controlMode:'wheel',tiltSensitivity:'high',muted:true});
assert.equal(old.saveVersion,5);assert.equal(old.credits,777);assert.equal(old.selectedLivery,'porsche-911');assert.ok(old.ownedLiveries.includes('crimsonVelocity'));assert.equal(old.bestScore,99);assert.equal(old.bestLap,1234);assert.equal(old.controlMode,'wheel');
let s=R.normalizeSave({credits:1849999});assert.equal(R.shopAction(s,'livery','koenigsegg-jesko'),'insufficient');assert.equal(s.credits,1849999);assert.ok(!s.ownedLiveries.includes('koenigsegg-jesko'));
s=R.normalizeSave({credits:1850000});assert.equal(R.shopAction(s,'livery','koenigsegg-jesko'),'purchased');assert.equal(s.credits,0);assert.ok(s.ownedLiveries.includes('koenigsegg-jesko'));assert.equal(R.shopAction(s,'livery','koenigsegg-jesko'),'selected');assert.equal(s.credits,0,'repeat purchase deducted twice');
assert.ok(R.getCatalogEntries(s,'garage','livery','lux').some(([id])=>id==='koenigsegg-jesko'),'Garage cannot see purchased car');
assert.equal(R.getCatalogEntries(s,'shop','livery','all').length,40,'Shop must show exactly the 40 real cars, not legacy starter entries');
R.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/car.js'),'utf8'),{filename:'js/car.js'});const C=R.Car;
const c=new C();c.setLoadout('mercedes-amg-one','rainbowFlame');assert.equal(c.liveryId,'mercedes-amg-one');assert.equal(c.effect,'rainbowFlame');c.setLoadout('unknown-old-or-bad-id','missing-effect');assert.equal(c.liveryId,'apexLime');assert.equal(c.effect,'standard');
const game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8');assert.ok(game.includes("c.setLoadout(pd.liveryId||'apexLime',pd.effectId||'standard')"),'Online remote loadout path missing');assert.ok(game.includes('R.REAL_CAR_IDS'),'Offline multi-model grid missing');
console.log('car_catalog_smoke: OK (40 cars + assets + saves + purchases + Garage + Online fallback)');
