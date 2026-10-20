import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const chat=fs.readFileSync(new URL('../public/js/freeroam.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/css/ui-polish-v2.css',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../public/version.json',import.meta.url),'utf8'));
assert.equal(manifest.version,'V77','published version remains V77');assert.equal(manifest.developmentVersion,'2.0.0-dev');assert.equal(manifest.channel,'development');
assert.match(html,/meta name="velocity-apex-version" content="V77"/);assert.match(html,/data-app-version>V77/);assert.match(html,/app-version\.mjs\?build=2\.0\.0-dev/);
assert.match(chat,/className='free-chat-meta'/);assert.match(chat,/free-chat-id/);assert.match(chat,/row\.append\(meta,t\)/);
assert.match(css,/prefers-reduced-motion/);assert.match(css,/100dvh/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
const source=fs.readFileSync(new URL('../public/js/app-version.mjs',import.meta.url),'utf8').replace("if(typeof document!=='undefined')loadAppVersion();",'');
const {loadAppVersion}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const makeDoc=()=>{const meta={content:'V77'},label={textContent:'V77'};return {title:'Velocity Apex · V77',querySelector:()=>meta,querySelectorAll:()=>[label],meta,label};};
const dev=makeDoc();assert.equal(await loadAppVersion(async()=>({ok:true,json:async()=>manifest}),dev),'2.0.0-dev');assert.equal(dev.title,'Velocity Apex · 2.0.0-dev');assert.equal(dev.label.textContent,'2.0.0-dev');
const prod=makeDoc();assert.equal(await loadAppVersion(async()=>({ok:true,json:async()=>({...manifest,channel:'production'})}),prod),'V77');
const fallback=makeDoc();assert.equal(await loadAppVersion(async()=>{throw Error('offline');},fallback),'V77');
console.log('ui_version_v2_test: chat metadata, responsive treatment, dev version isolation, production fallback and offline fallback passed');
