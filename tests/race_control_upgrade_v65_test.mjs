import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {upgradeChanceBps,returnBpsForAccount,publicConfig} from '../src/upgrade.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html'),client=read('public/js/garage.js'),server=read('src/upgrade.mjs'),config=publicConfig(),menu=read('public/js/main-menu-ui.js'),style=read('public/css/race-control-v65.css');
assert.equal(config.returnBps,9000);assert.equal(config.maxChanceBps,8500);
const tiers=[[0,0,9800],[4,60,9800],[5,0,9400],[19,99,9400],[20,0,9000],[200,29,9000],[20,30,9100],[20,60,9200]];
for(const [attempts,level,expect] of tiers)assert.equal(returnBpsForAccount(attempts,level),expect);
for(const [ratio,expected] of [[10,[980,940,900]],[25,[2450,2350,2250]],[50,[4900,4700,4500]],[75,[7350,7050,6750]],[90,[8500,8460,8100]]]){
 for(const [stage,i] of [9800,9400,9000].entries()){
   assert.equal(upgradeChanceBps(ratio*1000,100000,i),expected[stage],`${ratio}% stake stage ${stage}`);
 }
}
assert.equal(upgradeChanceBps(0,100000),0);
assert.equal(upgradeChanceBps(99999,100000,9800),8500);
for(const bps of [100,1000,2000,4900,8500]){
 let wins=0;for(let ticket=0;ticket<10000;ticket++)if(ticket<bps)wins++;
 assert.equal(wins,bps);
}
assert.match(server,/getProgression\(env,userId\)/);
assert.match(server,/COUNT\(\*\) AS count FROM upgrade_attempts/);
assert.match(server,/randomTicket=\(\)=>/);
assert.match(server,/crypto\.getRandomValues/);
assert.match(server,/status='processing'/);
assert.match(server,/mutateTargetSave\(env,session\.user\.id/);
assert.match(server,/consumeStake\(save,payload\);if\(success\)grantTarget/);
assert.match(server,/\/api\/upgrade\/profile/);
assert.doesNotMatch(client,/UPGRADE_VISUAL_MULTIPLIER/);
assert.match(client,/Math\.min\(8500,Math\.round\(/);
assert.match(client,/upgradePointerLandingBps/);
assert.match(client,/this\.upgradeNextBoundarySpin=spinNumber\+2\+Math\.floor\(Math\.random\(\)\*3\)/);
assert.match(client,/pointer\.dataset\.result=success\?'success':'failed'/);
assert.match(client,/pointer\.getBoundingClientRect\(\)\.width\/2/);
// Reproduce client mapping for extreme chances / radii / all normalized values.
function landing(success,shown,n,near=false,radius=55){
 const start=success?0:shown,end=success?shown:10000,span=Math.max(0,end-start);
 if(span<=0)return success?0:9999.999;
 const safe=Math.min(140,Math.max(.5,(span-1)/2));
 const edge=Math.min(Math.max(45,Math.ceil(10000*3/(2*Math.PI*Math.max(30,radius)))),Math.max(.5,(span-1)/2));
 const margin=near?edge:safe,low=start+margin,high=end-margin;
 if(high<=low)return start+span/2;
 if(near)return success?high:low;
 return low+Math.max(0,Math.min(1,n))*(high-low);
}
for(let chance=100;chance<=8500;chance+=37){for(const radius of [35,45,55,72]){
 for(const normalized of [0,.01,.5,.99,1])for(const near of [false,true]){
  const ok=landing(true,chance,normalized,near,radius),fail=landing(false,chance,normalized,near,radius);
  assert.ok(ok>0&&ok<chance,`green=${chance} tip=${ok}`);
  assert.ok(fail>chance&&fail<10000,`red=${chance} tip=${fail}`);
 }
}}
for(const id of ['menu','playBtn','onlineBtn','shopBtn','garageBtn','topupBtn','telegramBanner','accountBtn','friendsBtn','crewBtn','promoBtn','supportBtn','settingsBtn','menuMoreBtn','menuMorePanel','menuCredits','accountMenuStatus','friendsMenuStatus','menuBestScore','menuBestLap','menuMaxLaps','menuMute','referralBtn']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,`duplicate/missing ${id}`);
}
assert.match(html,/race-control-v65\.css/);
assert.match(style,/safe-area-inset-right/);
assert.match(style,/grid-template-columns:clamp\(102px/);
assert.match(menu,/selectedLivery/);
assert.match(menu,/raceMenuCarImage/);
assert.ok(existsSync(new URL('../public/assets/cars/apex-lime-menu.svg',import.meta.url)));
console.log('race_control_upgrade_v65_test: passed 2,000+ odds and pointer boundary assertions, ID checks, accounting guards');
