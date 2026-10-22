import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/js/account.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/css/ui-polish-v2.css',import.meta.url),'utf8');
for(const id of ['accountForgotPassword','authGateForgot','accountEmailForm','accountRecoveryEmail','accountRecoveryCurrentPassword','passwordRecovery','passwordRecoveryRequestForm','passwordRecoveryResetForm','passwordRecoveryVerifySubmit'])assert.match(html,new RegExp(`id="${id}"`),`missing UI element ${id}`);
for(const path of ['/api/auth/password/reset/request','/api/auth/password/reset/complete','/api/auth/email/attach','/api/auth/email/verify'])assert.ok(js.includes(path),`missing handler for ${path}`);
assert.match(js,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/,'recovery token fragment is removed from the address bar');
assert.match(js,/pageshow/,'account state refreshes when restored from the PWA page cache');
assert.match(js,/setTimeout\(\(\)=>controller\.abort\(\),15000\)/,'network-bound account actions time out');
assert.doesNotMatch(js,/localStorage\.(?:setItem|getItem)\([^\n]*recoveryToken/i,'recovery tokens are not persisted in browser storage');
assert.match(css,/100dvh/);assert.match(css,/--safe-t/);assert.match(css,/--safe-b/);assert.match(css,/font-size:16px/,'mobile email inputs avoid Safari zoom');
console.log('account_recovery_ui_v2_test OK: entry points, forms, deep-link token hygiene, PWA restore, network timeout and iOS layout');
