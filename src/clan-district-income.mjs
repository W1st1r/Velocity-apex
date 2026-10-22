const DAY_MS=86_400_000;
const jsonRows=result=>result?.results||[];

function prorated(amount,from,to){
  const elapsed=Math.max(0,to-from);
  return Math.round(amount*elapsed/DAY_MS);
}

async function getDistricts(env){
  const result=await env.DB.prepare('SELECT * FROM clan_war_districts ORDER BY id').all();
  return jsonRows(result);
}

async function postInterval(env,district,crewId,from,to,now){
  if(!crewId||!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return 0;
  const amount=prorated(Number(district.daily_income),from,to);
  const key=`district-income:${district.id}:${from}:${to}`;
  // D1 batch is transactional. The cursor compare is the concurrency guard;
  // a retry either sees the advanced cursor or the unique ledger key.
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO crew_treasuries(crew_id,balance,updated_at) VALUES(?,0,?)').bind(crewId,now),
    env.DB.prepare("INSERT OR IGNORE INTO clan_war_district_income_ledger(district_id,crew_id,from_ms,to_ms,amount,created_at) VALUES(?,?,?,?,?,?)").bind(district.id,crewId,from,to,amount,now),
    env.DB.prepare("INSERT OR IGNORE INTO crew_treasury_ledger(id,crew_id,actor_user_id,kind,amount,idempotency_key,metadata_json,created_at) VALUES(?, ?,NULL,'DISTRICT_INCOME',?,?,?,?)").bind(crypto.randomUUID(),crewId,amount,key,JSON.stringify({districtId:district.id,from,to}),now),
    env.DB.prepare('UPDATE crew_treasuries SET balance=balance+?,updated_at=? WHERE crew_id=? AND EXISTS(SELECT 1 FROM clan_war_district_income_ledger WHERE district_id=? AND crew_id=? AND from_ms=? AND to_ms=?) AND (SELECT changes())>0').bind(amount,now,crewId,district.id,crewId,from,to)
  ];
  // The final update only credits when the unique treasury ledger insert above
  // actually inserted a row. D1 executes the batch as one transaction.
  const results=await env.DB.batch(statements);
  return results?.[2]?.meta?.changes?amount:0;
}

export async function settleClanDistrictIncome(env,now=Date.now()){
  const settledAt=Math.max(0,Math.floor(now));
  const rows=await getDistricts(env);let creditedCr=0,intervals=0;
  for(const d of rows){
    let cursor=Number(d.income_cursor_ms);
    let incomeOwner=d.income_owner_crew_id;
    const owner=d.owner_crew_id;
    const captured=Number(d.captured_at);
    if(owner&&!Number.isFinite(cursor)){
      cursor=Number.isFinite(captured)&&captured>0?captured:settledAt;
      incomeOwner=owner;
      await env.DB.prepare('UPDATE clan_war_districts SET income_owner_crew_id=?,income_cursor_ms=?,updated_at=? WHERE id=? AND income_cursor_ms IS NULL').bind(owner,cursor,settledAt,d.id).run();
    }
    if(!Number.isFinite(cursor))continue;
    if(owner!==incomeOwner){
      const transferAt=Math.max(cursor,Number.isFinite(captured)?captured:settledAt);
      if(incomeOwner&&transferAt>cursor){creditedCr+=await postInterval(env,d,incomeOwner,cursor,transferAt,settledAt);intervals++;}
      cursor=transferAt;incomeOwner=owner;
    }
    if(incomeOwner&&settledAt>cursor){creditedCr+=await postInterval(env,d,incomeOwner,cursor,settledAt,settledAt);intervals++;cursor=settledAt;}
    await env.DB.prepare('UPDATE clan_war_districts SET income_owner_crew_id=?,income_cursor_ms=?,updated_at=? WHERE id=?').bind(incomeOwner,cursor,settledAt,d.id).run();
  }
  return {ok:true,creditedCr,intervals,settledAt};
}

export async function getClanDistrictIncome(env,crewId,now=Date.now()){
  const districts=await getDistricts(env);
  const owned=districts.filter(d=>d.owner_crew_id===crewId).map(d=>({...d,accrued_through:d.income_cursor_ms??d.captured_at??null}));
  const result=await env.DB.prepare(`SELECT COALESCE(SUM(CAST(ROUND(amount*1.0*MAX(0,MIN(to_ms,?)-MAX(from_ms,?))/(to_ms-from_ms)) AS INTEGER)),0) AS amount FROM clan_war_district_income_ledger WHERE crew_id=? AND to_ms>? AND from_ms<?`).bind(now,now-DAY_MS,crewId,now-DAY_MS,now).first();
  return {owned,last24h:Number(result?.amount)||0,projectedDaily:owned.reduce((sum,d)=>sum+Number(d.daily_income||0),0)};
}
