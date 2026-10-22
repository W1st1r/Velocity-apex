import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {chromium,webkit,devices} from 'playwright';
const current=path.resolve('public'),baseline=process.env.BASELINE_DIR?path.resolve(process.env.BASELINE_DIR,'public'):null;
const output='artifacts/v202/ui';fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://local'),before=url.pathname.startsWith('/before/'),root=before?baseline:current;
 const relative=url.pathname.replace(/^\/(?:before|after)\//,'');
 const file=root&&path.resolve(root,relative||'index.html');
 if(!file||!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 let body=fs.readFileSync(file);
 if(file.endsWith('index.html'))body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const filter=process.env.UI_SCREENS?.split(',');
const examples=[['friends','.friends-card','.friends-header'],['account','.account-card','.account-header'],['promo','.promo-card','.promo-header'],['staffAdminOverlay','.admin-system-panel','.admin-system-header'],['marketDialog','.market-dialog-card',null],['rootConsole','.root-console-panel','.root-console-header']].filter(([id])=>!filter||filter.includes(id));
const results=[];
const fixtureDb=new DatabaseSync(':memory:');
for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())fixtureDb.exec(fs.readFileSync(path.join('migrations',name),'utf8'));
const districts=fixtureDb.prepare('SELECT * FROM clan_war_districts').all();fixtureDb.close();
try{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  try{for(const number of [13,14,15,17]){
   const {defaultBrowserType,...device}=devices[`iPhone ${number} landscape`];
   const context=await browser.newContext({...device,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   try{for(const variant of baseline&&number===13&&!filter?.includes('clans')?['before','after']:['after']){
    await page.goto(origin+'/'+variant+'/index.html',{waitUntil:'load'});
    for(const [id,panel,header] of examples){
     await page.evaluate(id=>{
      for(const el of document.querySelectorAll('.overlay,.market-dialog'))el.classList.add('hidden');
      const el=document.getElementById(id);el.classList.remove('hidden');el.setAttribute('aria-hidden','false');
      if(id==='marketDialog'){
       document.getElementById('shop').classList.remove('hidden');document.getElementById('shopLanding').classList.add('hidden');
       document.getElementById('marketDialogTitle').textContent='ПРОДАТЬ МАШИНУ';
       document.getElementById('marketCarSelect').innerHTML='<option>Legendary — тестовый автомобиль</option>';
       document.getElementById('marketTradeHint').textContent='Тестовый макет: торговые операции не выполняются.';
      }
     },id);
     const card=page.locator('#'+id+' '+panel),bounds=await card.boundingBox();assert(bounds&&bounds.width>200&&bounds.height>50,id+' not visible');
     assert(bounds.x>=-1&&bounds.x+bounds.width<=device.viewport.width+1,id+' horizontal overflow');
     if(variant==='after'&&header){const style=await page.locator('#'+id+' '+header).evaluate(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage,filter:getComputedStyle(el).backdropFilter}));assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.image,'none');assert(!style.filter||style.filter==='none');}
     if(id==='marketDialog'){
      await page.locator('#marketPriceInput').fill('654000');await page.locator('#marketPriceInput').focus();
      assert.equal(await page.locator('#marketPriceInput').inputValue(),'654000');
      if(variant==='after'){const styles=await page.locator('.market-price-input').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,input:getComputedStyle(el.querySelector('input')).backgroundColor,suffix:getComputedStyle(el.querySelector('b')).backgroundColor}));assert.equal(styles.input,'rgba(0, 0, 0, 0)');assert.equal(styles.suffix,'rgba(0, 0, 0, 0)');assert.equal(styles.bg,'rgb(10, 27, 49)');}
     }
     await page.screenshot({path:`${output}/${engine.name()}-iphone${number}-${variant}-${id}.png`});
     results.push({engine:engine.name(),iphone:number,variant,screen:id,status:'PASS'});
    }
   }
   if(filter?.includes('clans')){
    const crew={id:'qa-crew',leader_id:'qa1',tag:'QA',name:'Layout QA Crew',emblem:'⚡',color:'#58c7ff',capacity:15,treasuryBalance:50000,rep:100,totalRep:500};
    const members=[1,2,3,4].map(n=>({id:'qa'+n,username:'layout'+n,rep:100,warReserved:n===4}));
    const task=n=>({id:'task'+n,title:'Тестовое задание '+n,description:'Серверная цель для проверки вёрстки',target:100,progress:50,reward:1000,completed:false});
    const competition={daily:{tasks:[1,2,3].map(task),resetInMs:86400000},weekly:{tasks:[4,5,6].map(task),resetInMs:604800000},season:{id:'qa-season',endsAt:Date.now()+604800000,standings:[{crewId:crew.id,tag:'QA',name:crew.name,division:'BRONZE',rank:1,points:150,wins:1,captures:1,influence:100}]},config:{divisions:{BRONZE:'Bronze'},divisionRewards:{BRONZE:10000,SILVER:20000,GOLD:30000,PLATINUM:40000,DIAMOND:50000},participationReward:2000},history:[]};
    await page.route('**/api/**',route=>{const pathname=new URL(route.request().url()).pathname;const body=pathname==='/api/clan-wars'?{challenges:[{id:'qa-war',state:'ACCEPTED',attackerCrewId:crew.id,defenderCrewId:'other',districtId:districts[0].id,rosters:[]}]}:pathname==='/api/clan-seasons'?competition:{userId:'qa1',crew,members,districts,ranking:[],history:[],treasury:[],requests:[],weekEnd:Date.now()+604800000};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
    await page.addScriptTag({content:'window.VelocityAccount={user:{id:"qa1",username:"layout1"},authenticated:true};'});
    await page.addScriptTag({path:path.join(current,'js/free-city.js')});
    await page.addScriptTag({path:path.join(current,'js/crews.js')});
    await page.evaluate(()=>window.VelocityCrews.open());
    await page.locator('.crew-task').first().waitFor();
    assert.equal(await page.locator('.crew-task').count(),6);assert.equal(await page.locator('.crew-district-pin').count(),8);
    for(const [name,selector] of [['map','.crew-district-map'],['treasury','.crew-treasury'],['tasks','.crew-task-grid'],['season','.crew-season-title'],['roster','.crew-roster-form']]){
     const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();assert(box&&box.width>100);
     const overflow=await page.locator('#crewDialog').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false,'clan dialog horizontal overflow');
     if(name==='roster'){const checks=page.locator('.crew-roster-form input:not(:disabled)');for(let i=0;i<3;i++)await checks.nth(i).check();assert(await page.locator('.crew-roster-form button[type=submit]').isEnabled());assert.equal(await page.locator('.crew-roster-form input:disabled').count(),1);}
     await page.screenshot({path:`${output}/${engine.name()}-iphone${number}-clans-${name}.png`});results.push({engine:engine.name(),iphone:number,screen:'clans-'+name,kind:'real renderer with isolated API fixtures',status:'PASS'});
    }
    await page.locator('#crewClose').click();assert.equal(await page.locator('#crewDialog').isVisible(),false);
   }
   // Broad static layout inventory: real markup/CSS, without pretending API flows ran.
   if(number===17&&!filter){
    for(const id of ['authGate','menu','garage','shop','career','online','freeServers','settings','supportOverlay','caseModal','rootConsole']){
     await page.evaluate(id=>{document.querySelectorAll('.overlay,.market-dialog').forEach(el=>el.classList.add('hidden'));const el=document.getElementById(id);el.classList.remove('hidden');el.setAttribute('aria-hidden','false');},id);
     const box=await page.locator('#'+id).boundingBox();assert(box&&box.width>100&&box.height>50,id+' absent');
     await page.screenshot({path:`${output}/${engine.name()}-iphone17-inventory-${id}.png`});results.push({engine:engine.name(),iphone:17,screen:id,kind:'static layout only',status:'PASS'});
    }
   }
   assert.deepEqual(errors,[]);
   }finally{await context.close();}
  }}finally{await browser.close();}
 }
}finally{fs.writeFileSync(output+'/results.json',JSON.stringify({scope:'Isolated real HTML/CSS layout fixtures; not authenticated API or physical-device acceptance',results},null,2));await new Promise(r=>server.close(r));}
console.log('V202 UI layout PASS '+results.length+' screen/profile captures; all eight WebKit/Chromium iPhone landscape profiles');
