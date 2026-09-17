const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/mobile-ui.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');

assert.ok(game.includes('let sharedTapHandledAt=-Infinity;'),'shared tap guard state missing');
assert.ok(game.includes('performance.now()-sharedTapHandledAt<650'),'cross-button synthetic click suppression missing');
assert.ok(game.includes("e.stopPropagation();return;}handler(e);"),'synthetic click must not reach newly revealed controls');
for(const id of ['shopBtn','garageBtn','loadoutBtn','shopPersonalBtn','shopMarketBtn','shopLandingBackBtn','shopBackBtn','marketBackBtn','garageBackBtn'])
  assert.ok(game.includes(`bindTap($('${id}')`),`phone tap binding missing for ${id}`);
assert.ok(!game.includes("$('shopBtn').addEventListener('click',openShop)"),'legacy click-only shop binding remains');
assert.ok(game.includes("if(state!=='menu'&&state!=='paused'&&!fromOnlinePause)return;"),'settings open state guard missing');
assert.ok(game.includes("settingsReturn=fromOnlinePause?'onlinePaused':state"),'online pause settings return missing');
assert.ok(game.includes("if(settingsReturn==='onlinePaused')"),'online pause settings close path missing');
assert.ok(game.includes("if(state!==mode||!$(mode))return;"),'catalog close state guard missing');

for(const rule of ['.shop-screen.hidden,.settings-screen.hidden,.garage-screen.hidden{display:none!important}',
  '.shop-panel.catalog-panel.hidden{display:none!important}', '#shopMarketPanel.hidden{display:none!important}',
  'grid-template-rows:auto minmax(0,1fr) auto!important', 'overflow-y:auto!important;overflow-x:hidden!important;align-content:start!important'])
  assert.ok(css.includes(rule),`mobile V8 containment rule missing: ${rule}`);
assert.ok(html.includes('mobile7-v8'),'mobile V8 cache bust missing');
console.log('mobile_ui_v8_navigation_store: OK');
