import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Room} from '../src/worker.mjs';

const client=readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const city=readFileSync(new URL('../public/js/free-city.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/css/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');

// V34 map contract: drift park is off the main y=2170 road and venues have visible access aprons.
assert.ok(client.includes("drift:{x:670,y:2310,r:320,label:'HARBOR DRIFT MEGAPARK'"),'client must expose the single enlarged harbor drift zone');
assert.ok(server.includes("harbor:{x:670,y:2310,r:320,label:'HARBOR DRIFT MEGAPARK'"),'server drift scoring zone must match client');
assert.ok(city.includes("driftHarbor:{x:170,y:1940,w:1000,h:740}"),'enlarged drift drive surface missing');
assert.ok(!client.includes('driftIndustrial:')&&!client.includes('driftParking:'),'client must not expose extra drift zones');
assert.ok(!server.includes('industrial:{x:2690')&&!server.includes('parking:{x:3700'),'server must not expose extra drift zones');
assert.ok(city.includes("access:{x:1825,y:285,w:105,h:135}")&&city.includes("exit:{x:2015,y:285,w:105,h:135}"),'stadium entry/exit missing');
assert.ok(city.includes("access:{x:3165,y:860,w:145,h:150}")&&city.includes("exit:{x:3390,y:860,w:145,h:150}"),'rush entry/exit missing');
assert.ok(city.includes("access:{x:845,y:1288,w:205,h:124}")&&city.includes("exit:{x:845,y:1380,w:205,h:124}"),'bomb arena entry/exit missing');
assert.ok(city.includes("building:{x:605,y:1128,w:330,h:138}"),'bomb arena must stay clear of arterial');
assert.ok(!city.includes("building:{x:720,y:1210,w:290,h:126}"),'old road-overlapping bomb arena remains');

// Money-drag UI and server authority must both exist.
for(const token of ['freeDragBetPanel','freeDragBetBalance','freeDragBetChoices','freeDragBetPot','freeDragBetJoin'])assert.ok(html.includes(token),`drag wager UI missing ${token}`);
assert.ok(css.includes('.free-drag-bet-panel'),'drag wager mobile CSS missing');
assert.ok(client.includes('DRAG_WAGER_OPTIONS=Object.freeze([0,100,250,500,1000,2500,5000])'),'client wager options missing');
assert.ok(server.includes('FREE_DRAG_WAGERS=Object.freeze([0,100,250,500,1000,2500,5000])'),'server wager allowlist missing');
for(const token of ['lockFreeDragWager','settleFreeDragWager','refundFreeDragWager','cancelFreeDrag'])assert.ok(server.includes(token),`server money-drag primitive missing ${token}`);

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of readFileSync(new URL('../migrations/0020_room_wager_escrow.sql',import.meta.url),'utf8').split(';').filter(x=>x.trim()))sqlite.exec(file);
sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE player_saves(user_id TEXT PRIMARY KEY,save_json TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER,updated_at INTEGER);');
for(const id of ['u1','u2']){sqlite.prepare('INSERT INTO users(id) VALUES(?)').run(id);sqlite.prepare('INSERT INTO player_saves VALUES(?,?,1,0,0)').run(id,JSON.stringify({credits:2000,legacy:{keep:true}}));}
const DB={prepare(sql){let args=[];const runNow=()=>{const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};};return{bind(...v){args=v;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},runNow,async run(){return runNow();}};},async batch(statements){sqlite.exec('BEGIN');try{const out=statements.map(s=>s.runNow());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};

const sent1=[],sent2=[];
const s1={deserializeAttachment(){return {playerId:'p1'}},send(t){sent1.push(JSON.parse(t))}};
const s2={deserializeAttachment(){return {playerId:'p2'}},send(t){sent2.push(JSON.parse(t))}};
const db={balance:{get:id=>JSON.parse(sqlite.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json).credits}};
const ctx={storage:{async put(k,v){this.value=structuredClone(v);},async setAlarm(){},async get(){return structuredClone(this.value||null)}},getWebSockets(){return [s1,s2]}};
const room=new Room(ctx,{DB});room.loaded=true;room.save=async()=>{ctx.storage.value=structuredClone(room.room);};
const player=(id,userId,name,y)=>({id,userId,name,connected:true,owner:false,adminLevel:0,level:0,totalExp:0,dragWager:0,lastSeq:0,lastStateAt:0,lastSampleTime:0,state:{x:3120,y,vx:0,vy:0,angle:0,speed:0,sampleTime:Date.now(),serverTime:Date.now()}});
const p1=player('p1','u1','@one',2635),p2=player('p2','u2','@two',2705);
room.room={mode:'freeroam',serverId:'v34-money-drag',createdAt:Date.now(),updatedAt:Date.now(),emptySince:0,records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{},eventsDisabled:false,players:[p1,p2]};

await room.handleFreeMessage(s1,p1,{type:'activity_join',activity:'drag',wager:500});
assert.equal(db.balance.get('u1'),2000,'first queued player must not be charged before a rival is found');
await room.handleFreeMessage(s2,p2,{type:'activity_join',activity:'drag',wager:500});
assert.equal(db.balance.get('u1'),1500);assert.equal(db.balance.get('u2'),1500);
const challenge=Object.values(room.room.dragChallenges)[0];assert.ok(challenge,'matching same-stake players must create a drag');
assert.equal(challenge.wager,500);assert.equal(challenge.pot,1000);assert.equal(challenge.wagerLocked,true);
const start=sent1.findLast(m=>m.type==='activity_start'&&m.activity==='drag');assert.equal(start?.wager,500);assert.equal(start?.pot,1000);

const payout=await room.settleFreeDragWager(challenge,{draw:false,winnerId:'p1'});assert.equal(payout.ok,true);assert.equal(db.balance.get('u1'),2500,'winner receives the full 1000 CR bank after both stakes were locked');assert.equal(db.balance.get('u2'),1500,'loser keeps the 500 CR stake deduction');

// A separate locked draw must refund both stakes exactly once.
const draw={id:'draw',ids:['p1','p2'],wager:250,pot:500,wagerLocked:false,wagerSettled:false};
const lockDraw=await room.lockFreeDragWager(draw);assert.equal(lockDraw.ok,true);assert.equal(db.balance.get('u1'),2250);assert.equal(db.balance.get('u2'),1250);
const refund=await room.settleFreeDragWager(draw,{draw:true,reason:'DRAW'});assert.equal(refund.ok,true);assert.equal(db.balance.get('u1'),2500);assert.equal(db.balance.get('u2'),1500);

// D1/DO crash recovery, lock replay, rollback and ambiguous old escrow protection.
let loseWrite=true;const saveNormally=room.save;room.save=async()=>{if(loseWrite&&Object.values(room.room.dragChallenges||{}).some(c=>c.id==='crash-lock'&&c.wagerLocked)){loseWrite=false;throw Error('INJECTED_DO_SAVE_FAILURE');}await saveNormally();};
const interrupted={id:'crash-lock',ids:['p1','p2'],wager:250,pot:500,startAt:Date.now()+4000,createdAt:Date.now()};
await assert.rejects(room.lockFreeDragWager(interrupted),/INJECTED_DO_SAVE_FAILURE/);assert.equal(db.balance.get('u1'),2250);assert.equal(db.balance.get('u2'),1250);
const restored=new Room(ctx,{DB});restored.save=async()=>{ctx.storage.value=structuredClone(restored.room);};await restored.load();const crash=restored.room.dragChallenges['crash-lock'];assert.equal(crash.wagerLocked,true);assert.equal((await restored.lockFreeDragWager(crash)).ok,true);assert.equal(db.balance.get('u1'),2250);
const conflict=await restored.settleFreeDragWager(crash,{draw:true});assert.equal(conflict.ok,true);assert.equal(db.balance.get('u1'),2500);assert.equal(db.balance.get('u2'),1500);assert.equal((await restored.settleFreeDragWager({...crash,wagerSettled:false},{draw:false,winnerId:'p1'})).code,'WAGER_ALREADY_SETTLED');
const legacy={id:'legacy-wager',ids:['p1','p2'],wager:100,wagerLocked:true};assert.equal((await restored.settleFreeDragWager(legacy,{draw:true})).code,'LEGACY_WAGER_RECONCILIATION_REQUIRED');assert.equal(db.balance.get('u1')+db.balance.get('u2'),4000);
assert.deepEqual(JSON.parse(sqlite.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('u1').save_json).legacy,{keep:true});sqlite.close();
console.log('free_map_drag_v34_test: OK — geometry and real D1 escrow replay, interrupted DO lock recovery, conflicting settlement and legacy pending preservation');
