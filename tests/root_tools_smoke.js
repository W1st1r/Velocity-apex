/* Velocity Apex ROOT tools validation. Run: node tests/root_tools_smoke.js */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
for(const file of ['public/js/content.js','public/js/root-console.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file});
const R=global.Racing,T=R.RootTools,assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

let save=R.normalizeSave({credits:200});
assert(T.grant(save,'car','crimsonVelocity'),'grant car failed');
assert(save.ownedLiveries.includes('crimsonVelocity'),'granted car missing');
const before=save.ownedLiveries.length;assert(T.grant(save,'car','crimsonVelocity'),'duplicate grant rejected');
assert(save.ownedLiveries.length===before,'duplicate grant created duplicate');
assert(T.equip(save,'car','crimsonVelocity')&&save.selectedLivery==='crimsonVelocity','equip car failed');
assert(T.revoke(save,'car','crimsonVelocity'),'revoke car failed');
assert(save.selectedLivery==='apexLime'&&!save.ownedLiveries.includes('crimsonVelocity'),'selected-car fallback failed');
assert(!T.revoke(save,'car','apexLime')&&save.ownedLiveries.includes('apexLime'),'system car was revocable');
T.grantAll(save,'car');assert(save.ownedLiveries.length===Object.keys(R.LIVERIES).length,'grant all cars failed');

assert(T.grant(save,'effect','redFlame'),'grant effect failed');
assert(T.equip(save,'effect','redFlame')&&save.selectedEffect==='redFlame','equip effect failed');
assert(T.revoke(save,'effect','redFlame')&&save.selectedEffect==='standard','selected-effect fallback failed');
T.grantAll(save,'effect');assert(save.ownedEffects.length===Object.keys(R.EFFECTS).length,'grant all effects failed');
assert(!T.revoke(save,'effect','standard')&&save.ownedEffects.includes('standard'),'system effect was revocable');

assert(T.setCredits(save,42500)&&save.credits===42500,'set credits failed');
for(const bad of ['', '  ', '-1','1.5','NaN','Infinity','1e3',NaN,Infinity,-1,1.2,Number.MAX_SAFE_INTEGER+1]){
  const old=save.credits;assert(!T.setCredits(save,bad),`invalid credits accepted: ${bad}`);assert(save.credits===old,`invalid credits changed balance: ${bad}`);
}
assert(T.setCredits(save,Number.MAX_SAFE_INTEGER)&&save.credits===Number.MAX_SAFE_INTEGER,'MAX_SAFE_INTEGER rejected');
T.resetInventory(save);assert(JSON.stringify(save.ownedLiveries)===JSON.stringify(['apexLime']),'reset inventory cars failed');
assert(JSON.stringify(save.ownedEffects)===JSON.stringify(['standard']),'reset inventory effects failed');
assert(save.selectedLivery==='apexLime'&&save.selectedEffect==='standard','reset inventory selections failed');
const credits=save.credits;assert(credits===Number.MAX_SAFE_INTEGER,'reset inventory changed credits');
assert(!T.grant(save,'car','does-not-exist')&&!T.revoke(save,'effect','does-not-exist'),'unknown id accepted');
assert(T.setCase(save,'basic',7)&&save.caseInventory.basic===7,'set case failed');
assert(T.changeCase(save,'basic',3)&&save.caseInventory.basic===10,'change case failed');
assert(T.changeCase(save,'basic',-20)&&save.caseInventory.basic===0,'case count must clamp at zero');

save.bestScore=999;T.resetPlayerProgress(save);const fresh=R.normalizeSave({});
assert(JSON.stringify(save)===JSON.stringify(fresh),'reset player progress did not restore normalized defaults');

const html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8'),css=fs.readFileSync(path.join(ROOT,'public/css/style.css'),'utf8'),game=fs.readFileSync(path.join(ROOT,'public/js/game.js'),'utf8');
for(const token of ['id="rootOpenBtn"','id="rootAuth"','id="rootPassword"','inputmode="numeric"','id="rootConsole"','id="rootCars"','id="rootEffects"','id="rootDiagnostics"','js/root-console.js'])assert(html.includes(token),`missing ROOT UI token ${token}`);
assert(css.includes('#app *:not(input)')&&css.includes('-webkit-touch-callout:none')&&css.includes('#app input,')&&css.includes('#app textarea,'),'central iOS interaction hardening missing');
for(const type of ['selectstart','dragstart','contextmenu','dblclick','copy'])assert(game.includes(`'${type}'`),`app gesture guard missing ${type}`);
assert(game.includes('performance.now()-lastHandled<700'),'bindTap synthetic-click guard missing');

console.log(JSON.stringify({ok:true,cars:Object.keys(R.LIVERIES).length,effects:Object.keys(R.EFFECTS).length,maxCreditsTested:Number.MAX_SAFE_INTEGER},null,2));
