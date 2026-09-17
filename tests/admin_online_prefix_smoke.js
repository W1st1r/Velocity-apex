const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const worker=fs.readFileSync(path.join(ROOT,'src/worker.mjs'),'utf8');
const admin=fs.readFileSync(path.join(ROOT,'src/admin-system.mjs'),'utf8');
const free=fs.readFileSync(path.join(ROOT,'public/js/freeroam.js'),'utf8');
const online=fs.readFileSync(path.join(ROOT,'public/js/online.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
for(const token of ["export async function staffOnlineLevel","FROM staff_admins WHERE user_id=? AND active=1"]) assert.ok(admin.includes(token),`missing staff level lookup: ${token}`);
for(const token of ['staffOnlineLevel','adminLevel:Math.max(0,Math.min(5','free_chat', 'refreshPublicIdentity']) assert.ok(worker.includes(token),`missing online admin propagation: ${token}`);
for(const [level,label] of [[1,'HELPER'],[2,'MODER'],[3,'ST.MODER'],[4,'ADMIN'],[5,'CURATOR']]){
  assert.ok(free.includes(`${level}:{label:'${label}'`),`free roam rank ${level} missing`);
  assert.ok(online.includes(`${level}:{label:'${label}'`),`online lobby rank ${level} missing`);
}
for(const cls of ['admin-helper','admin-moder','admin-st-moder','admin-admin','admin-curator']) assert.ok(css.includes(`.${cls}`),`missing prefix CSS ${cls}`);
for(const color of ['#0e7c76','#145fa8','#6540a8','#a35d12','#8d7410']) assert.ok(css.includes(color),`missing chosen admin color ${color}`);
assert.ok(free.includes("if(isOwner)")&&free.includes("else if(isQueenName(name))")&&free.includes("else if(rank)"),'OWNER/QUEEN must keep priority over staff prefix');
assert.ok(html.includes('style.css?v=20260916-adminprefix1')&&html.includes('online.js?v=20260916-adminprefix1')&&html.includes('freeroam.js?v=20260916-adminprefix1'),'prefix cache bust missing');
console.log('admin_online_prefix_smoke: OK — 5 staff prefixes, distinct non-red/non-pink colors, server propagation, live refresh, mobile cache bust');
