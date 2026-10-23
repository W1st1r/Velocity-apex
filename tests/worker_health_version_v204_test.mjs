import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const manifestVersion='2.0.4';
const assetRequests=[];
const assets={fetch:async request=>{
  assetRequests.push(request);
  assert.equal(new URL(request.url).pathname,'/version.json');
  return new Response(JSON.stringify({version:manifestVersion}),{status:200,headers:{'content-type':'application/json'}});
}};
const response=await worker.fetch(new Request('https://qa.velocity-apex.test/api/health'),{ASSETS:assets},{});
assert.equal(response.status,200);
assert.deepEqual(await response.json(),{ok:true,protocol:77,version:manifestVersion});
assert.equal(assetRequests.length,1);
assert.equal(assetRequests[0].headers.get('cache-control'),'no-cache');

const missing=await worker.fetch(new Request('https://qa.velocity-apex.test/api/health'),{ASSETS:{fetch:async()=>new Response('missing',{status:404})}},{});
assert.equal(missing.status,503);
assert.equal((await missing.json()).error,'APP_VERSION_UNAVAILABLE');

const invalid=await worker.fetch(new Request('https://qa.velocity-apex.test/api/health'),{ASSETS:{fetch:async()=>new Response(JSON.stringify({version:'next'}),{status:200})}},{});
assert.equal(invalid.status,503);
assert.equal((await invalid.json()).error,'APP_VERSION_UNAVAILABLE');
console.log('worker health version PASS: reads deployed manifest, rejects missing or invalid version, no hard-coded release version');
