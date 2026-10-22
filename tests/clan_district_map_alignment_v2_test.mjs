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
const expected={
  'north-loop':'ПАНОРАМНЫЙ СЕРПАНТИН','harbor-crossing':'ПОРТ • DRIFT','old-town':'ЦЕНТРАЛЬНЫЙ ПАРК',
  'south-industrial':'ИНДУСТРИАЛЬНЫЙ ПАРК','apex-heights':'СОЛНЕЧНЫЙ КВАРТАЛ','grand-avenue':'ЦЕНТР • CAR MEET','apex-center':'АЭРОПОРТ'
};
for(const m of markers){assert.ok(m.x>=0&&m.x<=W&&m.y>=0&&m.y<=H,`${m.id} remains inside the 5000×3000 city`);if(expected[m.id])assert.equal(district(m.x,m.y),expected[m.id],`${m.name} marker matches the actual named city geometry`);}
const coast=markers.find(m=>m.id==='coastal-ridge');assert.ok(coast);assert.equal(district(coast.x,coast.y),'APEX BAY','coastal ridge remains inside the bay but city resolver does not define a separate coastal zone');
console.log('clan_district_map_alignment_v2_test: PASS (7 named zones align; coastal marker retained in bounds and its generic resolver coverage is documented)');
