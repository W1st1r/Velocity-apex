import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {RANKS} from '../src/admin-system.mjs';

assert.deepEqual(Object.keys(RANKS).map(Number),[1,2,3,4,5,6,7,8]);
assert.equal(RANKS[5].name,'ST.ADMIN');
assert.equal(RANKS[6].name,'CURATOR');
assert.equal(RANKS[7].name,'GL.ADMIN');
assert.equal(RANKS[8].name,'ROOT');
assert.equal(RANKS[5].manageBelow,4);
assert.equal(RANKS[6].manageBelow,5);
assert.equal(RANKS[7].manageBelow,6);
assert.equal(RANKS[8].manageBelow,7);

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort()) db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const t=Date.UTC(2026,8,18),owner='11111111-1111-4111-8111-111111111111',root='22222222-2222-4222-8222-222222222222';
for(const [id,name] of [[owner,'w1st1r'],[root,'rooter']]) db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'x','x',t,t);
db.prepare('INSERT INTO staff_admins(user_id,level,active,appointed_at,updated_at,appointed_by) VALUES(?,8,1,?,?,?)').run(root,t,t,owner);
assert.equal(db.prepare('SELECT level FROM staff_admins WHERE user_id=?').get(root).level,8,'ROOT level must persist');
assert.throws(()=>db.prepare('UPDATE staff_admins SET level=9 WHERE user_id=?').run(root),'level 9 must be rejected');
const cols=db.prepare('PRAGMA table_info(staff_admins)').all().map(x=>x.name);
for(const c of ['suspended_until','suspension_reason','suspended_by'])assert.ok(cols.includes(c),`missing suspension column ${c}`);
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_admin_notes'").get(),'staff notes table missing');

const server=fs.readFileSync(new URL('../src/admin-system.mjs',import.meta.url),'utf8');
for(const route of ['/api/staff-admin/management/summary','/api/staff-admin/management/assign','/api/staff-admin/control/servers','/api/staff-admin/control/kick','/api/staff-admin/control/announce','/api/staff-admin/control/clear-events','/api/staff-admin/control/events-disabled','/api/staff-admin/control/diagnostics']) assert.ok(server.includes(route),`missing ${route}`);
for(const token of ['HIERARCHY_DENIED','STAFF_SUSPENDED','canManageLevel','reviewManagedReport','queryGameLogs']) assert.ok(server.includes(token),`missing security token ${token}`);

const worker=fs.readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
for(const token of ["'/free/admin-status'","'/free/admin-control'",'admin_announcement','admin_kick','admin_events_state','eventsDisabled']) assert.ok(worker.includes(token),`free-roam admin control missing ${token}`);
const ui=fs.readFileSync(new URL('../public/js/admin-system.js',import.meta.url),'utf8');
for(const token of ['СОСТАВ · КОНТРОЛЬ','CONTROL CENTER','ROOT DIAGNOSTICS','data-mgr-suspend','data-owner-suspend']) assert.ok(ui.includes(token),`staff UI missing ${token}`);
const mobile=fs.readFileSync(new URL('../public/css/mobile-ui.css',import.meta.url),'utf8');
assert.ok(mobile.includes('V32 · Administration 8-level phone polish'));
assert.ok(mobile.includes('font-size:16px!important'),'iOS input anti-zoom polish missing');

const authSource=fs.readFileSync(new URL('../src/auth.mjs',import.meta.url),'utf8');
assert.ok(authSource.includes("const ADMIN_USERNAME='w1st1r'")&&authSource.includes('if(!session.user.isAdmin)'),"OWNER must remain separately protected");
console.log('admin_hierarchy_v32_test: OK — 8 ranks, hierarchy, suspension, control center, ROOT controls, phone UI');
