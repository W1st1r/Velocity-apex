import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {recordClanWarRound} from '../src/clan-wars.mjs';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
const migrations=new URL('../migrations/',import.meta.url);
for(const name of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL(name,migrations),'utf8'));
const DB={prepare(query){let args=[];return{query,bind(...values){args=values;this.args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const env={DB},now=Date.now(),red=['red-a','red-b','red-c'],blue=['blue-a','blue-b','blue-c'];
for(const [crew,ids] of [['red',red],['blue',blue]]){
  for(const uid of ids)sql.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(uid,uid,uid,'x','x',now,now);
  sql.prepare('INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES(?,?,?,?,?,?,?)').run(crew,crew,crew.toUpperCase(),'*','#00aaff',ids[0],now);
  for(const uid of ids)sql.prepare('INSERT INTO crew_members(user_id,crew_id,joined_at) VALUES(?,?,?)').run(uid,crew,now);
}

function results(redPlaces,redTime=100000,blueTime=100000){
  const redSet=new Set(redPlaces),bluePlaces=[1,2,3,4,5,6].filter(place=>!redSet.has(place));
  return [
    ...red.map((userId,i)=>({userId,crewId:'red',place:redPlaces[i],timeMs:redTime+i*10})),
    ...blue.map((userId,i)=>({userId,crewId:'blue',place:bluePlaces[i],timeMs:blueTime+i*10}))
  ];
}

try{
  let savedRounds=0;
  for(let i=0;i<20;i++){
    const battleId=crypto.randomUUID(),at=now+i*1000,mode=i%4;
    sql.prepare("INSERT INTO clan_war_challenges(id,idempotency_key,attacker_crew_id,defender_crew_id,created_by,state,expires_at,created_at,updated_at) VALUES(?,?,? ,? ,?,'ACCEPTED',?,?,?)").run(battleId,`batch-${i}`,'red','blue','red-a',at+86400000,at,at);
    sql.prepare("INSERT INTO clan_war_battle_state(battle_id,round_number,attacker_score,defender_score,status,updated_at) VALUES(?,1,0,0,'ACTIVE',?)").run(battleId,at);
    for(const userId of red)sql.prepare("INSERT INTO clan_war_rosters(battle_id,crew_id,user_id) VALUES(?,'red',?)").run(battleId,userId);
    for(const userId of blue)sql.prepare("INSERT INTO clan_war_rosters(battle_id,crew_id,user_id) VALUES(?,'blue',?)").run(battleId,userId);
    sql.prepare("UPDATE clan_war_challenges SET state='RUNNING' WHERE id=?").run(battleId);

    const redWins=mode===0,blueWins=mode===1,tied=mode>=2;
    for(let round=1;round<=3;round++){
      sql.prepare("UPDATE clan_war_challenges SET state='RUNNING' WHERE id=?").run(battleId);
      const order=redWins?[1,2,3]:blueWins?[4,5,6]:[1,4,6];
      const outcome=await recordClanWarRound(env,battleId,round,results(order),at+round);
      savedRounds++;
      const replay=await recordClanWarRound(env,battleId,round,results(order),at+round+100);
      assert.equal(replay.replay,true,`match ${i+1}, round ${round} replays without another score`);
      assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_round_results WHERE battle_id=? AND round_number=?').get(battleId,round).n,6);
      if(round<3)assert.equal(outcome.finished,false);
    }
    if(tied){
      const round=4;sql.prepare("UPDATE clan_war_challenges SET state='RUNNING' WHERE id=?").run(battleId);
      const outcome=await recordClanWarRound(env,battleId,round,results([1,4,6],mode===2?100000:200000,mode===2?200000:100000),at+round);
      savedRounds++;assert.equal(outcome.finished,true);
      const replay=await recordClanWarRound(env,battleId,round,results([1,4,6]),at+round+100);
      assert.equal(replay.replay,true);
    }
    const state=sql.prepare('SELECT status,winner_crew_id,round_number FROM clan_war_battle_state WHERE battle_id=?').get(battleId);
    assert.equal(state.status,'FINISHED',`match ${i+1} finishes`);
    assert.equal(state.winner_crew_id,redWins||mode===2?'red':'blue',`match ${i+1} winner is deterministic`);
    assert.equal(state.round_number,tied?4:3);
  }
  assert.equal(savedRounds,70,'20 matches produce the expected three rounds plus tie-breakers');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_challenges WHERE state=\'FINISHED\'').get().n,20);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_rounds WHERE applied=1').get().n,70);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_round_results').get().n,420);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM economy_operations').get().n,0,'clan matches issue no ordinary CR awards');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM progression_rewards').get().n,0,'clan matches issue no ordinary EXP awards');
  assert.equal(sql.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('clan_war_batch_simulation_v2_test: 20 simulated 3x3 matches, 70 rounds, five wins per outcome class, tie-breaks, retries, six results per round and no CR/EXP awards passed');
}finally{sql.close();}
