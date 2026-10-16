import assert from 'node:assert/strict';
import {AuthoritativeRaceClient} from '../public/js/race-client-v77.mjs';
import {RaceSession,RACE_RUNTIME_VERSION} from '../public/js/race-session-v77.mjs';
const cfg={mode:'normal',carId:'apexLime',trackId:'apexCircuit',bots:1,laps:3,difficulty:'easy'},save={ownedLiveries:['apexLime']},server=new RaceSession(cfg,save,43);let sequence=0,drop=true;const receipts=new Map();
const request=async(action,body)=>{assert.equal(action,'input');const key=body.sequence;if(receipts.has(key)){assert.deepEqual(body.inputs,receipts.get(key).input);return receipts.get(key).response;}assert.equal(key,sequence);server.advance(body.inputs);sequence++;const response={sequence,state:server.serialize()};receipts.set(key,{input:body.inputs,response});if(drop){drop=false;throw Error('response lost after server commit');}return response;};
const client=new AuthoritativeRaceClient({raceId:'race-fixture-0001',config:cfg,carSave:save,seed:43,sequence:0,state:server.serialize()},request);
for(let i=0;i<120;i++)client.step([0,1,0,0]);await client.sending.catch(()=>{});assert.equal(client.queue.length,120);assert.equal(server.frame,120);
await client.flush(true);assert.equal(server.frame,120,'retry must not double the simulated time');assert.equal(client.queue.length,0);assert.equal(client.engine.player.x,server.player.x);
for(let i=0;i<60;i++)client.step([.1,1,0,0]);await client.flush(true);assert.equal(server.frame,180);assert.deepEqual(client.engine.serialize(),server.serialize());assert.equal(client.sequence,2);
console.log('race_client_v77_test: lost post-commit response, same-sequence retry, bounded controls queue and authoritative state correction passed');

const {startAuthoritativeRace}=await import('../public/js/race-client-v77.mjs');
const memory=new Map();globalThis.sessionStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const key='velocityApex.race.session.v77';
const prior={raceId:'prior-race',config:cfg,carSave:save,seed:43,sequence:0,state:new RaceSession(cfg,save,43).serialize(),status:'active',runtimeVersion:RACE_RUNTIME_VERSION};
for(const fresh of [false,true]){
 memory.set(key,JSON.stringify({raceId:prior.raceId,config:cfg,requestId:'prior-start'}));const actions=[];
 const resumed=await startAuthoritativeRace(cfg,async(action,body)=>{actions.push(action);if(action==='resume')return prior;if(action==='cancel'){assert.equal(body.raceId,prior.raceId);return {ok:true};}if(action==='start')return {...prior,raceId:'new-race'};throw Error(action);},{fresh});
 assert.deepEqual(actions,fresh?['resume','cancel','start']:['resume']);assert.equal(resumed.raceId,fresh?'new-race':'prior-race');
}
memory.set(key,JSON.stringify({raceId:prior.raceId,config:cfg}));const actions=[];
await startAuthoritativeRace(cfg,async action=>{actions.push(action);return action==='resume'?{...prior,state:{...prior.state,result:{completed:true}}}:prior;},{fresh:true});
assert.deepEqual(actions,['resume','finish','start'],'earned result must settle before a fresh race');
console.log('race_client_v77_test: reload recovery, explicit restart and pending-result settlement passed');
