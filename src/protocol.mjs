export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LAP_OPTIONS = Object.freeze([3,5,7,10,15]);
export const MAX_PLAYERS_MIN = 2;
export const MAX_PLAYERS_MAX = 8;
export const MAX_MESSAGE_BYTES = 4096;
export const PLAYER_STATE_RATE_MS = 45;
export const RECONNECT_GRACE_MS = 25000;
export const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
export const ROOM_TTL_MS = 8 * 60 * 60 * 1000;
export const TRACK_IDS = Object.freeze(['apexCircuit','neonHarbor','desertCanyon','alpineRing','coastlineGT','auroraGrandLoop']);

export function generateRoomCode(randomByte = () => crypto.getRandomValues(new Uint8Array(1))[0]) {
  let out='';
  for(let i=0;i<6;i++) out += ROOM_CODE_ALPHABET[randomByte() % ROOM_CODE_ALPHABET.length];
  return out;
}
export function normalizeRoomCode(value){ return String(value||'').toUpperCase().replace(/\s+/g,''); }
export function validRoomCode(value){ const v=normalizeRoomCode(value); return v.length===6 && [...v].every(c=>ROOM_CODE_ALPHABET.includes(c)); }
export function sanitizeNickname(value){ return String(value||'').trim().replace(/\s+/g,' '); }
export function validNickname(value){
  const v=sanitizeNickname(value);
  if(v.length<2||v.length>12) return false;
  return /^[\p{L}\p{N}_\- .]+$/u.test(v) && !/[<>"'`\\/]/.test(v);
}
export function validSettings(value){
  return !!value && typeof value==='object' && TRACK_IDS.includes(value.trackId) && LAP_OPTIONS.includes(value.laps) &&
    Number.isInteger(value.maxPlayers) && value.maxPlayers>=2 && value.maxPlayers<=8 && typeof value.collisions==='boolean';
}
export function normalizeSettings(value={}){
  return {trackId:TRACK_IDS.includes(value.trackId)?value.trackId:'apexCircuit',laps:LAP_OPTIONS.includes(value.laps)?value.laps:5,
    maxPlayers:Number.isInteger(value.maxPlayers)?Math.max(2,Math.min(8,value.maxPlayers)):8,collisions:value.collisions===true};
}
export function finiteNumber(v,min=-Infinity,max=Infinity){ return typeof v==='number' && Number.isFinite(v) && v>=min && v<=max; }
export function validPlayerState(s){
  if(!s||typeof s!=='object')return false;
  return Number.isInteger(s.seq)&&s.seq>=0&&s.seq<=Number.MAX_SAFE_INTEGER && finiteNumber(s.clientTime,0,Number.MAX_SAFE_INTEGER) &&
    finiteNumber(s.x,-100000,100000)&&finiteNumber(s.y,-100000,100000)&&finiteNumber(s.vx,-1200,1200)&&finiteNumber(s.vy,-1200,1200)&&
    finiteNumber(s.angle,-1000,1000)&&finiteNumber(s.speed,0,650)&&finiteNumber(s.yawRate,-20,20)&&finiteNumber(s.progress,0,1.0001)&&
    Number.isInteger(s.laps)&&s.laps>=0&&s.laps<=100&&Number.isInteger(s.checkpoint)&&s.checkpoint>=0&&s.checkpoint<=10000&&
    finiteNumber(s.steer,-1,1)&&finiteNumber(s.throttle,0,1)&&finiteNumber(s.brake,0,1)&&typeof s.finished==='boolean';
}
export function shortestAngleLerp(a,b,t){
  let d=(b-a)%(Math.PI*2); if(d>Math.PI)d-=Math.PI*2; if(d<-Math.PI)d+=Math.PI*2; return a+d*t;
}
export function rankPlayers(players){
  return [...players].sort((a,b)=>{
    if(a.finishPlace&&b.finishPlace)return a.finishPlace-b.finishPlace;
    if(a.finishPlace)return-1;if(b.finishPlace)return 1;
    const am=(a.state?.laps||0)+(a.state?.progress||0),bm=(b.state?.laps||0)+(b.state?.progress||0);
    return bm-am;
  });
}
export function parseClientMessage(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_MESSAGE_BYTES)return {ok:false,error:'message_too_large'};
  let msg;try{msg=JSON.parse(raw);}catch{return {ok:false,error:'malformed_json'};}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')return {ok:false,error:'invalid_message'};
  return {ok:true,msg};
}
