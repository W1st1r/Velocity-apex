import assert from 'node:assert/strict';
import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';
import {assertStagingUrl,assertStageDb,createCfClient} from './v2-staging.mjs';
import {RACE_RUNTIME_VERSION} from '../public/js/race-session-v77.mjs';

const receipt=JSON.parse(readFileSync('.v2-staging-private/receipt.json'));
const origin=assertStagingUrl(receipt.url,receipt.subdomain);assertStageDb(receipt.dbId);
const cf=createCfClient(process.env.CLOUDFLARE_ACCOUNT_ID,process.env.CLOUDFLARE_API_TOKEN);
const password=process.env.STAGING_QA_PASSWORD;assert.ok(password?.length>=12);
const run=String(process.env.GITHUB_RUN_ID||Date.now()),checks=[];
async function api(path,body,cookie='',expected=200){
  const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,expected,`${path}: HTTP status`);let data;try{data=await r.json();}catch{throw Error(`${path}: expected JSON`);}
  return{data,cookie:(r.headers.getSetCookie?.()||[r.headers.get('set-cookie')||'']).find(x=>x.startsWith('va_session='))?.split(';',1)[0]||cookie};
}
try{
  const home=await fetch(origin,{signal:AbortSignal.timeout(30000)});assert.equal(home.status,200);assert.match(await home.text(),/Velocity Apex/);await api('/api/health');
  await api('/api/account/save',undefined,'',401);checks.push('homepage, health, unauthenticated save gate');
  for(const username of ['w1st1r','v2stage02']){
    const r=await fetch(origin+'/api/auth/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username,displayName:'Staging QA',password}),signal:AbortSignal.timeout(30000)});
    assert.ok([201,409].includes(r.status),'test registration failed');
    if(r.status===409)assert.equal((await r.json()).error,'USERNAME_TAKEN');
  }
  let login=await api('/api/auth/login',{username:'w1st1r',password}),cookie=login.cookie;assert.match(cookie,/^va_session=/);const userId=login.data.user.id;assert.match(userId,/^[0-9a-f-]{36}$/i);
  // Test funding is isolated, server-side and one-time; never resets existing QA balances.
  const funding=await cf(`/d1/database/${receipt.dbId}/query`,{method:'POST',stageDbId:receipt.dbId,body:{sql:"UPDATE player_saves SET save_json=json_set(save_json,'$.credits',1000000,'$.stagingFunded',1),revision=revision+1 WHERE user_id=? AND json_extract(save_json,'$.stagingFunded') IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=? AND username='w1st1r')",params:[userId,userId]}});assert.ok(Array.isArray(funding));
  let save=(await api('/api/account/save',undefined,cookie)).data;const protectedBalance=save.save.credits;
  await api('/api/account/save',{save:{credits:999999999}},cookie,409);
  assert.equal((await api('/api/account/save',undefined,cookie)).data.save.credits,protectedBalance);checks.push('register/login, session reload, client balance injection rejected');
  let overview=(await api('/api/crews',undefined,cookie)).data;
  if(!overview.crew)overview=(await api('/api/crews/create',{name:'V2 Staging QA',tag:'VQA',emblem:'⚡',color:'#a9ff5a'},cookie)).data;
  const crewId=overview.crew.id,balance=overview.crew.treasuryBalance,personal=(await api('/api/account/save',undefined,cookie)).data.save.credits;
  const first={amount:150000,idempotencyKey:`stage-${run}-deposit-1`};
  let result=(await api('/api/crews/treasury/contribute',first,cookie)).data;assert.equal(result.treasuryBalance,balance+150000);
  assert.equal((await api('/api/crews/treasury/contribute',first,cookie)).data.replay,true);
  result=(await api('/api/crews/treasury/contribute',{amount:1000,idempotencyKey:`stage-${run}-deposit-2`},cookie)).data;assert.equal(result.treasuryBalance,balance+151000);
  assert.equal((await api('/api/account/save',undefined,cookie)).data.save.credits,personal-151000);
  if(overview.crew.capacity<50){const expanded=(await api('/api/crews/treasury/expand',{idempotencyKey:`stage-${run}-expand`},cookie)).data;assert.equal(expanded.capacity,overview.crew.capacity+5);}
  checks.push('clan create/read, new-key second contribution, replay, account/treasury balances, capacity');
  overview=(await api('/api/crews',undefined,cookie)).data;assert.equal(overview.districts.length,8);const coast=overview.districts.find(x=>x.id==='coastal-ridge');assert.equal(coast.map_x,4580);assert.equal(coast.map_y,1390);
  const season=(await api('/api/clan-seasons',undefined,cookie)).data;assert.equal(season.daily.tasks.length,3);assert.equal(season.weekly.tasks.length,3);assert.equal(season.membership.id,crewId);checks.push('eight districts/Coastal Ridge data, season API, 3 daily + 3 weekly tasks');
  save=(await api('/api/account/save',undefined,cookie)).data;
  const started=(await api('/api/economy/races/start',{requestId:`stage-${run}-race-start`,config:{mode:'career',carId:save.save.selectedLivery,level:1},runtimeVersion:RACE_RUNTIME_VERSION},cookie)).data;assert.ok(started.raceId);
  await api('/api/economy/races/cancel',{raceId:started.raceId},cookie);checks.push('real Worker authoritative career start/cancel (finish NOT exercised)');
  const rows=await cf(`/d1/database/${receipt.dbId}/query`,{method:'POST',stageDbId:receipt.dbId,body:{sql:'SELECT balance FROM crew_treasuries WHERE crew_id=?',params:[crewId]}});
  assert.equal(rows[0].results[0].balance,(await api('/api/crews',undefined,cookie)).data.crew.treasuryBalance);checks.push('remote isolated D1 balance agrees with API');
  await api('/api/auth/logout',{},cookie);await api('/api/account/save',undefined,cookie,401);login=await api('/api/auth/login',{username:'w1st1r',password});assert.match(login.cookie,/^va_session=/);checks.push('logout invalidates session; login still works');
  const report={status:'INITIAL_SMOKE_PASS',sourceSha:receipt.sourceSha,url:origin,checks,remaining:['visual iPhone/Safari','live 6-client clan wars and capture','real race finish/reward staging trace','season close/hold/income Cron end-to-end','chat/friends/cases/ghost/report attachments/OWNER flows','PWA upgrade and rollback gates']};
  writeFileSync('artifacts/v2-staging/smoke.json',JSON.stringify(report,null,2));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n### Initial staging smoke PASS\n${checks.map(x=>'- '+x).join('\n')}\n\n**Not a release gate PASS.** Remaining: ${report.remaining.join('; ')}.\n`);
  console.log('Initial staging HTTP/API/D1 smoke passed; full release gates remain open.');
}catch(e){if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n### Staging smoke BLOCKED\n'+e.message+'\n');console.error(e.message);process.exitCode=1;}
