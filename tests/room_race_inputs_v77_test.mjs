import assert from 'node:assert/strict';
import {RoomRaceInputs} from '../src/room-race-inputs.mjs';
const config={mode:'normal',trackId:'apexCircuit',laps:3,collisions:false},entrants=['a','b'].map(id=>({id,carId:'apexLime',carSave:{ownedLiveries:['apexLime']}})),start=100000;
let room=new RoomRaceInputs(config,entrants,998,start);const initial=room.serialize(),packet={sequence:0,fromFrame:1,inputs:Array.from({length:12},()=>[0,1,0,0])};
assert.throws(()=>room.submit('intruder',packet,start+100),/NOT_RACE_PARTICIPANT/);
for(const extra of [{x:99999},{credits:99999},{laps:3},{result:{won:true}}])assert.throws(()=>room.submit('a',{...packet,...extra},start+100),/UNTRUSTED_RACE_FIELDS/);
assert.throws(()=>room.submit('a',{...packet,fromFrame:100},start),/RACE_CLOCK_AHEAD/);assert.deepEqual(room.serialize(),initial);
const a=room.submit('a',packet,start+100);assert.equal(a.sequence,1);assert.equal(a.frame,0,'prediction inputs cannot advance before server time');room.submit('b',packet,start+100);
const beforeRetry=room.serialize();assert.equal(room.submit('a',packet,start+100).replay,true);assert.deepEqual(room.serialize(),beforeRetry,'network retry cannot execute controls twice');assert.throws(()=>room.submit('a',{...packet,inputs:packet.inputs.map(()=>[0,0,0,0])},start+100),/INPUT_SEQUENCE_REUSED/);
room.advance(start+400);assert.equal(room.world.frame,12);assert(room.world.cars.every(c=>c.speed>0));assert(Object.values(room.pending).every(q=>q.size===0));
const replay=new RoomRaceInputs(config,entrants,998,start,room.serialize());for(let sequence=1;sequence<8;sequence++){const body={sequence,fromFrame:sequence*12+1,inputs:packet.inputs};for(const id of ['a','b']){const time=start+(sequence+1)*200;room.submit(id,body,time);replay.submit(id,body,time);}room.advance(start+(sequence+2)*200);replay.advance(start+(sequence+2)*200);assert.deepEqual(replay.serialize(),room.serialize());}
assert.throws(()=>room.submit('a',packet,start+1800),/INPUT_SEQUENCE_OLD/);
const frame=room.world.frame;room.advance(start+60000);assert.equal(room.world.frame,frame+120,'an alarm cannot trigger unbounded catchup CPU');assert(Object.values(room.pending).every(q=>q.size<=180));
console.log('room_race_inputs_v77_test: identity/field/clock validation, lost-response replay, bounded queues/catchup and deterministic server-clock restore passed');
