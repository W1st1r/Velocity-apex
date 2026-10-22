import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {getClanDistrictIncome,settleClanDistrictIncome} from '../src/clan-district-income.mjs';

const sql=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
  sql.exec(fs.readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
const DB={prepare(query){let args=[];return{query,bind(...values){args=values;this.args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const out=statements.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB};
const t=Date.now()-4*86400000;
for(const [id,name] of [['alpha','Alpha'],['beta','Beta']]){
  sql.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(`${id}-leader`,`${id}leader`,name,'x','x',t,t);
  sql.prepare('INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,id.toUpperCase(),'*','#00aaff',`${id}-leader`,t);
}
const DAY=86400000;
sql.prepare('UPDATE clan_war_districts SET owner_crew_id=?,captured_at=? WHERE id=?').run('alpha',t,'north-loop');
sql.prepare('UPDATE clan_war_districts SET owner_crew_id=?,captured_at=? WHERE id=?').run('alpha',t,'harbor-crossing');

const half=await settleClanDistrictIncome(env,t+12*60*60*1000);
assert.equal(half.creditedCr,4500);
assert.equal(sql.prepare('SELECT balance FROM crew_treasuries WHERE crew_id=?').get('alpha').balance,4500);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_district_income_ledger').get().n,2);
const snapshot=await getClanDistrictIncome(env,'alpha',t+12*60*60*1000);
assert.equal(snapshot.last24h,4500);
assert.equal(snapshot.projectedDaily,9000);

const parallel=await Promise.all([
  settleClanDistrictIncome(env,t+13*60*60*1000),
  settleClanDistrictIncome(env,t+13*60*60*1000)
]);
assert.equal(sql.prepare('SELECT balance FROM crew_treasuries WHERE crew_id=?').get('alpha').balance,4875);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_district_income_ledger').get().n,4);
assert.equal(parallel.reduce((sum,result)=>sum+result.creditedCr,0),375);
await settleClanDistrictIncome(env,t+13*60*60*1000);
assert.equal(sql.prepare('SELECT balance FROM crew_treasuries WHERE crew_id=?').get('alpha').balance,4875);

sql.prepare('UPDATE clan_war_districts SET owner_crew_id=?,captured_at=?,protected_until=? WHERE id=?').run('beta',t+13*60*60*1000,t+25*60*60*1000,'north-loop');
await settleClanDistrictIncome(env,t+25*60*60*1000);
assert.equal(sql.prepare('SELECT balance FROM crew_treasuries WHERE crew_id=?').get('alpha').balance,7875);
assert.equal(sql.prepare('SELECT balance FROM crew_treasuries WHERE crew_id=?').get('beta').balance,1500);
const northHistory=sql.prepare('SELECT crew_id,SUM(amount) amount FROM clan_war_district_income_ledger WHERE district_id=? GROUP BY crew_id ORDER BY crew_id').all('north-loop');
assert.deepEqual(northHistory.map(row=>[row.crew_id,row.amount]),[['alpha',1625],['beta',1500]]);
const afterTransfer=await getClanDistrictIncome(env,'beta',t+25*60*60*1000);
assert.equal(afterTransfer.owned.find(row=>row.id==='north-loop').accrued_through,t+25*60*60*1000);

sql.exec(fs.readFileSync(new URL('../migrations/0029_clan_district_income.sql',import.meta.url),'utf8'));
assert.equal(sql.prepare('SELECT balance FROM crew_treasuries WHERE crew_id=?').get('beta').balance,1500);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_war_district_income_ledger').get().n,6);
console.log('clan_district_income_v2_test: PASS (pro-rata rates, concurrency/replay, ownership handoff, restart, repeat migration)');
