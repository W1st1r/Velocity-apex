import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrationDir=path.join(root,'migrations');
const trackedTables=['users','player_saves','player_progress','progression_rewards','payment_orders','payment_receipts','market_buy_orders','market_sell_listings','market_history','economy_operations','race_sessions','race_input_receipts','room_wager_escrows','account_authority_backups'];

function integrity(db){
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','SQLite integrity_check failed');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[],'SQLite foreign_key_check failed');
}
function tableNames(db){return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY name").all().map(x=>x.name);}
function snapshot(db){
  integrity(db);
  const names=tableNames(db);
  for(const name of ['users','player_saves','player_progress'])assert.ok(names.includes(name),`required table missing: ${name}`);
  const counts={};
  for(const name of names){const q='SELECT COUNT(*) AS n FROM "'+name.replaceAll('"','""')+'"';counts[name]=db.prepare(q).get().n;}
  return {schemaHash:createHash('sha256').update(names.join('\n')).digest('hex'),counts};
}
function dbFromSql(sql){const db=new DatabaseSync(':memory:');db.exec(sql);integrity(db);return db;}
function quoted(v){if(v===null)return'NULL';if(typeof v==='number')return String(v);if(typeof v==='bigint')return String(v);if(v instanceof Uint8Array)return`X'${Buffer.from(v).toString('hex')}'`;return`'${String(v).replaceAll("'","''")}'`;}
function dump(db){
  const objects=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name").all();
  let out='PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n';
  for(const o of objects.filter(x=>x.type==='table'))out+=o.sql+';\n';
  for(const o of objects.filter(x=>x.type==='table')){
    const table='"'+o.name.replaceAll('"','""')+'"';
    const rows=db.prepare(`SELECT * FROM ${table}`).all();
    if(!rows.length)continue;
    const cols=Object.keys(rows[0]);
    for(const row of rows)out+=`INSERT INTO ${table} (${cols.map(c=>'"'+c.replaceAll('"','""')+'"').join(',')}) VALUES (${cols.map(c=>quoted(row[c])).join(',')});\n`;
  }
  for(const o of objects.filter(x=>x.type!=='table'))out+=o.sql+';\n';
  return out+'COMMIT;\nPRAGMA foreign_keys=ON;\n';
}
function migrationFiles(){return readdirSync(migrationDir).filter(x=>/^\d+_.+\.sql$/.test(x)).sort();}
function applySqlFile(db,file){db.exec(readFileSync(path.join(migrationDir,file),'utf8'));}
function recordMigration(db,file){db.prepare('INSERT INTO d1_migrations(name,applied_at) VALUES(?,?)').run(file,Date.now());}
function seedBeforeV77(db){
  const t=Date.now();
  db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('owner-a','owner-a','Owner A','hash','salt',t,t);
  db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('player-a','player-a','Player A','hash','salt',t,t);
  db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run('player-a',JSON.stringify({credits:98765,ownedLiveries:['vw-golf-gti','apexLime'],selectedLivery:'vw-golf-gti',upgrades:{'vw-golf-gti':{speed:3}},caseInventory:{basic:2}}),7,t,t);
  db.prepare('INSERT INTO player_progress(user_id,total_exp,created_at,updated_at) VALUES(?,?,?,?)').run('player-a',23456,t,t);
  db.prepare('INSERT INTO progression_rewards(id,user_id,source,event_id,exp,credits,requested_credits,created_at,meta_json) VALUES(?,?,?,?,?,?,?,?,?)').run('reward-a','player-a','online_time','day-a',30,60,60,t,'{}');
  db.prepare('INSERT INTO staff_admins(user_id,level,active,appointed_at,updated_at,appointed_by) VALUES(?,?,?,?,?,?)').run('owner-a',5,1,t,t,'system');
  db.prepare('INSERT INTO market_buy_orders(id,buyer_user_id,car_id,price,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('market-pending-a','player-a','vw-golf-gti',4200,'active',t,t);
  db.prepare('INSERT INTO payment_orders(id,user_id,username,package_id,rub_amount,credits,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('payment-pending-a','player-a','player-a','cr_5000',99,17000,'pending',t,t);
}
function verifySeed(db){
  const save=JSON.parse(db.prepare("SELECT save_json FROM player_saves WHERE user_id='player-a'").get().save_json);
  assert.equal(save.credits,98765);assert.deepEqual(save.ownedLiveries,['vw-golf-gti','apexLime']);assert.equal(save.upgrades['vw-golf-gti'].speed,3);
  assert.equal(db.prepare("SELECT total_exp FROM player_progress WHERE user_id='player-a'").get().total_exp,23456);
  assert.equal(db.prepare("SELECT level FROM staff_admins WHERE user_id='owner-a'").get().level,5);
  assert.equal(db.prepare("SELECT status FROM market_buy_orders WHERE id='market-pending-a'").get().status,'active');
  assert.equal(db.prepare("SELECT status FROM payment_orders WHERE id='payment-pending-a'").get().status,'pending');
}
async function simulate(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const files=migrationFiles();assert.deepEqual(files.map(x=>Number(x.slice(0,4))),Array.from({length:33},(_,i)=>i+1),'expected contiguous checked-in migrations 0001-0033');
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for(const file of files.filter(x=>Number(x.slice(0,4))<=14)){applySqlFile(db,file);recordMigration(db,file);}
  seedBeforeV77(db);
  for(const file of files.filter(x=>Number(x.slice(0,4))>=15&&Number(x.slice(0,4))<=17)){applySqlFile(db,file);recordMigration(db,file);}
  verifySeed(db);
  const dir=mkdtempSync(path.join(tmpdir(),'va-d1-release-'));const backup=path.join(dir,'backup.sqlite');
  try{
    const beforeSql=path.join(dir,'before.sql'),beforeManifest=path.join(dir,'before.json');writeFileSync(beforeSql,dump(db));snapshotSql(beforeSql,beforeManifest,'before');
    db.exec(`VACUUM INTO '${backup.replaceAll("'","''")}'`);db.close();
    const restored=new DatabaseSync(backup);restored.exec('PRAGMA foreign_keys=ON');verifySeed(restored);
    for(const file of files.filter(x=>Number(x.slice(0,4))>=18)){applySqlFile(restored,file);recordMigration(restored,file);}
    verifySeed(restored);
    const t=Date.now();
    restored.prepare('INSERT INTO room_wager_escrows(race_id,participants_json,stake,status,lock_token,created_at) VALUES(?,?,?,?,?,?)').run('wager-pending-a','["player-a","owner-a"]',500,'locked','lock-a',t);
    restored.prepare('INSERT INTO race_sessions(id,user_id,start_request_id,start_hash,runtime_version,config_json,car_save_json,seed,state_json,created_at,starts_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('race-pending-a','player-a','start-a','hash','v77','{}','{}',11,'{}',t,t,t+60000,t);
    const preserve=()=>({save:restored.prepare("SELECT save_json,revision FROM player_saves WHERE user_id='player-a'").get(),exp:restored.prepare("SELECT total_exp FROM player_progress WHERE user_id='player-a'").get().total_exp,payment:restored.prepare("SELECT status,credits FROM payment_orders WHERE id='payment-pending-a'").get(),market:restored.prepare("SELECT status,price FROM market_buy_orders WHERE id='market-pending-a'").get(),wager:restored.prepare("SELECT status,stake,lock_token FROM room_wager_escrows WHERE race_id='wager-pending-a'").get(),race:restored.prepare("SELECT status,sequence FROM race_sessions WHERE id='race-pending-a'").get()});
    const before=preserve();
    // The original V77 retry check covers migrations 0018-0021. Later additive
    // migrations can contain one-time ALTER TABLE statements, so verify their
    // first application above and reserve replay checks for their own fixtures.
    for(const file of files.filter(x=>Number(x.slice(0,4))>=18&&Number(x.slice(0,4))<=21))applySqlFile(restored,file);
    assert.deepEqual(preserve(),before,'migration retry changed player or pending transaction state');
    const sql=dump(restored);const copy=dbFromSql(sql);assert.deepEqual(snapshot(copy).counts,snapshot(restored).counts,'SQL backup restore changed table counts');
    assert.deepEqual(copy.prepare("SELECT save_json FROM player_saves WHERE user_id='player-a'").get(),restored.prepare("SELECT save_json FROM player_saves WHERE user_id='player-a'").get());
    assert.equal(copy.prepare("SELECT status FROM room_wager_escrows WHERE race_id='wager-pending-a'").get().status,'locked');
    const sqlPath=path.join(dir,'backup.sql'),afterManifest=path.join(dir,'after.json'),encrypted=path.join(dir,'backup.enc'),decrypted=path.join(dir,'roundtrip.sql');writeFileSync(sqlPath,sql);snapshotSql(sqlPath,afterManifest,'after');verifySql(beforeManifest,sqlPath);process.env.D1_BACKUP_ENCRYPTION_KEY=randomBytes(32).toString('hex');encrypt(sqlPath,encrypted);decrypt(encrypted,decrypted);assert.equal(readFileSync(decrypted,'utf8'),sql,'encrypted backup roundtrip failed');
    copy.close();restored.close();await exerciseSmoke();console.log('d1-release-safety: fixture backup/restore, migrations 15-33, V77 retry idempotency and account/CR/progress/pending payment-market-race-wager preservation passed');
  }finally{rmSync(dir,{recursive:true,force:true});}
}
async function exerciseSmoke(){
  let sessionActive=false;
  const expectedVersion=JSON.parse(readFileSync(path.join(root,'public/version.json'),'utf8')).version;
  const server=createServer(async(req,res)=>{
    const route=new URL(req.url,'http://localhost').pathname,cookie=req.headers.cookie||'';
    const send=(status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(body));};
    if(route==='/'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html'});res.end(\`<meta name="velocity-apex-version" content="\${expectedVersion}">\`);return;}
    if(route==='/version.json')return send(200,{version:expectedVersion,channel:'production'});
    if(route==='/api/health')return send(200,{ok:true,protocol:77,version:expectedVersion});
    if(route==='/api/auth/me'&&req.method==='GET')return send(200,sessionActive&&cookie.includes('va_session=release-smoke')?{authenticated:true,user:{username:'release-smoke'}}:{authenticated:false});
    if(route==='/api/friends'&&req.method==='GET')return sessionActive&&cookie.includes('va_session=release-smoke')?send(200,{ok:true,friends:[],incomingRequests:[],outgoingRequests:[]}):send(401,{error:'AUTH_REQUIRED'});
    if(route==='/api/account/save'&&req.method==='GET')return sessionActive&&cookie.includes('va_session=release-smoke')?send(200,{ok:true,save:{credits:300,ownedLiveries:['apexLime']},revision:4}):send(401,{error:'AUTH_REQUIRED'});
    if(route==='/api/economy/races/ghosts'&&req.method==='GET')return sessionActive&&cookie.includes('va_session=release-smoke')?send(200,{ok:true,own:null,global:[],friends:[]}):send(401,{error:'AUTH_REQUIRED'});
    if(route==='/api/economy/races/start')return send(401,{error:'AUTH_REQUIRED'});
    if(route==='/api/auth/login'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
      if(input.username==='release-smoke'&&input.password==='test-secret'){sessionActive=true;return send(200,{ok:true,user:{username:input.username}},{'set-cookie':'va_session=release-smoke; Path=/; HttpOnly'});}
      return send(401,{error:'INVALID_CREDENTIALS'});
    }
    if(route==='/api/auth/logout'&&req.method==='POST'&&sessionActive&&cookie.includes('va_session=release-smoke')){sessionActive=false;return send(200,{ok:true});}
    return send(404,{error:'NOT_FOUND'});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const oldUser=process.env.V77_SMOKE_USERNAME,oldPass=process.env.V77_SMOKE_PASSWORD;process.env.V77_SMOKE_USERNAME='release-smoke';process.env.V77_SMOKE_PASSWORD='test-secret';
  try{await smoke(`http://127.0.0.1:${server.address().port}`);}finally{if(oldUser===undefined)delete process.env.V77_SMOKE_USERNAME;else process.env.V77_SMOKE_USERNAME=oldUser;if(oldPass===undefined)delete process.env.V77_SMOKE_PASSWORD;else process.env.V77_SMOKE_PASSWORD=oldPass;await new Promise(resolve=>server.close(resolve));}
}
function checkMigrationState(db,stage){
  const files=migrationFiles();const applied=tableNames(db).includes('d1_migrations');assert.ok(applied,'d1_migrations table missing; refusing to infer production schema state');
  const columns=db.prepare('PRAGMA table_info(d1_migrations)').all().map(x=>x.name);assert.ok(columns.includes('name'),'unrecognized d1_migrations schema');
  const appliedNames=db.prepare('SELECT name FROM d1_migrations').all().map(x=>String(x.name));
  const nums=appliedNames.map(x=>Number((x.match(/^(\d{4})/)||[])[1])).filter(Number.isFinite).sort((a,b)=>a-b);
  const expected=files.map(x=>Number(x.slice(0,4)));
  for(let n=1;n<=17;n++)assert.ok(nums.includes(n),`pre-V77 migration ${String(n).padStart(4,'0')} is missing`);
  const appliedV77=nums.filter(n=>n>=18);
  for(let i=0;i<appliedV77.length;i++)assert.equal(appliedV77[i],18+i,'V77 migrations are not a contiguous prefix');
  for(const n of nums)assert.ok(expected.includes(n),`database has migration absent from this checkout: ${n}`);
  if(stage==='after')assert.deepEqual(nums,expected,'not all checked-in migrations were recorded after apply');
}
function snapshotSql(input,output,stage='before'){
  const db=dbFromSql(readFileSync(input,'utf8'));checkMigrationState(db,stage);writeFileSync(output,JSON.stringify(snapshot(db)));db.close();
}
function verifySql(beforePath,afterPath){
  const before=JSON.parse(readFileSync(beforePath,'utf8'));const db=dbFromSql(readFileSync(afterPath,'utf8'));checkMigrationState(db,'after');const after=snapshot(db);
  for(const name of trackedTables){if(Object.hasOwn(before.counts,name)&&Object.hasOwn(after.counts,name))assert.ok(after.counts[name]>=before.counts[name],`protected table row count decreased: ${name}`);}
  for(const name of ['users','player_saves','player_progress','economy_operations','race_sessions','race_input_receipts','room_wager_escrows','account_authority_backups'])assert.ok(Object.hasOwn(after.counts,name),`post-migration table missing: ${name}`);
  db.close();console.log('d1-release-safety: restored pre/post exports pass SQLite integrity and foreign-key checks; protected record counts did not decrease');
}
function key(){const value=process.env.D1_BACKUP_ENCRYPTION_KEY||'';if(!/^[0-9a-fA-F]{64}$/.test(value))throw Error('D1_BACKUP_ENCRYPTION_KEY must be a 32-byte hex secret');return Buffer.from(value,'hex');}
function encrypt(input,output){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const ciphertext=Buffer.concat([cipher.update(readFileSync(input)),cipher.final()]);writeFileSync(output,JSON.stringify({version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}),{mode:0o600});}
function decrypt(input,output){const envelope=JSON.parse(readFileSync(input,'utf8'));assert.equal(envelope.version,1);assert.equal(envelope.algorithm,'aes-256-gcm');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));writeFileSync(output,Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]),{mode:0o600});}
async function smoke(base){
  const expectedVersion=JSON.parse(readFileSync(path.join(root,'public/version.json'),'utf8')).version;assert.match(expectedVersion,/^\d+\.\d+\.\d+$/,'checkout release version is invalid');
  const origin=String(base||'https://velocity-apex.maximmanzha20.workers.dev').replace(/\/$/,'');
  const home=await fetch(origin+'/');assert.equal(home.status,200,'homepage unavailable');const html=await home.text();assert.ok(html.includes(`name="velocity-apex-version" content="${expectedVersion}"`),`deployed HTML does not identify V${expectedVersion}`);
  const versionResponse=await fetch(origin+'/version.json',{cache:'no-store'});assert.equal(versionResponse.status,200);const versionManifest=await versionResponse.json();assert.equal(versionManifest.version,expectedVersion);assert.equal(versionManifest.channel,'production');
  const health=await fetch(origin+'/api/health');assert.equal(health.status,200,'health endpoint unavailable');const data=await health.json();assert.equal(data.ok,true,'health endpoint did not return ok');assert.equal(data.version,expectedVersion,'Worker version mismatch');
  const save=await fetch(origin+'/api/account/save');assert.equal(save.status,401,'account save endpoint did not enforce authentication');
  const friendsAnonymous=await fetch(origin+'/api/friends');assert.equal(friendsAnonymous.status,401,'friends endpoint did not enforce authentication');
  const race=await fetch(origin+'/api/economy/races/start',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(race.status,401,'authoritative race start endpoint did not enforce authentication');
  const username=process.env.V77_SMOKE_USERNAME,password=process.env.V77_SMOKE_PASSWORD;assert.ok(username&&password,'release smoke test account secrets are required');
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username,password})});assert.equal(login.status,200,'test account login failed');const loginBody=await login.json();assert.equal(loginBody.ok,true,'login response was not successful');assert.equal(String(loginBody.user?.username||'').toLowerCase(),String(username).toLowerCase(),'login returned an unexpected account');
  const cookies=login.headers.getSetCookie?.()||[login.headers.get('set-cookie')||''];const cookie=cookies[0].split(';',1)[0];assert.match(cookie,/^va_session=/,'login did not issue an authenticated session');
  try{
    const me=await fetch(origin+'/api/auth/me',{headers:{cookie}});assert.equal(me.status,200,'authenticated session profile failed');const meBody=await me.json();assert.equal(meBody.authenticated,true,'session was not authenticated');assert.equal(String(meBody.user?.username||'').toLowerCase(),String(username).toLowerCase(),'session profile returned an unexpected account');
    const loaded=await fetch(origin+'/api/account/save',{headers:{cookie}});assert.equal(loaded.status,200,'authenticated save/garage load failed');const saveBody=await loaded.json();assert.equal(saveBody.ok,true,'save load response was not successful');assert.ok(saveBody.save&&typeof saveBody.save==='object','save payload missing');assert.ok(Array.isArray(saveBody.save.ownedLiveries),'garage inventory missing');assert.ok(Number.isInteger(saveBody.revision)&&saveBody.revision>0,'save revision missing');
    const friendsResponse=await fetch(origin+'/api/friends',{headers:{cookie,accept:'application/json'}});assert.equal(friendsResponse.status,200,'authenticated friends read failed');const friendsBody=await friendsResponse.json();assert.ok(Array.isArray(friendsBody.friends),'authenticated friends payload is invalid');
    const ghosts=await fetch(origin+'/api/economy/races/ghosts?trackId=apexCircuit&mode=normal',{headers:{cookie,accept:'application/json'}});assert.equal(ghosts.status,200,'authenticated Ghost Racing read failed');const ghostBody=await ghosts.json();assert.equal(ghostBody.ok,true,'Ghost Racing response was unsuccessful');assert.ok(Array.isArray(ghostBody.global)&&Array.isArray(ghostBody.friends),'Ghost Racing lists missing');
  }finally{
    const logout=await fetch(origin+'/api/auth/logout',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:'{}'});assert.equal(logout.status,200,'test session logout failed');
    const afterLogout=await fetch(origin+'/api/auth/me',{headers:{cookie}});assert.equal(afterLogout.status,200);assert.equal((await afterLogout.json()).authenticated,false,'session remained active after logout');
  }
  console.log(`V${expectedVersion} smoke passed: ${origin}, version/health, login/profile/logout, garage inventory, authenticated friends, Ghost Racing read and unauthenticated auth gates`);
}
const [mode,...args]=process.argv.slice(2);
if(mode==='simulate')await simulate();
else if(mode==='snapshot')snapshotSql(args[0],args[1],args[2]||'before');
else if(mode==='verify')verifySql(args[0],args[1]);
else if(mode==='encrypt')encrypt(args[0],args[1]);
else if(mode==='decrypt')decrypt(args[0],args[1]);
else if(mode==='smoke')await smoke(args[0]);
else throw Error('Usage: d1-release-safety.mjs simulate|snapshot <sql> <manifest>|verify <manifest> <sql>|encrypt <in> <out>|decrypt <in> <out>');
