import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'public/css/cases-v763.css'), 'utf8');
const contentJs = fs.readFileSync(path.join(root, 'public/js/content.js'), 'utf8');
const garageJs = fs.readFileSync(path.join(root, 'public/js/garage.js'), 'utf8');
const rewardImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><path fill="#40bce9" d="M18 77h23l22-30q7-9 19-9h74q13 0 22 12l17 20h22q9 0 9 9v17H16V84q0-7 2-7zm48-4h123l-15-18q-5-6-14-6H84q-8 0-13 7z"/><circle cx="63" cy="96" r="13" fill="#061528"/><circle cx="186" cy="96" r="13" fill="#061528"/></svg>')}`;
const modalFixture = `
<div id="caseModal" class="overlay case-modal" role="dialog" aria-modal="true" aria-labelledby="caseModalTitle" style="--case:#55c8ff">
 <section class="case-open-panel glass">
  <header class="case-modal-header"><div><div class="eyebrow">VELOCITY APEX / CASE OPENING</div><h2 id="caseModalTitle">APEX OMNI</h2><small id="caseModalSubtitle">MIXED DROP</small></div><div class="case-modal-wallet"><span>БАЛАНС</span><strong id="caseModalCredits">48 212 CR</strong></div><button id="caseCloseBtn" class="secondary-btn case-close-btn" type="button">ЗАКРЫТЬ</button></header>
  <div class="case-modal-body">
   <div class="case-opening-zone"><div class="case-hero-row"><div class="case-crate case-crate-modal"><i></i><b>VA</b><span></span></div><div class="case-hero-copy"><span>КЕЙС В ИНВЕНТАРЕ</span><strong id="caseOwnedCount">x21</strong><small id="casePriceLabel">36 625 CR</small></div></div>
    <button id="caseBuyBatchBtn" class="secondary-btn case-buy-batch-btn" type="button">КУПИТЬ</button><div id="caseRoulette" class="case-roulette"><div class="case-roulette-marker"></div><div class="case-roulette-viewport"><div id="caseRollStrip" class="case-roll-strip"></div></div><div id="caseReadyLabel" class="case-ready-label">НАЖМИТЕ «ОТКРЫТЬ», ЧТОБЫ ЗАПУСТИТЬ РУЛЕТКУ</div></div>
    <div id="caseResult" class="case-result hidden" aria-live="polite"></div><button id="caseOpenBtn" class="primary-btn case-open-btn" type="button">ОТКРЫТЬ</button><p class="case-fairness-note">Шансы фиксируются до запуска анимации.</p>
   </div><aside class="case-rewards-panel"><div class="case-rewards-head">ВОЗМОЖНЫЕ НАГРАДЫ</div><div id="caseRewardList" class="case-reward-list"></div></aside>
  </div>
 </section>
</div>`;
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}\nhtml,body{width:100%;height:100%;margin:0;overflow:hidden;background:#071426}*{box-sizing:border-box}</style></head><body>${modalFixture}</body></html>`;
const phones = Object.keys(devices).filter(name => /^iPhone (13|14|15|16|17).* landscape$/.test(name));
assert.ok(phones.length >= 19, `Playwright should provide iPhone 13–17 landscape descriptors; found ${phones.length}`);
const browser = await chromium.launch({ headless: true });
let profilesChecked = 0;
try {
  for (const name of phones) {
    const { defaultBrowserType, ...device } = devices[name];
    const context = await browser.newContext({ ...device, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: contentJs });
    await page.addScriptTag({ content: garageJs });
    await page.evaluate(() => {
      const fake = Object.create(Racing.Garage.prototype);
      fake.caseDialog = Racing.Garage.prototype.caseDialog;
      fake.view = () => ({ message: { textContent: '', classList: { remove() {} } } });
      fake.render = () => {};
      fake.caseSpinning = false;
      fake.activeCaseId = 'all';
      window.__caseGarage = fake;
      const d = fake.caseDialog();
      d.modal.classList.remove('hidden');
      d.strip.innerHTML = '';
    });
    const before = await page.evaluate(() => {
      const roulette = document.querySelector('.case-roulette'), marker = document.querySelector('.case-roulette-marker'), label = document.querySelector('.case-ready-label'), strip = document.querySelector('.case-roll-strip');
      return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollW: document.documentElement.scrollWidth, roulette: roulette.getBoundingClientRect().toJSON(), marker: marker.getBoundingClientRect().toJSON(), label: label.getBoundingClientRect().toJSON(), idle: getComputedStyle(strip, '::before').content, footer: getComputedStyle(label).backgroundImage };
    });
    assert.equal(before.scrollW, before.w, `${name}: idle state must not widen the page`);
    assert.ok(before.label.height <= 22, `${name}: roulette footer should stay compact (${before.label.height}px)`);
    assert.match(before.idle, /ЛЕНТА НАГРАД ГОТОВА/ , `${name}: idle roulette should have a designed ready state`);
    assert.ok(before.roulette.width <= before.w, `${name}: roulette fits viewport`);

    const sweepQuantity = ['iPhone 13 Mini landscape', 'iPhone 14 Pro Max landscape', 'iPhone 17 Pro Max landscape'].includes(name) ? [1, 2, 3, 4, 5, 10] : [10];
    for (const quantity of sweepQuantity) {
      await page.evaluate(({ quantity, image }) => {
        const fake = window.__caseGarage, catalog = Racing.CASES.all.rewards;
        const results = Array.from({ length: quantity }, (_, i) => ({ reward: { ...catalog[i % catalog.length], name: `Drop ${i + 1} · ${catalog[i % catalog.length].name}`, thumbnail: image }, chanceBps: catalog[i % catalog.length].chanceBps, duplicate: i % 2 === 1, compensation: i % 2 === 1 ? 12345 : 0 }));
        fake.showCaseResults(results);
      }, { quantity, image: rewardImage });
      const rendered = await page.evaluate(() => {
        const carousel = document.querySelector('.case-awards-carousel'), card = carousel.querySelector('.case-award-card'), modal = document.querySelector('#caseModal'), roulette = document.querySelector('.case-roulette'), rightPanel = document.querySelector('.case-rewards-panel');
        return { cards: carousel.querySelectorAll('.case-award-card').length, width: carousel.clientWidth, scrollWidth: carousel.scrollWidth, pageW: document.documentElement.scrollWidth, pageX: innerWidth, cardW: card.getBoundingClientRect().width, cardRight: card.getBoundingClientRect().right, carouselRight: carousel.getBoundingClientRect().right, modalState: modal.classList.contains('case-results-open'), rouletteDisplay: getComputedStyle(roulette).display, panelDisplay: getComputedStyle(rightPanel).display, dpr: devicePixelRatio };
      });
      assert.equal(rendered.cards, quantity, `${name}: every ${quantity} award must render`);
      assert.equal(rendered.modalState, true, `${name}: full-width award state must activate`);
      assert.equal(rendered.rouletteDisplay, 'none', `${name}: roulette should yield space to results`);
      assert.equal(rendered.panelDisplay, 'none', `${name}: possible-reward panel should yield space to results`);
      assert.equal(rendered.pageW, rendered.pageX, `${name}: no page-level horizontal overflow`);
      assert.ok(rendered.width > 0 && rendered.scrollWidth >= rendered.width * quantity - 2, `${name}: cards should be swipe-scrollable (${quantity})`);
      assert.ok(rendered.cardRight <= rendered.carouselRight + 1, `${name}: first reward card fits its viewport`);
      if (quantity === 10) {
        const next = page.locator('[data-case-awards-step="1"]');
        for (let i = 1; i < quantity; i++) await next.click();
        await page.waitForFunction(() => document.querySelector('.case-award-position')?.textContent === '10 / 10');
        assert.equal(await page.locator('[data-case-awards-step="1"]').isDisabled(), true, `${name}: next is disabled at the last reward`);
        assert.equal(await page.locator('[data-case-awards-step="-1"]').isDisabled(), false, `${name}: previous is available at the last reward`);
        await page.locator('.case-awards-carousel').focus();
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(() => document.querySelector('.case-award-position')?.textContent === '09 / 10');
      }
      if (name === 'iPhone 17 Pro Max landscape' && quantity === 5) {
        await page.screenshot({ path: '/tmp/Velocity_Apex_V76_3_iPhone_17_Pro_Max_WebKit.png', fullPage: false });
      }
    }
    profilesChecked++;
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`V76.3 case UI Chromium mobile emulation: ${profilesChecked} iPhone 13–17 landscape viewport/DPR/touch profiles, 1/2/3/4/5/10 award navigation and overflow checks OK; not Safari or a physical iPhone. Playwright WebKit binary is unavailable in this environment.`);
