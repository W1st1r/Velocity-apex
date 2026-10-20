import assert from 'node:assert/strict';
import {RaceSession,validateGhostKeyframes,interpolateGhostKeyframes} from '../public/js/race-session-v77.mjs';
import {imageType,imageDimensions,safeDiagnostics} from '../src/bug-reports.mjs';

const frames=[[0,0,0,3.1,0,0,0],[12,12,0,-3.1,.1,0,1],[24,24,0,-3,.2,0,2]];
assert.equal(validateGhostKeyframes(frames),true,'server generated compact samples validate');
const middle=interpolateGhostKeyframes(frames,.05);
assert.ok(middle&&middle.x>0&&middle.x<12,'position interpolates at requested progress');
assert.ok(Math.abs(Math.abs(middle.angle)-Math.PI)<.1,'angle interpolation crosses wrap smoothly');
assert.equal(validateGhostKeyframes([[1,0,0,0,.1,0,0],[12,1,0,0,.2,0,1]]),false,'record requires start frame');
assert.equal(validateGhostKeyframes([[0,0,0,0,0,0,0],[1,500,0,0,.1,0,1]]),false,'teleport samples are rejected');
assert.equal(interpolateGhostKeyframes([[0,0,0,0,0,0,0]],0),null,'short/corrupt record cannot play');
const config={mode:'normal',carId:'apexLime',trackId:'apexCircuit',bots:1,laps:3,difficulty:'easy'},save={ownedLiveries:['apexLime']},inputs=Array.from({length:36},()=>[0,1,0,0]),plain=new RaceSession(config,save,77),sampled=new RaceSession(config,save,77);plain.advance(inputs);const captured=sampled.advanceWithSamples(inputs);assert.deepEqual(sampled.serialize(),plain.serialize(),'adding ghost sampling cannot change simulation state');assert.ok(captured.frames.length>0);

const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png[19]=2;png[23]=3;
assert.equal(imageType(png),'image/png');assert.deepEqual(imageDimensions(png,'image/png'),{w:2,h:3});
assert.equal(imageType(new Uint8Array([0x4d,0x5a,0,0])),'','executables are rejected');
const diagnostics=safeDiagnostics(JSON.stringify({gameVersion:'V77',build:'2.0.0-dev',screen:'supportOverlay',device:'iPhone; token=secret',browser:'Safari',recentErrors:['TypeError','https://host/?token=secret']}));
assert.equal(diagnostics.device,'','raw user agent and arbitrary text are not retained');
assert.deepEqual(diagnostics.recentErrors,['TypeError'],'diagnostics retain only safe error classes');
assert.equal(diagnostics.screen,'','unrecognized screen labels are discarded');
console.log('V2 bug report and ghost unit tests passed');
