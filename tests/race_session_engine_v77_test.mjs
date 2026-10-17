import assert from 'node:assert/strict';
import {RaceSession,validateRaceConfig} from '../public/js/race-session-v77.mjs';
import {createRaceRuntime} from '../public/js/race-runtime-v77.mjs';
const save={ownedLiveries:['apexLime','apollo-evo'],carUpgrades:{'apollo-evo':{speed:5,acceleration:5,brakes:5}},careerUnlocked:1};
for(const spec of [{mode:'normal',trackId:'apexCircuit',bots:3,laps:3,difficulty:'hard'},{mode:'drift',trackId:'sierraFlow',bots:1,difficulty:'medium'}]){
 const config=validateRaceConfig({...spec,carId:'apollo-evo'},save),live=new RaceSession(config,save,643),D=createRaceRuntime(87),driver=new D.AIController(live.player,0,'extreme');driver.driftMode=spec.mode==='drift';let restored=new RaceSession(config,save,643),frames=0;
 while(!live.result&&frames<18000){const o=driver.think(1/60,live.track,live.cars),input=[o.steer,o.throttle,o.brake,o.handbrake||0];live.step(input);restored.step(input);frames++;if(frames%120===0){assert.deepEqual(restored.serialize(),live.serialize(),'state restore must preserve physics, AI and RNG');restored=new RaceSession(config,save,643,restored.serialize());}}
 assert.ok(live.result?.completed,`${spec.mode}: actual physics must finish`);assert.deepEqual(restored.result,live.result);assert.ok(live.result.timeMs>10000);console.log(`race_session_engine_v77_test: ${spec.mode}, ${frames} frames, AI collisions/checkpoints and repeated restore match exactly`);
}
