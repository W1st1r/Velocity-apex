import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ensureMediaSchema,handleMediaRequest,refundMediaEvent,settleMediaEvent} from '../src/media.mjs';

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let tail=Promise.resolve(),failPrefix='';
const DB={prepare(sql){let args=[];const runNow=()=>{if(failPrefix&&sql.startsWith(failPrefix)){failPrefix='';throw Error('INJECTED_MEDIA_ATOMIC_FAILURE');}const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};};return{bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return runNow();},runNow};},async batch(statements){let release;const prior=tail;tail=new Promise(resolve=>release=resolve);await prior;sqlite.exec('BEGIN');try{const result=statements.map(s=>s.runNow());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}finally{release();}}};
const env={DB},time=Date.now();
const winnerIds=['winner-a','winner-b',...Array.from({length:10},(_,i)=>`winner-${String(i+3).padStart(2,'0')}`)];
for(const id of ['creator',...winnerIds]){
  sqlite.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'x','x',time,time);
  sqlite.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(id,JSON.stringify({credits:500,ownedLiveries:['apexLime'],ownedEffects:['standard'],caseInventory:{},legacy:{keep:true}}),time,time);
}
await ensureMediaSchema(env);
function addEvent(id,creator='creator',prize=101,status='RUNNING'){
  sqlite.prepare(`INSERT INTO media_events(id,code,creator_user_id,title,game_key,status,prize,settings_json,invite_json,winner_json,result_json,created_at,updated_at)
    VALUES(?,?,?,'Fixture','checkpoint',?,?,'{}','[]','[]','{}',?,?)`).run(id,`C${id}`,creator,status,prize,time,time);
}
const save=id=>JSON.parse(sqlite.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json);

// Concurrent repeated settlement has one atomic outcome and conserves the prize.
addEvent('settle-1');
const settled=await Promise.all([
  settleMediaEvent(env,'settle-1',['winner-a','winner-b'],{winner:'winner-a'}),
  settleMediaEvent(env,'settle-1',['winner-a','winner-b'],{winner:'winner-a'})
]);
assert(settled.every(x=>x.ok),JSON.stringify(settled));
assert.equal(save('winner-a').credits+save('winner-b').credits,1101);
assert.deepEqual([save('winner-a').credits,save('winner-b').credits].sort((a,b)=>a-b),[550,551]);
assert.equal(sqlite.prepare('SELECT status FROM media_events WHERE id=?').get('settle-1').status,'FINISHED');
assert.equal(JSON.parse(sqlite.prepare('SELECT result_json FROM media_events WHERE id=?').get('settle-1').result_json).payouts.reduce((sum,p)=>sum+p.amount,0),101);

// Media modes can pay a 12-person field; one transaction must cover the entire set.
addEvent('settle-wide','creator',120);
const wideBefore=winnerIds.reduce((sum,id)=>sum+save(id).credits,0);
const wide=await settleMediaEvent(env,'settle-wide',winnerIds,{});assert.equal(wide.ok,true,JSON.stringify(wide));
assert.equal(wide.payouts.length,12);assert.equal(wide.payouts.reduce((sum,p)=>sum+p.amount,0),120);
assert.equal(winnerIds.reduce((sum,id)=>sum+save(id).credits,0),wideBefore+120);

// Injected status-write failure rolls back every account update and receipt.
addEvent('settle-retry', 'creator', 73);
const before=[save('winner-a').credits,save('winner-b').credits];failPrefix="UPDATE media_events SET status='FINISHED'";
await assert.rejects(settleMediaEvent(env,'settle-retry',['winner-a','winner-b'],{}),/INJECTED_MEDIA_ATOMIC_FAILURE/);
assert.deepEqual([save('winner-a').credits,save('winner-b').credits],before);
assert.equal(sqlite.prepare('SELECT status FROM media_events WHERE id=?').get('settle-retry').status,'RUNNING');
const retry=await settleMediaEvent(env,'settle-retry',['winner-a','winner-b'],{});assert.equal(retry.ok,true);
assert.equal(save('winner-a').credits+save('winner-b').credits,before[0]+before[1]+73);

// Refund and terminal event status commit together; a retry cannot mint twice.
addEvent('refund-1','creator',29,'WAITING');
const refund=await refundMediaEvent(env,'refund-1','ROOM_CREATE_FAILED');assert.equal(refund.refunded,29);
assert.equal(save('creator').credits,529);
assert.equal((await refundMediaEvent(env,'refund-1')).duplicate,true);assert.equal(save('creator').credits,529);

// Rows left in the old two-phase statuses are ambiguous, so they fail closed.
addEvent('legacy-settling','creator',17,'SETTLING');
const legacy=await settleMediaEvent(env,'legacy-settling',['winner-a'],{});
assert.equal(legacy.error,'EVENT_REQUIRES_RECONCILIATION');
assert.equal(sqlite.prepare('SELECT status FROM media_events WHERE id=?').get('legacy-settling').status,'SETTLING');
assert.equal(save('winner-a').legacy.keep,true);assert.equal(save('winner-b').legacy.keep,true);

// The authenticated event-creation route now escrows CR and creates its D1 event
// row under the same idempotency receipt; retries reuse the event and DO identity.
const sessionToken='media-fixture-creator-session',sessionHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sessionToken))).toString('base64url');
sqlite.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(sessionHash,'creator',time,time+86400000,time);
sqlite.prepare('INSERT INTO media_creators(user_id,active,appointed_at,appointed_by,events_blocked,note,updated_at) VALUES(?,1,?,?,0,?,?)').run('creator',time,'creator','fixture',time);
let failRoomCreate=false;const roomCalls=[];env.ROOMS={idFromName:name=>name,get:name=>({fetch:async request=>{roomCalls.push({name,path:new URL(request.url).pathname});return failRoomCreate?new Response('{"error":"ROOM_FAILED"}',{status:503}):new Response('{"ok":true}',{status:201});}})};
async function createEvent(body){const url=new URL('https://apex.test/api/media/events/create'),response=await handleMediaRequest(new Request(url,{method:'POST',headers:{cookie:`va_session=${sessionToken}`,origin:url.origin,'content-type':'application/json'},body:JSON.stringify(body)}),env,url);return{status:response.status,data:await response.json()};}
const createBody={requestId:'media-create-key-0001',gameKey:'checkpoint',title:'Atomic fixture',prize:29,settings:{maxPlayers:4,minPlayers:2,durationMs:90000,goalLimit:4,checkpointCount:12}};
const creatorBefore=save('creator').credits,created=await createEvent(createBody);assert.equal(created.status,200,JSON.stringify(created));assert.equal(save('creator').credits,creatorBefore-29);
const replayed=await createEvent(createBody);assert.equal(replayed.data.replay,true);assert.equal(replayed.data.event.id,created.data.event.id);assert.equal(save('creator').credits,creatorBefore-29);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM media_events WHERE creator_user_id='creator' AND title='Atomic fixture'").get().n,1);
assert.equal(roomCalls.filter(x=>x.name==='MEDIA:'+created.data.event.code).length,2);

const failureBody={...createBody,requestId:'media-create-key-0002',title:'Refund fixture',prize:41};failRoomCreate=true;
const failed=await createEvent(failureBody);assert.equal(failed.status,503);assert.equal(failed.data.refunded,true);assert.equal(save('creator').credits,creatorBefore-29);
const failedRow=sqlite.prepare("SELECT status FROM media_events WHERE creator_user_id='creator' AND title='Refund fixture'").get();assert.equal(failedRow.status,'CANCELLED');
const failedReplay=await createEvent(failureBody);assert.equal(failedReplay.status,409);assert.equal(save('creator').credits,creatorBefore-29);
console.log('media_atomic_v77_test: atomic multi-winner payouts/refunds, concurrent replay, rollback/retry and fail-closed legacy state passed');
sqlite.close();
