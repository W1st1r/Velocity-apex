/* Main menu V20: clear hierarchy, corner settings and low-frequency More drawer. */
const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/mobile-ui.css'),'utf8');
const js=fs.readFileSync(path.join(ROOT,'public/js/main-menu-ui.js'),'utf8');
const gameJs=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8');
for(const id of ['menu','playBtn','onlineBtn','shopBtn','garageBtn','topupBtn','telegramBanner','accountBtn','friendsBtn','crewBtn','promoBtn','supportBtn','settingsBtn','menuMoreBtn','menuMorePanel','menuCredits','accountMenuStatus','friendsMenuStatus','menuBestScore','menuBestLap','menuMaxLaps','menuMute']){
  const count=(html.match(new RegExp(`id=["']${id}["']`,'g'))||[]).length;
  assert.equal(count,1,`menu id ${id} must exist exactly once`);
}
for(const token of ['menu-card-v20','menu-hero-v20','menu-core-section','menu-wallet-section','menu-telegram-section','menu-community-section','menu-more-panel','menu-footer-v20','НАШ TELEGRAM']){
  assert.ok(html.includes(token),`V20 menu structure missing ${token}`);
}
assert.ok(/id="settingsBtn"[^>]*menu-corner-btn/.test(html),'settings must be a corner icon button');
assert.ok(html.indexOf('id="topupBtn"')>html.indexOf('menu-wallet-section'),'donate must live in wallet section');
assert.ok(html.indexOf('id="promoBtn"')>html.indexOf('id="menuMorePanel"'),'promo must live inside More drawer');
for(const token of ['V20 — MAIN MENU INFORMATION ARCHITECTURE','grid-template-areas:"hero" "play" "core" "wallet" "telegram" "community" "footer"','.menu-screen .menu-corner-btn{','.menu-screen .telegram-banner-btn{','telegramBannerShine','.menu-screen .menu-community-actions{','.menu-screen .menu-more-panel{']){
  assert.ok(css.includes(token),`V20 responsive CSS missing ${token}`);
}
assert.ok(js.includes("$('menuMoreBtn')")&&js.includes('aria-expanded')&&js.includes('VelocityMainMenu'),'More drawer JS missing');
assert.ok(html.includes('НАШ TELEGRAM'),'Telegram banner text missing');
assert.ok(gameJs.includes('https://t.me/wistirapex'),'Telegram channel link missing in game menu JS');
assert.ok(html.includes('menu=20260918-v25'),'main menu stylesheet cache-bust missing');
console.log('main_menu_v20_smoke: OK (play/core/wallet/community hierarchy + settings corner + More drawer)');
