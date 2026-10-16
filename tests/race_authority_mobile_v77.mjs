// WebKit CI integration: actual game page, isolated SQLite handlers, no production accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {handleAuthRequest} from '../src/auth.mjs';
const {webkit,devices}=createRequire(import.meta.url)('playwright');
const root=path.resolve(new URL('../public/',import.meta.url).pathname),db=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
let tail=Promise.resolve();
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(items){let done;const prev=tail;tail=new Promise(r=>done=r);await prev;db.exec('BEGIN');try{const r=[];for(const s of items)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}finally{done();}}};
const env={DB},t=Date.now();
for(let i=0;i<2;i++){
 const id='mobile'+i,cookie='mobile-fixture-'+i,hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookie))).toString('base64url');
 db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,'QA Fixture','x','x',t,t);
 db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(hash,id,t,t+86400000,t);
 db.prepare('INSERT INTO player_saves(user_id,save_json,revision,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,JSON.stringify({saveVersion:6,credits:200,ownedLiveries:['apexLime'],ownedEffects:['standard'],selectedLivery:'apexLime',selectedEffect:'standard',botCount:1,raceLaps:3,difficulty:'easy',trackId:'apexCircuit'}),1,t,t);
}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
 try{
  const origin='http://127.0.0.1:'+server.address().port,url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const c of req)chunks.push(c);const payload=Buffer.concat(chunks);const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
   const request=new Request(url,{method:req.method,headers,...(payload.length?{body:payload}:{})});
   const response=await handleAuthRequest(request,env,url)||new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(e.message)}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,screenDir=process.env.RACE_SCREENSHOT_DIR||'/tmp/velocity-race-v77';fs.mkdirSync(screenDir,{recursive:true});
let browser;
try{
 browser=await webkit.launch();
 for(const [i,name] of ['iPhone 13 Mini landscape','iPhone 17 Pro Max landscape'].entries()){
  const {defaultBrowserType,...device}=devices[name];assert.ok(device.viewport,name);const context=await browser.newContext(device);await context.addCookies([{name:'va_session',value:'mobile-fixture-'+i,url:origin}]);const page=await context.newPage();let lost=false,lossSequence=null;
  await page.route('**/api/economy/races/input',async route=>{if(!lost){lost=true;const body=route.request().postDataJSON();lossSequence=body.sequence;await route.fetch();await route.abort('connectionreset');}else await route.continue();});
  await page.goto(origin);await page.locator('#playBtn').click();await page.locator('#normalModeBtn').click();
  const started=page.waitForResponse(r=>r.url().endsWith('/api/economy/races/start')&&r.request().method()==='POST');await page.locator('#startRaceBtn').click();const response=await started;assert.equal(response.status(),200);const data=await response.json();
  await page.waitForFunction(()=>document.querySelector('#countdown')?.classList.contains('hidden'));await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>document.querySelector('#hud')&&!document.querySelector('#hud').classList.contains('hidden'));
  await new Promise((resolve,reject)=>{const deadline=Date.now()+18000;const check=()=>{const row=db.prepare('SELECT sequence FROM race_sessions WHERE id=?').get(data.raceId);if(row?.sequence>=2)resolve();else if(Date.now()>deadline)reject(Error(name+': race input recovery timed out'));else setTimeout(check,100);};check();});
  await page.keyboard.up('ArrowUp');assert.equal(lost,true);assert.equal(lossSequence,0);
  const session=db.prepare('SELECT state_json,sequence FROM race_sessions WHERE id=?').get(data.raceId),state=JSON.parse(session.state_json);assert.ok(state.frame>=240);assert.ok(state.cars.at(-1).car.speed>0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM race_input_receipts WHERE race_id=? AND sequence=0').get(data.raceId).n,1);
  const account=JSON.parse(db.prepare('SELECT save_json FROM player_saves WHERE user_id=?').get('mobile'+i).save_json);assert.equal(account.credits,200,'no payout before authoritative finish');
  await page.locator('#pauseBtn').click();await page.locator('#continueBtn').waitFor({state:'visible'});await page.screenshot({path:path.join(screenDir,'race-'+i+'.png')});await page.locator('#continueBtn').click();await page.locator('#pause').waitFor({state:'hidden'});
  await page.locator('#pauseBtn').click();await page.locator('#restartBtn').waitFor({state:'visible'});
  const restarted=page.waitForResponse(r=>r.url().endsWith('/api/economy/races/start')&&r.request().method()==='POST');await page.locator('#restartBtn').click();const restartResponse=await restarted;assert.equal(restartResponse.status(),200);const next=await restartResponse.json();assert.notEqual(next.raceId,data.raceId,'restart must not resume the previous session');assert.equal(db.prepare('SELECT status FROM race_sessions WHERE id=?').get(data.raceId).status,'cancelled');assert.equal(next.state.frame,0);
  await context.close();console.log('V77 WebKit race integration:',name,'real start, input stream, lost-response retry, no premature CR, pause/resume and fresh restart passed');
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
