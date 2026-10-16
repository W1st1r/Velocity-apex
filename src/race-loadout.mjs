import {settings} from './owner.mjs';
import {CARS} from './car-catalog.mjs';
// The same ownership/performance snapshot is used by solo and room authorities.
export async function freezeRaceLoadout(env,userId,carId,{isAdmin=false,save=null,owner=null}={}){
 if(!env.DB||!userId)throw Error('AUTH_REQUIRED');
 if(!save){const row=await env.DB.prepare('SELECT save_json FROM player_saves WHERE user_id=?').bind(userId).first();if(!row)throw Error('SAVE_NOT_FOUND');save=JSON.parse(row.save_json);}
 if(!Object.hasOwn(CARS,carId)||(carId!=='apexLime'&&(!Array.isArray(save.ownedLiveries)||!save.ownedLiveries.includes(carId))))throw Error('CAR_NOT_OWNED');
 owner=owner||await settings(env);const override={...(owner.cars?.[carId]||{})};
 if(!isAdmin&&(override.enabled===false||override.unavailable))throw Error('CAR_UNAVAILABLE');
 if(isAdmin){delete override.enabled;delete override.unavailable;}
 const personal=await env.DB.prepare('SELECT value FROM owner_tuning WHERE user_id=? AND car_id=?').bind(userId,carId).first();
 return {ownedLiveries:[carId],carUpgrades:{[carId]:save.carUpgrades?.[carId]||{}},bestLap:Number(save.bestLap)||0,ownerCars:{[carId]:override},ownerTuning:{[carId]:personal?JSON.parse(personal.value):{}}};
}
