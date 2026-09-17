import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {dayKey,dayBounds,workSnapshot,recordStaffRuntimeHeartbeat} from '../src/admin-system.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const DB={
  prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};},
  async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}
};
const env={DB};
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const player1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const player2='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const owner='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const created=Date.UTC(2026,8,1);
for(const [id,name] of [[admin,'helper'],[player1,'p1'],[player2,'p2'],[owner,'w1st1r']])db.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'x','x',created,created);
db.prepare('INSERT INTO staff_admins(user_id,level,active,appointed_at,updated_at,appointed_by) VALUES(?,1,1,?,?,?)').run(admin,created,created,owner);

// APEX admin day is 00:00-00:00 UTC+3.
const midnightMsk=Date.UTC(2026,8,16,21,0,0,0); // 17 Sep 00:00 UTC+3
assert.equal(dayKey(midnightMsk-1),'2026-09-16');
assert.equal(dayKey(midnightMsk),'2026-09-17');
assert.deepEqual(dayBounds('2026-09-17'),{start:midnightMsk,end:midnightMsk+86400000});

// Online should accrue from global runtime heartbeats, not only while admin UI is open.
let beat=await recordStaffRuntimeHeartbeat(env,admin,midnightMsk+10_000);
assert.equal(beat.addedMs,0);
beat=await recordStaffRuntimeHeartbeat(env,admin,midnightMsk+25_000);
assert.equal(beat.addedMs,15_000);
beat=await recordStaffRuntimeHeartbeat(env,admin,midnightMsk+40_000);
assert.equal(beat.addedMs,15_000);

// Authoritative handled tickets: one answered question and one handled/rejected complaint today.
const insTicket=(id,type,status,closedAt)=>db.prepare(`INSERT INTO support_tickets(id,type,reporter_user_id,target_user_id,target_admin_user_id,category,description,evidence_json,status,assigned_admin_id,created_at,updated_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,type,player1,type==='player'?player2:null,null,'Test','Test ticket','[]',status,admin,closedAt-1000,closedAt,closedAt);
insTicket('11111111-1111-4111-8111-111111111111','question','resolved',midnightMsk+3600000);
insTicket('22222222-2222-4222-8222-222222222222','player','rejected',midnightMsk+7200000);
insTicket('33333333-3333-4333-8333-333333333333','question','resolved',midnightMsk-1000); // yesterday

// Daily invitations should count rewarded registrations in the same day without extra 30-min activity filter.
db.prepare('INSERT INTO referrals(invited_user_id,inviter_user_id,status,reward_credits,reason,created_at,rewarded_at) VALUES(?,?,?,?,?,?,?)').run(player1,admin,'rewarded',1000,'',midnightMsk+5000,midnightMsk+5000);
db.prepare('INSERT OR REPLACE INTO referrals(invited_user_id,inviter_user_id,status,reward_credits,reason,created_at,rewarded_at) VALUES(?,?,?,?,?,?,?)').run(player2,admin,'rejected',0,'TEST',midnightMsk+6000,null);

// Poison old counter columns to ensure questions/reports are reconstructed from ticket history.
db.prepare(`UPDATE staff_daily_work SET questions_closed=99,reports_closed=99 WHERE user_id=? AND day='2026-09-17'`).run(admin);
const snap=await workSnapshot(env,admin,1,'2026-09-17');
assert.equal(snap.activeMs,30_000);
assert.equal(snap.questions,1);
assert.equal(snap.reports,1);
assert.equal(snap.referrals,1);
assert.equal(snap.timezone,'UTC+03:00');
assert.equal(snap.dayStart,midnightMsk);

// At the next 00:00 all daily values start fresh.
const next=midnightMsk+86400000;
await recordStaffRuntimeHeartbeat(env,admin,next+5000);
const nextSnap=await workSnapshot(env,admin,1,'2026-09-18');
assert.equal(nextSnap.activeMs,0);
assert.equal(nextSnap.questions,0);
assert.equal(nextSnap.reports,0);
assert.equal(nextSnap.referrals,0);

const ownerSource=fs.readFileSync(new URL('../src/owner.mjs',import.meta.url),'utf8');
assert.match(ownerSource,/await recordStaffRuntimeHeartbeat\(env,id,t\)/);
const uiSource=fs.readFileSync(new URL('../public/js/admin-system.js',import.meta.url),'utf8');
assert.match(uiSource,/ОНЛАЙН ЗА ДЕНЬ/);
assert.match(uiSource,/ПРИГЛАШЕНО ЗА ДЕНЬ/);
assert.match(uiSource,/30000/);
console.log('admin_daily_stats_test: OK — UTC+3 day boundary, global online runtime, daily invites, handled tickets, midnight reset');
