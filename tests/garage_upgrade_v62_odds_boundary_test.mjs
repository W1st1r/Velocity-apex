/* V65 replaces the V62 hidden 1.5x visual multiplier with exact server odds. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upgradeChanceBps,returnBpsForAccount} from '../src/upgrade.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('public/js/garage.js'),html=read('public/index.html'),cfg=read('src/upgrade-config.mjs');
assert.match(cfg,/returnBps:9000/);assert.match(cfg,/maxChanceBps:8500/);
for(const ratio of [.10,.20,.30,.40,.50,.60,.70,.80,.90,.95,.98,.99999]){
 const stake=Math.floor(ratio*100000);
 for(const tier of [9000,9100,9200,9400,9800])assert.equal(upgradeChanceBps(stake,100000,tier),Math.min(8500,Math.floor(stake/100000*tier)));
}
assert.equal(returnBpsForAccount(0,0),9800);assert.equal(returnBpsForAccount(5,0),9400);assert.equal(returnBpsForAccount(20,0),9000);
assert.doesNotMatch(client,/UPGRADE_VISUAL_MULTIPLIER/);
assert.match(client,/upgradeDisplayChanceBps=bps=>Math\.max\(0,Math\.min\(8500/);
assert.match(client,/pointer\.dataset\.result=success\?'success':'failed'/);
assert.match(html,/upgrade=20261013-v65/);
console.log('garage_upgrade_v62_compat: OK — V65 odds, direct mapping, server ownership');
