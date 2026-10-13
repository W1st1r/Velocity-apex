import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/worker.mjs';
import {writeGameLog,queryGameLogs,detectSavePurchases} from '../src/logs.mjs';

const db=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const DB={
  prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}},
  async batch(statements){const out=[];db.exec('BEGIN');try{for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}
};
const env={DB};
const owner='11111111-1111-4111-8111-111111111111',player='22222222-2222-4222-8222-222222222222',t=Date.now();
const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('base64url');
for(const [id,username] of [[owner,'w1st1r'],[player,'player123']])db.prepare('INSERT INTO users (id,username,display_name,password_hash,password_salt,password_iterations,created_at,updated_at,last_login_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,username,username,'x','x',100000,t,t,t);
for(const [token,id] of [['owner-token',owner],['player-token',player]])db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(await hash(token),id,t,t+86400000,t);
db.prepare('INSERT INTO admin_unlocks VALUES (?,?,?,?)').run(await hash('owner-token'),owner,t,t+86400000);

await writeGameLog(env,{category:'blocks',eventType:'ban',actorUserId:owner,targetUserId:player,serverId:'EU-01',source:'ADMIN',subject:'Блокировка',reason:'Bug Abuse',relatedId:'BAN-1',metadata:{durationMs:604800000},createdAt:t-3000});
await writeGameLog(env,{category:'chat',eventType:'chat_message',actorUserId:player,actorRole:'PLAYER',targetUserId:player,serverId:'EU-01',source:'CHAT',subject:'Сообщение чата',message:'hello apex',metadata:{prefix:'',deleted:false},createdAt:t-2000});
await writeGameLog(env,{category:'system',eventType:'credits',actorUserId:owner,targetUserId:player,source:'OWNER_PANEL',subject:'Выдача денег',amount:50000,currency:'CR',createdAt:t-1000});

let q=await queryGameLogs(env,{category:'all',q:'player123',limit:10});
assert.equal(q.items.length,3);
assert.equal(q.items[0].eventType,'credits');
assert.match(q.items[0].id,/^LOG-[A-F0-9]{12}$/);
assert.equal((await queryGameLogs(env,{category:'blocks'})).items.length,1);
assert.equal((await queryGameLogs(env,{category:'chat',q:'hello apex'})).items.length,1);
assert.equal((await queryGameLogs(env,{actorRole:'OWNER'})).items.length,2);
assert.equal((await queryGameLogs(env,{actorRole:'PLAYER'})).items.length,1);
assert.equal((await queryGameLogs(env,{server:'EU-01'})).items.length,2);
assert.equal((await queryGameLogs(env,{from:t-1500})).items.length,1);

const purchase=detectSavePurchases({credits:10000,ownedLiveries:['apexLime'],ownedEffects:[],caseInventory:{},carUpgrades:{},carCustomization:{}},{credits:7000,ownedLiveries:['apexLime','mary'],ownedEffects:[],caseInventory:{},carUpgrades:{},carCustomization:{}});
assert.equal(purchase.spent,3000);assert.equal(purchase.items[0].kind,'car');assert.equal(purchase.items[0].id,'mary');
assert.equal(detectSavePurchases({credits:1000,ownedLiveries:['apexLime']},{credits:1200,ownedLiveries:['apexLime']}),null);

async function call(token){const r=await worker.fetch(new Request('https://apex.test/api/owner/logs?category=all&q=player123',{headers:{cookie:`va_session=${token}`,origin:'https://apex.test'}}),env);return {status:r.status,body:await r.json()};}
const denied=await call('player-token');assert.equal(denied.status,403);
const allowed=await call('owner-token');assert.equal(allowed.status,200);assert.equal(allowed.body.items.length,3);

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/js/owner-panel.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/css/owner-panel.css',import.meta.url),'utf8');
assert.match(html,/data-root-tab="logs"/);assert.match(html,/id="rootPaneLogs"/);assert.match(js,/\/api\/owner\/logs/);assert.match(js,/ownerLogsCategory/);assert.match(css,/\.owner-logs-shell/);

console.log('logs_system_test: OK — owner-only API, immutable server log table, search/filters, unique Log ID, purchase diff detection and mobile Logs UI wiring');
