import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const citySrc=fs.readFileSync('public/js/free-city.js','utf8');
const free=fs.readFileSync('public/js/freeroam.js','utf8');
const worker=fs.readFileSync('src/worker.mjs','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const scope={window:{}};vm.createContext(scope);vm.runInContext(citySrc,scope);
const city=scope.window.ApexCity,g=city.garageVenue;
assert.ok(g,'garage venue missing');
// The public avenue centered at y=430 must remain continuously driveable through the garage block.
for(let x=2420;x<=2920;x+=20)assert.equal(city.roadAt(x,430,-20),true,`avenue blocked at x=${x}`);
// Garage forecourt/building must be entirely south of the avenue's visible edge (~525).
assert.ok(g.apron.y>=550,'garage apron still overlays the public road');
assert.ok(g.building.y>g.apron.y+g.apron.h,'garage building should sit behind the forecourt');
assert.equal(city.roadAt(g.building.x+g.building.w/2,g.building.y+g.building.h/2),false,'building overlaps driveable area');
// Collision union remains connected even with the -20 vehicle margin used by resolveCarMotion().
const cx=g.access.x+g.access.w/2;
for(let y=500;y<=590;y+=5)assert.equal(city.roadAt(cx,y,-20),true,`garage curb-cut disconnected at y=${y}`);
assert.equal(city.roadAt(g.apron.x+g.apron.w/2,g.apron.y+40,-20),true,'garage apron is not driveable');
assert.ok(free.includes('garage:GARAGE_ZONE')&&free.includes('nearGarage()')&&free.includes('y>=525'),'client garage trigger must stay off the public avenue');
assert.ok(worker.includes('exitY:535')&&worker.includes('insideGarageZone')&&worker.includes('Number(state?.y)>=525'),'server garage geometry not synchronized');
assert.ok(html.includes('free-city.js?v=20260920-v49')&&html.includes('freeroam.js?v=20260920-v49'),'V48 cache bust missing');
console.log('free_garage_side_lot_v47_test: OK');
