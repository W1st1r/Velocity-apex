import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {upgradeChanceBps} from '../src/upgrade.mjs';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const garage=read('public/js/garage.js');
const config=read('src/upgrade-config.mjs');
const html=read('public/index.html');

// V60 is presentation-only: the authoritative V59 server divisor is unchanged.
assert.match(config,/chanceDivisor:6/);
assert.equal(upgradeChanceBps(3000,7360),500);   // real 5.00%
assert.equal(upgradeChanceBps(199999,200000),1200); // real cap 12.00%

// UI displays exactly 4.5x the authoritative basis points.
assert.match(garage,/UPGRADE_VISUAL_MULTIPLIER=4\.5/);
assert.match(garage,/upgradeDisplayChanceBps/);
assert.match(garage,/displayChance=upgradeDisplayChanceBps\(chance\)/);
assert.match(garage,/upgradeDisplayChanceText\(u\.chanceBps\)/);
assert.match(garage,/upgradeDisplayChanceText\(x\.chanceBps\)/);
assert.match(html,/upgrade=20260920-v60/);

const display=bps=>Math.max(0,Math.min(9900,Math.round(bps*4.5)));
assert.equal(display(500),2250);   // 5.00% -> 22.50%
assert.equal(display(613),2759);   // 6.13% -> 27.59%
assert.equal(display(920),4140);   // 9.20% -> 41.40%
assert.equal(display(1200),5400);  // 12.00% -> 54.00%

// Visual landing is remapped after the server has already fixed success/failure.
assert.match(garage,/sourceStart=success\?0:chance/);
assert.match(garage,/visualStart=success\?0:displayChance/);
assert.match(garage,/visualTicket=visualStart\+normalized\*visualSpan/);
assert.match(garage,/result already fixed|результат уже зафиксирован сервером/);

// Prove mapping keeps all successful tickets in green and all failures in red.
for(const chance of [16,500,613,920,1200]){
  const shown=display(chance);
  for(let ticket=0;ticket<10000;ticket++){
    const success=ticket<chance;
    const sourceStart=success?0:chance;
    const sourceSpan=Math.max(1,success?chance:10000-chance);
    const visualStart=success?0:shown;
    const visualSpan=Math.max(1,success?shown:10000-shown);
    const normalized=Math.max(0,Math.min(.999999,(ticket-sourceStart+.5)/sourceSpan));
    const visualTicket=visualStart+normalized*visualSpan;
    if(success) assert.ok(visualTicket>=0 && visualTicket<shown,`success outside green: chance=${chance} ticket=${ticket}`);
    else assert.ok(visualTicket>shown && visualTicket<10000,`failure outside red: chance=${chance} ticket=${ticket}`);
  }
}

console.log('garage_upgrade_v60_visual_odds_test: ok');
