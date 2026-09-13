import assert from 'node:assert/strict';
import {generateRoomCode,validRoomCode,validNickname,validSettings,normalizeSettings,validPlayerState,parseClientMessage,shortestAngleLerp} from '../src/protocol.mjs';

const bytes=[0,1,2,3,4,5];let bi=0;const code=generateRoomCode(()=>bytes[bi++%bytes.length]);
assert.equal(code.length,6);assert.ok(validRoomCode(code));assert.ok(validRoomCode(code.toLowerCase()));assert.equal(validRoomCode('OI01AA'),false);
assert.ok(validNickname('Racer 7'));assert.ok(validNickname('ГОНЩИК'));assert.equal(validNickname('<img>'),false);assert.equal(validNickname('A'),false);
assert.ok(validSettings({trackId:'apexCircuit',laps:5,maxPlayers:8,collisions:false}));assert.ok(validSettings({trackId:'auroraGrandLoop',laps:5,maxPlayers:8,collisions:false}));assert.equal(validSettings({trackId:'bad',laps:5,maxPlayers:8,collisions:false}),false);
assert.deepEqual(normalizeSettings({trackId:'bad',laps:99,maxPlayers:22,collisions:true}),{trackId:'apexCircuit',laps:5,maxPlayers:8,collisions:true});
const snap={seq:1,clientTime:1,x:10,y:20,vx:1,vy:2,angle:Math.PI-.02,speed:200,yawRate:.1,progress:.5,laps:1,checkpoint:2,steer:.2,throttle:.8,brake:0,finished:false};
assert.ok(validPlayerState(snap));assert.ok(validPlayerState({...snap,speed:510,vx:510}));assert.equal(validPlayerState({...snap,x:Infinity}),false);assert.equal(validPlayerState({...snap,speed:651}),false);assert.equal(validPlayerState({...snap,speed:900}),false);
assert.equal(parseClientMessage('{bad').ok,false);assert.equal(parseClientMessage(JSON.stringify({type:'ready',ready:true})).ok,true);assert.equal(parseClientMessage('x'.repeat(5000)).ok,false);
const a=Math.PI-.05,b=-Math.PI+.05,mid=shortestAngleLerp(a,b,.5);assert.ok(Math.abs(Math.abs(mid)-Math.PI)<.02,'angle interpolation must wrap across ±π');
console.log('online_protocol_test: OK');
