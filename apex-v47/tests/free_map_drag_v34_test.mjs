import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
assert.ok(city.includes("access:{x:3230,y:860,w:100,h:150}")&&city.includes("exit:{x:3455,y:860,w:100,h:150}"),'rush entry/exit missing');
assert.ok(city.includes("access:{x:845,y:1288,w:205,h:124}")&&city.includes("exit:{x:845,y:1380,w:205,h:124}"),'bomb arena entry/exit missing');
assert.ok(city.includes("building:{x:605,y:1128,w:330,h:138}"),'bomb arena must stay clear of arterial');
assert.ok(!city.includes("building:{x:720,y:1210,w:290,h:126}"),'old road-overlapping bomb arena remains');

// Money-drag UI and server authority must both exist.
for(const token of ['freeDragBetPanel','freeDragBetBalance','freeDragBetChoices','freeDragBetPot','freeDragBetJoin'])assert.ok(html.includes(token),`drag wager UI missing ${token}`);
assert.ok(css.includes('.free-drag-bet-panel'),'drag wager mobile CSS missing');
assert.ok(client.includes('DRAG_WAGER_OPTIONS=Object.freeze([0,100,250,500,1000,2500,5000])'),'client wager options missing');
assert.ok(server.includes('FREE_DRAG_WAGERS=Object.freeze([0,100,250,500,1000,2500,5000])'),'server wager allowlist missing');
for(const token of ['lockFreeDragWager','settleFreeDragWager','refundFreeDragWager','cancelFreeDrag'])assert.ok(server.includes(token),`server money-drag primitive missing ${token}`);

class FakeStatement{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async first(){
    if(this.sql.includes("json_extract(save_json,'$.credits')")){const uid=this.args[0];return {credits:this.db.balance.get(uid)??0};}
    throw new Error('unsupported first: '+this.sql);
  }
  async run(){
    const q=this.sql;
    if(q.includes('SELECT COUNT(*) FROM player_saves')){
      const [wager,,u1,u2,,,minimum]=this.args,b1=this.db.balance.get(u1),b2=this.db.balance.get(u2);
      if(Number.isFinite(b1)&&Number.isFinite(b2)&&b1>=minimum&&b2>=minimum){this.db.balance.set(u1,b1-wager);this.db.balance.set(u2,b2-wager);return {meta:{changes:2}};}
      return {meta:{changes:0}};
    }
    if(q.includes('WHERE user_id IN (?,?)')){
      const [amount,,u1,u2]=this.args;this.db.balance.set(u1,(this.db.balance.get(u1)??0)+amount);this.db.balance.set(u2,(this.db.balance.get(u2)??0)+amount);return {meta:{changes:2}};
    }
    if(q.includes('WHERE user_id=?')){
      const [amount,,uid]=this.args;this.db.balance.set(uid,(this.db.balance.get(uid)??0)+amount);return {meta:{changes:1}};
    }
    throw new Error('unsupported run: '+q);
  }
}
class FakeDB{
  constructor(entries){this.balance=new Map(entries);}
  prepare(sql){return new FakeStatement(this,sql);}
}

const sent1=[],sent2=[];
const s1={deserializeAttachment(){return {playerId:'p1'}},send(t){sent1.push(JSON.parse(t))}};
const s2={deserializeAttachment(){return {playerId:'p2'}},send(t){sent2.push(JSON.parse(t))}};
const db=new FakeDB([['u1',2000],['u2',2000]]);
const ctx={storage:{async put(){},async setAlarm(){},async get(){return null}},getWebSockets(){return [s1,s2]}};
const room=new Room(ctx,{DB:db});room.loaded=true;room.save=async()=>{};
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

console.log('free_map_drag_v34_test: OK — V40 single drift megapark + visible driveways + server-authoritative CR wagers');
