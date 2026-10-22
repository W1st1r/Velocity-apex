import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {webkit,chromium,devices}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const expected=JSON.parse(readFileSync(path.join(root,'version.json'),'utf8')).version;
const artifacts=process.env.STARTUP_ARTIFACTS||'artifacts/startup-v201';
mkdirSync(artifacts,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
let server,base=process.env.STARTUP_BASE_URL;
if(!base){
  server=createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.startsWith('/api/')){
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify(pathname==='/api/auth/me'?{ok:true,authenticated:false}:pathname==='/api/health'?{ok:true,version:expected}:{ok:true,items:[],friends:[],reports:[],messages:[]}));return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
    try{res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
}
base=base.replace(/\/$/,'');
const results=[];
try{
  for(const [engine,numbers] of [[webkit,[13,14,15,17]],[chromium,[13]]]){
    const browser=await engine.launch({headless:true});
    try{
      for(const number of numbers){
        const name=Object.keys(devices).find(n=>n===`iPhone ${number} landscape`);
        assert.ok(name,`missing iPhone ${number} landscape profile`);
        const {defaultBrowserType,...device}=devices[name];
        const context=await browser.newContext({...device,reducedMotion:'reduce'});
        // Production verification only reads public pages and APIs.
        if(process.env.STARTUP_BASE_URL)await context.route('**/api/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
        const page=await context.newPage(),errors=[],responses=new Map(),failed=[];
        page.on('pageerror',error=>errors.push(String(error)));
        page.on('response',response=>responses.set(response.url(),response.status()));
        page.on('requestfailed',request=>{if(/\/(?:js|css)\//.test(request.url()))failed.push(request.url());});
        const label=`${engine.name()}-iphone-${number}`;
        try{
          const response=await page.goto(base+'/',{waitUntil:'load',timeout:30000});assert.equal(response.status(),200);
          await page.waitForFunction(version=>document.documentElement.dataset.appVersion===version,expected,{timeout:15000});
          await page.locator('#authGate:visible, #menu:visible').first().waitFor({state:'visible',timeout:15000});
          await page.waitForTimeout(1200);
          const state=await page.evaluate(()=>({body:!!document.body,app:!!document.querySelector('#app'),canvas:!!document.querySelector('#game'),title:document.title,visible:[...document.querySelectorAll('#authGate,#menu')].some(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>200&&r.height>100&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;})}));
          assert.equal(state.body,true,'version rendering deleted body');assert.equal(state.app,true,'application root deleted');assert.equal(state.canvas,true,'game canvas deleted');assert.equal(state.visible,true,'login/main menu not visible');assert.ok(state.title.includes(expected));
          const assets=await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(nodes=>nodes.map(n=>n.src||n.href));
          for(const url of assets){if(new URL(url).origin===new URL(base).origin)assert.equal(responses.get(url),200,`asset unavailable: ${url}`);}
          assert.deepEqual(failed,[],'critical static request failed');assert.deepEqual(errors,[],'frontend runtime exceptions');
          await page.screenshot({path:path.join(artifacts,label+'.png')});
          await page.reload({waitUntil:'load'});
          await page.waitForFunction(version=>document.documentElement.dataset.appVersion===version&&!!document.body&&!!document.querySelector('#app'),expected);
          await page.locator('#authGate:visible, #menu:visible').first().waitFor({state:'visible'});
          assert.deepEqual(errors,[],'reload produced runtime exceptions');
          results.push({profile:label,status:'PASS',assets:assets.length,version:expected,menuOrLoginVisible:true,reload:true});
        }catch(error){await page.screenshot({path:path.join(artifacts,label+'-failure.png')}).catch(()=>{});results.push({profile:label,status:'FAIL',error:String(error),errors,failed});throw error;}
        finally{await context.close();}
      }
    }finally{await browser.close();}
  }
  console.log(JSON.stringify({status:'PASS',origin:base,profiles:results},null,2));
}finally{
  writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({origin:base,expected,results},null,2));
  if(server)await new Promise(resolve=>server.close(resolve));
}
