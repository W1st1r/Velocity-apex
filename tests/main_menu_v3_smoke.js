/* Main menu V3: stable layout hooks and all existing JS IDs preserved. */
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
for(const id of ['menu','playBtn','onlineBtn','shopBtn','garageBtn','accountBtn','friendsBtn','promoBtn','settingsBtn','menuCredits','accountMenuStatus','friendsMenuStatus','menuBestScore','menuBestLap','menuMaxLaps','menuMute']){
  const count=(html.match(new RegExp(`id=["']${id}["']`,'g'))||[]).length;
  assert.equal(count,1,`menu id ${id} must exist exactly once`);
}
for(const token of ['menu-hero','menu-section-head','menu-primary-copy','menu-tile','menu-tile-icon','menu-tile-copy','menu-footer']){
  assert.ok(html.includes(token),`menu structure missing ${token}`);
}
for(const token of [
  '.menu-screen .menu-action-row{',
  'grid-template-columns:repeat(3,minmax(0,1fr))',
  'text-overflow:ellipsis',
  '.menu-tile-copy>strong',
  '@media(max-height:470px)',
  '@media(max-width:520px)'
]) assert.ok(css.includes(token),`menu responsive CSS missing ${token}`);
assert.ok(html.includes('style.css?v=20260916-adminprefix1'),'main menu stylesheet cache-bust missing');
console.log('main_menu_v3_smoke: OK (structured 2x3 tools, truncation, compact landscape breakpoints)');
