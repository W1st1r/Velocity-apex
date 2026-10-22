import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {recordClanWarRound} from '../src/clan-wars.mjs';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
const DB={prepare(query){let args=[];return{query,bind(...values){args=values;this.args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB},now=Date.now(),battle='11111111-1111-4111-8111-111111111111',red=['red-a','red-b','red-c'],blue=['blue-a','blue-b','blue-c'];
for(const [crew,ids] of [['red',red],['blue',blue]]){
  for(const uid of ids)sql.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(uid,uid,uid,'x','x',now,now);
  sql.prepare('INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES(?,?,?,?,?,?,?)').run(crew,crew,crew.toUpperCase(),'*','#00aaff',ids[0],now);
  for(const uid of ids)sql.prepare('INSERT INTO crew_members(user_id,crew_id,joined_at) VALUES(?,?,?)').run(uid,crew,now);
}
sql.prepare("INSERT INTO clan_war_challenges(id,idempotency_key,attacker_crew_id,defender_crew_id,created_by,state,expires_at,created_at,updated_at) VALUES(?,?,? ,? ,?,'ACCEPTED',?,?,?)").run(battle,'test-war','red','blue','red-a',now+86400000,now,now);
sql.prepare('INSERT INTO clan_war_battle_state(battle_id,round_number,attacker_score,defender_score,status,updated_at) VALUES(?,1,0,0,\'ACTIVE\',?)').run(battle,now);
for(const uid of red)sql.prepare("INSERT INTO clan_war_rosters(battle_id,crew_id,user_id) VALUES(?,'red',?)").run(battle,uid);
for(const uid of blue)sql.prepare("INSERT INTO clan_war_rosters(battle_id,crew_id,user_id) VALUES(?,'blue',?)").run(battle,uid);
sql.prepare("UPDATE clan_war_challenges SET state='RUNNING' WHERE id=?").run(battle);
const makeResults=(redPlaces=[1,4,6])=>{
  const places=new Map([...red.map((userId,i)=>[userId,redPlaces[i]]),...blue.map((userId,i)=>[userId,[1,2,3,4,5,6].filter(x=>!redPlaces.includes(x))[i]])]);
  return [...red,...blue].map((userId,i)=>({userId,crewId:red.includes(userId)?'red':'blue',place:places.get(userId),timeMs:100000+i*1000}));
};
const placeTied=makeResults();
let result=await recordClanWarRound(env,battle,1,placeTied,now+1);assert.deepEqual(result.score,{attacker:14,defender:14});assert.equal(result.nextRound,2);assert.equal(result.finished,false);
const replay=await recordClanWarRound(env,battle,1,placeTied,now+2);assert.equal(replay.replay,true);assert.deepEqual(replay.score,{attacker:14,defender:14});
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_round_results WHERE battle_id=? AND round_number=1').get(battle).n,6);
for(const round of [2,3,4]){
  sql.prepare("UPDATE clan_war_challenges SET state='RUNNING' WHERE id=?").run(battle);
  result=await recordClanWarRound(env,battle,round,placeTied,now+round);
}
assert.equal(result.finished,true);assert.equal(result.winnerCrewId,'red');assert.equal(result.tiebreak,'DECISIVE_RACE_BEST_PLACE');
assert.equal(result.score.attacker,result.score.defender,'decisive race winner is used only after aggregate tie');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_rounds WHERE battle_id=?').get(battle).n,4);
assert.equal(sql.prepare('SELECT state FROM clan_war_challenges WHERE id=?').get(battle).state,'FINISHED');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_active_crews WHERE battle_id=?').get(battle).n,0);
console.log('clan_war_rounds_v2_test: PASS (10/7/5/3/2/1 scoring, three rounds, tie-breaker, replay, final release)');
sql.close();
