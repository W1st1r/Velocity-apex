/* Per-car OBB/contact/loadout geometry checks. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
for(const f of ['public/js/content.js','public/js/car.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,f),'utf8'),{filename:f});
const R=Racing;
function car(id,x=0,y=0,a=0){const c=new R.Car({maxSpeed:400,accel:210,brakePower:320,turnRate:2.32});c.setLoadout(id,'standard');c.x=x;c.y=y;c.angle=a;return c;}
function contact(a,b,msg){assert.ok(R.intersectCarOBBs(a,b),msg);}
function clear(a,b,msg){assert.equal(R.intersectCarOBBs(a,b),null,msg);}
for(const id of R.REAL_CAR_IDS){const c=car(id);assert.equal(c.maxSpeed,400,`${id} loadout changed maxSpeed`);assert.equal(c.accel,210,`${id} loadout changed accel`);assert.equal(c.brakePower,320,`${id} loadout changed brake`);assert.equal(c.turnRate,2.32,`${id} loadout changed turnRate`);}
const chiron=car('bugatti-chiron-super-sport'),mary=car('aston-martin-valkyrie-mary');
let sideGap=(chiron.collisionWidth+mary.collisionWidth)*.5;mary.y=sideGap-.5;contact(chiron,mary,'side-by-side near touch should collide');mary.y=sideGap+.5;clear(chiron,mary,'side-by-side separated cars should not collide');
mary.x=(chiron.collisionLength+mary.collisionLength)*.5-.5;mary.y=0;contact(chiron,mary,'nose-to-tail near touch should collide');mary.x=(chiron.collisionLength+mary.collisionLength)*.5+.5;clear(chiron,mary,'nose-to-tail separated cars should not collide');
mary.x=45;mary.y=22;mary.angle=Math.PI/5;contact(chiron,mary,'angled body contact should collide');
// 13 offline bots + player grid geometry: adjacent rows are 140 apart and paired lanes are 68 apart.
const grid=[];for(let i=0;i<14;i++){const c=new R.Car();c.setLoadout('apexLime','standard');c.x=-65-Math.floor(i/2)*140;c.y=i%2===0?-34:34;c.angle=0;grid.push(c);}for(let i=0;i<grid.length;i++)for(let j=i+1;j<grid.length;j++)clear(grid[i],grid[j],`start grid overlap ${i}/${j}`);
console.log('car_geometry_smoke: OK (side + rear + angle + invariants + 13-bot grid)');
