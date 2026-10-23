import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {webkit,chromium,devices}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const expected=JSON.parse(readFileSync(path.join(root,'version.json'),'utf8')).version;
const repeats=Number(process.env.STARTUP_REPEATS||1);
assert.ok(Number.isInteger(repeats)&&repeats>=1&&repeats<=3,'STARTUP_REPEATS must be between 1 and 3');
const artifacts=process.env.STARTUP_ARTIFACTS||'artifacts/startup-v201';
mkdirSync(artifacts,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
let server,base=process.env.STARTUP_BASE_URL;
if(!base){
  server=createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.startsWith('/api/')){
      const protectedFriends=/^\/api\/friends(?:\/|$)/.test(pathname);
      res.writeHead(protectedFriends?401:200,{'content-type':'application/json'});
      res.end(JSON.stringify(protectedFriends?{ok:false,error:'AUTH_REQUIRED'}:pathname==='/api/auth/me'?{ok:true,authenticated:false}:pathname==='/api/health'?{ok:true,version:expected}:{ok:true,items:[],friends:[],reports:[],messages:[]}));return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
    try{res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':pathname==='/version.json'?'no-store, no-cache, must-revalidate, max-age=0':'no-store'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
}
base=base.replace(/\/$/,'');
const results=[];
let failures=0;
const origin=new URL(base).origin;
const safePath=raw=>{const u=new URL(raw);return {path:u.pathname,build:u.searchParams.get('build')||undefined};};
async function inspectPage(page){
  return page.evaluate(async()=>{
    const visible=[...document.querySelectorAll('#authGate,#menu')].some(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>200&&r.height>100&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;});
    let registrations=[];
    try{if('serviceWorker'in navigator)registrations=(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,scriptURL:r.active?.scriptURL||r.waiting?.scriptURL||r.installing?.scriptURL||null}));}catch{}
    return {readyState:document.readyState,body:!!document.body,app:!!document.querySelector('#app'),canvas:!!document.querySelector('#game'),title:document.title,appVersion:document.documentElement?.dataset.appVersion||null,resourceVersion:document.documentElement?.dataset.resourceVersion||null,visible,ghostReplay:typeof window.Racing?.GhostReplay,serviceWorker:{controller:!!navigator.serviceWorker?.controller,registrations}};
  });
}
async function checkAssets(page,responses){
  const urls=await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(nodes=>nodes.map(n=>n.src||n.href));
  const internal=urls.filter(url=>new URL(url).origin===origin);
  const checks=internal.map(url=>{const p=safePath(url),row=[...responses].reverse().find(r=>r.path===p.path&&r.build===p.build);return {...p,status:row?.status};});
  return checks;
}
async function versionResponse(page,observedResponses,fromIndex=0){
  const isVersionResponse=response=>{try{const u=new URL(response.url());return u.origin===origin&&u.pathname==='/version.json';}catch{return false;}};
  const response=observedResponses.slice(fromIndex).find(isVersionResponse)||await page.waitForResponse(isVersionResponse,{timeout:8000});
  let body=null,error=null;try{body=await response.json();}catch(e){error=String(e);}
  return {status:response.status(),version:body?.version,resourceVersion:body?.resourceVersion,channel:body?.channel,error};
}
try{
  for(const [engine,numbers] of [[webkit,[13,14,15,17]],[chromium,[13]]]){
    const browser=await engine.launch({headless:true});
    try{
      for(let repeat=1;repeat<=repeats;repeat++){
        for(const number of numbers){
          const name=Object.keys(devices).find(n=>n==='iPhone '+number+' landscape');
          assert.ok(name,'missing iPhone '+number+' landscape profile');
          const {defaultBrowserType,...device}=devices[name];
          const context=await browser.newContext({...device,reducedMotion:'reduce'});
          if(process.env.STARTUP_BASE_URL)await context.route('**/api/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
          const page=await context.newPage(),diagnostics={responses:[],versionResponses:[],failedRequests:[],consoleErrors:[],pageErrors:[],manifest:null};
          const label=engine.name()+'-iphone-'+number+'-repeat-'+repeat;
          page.on('pageerror',error=>diagnostics.pageErrors.push(String(error)));
          page.on('console',msg=>{if(msg.type()==='error'&&diagnostics.consoleErrors.length<50)diagnostics.consoleErrors.push({text:msg.text().slice(0,500),location:msg.location()});});
          page.on('response',response=>{try{const u=new URL(response.url());if(u.origin===origin){if(u.pathname==='/version.json')diagnostics.versionResponses.push(response);diagnostics.responses.push({path:u.pathname,build:u.searchParams.get('build')||undefined,status:response.status(),resourceType:response.request().resourceType(),fromServiceWorker:response.fromServiceWorker()});}}catch{}});
          page.on('requestfailed',request=>{try{const u=new URL(request.url());if(u.origin===origin){const f=request.failure();diagnostics.failedRequests.push({...safePath(request.url()),errorText:typeof f==='string'?f:(f?.errorText||null),resourceType:request.resourceType(),method:request.method()});}}catch{}});
          try{
            const versionResponseStart=diagnostics.versionResponses.length;
            const response=await page.goto(base+'/',{waitUntil:'load',timeout:30000});
            assert.equal(response?.status(),200,'index.html did not return HTTP 200');
            diagnostics.manifest=await versionResponse(page,diagnostics.versionResponses,versionResponseStart);
            assert.equal(diagnostics.manifest.status,200,'version.json status was not 200');
            assert.equal(diagnostics.manifest.version,expected,'version.json did not match the release bundle');
            assert.equal(diagnostics.manifest.resourceVersion,expected,'resourceVersion did not match the release bundle');
            await page.waitForFunction(version=>document.documentElement.dataset.appVersion===version,expected,{timeout:15000});
            await page.locator('#authGate:visible, #menu:visible').first().waitFor({state:'visible',timeout:15000});
            await page.waitForTimeout(1200);
            const state=await inspectPage(page);
            assert.equal(state.body,true,'document body missing');
            assert.equal(state.app,true,'application root missing');
            assert.equal(state.canvas,true,'game canvas missing');
            assert.equal(state.visible,true,'login/main menu not visible');
            const guestFriendsRequests=[...diagnostics.responses,...diagnostics.failedRequests].filter(item=>/^\/api\/friends(?:\/|$)/.test(item.path));
            assert.deepEqual(guestFriendsRequests,[],'unauthenticated startup requested the protected friends API');
            assert.equal(state.appVersion,expected,'app version marker mismatch');
            assert.ok(state.title.includes(expected),'document title version mismatch');
            assert.equal(state.ghostReplay,'function','GhostReplay implementation did not load');
            const assetStatuses=await checkAssets(page,diagnostics.responses);
            for(const item of assetStatuses)assert.equal(item.status,200,'critical asset did not return HTTP 200: '+item.path);
            const ghostAsset=assetStatuses.find(item=>item.path==='/js/ghost-playback.js');
            assert.ok(ghostAsset,'ghost-playback.js is absent from index.html');
            assert.equal(ghostAsset.status,200,'ghost-playback.js did not return HTTP 200');
            const ghostSample=await page.evaluate(()=>{const G=window.Racing?.GhostReplay;if(typeof G!=='function')return {loaded:false};const g=new G([[0,0,0,0,0,0,0],[60,60,0,0,1,0,1]]);return {loaded:true,midpoint:g.atTime(.5)?.x};});
            assert.deepEqual(ghostSample,{loaded:true,midpoint:30},'timed ghost playback did not produce an interpolated pose');
            const criticalFailures=diagnostics.failedRequests.filter(f=>/\.(?:m?js|css)$/.test(f.path)||f.path==='/version.json');
            assert.deepEqual(criticalFailures,[],'critical static request failed');
            assert.deepEqual(diagnostics.pageErrors,[],'frontend runtime exception');
            assert.deepEqual(diagnostics.consoleErrors,[],'browser console error');
            await page.screenshot({path:path.join(artifacts,label+'.png')});
            const reloadVersionResponseStart=diagnostics.versionResponses.length;
            const reload=await page.reload({waitUntil:'load',timeout:30000});
            assert.equal(reload?.status(),200,'reload did not return HTTP 200');
            const reloadManifest=await versionResponse(page,diagnostics.versionResponses,reloadVersionResponseStart);
            assert.equal(reloadManifest.status,200,'version.json failed after reload');
            assert.equal(reloadManifest.version,expected,'version.json changed after reload');
            await page.waitForFunction(version=>document.documentElement.dataset.appVersion===version&&!!document.body&&!!document.querySelector('#app'),expected,{timeout:15000});
            await page.locator('#authGate:visible, #menu:visible').first().waitFor({state:'visible',timeout:15000});
            const reloadState=await inspectPage(page);
            assert.equal(reloadState.appVersion,expected,'app version changed after reload');
            assert.equal(reloadState.visible,true,'login/main menu missing after reload');
            const guestFriendsRequestsAfterReload=[...diagnostics.responses,...diagnostics.failedRequests].filter(item=>/^\/api\/friends(?:\/|$)/.test(item.path));
            assert.deepEqual(guestFriendsRequestsAfterReload,[],'unauthenticated reload requested the protected friends API');
            assert.equal(reloadState.ghostReplay,'function','GhostReplay missing after reload');
            assert.deepEqual(diagnostics.pageErrors,[],'reload produced frontend runtime exception');
            assert.deepEqual(diagnostics.consoleErrors,[],'reload produced browser console error');
            results.push({profile:label,status:'PASS',assets:assetStatuses.length,version:diagnostics.manifest.version,menuOrLoginVisible:true,ghostPlayback:true,reload:true,serviceWorker:reloadState.serviceWorker,responses:diagnostics.responses,failedRequests:diagnostics.failedRequests});
          }catch(error){
            const state=await inspectPage(page).catch(e=>({inspectionError:String(e)}));
            const failure={profile:label,status:'FAIL',error:String(error),state,manifest:diagnostics.manifest,errors:diagnostics.pageErrors,consoleErrors:diagnostics.consoleErrors,failedRequests:diagnostics.failedRequests,responses:diagnostics.responses};
            results.push(failure);failures++;console.error(JSON.stringify(failure));
            await page.screenshot({path:path.join(artifacts,label+'-failure.png')}).catch(()=>{});
          }finally{await context.close();}
        }
      }
    }finally{await browser.close();}
  }
  const summary={status:failures?'FAIL':'PASS',origin,expected,repeats,profiles:results};
  console.log(JSON.stringify(summary,null,2));
  if(failures)throw new Error(failures+' of '+results.length+' browser startup checks failed');
}finally{
  writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({origin,expected,repeats,results},null,2));
  if(server)await new Promise(resolve=>server.close(resolve));
}
