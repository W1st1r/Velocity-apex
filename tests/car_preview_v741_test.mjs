import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: { Racing: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/js/content.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/js/car.js'), 'utf8'), context);
const R = context.window.Racing;
assert.equal(R.REAL_CAR_IDS.length, 42, 'catalog should contain all 42 registered production cars');

function webpSize(file) {
  const b=fs.readFileSync(file);
  assert.equal(b.toString('ascii',0,4),'RIFF',file+' missing RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP',file+' missing WEBP');
  for(let p=12;p+8<=b.length;){
    const type=b.toString('ascii',p,p+4),size=b.readUInt32LE(p+4),d=p+8;
    if(type==='VP8X'&&size>=10)return {width:1+b.readUIntLE(d+4,3),height:1+b.readUIntLE(d+7,3)};
    if(type==='VP8 '&&size>=10&&d+10<=b.length)return {width:b.readUInt16LE(d+6)&0x3fff,height:b.readUInt16LE(d+8)&0x3fff};
    if(type==='VP8L'&&size>=5&&b[d]===0x2f)return {width:1+b[d+1]+((b[d+2]&0x3f)<<8),height:1+(b[d+2]>>6)+(b[d+3]<<2)+((b[d+4]&0x0f)<<10)};
    p=d+size+(size&1);
  }
  throw new Error('Unsupported WebP header: '+file);
}
for(const id of R.REAL_CAR_IDS){
  const spec=R.LIVERIES[id]?.sprite;
  assert.ok(spec?.src&&spec?.thumbnail,id+' missing car image paths');
  const fullPath=path.join(root,'public',spec.src),thumbPath=path.join(root,'public',spec.thumbnail);
  assert.ok(fs.existsSync(fullPath),id+' full image missing: '+spec.src);
  assert.ok(fs.existsSync(thumbPath),id+' thumbnail missing: '+spec.thumbnail);
  const full=webpSize(fullPath),thumb=webpSize(thumbPath);
  assert.ok(full.width>=thumb.width&&full.height>=thumb.height,id+' full image is smaller than thumbnail');
  assert.equal(spec.preserveAspectRatio,true,id+' must preserve source proportions');
  const size=R.resolveSpriteSize(spec,full.width,full.height,true);
  assert.ok(Math.abs(size.length/size.width-full.width/full.height)<1e-6,id+' preview distorts source aspect ratio');
}
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/css/race-control-v65.css'),'utf8');
assert.match(html,/<meta name="velocity-apex-version" content="V74\.1"/);
assert.match(css,/#menu \.rc-car-holder img\{[^}]*object-fit:contain[^}]*transform:none;/);
console.log('Car preview V74.1: all 42 car assets exist, full images are not smaller than thumbnails, and previews preserve proportions.');
