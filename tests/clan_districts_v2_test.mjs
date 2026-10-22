import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const sql=new DatabaseSync(':memory:');
try{
  for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
    sql.exec(fs.readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  const rows=sql.prepare('SELECT tier,daily_income,COUNT(*) count FROM clan_war_districts GROUP BY tier,daily_income ORDER BY daily_income').all();
  assert.deepEqual(rows.map(row=>[row.tier,row.daily_income,row.count]),[['STANDARD',3000,4],['PRESTIGE',6000,3],['ELITE',10000,1]]);
  assert.equal(sql.prepare('SELECT COUNT(*) count FROM clan_war_districts').get().count,8);
  assert.deepEqual({...sql.prepare(`SELECT map_x,map_y FROM clan_war_districts WHERE id='coastal-ridge'`).get()},{map_x:4580,map_y:1390},'Coastal Ridge map anchor follows the authored Coastal Ring while territory state remains server keyed');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
  sql.exec(fs.readFileSync(new URL('../migrations/0026_clan_war_districts.sql',import.meta.url),'utf8'));
  assert.equal(sql.prepare('SELECT COUNT(*) count FROM clan_war_districts').get().count,8,'district seed migration is replay-safe');
  sql.prepare(`INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES('u','driver','Driver','x','x',1,1)`).run();
  sql.prepare(`INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES('c','Crew','CRW','⚡','#fff','u',1)`).run();
  sql.prepare(`UPDATE clan_war_districts SET name='Legacy Name',map_x=1,map_y=2,owner_crew_id='c',income_cursor_ms=123456 WHERE id='north-loop'`).run();
  const labels=fs.readFileSync(new URL('../migrations/0030_clan_district_labels.sql',import.meta.url),'utf8');sql.exec(labels);sql.exec(labels);
  const migrated=sql.prepare(`SELECT name,map_x,map_y,owner_crew_id,income_cursor_ms FROM clan_war_districts WHERE id='north-loop'`).get();
  assert.deepEqual({...migrated},{name:'Panoramic Ridge',map_x:650,map_y:720,owner_crew_id:'c',income_cursor_ms:123456},'label refresh is replay-safe and preserves live territory/income state');
  console.log('clan_districts_v2_test: PASS (8 district seeds, agreed rates, FK integrity, repeat-safe metadata refresh preserving owner/cursor)');
}finally{sql.close();}
