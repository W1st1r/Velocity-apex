import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{Racing:{}}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/ghost-playback.js','utf8'),context);
const Ghost=context.window.Racing.GhostReplay;
const frames=[[0,0,0,3.1,.0,0,0],[60,100,50,-3.1,.5,0,1],[120,160,100,-2,.99,0,3],[180,210,90,-1,.1,1,0]];
const g=new Ghost(frames);
assert.equal(g.atTime(0).x,0);assert.equal(g.atTime(.5).x,50);
assert(Math.abs(g.atTime(.5).angle)>3,'angle crosses the short arc around PI');
for(const playerProgress of [0,.1,.9,1.5,-2]){g.atProgress(playerProgress);assert.equal(g.atTime(1).x,100,'HUD/player position cannot move the ghost');}
assert.equal(g.atTime(3).x,210);assert.equal(g.atTime(100).x,210,'hold final pose after ghost finishes');
assert.equal(g.atTime(-1).x,0);assert.equal(g.atTime(NaN),null);
assert.equal(g.atProgress(.5).frame,60);assert(g.atProgress(1.05).frame>120,'lap boundary remains continuous');
for(const hz of [30,60,120]){let previous=g.atTime(0);for(let n=1;n<=hz*3;n++){const next=g.atTime(n/hz);assert(Math.hypot(next.x-previous.x,next.y-previous.y)<5,'smooth bounded movement');previous=next;}assert.equal(previous.x,210);}
const paused=g.atTime(1);for(let n=0;n<20;n++)assert.deepEqual(g.atTime(1),paused,'unchanged simulation clock freezes pause/background replay');
assert(g.atTime(1.1).x>paused.x,'resume uses simulation time');
for(const bad of [[],[[0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0],[0,1,1,0,0,0,0]],[[0,0,0,0,0,0,0],[1,Infinity,0,0,0,0,0]]])assert.throws(()=>new Ghost(bad));
for(const index of [0,1,2,3,4,5,6]){const bad=frames.map(f=>f.slice());bad[1][index]=index===0?.5:index===4?2:1e100;assert.throws(()=>new Ghost(bad),'reject corrupt keyframe field '+index);}
const game=fs.readFileSync('public/js/game.js','utf8');
assert(game.includes('ghostReplay.atTime(playbackTime)'));assert(!game.includes('const p=ghostAtProgress(player.laps+player.progress)'));
const draw=game.slice(game.indexOf('  function drawGhost()'),game.indexOf('\n\n  const save'));
assert(!/cars\.push|collide|award|reward|\.update\(/.test(draw),'ghost cannot enter physics/rewards');
console.log('v202 ghost PASS: independent time, stationary/slower/faster/offtrack player, shortest angle, lap/finish, pause, 30/60/120 FPS, no physics/reward hooks');
