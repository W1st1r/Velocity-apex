import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/css/style.css',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
const citySource=fs.readFileSync(new URL('../public/js/free-city.js',import.meta.url),'utf8');

assert.ok(html.includes('id="freeMinigameToggle"'),'minigame HUD must expose an expand/collapse control');
for(const token of ['minigameHudAutoCollapseAt','minigame-expanded','updateMinigameCamera(e,kind)','minigameObjective(e,kind)','anchorY:H*.46'])assert.ok(client.includes(token),`missing V43 camera/HUD hook: ${token}`);
assert.ok(css.includes('.free-minigame-hud.minigame-compact:not(.minigame-expanded) .free-minigame-standings'),'running leaderboard must collapse');
assert.match(css,/\.free-roam\.minigame-playing \.free-mobile-controls button\{background:rgba\(\d+,\d+,\d+,\.34\)/,'minigame controls must remain translucent after the blue theme');
assert.ok(css.includes('.free-roam.minigame-playing .free-mobile-controls button:active'),'pressed controls must remain readable');
assert.ok(worker.includes('FREE_FOOTBALL_PROGRESS_MS=50'),'football authoritative ball state should update at 20 Hz');
assert.ok(worker.includes('FREE_FOOTBALL_STATE_RATE_MS=36'),'football car state should have a low-latency server cadence');

const scope={window:{}};vm.createContext(scope);vm.runInContext(citySource,scope);
const city=scope.window.ApexCity;
const hot=city.minigameVenues.find(v=>v.id==='hot_potato');
assert.ok(hot,'Hot Potato venue missing');
assert.ok(hot.apron.w>=390&&hot.apron.h>=190,'Hot Potato maneuver apron must be enlarged');
assert.ok(hot.access.h>=80&&hot.exit.h>=80,'Hot Potato entry/exit must be widened');
for(const lane of [hot.access,hot.exit]){
  const x=lane.x+lane.w*.75,y=lane.y+lane.h/2;
  assert.ok(city.roadAt(x,y,-20),'Hot Potato lane must remain driveable on the collision map');
}
console.log('free_minigame_visibility_v43_test: OK — compact HUD, safe-zone camera, translucent controls, wider Hot Potato and smoother football cadence');
