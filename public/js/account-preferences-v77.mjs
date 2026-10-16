import {createRaceRuntime} from './race-runtime-v77.mjs';
const catalog=createRaceRuntime(1),oneOf=values=>v=>values.includes(v),count=v=>Number.isInteger(v)&&v>=1&&v<=13;
const rules=Object.freeze({muted:v=>typeof v==='boolean',botCount:count,raceLaps:oneOf([3,5,7,10,15]),difficulty:v=>Object.hasOwn(catalog.DIFFICULTY_LABELS,v),trackId:v=>typeof v==='string'&&Object.hasOwn(catalog.TRACKS,v),driftBotCount:count,driftDifficulty:v=>Object.hasOwn(catalog.DIFFICULTY_LABELS,v),driftTrackId:v=>typeof v==='string'&&Object.hasOwn(catalog.DRIFT_TRACKS,v),controlMode:oneOf(['arrows','tilt','wheel']),tiltSensitivity:oneOf(['low','medium','high'])});
export const PREFERENCE_KEYS=Object.freeze(Object.keys(rules));
export function validatePreferences(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_PREFERENCES');
 const result={};for(const key of Object.keys(raw)){if(!Object.hasOwn(rules,key))throw Error('SERVER_STATE_ONLY');if(!rules[key](raw[key]))throw Error('INVALID_PREFERENCES');result[key]=raw[key];}return result;
}
export function preferencesFromSave(save){const result={};for(const key of PREFERENCE_KEYS)if(Object.hasOwn(save||{},key)&&rules[key](save[key]))result[key]=save[key];return result;}
