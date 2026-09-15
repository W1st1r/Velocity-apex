import assert from 'node:assert/strict';
import worker,{Room} from '../src/worker.mjs';
const storage={async get(){return null},async put(){},async setAlarm(){}};
const sockets=[],ctx={storage,getWebSockets(){return sockets}};
const room=new Room(ctx,{});let identity=null,expired=false,banned=false;
const env={ROOMS:{idFromName(x){return x},get(){return room}},DB:{prepare(sql){return {bind(){return this},async run(){return {}},async first(){if(sql.includes('FROM sessions'))return identity?{token_hash:'test',user_id:'account',username:identity,display_name:'FAKE OWNER',created_at:1,expires_at:expired?1:Date.now()+100000,last_seen_at:Date.now()}:null;if(sql.includes('FROM account_bans'))return banned?{id:'ban',expires_at:Date.now()+100000}:null;throw Error(sql)}}}}};
async function join(name,owner=true,cookie=true){const response=await worker.fetch(new Request('https://game.test/api/free/city-01/join',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie:'va_session=opaque'}:{})},body:JSON.stringify({name,owner,role:'OWNER',username:'w1st1r'})}),env);return {status:response.status,data:await response.json()};}
let r=await join('w1st1r',true,false);assert.equal(r.status,201);assert.equal(r.data.room.players.at(-1).owner,false);
identity='other_player';r=await join('w1st1r');assert.equal(r.status,201);assert.equal(r.data.room.players.at(-1).name,'@other_player');assert.equal(r.data.room.players.at(-1).owner,false);
identity='w1st1r';r=await join('OTHER',false);assert.equal(r.status,201);assert.equal(r.data.room.players.at(-1).name,'@w1st1r');assert.equal(r.data.room.players.at(-1).owner,true);
const owner=room.room.players.at(-1);const sent=[];sockets.push({send(x){sent.push(JSON.parse(x))}});await room.handleFreeMessage(sockets[0],owner,{type:'chat',text:'hello',owner:false});assert.equal(sent.at(-1).owner,true);
const guest=room.room.players[0];await room.handleFreeMessage(sockets[0],guest,{type:'chat',text:'fake',owner:true});assert.equal(sent.at(-1).owner,false);
expired=true;r=await join('w1st1r');assert.equal(r.data.room.players.at(-1).owner,false);expired=false;
banned=true;r=await join('w1st1r');assert.equal(r.status,423);
console.log('free_owner_test: OK — verified account, spoofed role/name, guest, expired session, ban, chat and room broadcasts');
