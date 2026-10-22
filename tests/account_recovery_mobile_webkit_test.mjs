import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webkit,devices} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const files={'/account-recovery.html':['account-recovery.html','text/html; charset=utf-8'],'/js/account-recovery-page.js':['js/account-recovery-page.js','text/javascript; charset=utf-8']};
const server=createServer((req,res)=>{const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':file[1],'cache-control':'no-store'});res.end(readFileSync(path.join(root,file[0])));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser;
try{
  browser=await webkit.launch({headless:true});
  const context=await browser.newContext({...devices['iPhone 13']});
  const page=await context.newPage(),requests=[];
  let offlineOnce=true;await page.route('**/api/auth/password/reset',async route=>{if(offlineOnce){offlineOnce=false;await route.abort('internetdisconnected');return;}requests.push(JSON.parse(route.request().postData()||'{}'));await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
  const origin='http://127.0.0.1:'+server.address().port,token='A'.repeat(43);
  await page.goto(origin+'/account-recovery.html?mode=reset#'+token);
  assert.equal(await page.locator('#form').isVisible(),true);
  assert.equal(await page.evaluate(()=>location.hash),'#'+token,'token remains available while the network request is retried');
  assert.ok(await page.locator('#password').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'iOS input avoids focus zoom');
  await page.locator('#password').fill('secure-new-password');await page.locator('#confirm').fill('secure-new-password');await page.locator('#submit').click();await page.getByText('Нет подключения.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>location.hash),'#'+token);await page.locator('#submit').click();
  await page.getByText('Пароль изменён.',{exact:false}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].token,token);

  await page.unroute('**/api/auth/password/reset');
  await page.route('**/api/auth/email/verify',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await page.goto(origin+'/account-recovery.html?mode=verify#'+token);
  await page.getByText('Email подтверждён.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>location.hash),'');

  await page.unroute('**/api/auth/email/verify');
  await page.route('**/api/auth/password/reset',route=>route.fulfill({status:400,contentType:'application/json',body:'{"error":"INVALID_OR_EXPIRED_TOKEN"}'}));
  await page.goto(origin+'/account-recovery.html?mode=reset#'+token);
  await page.locator('#password').fill('secure-new-password');await page.locator('#confirm').fill('secure-new-password');await page.locator('#submit').click();
  await page.getByText('Ссылка недействительна',{exact:false}).waitFor();
  await context.close();console.log('account_recovery_mobile_webkit_test: iPhone Safari emulation passed reset, email verification, token removal, and invalid-link UI');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
