const assert=require('assert').strict,fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(ROOT,'src/admin-system.mjs'),'utf8');
const client=fs.readFileSync(path.join(ROOT,'public/js/admin-system.js'),'utf8');
for(const name of ['Helper','Moder','St.Moder','Admin','Curator']) assert.ok(server.includes(`label:'${name}'`),`server rank missing ${name}`);
for(const name of ['HELPER','MODER','ST.MODER','ADMIN','CURATOR']) assert.ok(client.includes(`'${name}'`),`client rank missing ${name}`);
for(const old of ['JUNIOR MODERATOR','SENIOR ADMINISTRATOR','CHIEF ADMINISTRATOR']) assert.ok(!client.includes(old),`old client rank remains: ${old}`);
assert.ok(client.includes('LVL ${l} · ${rankName(l)}'),'owner rank selector must show level + rank name');
console.log('admin_rank_names_smoke: OK (Helper / Moder / St.Moder / Admin / Curator)');
