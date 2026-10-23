import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/worker.mjs';

const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
for(const path of ['/','/index.html','/version.json'])assert.ok(config.assets.run_worker_first.includes(path),`critical versioned shell path must reach Worker: ${path}`);

const env={ASSETS:{fetch:async()=>new Response('asset',{headers:{'content-type':'text/html','cache-control':'public, max-age=3600'}})}};
for(const path of ['/','/index.html','/version.json']){
  const response=await worker.fetch(new Request(`https://velocity.test${path}`),env);
  assert.equal(response.status,200,path);
  assert.equal(response.headers.get('cache-control'),'no-store, no-cache, must-revalidate, max-age=0',path);
  assert.equal(await response.text(),'asset',path);
}
const css=await worker.fetch(new Request('https://velocity.test/css/app.css'),env);
assert.equal(css.headers.get('cache-control'),'public, max-age=3600','unversioned asset cache policy remains unchanged');
console.log('v203 asset cache policy: shell/manifest routed through Worker and non-cacheable; other assets unchanged');
