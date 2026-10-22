import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {rankClanSeasonRows,settleClanCompetition,utcClanDay,utcClanSeason} from '../src/clan-seasons.mjs';

const DAY=86400000,sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
let failSecondSeasonClanBatch=false,seasonClanBatches=0;
const DB={prepare(query){let args=[];return{query,args,bind(...v){args=v;this.args=v;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(list){if(failSecondSeasonClanBatch&&list.some(s=>s.query.includes('INSERT OR IGNORE INTO clan_season_results'))&&++seasonClanBatches===2){failSecondSeasonClanBatch=false;throw Error('SIMULATED_CRON_FAILURE');}sql.exec('BEGIN');try{const out=list.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB};
try{
  assert.equal(utcClanSeason(Date.UTC(2026,9,19,0)).id,'2026-10-19');
  assert.equal(utcClanSeason(Date.UTC(2026,9,25,23,59)).id,'2026-10-19');
  assert.equal(utcClanSeason(Date.UTC(2026,9,26,0)).id,'2026-10-26');
  assert.equal(utcClanDay(Date.UTC(2026,9,19,23,59)).id,'2026-10-19');
  assert.equal(utcClanDay(Date.UTC(2026,9,20,0)).id,'2026-10-20');
  const tieBreak=rankClanSeasonRows([{crewId:'same',points:100,wins:0,captures:0,influence:10},{crewId:'wins',points:100,wins:1,captures:0,influence:0},{crewId:'captures',points:100,wins:0,captures:1,influence:0},{crewId:'equal-a',points:100,wins:0,captures:0,influence:0},{crewId:'equal-b',points:100,wins:0,captures:0,influence:0}]);
  assert.deepEqual(tieBreak.map(x=>[x.crewId,x.rank,x.tieSize]),[['wins',1,1],['captures',2,1],['same',3,1],['equal-a',4,2],['equal-b',4,2]],'ranking resolves points with wins, captures, influence, then a shared place');
  const start=Date.UTC(2026,9,19),eventAt=start+10_000,clans=[];
  for(let i=0;i<5;i++){
    const uid=`u${i}`,cid=`c${i}`;sql.prepare(`INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,'x','x',?,?)`).run(uid,`driver${i}`,`Driver ${i}`,start,start);
    sql.prepare(`INSERT INTO crews(id,name,tag,emblem,color,leader_id,created_at) VALUES(?,?,?,'⚡','#fff',?,?)`).run(cid,`Crew ${i}`,`C${i}`,uid,start);
    sql.prepare('INSERT INTO crew_members(user_id,crew_id,joined_at) VALUES(?,?,?)').run(uid,cid,start);clans.push({uid,cid});
  }
  // Server-confirmed progression creates the online-finish task source atomically.
  for(let i=0;i<5;i++)sql.prepare(`INSERT INTO progression_rewards(id,user_id,source,event_id,exp,created_at) VALUES(?,?,?,?,90,?)`).run(`p${i}`,clans[0].uid,'online',`race-${i}`,eventAt+i);
  // Each source ledger writes its competition event via the migration trigger. Spread influence across accounts within the per-user cap.
  for(const [member,base,count] of [[clans[0].uid,0,4]])for(let i=0;i<count;i++)sql.prepare(`INSERT INTO clan_war_influence_ledger(id,crew_id,user_id,source,event_id,points,created_at,day_start) VALUES(?,?,?,'ONLINE_WIN',?,?,?,?)`).run(`inf${base+i}`,clans[0].cid,member,`influence-${base+i}`,25,eventAt+10+i,start);
  for(let i=0;i<2;i++){const uid=`u0m${i}`;sql.prepare(`INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,'x','x',?,?)`).run(uid,uid,uid,start,start);sql.prepare('INSERT INTO crew_members(user_id,crew_id,joined_at) VALUES(?,?,?)').run(uid,clans[0].cid,start);for(let n=0;n<4;n++)sql.prepare(`INSERT INTO clan_war_influence_ledger(id,crew_id,user_id,source,event_id,points,created_at,day_start) VALUES(?,?,?,'ONLINE_FINISH',?,?,?,?)`).run(`inf-${uid}-${n}`,clans[0].cid,uid,`influence-${uid}-${n}`,50,eventAt+20+i*10+n,start);}
  for(const [id,amount,at] of [['gift-1',3000,eventAt+20],['gift-2',2000,eventAt+21]])sql.prepare(`INSERT INTO crew_treasury_ledger(id,crew_id,actor_user_id,kind,amount,idempotency_key,created_at) VALUES(?,?,?,'CONTRIBUTION',?,?,?)`).run(id,clans[0].cid,clans[0].uid,amount,`key-${id}`,at);
  function battle(id,winner,loser,at){
    sql.prepare(`INSERT INTO clan_war_challenges(id,idempotency_key,attacker_crew_id,defender_crew_id,created_by,state,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,'RUNNING',?,?,?)`).run(id,`key-${id}`,winner,loser,clans[0].uid,at+DAY,at,at);
    sql.prepare(`INSERT INTO clan_war_battle_state(battle_id,round_number,attacker_score,defender_score,status,winner_crew_id,updated_at,completed_at) VALUES(?,4,100,90,'FINISHED',?,?,?)`).run(id,winner,at,at);
    sql.prepare(`UPDATE clan_war_challenges SET state='FINISHED',updated_at=? WHERE id=?`).run(at,id);
  }
  for(let i=0;i<5;i++)battle(`match-${i}`,clans[0].cid,clans[1].cid,eventAt+100+i);
  for(let i=0;i<2;i++)sql.prepare(`INSERT INTO clan_war_district_history(id,district_id,previous_crew_id,new_crew_id,battle_id,changed_at) VALUES(?,?,?,?,?,?)`).run(`cap${i}`,'north-loop',clans[1].cid,clans[0].cid,`capture-${i}`,eventAt+200+i);
  // Different confirmed full-day holding totals establish lower ranking positions.
  for(const [district,c,days] of [['north-loop',clans[0].cid,1],['harbor-crossing',clans[0].cid,1],['old-town',clans[2].cid,2],['south-industrial',clans[3].cid,1]])
    sql.prepare('UPDATE clan_war_districts SET owner_crew_id=?,captured_at=? WHERE id=?').run(c,start,district);
  const afterWeek=start+WEEK_PLUS(1);
  failSecondSeasonClanBatch=true;
  await assert.rejects(()=>settleClanCompetition(env,afterWeek),/SIMULATED_CRON_FAILURE/,'a crash can interrupt finalization after one clan transaction commits');
  assert.equal(sql.prepare(`SELECT status FROM clan_seasons WHERE id='2026-10-19'`).get().status,'FINALIZING','interrupted season remains resumable');
  const result=await settleClanCompetition(env,afterWeek);
  assert.equal(result.finalized.length,1);
  const rewards=sql.prepare('SELECT crew_id,balance FROM crew_treasuries ORDER BY crew_id').all();
  assert.equal(sql.prepare(`SELECT balance FROM crew_treasuries WHERE crew_id='c0'`).get().balance,32500,'season and all six daily/weekly task rewards credit treasury');
  assert.equal(sql.prepare(`SELECT balance FROM crew_treasuries WHERE crew_id='c1'`).get().balance,17000,'match and season-task rewards are paid to both clans');
  assert.equal(sql.prepare(`SELECT COUNT(*) n FROM clan_task_claims WHERE crew_id='c0' AND period_type='DAILY'`).get().n,3);
  assert.equal(sql.prepare(`SELECT COUNT(*) n FROM clan_task_claims WHERE crew_id='c0' AND period_type='WEEKLY'`).get().n,3,'all three weekly tasks reward at target');
  assert.equal(sql.prepare(`SELECT COUNT(*) n FROM crew_treasury_ledger WHERE crew_id='c0' AND kind='QUEST_REWARD'`).get().n,6);
  assert.equal(sql.prepare(`SELECT COUNT(*) n FROM clan_task_events WHERE crew_id='c0' AND task_id='online_finishes'`).get().n,5);
  const resultRows=sql.prepare(`SELECT crew_id,points,wins,matches,captures,rank,division_from,division_to,reward,participated FROM clan_season_results WHERE season_id='2026-10-19' ORDER BY crew_id`).all();
  const c0=resultRows.find(x=>x.crew_id==='c0'),c1=resultRows.find(x=>x.crew_id==='c1');
  assert.equal(c0.points,740,'five wins, two captures and fourteen full district-days across two districts count before the next UTC season starts');assert.equal(c0.wins,5);assert.equal(c0.matches,5);assert.equal(c0.captures,2);assert.equal(c0.rank,1);assert.equal(c0.division_to,'SILVER');assert.equal(c0.reward,12000);assert.equal(c0.participated,1);
  assert.equal(c1.points,125);assert.equal(c1.rank,2);assert.equal(c1.division_to,'SILVER');assert.equal(c1.reward,12000);
  assert.equal(sql.prepare(`SELECT division FROM clan_divisions WHERE crew_id='c0'`).get().division,'SILVER');
  assert.equal(resultRows.find(x=>x.crew_id==='c2').rank,3,'equal score shares a place without an ID-based advantage');
  assert.equal(resultRows.find(x=>x.crew_id==='c3').rank,3,'equal score shares a place without an ID-based advantage');
  assert.equal(resultRows.find(x=>x.crew_id==='c2').division_to,'BRONZE');
  assert.equal(resultRows.find(x=>x.crew_id==='c3').division_to,'BRONZE');
  assert.equal(sql.prepare(`SELECT status FROM clan_seasons WHERE id='2026-10-19'`).get().status,'FINISHED');
  const before=sql.prepare(`SELECT SUM(balance) total FROM crew_treasuries`).get().total;
  await settleClanCompetition(env,afterWeek+DAY);
  assert.equal(sql.prepare(`SELECT SUM(balance) total FROM crew_treasuries`).get().total,before,'rerun cannot repeat season/task/hunting payouts');
  assert.equal(sql.prepare(`SELECT COUNT(*) n FROM clan_division_history WHERE season_id='2026-10-19'`).get().n,5);
  assert.equal(sql.prepare(`SELECT COUNT(*) n FROM clan_season_settlements WHERE season_id='2026-10-19' AND reward=0`).get().n,3,'clans without a confirmed match have no season payout');
  // Exercise all fixed division rewards against a prepared season-start snapshot.
  const tierStart=start+3*7*DAY,tierSeason='2026-11-09';
  await settleClanCompetition(env,tierStart);
  const nextAt=tierStart+1000;
  for(const [i,division] of ['BRONZE','SILVER','GOLD','PLATINUM','DIAMOND'].entries()){
    sql.prepare('UPDATE clan_divisions SET division=? WHERE crew_id=?').run(division,clans[i].cid);
    sql.prepare('UPDATE clan_season_members SET division_at_start=? WHERE season_id=? AND crew_id=?').run(division,tierSeason,clans[i].cid);
  }
  const outbox=sql.prepare(`INSERT INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at) VALUES(?,?,?,?,1,?)`);
  const pair=(battle,winner,loser)=>{outbox.run(`w:${winner}:${battle}`,'MATCH_WIN',winner,battle,nextAt);outbox.run(`l:${loser}:${battle}`,'MATCH_LOSS',loser,battle,nextAt);};
  pair('s2-a',clans[0].cid,clans[1].cid);pair('s2-b',clans[2].cid,clans[3].cid);pair('s2-c',clans[4].cid,clans[0].cid);
  await settleClanCompetition(env,tierStart+7*DAY+1);
  const tierRewards=sql.prepare(`SELECT crew_id,division_from,reward FROM clan_season_results WHERE season_id=? ORDER BY crew_id`).all(tierSeason);
  assert.deepEqual(tierRewards.map(x=>[x.crew_id,x.division_from,x.reward]),[['c0','BRONZE',12000],['c1','SILVER',22000],['c2','GOLD',32000],['c3','PLATINUM',42000],['c4','DIAMOND',52000]],'season payout uses the starting division plus the fixed participation reward');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
  console.log('clan_seasons_v2_test: PASS (UTC windows, authoritative outbox, daily tasks/rewards, match/capture points, ranking/promotion, season rewards, crash recovery, replay)');
}finally{sql.close();}
function WEEK_PLUS(n){return 7*DAY+n;}
