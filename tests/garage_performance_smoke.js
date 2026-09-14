/* Garage preview performance guard: switching cars must not rebuild the full catalog. */
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const garage=fs.readFileSync(path.join(ROOT,'public/js/garage.js'),'utf8');
const car=fs.readFileSync(path.join(ROOT,'public/js/car.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
assert.ok(garage.includes('updatePreviewOnly(mode,id)'), 'fast preview path missing');
assert.ok(garage.includes("if(!action){if(changed)this.updatePreviewOnly(mode,id);return;}"), 'preview click still falls through to full render');
assert.ok(garage.includes("addEventListener('pointerdown'"), 'car prewarm on touch/pointer missing');
assert.ok(garage.includes('scheduleCatalogPreload(entries,mode)'), 'idle catalog preload missing');
assert.ok(car.includes('R.preloadSprite=preloadSprite'), 'shared sprite decode cache/preloader missing');
assert.ok(html.includes('garage.js?v=20260915-007')&&html.includes('car.js?v=20260915-007'), 'cache bust not updated');
console.log('garage_performance_smoke: OK');
