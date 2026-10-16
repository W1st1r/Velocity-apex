import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
globalThis.Racing = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'public/js/content.js'), 'utf8'), { filename: 'content.js' });
vm.runInThisContext(fs.readFileSync(path.join(root, 'public/js/garage.js'), 'utf8'), { filename: 'garage.js' });
const catalog = globalThis.Racing.CASES.all.rewards;
const quantities = [1, 2, 3, 4, 5, 10];

for (const quantity of quantities) {
  let html = '';
  let isResultsOpen = false;
  const result = {
    className: 'case-result hidden',
    setAttribute() {},
    classList: { remove() {} },
    set innerHTML(value) { html = value; },
    get innerHTML() { return html; },
    querySelector() { return null; }
  };
  const modal = { classList: { add() { isResultsOpen = true; } } };
  const fake = Object.create(globalThis.Racing.Garage.prototype);
  fake.caseDialog = () => ({ ready: { classList: { add() {} } }, result, modal });
  fake.syncCaseAwardControls = () => {};
  fake.view = () => ({ message: { textContent: '', classList: { remove() {} } } });
  const results = Array.from({ length: quantity }, (_, index) => ({
    reward: { ...catalog[index % catalog.length], name: index === 0 && quantity === 1 ? '<script>name</script>' : catalog[index % catalog.length].name },
    chanceBps: catalog[index % catalog.length].chanceBps,
    duplicate: index % 2 === 1,
    compensation: index % 2 === 1 ? 12345 : 0
  }));
  fake.showCaseResults(results);
  const count = (html.match(/class="case-award-card/g) || []).length;
  assert.equal(count, quantity, `all ${quantity} rewards must be rendered as separate cards`);
  assert.match(html, /ВАШИ НАГРАДЫ/);
  assert.match(html, new RegExp(`01 \/ ${quantity}`));
  assert.match(html, new RegExp(`НАГРАДА ${String(quantity).padStart(2, '0')}`));
  assert.ok(isResultsOpen, 'result modal must expand to the full-width awards view');
  assert.match(html, /aria-label="Награда 1 из/);
  assert.match(html, /ДОБАВЛЕН В ГАРАЖ/);
  if (quantity > 1) assert.match(html, /ДУБЛИКАТ · КОМПЕНСАЦИЯ/);
  if (quantity === 1) {
    assert.match(html, /&lt;script&gt;name&lt;\/script&gt;/, 'reward names must be HTML escaped');
    assert.doesNotMatch(html, /<script>name<\/script>/);
  }
}

console.log('V76.3 award rendering contract: 1/2/3/4/5/10 cards, metadata, duplicates and escaping OK');
