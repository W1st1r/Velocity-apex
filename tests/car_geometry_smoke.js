/* Per-car sprite contain/aspect-ratio + OBB/contact/loadout geometry checks. */
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
for(const f of ['public/js/content.js','public/js/car.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,f),'utf8'),{filename:f});
const R=Racing;

function webpSize(file){
  const b=fs.readFileSync(file);
  assert.equal(b.toString('ascii',0,4),'RIFF',`${path.basename(file)} missing RIFF`);
  assert.equal(b.toString('ascii',8,12),'WEBP',`${path.basename(file)} missing WEBP`);
  for(let p=12;p+8<=b.length;){
    const type=b.toString('ascii',p,p+4),size=b.readUInt32LE(p+4),d=p+8;
    if(type==='VP8X'&&size>=10){
      const width=1+b.readUIntLE(d+4,3),height=1+b.readUIntLE(d+7,3);return {width,height};
    }
    if(type==='VP8 '&&size>=10&&d+10<=b.length){
      const width=b.readUInt16LE(d+6)&0x3fff,height=b.readUInt16LE(d+8)&0x3fff;return {width,height};
    }
    if(type==='VP8L'&&size>=5&&b[d]===0x2f){
      const width=1+b[d+1]+((b[d+2]&0x3f)<<8);
      const height=1+(b[d+2]>>6)+(b[d+3]<<2)+((b[d+4]&0x0f)<<10);return {width,height};
    }
    p=d+size+(size&1);
  }
  throw new Error(`${path.basename(file)} unsupported WebP header`);
}
function close(a,b,eps=1e-9){return Math.abs(a-b)<=eps;}
function car(id,x=0,y=0,a=0){const c=new R.Car({maxSpeed:400,accel:210,brakePower:320,turnRate:2.32});c.setLoadout(id,'standard');c.x=x;c.y=y;c.angle=a;return c;}
function contact(a,b,msg){assert.ok(R.intersectCarOBBs(a,b),msg);}
function clear(a,b,msg){assert.equal(R.intersectCarOBBs(a,b),null,msg);}

// Pure contain sizing must preserve source ratio even when both visual bounds exist.
let size=R.resolveSpriteSize({visualLength:100,visualWidth:100,raceScale:1,previewScale:1,preserveAspectRatio:true},200,100,false);
assert.ok(close(size.length,100)&&close(size.width,50),'length-bound contain failed');
size=R.resolveSpriteSize({visualLength:100,visualWidth:30,raceScale:1,previewScale:1,preserveAspectRatio:true},200,100,false);
assert.ok(close(size.length,60)&&close(size.width,30),'width-bound contain failed');
size=R.resolveSpriteSize({visualLength:70,raceScale:1,preserveAspectRatio:true},350,140,false);
assert.ok(close(size.length/size.width,2.5),'single-bound preserveAspectRatio fallback failed');

for(const id of R.REAL_CAR_IDS){
  const g=R.CAR_GEOMETRY[id],meta=R.LIVERIES[id],sprite=meta?.sprite,collision=meta?.collision;
  assert.ok(g,`${id} missing CAR_GEOMETRY`);assert.ok(sprite,`${id} missing sprite`);assert.equal(sprite.preserveAspectRatio,true,`${id} must preserve source aspect ratio`);
  for(const key of ['visualLength','visualWidth','raceScale','previewScale'])assert.ok(Number.isFinite(g[key])&&g[key]>0,`${id} invalid ${key}`);
  for(const key of ['raceOffsetX','raceOffsetY','previewOffsetX','previewOffsetY','collisionOffsetX','collisionOffsetY'])assert.ok(Number.isFinite(g[key]),`${id} invalid ${key}`);
  for(const key of ['collisionLength','collisionWidth'])assert.ok(Number.isFinite(g[key])&&g[key]>0,`${id} invalid ${key}`);
  assert.ok(collision&&collision.length===g.collisionLength&&collision.width===g.collisionWidth,`${id} collision metadata mismatch`);

  const fullPath=path.join(ROOT,'public',sprite.src),thumbPath=path.join(ROOT,'public',sprite.thumbnail);
  const full=webpSize(fullPath),thumb=webpSize(thumbPath),fullRatio=full.width/full.height,thumbRatio=thumb.width/thumb.height;
  assert.ok(Math.abs(fullRatio-thumbRatio)<.012,`${id} full/thumbnail source ratios diverge`);

  const race=R.resolveSpriteSize(sprite,full.width,full.height,false);
  const preview=R.resolveSpriteSize(sprite,full.width,full.height,true);
  const thumbnail=R.resolveSpriteSize(sprite,thumb.width,thumb.height,true);
  for(const [mode,r] of [['race',race],['preview',preview],['thumbnail',thumbnail]]){
    assert.ok(Number.isFinite(r.length)&&r.length>0&&Number.isFinite(r.width)&&r.width>0,`${id} ${mode} size invalid`);
    assert.ok(r.length<=r.maxLength+1e-9&&r.width<=r.maxWidth+1e-9,`${id} ${mode} escapes contain bounds`);
  }
  assert.ok(Math.abs(race.length/race.width-fullRatio)<1e-10,`${id} race aspect ratio distorted`);
  assert.ok(Math.abs(preview.length/preview.width-fullRatio)<1e-10,`${id} preview aspect ratio distorted`);
  assert.ok(Math.abs(thumbnail.length/thumbnail.width-thumbRatio)<1e-10,`${id} thumbnail aspect ratio distorted`);
  assert.ok(Math.abs(thumbnail.length/preview.length-1)<.015&&Math.abs(thumbnail.width/preview.width-1)<.015,`${id} thumbnail/full preview scale mismatch`);
  // Catalog/garage previews fit one shared visual envelope while preserving each WebP ratio.
  // Narrow/long bodies can stay longer and compact/wide hypercars can stay wider, but neither
  // dimension may become an outlier. Gameplay sizing is checked separately below.
  assert.ok(preview.length>=74&&preview.length<=81,`${id} preview length escaped normalized range: ${preview.length.toFixed(1)}`);
  assert.ok(preview.width>=34&&preview.width<=49,`${id} preview width escaped normalized range: ${preview.width.toFixed(1)}`);
  assert.ok(thumbnail.length>=74&&thumbnail.length<=81,`${id} thumbnail length escaped normalized range: ${thumbnail.length.toFixed(1)}`);
  assert.ok(thumbnail.width>=34&&thumbnail.width<=49,`${id} thumbnail width escaped normalized range: ${thumbnail.width.toFixed(1)}`);
  assert.ok(g.previewScale>=.9&&g.previewScale<=1.45,`${id} previewScale outside reasonable calibration range: ${g.previewScale}`);
  assert.ok(race.length>=60&&race.length<=105&&race.width>=30&&race.width<=58,`${id} implausible tuned race size ${race.length.toFixed(1)}x${race.width.toFixed(1)}`);
  assert.ok(collision.length>=race.length*.78&&collision.length<=race.length*1.12,`${id} collision length no longer follows visual body`);
  assert.ok(collision.width>=race.width*.70&&collision.width<=race.width*1.05,`${id} collision width no longer follows visual body`);

  const c=car(id);assert.equal(c.maxSpeed,400,`${id} loadout changed maxSpeed`);assert.equal(c.accel,210,`${id} loadout changed accel`);assert.equal(c.brakePower,320,`${id} loadout changed brake`);assert.equal(c.turnRate,2.32,`${id} loadout changed turnRate`);
}


// Guard this preview-only calibration from accidentally modifying gameplay geometry.
const gameplayGeometry=R.REAL_CAR_IDS.map(id=>{const g=R.CAR_GEOMETRY[id];return [id,g.raceScale,g.raceOffsetX,g.raceOffsetY,g.collisionLength,g.collisionWidth,g.collisionOffsetX,g.collisionOffsetY];});
assert.equal(crypto.createHash('sha256').update(JSON.stringify(gameplayGeometry)).digest('hex'),'93d44953b0b9bd4b43a513bfefed193ae093c5c423e333ccce7b9f75f8829622','raceScale/collision geometry changed during preview calibration');

const chiron=car('bugatti-chiron-super-sport'),mary=car('aston-martin-valkyrie-mary');
let sideGap=(chiron.collisionWidth+mary.collisionWidth)*.5;mary.y=sideGap-.5;contact(chiron,mary,'side-by-side near touch should collide');mary.y=sideGap+.5;clear(chiron,mary,'side-by-side separated cars should not collide');
mary.x=(chiron.collisionLength+mary.collisionLength)*.5-.5;mary.y=0;contact(chiron,mary,'nose-to-tail near touch should collide');mary.x=(chiron.collisionLength+mary.collisionLength)*.5+.5;clear(chiron,mary,'nose-to-tail separated cars should not collide');
mary.x=45;mary.y=22;mary.angle=Math.PI/5;contact(chiron,mary,'angled body contact should collide');
// 13 offline bots + player grid geometry: adjacent rows are 140 apart and paired lanes are 68 apart.
const grid=[];for(let i=0;i<14;i++){const c=new R.Car();c.setLoadout('apexLime','standard');c.x=-65-Math.floor(i/2)*140;c.y=i%2===0?-34:34;c.angle=0;grid.push(c);}for(let i=0;i<grid.length;i++)for(let j=i+1;j<grid.length;j++)clear(grid[i],grid[j],`start grid overlap ${i}/${j}`);
console.log('car_geometry_smoke: OK (41 WebP ratios + contain bounds + preview parity + collisions + invariants + 13-bot grid)');
