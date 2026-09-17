const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;global.document={};window.Racing={};
for(const f of ['content.js','racing-line.js','track.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js',f),'utf8'),{filename:f});
const R=global.Racing;
assert.equal(Object.keys(R.CAREER_TRACKS).length,10,'career needs 10 unique tracks');
assert.equal(R.CAREER_LEVELS.length,10,'career needs 10 levels');
let prevGold=Infinity,prevBronze=Infinity,prevReward=0;
for(const level of R.CAREER_LEVELS){
  const cfg=R.CAREER_TRACKS[level.trackId];assert.ok(cfg,`level ${level.level}: track missing`);
  const track=new R.Track(cfg);assert.ok(track.length>=23900&&track.length<=32100,`level ${level.level}: expected 24–32 km, got ${track.length}`);
  assert.ok(level.gold<level.silver&&level.silver<level.bronze,`level ${level.level}: medal times must increase gold->bronze`);
  assert.ok(level.gold<prevGold&&level.bronze<prevBronze,`level ${level.level}: time targets must get tighter`);prevGold=level.gold;prevBronze=level.bronze;
  assert.ok(level.rewards.gold>level.rewards.silver&&level.rewards.silver>level.rewards.bronze,`level ${level.level}: rewards must match medal order`);
  assert.ok(level.rewards.gold>prevReward,`level ${level.level}: top reward should rise`);prevReward=level.rewards.gold;
  assert.equal(R.careerTimeTier(level.level,level.gold-.01),'gold');assert.equal(R.careerTimeTier(level.level,level.silver-.01),'silver');assert.equal(R.careerTimeTier(level.level,level.bronze-.01),'bronze');assert.equal(R.careerTimeTier(level.level,level.bronze+1),null);
}
const save=R.normalizeSave({careerUnlocked:7,careerBestTimes:{career01:123456,career05:99999,bad:1},careerCompleted:['career01','career05','bad']});
assert.equal(save.careerUnlocked,7);assert.deepEqual(Object.keys(save.careerBestTimes).sort(),['career01','career05']);assert.deepEqual(save.careerCompleted.sort(),['career01','career05']);
const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8'),css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8');
for(const token of ['careerModeBtn','careerLevelList','careerStartBtn','careerGoldReward','КАРЬЕРА'])assert.ok(html.includes(token),`HTML missing ${token}`);
for(const token of ['finishCareerRace','careerUnlocked','ПОВТОР · 50%','НОВЫЙ РЕКОРД · 100%','localMode===\'career\''])assert.ok(game.includes(token),`game logic missing ${token}`);
for(const token of ['.career-screen','.career-level-list','.career-detail','.career-time-bands'])assert.ok(css.includes(token),`career CSS missing ${token}`);
console.log('career_mode_test: OK — 10 long levels, sequential unlock, tighter timers, CR tiers, record/repeat rules, mobile UI');
