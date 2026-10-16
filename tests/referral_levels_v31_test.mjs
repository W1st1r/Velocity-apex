import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REFERRAL_LEVELS} from '../src/auth.mjs';

const auth=readFileSync(new URL('../src/auth.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/js/referrals.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/css/referrals.css',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0014_referral_levels.sql',import.meta.url),'utf8');

assert.equal(REFERRAL_LEVELS.length,10,'exactly 10 referral levels required');
assert.deepEqual(REFERRAL_LEVELS.map(x=>x.level),[1,2,3,4,5,6,7,8,9,10]);
assert.equal(REFERRAL_LEVELS[0].requiredInvites,0);
assert.equal(REFERRAL_LEVELS[1].requiredInvites,10,'LVL2 should require 10 verified referrals');
assert.equal(REFERRAL_LEVELS[1].cost,10000,'LVL2 should cost 10,000 CR');
assert.equal(REFERRAL_LEVELS.at(-1).requiredInvites,325,'LVL10 must be long-term');
assert.equal(REFERRAL_LEVELS.at(-1).cost,600000,'LVL10 direct upgrade cost');
const totalCost=REFERRAL_LEVELS.reduce((s,x)=>s+x.cost,0);
assert.equal(totalCost,1725000,'full progression investment changed unexpectedly');
assert.ok(REFERRAL_LEVELS.at(-1).requiredInvites/20>16,'monthly anti-fraud limit should force >16 months from zero to LVL10');
for(let i=1;i<REFERRAL_LEVELS.length;i++){
  assert.ok(REFERRAL_LEVELS[i].requiredInvites>REFERRAL_LEVELS[i-1].requiredInvites,'invite thresholds must increase');
  assert.ok(REFERRAL_LEVELS[i].cost>REFERRAL_LEVELS[i-1].cost,'upgrade costs must increase');
  assert.ok(REFERRAL_LEVELS[i].inviterReward>REFERRAL_LEVELS[i-1].inviterReward,'owner reward must increase');
}
for(const id of ['referral_profiles','referral_level_purchases','referral_reward_details'])assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${id}`),`missing migration ${id}`);
for(const route of ['/api/referrals/profile','/api/referrals/upgrade'])assert.ok(auth.includes(route),`missing API ${route}`);
for(const token of ['REFERRAL_INVITES_REQUIRED','REFERRAL_CREDITS_REQUIRED','status=\'rewarded\'','referral_level_upgrade','referral_welcome_reward'])assert.ok(auth.includes(token),`missing server rule ${token}`);
assert.ok(auth.includes("WHERE user_id=? AND level=?"),'level upgrade must use compare-and-swap protection');
assert.ok(auth.includes("if(stats.rewarded<next.requiredInvites)"),'verified invite gate missing');
assert.ok(auth.includes("if(saves[userId].credits<next.cost)"),'credit gate missing');
assert.ok(auth.includes('applyReferralInviteeReward'),'invitee bonus mutation missing');
for(const id of ['referralBtn','referrals','referralLevel','referralVerified','referralUpgradeBtn','referralTiers'])assert.ok(html.includes(`id="${id}"`),`missing referral UI ${id}`);
assert.ok(client.includes("fetch(path")&&client.includes('/api/referrals/profile')&&client.includes('/api/referrals/upgrade'),'referral client API wiring missing');
assert.ok(client.includes('10 УРОВНЕЙ')||html.includes('10 УРОВНЕЙ'),'10 level UI copy missing');
assert.ok(css.includes('.referral-screen')&&css.includes('.ref-tier.active'),'referral visual design missing');
console.log('referral_levels_v31_test: OK — 10 levels, dual gates, tiered rewards, long-term pacing');
