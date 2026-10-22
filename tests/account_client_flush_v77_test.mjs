import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRaceRuntime} from '../public/js/race-runtime-v77.mjs';
class Element extends EventTarget{constructor(){super();const set=new Set();this.classList={add:(...v)=>v.forEach(x=>set.add(x)),remove:(...v)=>v.forEach(x=>set.delete(x)),toggle:(v,on)=>on===undefined?(set.has(v)?set.delete(v):set.add(v)):on?set.add(v):set.delete(v),contains:v=>set.has(v)};this.style={};this.dataset={};this.value='';this.textContent='';}querySelector(){return new Element();}querySelectorAll(){return [];}append(){}appendChild(){}replaceChildren(){}setAttribute(){}removeAttribute(){}focus(){}}
const elements=new Map(),document=new EventTarget();document.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};document.body=new Element();document.createElement=()=>new Element();const window=new EventTarget();window.Racing=createRaceRuntime(1);const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
let server={...window.Racing.normalizeSave({credits:1200,ownedLiveries:['apexLime']}),muted:false},revision=1,releaseFirst=null;const posts=[],timers=new Set(),intervals=new Set();
const timeout=(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);id.unref();return id;},interval=(fn,ms)=>{const id=setInterval(fn,ms);intervals.add(id);id.unref();return id;};
async function fetch(path,options={}){
 if(path==='/api/auth/me')return Response.json({authenticated:true,user:{id:'flush-user',username:'tester',displayName:'Tester'}});
 if(path==='/api/account/save'){
  if(options.body){const body=JSON.parse(options.body);posts.push(body);assert(!('save' in body));assert(!('credits' in body.preferences));if(posts.length===1)await new Promise(resolve=>releaseFirst=resolve);
   if(body.revision!==revision)return Response.json({error:'SAVE_CONFLICT',revision,save:server},{status:409});server={...server,...body.preferences};revision++;
  }return Response.json({save:server,revision});
 }return Response.json({ok:true});
}
const source=fs.readFileSync(new URL('../public/js/account.js',import.meta.url),'utf8').replace("'./account-preferences-v77.mjs'",JSON.stringify(new URL('../public/js/account-preferences-v77.mjs',import.meta.url).href));
const run=new Function('window','document','fetch','localStorage','sessionStorage','addEventListener','setInterval','clearInterval','setTimeout','clearTimeout','location',source);
try{
 run(window,document,fetch,storage,storage,window.addEventListener.bind(window),interval,clearInterval,timeout,clearTimeout,{hash:'',pathname:'/',search:''});
 const waitFor=async condition=>{const end=Date.now()+2000;while(!condition()){if(Date.now()>end)throw Error('client flush fixture timed out');await new Promise(r=>setTimeout(r,1));}};
 await waitFor(()=>window.VelocityAccount?.ready);const account=window.VelocityAccount;
 window.addEventListener('velocity-account-save',e=>{account.queueSave({...e.detail.save});account.queueSave({...e.detail.save});});
 account.queueSave({...server,muted:false});const first=account.flushSave();await waitFor(()=>posts.length===1&&releaseFirst);
 account.queueSave({...server,credits:999999999,ownedLiveries:['apexLime','apollo-evo'],careerUnlocked:50,muted:true});const second=account.flushSave();releaseFirst();
 assert.equal(await first,true);assert.equal(await second,true);assert.equal(server.muted,true,'both flush callers must wait for the later queued preferences');assert.equal(server.credits,1200);assert.deepEqual(server.ownedLiveries,['apexLime']);assert.equal(posts.length,2,'concurrent callers share each actual write');
 window.dispatchEvent(new Event('pagehide'));await waitFor(()=>posts.length===3);assert.deepEqual(Object.keys(posts[2]).sort(),['preferences','revision']);assert.equal(server.credits,1200);
 console.log('account_client_flush_v77_test: real account client coalesces writes, drains newer settings, strips economic snapshots and uses preference-only pagehide');
}finally{for(const id of timers)clearTimeout(id);for(const id of intervals)clearInterval(id);}
