import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {publicConfig,upgradeChanceBps} from '../src/upgrade.mjs';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html');
const garage=read('public/js/garage.js');
const css=read('public/css/style.css');
const worker=read('src/worker.mjs');
const upgrade=read('src/upgrade.mjs');
const logs=read('src/logs.mjs');
const owner=read('public/js/owner-panel.js');
const migration=read('migrations/0017_upgrade.sql');
const upgradeConfig=read('src/upgrade-config.mjs');

// Garage UI + compact iPhone layout.
assert.match(html,/data-tab="upgrade"[^>]*>UPGRADE</);
for(const id of ['garageUpgradePanel','upgradeWheel','upgradeChance','upgradeStakeItems','upgradeTargetItem','upgradeStart','upgradePicker','upgradeConfirmModal','upgradeHistoryModal']){
  assert.match(html,new RegExp(`id="${id}"`),`missing ${id}`);
}
assert.match(css,/\.garage-screen\.upgrade-open[\s\S]*overflow:hidden/);
assert.match(css,/@media\(max-height:560px\)/);
assert.match(css,/env\(safe-area-inset-top\)/);
assert.match(css,/\.upgrade-board\{[^}]*grid-template-columns:/);
assert.match(css,/\.upgrade-selected-items\{[^}]*overflow-y:auto/);
assert.match(html,/id="upgradePickerSort"/);
assert.match(garage,/pickerSort:'asc'/);

// V65 odds are server-authoritative; visible wheel odds match the real chance.
assert.equal(publicConfig().returnBps,9600);
assert.equal(publicConfig().minChanceBps,100);
assert.equal(publicConfig().maxChanceBps,9500);
assert.equal(publicConfig().maxStakeItems,12);
assert.match(upgradeConfig,/returnBps:9600/);
assert.match(upgradeConfig,/maxChanceBps:9500/);
assert.equal(upgradeChanceBps(100000,200000),4800);
assert.equal(upgradeChanceBps(150000,200000),7200);
assert.equal(upgradeChanceBps(180000,200000),8640);
assert.equal(upgradeChanceBps(190000,200000),9120);
assert.equal(upgradeChanceBps(196000,200000),9408);
assert.equal(upgradeChanceBps(199999,200000),9500);
assert.equal(upgradeChanceBps(0,200000),0);
assert.match(upgrade,/baseChanceBps\(stakeValue,targetValue,payload\.protection\)<MIN_CHANCE_BPS/);
const realChance=upgradeChanceBps(100000,200000);
const outcomes=Array.from({length:10000},(_,ticket)=>ticket<realChance);
assert.equal(outcomes.filter(Boolean).length,4800);
assert.equal(outcomes.filter(success=>!success).length,5200);

// Result is server-side and idempotent.
assert.match(upgrade,/crypto\.getRandomValues/);
assert.match(upgrade,/INSERT OR IGNORE INTO upgrade_attempts/);
assert.match(upgrade,/status='processing'/);
assert.match(upgrade,/mutateTargetSave\(env,session\.user\.id/);
assert.match(upgrade,/consumeStake\(save,payload\)/);assert.match(upgrade,/if\(success\)grantTarget/);
assert.match(upgrade,/TARGET_NOT_HIGHER/);
assert.match(upgrade,/CHANCE_TOO_LOW/);
assert.match(upgrade,/TARGET_ALREADY_OWNED/);
assert.match(read('src/upgrade-config.mjs'),/maxStakeItems:12/);
assert.match(garage,/\/api\/upgrade\/quote/);
assert.match(garage,/\/api\/upgrade\/attempt/);
assert.match(garage,/Результат определён сервером/);


// Worker routing, persistent history, logs and migration.
assert.match(worker,/handleUpgradeRequest/);
assert.match(upgrade,/\/api\/upgrade\/history/);
assert.match(logs,/['"]upgrades['"]/);
assert.match(owner,/upgrades:'UPGRADES'/);
assert.match(owner,/upgrade_success:'UPGRADE · SUCCESS'/);
assert.match(html,/data-log-category="upgrades"/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS upgrade_attempts/);
assert.match(migration,/id TEXT PRIMARY KEY/);

// No duplicate upgrade inventory exists: server mutates the project's existing save keys.
assert.match(upgrade,/ownedLiveries/);
assert.match(upgrade,/ownedEffects/);
assert.doesNotMatch(upgrade,/upgradeCars/);
assert.match(upgrade,/save\.credits=/);

// The visual wheel still receives the authoritative quote, while RNG is server supplied.
assert.match(garage,/--upgrade-chance/);
assert.match(garage,/attempt\?\.rngValue/);
assert.match(garage,/attempt\?\.chanceBps/);
assert.match(garage,/chance>0&&u\.target/);

console.log('garage_upgrade_v52_test: ok');
