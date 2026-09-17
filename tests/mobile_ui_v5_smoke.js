/* Mobile UI V5: readable iPhone hub + added free-roam/cases/admin phone coverage. */
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/mobile-ui.css'),'utf8');
assert.ok(html.includes('css/mobile-ui.css?v=20260916-mobile7'),'mobile UI V5 cache-bust missing');
assert.ok(html.includes('js/admin-system.js?v=20260916-admin5'),'admin client cache-bust missing');
for(const token of ['.free-pause-panel,.free-levels-panel,.case-modal','.free-chat-panel','.free-map-panel','.case-open-panel','grid-template-columns:repeat(2,minmax(0,1fr))!important','.owner-admin-assignment input','.menu-screen .menu-tile-copy>span{font-size:7.6px!important'])assert.ok(css.includes(token),'mobile V5 CSS missing '+token);
console.log('mobile_ui_v5_smoke: OK (menu readability + free roam/cases/admin phone coverage)');
