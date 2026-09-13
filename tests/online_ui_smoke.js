const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),online=fs.readFileSync(path.join(ROOT,'public/js/online.js'),'utf8');
assert.match(html,/ИГРАТЬ РЯДОМ/);assert.match(html,/id="onlineBtn"[\s\S]*?ОНЛАЙН/);assert.match(html,/VELOCITY APEX \/ ONLINE/);
for(const f of ['js/network.js','js/online.js','manifest.webmanifest'])assert.ok(html.includes(f),`index must reference ${f}`);
const ids=new Set([...html.matchAll(/\bid=["']([^"']+)/g)].map(m=>m[1]));for(const m of online.matchAll(/\$\(['"]([^'"]+)['"]\)/g))assert.ok(ids.has(m[1]),`missing DOM id ${m[1]}`);
assert.ok(online.includes('Object.entries(R.TRACKS)'),'online track list must use existing R.TRACKS');
assert.ok(!online.includes('.innerHTML'),'online nickname/player rendering must not use innerHTML');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'public/manifest.webmanifest'),'utf8'));for(const i of manifest.icons||[])assert.ok(fs.existsSync(path.join(ROOT,'public',String(i.src).replace(/^\//,''))),`missing manifest icon ${i.src}`);
console.log('online_ui_smoke: OK');
