/* Mobile UI V4: phone-first shell, cache bust and main dashboard layout. */
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/mobile-ui.css'),'utf8');
assert.ok(html.includes('css/mobile-ui.css?v=20260916-mobile7'),'mobile UI stylesheet is not loaded last');
assert.ok(html.includes('style.css?v=20260916-adminprefix1'),'base stylesheet cache bust missing');
for(const id of ['playBtn','onlineBtn','crewBtn','shopBtn','garageBtn','accountBtn','friendsBtn','promoBtn','supportBtn','staffAdminBtn','settingsBtn']){
  assert.equal((html.match(new RegExp(`id=["']${id}["']`,'g'))||[]).length,1,`main menu id ${id} missing/duplicated`);
}
for(const token of [
  'grid-template-areas:',
  '"play tools"',
  '.admin-system-panel',
  '.market-panel',
  '#crewDialog',
  '.tuning-modal',
  '.root-console-panel',
  'font-size:16px!important',
  'env(safe-area-inset-bottom)',
  '@media (orientation:landscape) and (max-height:540px)'
]) assert.ok(css.includes(token),`mobile UI CSS missing ${token}`);
console.log('mobile_ui_v4_smoke: OK (dashboard + safe areas + admin/market/crew/tuning/root phone shell)');
