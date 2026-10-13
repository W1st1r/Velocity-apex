import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GAME_TYPES} from '../src/media.mjs';
import {RACE_TRACK_IDS,DRIFT_TRACK_IDS} from '../src/protocol.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/index.html');
const css=read('../public/css/style.css');
const online=read('../public/js/online.js');
const network=read('../public/js/network.js');
const game=read('../public/js/game.js');
const worker=read('../src/worker.mjs');
const media=read('../src/media.mjs');

assert.equal(GAME_TYPES.race?.kind,'race','MEDIA race type must be registered');
assert.ok(RACE_TRACK_IDS.length>=6,'normal race tracks must be available');
assert.ok(DRIFT_TRACK_IDS.length>=2,'drift tracks must be available');

for(const id of ['onlineMediaFormatMini','onlineMediaFormatRace','onlineMediaRacePanel','onlineMediaTrack','onlineMediaRaceMode','onlineMediaLaps','onlineMediaRaceMaxPlayers','onlineMediaRaceMinPlayers','raceSpectatorControl','raceSpectatorOverview','raceSpectatorPrev','raceSpectatorNext']){
  assert.ok(html.includes(`id="${id}"`),`missing HTML id ${id}`);
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
assert.deepEqual(duplicates,[],'HTML ids must be unique');

assert.match(css,/@media \(max-width:980px\) and \(max-height:700px\)/,'modern phone landscape breakpoint missing');
assert.match(css,/\.media-format-switch/,'MEDIA format switch CSS missing');
assert.match(css,/\.race-spectator-control/,'race spectator UI CSS missing');
assert.match(css,/body\.online-spectator/,'spectator gameplay CSS missing');

assert.match(media,/race:\{label:'TRACK RACE EVENT',kind:'race'/,'MEDIA race config missing');
assert.match(media,/RACE_TRACK_IDS,DRIFT_TRACK_IDS/,'server track allowlist missing');
assert.match(media,/media-race\/create/,'MEDIA race create routing missing');
assert.match(media,/media-race\/join/,'MEDIA race join routing missing');
assert.match(worker,/url\.pathname==='\/media-race\/create'/,'Durable Object MEDIA race create missing');
assert.match(worker,/url\.pathname==='\/media-race\/join'/,'Durable Object MEDIA race join missing');
assert.match(worker,/this\.room\.mode==='media_race'/,'MEDIA race room mode missing');
assert.match(worker,/settleMediaEvent\(this\.env,this\.room\.mediaEvent\.id/,'server prize settlement missing');
assert.match(worker,/p\.spectator\)return/,'spectator server action guard missing');

assert.match(network,/joinMediaRace\(/,'NetworkClient MEDIA race join missing');
assert.match(network,/session\.kind==='media-race'/,'MEDIA race WebSocket route missing');
assert.match(online,/state\.mediaFormat==='race'/,'MEDIA race creation UI logic missing');
assert.match(online,/mediaEventStatus\(code\)/,'code join must detect MEDIA event first');
assert.match(online,/room\.mode==='media_race'/,'MEDIA race lobby behavior missing');
assert.match(game,/updateSpectatorCamera/,'track spectator camera missing');
assert.match(game,/raceSpectatorMode='overview'/,'spectator overview mode missing');
assert.match(game,/cycleSpectator/,'spectator player cycling missing');

console.log('MEDIA V51 mobile + track race integration: OK');
