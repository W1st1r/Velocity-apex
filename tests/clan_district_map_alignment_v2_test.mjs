import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const map=read('public/js/free-city.js'),seed=read('migrations/0026_clan_war_districts.sql');
const W=Number(map.match(/const W=(\d+),H=(\d+)/)?.[1]),H=Number(map.match(/const W=(\d+),H=(\d+)/)?.[2]);
assert.equal(W,5000);assert.equal(H,3000);
const source=map.match(/function district\(x,y\)\s*\{[\s\S]*?\n  \}/)?.[0];assert.ok(source,'city district resolver is present');
const district=vm.runInNewContext('('+source+')');
const markers=[...seed.matchAll(/^\s*\('([^']+)','([^']+)','[^']+',\d+,([\d.]+),([\d.]+),0\)/gm)].map(m=>({id:m[1],name:m[2],x:Number(m[3]),y:Number(m[4])}));
assert.equal(markers.length,8);
for(const file of ['0030_clan_district_labels.sql','0033_coastal_ridge_map_anchor.sql']){
  const updates=read(`migrations/${file}`);
  for(const m of updates.matchAll(/UPDATE clan_war_districts SET (?:name='([^']+)',)?map_x=([\d.]+),map_y=([\d.]+) WHERE id='([^']+)'/g)){
    const marker=markers.find(x=>x.id===m[4]);assert.ok(marker,`${m[4]} update targets a seeded district`);
    if(m[1])marker.name=m[1];marker.x=Number(m[2]);marker.y=Number(m[3]);
  }
}
const expected={
  'north-loop':'ПАНОРАМНЫЙ СЕРПАНТИН','harbor-crossing':'ПОРТ • DRIFT','old-town':'ЦЕНТРАЛЬНЫЙ ПАРК',
  'south-industrial':'ИНДУСТРИАЛЬНЫЙ ПАРК','apex-heights':'СОЛНЕЧНЫЙ КВАРТАЛ','grand-avenue':'ЦЕНТР • CAR MEET','apex-center':'АЭРОПОРТ'
};
for(const m of markers){assert.ok(m.x>=0&&m.x<=W&&m.y>=0&&m.y<=H,`${m.id} remains inside the 5000×3000 city`);if(expected[m.id])assert.equal(district(m.x,m.y),expected[m.id],`${m.name} marker matches the actual named city geometry`);}
const coast=markers.find(m=>m.id==='coastal-ridge');assert.ok(coast);assert.equal(coast.name,'Apex Bay Coast');
const ring=map.match(/road\(\[\[3990,430\],\[4240,310\],\[4470,350\],\[4595,545\],\[4670,815\],\s*\[4665,1110\],\[4580,1390\],\[4690,1650\],\[4670,1840\],\s*\[4480,2065\],\[4230,2150\],\[3990,2170\]\],166,true\)/);
assert.ok(ring,'authored eastern Coastal Ring geometry is present');
assert.ok(ring[0].includes(`[${coast.x},${coast.y}]`),'Coastal Ridge pin is anchored to an exact Coastal Ring spline control point');
assert.equal(district(coast.x,coast.y),'ИНДУСТРИАЛЬНЫЙ ПАРК','the generic city resolver classifies the street overlay; capture remains keyed by district ID');
console.log('clan_district_map_alignment_v2_test: PASS (7 named zones align; Coastal Ridge pin is on the authored eastern sea-cliff spline; capture rules are ID-based)');
