/* V65 refines V64 precise pointer tip and supports 2–4-spin near-edge moments. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('public/js/garage.js'),css=read('public/css/style.css'),html=read('public/index.html');
assert.match(js,/UPGRADE_POINTER_SAFE_MARGIN_BPS=140/);
assert.match(js,/const edge=Math\.min\(Math\.max\(45/);
assert.match(js,/const margin=nearBoundary\?edge:safe/);
assert.match(js,/if\(nearBoundary\)return success\?high:low/);
assert.match(js,/nearBoundary,pointer\.getBoundingClientRect\(\)\.width\/2/);
assert.match(js,/this\.upgradeNextBoundarySpin=spinNumber\+2\+Math\.floor\(Math\.random\(\)\*3\)/);
assert.match(js,/pointer\.dataset\.result=success\?'success':'failed'/);
assert.match(css,/\.upgrade-wheel-stage \.upgrade-pointer::before/);
assert.match(html,/pointerLayout=20261013-v65/);
function landing(success,shown,normalized,near=false,r=55){
 const start=success?0:shown,end=success?shown:10000,span=Math.max(0,end-start);
 if(span<=0)return success?0:9999.999;
 const safe=Math.min(140,Math.max(.5,(span-1)/2));
 const edge=Math.min(Math.max(45,Math.ceil(10000*3/(2*Math.PI*Math.max(30,r)))),Math.max(.5,(span-1)/2));
 const margin=near?edge:safe,low=start+margin,high=end-margin;
 if(high<=low)return start+span/2;
 if(near)return success?high:low;
 return low+Math.max(0,Math.min(1,normalized))*(high-low);
}
for(const shown of [100,150,765,1530,3825,6885,7497,8500,9500])for(const near of [false,true])for(const n of [0,.001,.25,.5,.75,.999,1]){
 const ok=landing(true,shown,n,near),fail=landing(false,shown,n,near);
 assert.ok(ok>0&&ok<shown);assert.ok(fail>shown&&fail<10000);
}
console.log('garage_upgrade_v64_pointer_compat: OK — visual V65 tip accuracy');
