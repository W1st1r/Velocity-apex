/* Static regression checks for iPhone/iOS interaction hardening. */
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
const game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8');
const online=fs.readFileSync(path.join(ROOT,'public/js/online.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');

for(const selector of ['#app button,','#app button *,','#app [role="slider"] *,','#app [data-item] *'])
  assert.ok(css.includes(selector),`missing hardened action-surface selector: ${selector}`);
for(const property of ['-webkit-user-select:none !important;','user-select:none !important;','-webkit-touch-callout:none !important;','-webkit-tap-highlight-color:transparent !important;','-webkit-user-drag:none !important;'])
  assert.ok(css.includes(property),`missing iOS interaction property: ${property}`);
assert.ok(css.includes('#app [contenteditable="true"] *'), 'contenteditable descendants must opt back into selection');
assert.ok(css.includes('.track-carousel { touch-action:pan-x; }'), 'horizontal carousel pan must remain enabled');
assert.ok(css.includes('.shop-panel,.settings-panel,.root-console-panel { touch-action:pan-y; }'), 'panel vertical pan must remain enabled');
assert.ok(css.includes('.control-btn { touch-action: none;')||css.includes('.control-btn { touch-action:none;'), 'race controls must keep touch-action:none');

for(const type of ['selectstart','dragstart','contextmenu','dblclick'])assert.ok(game.includes(`'${type}'`),`guard missing ${type}`);
assert.ok(!/for\(const type of \[[^\]]*'touch(?:start|end)'/.test(game), 'app interaction guard must not globally cancel touchstart/touchend');
assert.ok(game.includes("querySelectorAll('img,svg')"), 'native image/SVG drag hardening missing');
assert.ok(online.includes('navigator.clipboard.writeText'), 'ONLINE room-code programmatic copy must remain intact');
for(const id of ['leftBtn','rightBtn','gasBtn','brakeBtn','steeringWheel','pauseBtn','continueBtn','onlineCopyCode','onlineRoomCode'])
  assert.ok(html.includes(`id="${id}"`),`missing protected UI element ${id}`);
console.log('interaction_guard_smoke: OK');
