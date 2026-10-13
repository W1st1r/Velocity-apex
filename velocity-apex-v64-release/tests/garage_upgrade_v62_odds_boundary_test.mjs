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
assert.match(html,/upgrade=20260921-v64/);
const display=bps=>Math.max(0,Math.min(7500,Math.round(bps*1.5)));
const expectedShown=[765,1530,2295,3060,3825,4590,5355,6120,6885,7268,7497,7500];
for(let i=0;i<expectedReal.length;i++) assert.equal(display(expectedReal[i]),expectedShown[i]);

// Result remains server-fixed before animation; client maps the landing into the matching visual sector.
assert.match(garage,/sourceStart=success\?0:chance/);
assert.match(garage,/upgradePointerLandingBps/);
assert.match(garage,/result already fixed|результат уже зафиксирован сервером/);

// V64 keeps dramatic near-border landings every 2–3 spins, but clamps the tip safely inside the decided sector.
assert.match(garage,/upgradeNextBoundarySpin=2\+Math\.floor\(Math\.random\(\)\*2\)/);
assert.match(garage,/nearBoundary=spinNumber>=this\.upgradeNextBoundarySpin/);
assert.match(garage,/this\.upgradeNextBoundarySpin=spinNumber\+2\+Math\.floor\(Math\.random\(\)\*2\)/);
assert.match(garage,/UPGRADE_POINTER_SAFE_MARGIN_BPS=140/);
assert.match(garage,/if\(nearBoundary\)return success\?high:low/);

// Mathematically verify every final tip position stays strictly inside the server-decided visual sector.
const SAFE=140;
const landing=(success,shown,n,near=false)=>{
  const start=success?0:shown,end=success?shown:10000,span=Math.max(0,end-start);
  if(span<=0)return success?0:9999.999;
  const safe=Math.min(SAFE,Math.max(.5,(span-1)/2));
  const low=start+safe,high=end-safe;
  if(high<=low)return start+span/2;
  if(near)return success?high:low;
  return low+Math.max(0,Math.min(1,n))*(high-low);
};
for(const shown of [150,765,3825,6885,7500]){
  for(const near of [false,true]){
    for(const n of [0,.001,.5,.999,1]){
      const successTicket=landing(true,shown,n,near);
      assert.ok(successTicket>0 && successTicket<shown);
      const failTicket=landing(false,shown,n,near);
      assert.ok(failTicket>shown && failTicket<10000);
    }
  }
}

console.log('garage_upgrade_v62_odds_boundary_test: ok');
