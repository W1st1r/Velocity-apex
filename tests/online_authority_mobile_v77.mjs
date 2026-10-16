// WebKit CI integration: actual game page, isolated SQLite handlers, no production accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import Worker,{Room} from '../src/worker.mjs';
const {webkit,devices}=createRequire(import.meta.url)('playwright');
const root=path.resolve(new URL('../public/',import.meta.url).pathname),db=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let tail=Promise.resolve();
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(items){let done;const prev=tail;tail=new Promise(r=>done=r);await prev;db.exec('BEGIN');try{const r=[];for(const s of items)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}finally{done();}}};
const contexts=new Map(),rooms=new Map(),serverErrors=[];
class RoomContext{
 constructor(code){this.code=code;this.data=new Map();this.sockets=[];this.timer=null;this.storage={get:async k=>structuredClone(this.data.get(k)),put:async(k,v)=>{this.data.set(k,structuredClone(v));},deleteAll:async()=>{clearTimeout(this.timer);this.data.clear();},setAlarm:async at=>{clearTimeout(this.timer);this.timer=setTimeout(()=>rooms.get(code)?.alarm().catch(e=>serverErrors.push(e.message)),Math.max(1,at-Date.now()));this.timer.unref();}};}
 getWebSockets(){return this.sockets;}
}
const env={DB,ASSETS:{fetch:async()=>new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}})},ROOMS:{idFromName:code=>code,get(code){if(!rooms.has(code)){const ctx=new RoomContext(code);contexts.set(code,ctx);rooms.set(code,new Room(ctx,env));}return {fetch:request=>rooms.get(code).fetch(request)};}}},t=Date.now();
for(let i=0;i<2;i++){
 const id='mobile'+i,cookie='mobile-fixture-'+i,hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookie))).toString('base64url');
 db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,'QA Fixture','x','x',t,t);
 db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(hash,id,t,t+86400000,t);
 db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,JSON.stringify({saveVersion:6,credits:1000,ownedLiveries:['apexLime'],ownedEffects:['standard'],selectedLivery:'apexLime',selectedEffect:'standard',botCount:1,raceLaps:3,difficulty:'easy',trackId:'apexCircuit'}),1,t,t);
}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
 try{
  const origin='http://127.0.0.1:'+server.address().port,url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const c of req)chunks.push(c);const payload=Buffer.concat(chunks);const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
   const request=new Request(url,{method:req.method,headers,...(payload.length?{body:payload}:{})});
   const response=await Worker.fetch(request,env)||new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(e.message)}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,screenDir=process.env.RACE_SCREENSHOT_DIR||'/tmp/velocity-online-v77';fs.mkdirSync(screenDir,{recursive:true});
let browser;
try{
 browser=await webkit.launch();const pages=[],browserContexts=[],browserErrors=[],connections=new Map(),packetCounts=new Map();let hostId=null,dropUntil=0,dropped=false,retried=false;
 for(const [i,name] of ['iPhone 13 Mini landscape','iPhone 17 Pro Max landscape'].entries()){
  const {defaultBrowserType,...device}=devices[name],context=await browser.newContext(device);browserContexts.push(context);await context.addCookies([{name:'va_session',value:'mobile-fixture-'+i,url:origin}]);const page=await context.newPage();pages.push(page);page.on('pageerror',e=>browserErrors.push(name+': '+e.message));
  await page.routeWebSocket(/\/api\/rooms\/[^/]+\/ws\?/,socket=>{
   const u=new URL(socket.url()),code=u.pathname.split('/')[3],room=rooms.get(code),ctx=contexts.get(code),id=u.searchParams.get('playerId'),p=room?.room?.players.find(p=>p.id===id&&p.token===u.searchParams.get('token'));
   if(!p){socket.close({code:4001,reason:'invalid fixture session'});return;}
   connections.set(id,(connections.get(id)||0)+1);const peer={a:{playerId:id,lastSeenAt:Date.now()},deserializeAttachment(){return this.a;},serializeAttachment(a){this.a=a;},send(raw){const m=JSON.parse(raw);if(id===hostId&&Date.now()<dropUntil&&['race_world','race_input_ack'].includes(m.type))return;socket.send(raw);},close(code=1000,reason=''){socket.close({code,reason});}};
   ctx.sockets.push(peer);p.connected=true;p.disconnectedUntil=0;
   socket.onMessage(raw=>{try{const m=JSON.parse(raw);if(m.type==='race_inputs'&&id===hostId){const key=id+':'+m.packet.sequence;packetCounts.set(key,(packetCounts.get(key)||0)+1);if(packetCounts.get(key)>1)retried=true;if(!dropped){dropped=true;dropUntil=Date.now()+650;}}room.webSocketMessage(peer,raw).catch(e=>serverErrors.push(e.message));}catch(e){serverErrors.push(e.message);}});
   socket.onClose((code,reason)=>{if(peer.closed)return;peer.closed=true;socket.close({code:code||1000,reason:reason||''});ctx.sockets=ctx.sockets.filter(x=>x!==peer);room.webSocketClose(peer).catch(e=>serverErrors.push(e.message));});
   room.send(peer,{type:'hello',v:1,playerId:id,serverTime:Date.now(),room:room.publicRoom()});room.broadcast({type:'room_state',v:1,serverTime:Date.now(),room:room.publicRoom()},peer);
  });
  await page.goto(origin);await page.waitForFunction(()=>window.VelocityAccount?.authenticated&&window.VelocityOnline);
 }
 const cutover=await pages[0].evaluate(async()=>{
  const original=await(await fetch('/api/account/save')).json();const attack=await fetch('/api/account/save',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({save:{...original.save,credits:999999999,ownedLiveries:['apexLime','apollo-evo'],careerUnlocked:50},revision:original.revision})});
  window.VelocityAccount.queueSave({...original.save,credits:999999999,ownedLiveries:['apexLime','apollo-evo'],careerUnlocked:50,muted:true});const ok=await window.VelocityAccount.flushSave();const confirmed=await(await fetch('/api/account/save')).json();return{attackStatus:attack.status,attack:await attack.json(),ok,save:confirmed.save};
 });assert.equal(cutover.attackStatus,409);assert.equal(cutover.attack.error,'CLIENT_UPDATE_REQUIRED');assert.equal(cutover.ok,true);assert.equal(cutover.save.credits,1000);assert.deepEqual(cutover.save.ownedLiveries,['apexLime']);assert.equal(cutover.save.muted,true,'flushSave must include settings queued during an earlier autosave');assert.notEqual(cutover.save.careerUnlocked,50);
 const created=await pages[0].evaluate(async()=>{window.VelocityOnline.state.active=true;return window.VelocityOnline.client.create('RACER A',{trackId:'apexCircuit',laps:3,maxPlayers:2,wager:250,collisions:true},{liveryId:'apexLime',effectId:'standard'});});hostId=created.playerId;
 await pages[1].evaluate(async code=>{window.VelocityOnline.state.active=true;return window.VelocityOnline.client.join(code,'RACER B',{liveryId:'apexLime',effectId:'standard'});},created.code);
 for(const page of pages)await page.waitForFunction(()=>window.VelocityOnline.connected&&window.VelocityOnline.room?.players.filter(p=>p.connected).length===2);
 for(const page of pages){await page.locator('#onlineWagerConfirm').click();await page.waitForFunction(()=>{const x=window.VelocityOnline;return x.room.players.find(p=>p.id===x.playerId)?.wagerConfirmed;});await page.locator('#onlineReady').click();}
 await pages[0].waitForFunction(()=>window.VelocityOnline.room.players.every(p=>p.ready));await pages[0].locator('#onlineStartRace').click();
 for(const page of pages){await page.waitForFunction(()=>document.querySelector('#countdown')?.classList.contains('hidden')&&!document.querySelector('#hud')?.classList.contains('hidden'));await page.keyboard.down('ArrowUp');}
 const room=rooms.get(created.code),ctx=contexts.get(created.code),raceId=room.room.raceId;
 await pages[0].waitForFunction(()=>window.VelocityOnline.room?.authority&&window.VelocityOnline.client.status==='connected');
 const waitUntil=async(check,label,timeout=20000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,75));}};
 await waitUntil(()=>room.room.raceAuthority.state.sequences[hostId]>=3&&dropped&&retried,'input recovery failed');
 for(const id of ['mobile0','mobile1'])assert.equal(JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json).credits,750,'server escrow, no local debit or premature payout');
 assert(room.room.raceAuthority.state.world.frame>0);assert(room.room.raceAuthority.state.world.cars.some(c=>c.speed>0));
 await pages[0].evaluate(()=>window.VelocityOnline.client.ws.close());await waitUntil(()=>(connections.get(hostId)||0)>=2,'WebSocket did not reconnect');await pages[0].waitForFunction(()=>window.VelocityOnline.client.status==='connected');
 const before=room.room.raceAuthority.state.sequences[hostId];await waitUntil(()=>room.room.raceAuthority.state.sequences[hostId]>before,'controls did not resume');
 await pages[0].evaluate(()=>{const x=window.VelocityOnline;x.client.send({type:'race_finish',v:1,raceId:x.room.raceId,state:{laps:99,finished:true},credits:999999});});
 await waitUntil(()=>pages.length===2&&room.room.finishOrder.length===0,'unexpected finish');assert.equal(db.prepare('SELECT COUNT(*) n FROM progression_rewards WHERE event_id=?').get(raceId).n,0);
 for(const [i,page] of pages.entries()){await page.keyboard.up('ArrowUp');await page.screenshot({path:path.join(screenDir,'online-race-'+i+'.png'),animations:'disabled'});const bounds=await page.locator('#pauseBtn').boundingBox();const size=page.viewportSize();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1);}
 assert.deepEqual(serverErrors,[]);assert.deepEqual(browserErrors,[]);
 // Leaving a live wager must refund on the server, then refresh the remaining UI.
 await pages[0].evaluate(()=>window.VelocityOnline.client.leave());await waitUntil(()=>room.room.settlement.status==='refunded','server refund did not settle');
 for(const id of ['mobile0','mobile1'])assert.equal(JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get(id).save_json).credits,1000);
 for(const context of browserContexts)await context.close();console.log('V77 WebKit online: actual two-page UI + Worker/Room/D1 handlers, controls, lost ACK retry, WebSocket reconnect, rejected client finish, atomic stakes/refund and landscape controls passed; socket transport uses isolated Playwright routing');
}finally{await browser?.close();for(const ctx of contexts.values())clearTimeout(ctx.timer);await new Promise(resolve=>server.close(resolve));db.close();}
