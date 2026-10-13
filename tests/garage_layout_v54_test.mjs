import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html');
const css=read('public/css/style.css');
const garage=read('public/js/garage.js');

// DOM hierarchy: primary tabs, independent secondary row, then standard/upgrade sibling panes.
const tabsAt=html.indexOf('id="garageTabs"');
const secondaryAt=html.indexOf('id="garageSecondaryNav"');
const standardAt=html.indexOf('id="garageStandardBody"');
const upgradeAt=html.indexOf('id="garageUpgradePanel"');
assert.ok(tabsAt>0 && tabsAt<secondaryAt && secondaryAt<standardAt && standardAt<upgradeAt,'Garage rows must be ordered tabs -> secondary -> standard -> upgrade');
const standardBlock=html.slice(standardAt,upgradeAt);
assert.doesNotMatch(standardBlock,/id="garageCategoryTabs"/,'categories must not be nested in the main content grid');
assert.match(html,/id="garageSecondaryNav"[\s\S]*id="garageCategoryTabs"/);
assert.match(html,/garageLayout=20260920-v54/);
assert.match(html,/layout=20260920-v54/);

// Atomic pane switching: no inline display mutations, hidden panels are made inert.
assert.match(garage,/setPaneVisible\(el,visible\)/);
assert.match(garage,/setAttribute\('inert',''\)/);
assert.doesNotMatch(garage,/standardBody\.style\.display|upgradePanel\.style\.display|categories\.style\.display/);
assert.match(garage,/setPaneVisible\(v\.standardBody,!isUpgrade\)/);
assert.match(garage,/setPaneVisible\(v\.upgradePanel,isUpgrade\)/);
assert.match(garage,/setPaneVisible\(v\.secondaryNav,!isUpgrade&&isCars\)/);

// Responsive production layout and exact upgrade proportions.
assert.match(css,/\.garage-panel\{[\s\S]*grid-template-rows:auto auto auto minmax\(0,1fr\) auto/);
assert.match(css,/#garageCategoryTabs\{[\s\S]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
assert.match(css,/\.garage-standard-body\{[\s\S]*grid-template-columns:minmax\(190px,\.78fr\) minmax\(0,1\.22fr\)/);
assert.match(css,/\.upgrade-board\{[\s\S]*grid-template-columns:minmax\(0,34fr\) minmax\(118px,22fr\) minmax\(0,34fr\)/);
assert.match(css,/height:min\(620px,calc\(100dvh - 16px - var\(--safe-t\) - var\(--safe-b\)\)\)/);
assert.match(css,/@media \(orientation:landscape\) and \(max-height:560px\)/);
assert.match(css,/-webkit-touch-callout:none/);
assert.match(css,/user-select:none/);
assert.doesNotMatch(css,/V54[\s\S]{0,8000}(?:margin-top|top|left):\s*-\d+px/,'V54 must not introduce negative positioning hacks');

// Upgrade selected state stays accent-based instead of a solid acid-green fill.
const v54=css.slice(css.indexOf('/* V54 · Garage production layout'));
assert.match(v54,/#garageTabs button\[data-tab="upgrade"\]\.selected\{[\s\S]*rgba\(87,192,241,\.14\)/);
assert.doesNotMatch(v54,/#garageTabs button\[data-tab="upgrade"\]\.selected\{[^}]*color:#07110b/);

console.log('garage_layout_v54_test: ok');
