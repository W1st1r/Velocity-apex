import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const mobile=read('public/css/mobile-ui.css');
const script=read('public/js/garage.js');
const repair=mobile.slice(mobile.lastIndexOf('/* V56 · Garage owns its rows'));

// The last loaded mobile stylesheet previously forced a three-row shop frame
// and flex categories; these rules must explicitly win over that stylesheet.
assert.ok(html.indexOf('css/style.css')<html.indexOf('css/mobile-ui.css'));
assert.match(html,/mobile-ui\.css[^"\n]*garageNav=20260920-v56/);
assert.match(repair,/\.garage-screen \.garage-panel\.catalog-panel\{[^}]*grid-template-rows:auto auto auto minmax\(0,1fr\) auto!important/);
assert.match(repair,/\.garage-screen\.effect-open \.garage-panel\.catalog-panel\{[^}]*grid-template-rows:auto auto minmax\(0,1fr\) auto!important/);
assert.match(repair,/\.garage-screen\.upgrade-open \.garage-panel\.catalog-panel\{[^}]*grid-template-rows:auto auto minmax\(0,1fr\)!important/);
assert.match(repair,/#garageTabs\{[^}]*grid-row:2!important;[^}]*display:grid!important;[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
assert.match(repair,/#garageCategoryTabs\{[^}]*display:grid!important;[^}]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
assert.match(repair,/#garageCategoryTabs button\{[^}]*min-width:0!important/);
assert.match(script,/classList\.toggle\('effect-open',!isUpgrade&&!isCars\)/);
for(const tab of ['livery','effect','upgrade'])assert.match(html,new RegExp(`data-tab="${tab}"`));
console.log('garage_nav_v56_test: ok');
