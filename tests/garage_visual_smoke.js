/* Garage visual integrity: thumbnails/effect swatches/selection feedback. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=global.Racing;R.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/car.js'),'utf8'),{filename:'js/car.js'});
let carAssets=0;
for(const id of R.REAL_CAR_IDS){
  const car=R.LIVERIES[id];
  assert.ok(car?.sprite?.src,`${id}: full sprite missing`);
  assert.ok(car?.sprite?.thumbnail,`${id}: thumbnail missing`);
  for(const src of [car.sprite.src,car.sprite.thumbnail]){
    const disk=path.join(ROOT,'public',src);
    assert.ok(fs.existsSync(disk),`${id}: missing asset ${src}`);
    assert.ok(fs.statSync(disk).size>500,`${id}: suspiciously small asset ${src}`);
    carAssets++;
  }
}
assert.equal(carAssets,R.REAL_CAR_IDS.length*2,'every real car needs full + thumbnail image');
assert.equal(R.normalizeSpriteSrc('assets/cars/test.webp'),'/assets/cars/test.webp','sprite paths must be root-relative for installed PWA routes');
assert.equal(R.normalizeSpriteSrc('/assets/cars/test.webp'),'/assets/cars/test.webp');
const garage=fs.readFileSync(path.join(ROOT,'public/js/garage.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
for(const token of ['catalog-car-thumb','effect-swatch','previewing','item-preview-state','data-equipped'])assert.ok(garage.includes(token),`garage visual token missing: ${token}`);
for(const token of ['.catalog-car-thumb','.effect-swatch','.shop-item.previewing','.item-preview-state','.select-btn.equipped'])assert.ok(css.includes(token),`garage CSS missing: ${token}`);
for(const token of ['grid-auto-rows:max-content','min-height:104px','grid-template-columns:repeat(7,minmax(0,1fr))'])assert.ok(css.includes(token),`garage anti-collapse CSS missing: ${token}`);
assert.ok(garage.includes("assetUrl(reward.thumbnail)"),'case reward car thumbnails must also use stable root URLs');
assert.ok(html.includes('style.css?v=20260915-011')&&html.includes('garage.js?v=20260915-011')&&html.includes('car.js?v=20260915-011'),'garage cache-bust version not bumped');
console.log(`garage_visual_smoke: OK (${R.REAL_CAR_IDS.length} cars, ${carAssets} sprite assets, effect swatches + preview/equipped feedback)`);
