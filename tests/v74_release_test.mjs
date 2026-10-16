import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const roam=read('public/js/freeroam.js');
const worker=read('src/worker.mjs');
const content=read('public/js/content.js');
const market=read('public/js/market.js');
const version=JSON.parse(read('public/version.json'));

assert.equal(version.version,'V77');
assert.match(html,/velocity-apex-version" content="V77"/);
assert.match(html,/SEASON V77/);

assert.match(worker,/const FREE_MAX_PLAYERS=50/);
assert.doesNotMatch(html,/Максимум 20 игроков|открытый город на 20 игроков/);
assert.match(html,/Максимум 50 игроков/);
assert.match(html,/Выберите городской сервер\. Максимум 50 игроков\./);
assert.doesNotMatch(html,/online-free-badge" aria-hidden="true">20</);

assert.match(content,/career50:\{id:'career50'/);
assert.match(content,/level:50,trackId:'career50'/);

assert.match(roam,/kind:'koth',labelOffset:\{x:-76,y:-8\}/);
assert.match(roam,/kind:'levels',labelOffset:\{x:76,y:8\}/);
assert.match(roam,/const lx=z\.x\+\(Number\(z\.labelOffset\?\.x\)\|\|0\)/);

assert.match(market,/\$\('marketCredits'\)\.textContent=state\.data\.balance===null\?'ЗАГРУЗКА…'/);
assert.match(market,/wallet\.setAttribute\('aria-busy',String\(state\.loading\)\)/);
assert.match(html,/css\/v74\.css\?v=20261016-v74/);
assert.match(html,/js\/market\.js\?v=20261016-v74/);

console.log('v74_release_test: OK — version, 50-player copy, 50-level career, label separation and balance loading');
