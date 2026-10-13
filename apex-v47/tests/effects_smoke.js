const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/content.js'),'utf8'),{filename:'js/content.js'});
const R=window.Racing;R.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js/car.js'),'utf8'),{filename:'js/car.js'});
for(const id of ['blueFlame','cyanFlame','greenFlame','redFlame','purpleFlame','orangeFlame','rainbowFlame'])assert.equal(R.EFFECTS[id]?.twin,true,`${id} must be twin flame`);
assert.equal(R.EFFECTS.rainbowFlame.rainbow,true,'rainbow flag missing');
function fakeCtx(){const translations=[],styles=[];return{translations,styles,save(){},restore(){},translate(x,y){translations.push([x,y]);},beginPath(){},ellipse(){},fill(){},moveTo(){},bezierCurveTo(){},closePath(){},set globalCompositeOperation(v){this._gco=v},set globalAlpha(v){this._ga=v},set fillStyle(v){styles.push(v);this._fill=v}};}
for(const id of ['blueFlame','rainbowFlame']){
  const car=new R.Car();car.effect=id;car.speed=280;car.throttleVisual=1;car.brakeVisual=0;car.effectTime=1.234;
  const ctx=fakeCtx();car.drawExhaust(ctx,72);const nozzleTranslations=ctx.translations.filter(([x,y])=>x===0&&Math.abs(y)>1);
  assert.equal(nozzleTranslations.length,2,`${id} must render exactly two exhaust origins`);assert.ok(nozzleTranslations[0][1]<0&&nozzleTranslations[1][1]>0,`${id} exhausts must be left/right`);
  if(id==='rainbowFlame')assert.ok(ctx.styles.some(v=>typeof v==='string'&&v.startsWith('hsl')),`rainbow colors must animate with HSL`);
}
console.log('effects_smoke: OK (7 twin flames + animated rainbow + two exhaust origins)');
