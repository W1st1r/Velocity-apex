import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicConfig,upgradeChanceBps,upgradeRefundCredits} from '../src/upgrade.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('src/upgrade.mjs'),client=read('public/js/garage.js'),html=read('public/index.html'),css=read('public/css/ios-upgrade-v69.css'),style=read('public/css/style.css');
const cfg=publicConfig();
assert.deepEqual([cfg.returnBps,cfg.riskReturnBps,cfg.maxChanceBps,cfg.protectionRefundBps,cfg.accountIndependent],[9600,8000,9500,2500,true]);
assert.deepEqual({...cfg.modes},{standard:{returnBps:9600},risk:{returnBps:8000}});
assert.doesNotMatch(server,/returnBpsForAccount|accountOddsProfile|getProgression/);
assert.match(server,/protection:body\?\.protection===true/);
assert.match(server,/JSON\.stringify\(payload\)/); // persisted in ID-claimed attempt
assert.match(server,/consumeStake\(save,payload\)/);
assert.match(server,/else if\(payload\.protection\)/);
assert.match(server,/refundCredits=Math\.min/);
assert.match(server,/save\.credits=safeCredits\(save\.credits\)\+refundCredits/);
assert.match(server,/return json\(\{ok:true,attempt:publicAttempt\(row\)\}\)/);
assert.match(server,/INSERT OR IGNORE INTO upgrade_attempts/);
assert.match(server,/UPDATE upgrade_attempts SET status='processing' WHERE id=\? AND user_id=\? AND status='claimed'/);
assert.match(html,/id="upgradeProtectionToggle"/);
assert.match(html,/id="upgradeProtectionImpact"/);
assert.match(html,/id="upgradeConfirmWarning"/);
assert.match(client,/protection:u\.protection/);
assert.match(client,/data-upgrade-mode/);
assert.match(client,/mode:u\.mode/);
assert.match(html,/data-upgrade-mode="standard"/);
assert.match(html,/data-upgrade-mode="risk"/);
assert.match(style,/:has\(> \.upgrade-empty\)/);
assert.match(style,/\.upgrade-target-item:has\(> \.upgrade-empty\) > \.upgrade-empty/);
assert.match(style,/\.upgrade-mode-switch button\.selected/);
assert.match(client,/upgradeProtectionToggle.*addEventListener\('change'/);
assert.match(client,/x\.protection\?' · ЗАЩИТА'/);
assert.match(css,/:has\(input:checked\)/);
// Cases span all prices, no account information feeds odds.
for(const target of [10000,100000,9999999])for(let ratio=2;ratio<=99;ratio++){
 const stake=Math.floor(target*ratio/100);if(!stake)continue;
 const normal=upgradeChanceBps(stake,target,false),guarded=upgradeChanceBps(stake,target,true);
 assert.ok(normal>=0&&normal<=9500&&guarded>=0&&guarded<=9500);
 assert.ok(guarded<normal,`protection must have lower success at ${ratio}%`);
 const expected=Math.floor(stake*.96),refund=upgradeRefundCredits(stake,true);
 const valueNormal=(normal*target)/10000;
 const valueProtected=(guarded*target+(10000-guarded)*refund)/10000;
 // Rounding on small stakes introduces subunit differences; no positive exploit.
 assert.ok(valueNormal<=expected+1);
 assert.ok(valueProtected<=expected+1);
 assert.ok(expected-valueProtected<=target/10000+3);
}
assert.equal(upgradeChanceBps(50000,100000,false),4800);
assert.equal(upgradeChanceBps(50000,100000,true),4057);
assert.equal(upgradeChanceBps(50000,100000,false,'risk'),4000);
assert.equal(upgradeChanceBps(50000,100000,true,'risk'),3142);
assert.equal(upgradeRefundCredits(50000,true),12500);
assert.equal(upgradeRefundCredits(50000,false),0);
for(const ticket of [0,999,4056,4057,4799,4800,9999]){
 assert.equal(ticket<upgradeChanceBps(50000,100000,true),ticket<4057);
}
console.log('upgrade_protection_v69_test: universal odds, 25% refund, balanced payout, safe idempotent flow and UI integration passed');
