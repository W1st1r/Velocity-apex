import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Room} from '../src/worker.mjs';
import {RACE_RUNTIME_VERSION,roomEngine} from '../src/room-race-authority.mjs';
import {RaceRoomSession} from '../public/js/race-room-session-v77.mjs';
import {createRaceRuntime} from '../public/js/race-runtime-v77.mjs';
const sql=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let tail=Promise.resolve(),failPayout=false;
const DB={prepare(query){let args=[];return{bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){if(failPayout&&query.startsWith('UPDATE player_saves')&&query.includes('settlement_token')){failPayout=false;throw Error('INJECTED_PAYOUT_FAILURE');}const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){let release;const prior=tail;tail=new Promise(r=>release=r);await prior;sql.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}finally{release();}}};
class Storage{constructor(){this.m=new Map();}async get(k){return structuredClone(this.m.get(k));}async put(k,v){this.m.set(k,structuredClone(v));}async setAlarm(v){this.at=v;}async deleteAll(){this.m.clear();}}
class Ctx{constructor(){this.storage=new Storage();this.sockets=[];}getWebSockets(){return this.sockets;}}
class WS{constructor(id){this.a={playerId:id};this.sent=[];}deserializeAttachment(){return this.a;}serializeAttachment(a){this.a=a;}send(s){this.sent.push(JSON.parse(s));}close(){}}
const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
const t=clock,env={DB},ctx=new Ctx();let room=new Room(ctx,env);
for(const [id,carId] of [['user-a','apollo-evo'],['user-b','apexLime']]){sql.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'x','x',t,t);sql.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(id,JSON.stringify({credits:1000,ownedLiveries:[carId],ownedEffects:['standard'],carUpgrades:{[carId]:{speed:5,acceleration:5,brakes:5}},careerUnlocked:7,legacy:{preserve:true}}),t,t);}
const request=(path,body)=>new Request('https://room.internal'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),send=(ws,msg)=>room.webSocketMessage(ws,JSON.stringify({v:1,...msg})),credits=id=>JSON.parse(sql.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json).credits;
try{
 const a=await(await room.fetch(request('/create',{code:'AUTH23',userId:'user-a',name:'RACER A',settings:{trackId:'apexCircuit',laps:3,maxPlayers:2,wager:250,collisions:true},loadout:{liveryId:'apollo-evo'}}))).json();
 const b=await(await room.fetch(request('/join',{userId:'user-b',name:'RACER B',loadout:{liveryId:'apexLime'}}))).json();
 const wa=new WS(a.playerId),wb=new WS(b.playerId);ctx.sockets=[wa,wb];for(const p of room.room.players)p.connected=true;
 for(const ws of [wa,wb]){await send(ws,{type:'wager_confirm',amount:250,balance:999999999});await send(ws,{type:'ready',ready:true,runtimeVersion:'old-client'});assert(ws.sent.some(x=>x.code==='RACE_CLIENT_UPDATE_REQUIRED'));await send(ws,{type:'ready',ready:true,runtimeVersion:RACE_RUNTIME_VERSION});}
 const originalUser=room.room.players[1].userId;room.room.players[1].userId=room.room.players[0].userId;await send(wa,{type:'start_race',runtimeVersion:RACE_RUNTIME_VERSION});assert.equal(room.room.status,'lobby');assert(wa.sent.some(x=>x.code==='DUPLICATE_RACE_ACCOUNT'));room.room.players[1].userId=originalUser;
 const participant=room.room.players[0],owned=participant.liveryId;participant.liveryId='koenigsegg-jesko';await send(wa,{type:'start_race',runtimeVersion:RACE_RUNTIME_VERSION});assert.equal(room.room.status,'lobby');assert.equal(credits('user-a'),1000);assert(wa.sent.some(x=>x.code==='CAR_NOT_OWNED'));participant.liveryId=owned;
 await send(wa,{type:'start_race',runtimeVersion:RACE_RUNTIME_VERSION,credits:999999999,carUpgrades:{speed:999}});assert.equal(room.room.status,'countdown');assert.equal(credits('user-a'),750);assert.equal(credits('user-b'),750);
 const raceId=room.room.raceId,authority=room.room.raceAuthority,startsAt=room.room.raceStartAt;assert.equal(authority.entrants[0].carSave.carUpgrades[owned].speed,5,'tuning must come from D1');
 await send(wa,{type:'race_finish',raceId,state:{laps:3,finished:true}});assert(wa.sent.some(x=>x.code==='SERVER_RACE_REQUIRED'));assert.equal(credits('user-a'),750);
 await send(wa,{type:'race_inputs',raceId,runtimeVersion:RACE_RUNTIME_VERSION,packet:{sequence:0,fromFrame:1,inputs:[[0,1,0,0]],credits:999999}});assert(wa.sent.some(x=>x.code==='UNTRUSTED_RACE_FIELDS'));assert.equal(roomEngine(room).world.frame,0);
 await send(wa,{type:'race_inputs',raceId,runtimeVersion:RACE_RUNTIME_VERSION,packet:{sequence:0,fromFrame:100000,inputs:[[0,1,0,0]]}});assert(wa.sent.some(x=>x.code==='RACE_CLOCK_AHEAD'));
 const model=new RaceRoomSession(authority.config,authority.entrants,authority.seed,authority.state.world),R=createRaceRuntime(17),drivers=model.cars.map((c,i)=>new R.AIController(c,i,'extreme'));let frames=0,sequence=0,recovered=false;failPayout=true;
 while(model.finishOrder.length<2&&frames<18000){
  const fromFrame=frames+1,packets=Object.fromEntries(model.cars.map(c=>[c.id,[]]));for(let i=0;i<12;i++){const inputs={};for(let j=0;j<model.cars.length;j++){const c=model.cars[j],v=drivers[j].think(1/60,model.track,model.cars);inputs[c.id]=[v.steer,v.throttle,v.brake,0];packets[c.id].push(inputs[c.id]);}model.step(inputs);frames++;}
  clock=startsAt+Math.ceil(frames/60*1000)+1;
  for(const ws of [wa,wb]){const packet={type:'race_inputs',raceId,runtimeVersion:RACE_RUNTIME_VERSION,packet:{sequence,fromFrame,inputs:packets[ws.a.playerId]}};await send(ws,packet);if(sequence===0){const snapshot=roomEngine(room).world.serialize();await send(ws,packet);assert.deepEqual(roomEngine(room).world.serialize(),snapshot,'a replay cannot rerun physics');}}
  if(!recovered&&frames>=1200){const state=roomEngine(room).serialize();room=new Room(ctx,env);await room.load();assert.deepEqual(roomEngine(room).serialize(),state,'DO eviction must preserve sequences, queued controls, physics and RNG');recovered=true;}
  sequence++;
 }
 assert.equal(model.finishOrder.length,2,'automatic drivers must actually finish');clock+=220;await send(wa,{type:'race_sync',raceId,runtimeVersion:RACE_RUNTIME_VERSION});await send(wb,{type:'race_sync',raceId,runtimeVersion:RACE_RUNTIME_VERSION});
 const server=roomEngine(room).world;assert.deepEqual(server.finishOrder,model.finishOrder);assert.equal(room.room.settlement.status,'awarded');assert.equal(room.room.settlement.winnerId,server.finishOrder[0]);assert.equal(failPayout,false,'injected payout failure was exercised');assert(wa.sent.concat(wb.sent).some(x=>x.code==='INJECTED_PAYOUT_FAILURE'));
 for(const p of room.room.players){assert.equal(credits(p.userId),p.finishPlace===1?1250:750);assert(p.finishPlace>0);assert.equal(room.room.raceAuthority.settledPlayers[p.id].exp,90);}
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM progression_rewards WHERE event_id=?').get(raceId).n,2);assert.equal(sql.prepare('SELECT COUNT(*) n FROM owner_results WHERE race_id=?').get(raceId).n,2);
 const balances=[credits('user-a'),credits('user-b')];await send(wa,{type:'race_sync',raceId,runtimeVersion:RACE_RUNTIME_VERSION});await send(wa,{type:'race_finish',raceId,credits:999999});assert.deepEqual([credits('user-a'),credits('user-b')],balances);
 for(const id of ['user-a','user-b']){const s=JSON.parse(sql.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json);assert.equal(s.careerUnlocked,7);assert.deepEqual(s.legacy,{preserve:true});}
 console.log('online_authority_v77_test:',frames,'actual physics frames; real Room controls/ownership, no client finish payout, wager+EXP, durable eviction, replay and payout-failure recovery passed');
}finally{Date.now=originalNow;sql.close();}
