const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/mobile-ui.css'),'utf8');
const admin=fs.readFileSync(path.join(ROOT,'public/js/admin-system.js'),'utf8');
assert.ok(html.includes('css/mobile-ui.css?v=20260917-pause1'),'mobile UI V6 cache-bust missing');
assert.ok(html.includes('css/admin-system.css?v=20260916-admin5'),'admin CSS cache-bust missing');
assert.ok(html.includes('js/admin-system.js?v=20260917-admin-daily2'),'admin JS cache-bust missing');
for(const token of [
  'width:min(860px,calc(100vw - var(--m-safe-l) - var(--m-safe-r) - 8px))',
  'overflow-x:hidden!important',
  '.menu-screen #crewBtn{grid-column:1/-1!important}',
  '.menu-screen .menu-action-row:has(#staffAdminBtn.hidden) #settingsBtn',
  '.admin-system-header>.secondary-btn',
  '#supportTabs{',
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  '#supportContent .support-form{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))',
  '@media (orientation:portrait), (max-width:699px)'
]) assert.ok(css.includes(token),`mobile V6 CSS token missing: ${token}`);
for(const token of ['support-form-${type}','support-target-field','support-category-field','support-description-field','support-evidence-field','support-form-status']) assert.ok(admin.includes(token),`support V6 markup token missing: ${token}`);
assert.ok(html.includes('aria-label="Назад">← НАЗАД</button>'),'compact support/admin back button missing');
console.log('mobile_ui_v6_smoke: OK — dashboard containment, compact support header, 4-tab strip, two-column landscape form, portrait stacking');
