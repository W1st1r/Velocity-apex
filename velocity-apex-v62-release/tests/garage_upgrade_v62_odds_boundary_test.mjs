import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {upgradeChanceBps} from '../src/upgrade.mjs';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const garage=read('public/js/garage.js');
const config=read('src/upgrade-config.mjs');
const html=read('public/index.html');

// V62 authoritative odds: approximately the approved 5/10/15/.../50% real table.
assert.match(config,/returnBps:5100/);
assert.match(config,/maxChanceBps:5000/);
assert.match(config,/chanceDivisor:1/);
const ratios=[.10,.20,.30,.40,.50,.60,.70,.80,.90,.95,.98,.99999];
const expectedReal=[510,1020,1530,2040,2550,3060,3570,4080,4590,4845,4998,5000];
for(let i=0;i<ratios.length;i++) assert.equal(upgradeChanceBps(Math.floor(ratios[i]*100000),100000),expectedReal[i]);

// Client shows 1.5x real chance, hard-capped at 75%.
assert.match(garage,/UPGRADE_VISUAL_MULTIPLIER=1\.5/);
assert.match(garage,/UPGRADE_VISUAL_MAX_BPS=7500/);
assert.match(garage,/upgradeDisplayChanceBps/);
assert.match(html,/upgrade=20260920-v62/);
const display=bps=>Math.max(0,Math.min(7500,Math.round(bps*1.5)));
const expectedShown=[765,1530,2295,3060,3825,4590,5355,6120,6885,7268,7497,7500];
for(let i=0;i<expectedReal.length;i++) assert.equal(display(expectedReal[i]),expectedShown[i]);

// Result remains server-fixed before animation; client only remaps the landing position.
assert.match(garage,/sourceStart=success\?0:chance/);
assert.match(garage,/visualStart=success\?0:displayChance/);
assert.match(garage,/result already fixed|результат уже зафиксирован сервером/);

// Dramatic near-boundary landings occur every 2 or 3 spins and never alter success/failure.
assert.match(garage,/upgradeNextBoundarySpin=2\+Math\.floor\(Math\.random\(\)\*2\)/);
assert.match(garage,/nearBoundary=spinNumber>=this\.upgradeNextBoundarySpin/);
assert.match(garage,/this\.upgradeNextBoundarySpin=spinNumber\+2\+Math\.floor\(Math\.random\(\)\*2\)/);
assert.match(garage,/visualTicket=Math\.max\(\.5,displayChance-margin\)/);
assert.match(garage,/visualTicket=Math\.min\(9999\.5,displayChance\+margin\)/);

// Mathematically verify near-border points remain on the server-decided side.
for(const shown of [765,3825,6885,7500]){
  for(const rawMargin of [18,50,100]){
    const successMargin=Math.min(rawMargin,Math.max(.5,shown-.5));
    const successTicket=Math.max(.5,shown-successMargin);
    assert.ok(successTicket>=0 && successTicket<shown);
    const failMargin=Math.min(rawMargin,Math.max(.5,9999.5-shown));
    const failTicket=Math.min(9999.5,shown+failMargin);
    assert.ok(failTicket>shown && failTicket<10000);
  }
}

console.log('garage_upgrade_v62_odds_boundary_test: ok');
