import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const base=new URL('../',import.meta.url);
const read=(p)=>readFileSync(new URL(p,base),'utf8');
const source=read('public/js/free-city.js');
const context={window:{}};vm.createContext(context);
vm.runInContext(source.replace('window.ApexCity={', 'window.__inspection={roads,buildings,trees,areas,parkedAircraft};window.ApexCity={'),context);
const city=context.window.ApexCity;
const {roads,buildings,trees,areas,parkedAircraft}=context.window.__inspection;
const version=JSON.parse(read('public/version.json'));
const html=read('public/index.html');
assert.equal(version.version,'V76.3');
assert.ok(city.coastalRingVersion>=71);
assert.match(html,/release=20261016-v74/);
assert.match(html,/velocity-apex-version" content="V76.3"/);
assert.ok(roads.length>=16);
assert.ok(buildings.length>=170);
assert.ok(trees.length>200);
const palms=trees.filter(t=>t.species==='palm');
assert.ok(palms.length>=50,`expected tropical foliage, got ${palms.length}`);
assert.ok(/palmSprites=new Map\(\)/.test(source),'palm rendering must be cached');
assert.ok(/const fuselage=c\.createLinearGradient/.test(source),'aircraft body is not vector detailed');
assert.equal(parkedAircraft.length,4,'keep all original aircraft');
assert.ok(/'#26343b'/.test(source),'dark asphalt grade missing');
assert.ok(/'#[0-9a-f]{8}'/.test(source),'shadows missing');
assert.ok(!/new\s+Image\s*\(/.test(source),'playable map must be vector, not a poster');
for(const t of palms)assert.equal(city.roadAt(t.x,t.y,t.r+0),false,`palm overlaps road (${t.x},${t.y})`);
for(const b of buildings){
 for(const p of [[b.x,b.y],[b.x+b.w/2,b.y+b.h/2],[b.x+b.w,b.y+b.h]])
  assert.equal(city.roadAt(p[0],p[1]),false,`building overlaps road ${b.x},${b.y}`);
}
for(const venue of city.minigameVenues){
 for(const key of ['apron','access','exit']){
  const a=venue[key];assert.ok(city.roadAt(a.x+a.w/2,a.y+a.h/2,-20),`${venue.id} ${key} blocked`);
 }
}
for(const [x,y] of [[2320,1590],[2675,660],[2020,430],[670,2310],[3130,2635],[4710,2705]])
 assert.ok(city.roadAt(x,y,-20),`historical zone moved ${x},${y}`);
// Road sides retain their V70 physical extents. A visual update must not narrow the roadway.
let sideSamples=0;
for(const r of roads){
 const points=r.points;
 for(let i=1;i<points.length;i+=Math.max(1,Math.floor(points.length/24))){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<.01)continue;
  for(const offset of [-.24,0,.24]){
   const nx=-dy/len,ny=dx/len,x=b[0]+nx*offset*r.width,y=b[1]+ny*offset*r.width;
   if(x<25||x>city.width-25||y<25||y>city.height-25)continue;
   assert.ok(city.roadAt(x,y,-20),`road-side lane missing ${x},${y}`);sideSamples++;
  }
 }
}
assert.ok(sideSamples>100);
console.log(`coastal_ring_v71_test: OK (${palms.length} palms, ${trees.length} foliage items, ${buildings.length} buildings, ${parkedAircraft.length} aircraft, ${sideSamples} lane samples)`);
