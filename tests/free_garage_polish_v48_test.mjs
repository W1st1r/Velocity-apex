import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const citySrc=fs.readFileSync('public/js/free-city.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const scope={window:{}};vm.createContext(scope);vm.runInContext(citySrc,scope);
const city=scope.window.ApexCity,g=city.garageVenue;
assert.ok(g,'garage venue missing');
// Through avenue must remain driveable and visually untouched by the garage apron.
for(let x=2420;x<=2920;x+=20)assert.equal(city.roadAt(x,430,-20),true,`avenue blocked at x=${x}`);
assert.ok(g.apron.y>=550,'garage apron overlaps the avenue');
// V48 visual regression guards.
assert.match(citySrc,/Tapered curb-cut/,'tapered driveway treatment missing');
assert.match(citySrc,/gx\+28,arrowShoulder\],\[gx,arrowTop\]/,'entry arrow is not closed symmetrically');
assert.match(citySrc,/const bx=gx-gb\.w\/2/,'garage building is not explicitly centered');
assert.match(citySrc,/rr\(c,bx-11,gb\.y\+12,gb\.w\+22/,'centered building shadow missing');
assert.ok(/free-city\.js\?v=20261016-v77(?:&|\")/.test(html)&&/freeroam\.js\?v=20261016-v77(?:&|\")/.test(html),'V77 cache bust missing');
console.log('free_garage_polish_v48_test: OK');
