import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const citySource=fs.readFileSync(new URL('../public/js/free-city.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const scope={window:{}};vm.createContext(scope);vm.runInContext(citySource,scope);const city=scope.window.ApexCity;
for(const token of ['function eventPad(c,a,accent,opt)','function eventWall(c,x1,y1,x2,y2,accent)','function eventLane(c,lane,accent,label,orientation)','driftHarborEntry','driftHarborExit',"title:'CHECKPOINT RUSH'","orientation:'east'"]) assert.ok(citySource.includes(token),`missing event-hub token: ${token}`);
assert.ok(client.includes('The event-pad ring is the authoritative radius'),'duplicate marker ring must remain removed');
const lanes=[
 ['harbor entry',[960,1825],[960,1975]],['harbor exit',[1100,1825],[1100,1975]],
 ['football entry',[1877,310],[1877,400]],['football exit',[2067,310],[2067,400]],
 ['checkpoint entry',[3280,875],[3280,990]],['checkpoint exit',[3505,875],[3505,990]],
 ['hot potato entry',[910,1346],[1025,1346]],['hot potato exit',[910,1438],[1025,1438]]
];
for(const [name,a,b] of lanes)for(let i=0;i<=20;i++){const t=i/20,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;assert(city.roadAt(x,y,-20),`${name} blocked at ${x},${y}`)}
for(const v of city.minigameVenues){assert(v.access&&v.exit,`${v.id} must have separate entry and exit`);for(const d of [v.access,v.exit])assert(city.roadAt(d.x+d.w/2,d.y+d.h/2,-20),`${v.id} lane center must be driveable`)}
console.log('free_event_hubs_v37_test: OK — unified event design + V40 harbor/minigame driveable entry/exit lanes');
