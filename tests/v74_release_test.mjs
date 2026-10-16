import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const roam=read('public/js/freeroam.js');
const worker=read('src/worker.mjs');
const version=JSON.parse(read('public/version.json'));

assert.equal(version.version,'V76.1');
assert.match(html,/velocity-apex-version" content="V76.1"/);
assert.match(html,/SEASON V76.1/);

assert.match(worker,/const FREE_MAX_PLAYERS=50/);
assert.doesNotMatch(html,/Максимум 20 игроков|открытый город на 20 игроков/);
assert.match(html,/Максимум 50 игроков/);
assert.match(html,/открытый город на 50 игроков/);
assert.match(html,/online-free-badge" aria-hidden="true">50</);

assert.doesNotMatch(html,/КАРЬЕРА<\/strong><small>10 уровней/);
assert.match(html,/КАРЬЕРА<\/strong><small>50 уровней/);
assert.match(html,/50 УРОВНЕЙ · 5 ГЛАВ · TIME ATTACK/);

assert.match(roam,/kind:'koth',labelOffset:\{x:-76,y:-8\}/);
assert.match(roam,/kind:'levels',labelOffset:\{x:76,y:8\}/);
assert.match(roam,/const lx=z\.x\+\(Number\(z\.labelOffset\?\.x\)\|\|0\)/);

assert.match(html,/id="marketCredits">ЗАГРУЗКА…<\/strong>/);
assert.match(html,/class="market-wallet" aria-busy="true"/);
assert.match(html,/css\/v74\.css\?v=20261016-v74/);
assert.match(html,/js\/market\.js\?v=20261016-v74/);

console.log('v74_release_test: OK — version, 50-player copy, 50-level career, label separation and balance loading');
