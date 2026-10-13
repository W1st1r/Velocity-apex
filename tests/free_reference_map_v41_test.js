const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const citySource=fs.readFileSync(path.join(root,'public/js/free-city.js'),'utf8');
const roamSource=fs.readFileSync(path.join(root,'public/js/freeroam.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');

for(const token of [
  'APEX BAY V49',
  'const airportTerminal=',
  'const parkedAircraft=',
  'function airplane(c,x,y,scale=1,angle=-Math.PI/2)',
  'function airportTerminalScene(c)',
  "text(c,'09'",
  "text(c,'27'",
  "text(c,'APEX INTERNATIONAL'"
]) assert.ok(citySource.includes(token),`V42 reference-map feature missing: ${token}`);

for(const token of [
  'VISUAL_MARGIN=900',
  'function visualBuffer(c,v)',
  'function boundaryScenery(c,v)',
  'function colorGrade(c,v)',
  'visualMargin:VISUAL_MARGIN'
]) assert.ok(citySource.includes(token),`V42 visual-quality feature missing: ${token}`);

// The city must remain vector/tile rendered rather than a stretched reference bitmap.
assert.ok(!/new\s+Image\s*\(/.test(citySource),'free-city must not load one stretched bitmap as the world');
assert.ok(citySource.includes('const tiles=new Map(),TILE=512'),'bounded vector tile cache missing');
assert.ok(html.includes('js/free-city.js?v=20260920-v49'),'V42 city cache bust missing');

// Camera contract: player remains the exact camera center; do not clamp camera to map/background edges.
assert.ok(roamSource.includes('let cx=car.x,cy=car.y;' ),'free-roam camera must be centered on the player');
assert.ok(roamSource.includes('ctx.translate(-cx,-cy);'),'player-centered camera translation missing');

const scope={window:{}};vm.createContext(scope);
const exposed=citySource.replace('window.ApexCity={','window.__v42={airportTerminal,parkedAircraft};window.ApexCity={');
vm.runInContext(exposed,scope);
const city=scope.window.ApexCity,{airportTerminal,parkedAircraft}=scope.window.__v42;

assert.equal(city.width,5000,'V42 must preserve the physical gameplay width');
assert.equal(city.height,3000,'V42 must preserve the physical gameplay height');
assert.equal(city.visualMargin,900,'V42 visual buffer must extend 900 world units beyond gameplay bounds');
assert.equal(city.roadAt(-80,800),false,'visual west buffer must remain non-driveable');
assert.equal(city.roadAt(5080,800),false,'visual east buffer must remain non-driveable');
assert.equal(city.roadAt(2200,-80),false,'visual north buffer must remain non-driveable');
assert.equal(city.roadAt(2200,3080),false,'visual south buffer must remain non-driveable');

// Runway and multiplayer drag lanes stay fully usable.
for(const [x,y] of [[2900,2670],[3130,2635],[3130,2705],[3850,2670],[4710,2635],[4710,2705],[4890,2670]])
  assert(city.roadAt(x,y,-20),`runway/drag lane blocked at ${x},${y}`);

// Aircraft are parked on a scenery apron outside the vehicle road union, so no giant aircraft collider is introduced.
for(const a of parkedAircraft)assert(!city.roadAt(a.x,a.y),`parked aircraft must not sit on a driveable lane: ${a.x},${a.y}`);
for(let x=airportTerminal.x+30;x<airportTerminal.x+airportTerminal.w-30;x+=100)
  assert(!city.roadAt(x,airportTerminal.y+airportTerminal.h/2),`terminal scenery unexpectedly driveable at ${x}`);

console.log(`free_reference_map_v41_test: OK — V42 visual upgrade; ${parkedAircraft.length} top-down aircraft, HD vector/tile map, centered camera, runway clear`);
