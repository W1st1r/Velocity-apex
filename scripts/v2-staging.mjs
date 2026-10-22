import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyMigrationCopy} from './v2-staging-data.mjs';

export const PROD_DB='dee1721c-9730-4780-9185-7b23666333b2';
export const STAGE_WORKER='velocity-apex-v2-staging',STAGE_DB='velocity-apex-v2-staging-db',STAGE_BUCKET='velocity-apex-v2-staging-bugs';
const production='/workers/scripts/velocity-apex';
function summary(text){if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,text+'\n');}
export function assertStageDb(id,productionIds=[PROD_DB]){assert.match(id,/^[0-9a-f-]{36}$/i);assert.ok(!productionIds.includes(id),'refusing production D1 mutation');}
export function assertStagingUrl(url,subdomain){assert.match(subdomain,/^[a-z0-9-]+$/);assert.equal(new URL(url).origin,`https://${STAGE_WORKER}.${subdomain}.workers.dev`);return new URL(url).origin;}
export function createCfClient(account,token,fetcher=fetch){
  assert.match(account,/^[0-9a-f]{32}$/i);assert.ok(token);
  return async(path,{method='GET',body,stageDbId}={})=>{
    if(method!=='GET'){
      const permitted=method==='POST'&&(path==='/d1/database'||path==='/r2/buckets'||(stageDbId&&path===`/d1/database/${stageDbId}/query`));
      assert.ok(permitted,'unapproved Cloudflare mutation');if(stageDbId)assertStageDb(stageDbId);
    }
    const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json();if(!r.ok||data.success!==true)throw Error(`Cloudflare ${method} ${path.replace(/[0-9a-f-]{36}/gi,'[database]')} failed HTTP ${r.status}; details withheld`);
    return data.result;
  };
}
export function makeStageConfig(dbId){assertStageDb(dbId);return{name:STAGE_WORKER,main:'src/worker.mjs',compatibility_date:'2026-09-13',workers_dev:true,triggers:{crons:['0 * * * *']},assets:{directory:'./public',binding:'ASSETS',run_worker_first:['/api/*']},d1_databases:[{binding:'DB',database_name:STAGE_DB,database_id:dbId,migrations_dir:'migrations'}],durable_objects:{bindings:[{name:'ROOMS',class_name:'Room'}]},exports:{Room:{type:'durable-object',storage:'sqlite'}},r2_buckets:[{binding:'BUG_REPORTS_BUCKET',bucket_name:STAGE_BUCKET}]};}
function command(args,label){try{return execFileSync(resolve('node_modules/.bin/wrangler'),args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:600000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});}catch{throw Error(`${label} failed; raw output withheld to protect export URLs/data`);}}
export async function prepare(){
  const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,D1_BACKUP_ENCRYPTION_KEY:key,STAGING_QA_PASSWORD:password}=process.env;
  assert.match(key||'',/^[0-9a-f]{64}$/i,'D1_BACKUP_ENCRYPTION_KEY is required');assert.ok(password?.length>=12,'STAGING_QA_PASSWORD must have at least 12 characters');
  const cf=createCfClient(account,token),verification=await cf('/tokens/verify');assert.equal(verification.status,'active');
  const db=await cf(`/d1/database/${PROD_DB}`);assert.equal(db.uuid,PROD_DB);assert.equal(db.name,'velocity-apex-db');
  const settings=await cf(`${production}/settings`),bindings=settings.bindings||settings.settings?.bindings;assert.ok(Array.isArray(bindings),'production bindings unavailable');
  assert.ok(bindings.some(b=>b.type==='d1'&&(b.id||b.database_id)===PROD_DB),'unexpected production DB binding');
  assert.ok(!bindings.some(b=>b.bucket_name===STAGE_BUCKET),'staging bucket is referenced by production');
  const productionIds=bindings.filter(b=>b.type==='d1').map(b=>b.id||b.database_id);
  const prodNamespaces=bindings.filter(b=>b.type==='durable_object_namespace').map(b=>b.namespace_id).filter(Boolean);assert.ok(prodNamespaces.length,'production DO namespace metadata unavailable');
  const buckets=await cf('/r2/buckets');assert.ok(Array.isArray(buckets.buckets||buckets),'R2 metadata access unavailable');
  const sub=await cf('/workers/subdomain');assert.match(sub.subdomain,/^[a-z0-9-]+$/);
  const databases=await cf('/d1/database?per_page=100');assert.ok(Array.isArray(databases));
  let stage=databases.find(d=>d.name===STAGE_DB);
  if(!stage)stage=await cf('/d1/database',{method:'POST',body:{name:STAGE_DB}});
  assertStageDb(stage.uuid,[PROD_DB,...productionIds]);
  const query=sql=>cf(`/d1/database/${stage.uuid}/query`,{method:'POST',stageDbId:stage.uuid,body:{sql}});
  const schema=await query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN('_cf_KV','d1_migrations')");
  const tables=schema[0]?.results||[];
  if(tables.length){assert.ok(tables.some(x=>x.name==='v2_staging_identity'),'existing database is not identified as staging');const marker=await query('SELECT kind FROM v2_staging_identity');assert.equal(marker[0]?.results?.[0]?.kind,'isolated-v2-staging');}
  else await query("CREATE TABLE v2_staging_identity(kind TEXT PRIMARY KEY); INSERT INTO v2_staging_identity VALUES('isolated-v2-staging')");
  if(!(buckets.buckets||buckets).some(b=>b.name===STAGE_BUCKET))await cf('/r2/buckets',{method:'POST',body:{name:STAGE_BUCKET}});
  const config=makeStageConfig(stage.uuid);assertStageDb(config.d1_databases[0].database_id,[PROD_DB,...productionIds]);
  writeFileSync('.v2-staging-wrangler.json',JSON.stringify(config,null,2),{mode:0o600});
  mkdirSync('.v2-staging-private',{recursive:true,mode:0o700});mkdirSync('artifacts/v2-staging',{recursive:true});
  const raw='.v2-staging-private/v77.sql',restored='.v2-staging-private/restored.sql';
  // The only production data operation: read-only export, never SQL or migrations.
  command(['d1','export','velocity-apex-db','--remote','--config','wrangler.jsonc',`--output=${raw}`],'production read-only export');
  try{
    const result=verifyMigrationCopy(raw);summary('### Private V77 copy migration check\n'+JSON.stringify(result));
    const encrypted='artifacts/v2-staging/v77-source.enc.json';
    execFileSync(process.execPath,['scripts/d1-release-safety.mjs','encrypt',raw,encrypted]);
    execFileSync(process.execPath,['scripts/d1-release-safety.mjs','decrypt',encrypted,restored]);
    assert.equal(createHash('sha256').update(readFileSync(raw)).digest('hex'),createHash('sha256').update(readFileSync(restored)).digest('hex'));
    writeFileSync('artifacts/v2-staging/SHA256SUMS',createHash('sha256').update(readFileSync(encrypted)).digest('hex')+'  v77-source.enc.json\n');
  }finally{for(const f of [raw,restored])if(existsSync(f))unlinkSync(f);}
  command(['d1','migrations','apply',STAGE_DB,'--remote','--config','.v2-staging-wrangler.json'],'isolated D1 migrations');
  command(['d1','migrations','apply',STAGE_DB,'--remote','--config','.v2-staging-wrangler.json'],'isolated migration mechanism replay');
  const url=assertStagingUrl(`https://${STAGE_WORKER}.${sub.subdomain}.workers.dev`,sub.subdomain);
  writeFileSync('.v2-staging-private/receipt.json',JSON.stringify({worker:STAGE_WORKER,dbId:stage.uuid,url,subdomain:sub.subdomain,prodNamespaces,sourceSha:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()}),{mode:0o600});
  summary('### Staging preparation\n- Separate Worker/D1/R2; no production writes.\n- Production rows remain private; public staging starts with synthetic accounts only.\n- Production export permission and decrypt/restore verified; this is NOT the final pre-release backup.');
}
export async function verifyDeployment(){
  const receipt=JSON.parse(readFileSync('.v2-staging-private/receipt.json'));
  const cf=createCfClient(process.env.CLOUDFLARE_ACCOUNT_ID,process.env.CLOUDFLARE_API_TOKEN);
  const settings=await cf(`/workers/scripts/${STAGE_WORKER}/settings`),bindings=settings.bindings||settings.settings?.bindings;assert.ok(Array.isArray(bindings));
  assert.ok(bindings.some(b=>b.type==='d1'&&(b.id||b.database_id)===receipt.dbId));assert.ok(bindings.some(b=>b.type==='r2_bucket'&&b.bucket_name===STAGE_BUCKET));
  const namespaces=bindings.filter(b=>b.type==='durable_object_namespace').map(b=>b.namespace_id).filter(Boolean);
  assert.ok(namespaces.length);assert.ok(namespaces.every(n=>!receipt.prodNamespaces.includes(n)),'Durable Objects namespace overlaps production');
  summary(`### Deployed isolated staging\n- URL: ${receipt.url}\n- Test login: w1st1r / your STAGING_QA_PASSWORD secret\n- DO namespace differs from production; D1 and R2 binding checks passed.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(process.argv[2]==='prepare')await prepare();else if(process.argv[2]==='verify')await verifyDeployment();else throw Error('mode required');}catch(e){summary('### Staging BLOCKED\n'+e.message);console.error(e.message);process.exitCode=1;}}
