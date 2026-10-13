import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const garage=read('public/js/garage.js');
const css=read('public/css/style.css');
const html=read('public/index.html');

assert.match(garage,/UPGRADE_POINTER_SAFE_MARGIN_BPS=140/);
assert.match(garage,/upgradePointerLandingBps=/);
assert.match(garage,/const safe=Math\.min\(UPGRADE_POINTER_SAFE_MARGIN_BPS/);
assert.match(garage,/if\(nearBoundary\)return success\?high:low/);
assert.match(garage,/visualTicket=upgradePointerLandingBps\(success,displayChance,normalized,nearBoundary\)/);
assert.match(garage,/pointer\.dataset\.result=success\?'success':'failed'/);
assert.match(css,/\.upgrade-wheel-stage \.upgrade-pointer::before/);
assert.match(html,/upgrade=20260921-v64/);
assert.match(html,/pointer(?:Layout)?=20260921-v64/);

const SAFE=140;
function landing(success, shown, normalized, near=false){
  const start=success?0:shown,end=success?shown:10000,span=Math.max(0,end-start);
  if(span<=0)return success?0:9999.999;
  const safe=Math.min(SAFE,Math.max(.5,(span-1)/2));
  const low=start+safe,high=end-safe;
  if(high<=low)return start+span/2;
  if(near)return success?high:low;
  const n=Math.max(0,Math.min(1,Number(normalized)||0));
  return low+n*(high-low);
}

for(const shown of [150,765,1530,3825,6885,7497,7500]){
  for(const near of [false,true]){
    for(const n of [0,.001,.25,.5,.75,.999,1]){
      const ok=landing(true,shown,n,near);
      assert.ok(ok>0 && ok<shown,`success tip must be green: shown=${shown} tip=${ok}`);
      const fail=landing(false,shown,n,near);
      assert.ok(fail>shown && fail<10000,`failed tip must be red: shown=${shown} tip=${fail}`);
    }
  }
}

console.log('garage_upgrade_v64_pointer_truth_test: ok');
