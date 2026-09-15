const assert=require('assert').strict,fs=require('fs'),path=require('path');const R=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(R,'public/index.html'),'utf8'),free=fs.readFileSync(path.join(R,'public/js/freeroam.js'),'utf8'),friends=fs.readFileSync(path.join(R,'public/js/friends.js'),'utf8'),worker=fs.readFileSync(path.join(R,'src/worker.mjs'),'utf8'),auth=fs.readFileSync(path.join(R,'src/auth.mjs'),'utf8');
for(const id of ['friendsBtn','friends','freeServers','freeRoam','freeCanvas','freeChatPanel','freeMapPanel','freeContextAction'])assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
for(const token of ['/api/free/servers','activity_join','activity_finish','free_chat','free_state','FREE_MAX_PLAYERS=20'])assert.ok(worker.includes(token),`worker missing ${token}`);
for(const token of ['/api/friends/add','/api/friends/remove','user_presence','friendships'])assert.ok(auth.includes(token),`auth missing ${token}`);
for(const token of ['AIRPORT DRAG','SPEED TRAP','PORT DRIFT','CAR MEET','MOUNTAIN PASS'])assert.ok(free.includes(token),`free map missing ${token}`);
assert.ok(friends.includes('/api/friends'));assert.ok(html.includes('js/freeroam.js')&&html.includes('js/friends.js'));
console.log('freeroam_social_smoke: OK');
