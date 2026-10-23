import assert from 'node:assert/strict';
import {loadAppVersion} from '../public/js/app-version.mjs';
function makeDocument(){
  const root={dataset:{}},meta={content:''},label={textContent:''};
  return {documentElement:root,title:'',querySelector:()=>meta,querySelectorAll:()=>[label],root,meta,label};
}
const current=makeDocument();
let currentRequest=null;
const currentVersion=await loadAppVersion(async(url,options)=>{currentRequest={url,options};return {ok:true,json:async()=>({version:'2.0.3',resourceVersion:'2.0.3',protocolVersion:1,channel:'production'})};},current);
assert.equal(currentVersion,'2.0.3');
assert.equal(currentRequest.url,'./version.json?build=2.0.3');
assert.equal(currentRequest.options.cache,'no-store');
assert.equal(current.root.dataset.appVersion,'2.0.3');
assert.equal(current.label.textContent,'2.0.3');
const stale=makeDocument();
const staleVersion=await loadAppVersion(async()=>({ok:true,json:async()=>({version:'2.0.1',resourceVersion:'2.0.1',protocolVersion:1,channel:'production'})}),stale);
assert.equal(staleVersion,'2.0.3','a stale production manifest must not downgrade the current app shell');
assert.equal(stale.root.dataset.appVersion,'2.0.3');
const unavailable=makeDocument();
const fallbackVersion=await loadAppVersion(async()=>{throw Error('network unavailable');},unavailable);
assert.equal(fallbackVersion,'2.0.3');
assert.equal(unavailable.root.dataset.appVersion,'2.0.3','fallback must preserve a usable version marker');
const development=makeDocument();
const developmentVersion=await loadAppVersion(async()=>({ok:true,json:async()=>({version:'2.0.3',developmentVersion:'2.0.0-dev',resourceVersion:'2.0.3',protocolVersion:1,channel:'development'})}),development);
assert.equal(developmentVersion,'2.0.0-dev','development channel version must remain supported');
assert.equal(development.root.dataset.resourceVersion,'2.0.3');
console.log('app-version cache/fallback tests passed');
