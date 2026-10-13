import {currentSession,banResponse} from './auth.mjs';
import {writeGameLog} from './logs.mjs';

const enc=new TextEncoder();
const dec=new TextDecoder();
const now=()=>Date.now();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const text=(body='OK',status=200)=>new Response(body,{status,headers:{'content-type':'text/plain;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const MAX_CREDITS=999999999;
const ORDER_TTL_MS=24*60*60*1000;

export const PAYMENT_PACKAGES=Object.freeze([
  Object.freeze({id:'cr_5000',title:'STARTER',credits:5000,rub:99,badge:''}),
  Object.freeze({id:'cr_12000',title:'STREET',credits:12000,rub:199,badge:''}),
  Object.freeze({id:'cr_35000',title:'SPORT',credits:35000,rub:499,badge:'ПОПУЛЯРНО'}),
  Object.freeze({id:'cr_80000',title:'APEX',credits:80000,rub:999,badge:'+ БОНУС'}),
  Object.freeze({id:'cr_180000',title:'LEGEND',credits:180000,rub:1990,badge:'MAX'})
]);
const PACKAGES=new Map(PAYMENT_PACKAGES.map(x=>[x.id,x]));
let schemaPromise=null;

export async function ensurePaymentSchema(env){
  if(!env?.DB)return;
  if(schemaPromise)return schemaPromise;
  schemaPromise=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      package_id TEXT NOT NULL,
      rub_amount INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','expired','cancelled')),
      operation_id TEXT UNIQUE,
      notification_type TEXT,
      received_amount TEXT,
      withdraw_amount TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      paid_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON payment_orders(user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created ON payment_orders(status,created_at DESC)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS payment_receipts (
      operation_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      credited INTEGER NOT NULL DEFAULT 0,
      notification_type TEXT,
      withdraw_amount TEXT,
      received_amount TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE CASCADE
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payment_receipts_order ON payment_receipts(order_id,created_at DESC)')
  ]).catch(e=>{schemaPromise=null;throw e;});
  return schemaPromise;
}

function paymentConfig(env,url){
  const receiver=String(env?.YOOMONEY_RECEIVER||'').trim();
  const secret=String(env?.YOOMONEY_NOTIFICATION_SECRET||'').trim();
  const collectionUrl=String(env?.YOOMONEY_COLLECTION_URL||'').trim();
  return {
    receiver:/^\d{11,20}$/.test(receiver)?receiver:'',
    secret,
    collectionUrl:/^https:\/\/(?:yoomoney\.ru|yoomoney\.com)\//i.test(collectionUrl)?collectionUrl:'',
    webhookUrl:url?`${url.origin}/api/payments/yoomoney`:''
  };
}
const publicPackage=p=>({id:p.id,title:p.title,credits:p.credits,rub:p.rub,badge:p.badge});
const orderId=()=>`APEX-${crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase()}`;

async function requireUser(env,request){
  const session=await currentSession(env,request);if(!session)return {error:json({error:'AUTH_REQUIRED'},401)};
  const banned=await banResponse(env,session.user);if(banned)return {error:banned};
  return {session};
}
function sameOrigin(request,url){const origin=request.headers.get('origin');return !origin||origin===url.origin;}

function rfc3986(value){return encodeURIComponent(String(value??'')).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());}
export function canonicalNotification(params){
  return [...params.entries()].filter(([key])=>key!=='sign').sort((a,b)=>a[0]===b[0]?String(a[1]).localeCompare(String(b[1])):a[0].localeCompare(b[0])).map(([key,value])=>`${key}=${rfc3986(value)}`).join('&');
}
async function hmacHex(secret,message){
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)));
  return [...sig].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function safeEqualHex(a,b){
  a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(a.length!==b.length||!a.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
export async function verifyYooMoneyNotification(params,secret){
  const supplied=String(params.get('sign')||'').toLowerCase();if(!/^[0-9a-f]{64}$/.test(supplied)||!secret)return false;
  const expected=await hmacHex(secret,canonicalNotification(params));return safeEqualHex(supplied,expected);
}
function amountCents(value){
  const s=String(value??'').trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
  const [whole,frac='']=s.split('.');const cents=Number(whole)*100+Number((frac+'00').slice(0,2));return Number.isSafeInteger(cents)?cents:null;
}
function safeRaw(params){const out={};for(const [k,v] of params.entries()){if(k==='sign')continue;out[String(k).slice(0,80)]=String(v).slice(0,500);}try{return JSON.stringify(out).slice(0,12000);}catch{return '{}';}}

async function handleWebhook(request,env,url){
  if(request.method!=='POST')return text('METHOD_NOT_ALLOWED',405);
  await ensurePaymentSchema(env);
  const body=await request.text();
  const params=new URLSearchParams(body);
  // ЮMoney's "Test" button can send an empty notification. Accept it without crediting anything.
  if(!params.get('operation_id')&&!params.get('label')&&!params.get('sign'))return text('OK');
  const cfg=paymentConfig(env,url);if(!cfg.secret)return text('CONFIG_REQUIRED',503);
  if(!(await verifyYooMoneyNotification(params,cfg.secret)))return text('INVALID_SIGNATURE',403);
  const operationId=String(params.get('operation_id')||'').trim().slice(0,120);
  const label=String(params.get('label')||'').trim().slice(0,80);
  const notificationType=String(params.get('notification_type')||'').trim().slice(0,40);
  const currency=String(params.get('currency')||'');
  const codepro=String(params.get('codepro')||'false');
  const unaccepted=String(params.get('unaccepted')||'false');
  const withdrawRaw=String(params.get('withdraw_amount')||'');
  const amountRaw=String(params.get('amount')||'');
  if(!operationId||!label||currency!=='643'||codepro!=='false'||unaccepted!=='false'||!['p2p-incoming','card-incoming'].includes(notificationType))return text('IGNORED');
  const order=await env.DB.prepare('SELECT id,user_id,username,package_id,rub_amount,credits,status,operation_id,created_at FROM payment_orders WHERE id=? LIMIT 1').bind(label).first();
  if(!order)return text('IGNORED');
  if(order.status==='paid')return text('OK');
  if(order.status!=='pending')return text('IGNORED');
  if(now()-Number(order.created_at||0)>ORDER_TTL_MS){await env.DB.prepare("UPDATE payment_orders SET status='expired',updated_at=? WHERE id=? AND status='pending'").bind(now(),order.id).run();return text('IGNORED');}
  const withdrawCents=amountCents(withdrawRaw),expectedCents=Number(order.rub_amount)*100;
  if(withdrawCents===null||withdrawCents!==expectedCents)return text('AMOUNT_MISMATCH',400);
  const t=now(),raw=safeRaw(params);
  let writes;
  try{
    writes=await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO payment_receipts(operation_id,order_id,credited,notification_type,withdraw_amount,received_amount,raw_json,created_at)
        SELECT ?,id,0,?,?,?,?,? FROM payment_orders
        WHERE id=? AND status='pending' AND operation_id IS NULL AND rub_amount=?`).bind(operationId,notificationType,withdrawRaw,amountRaw,raw,t,order.id,order.rub_amount),
      env.DB.prepare(`INSERT OR IGNORE INTO player_saves(user_id,save_json,revision,created_at,updated_at)
        SELECT user_id,json_object('saveVersion',6,'credits',0,'ownedLiveries',json_array('apexLime'),'ownedEffects',json_array('standard'),'caseInventory',json_object(),'selectedLivery','apexLime','selectedEffect','standard'),1,?,?
        FROM payment_orders WHERE id=?`).bind(t,t,order.id),
      env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',MIN(?,COALESCE(json_extract(save_json,'$.credits'),0)+(SELECT credits FROM payment_orders WHERE id=?))),revision=revision+1,updated_at=?
        WHERE user_id=(SELECT user_id FROM payment_orders WHERE id=?)
          AND EXISTS(SELECT 1 FROM payment_receipts WHERE operation_id=? AND order_id=? AND credited=0)`).bind(MAX_CREDITS,order.id,t,order.id,operationId,order.id),
      env.DB.prepare('UPDATE payment_receipts SET credited=1 WHERE operation_id=? AND order_id=? AND credited=0').bind(operationId,order.id),
      env.DB.prepare(`UPDATE payment_orders SET status='paid',operation_id=?,notification_type=?,received_amount=?,withdraw_amount=?,paid_at=?,updated_at=?
        WHERE id=? AND status='pending' AND operation_id IS NULL
          AND EXISTS(SELECT 1 FROM payment_receipts WHERE operation_id=? AND order_id=? AND credited=1)`).bind(operationId,notificationType,amountRaw,withdrawRaw,t,t,order.id,operationId,order.id)
    ]);
  }catch(e){console.error('payment webhook batch',e);return text('RETRY',503);}
  const paid=Number(writes?.[4]?.meta?.changes||0)===1;
  if(paid){
    try{await writeGameLog(env,{category:'purchases',eventType:'yoomoney_purchase',actorUserId:order.user_id,actorUsername:order.username,actorRole:'PLAYER',targetUserId:order.user_id,targetUsername:order.username,source:'YOOMONEY',subject:`${Number(order.credits).toLocaleString('ru-RU')} CR`,message:'Автоматическое пополнение баланса через ЮMoney',amount:Number(order.rub_amount)||0,currency:'RUB',relatedId:order.id,metadata:{packageId:order.package_id,credits:Number(order.credits)||0,operationId,notificationType,withdrawAmount:withdrawRaw,receivedAmount:amountRaw},createdAt:t});}catch(e){console.error('payment log',e);}
  }
  return text('OK');
}

async function createOrder(request,env,url){
  if(!sameOrigin(request,url))return json({error:'ORIGIN_REJECTED'},403);
  const access=await requireUser(env,request);if(access.error)return access.error;
  const cfg=paymentConfig(env,url);if(!cfg.receiver||!cfg.secret)return json({error:'PAYMENTS_NOT_CONFIGURED',missing:{receiver:!cfg.receiver,notificationSecret:!cfg.secret},webhookUrl:cfg.webhookUrl},503);
  let body={};try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
  const pack=PACKAGES.get(String(body?.packageId||''));if(!pack)return json({error:'INVALID_PACKAGE'},400);
  const id=orderId(),t=now(),user=access.session.user;
  await ensurePaymentSchema(env);
  await env.DB.prepare(`INSERT INTO payment_orders(id,user_id,username,package_id,rub_amount,credits,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'pending',?,?)`).bind(id,user.id,user.username,pack.id,pack.rub,pack.credits,t,t).run();
  const successURL=`${url.origin}/?payment=success&order=${encodeURIComponent(id)}`;
  return json({ok:true,order:{id,status:'pending',package:publicPackage(pack),createdAt:t},form:{action:'https://yoomoney.ru/quickpay/confirm',method:'POST',fields:{receiver:cfg.receiver,'quickpay-form':'button',sum:String(pack.rub),label:id,successURL}}});
}
function publicOrder(row){return {id:row.id,packageId:row.package_id,rub:Number(row.rub_amount)||0,credits:Number(row.credits)||0,status:row.status,createdAt:Number(row.created_at)||0,paidAt:Number(row.paid_at)||0,operationId:row.operation_id||''};}

export async function handlePaymentRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/payments/'))return null;
  if(!env?.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    if(url.pathname==='/api/payments/yoomoney')return handleWebhook(request,env,url);
    await ensurePaymentSchema(env);
    if(url.pathname==='/api/payments/packages'&&request.method==='GET'){
      const access=await requireUser(env,request);if(access.error)return access.error;const cfg=paymentConfig(env,url);
      return json({ok:true,configured:!!(cfg.receiver&&cfg.secret),packages:PAYMENT_PACKAGES.map(publicPackage),collectionUrl:cfg.collectionUrl,webhookUrl:cfg.webhookUrl});
    }
    if(url.pathname==='/api/payments/create'&&request.method==='POST')return createOrder(request,env,url);
    if(url.pathname==='/api/payments/history'&&request.method==='GET'){
      const access=await requireUser(env,request);if(access.error)return access.error;
      await env.DB.prepare("UPDATE payment_orders SET status='expired',updated_at=? WHERE user_id=? AND status='pending' AND created_at<?").bind(now(),access.session.user.id,now()-ORDER_TTL_MS).run();
      const rows=await env.DB.prepare('SELECT * FROM payment_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(access.session.user.id).all();
      return json({ok:true,items:(rows.results||[]).map(publicOrder)});
    }
    const match=url.pathname.match(/^\/api\/payments\/order\/(APEX-[A-Z0-9]{16})$/);
    if(match&&request.method==='GET'){
      const access=await requireUser(env,request);if(access.error)return access.error;
      const row=await env.DB.prepare('SELECT * FROM payment_orders WHERE id=? AND user_id=? LIMIT 1').bind(match[1],access.session.user.id).first();if(!row)return json({error:'ORDER_NOT_FOUND'},404);
      return json({ok:true,order:publicOrder(row)});
    }
    return json({error:'NOT_FOUND'},404);
  }catch(e){console.error('payments',e);return json({error:'PAYMENT_SERVER_ERROR'},500);}
}
