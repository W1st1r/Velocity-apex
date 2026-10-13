import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const client=readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const city=readFileSync(new URL('../public/js/free-city.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/css/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');

// V40 screenshot regressions: the lower-left drift complex is large, road-separated and unique.
assert.ok(city.includes("[[1050,430,3990],[220,1010,3990],[220,1590,3990],[1380,2170,3990],[1380,2670,4940]]"),'lower-west arterials must be moved away from the enlarged drift park');
assert.ok(city.includes("driftHarbor:{x:170,y:1940,w:1000,h:740}"),'harbor drift megapark footprint missing');
assert.ok(client.includes("drift:{x:670,y:2310,r:320"),'harbor drift marker must match the enlarged pad');
assert.ok(server.includes("harbor:{x:670,y:2310,r:320"),'server harbor drift zone must match client');
assert.ok(!city.includes('driftIndustrial:'),'industrial drift surface must be removed');
assert.ok(!client.includes('driftIndustrial:')&&!client.includes('driftParking:'),'only one client drift zone may remain');
assert.ok(!server.includes("industrial:{x:2690")&&!server.includes("parking:{x:3700"),'only one authoritative drift zone may remain');
assert.ok(city.includes("apron:{x:550,y:1290,w:390,h:195}"),'Bomb Arena apron must end before both arterial road surfaces');
assert.ok(city.includes("building:{x:605,y:1128,w:330,h:138}"),'Bomb Arena building must remain fully off-road');
assert.ok(client.includes("hotPotatoHub:{x:820,y:1410,r:105"),'Bomb Arena client trigger must follow the moved parking area');
assert.ok(server.includes("hot_potato:{x:820,y:1410,r:118"),'Bomb Arena server trigger must follow the moved parking area');

// Every running mini-game gets the compact score strip, not football only.
assert.ok(client.includes("compactPlaying=e.status==='running'"),'all running mini-games must activate compact HUD');
assert.ok(client.includes("roam.classList.toggle('minigame-playing',compactPlaying)"),'free-roam must expose general compact mini-game state to CSS');
for(const token of ['.free-minigame-hud.minigame-compact','.free-roam.minigame-playing .free-hud-center','@media (orientation:landscape) and (max-height:700px) and (max-width:1180px)'])assert.ok(css.includes(token),`compact mini-game CSS missing ${token}`);
assert.ok(client.includes('updateMinigameCamera(e,kind)')&&client.includes('anchorY:H*.46'),'phone landscape mini-game camera must follow the player/objective inside a HUD-safe zone');
assert.ok(html.includes('20260920-v48'),'V43 cache bust must force Safari/PWA to load the corrected map and HUD');
console.log('free_map_football_ui_v35_test: OK — V40 single drift megapark + compact all-mini-game HUD');
