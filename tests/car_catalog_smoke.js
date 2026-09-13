/* 41-car catalog, per-car geometry, asset, save, purchase and offline-bot regression test. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing;
const expectedPrices={
  'vw-golf-gti':2800,'honda-civic-type-r':5200,'toyota-gt86':4200,'ford-mustang-gt':11800,'subaru-wrx-sti':9200,'bmw-330i':7500,
  'bmw-m5-f90':28000,'mercedes-cls-63-amg':16500,'bmw-m4-competition':22000,'mercedes-amg-c63-s':24500,'audi-rs5':19000,'nissan-gtr-r35':36000,'chevrolet-corvette-c8':32000,
  'porsche-911':68000,'mercedes-amg-gt-63-s':57000,'bmw-m8-competition':52000,'bentley-continental-gt':47000,'aston-martin-vantage':43000,'maserati-mc20':62000,
  'audi-r8':78000,'lamborghini-huracan':92000,'ferrari-488-gtb':86000,'mclaren-720s':101000,'porsche-918-spyder':132000,'lamborghini-aventador':112000,'ford-gt':121000,
  'bugatti-veyron':208000,'ferrari-enzo':158000,'mclaren-p1':196000,'lamborghini-sian':184000,'pagani-huayra':172000,'koenigsegg-agera-rs':222000,'mercedes-benz-slr-mclaren':145000,
  'ferrari-laferrari':245000,'bugatti-chiron-super-sport':300000,'bugatti-divo':275000,'koenigsegg-jesko':310000,'pagani-huayra-bc':255000,'lamborghini-veneno':285000,'mercedes-amg-one':265000,'aston-martin-valkyrie-mary':280000
};
const ids=Object.keys(expectedPrices);assert.equal(ids.length,41);assert.equal(R.REAL_CAR_IDS.length,41);assert.equal(new Set(R.REAL_CAR_IDS).size,41,'IDs must be unique');
assert.deepEqual(new Set(R.REAL_CAR_IDS),new Set(ids),'catalog IDs differ from required list');
const counts={},prices=[];
for(const id of ids){
  const car=R.LIVERIES[id];assert.ok(car,`missing ${id}`);assert.equal(car.price,expectedPrices[id],`${id} price`);prices.push(car.price);counts[car.category]=(counts[car.category]||0)+1;
  assert.equal(car.currency,'CR');assert.equal(car.realCar,true);assert.ok(car.sprite,`${id} sprite metadata`);assert.equal(car.sprite.orientation,'nose-right',`${id} orientation`);
  for(const key of ['visualLength','visualWidth','raceScale','previewScale'])assert.ok(Number.isFinite(car.sprite[key])&&car.sprite[key]>0,`${id} invalid ${key}`);
  assert.ok(car.sprite.visualLength/car.sprite.visualWidth>=2.05&&car.sprite.visualLength/car.sprite.visualWidth<=2.70,`${id} implausible visual aspect`);
  assert.ok(car.collision&&Number.isFinite(car.collision.length)&&car.collision.length>0,`${id} collisionLength`);assert.ok(Number.isFinite(car.collision.width)&&car.collision.width>0,`${id} collisionWidth`);
  assert.ok(Number.isFinite(car.collision.offsetX)&&Number.isFinite(car.collision.offsetY),`${id} collision offsets`);
  const drawnL=car.sprite.visualLength*car.sprite.raceScale,drawnW=car.sprite.visualWidth*car.sprite.raceScale;
  assert.ok(car.collision.length<drawnL&&car.collision.length>drawnL*.72,`${id} collision length must stay inside body`);
  assert.ok(car.collision.width<drawnW&&car.collision.width>drawnW*.76,`${id} collision width must stay inside body`);
  for(const key of ['src','thumbnail']){const rel=car.sprite[key],abs=path.join(ROOT,'public',rel);assert.ok(fs.existsSync(abs),`${id} missing ${key}: ${rel}`);assert.ok(fs.statSync(abs).size>1500,`${id} empty/tiny ${key}`);assert.equal(rel,rel.toLowerCase(),`${id} asset path must be lowercase`);}
}
assert.deepEqual(counts,{basic:6,sport:7,premium:6,rare:7,legendary:7,lux:8});assert.equal(new Set(prices).size,41,'real-car prices should be unique');
const luxIds=R.REAL_CAR_IDS.filter(id=>R.LIVERIES[id].category==='lux');assert.ok(luxIds.includes('aston-martin-valkyrie-mary')&&luxIds.length===8,'Mary/LUX catalog mismatch');
for(const id of ['bugatti-veyron','bugatti-chiron-super-sport','bugatti-divo'])assert.ok(R.LIVERIES[id].sprite.visualLength/R.LIVERIES[id].sprite.visualWidth>=2.20,`${id} still too square`);
const mary=R.LIVERIES['aston-martin-valkyrie-mary'];assert.equal(mary.name,'Mary');assert.equal(mary.category,'lux');assert.equal(mary.price,280000);assert.equal(mary.bodyColor.toLowerCase(),'#ff3fae');
const r8=R.LIVERIES['audi-r8'];assert.equal(r8.brownVisual,true);assert.match(r8.bodyColor,/^#5a3527$/i);
for(const legacy of ['apexLime','crimsonVelocity','iceVector','auroraPulse'])assert.ok(R.LIVERIES[legacy]?.legacy&&R.LIVERIES[legacy]?.shopHidden,`legacy ${legacy} support missing`);
let old=R.normalizeSave({credits:777,ownedLiveries:['apexLime','crimsonVelocity','porsche-911'],ownedEffects:['standard','redFlame'],selectedLivery:'porsche-911',selectedEffect:'redFlame',bestScore:99,bestLap:1234,maxLaps:8,botCount:13,raceLaps:15,difficulty:'hard',trackId:'neonHarbor',controlMode:'wheel',tiltSensitivity:'high',muted:true});
assert.equal(old.saveVersion,5);assert.equal(old.credits,777);assert.equal(old.selectedLivery,'porsche-911');assert.ok(old.ownedLiveries.includes('crimsonVelocity'));assert.equal(old.bestScore,99);assert.equal(old.bestLap,1234);
let s=R.normalizeSave({credits:mary.price});assert.equal(R.shopAction(s,'livery','aston-martin-valkyrie-mary'),'purchased');assert.equal(s.credits,0);assert.ok(s.ownedLiveries.includes('aston-martin-valkyrie-mary'));
assert.equal(R.shopAction(s,'livery','aston-martin-valkyrie-mary'),'selected');assert.equal(s.selectedLivery,'aston-martin-valkyrie-mary');s=R.normalizeSave(JSON.parse(JSON.stringify(s)));assert.ok(s.ownedLiveries.includes('aston-martin-valkyrie-mary')&&s.selectedLivery==='aston-martin-valkyrie-mary','Mary save normalization failed');
assert.ok(R.getCatalogEntries(s,'garage','livery','lux').some(([id])=>id==='aston-martin-valkyrie-mary'),'Mary missing from Garage');assert.equal(R.getCatalogEntries(s,'shop','livery','all').length,41,'Shop must show 41 real cars only');
R.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/car.js'),'utf8'),{filename:'js/car.js'});const C=R.Car;
for(const id of ids){const c=new C();c.setLoadout(id,'standard');const meta=R.LIVERIES[id].collision;assert.equal(c.collisionLength,meta.length,`${id} setLoadout length`);assert.equal(c.collisionWidth,meta.width,`${id} setLoadout width`);assert.equal(c.collisionOffsetY,meta.offsetY,`${id} setLoadout lateral offset`);assert.ok(Math.abs(c.collisionRadius-Math.hypot(meta.length*.5,meta.width*.5))<1e-9,`${id} collisionRadius not recalculated`);}
const offsetCar=new C();offsetCar.x=10;offsetCar.y=20;offsetCar.angle=Math.PI/2;offsetCar.collisionOffsetX=3;offsetCar.collisionOffsetY=4;const obb=R.getCarOBB(offsetCar);assert.ok(Math.abs(obb.cx-6)<1e-9&&Math.abs(obb.cy-23)<1e-9,'OBB must apply longitudinal + lateral offsets');
const game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8');assert.ok(game.includes("c.setLoadout(pd.liveryId||'apexLime',pd.effectId||'standard')"),'Online remote loadout path missing');
const createCars=game.slice(game.indexOf('function createCars()'),game.indexOf('function createOnlineCars'));assert.ok(createCars.includes("c.setLoadout('apexLime','standard')"),'offline bots must use apexLime');assert.ok(!createCars.includes('R.REAL_CAR_IDS'),'offline bots must not select real-car catalog');assert.ok(createCars.includes('setPaintOverride'),'offline bot paint override missing');
const paintsMatch=game.match(/const OFFLINE_BOT_PAINTS=Object\.freeze\((\[[\s\S]*?\])\);/);assert.ok(paintsMatch,'offline paint palette missing');const paints=vm.runInNewContext(paintsMatch[1]);assert.ok(paints.length>=13&&new Set(paints.map(x=>x[0].toLowerCase())).size>=13,'13 offline bots need distinct primary colors');
console.log('car_catalog_smoke: OK (41 cars + Mary + geometry + OBB + saves + offline bot loadout)');
