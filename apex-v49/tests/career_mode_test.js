const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;global.document={};window.Racing={};
for(const f of ['content.js','racing-line.js','track.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js',f),'utf8'),{filename:f});
const R=global.Racing;
assert.equal(Object.keys(R.CAREER_TRACKS).length,50,'career needs 50 unique tracks');
assert.equal(R.CAREER_LEVELS.length,50,'career needs 50 levels');
let prevReward=0;
for(const level of R.CAREER_LEVELS){
  const cfg=R.CAREER_TRACKS[level.trackId];assert.ok(cfg,`level ${level.level}: track missing`);
  const track=new R.Track(cfg);assert.ok(track.length>=23900&&track.length<=32100,`level ${level.level}: expected 23.9–32.1 km, got ${track.length}`);
  assert.ok(level.gold<level.silver&&level.silver<level.bronze,`level ${level.level}: medal times must increase gold->bronze`);
  assert.ok(level.rewards.gold>level.rewards.silver&&level.rewards.silver>level.rewards.bronze,`level ${level.level}: rewards must match medal order`);
  assert.ok(level.rewards.gold>prevReward,`level ${level.level}: top reward should rise`);prevReward=level.rewards.gold;
  assert.equal(R.careerTimeTier(level.level,level.gold-.01),'gold');assert.equal(R.careerTimeTier(level.level,level.silver-.01),'silver');assert.equal(R.careerTimeTier(level.level,level.bronze-.01),'bronze');assert.equal(R.careerTimeTier(level.level,level.bronze+1),null);
}
const totals=R.CAREER_LEVELS.reduce((a,l)=>{for(const k of ['gold','silver','bronze'])a[k]+=l.rewards[k];return a;},{gold:0,silver:0,bronze:0});
assert.deepEqual(totals,{gold:220000,silver:210000,bronze:200000},'full first-clear career payout should stay in the requested 200–220k range');
const oldBronze=[138,134,130,126,122,118,114,110,106,102,100,99,98,97,96,95,94,93,92,91,90,89,88,87,86,85,84,83,82,81];
const timerTightening=oldBronze.reduce((sum,v,i)=>sum+v/R.CAREER_LEVELS[i].bronze,0)/oldBronze.length;
assert.ok(timerTightening>=1.5&&timerTightening<=2,`average timer tightening should be 1.5–2x, got ${timerTightening.toFixed(2)}x`);
const save=R.normalizeSave({careerUnlocked:7,careerBestTimes:{career01:123456,career05:99999,bad:1},careerCompleted:['career01','career05','bad']});
assert.equal(save.careerUnlocked,7);assert.deepEqual(Object.keys(save.careerBestTimes).sort(),['career01','career05']);assert.deepEqual(save.careerCompleted.sort(),['career01','career05']);
const migrated=R.normalizeSave({careerUnlocked:30,careerCompleted:['career30']});assert.equal(migrated.careerUnlocked,31,'V37 final clear should unlock the new chapter IV');
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8'),css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
for(const token of ['careerModeBtn','careerLevelList','careerStartBtn','careerGoldReward','КАРЬЕРА · 5 ГЛАВ','50 УРОВНЕЙ'])assert.ok(html.includes(token),`HTML missing ${token}`);
for(const token of ['finishCareerRace','careerUnlocked','ПОВТОР · 50%','НОВЫЙ РЕКОРД · 100%','localMode===\'career\''])assert.ok(game.includes(token),`game logic missing ${token}`);
for(const token of ['.career-screen','.career-level-list','.career-detail','.career-time-bands'])assert.ok(css.includes(token),`career CSS missing ${token}`);
assert.equal(R.CAREER_LEVELS.at(-1).level,50);assert.ok(R.CAREER_TRACKS.career50.detailLevel===4,'final career track must request very high detail');
console.log('career_mode_test: OK — 50 levels / 5 chapters, tougher timers, 200–220k full-clear economy, sequential unlock and migration');
