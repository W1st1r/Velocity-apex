/* Main menu V65 — Race Control with preserved wiring. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),css=read('public/css/race-control-v65.css'),js=read('public/js/main-menu-ui.js'),game=read('public/js/game.js');
for(const id of ['menu','playBtn','onlineBtn','shopBtn','garageBtn','topupBtn','telegramBanner','accountBtn','friendsBtn','crewBtn','promoBtn','supportBtn','settingsBtn','menuMoreBtn','menuMorePanel','menuCredits','accountMenuStatus','friendsMenuStatus','menuBestScore','menuBestLap','menuMaxLaps','menuMute','referralBtn']){
 assert.equal((html.match(new RegExp(`id=["']${id}["']`,'g'))||[]).length,1,`menu id ${id} must exist exactly once`);
}
for(const token of ['race-control-v65','rc-rail','rc-main','rc-aside','rc-car-holder','rc-action','rc-popover','menu-wallet-section'])assert.ok(html.includes(token),`Race Control section missing ${token}`);
assert.ok(html.includes('id="topupBtn"')&&html.indexOf('id="topupBtn"')>html.indexOf('menu-wallet-section'));
assert.ok(html.indexOf('id="promoBtn"')>html.indexOf('id="menuMorePanel"'));
assert.ok(css.includes('safe-area-inset-right')&&css.includes('grid-template-columns:clamp(102px'));
assert.ok(js.includes('aria-expanded')&&js.includes('VelocityMainMenu')&&js.includes('selectedLivery'));
assert.ok(game.includes('https://t.me/wistirapex'));
assert.ok(html.includes('race-control-v65.css?v=20261013-v65'));
console.log('main_menu_v65_smoke: OK');
