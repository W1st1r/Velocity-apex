import assert from 'node:assert/strict';
import {RaceRoomSession} from '../public/js/race-room-session-v77.mjs';
import {createRaceRuntime} from '../public/js/race-runtime-v77.mjs';
const entrants=[{id:'racer-a',carId:'apollo-evo',carSave:{ownedLiveries:['apollo-evo'],carUpgrades:{'apollo-evo':{speed:5,acceleration:5,brakes:5}}}},{id:'racer-b',carId:'apexLime',carSave:{ownedLiveries:['apexLime']}}];
for(const mode of ['normal','drift']){
 const cfg={mode,trackId:mode==='normal'?'apexCircuit':'sierraFlow',laps:1,collisions:true};let world=new RaceRoomSession(cfg,entrants,843),restored=new RaceRoomSession(cfg,entrants,843);const R=createRaceRuntime(3),drivers=world.cars.map((car,i)=>{const d=new R.AIController(car,i,'extreme');d.driftMode=mode==='drift';return d;});let frame=0;
 const before=world.serialize();assert.throws(()=>world.step({'racer-a':[0,1,0,0],'racer-b':[NaN,1,0,0]}),/INVALID_CONTROLS/);assert.deepEqual(world.serialize(),before,'invalid inputs must not partially advance the world');assert.throws(()=>world.step({intruder:[0,1,0,0]}),/INVALID_ROOM_INPUT/);
 while(world.finishOrder.length<2&&frame<16000){
  const inputs=Object.fromEntries(world.cars.map((c,i)=>{const o=drivers[i].think(1/60,world.track,world.cars);return[c.id,[o.steer,o.throttle,o.brake,o.handbrake||0]];}));world.step(inputs);restored.step(inputs);frame++;
  if(frame%120===0){assert.deepEqual(restored.serialize(),world.serialize());restored=new RaceRoomSession(cfg,entrants,843,restored.serialize());}
 }
 assert.equal(world.finishOrder.length,2,mode+' server physics must finish both human control streams');assert.deepEqual(restored.serialize(),world.serialize());assert.equal(new Set(world.finishOrder).size,2);assert.equal(Object.keys(world.results).length,2);assert(world.results['racer-a'].timeMs>10000);assert(world.cars[0].maxSpeed>world.cars[1].maxSpeed,'owned car upgrades must affect the server physics');
 console.log('race_room_engine_v77_test:',mode,frame,'frames, two independent human inputs, shared collision/checkpoints, owned tuning and deterministic restore passed');
}
