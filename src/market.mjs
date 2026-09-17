import {currentSession,mutateTargetSave,accountDetail,banResponse} from './auth.mjs';
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
const safeUpgrades=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

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
  return {upgrades};
}
function giveCar(save,carId,upgrades={}){
  if(!Array.isArray(save.ownedLiveries))save.ownedLiveries=['apexLime'];
  if(save.ownedLiveries.includes(carId))return {error:'CAR_ALREADY_OWNED'};
  save.ownedLiveries.push(carId);
  if(!save.carUpgrades||typeof save.carUpgrades!=='object'||Array.isArray(save.carUpgrades))save.carUpgrades={};
  if(Object.keys(safeUpgrades(upgrades)).length)save.carUpgrades[carId]=safeUpgrades(upgrades);
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
  const mapListing=r=>({id:r.id,carId:r.car_id,car:publicCar(r.car_id),price:Number(r.price)||0,upgrades:parseUpgrades(r.upgrades_json),seller:'@'+r.seller_username,mine:r.seller_user_id===userId,createdAt:Number(r.created_at)||0});
  const mapOrder=r=>({id:r.id,carId:r.car_id,car:publicCar(r.car_id),price:Number(r.price)||0,buyer:'@'+r.buyer_username,mine:r.buyer_user_id===userId,createdAt:Number(r.created_at)||0});
  const mapHistory=r=>({id:r.id,kind:r.kind,carId:r.car_id,car:publicCar(r.car_id),price:Number(r.price)||0,buyer:'@'+r.buyer_username,seller:'@'+r.seller_username,side:r.buyer_user_id===userId?'buy':'sell',upgrades:parseUpgrades(r.upgrades_json),createdAt:Number(r.created_at)||0});
  return {ok:true,balance:detail?.save?.credits||0,listings:(listings.results||[]).map(mapListing),buyOrders:(orders.results||[]).map(mapOrder),history:(history.results||[]).map(mapHistory)};
}

async function restoreCar(env,userId,carId,upgrades){
  return mutateTargetSave(env,userId,save=>{if(Array.isArray(save.ownedLiveries)&&save.ownedLiveries.includes(carId))return {carId,already:true};return giveCar(save,carId,upgrades);});
}
async function refund(env,userId,amount){return mutateTargetSave(env,userId,save=>changeCredits(save,amount));}

async function createListing(env,userId,body){
  const carId=String(body?.carId||''),price=priceOf(body?.price);if(!marketableCar(carId))return json({error:'INVALID_CAR'},400);if(!price)return json({error:'INVALID_PRICE'},400);
  const active=await env.DB.prepare("SELECT id FROM market_sell_listings WHERE seller_user_id=? AND car_id=? AND status='active' LIMIT 1").bind(userId,carId).first();if(active)return json({error:'ALREADY_LISTED'},409);
  const taken=await mutateTargetSave(env,userId,save=>takeCar(save,carId));if(taken.error)return json({error:taken.error},taken.error==='SAVE_CONFLICT'?409:400);
  const id=crypto.randomUUID(),t=now(),upgrades=safeUpgrades(taken.result?.upgrades);
  try{await env.DB.prepare("INSERT INTO market_sell_listings (id,seller_user_id,car_id,price,upgrades_json,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)").bind(id,userId,carId,price,JSON.stringify(upgrades),t,t).run();}
  catch(e){await restoreCar(env,userId,carId,upgrades);throw e;}
  return json({ok:true,id},201);
}

async function cancelListing(env,userId,id){
  const row=await env.DB.prepare("SELECT * FROM market_sell_listings WHERE id=? AND seller_user_id=? AND status='active' LIMIT 1").bind(id,userId).first();if(!row)return json({error:'LISTING_NOT_FOUND'},404);
  const t=now(),claimed=await env.DB.prepare("UPDATE market_sell_listings SET status='processing',updated_at=? WHERE id=? AND seller_user_id=? AND status='active'").bind(t,id,userId).run();if(Number(claimed?.meta?.changes||0)!==1)return json({error:'LISTING_UNAVAILABLE'},409);
  const restored=await restoreCar(env,userId,row.car_id,parseUpgrades(row.upgrades_json));
  if(restored.error){await env.DB.prepare("UPDATE market_sell_listings SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:restored.error},409);}
  await env.DB.prepare("UPDATE market_sell_listings SET status='cancelled',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();
  return json({ok:true});
}

async function buyListing(env,buyerId,id){
  const row=await env.DB.prepare("SELECT * FROM market_sell_listings WHERE id=? AND status='active' LIMIT 1").bind(id).first();if(!row)return json({error:'LISTING_NOT_FOUND'},404);if(row.seller_user_id===buyerId)return json({error:'CANNOT_BUY_OWN'},400);
  const claimed=await env.DB.prepare("UPDATE market_sell_listings SET status='processing',updated_at=? WHERE id=? AND status='active'").bind(now(),id).run();if(Number(claimed?.meta?.changes||0)!==1)return json({error:'LISTING_UNAVAILABLE'},409);
  const upgrades=parseUpgrades(row.upgrades_json),price=Number(row.price)||0;
  const buyer=await mutateTargetSave(env,buyerId,save=>{const credit=changeCredits(save,-price);if(credit.error)return credit;const car=giveCar(save,row.car_id,upgrades);if(car.error){changeCredits(save,price);return car;}return {price,carId:row.car_id,before:credit.before,after:credit.after};});
  if(buyer.error){await env.DB.prepare("UPDATE market_sell_listings SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:buyer.error},buyer.error==='INSUFFICIENT_CREDITS'?400:409);}
  const seller=await mutateTargetSave(env,row.seller_user_id,save=>changeCredits(save,price));
  if(seller.error){
    await mutateTargetSave(env,buyerId,save=>{if(Array.isArray(save.ownedLiveries)&&save.ownedLiveries.includes(row.car_id)){takeCar(save,row.car_id);}return changeCredits(save,price);});
    await env.DB.prepare("UPDATE market_sell_listings SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:'TRADE_RETRY'},409);
  }
  const t=now(),historyId=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("UPDATE market_sell_listings SET status='sold',buyer_user_id=?,sold_at=?,updated_at=? WHERE id=? AND status='processing'").bind(buyerId,t,t,id),
    env.DB.prepare("INSERT INTO market_history (id,kind,source_id,car_id,price,buyer_user_id,seller_user_id,upgrades_json,created_at) VALUES (?,'listing',?,?,?,?,?,?,?)").bind(historyId,id,row.car_id,price,buyerId,row.seller_user_id,row.upgrades_json||'{}',t)
  ]);
  try{
    const meta={transactionId:historyId,listingId:id,carId:row.car_id,upgrades,buyerBalanceBefore:Number(buyer.result?.before)||0,buyerBalanceAfter:Number(buyer.result?.after)||0,sellerBalanceBefore:Number(seller.result?.before)||0,sellerBalanceAfter:Number(seller.result?.after)||0};
    await Promise.all([
      writeGameLog(env,{category:'purchases',eventType:'market_purchase',actorUserId:buyerId,actorRole:'PLAYER',targetUserId:row.seller_user_id,source:'MARKET',subject:row.car_id,amount:price,currency:'CR',relatedId:historyId,metadata:meta,createdAt:t}),
      writeGameLog(env,{category:'sales',eventType:'market_sale',actorUserId:row.seller_user_id,actorRole:'PLAYER',targetUserId:buyerId,source:'MARKET',subject:row.car_id,amount:price,currency:'CR',relatedId:historyId,metadata:meta,createdAt:t})
    ]);
  }catch(e){console.error('market log',e);}
  return json({ok:true});
}

async function createBuyOrder(env,buyerId,body){
  const carId=String(body?.carId||''),price=priceOf(body?.price);if(!marketableCar(carId))return json({error:'INVALID_CAR'},400);if(!price)return json({error:'INVALID_PRICE'},400);
  const active=await env.DB.prepare("SELECT id FROM market_buy_orders WHERE buyer_user_id=? AND car_id=? AND status='active' LIMIT 1").bind(buyerId,carId).first();if(active)return json({error:'ORDER_EXISTS'},409);
  const reserved=await mutateTargetSave(env,buyerId,save=>{if(Array.isArray(save.ownedLiveries)&&save.ownedLiveries.includes(carId))return {error:'CAR_ALREADY_OWNED'};return changeCredits(save,-price);});
  if(reserved.error)return json({error:reserved.error},reserved.error==='INSUFFICIENT_CREDITS'?400:409);
  const id=crypto.randomUUID(),t=now();
  try{await env.DB.prepare("INSERT INTO market_buy_orders (id,buyer_user_id,car_id,price,status,created_at,updated_at) VALUES (?,?,?,?,'active',?,?)").bind(id,buyerId,carId,price,t,t).run();}
  catch(e){await refund(env,buyerId,price);throw e;}
  try{await writeGameLog(env,{category:'purchases',eventType:'market_buy_order',actorUserId:buyerId,actorRole:'PLAYER',targetUserId:buyerId,source:'MARKET',subject:carId,amount:price,currency:'CR',relatedId:id,metadata:{orderId:id,carId,balanceBefore:Number(reserved.result?.before)||0,balanceAfter:Number(reserved.result?.after)||0,status:'reserved'},createdAt:t});}catch(e){console.error('market order log',e);}
  return json({ok:true,id},201);
}

async function cancelBuyOrder(env,buyerId,id){
  const row=await env.DB.prepare("SELECT * FROM market_buy_orders WHERE id=? AND buyer_user_id=? AND status='active' LIMIT 1").bind(id,buyerId).first();if(!row)return json({error:'ORDER_NOT_FOUND'},404);
  const claimed=await env.DB.prepare("UPDATE market_buy_orders SET status='processing',updated_at=? WHERE id=? AND buyer_user_id=? AND status='active'").bind(now(),id,buyerId).run();if(Number(claimed?.meta?.changes||0)!==1)return json({error:'ORDER_UNAVAILABLE'},409);
  const returned=await refund(env,buyerId,Number(row.price)||0);if(returned.error){await env.DB.prepare("UPDATE market_buy_orders SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:returned.error},409);}
  await env.DB.prepare("UPDATE market_buy_orders SET status='cancelled',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({ok:true});
}

async function fulfillBuyOrder(env,sellerId,id){
  const row=await env.DB.prepare("SELECT * FROM market_buy_orders WHERE id=? AND status='active' LIMIT 1").bind(id).first();if(!row)return json({error:'ORDER_NOT_FOUND'},404);if(row.buyer_user_id===sellerId)return json({error:'CANNOT_FILL_OWN'},400);
  const claimed=await env.DB.prepare("UPDATE market_buy_orders SET status='processing',updated_at=? WHERE id=? AND status='active'").bind(now(),id).run();if(Number(claimed?.meta?.changes||0)!==1)return json({error:'ORDER_UNAVAILABLE'},409);
  const taken=await mutateTargetSave(env,sellerId,save=>takeCar(save,row.car_id));
  if(taken.error){await env.DB.prepare("UPDATE market_buy_orders SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:taken.error},400);}
  const upgrades=safeUpgrades(taken.result?.upgrades),price=Number(row.price)||0;
  const buyer=await mutateTargetSave(env,row.buyer_user_id,save=>giveCar(save,row.car_id,upgrades));
  if(buyer.error){await restoreCar(env,sellerId,row.car_id,upgrades);await env.DB.prepare("UPDATE market_buy_orders SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:buyer.error},409);}
  const seller=await mutateTargetSave(env,sellerId,save=>changeCredits(save,price));
  if(seller.error){
    await mutateTargetSave(env,row.buyer_user_id,save=>{if(Array.isArray(save.ownedLiveries)&&save.ownedLiveries.includes(row.car_id))takeCar(save,row.car_id);return {rolledBack:true};});
    await restoreCar(env,sellerId,row.car_id,upgrades);await env.DB.prepare("UPDATE market_buy_orders SET status='active',updated_at=? WHERE id=? AND status='processing'").bind(now(),id).run();return json({error:'TRADE_RETRY'},409);
  }
  const t=now(),historyId=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("UPDATE market_buy_orders SET status='filled',seller_user_id=?,filled_at=?,updated_at=? WHERE id=? AND status='processing'").bind(sellerId,t,t,id),
    env.DB.prepare("INSERT INTO market_history (id,kind,source_id,car_id,price,buyer_user_id,seller_user_id,upgrades_json,created_at) VALUES (?,'buy_order',?,?,?,?,?,?,?)").bind(historyId,id,row.car_id,price,row.buyer_user_id,sellerId,JSON.stringify(upgrades),t)
  ]);
  try{
    const meta={transactionId:historyId,orderId:id,carId:row.car_id,upgrades,reservedAtOrder:true,sellerBalanceBefore:Number(seller.result?.before)||0,sellerBalanceAfter:Number(seller.result?.after)||0};
    await Promise.all([
      writeGameLog(env,{category:'purchases',eventType:'market_purchase',actorUserId:row.buyer_user_id,actorRole:'PLAYER',targetUserId:sellerId,source:'MARKET',subject:row.car_id,amount:price,currency:'CR',relatedId:historyId,metadata:meta,createdAt:t}),
      writeGameLog(env,{category:'sales',eventType:'market_sale',actorUserId:sellerId,actorRole:'PLAYER',targetUserId:row.buyer_user_id,source:'MARKET',subject:row.car_id,amount:price,currency:'CR',relatedId:historyId,metadata:meta,createdAt:t})
    ]);
  }catch(e){console.error('market log',e);}
  return json({ok:true});
}

export async function handleMarketRequest(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/market'))return null;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  try{
    await ensureMarketSchema(env);if(request.method!=='GET'&&!sameOrigin(request))return json({error:'ORIGIN_REJECTED'},403);
    const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;const userId=session.user.id;
    if(url.pathname==='/api/market'&&request.method==='GET')return json(await overview(env,userId));
    if(url.pathname==='/api/market/listings'&&request.method==='POST')return createListing(env,userId,await request.json());
    if(url.pathname==='/api/market/buy-orders'&&request.method==='POST')return createBuyOrder(env,userId,await request.json());
    let match=url.pathname.match(/^\/api\/market\/listings\/([0-9a-f-]{16,64})\/(buy|cancel)$/i);
    if(match&&request.method==='POST')return match[2]==='buy'?buyListing(env,userId,match[1]):cancelListing(env,userId,match[1]);
    match=url.pathname.match(/^\/api\/market\/buy-orders\/([0-9a-f-]{16,64})\/(fulfill|cancel)$/i);
    if(match&&request.method==='POST')return match[2]==='fulfill'?fulfillBuyOrder(env,userId,match[1]):cancelBuyOrder(env,userId,match[1]);
    return json({error:'NOT_FOUND'},404);
  }catch(e){console.error('market error',e);return json({error:'SERVER_ERROR'},500);}
}
