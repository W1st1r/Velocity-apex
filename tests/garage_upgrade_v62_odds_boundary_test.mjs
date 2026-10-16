/* V65 replaces the V62 hidden 1.5x visual multiplier with exact server odds. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upgradeChanceBps,upgradeRefundCredits} from '../src/upgrade.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('public/js/garage.js'),html=read('public/index.html'),cfg=read('src/upgrade-config.mjs');
assert.match(cfg,/returnBps:9800/);assert.match(cfg,/maxChanceBps:9900/);
for(const ratio of [.10,.20,.30,.40,.50,.60,.70,.80,.90,.95,.98,.99999]){
 const stake=Math.floor(ratio*100000);
 assert.equal(upgradeChanceBps(stake,100000),Math.min(9900,Math.floor(stake/100000*9800)));
 assert.ok(upgradeChanceBps(stake,100000,true)<upgradeChanceBps(stake,100000));
}
assert.equal(upgradeRefundCredits(50000,true),12500);
assert.doesNotMatch(client,/UPGRADE_VISUAL_MULTIPLIER/);
assert.match(client,/upgradeDisplayChanceBps=bps=>Math\.max\(0,Math\.min\(9900/);
assert.match(client,/pointer\.dataset\.result=success\?'success':'failed'/);
assert.match(html,/upgrade=20261014-v69/);
console.log('garage_upgrade_v62_compat: OK — V65 odds, direct mapping, server ownership');
