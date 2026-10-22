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
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
  sql.exec(fs.readFileSync(new URL('../migrations/0026_clan_war_districts.sql',import.meta.url),'utf8'));
  assert.equal(sql.prepare('SELECT COUNT(*) count FROM clan_war_districts').get().count,8,'district migration is replay-safe');
  console.log('clan_districts_v2_test: PASS (8 district seeds, agreed rates, FK integrity, migration replay)');
}finally{sql.close();}
