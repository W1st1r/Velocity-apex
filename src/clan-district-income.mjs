const DAY_MS=86_400_000;
const jsonRows=result=>result?.results||[];
const STATE_GUARD='id=? AND income_cursor_ms IS ? AND income_owner_crew_id IS ? AND owner_crew_id IS ? AND captured_at IS ?';
const stateArgs=d=>[d.id,d.income_cursor_ms,d.income_owner_crew_id,d.owner_crew_id,d.captured_at];

function prorated(amount,from,to){
  // Difference of cumulative integral values retains sub-CR time across calls.
  const rate=BigInt(amount),day=BigInt(DAY_MS);
  return Number(rate*BigInt(to)/day-rate*BigInt(from)/day);
}
async function getDistricts(env){
  return jsonRows(await env.DB.prepare('SELECT * FROM clan_war_districts ORDER BY id').all());
}
async function postInterval(env,district,crewId,from,to,now){
  const amount=prorated(Number(district.daily_income),from,to);
  const key=`district-income:${district.id}:${from}:${to}`;
  // Compare-and-swap the cursor in the SAME D1 transaction as both journals and
  // the balance. Different cutoffs cannot claim overlapping intervals, and a
  // lost response cannot leave an already-paid interval behind the cursor.
  const results=await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO crew_treasuries(crew_id,balance,updated_at) VALUES(?,0,?)').bind(crewId,now),
    env.DB.prepare(`UPDATE clan_war_districts SET income_cursor_ms=?,updated_at=MAX(updated_at,?) WHERE ${STATE_GUARD}`).bind(to,now,...stateArgs(district)),
    env.DB.prepare('INSERT OR IGNORE INTO clan_war_district_income_ledger(district_id,crew_id,from_ms,to_ms,amount,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT changes())>0').bind(district.id,crewId,from,to,amount,now),
    env.DB.prepare("INSERT OR IGNORE INTO crew_treasury_ledger(id,crew_id,actor_user_id,kind,amount,idempotency_key,metadata_json,created_at) SELECT ?,?,NULL,'DISTRICT_INCOME',?,?,?,? WHERE (SELECT changes())>0").bind(crypto.randomUUID(),crewId,amount,key,JSON.stringify({districtId:district.id,from,to}),now),
    env.DB.prepare('UPDATE crew_treasuries SET balance=balance+?,updated_at=MAX(updated_at,?) WHERE crew_id=? AND (SELECT changes())>0').bind(amount,now,crewId)
  ]);
  return{applied:!!results?.[1]?.meta?.changes,creditedCr:results?.[3]?.meta?.changes?amount:0};
}

export async function settleClanDistrictIncome(env,now=Date.now()){
  const settledAt=Math.max(0,Math.floor(now));
  const rows=await getDistricts(env);let creditedCr=0,intervals=0;
  for(const initial of rows){
    // Bounded contention retry; later Cron runs safely finish any remainder.
    for(let attempt=0;attempt<6;attempt++){
      const d=attempt?await env.DB.prepare('SELECT * FROM clan_war_districts WHERE id=?').bind(initial.id).first():initial;
      if(!d)break;
      const owner=d.owner_crew_id,incomeOwner=d.income_owner_crew_id;
      if(!owner&&!incomeOwner)break;
      const cursor=d.income_cursor_ms==null?NaN:Number(d.income_cursor_ms),captured=d.captured_at==null?NaN:Number(d.captured_at);
      if(!Number.isFinite(cursor)){
        const start=Number.isFinite(captured)&&captured>0?captured:settledAt;
        await env.DB.prepare(`UPDATE clan_war_districts SET income_owner_crew_id=?,income_cursor_ms=?,updated_at=MAX(updated_at,?) WHERE ${STATE_GUARD}`).bind(owner,start,settledAt,...stateArgs(d)).run();
        continue;
      }
      if(owner!==incomeOwner){
        const transferAt=Math.max(cursor,Number.isFinite(captured)?captured:settledAt);
        if(transferAt>settledAt)break;
        if(incomeOwner&&transferAt>cursor){
          const result=await postInterval(env,d,incomeOwner,cursor,transferAt,settledAt);
          creditedCr+=result.creditedCr;if(result.applied)intervals++;
        }else{
          await env.DB.prepare(`UPDATE clan_war_districts SET income_owner_crew_id=?,income_cursor_ms=?,updated_at=MAX(updated_at,?) WHERE ${STATE_GUARD}`).bind(owner,transferAt,settledAt,...stateArgs(d)).run();
        }
        continue;
      }
      if(!incomeOwner||settledAt<=cursor)break;
      const result=await postInterval(env,d,incomeOwner,cursor,settledAt,settledAt);
      creditedCr+=result.creditedCr;if(result.applied){intervals++;break;}
    }
  }
  return {ok:true,creditedCr,intervals,settledAt};
}

export async function getClanDistrictIncome(env,crewId,now=Date.now()){
  const districts=await getDistricts(env);
  const owned=districts.filter(d=>d.owner_crew_id===crewId).map(d=>({...d,accrued_through:d.income_cursor_ms??d.captured_at??null}));
  const result=await env.DB.prepare(`SELECT COALESCE(SUM(CAST(ROUND(amount*1.0*MAX(0,MIN(to_ms,?)-MAX(from_ms,?))/(to_ms-from_ms)) AS INTEGER)),0) AS amount FROM clan_war_district_income_ledger WHERE crew_id=? AND to_ms>? AND from_ms<?`).bind(now,now-DAY_MS,crewId,now-DAY_MS,now).first();
  return {owned,last24h:Number(result?.amount)||0,projectedDaily:owned.reduce((sum,d)=>sum+Number(d.daily_income||0),0)};
}
