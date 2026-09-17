import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/worker.mjs';
import {awardProgression,getProgression} from '../src/progression.mjs';
import {settings} from '../src/owner.mjs';
import {RANKS,salaryFor} from '../src/admin-system.mjs';
import {awardCrewRep,settleCrews,weekStart} from '../src/crews.mjs';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let failPayout=false;
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){if(failPayout&&sql.startsWith('UPDATE player_saves')){failPayout=false;throw Error('simulated payment write failure');}return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB},t=Date.now(),DAY=86400000,hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('base64url');
for(const name of ['w1st1r','leader','member','poor','outsider','applicant']){db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(name,name,name,'x','x',t,t);db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(await hash(name),name,t,t+DAY,t);db.prepare('INSERT INTO player_saves VALUES(?,?,?,?,?)').run(name,JSON.stringify({credits:name==='poor'?10:30000,selectedLivery:'apexLime',ownedLiveries:['apexLime']}),1,t,t);}
async function call(path,body,who='leader'){const r=await worker.fetch(new Request('https://apex.test'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'va_session='+who,origin:'https://apex.test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return {status:r.status,...await r.json()};}

for(const [level,amount] of [[1,600],[2,1200],[3,2000],[4,3000],[5,4000]]){
 assert.equal(salaryFor(level,RANKS[level].norm).amount,amount);
 assert.equal(salaryFor(level,9999).amount,amount);
}
const balance=()=>JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('member').save_json).credits;
db.prepare("INSERT OR REPLACE INTO owner_settings VALUES ('config',?)").run(JSON.stringify({maintenance:false,cars:{'porsche-911':{price:10000,maxSpeed:450}}}));
assert.equal((await settings(env)).cars['porsche-911'].price,12500);
assert.equal((await settings(env)).cars['porsche-911'].price,12500);
assert.equal((await settings(env)).cars['porsche-911'].maxSpeed,450);
await getProgression(env,'member');
failPayout=true;
let r=await awardProgression(env,'member',{source:'drift_battle',eventId:'retry',exp:180,credits:450});
assert.equal(r.ok,false);assert.equal(balance(),30000);
assert.equal((await getProgression(env,'member')).totalExp,0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM progression_rewards').get().n,0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM street_rep').get().n,0);
r=await awardProgression(env,'member',{source:'drift_battle',eventId:'retry',exp:180,credits:450});
assert.equal(r.ok,true);assert.equal(r.creditsAdded,450);assert.equal(r.totalExp,180);assert.equal(balance(),30450);
r=await awardProgression(env,'member',{source:'drift_battle',eventId:'retry',exp:180,credits:450});assert.equal(r.duplicate,true);assert.equal(balance(),30450);
for(let i=0;i<8;i++)assert.equal((await awardProgression(env,'member',{source:'koth',eventId:'k'+i,exp:220,credits:550})).ok,true);
assert.equal(balance(),31800);assert.equal((await getProgression(env,'member')).totalExp,1940);
assert.equal(db.prepare('SELECT SUM(points) n FROM street_rep WHERE user_id=?').get('member').n,500);
for(let i=0;i<15;i++)await awardProgression(env,'leader',{source:'online_time',eventId:'o'+i,exp:30,credits:60});
assert.equal(db.prepare("SELECT SUM(credits) n FROM progression_rewards WHERE user_id='leader'").get().n,720);
assert.equal((await getProgression(env,'leader')).totalExp,450);
console.log('economy_v13_test: OK — salary caps, atomic rollback/retry, duplicate protection, EXP, REP and CR limits');
