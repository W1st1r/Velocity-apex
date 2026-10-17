import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cityScope={window:{}};vm.createContext(cityScope);
vm.runInContext(fs.readFileSync(path.join(root,'public/js/free-city.js'),'utf8'),cityScope);
const city=cityScope.window.ApexCity,client=fs.readFileSync(path.join(root,'public/js/freeroam.js'),'utf8'),server=fs.readFileSync(path.join(root,'src/worker.mjs'),'utf8');
const expected={football:[1997.5,272.5],checkpoint:[3337.5,860],hot_potato:[745,1387.5]};
const hubs=server.match(/const FREE_MINIGAME_HUBS=Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
assert.ok(hubs,'server minigame hub registry missing');
for(const [id,[x,y]] of Object.entries(expected)){
  const venue=city.minigameVenues.find(v=>v.id===id);assert.ok(venue,`${id} venue missing`);
  const center=[venue.apron.x+venue.apron.w/2,venue.apron.y+venue.apron.h/2];assert.deepEqual(center,[x,y],`${id} expected center changed`);
  assert(city.roadAt(x,y,-20),`${id} center must remain driveable`);
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12)assert(city.roadAt(x+40*Math.cos(angle),y+40*Math.sin(angle),-20),`${id} 45-unit activation ring not accessible at ${angle}`);
  const serverLine=new RegExp(`${id}:\\{x:${x},y:${y},r:45,`).test(hubs);assert(serverLine,`${id} server center/radius differs from visible venue`);
  assert(client.includes(`...MINIGAME_VENUE_CENTERS.${id},r:45`),`${id} client prompt must use same center and radius`);
}
assert.match(server,/insideCircle\(p\.state,hub\)/,'server should enforce the displayed radius without an invisible extra allowance');
assert.doesNotMatch(server,/insideCircle\(p\.state,hub,110\)/,'legacy oversized server interaction radius remains');
assert.match(fs.readFileSync(path.join(root,'public/js/free-city.js'),'utf8'),/c\.arc\(cx,cy,45,0,TAU\)/,'the visible venue ring must match the 45-unit interaction radius');
for(const stale of ['footballHub:{x:1835,y:300','checkpointHub:{x:3338,y:865','hotPotatoHub:{x:820,y:1410'])assert.ok(!client.includes(stale),`stale client trigger remains: ${stale}`);
console.log('free_minigame_geometry_v77_test: OK — 3 rendered apron centers, 45-unit server/client rings and 36 all-direction road samples');
