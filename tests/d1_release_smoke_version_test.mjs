import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(readFileSync(path.join(root,'public/version.json'),'utf8')).version;
const html=readFileSync(path.join(root,'public/index.html'),'utf8');
let authenticated=false;
const json=(res,status,payload,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(payload));};
const server=createServer((req,res)=>{
  const cookie=(req.headers.cookie||'').includes('va_session=qa-smoke');
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
  if(req.method==='GET'&&req.url==='/version.json')return json(res,200,JSON.parse(readFileSync(path.join(root,'public/version.json'),'utf8')));
  if(req.method==='GET'&&req.url==='/api/health')return json(res,200,{ok:true,version});
  if(req.method==='GET'&&req.url==='/api/account/save')return cookie?json(res,200,{ok:true,save:{ownedLiveries:['apexLime']},revision:1}):json(res,401,{error:'AUTH_REQUIRED'});
  if(req.method==='GET'&&req.url==='/api/friends')return cookie?json(res,200,{friends:[]}):json(res,401,{error:'AUTH_REQUIRED'});
  if(req.method==='POST'&&req.url==='/api/economy/races/start')return json(res,401,{error:'AUTH_REQUIRED'});
  if(req.method==='POST'&&req.url==='/api/auth/login'){authenticated=true;return json(res,200,{ok:true,user:{username:'qa-smoke'}},{'set-cookie':'va_session=qa-smoke; Path=/; HttpOnly; SameSite=Lax'});}
  if(req.method==='GET'&&req.url==='/api/auth/me')return json(res,200,{authenticated:cookie&&authenticated,user:cookie&&authenticated?{username:'qa-smoke'}:null});
  if(req.method==='GET'&&req.url.startsWith('/api/economy/races/ghosts?'))return cookie?json(res,200,{ok:true,global:[],friends:[]}):json(res,401,{error:'AUTH_REQUIRED'});
  if(req.method==='POST'&&req.url==='/api/auth/logout'){authenticated=false;return json(res,200,{ok:true});}
  res.writeHead(404);res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address(),origin='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['scripts/d1-release-safety.mjs','smoke',origin],{cwd:root,env:{...process.env,V77_SMOKE_USERNAME:'qa-smoke',V77_SMOKE_PASSWORD:'test-only'}});
let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',v=>stdout+=v);child.stderr.setEncoding('utf8').on('data',v=>stderr+=v);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
await new Promise(resolve=>server.close(resolve));
assert.equal(code,0,stdout+'\n'+stderr);
assert.ok(stdout.includes('V'+version+' smoke passed'),stdout);
console.log('release smoke version regression PASS: dynamic HTML/version/health identity plus anonymous gates, login, garage, friends, Ghost Racing, logout');
