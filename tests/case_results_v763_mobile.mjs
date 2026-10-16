import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { webkit, devices } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = process.env.CASE_SCREENSHOT_DIR || path.join(root, 'artifacts/case-v7632');
fs.mkdirSync(screenshotDir, { recursive: true });
const css = fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'public/css/mobile-ui.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'public/css/cases-v763.css'), 'utf8');
const contentJs = fs.readFileSync(path.join(root, 'public/js/content.js'), 'utf8');
const garageJs = fs.readFileSync(path.join(root, 'public/js/garage.js'), 'utf8');
const rewardImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><path fill="#40bce9" d="M18 77h23l22-30q7-9 19-9h74q13 0 22 12l17 20h22q9 0 9 9v17H16V84q0-7 2-7zm48-4h123l-15-18q-5-6-14-6H84q-8 0-13 7z"/><circle cx="63" cy="96" r="13" fill="#061528"/><circle cx="186" cy="96" r="13" fill="#061528"/></svg>')}`;
const modalFixture = `
<div id="caseModal" class="overlay case-modal" role="dialog" aria-modal="true" aria-labelledby="caseModalTitle" style="--case:#55c8ff">
 <section class="case-open-panel glass">
  <header class="case-modal-header"><div><div class="eyebrow">VELOCITY APEX / CASE OPENING</div><h2 id="caseModalTitle">APEX OMNI</h2><small id="caseModalSubtitle">MIXED DROP</small></div><div class="case-modal-wallet"><span>БАЛАНС</span><strong id="caseModalCredits">48 212 CR</strong></div><button id="caseCloseBtn" class="secondary-btn case-close-btn" type="button">ЗАКРЫТЬ</button></header>
  <div class="case-modal-body">
   <div class="case-opening-zone"><div class="case-hero-row"><div class="case-crate case-crate-modal"><i></i><b>VA</b><span></span></div><div class="case-hero-copy"><span>КЕЙС В ИНВЕНТАРЕ</span><strong id="caseOwnedCount">x21</strong><small id="casePriceLabel">36 625 CR</small></div><div class="case-quantity-wrap"><span>КОЛИЧЕСТВО</span><div class="case-quantity-control"><button id="caseQtyMinus" type="button">−</button><strong id="caseQtyValue">1</strong><button id="caseQtyPlus" type="button">+</button></div><small>1–10 ЗА РАЗ</small></div></div>
    <button id="caseBuyBatchBtn" class="secondary-btn case-buy-batch-btn" type="button">КУПИТЬ</button><div id="caseRoulette" class="case-roulette"><div class="case-roulette-marker"></div><div class="case-roulette-viewport"><div id="caseRollStrip" class="case-roll-strip"></div></div></div><div id="caseReadyLabel" class="case-ready-label">НАЖМИТЕ «ОТКРЫТЬ», ЧТОБЫ ЗАПУСТИТЬ РУЛЕТКУ</div>
    <div id="caseResult" class="case-result hidden" aria-live="polite"></div><button id="caseOpenBtn" class="primary-btn case-open-btn" type="button">ОТКРЫТЬ</button><p class="case-fairness-note">Шансы фиксируются до запуска анимации.</p>
   </div><aside class="case-rewards-panel"><div class="case-rewards-head">ВОЗМОЖНЫЕ НАГРАДЫ</div><div id="caseRewardList" class="case-reward-list"></div></aside>
  </div>
 </section>
</div>`;
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}\nhtml,body{width:100%;height:100%;margin:0;overflow:hidden;background:#071426}*{box-sizing:border-box}</style></head><body>${modalFixture}</body></html>`;
const phones = Object.keys(devices).filter(name => /^iPhone (13|14|15|16|17).* landscape$/.test(name));
assert.ok(phones.length >= 19, `Playwright should provide iPhone 13–17 landscape descriptors; found ${phones.length}`);
const browser = await webkit.launch({ headless: true });
let profilesChecked = 0;
try {
  for (const name of phones) {
    const { defaultBrowserType, ...device } = devices[name];
    const context = await browser.newContext({ ...device, reducedMotion: 'no-preference' });
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
      Racing.Garage.prototype.bindCaseDialog.call(fake);
      window.__caseGarage = fake;
      const d = fake.caseDialog();
      d.modal.classList.remove('hidden');
      d.strip.innerHTML = '';
    });
    const before = await page.evaluate(() => {
      const roulette = document.querySelector('.case-roulette'), marker = document.querySelector('.case-roulette-marker'), label = document.querySelector('.case-ready-label'), strip = document.querySelector('.case-roll-strip');
      return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollW: document.documentElement.scrollWidth, panel: document.querySelector('.case-open-panel').getBoundingClientRect().toJSON(), open: document.querySelector('#caseOpenBtn').getBoundingClientRect().toJSON(), roulette: roulette.getBoundingClientRect().toJSON(), marker: marker.getBoundingClientRect().toJSON(), label: label.getBoundingClientRect().toJSON(), labelParent: label.parentElement.id, labelPosition: getComputedStyle(label).position, labelBackground: getComputedStyle(label).backgroundColor, idle: getComputedStyle(strip, '::before').content };
    });
    assert.equal(before.scrollW, before.w, `${name}: idle state must not widen the page`);
    const headerStyle = await page.locator('.case-modal-header').evaluate(el => { const s=getComputedStyle(el), before=getComputedStyle(el,'::before'), after=getComputedStyle(el,'::after'); return {backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,borderWidth:s.borderWidth,boxShadow:s.boxShadow,borderRadius:s.borderRadius,before:before.content,after:after.content,rect:el.getBoundingClientRect().toJSON(),title:document.querySelector('#caseModalTitle').getBoundingClientRect().toJSON(),wallet:document.querySelector('.case-modal-wallet').getBoundingClientRect().toJSON(),close:document.querySelector('#caseCloseBtn').getBoundingClientRect().toJSON()}; });
    assert.match(headerStyle.backgroundColor,/rgba\(0, 0, 0, 0\)|transparent/,`${name}: case header background must be transparent in the full stylesheet cascade`);
    assert.equal(headerStyle.backgroundImage,'none',`${name}: no header gradient may paint the old slab`);
    assert.equal(headerStyle.borderWidth,'0px',`${name}: header has no card border`);
    assert.equal(headerStyle.boxShadow,'none',`${name}: header has no card shadow`);
    assert.equal(headerStyle.borderRadius,'0px',`${name}: header has no independent card corners`);
    assert.equal(headerStyle.before,'none',`${name}: no header ::before overlay`); assert.equal(headerStyle.after,'none',`${name}: no header ::after overlay`);
    for (const [part, rect] of [['title',headerStyle.title],['wallet',headerStyle.wallet],['close',headerStyle.close]]) assert.ok(rect.left >= headerStyle.rect.left-1 && rect.right <= headerStyle.rect.right+1 && rect.top >= headerStyle.rect.top-1 && rect.bottom <= headerStyle.rect.bottom+1,`${name}: ${part} remains inside the unified header`);
    assert.equal(before.labelParent, '', `${name}: ready caption must be outside the clipped roulette`);
    assert.notEqual(before.labelPosition, 'absolute', `${name}: ready caption must be in normal flow`);
    assert.ok(before.label.y >= before.roulette.y + before.roulette.height - 1, `${name}: ready caption may not overlap the reel`);
    assert.match(before.labelBackground, /rgba\(0, 0, 0, 0\)|transparent/, `${name}: caption must not paint an opaque rectangle`);
    assert.match(before.idle, /ЛЕНТА НАГРАД ГОТОВА/ , `${name}: idle roulette should have a designed ready state`);
    assert.ok(before.roulette.width <= before.w, `${name}: roulette fits viewport`);
    assert.ok(before.open.top >= before.panel.top && before.open.bottom <= before.panel.bottom + 1, `${name}: open button stays inside the modal (${before.open.bottom} of ${before.panel.bottom}px)`);

    const casesChecked = await page.evaluate(() => {
      const cases = window.Racing.CASES, roulette = document.querySelector('.case-roulette'), label = document.querySelector('.case-ready-label');
      return Object.entries(cases).map(([id, box]) => { roulette.style.setProperty('--case', box.accent); roulette.dataset.case = id; const r = roulette.getBoundingClientRect(), l = label.getBoundingClientRect(); return { id, noOverlap: l.top >= r.bottom - 1, width: r.width }; });
    });
    assert.equal(casesChecked.length, 8, `${name}: all 8 catalog cases should use the corrected structure`);
    assert.ok(casesChecked.every(x => x.noOverlap && x.width > 0), `${name}: each case must retain a visible roulette and separate status caption`);

    const captureStates = name === 'iPhone 17 Pro Max landscape';
    if (captureStates) {
      await page.locator('.case-modal-header').evaluate(el => Object.assign(el.style,{background:'linear-gradient(110deg,rgba(31,63,96,.34),rgba(11,25,43,.22))',border:'1px solid rgba(103,161,207,.16)',borderRadius:'13px',boxShadow:'inset 0 1px rgba(255,255,255,.025)'}));
      await page.screenshot({ path: path.join(screenshotDir, 'before-header-slab-reproduced.png') });
      await page.locator('.case-modal-header').evaluate(el => el.removeAttribute('style'));
      await page.evaluate(() => { const label = document.querySelector('.case-ready-label'), roulette = document.querySelector('.case-roulette'); label.removeAttribute('style'); roulette.after(label); });
      await page.screenshot({ path: path.join(screenshotDir, 'after-header-clean.png') });
      await page.evaluate(() => { const roulette = document.querySelector('.case-roulette'), strip = document.querySelector('.case-roll-strip'); strip.innerHTML = Array.from({length:45},(_,i)=>`<div class="case-roll-item"><strong>VELOCITY ${i+1}</strong><span>RARE</span></div>`).join(''); roulette.classList.add('is-spinning'); strip.style.transition = 'transform 4s cubic-bezier(.07,.72,.08,1)'; requestAnimationFrame(()=>strip.style.transform='translate3d(-950px,0,0)'); });
      await page.waitForTimeout(500);
      const spinMarker = await page.locator('.case-roulette-marker').boundingBox();
      assert.ok(spinMarker && spinMarker.width > 0, 'spin state should retain the central pointer');
      assert.match(await page.locator('.case-modal-header').evaluate(el=>getComputedStyle(el).backgroundImage),/^none$/,`${name}: header remains unpainted during spin`);
      await page.screenshot({ path: path.join(screenshotDir, 'during-spin.png') });
      await page.evaluate(() => { document.querySelector('.case-roulette').classList.remove('is-spinning'); const strip = document.querySelector('.case-roll-strip'); strip.style.transition='none'; strip.style.transform='none'; });
    }

    const sweepQuantity = ['iPhone 13 Mini landscape', 'iPhone 14 Pro Max landscape', 'iPhone 17 Pro Max landscape'].includes(name) ? [1, 2, 3, 4, 5, 10] : [10];
    for (const quantity of sweepQuantity) {
      await page.evaluate(({ quantity, image }) => {
        const fake = window.__caseGarage, catalog = Racing.CASES.all.rewards;
        const results = Array.from({ length: quantity }, (_, i) => ({ reward: { ...catalog[i % catalog.length], name: `Drop ${i + 1} · ${catalog[i % catalog.length].name}`, thumbnail: image }, chanceBps: catalog[i % catalog.length].chanceBps, duplicate: i % 2 === 1, compensation: i % 2 === 1 ? 12345 : 0 }));
        fake.showCaseResults(results);
      }, { quantity, image: rewardImage });
      const rendered = await page.evaluate(() => {
        const carousel = document.querySelector('.case-awards-carousel'), card = carousel.querySelector('.case-award-card'), modal = document.querySelector('#caseModal'), roulette = document.querySelector('.case-roulette'), rightPanel = document.querySelector('.case-rewards-panel');
        return { cards: carousel.querySelectorAll('.case-award-card').length, width: carousel.clientWidth, scrollWidth: carousel.scrollWidth, pageW: document.documentElement.scrollWidth, pageX: innerWidth, cardW: card.getBoundingClientRect().width, cardRight: card.getBoundingClientRect().right, carouselRight: carousel.getBoundingClientRect().right, cardBottom: card.getBoundingClientRect().bottom, panelBottom: document.querySelector('.case-open-panel').getBoundingClientRect().bottom, openBottom: document.querySelector('#caseOpenBtn').getBoundingClientRect().bottom, modalState: modal.classList.contains('case-results-open'), rouletteDisplay: getComputedStyle(roulette).display, captionDisplay: getComputedStyle(document.querySelector('.case-ready-label')).display, panelDisplay: getComputedStyle(rightPanel).display, dpr: devicePixelRatio };
      });
      assert.equal(rendered.cards, quantity, `${name}: every ${quantity} award must render`);
      assert.match(await page.locator('.case-modal-header').evaluate(el=>getComputedStyle(el).backgroundImage),/^none$/,`${name}: header remains unpainted after results`);
      assert.equal(rendered.modalState, true, `${name}: full-width award state must activate`);
      assert.equal(rendered.rouletteDisplay, 'none', `${name}: roulette should yield space to results`);
      assert.equal(rendered.captionDisplay, 'none', `${name}: idle caption should not remain as a blank/black slab in result state`);
      assert.equal(rendered.panelDisplay, 'none', `${name}: possible-reward panel should yield space to results`);
      assert.ok(rendered.cardBottom <= rendered.panelBottom + 1 && rendered.openBottom <= rendered.panelBottom + 1, `${name}: reward card and close/open controls stay within the modal height`);
      assert.equal(rendered.pageW, rendered.pageX, `${name}: no page-level horizontal overflow`);
      assert.ok(rendered.width > 0 && (quantity === 1 ? rendered.scrollWidth >= rendered.width : rendered.scrollWidth > rendered.width + 1), `${name}: cards should be swipe-scrollable (${quantity}; content ${rendered.scrollWidth}px / viewport ${rendered.width}px)`);
      assert.ok(rendered.cardRight <= rendered.carouselRight + 1, `${name}: first reward card fits its viewport`);
      if (quantity === 10 && ['iPhone 13 Mini landscape', 'iPhone 14 Pro Max landscape', 'iPhone 17 Pro Max landscape'].includes(name)) {
        const next = page.locator('[data-case-awards-step="1"]');
        for (let i = 1; i < quantity; i++) {
          await next.click();
          const expected = `${String(i + 1).padStart(2, '0')} / 10`;
          await page.waitForFunction(value => document.querySelector('.case-award-position')?.textContent === value, expected);
        }
        await page.waitForFunction(() => document.querySelector('.case-award-position')?.textContent === '10 / 10');
        assert.equal(await page.locator('[data-case-awards-step="1"]').isDisabled(), true, `${name}: next is disabled at the last reward`);
        assert.equal(await page.locator('[data-case-awards-step="-1"]').isDisabled(), false, `${name}: previous is available at the last reward`);
        await page.locator('.case-awards-carousel').focus();
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(() => document.querySelector('.case-award-position')?.textContent === '09 / 10');
      }
      if (captureStates && quantity === 5) {
        await page.screenshot({ path: path.join(screenshotDir, 'after-results-5.png'), fullPage: false });
      }
    }
    profilesChecked++;
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`V76.3.2 Playwright WebKit mobile emulation: ${profilesChecked} iPhone 13–17 landscape viewport/DPR/touch profiles, 8 case structures with complete style.css + mobile-ui.css + cases-v763.css cascade, pre/during/post states and transparent unboxed case header, award quantities 1/2/3/4/5/10 and carousel navigation passed. This is WebKit emulation, not physical iOS Safari.`);
