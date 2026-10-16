import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=(p)=>readFileSync(new URL(p,root),'utf8');
const citySrc=read('public/js/free-city.js');
const roamSrc=read('public/js/freeroam.js');
const html=read('public/index.html');
const version=JSON.parse(read('public/version.json'));
const context={window:{}};
vm.createContext(context);
vm.runInContext(citySrc.replace('window.ApexCity={','window.__map70={roads,buildings,trees,areas};window.ApexCity={'),context);
const city=context.window.ApexCity,{roads,buildings,trees}=context.window.__map70;

assert.ok(['V70','V71','V74','V76','V76.1','V76.2','V76.3','V76.3.1'].includes(version.version),'expected a Coastal Ring based release');
assert.ok(city.coastalRingVersion>=70);
assert.equal(city.width,5000);
assert.equal(city.height,3000);
assert.ok(['V74','V76','V76.1','V76.2','V76.3','V76.3.1'].includes(version.version)||/Coastal Ring/.test(version.update));
assert.match(html,/free-city\.js\?v=20260920-v49&release=20261016-v74/);
assert.match(html,/freeroam\.js\?v=20260920-v49&release=20261016-v74/);
assert.ok(roads.length>=16,'eastern coastal connections are missing');
assert.ok(buildings.length>=170,'premium coastal quarters must contain detailed blocks');
assert.ok(trees.length>220,'vegetation must not disappear');

const east=roads.find(r=>r.points.length>40 && r.points.some(p=>p[0]>4650 && p[1]>1000));
assert.ok(east,'new high-speed eastern ring road not found');
let sideSamples=0;
for(let k=1;k<east.points.length;k+=7){
  const p=east.points[k],q=east.points[Math.max(0,k-1)],dx=p[0]-q[0],dy=p[1]-q[1],dist=Math.hypot(dx,dy);
  if(dist<.1)continue;
  const nx=-dy/dist,ny=dx/dist;
  for(const offset of [-44,0,44]){
    const x=p[0]+nx*offset,y=p[1]+ny*offset;
    assert.ok(city.roadAt(x,y,-20),`east coast lane inaccessible (${x.toFixed(1)}, ${y.toFixed(1)})`);
    sideSamples++;
  }
}
assert.ok(sideSamples>40,'insufficient checks across full driving width');
for(const b of buildings){
  for(let xx=b.x;xx<=b.x+b.w;xx+=8)for(let yy=b.y;yy<=b.y+b.h;yy+=8){
    assert.ok(!city.roadAt(xx,yy),`building appears on driveable road ${b.x},${b.y}`);
  }
}
for(const t of trees)assert.ok(!city.roadAt(t.x,t.y,t.r),'tree canopy encroaches on road');
for(const venue of city.minigameVenues){
  for(const name of ['apron','access','exit']){
    const a=venue[name];assert.ok(city.roadAt(a.x+a.w/2,a.y+a.h/2,-20),`${venue.id} ${name} blocked`);
  }
}
for(const [x,y] of [[2320,1590],[2675,660],[2020,430],[670,2310],[3130,2635],[4710,2705]]){
  assert.ok(city.roadAt(x,y,-20),`historical player / event spawn moved at ${x},${y}`);
}
assert.ok(/function offshoreDetails\(/.test(citySrc),'marina and offshore island art missing');
assert.ok(/function coastline\(/.test(citySrc),'shoreline detail missing');
assert.ok(/function facadeDetail\(/.test(citySrc),'zoomed building details missing');
assert.match(citySrc,/c\.scale\(ratio,ratio\)/,'retina vector tile resolution missing');
assert.match(citySrc,/c\.drawImage\(tile\(x,y\),x\*TILE-2,y\*TILE-2,TILE\+4,TILE\+4\)/,'tile must be drawn in world units to prevent seams');
assert.match(roamSrc,/if\(mapView\.zoom>=1\.75\)/,'high-zoom map must use vector art');
assert.ok(!/new\s+Image\s*\(/.test(citySrc),'stretched poster images are forbidden for playable map');
console.log(`coastal_ring_v70_test: OK (${roads.length} connected routes, ${buildings.length} buildings, ${trees.length} trees, ${sideSamples} east coast lane checks; old activities preserved)`);
