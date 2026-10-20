import fs from 'node:fs';
import vm from 'node:vm';
import {CARS} from '../src/car-catalog.mjs';

const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../public/js/content.js',import.meta.url),'utf8'),context);
const performance=context.window.Racing.CAR_PERFORMANCE;
for(const [id,car] of Object.entries(CARS)){
  const stats=performance[id];
  if(!stats)throw new Error(`Client performance is missing ${id}`);
  Object.assign(car,{maxSpeed:stats.maxSpeed,accel:stats.accel,brakePower:stats.brakePower,turnRate:stats.turnRate,drift:stats.drift,physicsVersion:2});
  if(car.upgrades?.speed)car.upgrades.speed.step=Math.min(.01,Number(car.upgrades.speed.step)||.01);
}
fs.writeFileSync(new URL('../src/car-catalog.mjs',import.meta.url),`export const CARS=${JSON.stringify(CARS,null,2)};\n`);
console.log(`Synchronized ${Object.keys(CARS).length} server car records with km/h catalog values`);
