import {applyAccountTransaction} from './account-transactions.mjs';
import {currentSession,accountDetail,banResponse,readBody} from './auth.mjs';
import {CARS} from './car-catalog.mjs';
import {writeGameLog} from './logs.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const now=()=>Date.now();
const MAX_PRICE=100000000;
const MAX_CREDITS=1000000000;
let schemaPromise=null;
const sameOrigin=request=>{const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;};
const validId=value=>/^[0-9a-f-]{16,64}$/i.test(String(value||''));
const priceOf=value=>{const n=Math.floor(Number(value));return Number.isSafeInteger(n)&&n>=1&&n<=MAX_PRICE?n:0;};
const carOf=id=>Object.prototype.hasOwnProperty.call(CARS,id)?CARS[id]:null;
const marketableCar=id=>id!=='apexLime'&&!!carOf(id);
const parseUpgrades=text=>{try{const v=JSON.parse(text||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}};
const safeUpgrades=value=>Object.fromEntries(['speed','acceleration','brakes'].filter(k=>Number.isFinite(Number(value?.[k]))).map(k=>[k,Math.max(0,Math.min(5,Math.floor(Number(value[k]))))]));

async function ensureMarketSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS market_sell_listings (
        id TEXT PRIMARY KEY,
        seller_user_id TEXT NOT NULL,
        car_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        upgrades_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        buyer_user_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        sold_at INTEGER,
        FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE SET NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_market_sell_active ON market_sell_listings(status,created_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_market_sell_seller ON market_sell_listings(seller_user_id,status,created_at DESC)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS market_buy_orders (
        id TEXT PRIMARY KEY,
        buyer_user_id TEXT NOT NULL,
        car_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        seller_user_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        filled_at INTEGER,
        FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE SET NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_market_buy_active ON market_buy_orders(status,created_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_market_buy_buyer ON market_buy_orders(buyer_user_id,status,created_at DESC)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS market_history (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        car_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        buyer_user_id TEXT NOT NULL,
        seller_user_id TEXT NOT NULL,
        upgrades_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_market_history_buyer ON market_history(buyer_user_id,created_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_market_history_seller ON market_history(seller_user_id,created_at DESC)')
    ]);
  })().catch(e=>{schemaPromise=null;throw e;});
  return schemaPromise;
}

function takeCar(save,carId){
  if(!Array.isArray(save.ownedLiveries))save.ownedLiveries=['apexLime'];
  if(!save.ownedLiveries.includes(carId))return {error:'CAR_NOT_OWNED'};
  const upgrades=safeUpgrades(save.carUpgrades?.[carId]);
  save.ownedLiveries=save.ownedLiveries.filter(id=>id!==carId);
  if(!save.ownedLiveries.includes('apexLime'))save.ownedLiveries.unshift('apexLime');
  if(save.selectedLivery===carId)save.selectedLivery='apexLime';
  if(save.carUpgrades&&typeof save.carUpgrades==='object')delete save.carUpgrades[carId];
  const customization=save.carCustomizations?.[carId]?structuredClone(save.carCustomizations[carId]):null;if(save.carCustomizations)delete save.carCustomizations[carId];
  return {upgrades,customization};
}
function giveCar(save,carId,upgrades={}){
  if(!Array.isArray(save.ownedLiveries))save.ownedLiveries=['apexLime'];
  if(save.ownedLiveries.includes(carId))return {error:'CAR_ALREADY_OWNED'};
  save.ownedLiveries.push(carId);
  if(!save.carUpgrades||typeof save.carUpgrades!=='object'||Array.isArray(save.carUpgrades))save.carUpgrades={};
  if(Object.keys(safeUpgrades(upgrades)).length)save.carUpgrades[carId]=safeUpgrades(upgrades);
  if(upgrades?._style){if(!save.carCustomizations||typeof save.carCustomizations!=='object')save.carCustomizations={};save.carCustomizations[carId]=structuredClone(upgrades._style);}
  return {carId};
}
function changeCredits(save,delta){
  const before=Math.max(0,Math.floor(Number(save.credits)||0)),after=before+delta;
  if(after<0)return {error:'INSUFFICIENT_CREDITS'};
  if(after>MAX_CREDITS)return {error:'CREDIT_LIMIT'};
  save.credits=after;return {before,after,delta};
}
function publicCar(id){const c=carOf(id);return c?{id,name:c.name,category:c.category,basePrice:c.price||0}:null;}

async function overview(env,userId){
  const [listings,orders,history,detail]=await Promise.all([
    env.DB.prepare(`SELECT l.id,l.seller_user_id,l.car_id,l.price,l.upgrades_json,l.created_at,u.username AS seller_username
      FROM market_sell_listings l JOIN users u ON u.id=l.seller_user_id
      WHERE l.status='active' ORDER BY l.created_at DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT o.id,o.buyer_user_id,o.car_id,o.price,o.created_at,u.username AS buyer_username
      FROM market_buy_orders o JOIN users u ON u.id=o.buyer_user_id
      WHERE o.status='active' ORDER BY o.created_at DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT h.id,h.kind,h.source_id,h.car_id,h.price,h.buyer_user_id,h.seller_user_id,h.upgrades_json,h.created_at,
        bu.username AS buyer_username,su.username AS seller_username
      FROM market_history h JOIN users bu ON bu.id=h.buyer_user_id JOIN users su ON su.id=h.seller_user_id
      WHERE h.buyer_user_id=? OR h.seller_user_id=? ORDER BY h.created_at DESC LIMIT 120`).bind(userId,userId).all(),
    accountDetail(env,userId)
  ]);
  const mapListing=r=>({id:r.id,carId:r.car_id,car:publicCar(r.car_id),price:Number(r.price)||0,upgrades:safeUpgrades(parseUpgrades(r.upgrades_json)),seller:'@'+r.seller_username,mine:r.seller_user_id===userId,createdAt:Number(r.created_at)||0});
  const mapOrder=r=>({id:r.id,carId:r.car_id,car:publicCar(r.car_id),price:Number(r.price)||0,buyer:'@'+r.buyer_username,mine:r.buyer_user_id===userId,createdAt:Number(r.created_at)||0});
  const mapHistory=r=>({id:r.id,kind:r.kind,carId:r.car_id,car:publicCar(r.car_id),price:Number(r.price)||0,buyer:'@'+r.buyer_username,seller:'@'+r.seller_username,side:r.buyer_user_id===userId?'buy':'sell',upgrades:safeUpgrades(parseUpgrades(r.upgrades_json)),createdAt:Number(r.created_at)||0});
  return {ok:true,balance:detail?.save?.credits||0,listings:(listings.results||[]).map(mapListing),buyOrders:(orders.results||[]).map(mapOrder),history:(history.results||[]).map(mapHistory)};
}

async function completeMarket(env,actorId,out,{created=false,event=''}={}){
  if(out.error)return json({error:out.error},['INVALID_CAR','INVALID_PRICE','CAR_NOT_OWNED','INSUFFICIENT_CREDITS'].includes(out.error)?400:409);
  if(!out.replay){const r=out.result;try{
    if(r.buyerId&&r.sellerId){await writeGameLog(env,{category:'purchases',eventType:'market_purchase',actorUserId:r.buyerId,actorRole:'PLAYER',targetUserId:r.sellerId,source:'MARKET',subject:r.carId,amount:r.price,currency:'CR',relatedId:out.transactionId,metadata:{sourceId:r.id},createdAt:out.updatedAt});await writeGameLog(env,{category:'sales',eventType:'market_sale',actorUserId:r.sellerId,actorRole:'PLAYER',targetUserId:r.buyerId,source:'MARKET',subject:r.carId,amount:r.price,currency:'CR',relatedId:out.transactionId,metadata:{sourceId:r.id},createdAt:out.updatedAt});}
    else if(event)await writeGameLog(env,{category:'purchases',eventType:event,actorUserId:actorId,targetUserId:actorId,actorRole:'PLAYER',source:'MARKET',subject:r.carId,amount:r.price||0,currency:'CR',relatedId:out.transactionId});
  }catch(e){console.error('market log',e);}}
  return json({...out,id:out.result.id},created&&!out.replay?201:200);
}
const failed=error=>({error});
const packCar=taken=>({...safeUpgrades(taken.upgrades),...(taken.customization?{_style:taken.customization}:{})});
const activeGuard=(table,id)=>({guardSql:`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND status='active')`,guardArgs:[id]});

async function createListing(env,userId,body){
 const carId=String(body?.carId||''),price=priceOf(body?.price);if(!marketableCar(carId))return json({error:'INVALID_CAR'},400);if(!price)return json({error:'INVALID_PRICE'},400);
 const id=crypto.randomUUID();const out=await applyAccountTransaction(env,{actorId:userId,requestId:body.requestId,type:`market:list:${carId}:${price}`,accountIds:[userId],plan:async saves=>{
  if(await env.DB.prepare("SELECT id FROM market_sell_listings WHERE seller_user_id=? AND car_id=? AND status='active'").bind(userId,carId).first())return failed('ALREADY_LISTED');
  const save=saves[userId],taken=takeCar(save,carId);if(taken.error)return taken;const payload=JSON.stringify(packCar(taken));
  return {result:{id,carId,price},guardSql:"NOT EXISTS(SELECT 1 FROM market_sell_listings WHERE seller_user_id=? AND car_id=? AND status='active')",guardArgs:[userId,carId],statements:({time,receiptSql,receiptArgs})=>[
   env.DB.prepare("INSERT INTO market_sell_listings(id,seller_user_id,car_id,price,upgrades_json,status,created_at,updated_at) SELECT ?,?,?,?,?,'active',?,? WHERE "+receiptSql).bind(id,userId,carId,price,payload,time,time,...receiptArgs)
  ]};
 }});return completeMarket(env,userId,out,{created:true});
}
async function cancelListing(env,userId,id,body){
 const out=await applyAccountTransaction(env,{actorId:userId,requestId:body.requestId,type:'market:cancel-list:'+id,accountIds:[userId],plan:async saves=>{
  const row=await env.DB.prepare("SELECT * FROM market_sell_listings WHERE id=? AND seller_user_id=? AND status='active'").bind(id,userId).first();if(!row)return failed('LISTING_NOT_FOUND');const restored=giveCar(saves[userId],row.car_id,parseUpgrades(row.upgrades_json));if(restored.error)return restored;
  return {...activeGuard('market_sell_listings',id),result:{id,carId:row.car_id},statements:({time,receiptSql,receiptArgs})=>[env.DB.prepare("UPDATE market_sell_listings SET status='cancelled',updated_at=? WHERE id=? AND status='active' AND "+receiptSql).bind(time,id,...receiptArgs)]};
 }});return completeMarket(env,userId,out);
}
async function buyListing(env,buyerId,id,body){
 const initial=await env.DB.prepare('SELECT * FROM market_sell_listings WHERE id=?').bind(id).first();if(!initial)return json({error:'LISTING_NOT_FOUND'},404);if(initial.seller_user_id===buyerId)return json({error:'CANNOT_BUY_OWN'},400);
 const sellerId=initial.seller_user_id,out=await applyAccountTransaction(env,{actorId:buyerId,requestId:body.requestId,type:'market:buy:'+id,accountIds:[buyerId,sellerId],plan:async saves=>{
  const row=await env.DB.prepare("SELECT * FROM market_sell_listings WHERE id=? AND status='active'").bind(id).first();if(!row)return failed('LISTING_UNAVAILABLE');const price=priceOf(row.price);if(!price)return failed('INVALID_PRICE');
  const debit=changeCredits(saves[buyerId],-price);if(debit.error)return debit;const given=giveCar(saves[buyerId],row.car_id,parseUpgrades(row.upgrades_json));if(given.error)return given;const credit=changeCredits(saves[sellerId],price);if(credit.error)return credit;
  return {...activeGuard('market_sell_listings',id),result:{id,carId:row.car_id,price,buyerId,sellerId},statements:({transactionId,time,receiptSql,receiptArgs})=>[
   env.DB.prepare("UPDATE market_sell_listings SET status='sold',buyer_user_id=?,sold_at=?,updated_at=? WHERE id=? AND status='active' AND "+receiptSql).bind(buyerId,time,time,id,...receiptArgs),
   env.DB.prepare("INSERT INTO market_history(id,kind,source_id,car_id,price,buyer_user_id,seller_user_id,upgrades_json,created_at) SELECT ?,'listing',?,?,?,?,?,?,? WHERE "+receiptSql).bind(transactionId,id,row.car_id,price,buyerId,sellerId,row.upgrades_json||'{}',time,...receiptArgs)
  ]};
 }});return completeMarket(env,buyerId,out);
}
async function createBuyOrder(env,buyerId,body){
 const carId=String(body?.carId||''),price=priceOf(body?.price);if(!marketableCar(carId))return json({error:'INVALID_CAR'},400);if(!price)return json({error:'INVALID_PRICE'},400);const id=crypto.randomUUID();
 const out=await applyAccountTransaction(env,{actorId:buyerId,requestId:body.requestId,type:`market:order:${carId}:${price}`,accountIds:[buyerId],plan:async saves=>{
  if(await env.DB.prepare("SELECT id FROM market_buy_orders WHERE buyer_user_id=? AND car_id=? AND status='active'").bind(buyerId,carId).first())return failed('ORDER_EXISTS');const save=saves[buyerId];if(save.ownedLiveries?.includes(carId))return failed('CAR_ALREADY_OWNED');const debit=changeCredits(save,-price);if(debit.error)return debit;
  return {result:{id,carId,price},guardSql:"NOT EXISTS(SELECT 1 FROM market_buy_orders WHERE buyer_user_id=? AND car_id=? AND status='active')",guardArgs:[buyerId,carId],statements:({time,receiptSql,receiptArgs})=>[env.DB.prepare("INSERT INTO market_buy_orders(id,buyer_user_id,car_id,price,status,created_at,updated_at) SELECT ?,?,?,?,'active',?,? WHERE "+receiptSql).bind(id,buyerId,carId,price,time,time,...receiptArgs)]};
 }});return completeMarket(env,buyerId,out,{created:true,event:'market_buy_order'});
}
async function cancelBuyOrder(env,buyerId,id,body){
 const out=await applyAccountTransaction(env,{actorId:buyerId,requestId:body.requestId,type:'market:cancel-order:'+id,accountIds:[buyerId],plan:async saves=>{
  const row=await env.DB.prepare("SELECT * FROM market_buy_orders WHERE id=? AND buyer_user_id=? AND status='active'").bind(id,buyerId).first();if(!row)return failed('ORDER_NOT_FOUND');const returned=changeCredits(saves[buyerId],Number(row.price));if(returned.error)return returned;
  return {...activeGuard('market_buy_orders',id),result:{id,carId:row.car_id},statements:({time,receiptSql,receiptArgs})=>[env.DB.prepare("UPDATE market_buy_orders SET status='cancelled',updated_at=? WHERE id=? AND status='active' AND "+receiptSql).bind(time,id,...receiptArgs)]};
 }});return completeMarket(env,buyerId,out);
}
async function fulfillBuyOrder(env,sellerId,id,body){
 const initial=await env.DB.prepare('SELECT * FROM market_buy_orders WHERE id=?').bind(id).first();if(!initial)return json({error:'ORDER_NOT_FOUND'},404);if(initial.buyer_user_id===sellerId)return json({error:'CANNOT_FILL_OWN'},400);const buyerId=initial.buyer_user_id;
 const out=await applyAccountTransaction(env,{actorId:sellerId,requestId:body.requestId,type:'market:fulfill:'+id,accountIds:[sellerId,buyerId],plan:async saves=>{
  const row=await env.DB.prepare("SELECT * FROM market_buy_orders WHERE id=? AND status='active'").bind(id).first();if(!row)return failed('ORDER_UNAVAILABLE');const price=priceOf(row.price);if(!price)return failed('INVALID_PRICE');
  const taken=takeCar(saves[sellerId],row.car_id);if(taken.error)return taken;const payload=packCar(taken),given=giveCar(saves[buyerId],row.car_id,payload);if(given.error)return given;const credit=changeCredits(saves[sellerId],price);if(credit.error)return credit;
  return {...activeGuard('market_buy_orders',id),result:{id,carId:row.car_id,price,buyerId,sellerId},statements:({transactionId,time,receiptSql,receiptArgs})=>[
   env.DB.prepare("UPDATE market_buy_orders SET status='filled',seller_user_id=?,filled_at=?,updated_at=? WHERE id=? AND status='active' AND "+receiptSql).bind(sellerId,time,time,id,...receiptArgs),
   env.DB.prepare("INSERT INTO market_history(id,kind,source_id,car_id,price,buyer_user_id,seller_user_id,upgrades_json,created_at) SELECT ?,'buy_order',?,?,?,?,?,?,? WHERE "+receiptSql).bind(transactionId,id,row.car_id,price,buyerId,sellerId,JSON.stringify(payload),time,...receiptArgs)
  ]};
 }});return completeMarket(env,sellerId,out);
}

export async function handleMarketRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/market'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    await ensureMarketSchema(env);if(request.method!=='GET'&&!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;const userId=session.user.id;
    if(url.pathname==='/api/market'&&request.method==='GET')return json(await overview(env,userId));
    const body=request.method==='POST'?await readBody(request):{};if(request.method==='POST'&&!/^[\w-]{16,80}$/.test(body?.requestId||''))return json({error:'CLIENT_UPDATE_REQUIRED',updateRequired:true},409);
    if(url.pathname==='/api/market/listings'&&request.method==='POST')return await createListing(env,userId,body);
    if(url.pathname==='/api/market/buy-orders'&&request.method==='POST')return await createBuyOrder(env,userId,body);
    let match=url.pathname.match(/^\/api\/market\/listings\/([0-9a-f-]{16,64})\/(buy|cancel)$/i);
    if(match&&request.method==='POST')return await (match[2]==='buy'?buyListing(env,userId,match[1],body):cancelListing(env,userId,match[1],body));
    match=url.pathname.match(/^\/api\/market\/buy-orders\/([0-9a-f-]{16,64})\/(fulfill|cancel)$/i);
    if(match&&request.method==='POST')return await (match[2]==='fulfill'?fulfillBuyOrder(env,userId,match[1],body):cancelBuyOrder(env,userId,match[1],body));
    return json({error:'NOT_FOUND'},404);
  }catch(e){console.error('market error',e);return json({error:'SERVER_ERROR'},500);}
}
