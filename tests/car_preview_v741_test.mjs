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
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', file + ' must be a WebP RIFF image');
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', file + ' must be WebP');
  for (let p = 12; p + 8 <= b.length;) {
    const type = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4), d = p + 8;
    if (type === 'VP8X' && d + 10 <= b.length) {
      return { width: 1 + b.readUIntLE(d + 4, 3), height: 1 + b.readUIntLE(d + 7, 3) };
    }
    if (type === 'VP8L' && d + 5 <= b.length && b[d] === 0x2f) {
      return { width: 1 + (((b[d + 2] & 0x3f) << 8) | b[d + 1]), height: 1 + (((b[d + 4] & 0x0f) << 10) | (b[d + 3] << 2) | ((b[d + 2] & 0xc0) >> 6)) };
    }
    if (type === 'VP8 ' && d + 10 <= b.length) {
      for (let i = d; i + 7 < d + size; i++) if (b[i] === 0x9d && b[i + 1] === 0x01 && b[i + 2] === 0x2a) {
        return { width: b.readUInt16LE(i + 3) & 0x3fff, height: b.readUInt16LE(i + 5) & 0x3fff };
      }
    }
    p = d + size + (size & 1);
  }
  throw new Error('Cannot read WebP dimensions: ' + file);
}
for (const id of R.REAL_CAR_IDS) {
  const car = R.LIVERIES[id], spec = car?.sprite;
  assert.ok(spec?.src && spec?.thumbnail, id + ' needs full and thumbnail assets');
  assert.match(spec.src, /^assets\/cars\/[\w.-]+\.webp$/, id + ' full image path');
  assert.match(spec.thumbnail, /^assets\/cars\/[\w.-]+-thumbnail\.webp$/, id + ' thumbnail path');
  const fullPath = path.join(root, 'public', spec.src), thumbPath = path.join(root, 'public', spec.thumbnail);
  assert.ok(fs.existsSync(fullPath), id + ' full image missing: ' + spec.src);
  assert.ok(fs.existsSync(thumbPath), id + ' thumbnail missing: ' + spec.thumbnail);
  const full = webpSize(fullPath), thumb = webpSize(thumbPath);
  assert.ok(full.width >= thumb.width && full.height >= thumb.height, id + ' full image must not be smaller than its thumbnail');
  assert.equal(spec.preserveAspectRatio, true, id + ' must preserve source proportions');
  const size = R.resolveSpriteSize(spec, full.width, full.height, true);
  const rendered = R.resolveSpriteRenderSize(spec, size, true);
  assert.ok(size.length <= spec.visualLength + 1e-6, id + ' preview exceeds visual length bound');
  assert.ok(size.width <= spec.visualWidth + 1e-6, id + ' preview exceeds visual width bound');
  assert.ok(rendered.length <= size.length + 1e-6, id + ' preview length multiplier enlarges the image');
  assert.ok(Math.abs(size.length / size.width - full.width / full.height) < 1e-6, id + ' preview distorts source aspect ratio');
}
assert.match(car, /Math\.min\(1,positive\(spec\.previewScale,1\)\)/, 'preview scale cap missing');
assert.match(css, /#menu \.rc-car-holder img\{[^}]*object-fit:contain[^}]*transform:none;/, 'main menu must contain cars without rotation or enlargement');
console.log('Car preview V74.1: all 42 cars have valid full/thumbnail assets and bounded proportional previews.');
