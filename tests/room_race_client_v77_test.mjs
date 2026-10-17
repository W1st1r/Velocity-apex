import assert from 'node:assert/strict';
import {RoomRaceClient,RACE_RUNTIME_VERSION} from '../public/js/race-room-client-v77.mjs';
import {RoomRaceInputs} from '../src/room-race-inputs.mjs';
const config={mode:'normal',trackId:'apexCircuit',laps:3,collisions:true},entrants=['a','b'].map(id=>({id,carId:'apexLime',carSave:{ownedLiveries:['apexLime']}})),startsAt=100000,raceId='transport-race';let server=new RoomRaceInputs(config,entrants,73,startsAt),clock=startsAt;
const requests=[],counts=new Map(),networks=new Map(),clients=new Map();let lost=false,retried=false,evicted=false,resumed=false;
const authority=()=>({runtimeVersion:RACE_RUNTIME_VERSION,config,entrants,seed:73,startsAt,state:server.world.serialize(),sequences:{...server.sequences}});
class Network extends EventTarget{constructor(id){super();this.id=id;this.connected=true;}send(message){if(!this.connected)return false;requests.push({id:this.id,message:structuredClone(message)});return true;}emit(detail){this.dispatchEvent(new CustomEvent('message',{detail}));}}
for(const e of entrants){const network=new Network(e.id);networks.set(e.id,network);clients.set(e.id,new RoomRaceClient({raceId,playerId:e.id,authority:authority(),network}));}
function drain(){let guard=0;while(requests.length){assert(++guard<100,'no recursive sync loop');const {id,message:m}=requests.shift(),network=networks.get(id);if(!network.connected)continue;
 if(m.type==='race_sync'){network.emit({type:'race_sync',raceId,room:{raceId,authority:authority()},authority:authority()});continue;}
 assert.equal(m.type,'race_inputs');assert.deepEqual(Object.keys(m.packet).sort(),['fromFrame','inputs','sequence']);const key=id+':'+m.packet.sequence;counts.set(key,(counts.get(key)||0)+1);if(counts.get(key)>1)retried=true;
 try{const ack=server.submit(id,m.packet,clock);if(id==='a'&&m.packet.sequence===0&&!lost){lost=true;continue;}network.emit({type:'race_input_ack',raceId,sequence:ack.sequence,frame:ack.frame});}catch(e){network.emit({type:'error',code:e.message});}
}}
for(let frame=0;frame<720;frame++){
 clock=startsAt+Math.ceil(frame*1000/60);
 if(frame===180)networks.get('a').connected=false;
 if(frame===300){networks.get('a').connected=true;networks.get('a').emit({type:'hello',room:{raceId,authority:authority()}});resumed=true;}
 if(frame===420){const before=server.serialize();server=new RoomRaceInputs(config,entrants,73,startsAt,before);assert.deepEqual(server.serialize(),before);evicted=true;}
 for(const [id,client] of clients)client.advance([id==='a'?.12:-.1,1,0,0],clock);
 drain();server.advance(clock);
 if(frame>30&&frame%6===0)for(const network of networks.values())if(network.connected)network.emit({type:'race_world',raceId,runtimeVersion:RACE_RUNTIME_VERSION,state:server.world.serialize(),sequences:{...server.sequences}});
 for(const c of clients.values()){assert(c.inputs.size<=181);assert(c.unsent.size<=181);assert(c.engine.frame<=c.serverFrame+180);}
}
assert(lost&&retried&&evicted&&resumed);clock+=500;for(const c of clients.values())c.flush(clock);drain();server.advance(clock);
for(const [id,network] of networks){network.emit({type:'race_sync',raceId,room:{raceId,authority:authority()},authority:authority()});assert.deepEqual(clients.get(id).engine.serialize(),server.world.serialize(),'server state must win after reconnect/prediction');}
assert.equal(Object.keys(server.world.results).length,0,'there is no client supplied finish path');const before=requests.length;for(const c of clients.values()){c.dispose();c.advance([0,1,0,0],clock+1000);}assert.equal(requests.length,before);
console.log('room_race_client_v77_test: two live control streams, dropped post-commit ACK, same-sequence retry, disconnect/resume, server eviction, bounded prediction and disposal passed');
