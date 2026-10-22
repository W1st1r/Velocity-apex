import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const db=new DatabaseSync(':memory:');
const migrations=fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort();
try{
  for(const file of migrations)db.exec(fs.readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const run=db.prepare(`INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,'x','x',1,1)`);
  run.run('u1','driver1','Driver 1');run.run('u2','driver2','Driver 2');
  const crew=db.prepare(`INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES(?,? ,?,'⚡','#fff',?,10)`);
  crew.run('c1','Crew One','ONE','u1');crew.run('c2','Crew Two','TWO','u2');
  db.prepare(`INSERT INTO crew_members(user_id,crew_id,joined_at) VALUES('u1','c1',10),('u2','c2',10)`).run();
  assert.equal(db.prepare(`SELECT division FROM clan_divisions WHERE crew_id='c1'`).get().division,'BRONZE','new clans default to Bronze');
  db.prepare(`INSERT INTO progression_rewards(id,user_id,source,event_id,exp,created_at) VALUES('p','u1','online','race-1',90,1000)`).run();
  db.prepare(`INSERT INTO clan_war_influence_ledger(id,crew_id,user_id,source,event_id,points,created_at,day_start) VALUES('i','c1','u1','ONLINE_WIN','race-1',30,1001,0)`).run();
  db.prepare(`INSERT INTO crew_treasury_ledger(id,crew_id,actor_user_id,kind,amount,idempotency_key,created_at) VALUES('t','c1','u1','CONTRIBUTION',5000,'contribution:u1:k1',1002)`).run();
  assert.deepEqual(db.prepare(`SELECT event_type,crew_id,source_id,amount FROM clan_competition_outbox ORDER BY event_type`).all().map(x=>({...x})),[
    {event_type:'CONTRIBUTION',crew_id:'c1',source_id:'t',amount:5000},
    {event_type:'INFLUENCE',crew_id:'c1',source_id:'u1:race-1',amount:30},
    {event_type:'ONLINE_FINISH',crew_id:'c1',source_id:'u1:race-1',amount:1}
  ]);
  db.exec(fs.readFileSync(new URL('../migrations/0031_clan_seasons_tasks.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM clan_competition_outbox`).get().count,3,'migration replay does not duplicate authoritative events');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  console.log('clan_seasons_v2_test: PASS (UTC competition schema, Bronze defaults, transactional event outbox triggers, migration replay)');
}finally{db.close();}
