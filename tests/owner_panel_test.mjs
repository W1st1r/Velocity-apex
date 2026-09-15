import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker,{Room} from '../src/worker.mjs';
import {recordResult} from '../src/owner.mjs';
const db=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}},async batch(statements){const out=[];db.exec('BEGIN');try{for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('base64url');
const t=Date.now();for(let i=0;i<2;i++){db.prepare('INSERT INTO users (id,username,display_name,password_hash,password_salt,password_iterations,created_at,updated_at,last_login_at) VALUES (?,?,?,?,?,?,?,?,?)').run(ids[i],i?'player':'w1st1r',i?'Player':'Owner','x','x',100000,t,t,t);db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(await hash(i?'player':'owner'),ids[i],t,t+86400000,t);}
const rooms=new Map();const env={DB,ROOMS:{idFromName:x=>x,get(id){if(!rooms.has(id)){const sockets=[];const ctx={storage:{async get(){return null},async put(){},async setAlarm(){}},getWebSockets:()=>sockets};const r=new Room(ctx,env);r.testSockets=sockets;rooms.set(id,r);}return rooms.get(id)}}};
async function call(path,body,who='owner'){const r=await worker.fetch(new Request('https://apex.test'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'va_session='+who,origin:'https://apex.test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return {status:r.status,...await r.json()};}
await call('/api/owner/runtime',{location:'menu'});db.prepare('INSERT INTO admin_unlocks VALUES (?,?,?,?)').run(await hash('owner'),ids[0],t,t+999999);
assert.equal((await call('/api/owner/summary',undefined,'player')).status,403);
assert.equal((await call('/api/owner/summary')).online,1);
await call('/api/owner/runtime',{location:'garage'},'player');assert.equal((await call('/api/owner/summary')).online,2);
let summary=await call('/api/owner/summary');const car=Object.keys(summary.cars).find(k=>k!=='apexLime');
assert.equal((await call('/api/owner/car/'+car,{action:'save',values:{maxSpeed:9000,price:321,limited:true,category:'rare'}})).status,200);
assert.equal((await call('/api/owner/runtime',{location:'menu'},'player')).cars[car].maxSpeed,9000);
assert.equal((await call('/api/owner/car/'+car,{action:'save',values:{maxSpeed:-1}})).status,400);
assert.equal((await call('/api/owner/car/'+car,{action:'personal',userId:ids[0],values:{maxSpeed:9999,accel:8888}})).status,200);
assert.equal((await call('/api/owner/runtime',{location:'menu'})).tuning[car].maxSpeed,9999);
assert.equal((await call('/api/owner/runtime',{location:'menu'},'player')).tuning[car],undefined);
await call('/api/owner/car/'+car,{action:'grantAll'});await call('/api/owner/runtime',{location:'menu'},'player');assert.ok((await call('/api/owner/profile/'+ids[1])).save.ownedLiveries.includes(car));
db.prepare("INSERT INTO referrals (invited_user_id,inviter_user_id,status,reward_credits,reason,created_at) VALUES (?,?,?,?,?,?)").run(ids[0],ids[1],'rewarded',1500,'',t);
await recordResult(env,'drag1',ids[1],'drag',true,5300);await recordResult(env,'drag1',ids[1],'drag',true,5300);const profile=await call('/api/owner/profile/'+ids[1]);assert.equal(profile.stats.races,1);assert.equal(profile.stats.wins,1);assert.equal(profile.stats.bestDrag,5300);assert.equal(profile.referralStats.total,1);assert.equal(profile.referralStats.rewarded,1);
let joined=await call('/api/free/city-01/join',{name:'FakeOwner',loadout:{liveryId:car}},'player');assert.equal(joined.status,201);const room=rooms.get('FREE:city-01'),p=room.room.players[0];p.connected=true;await room.handleFreeMessage({send(){}},p,{type:'free_state',state:{seq:1,x:1000,y:1000,vx:9000,vy:0,angle:0,speed:9000}});assert.equal(p.state.speed,9000);let closed=false;room.testSockets.push({deserializeAttachment:()=>({playerId:p.id}),send(){},close(){closed=true}});assert.equal((await call('/api/owner/profile/'+ids[1])).server,'city-01');assert.equal((await call('/api/owner/kick/'+ids[1],{})).kicked,1);assert.equal(closed,true);assert.equal(room.room.players.length,0);
assert.equal((await call('/api/owner/kick/'+ids[0],{})).status,403);
assert.equal((await call('/api/owner/maintenance',{enabled:true})).status,200);
assert.equal((await call('/api/free/city-01/join',{name:'Player'},'player')).status,503);
assert.equal((await call('/api/owner/runtime',{location:'menu'},'player')).status,503);
assert.equal((await call('/api/owner/runtime',{location:'owner'})).status,200);
assert.equal((await call('/api/auth/register',{username:'newplayer',password:'password1',displayName:'Player'},'')).status,503);
await call('/api/owner/maintenance',{enabled:false});assert.equal((await call('/api/owner/runtime',{location:'menu'},'player')).status,200);
console.log('owner_panel_test OK: real SQLite migrations, authorization, presence, catalog validation, personal isolation, offline grants, idempotent drag stats, profiles, kick, maintenance and owner bypass');

const vm=await import('node:vm');const scope={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/js/content.js',import.meta.url),'utf8'),scope);const R=scope.window.Racing;R.ownerCars={[car]:{maxSpeed:9000,upgrades:{speed:{step:.1,priceFactor:2}}}};R.ownerTuning={[car]:{maxSpeed:9999,accel:8888}};const save=R.normalizeSave({ownedLiveries:[car],carUpgrades:{[car]:{speed:2}}});const playerCar={player:true},botCar={player:false};R.applyCarPerformance(playerCar,car,save);R.applyCarPerformance(botCar,car,save);assert.equal(playerCar.maxSpeed,9999);assert.equal(botCar.maxSpeed,10800);R.ownerCars[car].enabled=false;assert.equal(R.shopAction(save,'livery',car),'unavailable');console.log('owner physics OK: high-speed network state, personal physics only for player, global upgrades, disabled selection');
