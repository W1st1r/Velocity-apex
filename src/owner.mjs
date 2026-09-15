import {CARS} from './car-catalog.mjs';
import {currentSession,requireAdmin,ensureAdminSchema,ensureRewardSchema,ensureSocialSchema,accountDetail,audit,mutateTargetSave,banResponse} from './auth.mjs';
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const schema=new WeakMap();
export async function ensureOwner(env){if(!env.DB)return;let p=schema.get(env.DB);if(!p){p=env.DB.batch([
 env.DB.prepare('CREATE TABLE IF NOT EXISTS owner_settings (id TEXT PRIMARY KEY,value TEXT NOT NULL)'),
 env.DB.prepare('CREATE TABLE IF NOT EXISTS owner_activity (user_id TEXT PRIMARY KEY,seen INTEGER NOT NULL,location TEXT NOT NULL,total_ms INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL)'),
 env.DB.prepare('CREATE TABLE IF NOT EXISTS owner_tuning (user_id TEXT NOT NULL,car_id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(user_id,car_id))'),
 env.DB.prepare('CREATE TABLE IF NOT EXISTS owner_grants (car_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL)'),
 env.DB.prepare('CREATE TABLE IF NOT EXISTS owner_results (race_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,won INTEGER NOT NULL,time_ms INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(race_id,user_id))')
 ]).catch(e=>{schema.delete(env.DB);throw e;});schema.set(env.DB,p);}await p;}
export async function settings(env){await ensureOwner(env);const row=await env.DB.prepare("SELECT value FROM owner_settings WHERE id='config'").first();return row?JSON.parse(row.value):{maintenance:false,cars:{}};}
export async function maintenanceGate(env,request){if(!env.DB)return null;const cfg=await settings(env);if(!cfg.maintenance)return null;const s=await currentSession(env,request);return s?.user.isAdmin?null:json({error:'MAINTENANCE',message:'Технические работы. Вход временно закрыт.'},503);}
export async function recordResult(env,raceId,userId,kind,won,time){if(!env.DB||!userId)return;await ensureOwner(env);await env.DB.prepare('INSERT OR IGNORE INTO owner_results VALUES (?,?,?,?,?,?)').bind(raceId,userId,kind,won?1:0,Math.max(0,Math.round(time)),Date.now()).run();}
async function rooms(env,path,body){return Promise.all(Array.from({length:6},async(_,i)=>{const server='city-0'+(i+1);const r=await env.ROOMS.get(env.ROOMS.idFromName('FREE:'+server)).fetch(new Request('https://room.internal'+path,{method:'POST',body:JSON.stringify(body)}));if(!r.ok)throw Error('ROOM_UNAVAILABLE');return {server,...await r.json()};}));}
export async function ownerRequest(request,env,url){
 if(!url.pathname.startsWith('/api/owner/'))return null;if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
 try{
 await ensureOwner(env);await ensureAdminSchema(env);await ensureRewardSchema(env);await ensureSocialSchema(env);
 if(request.method!=='GET'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'ORIGIN_REJECTED'},403);
 const session=await currentSession(env,request);if(!session)return json({error:'AUTH_REQUIRED'},401);const banned=await banResponse(env,session.user);if(banned)return banned;
 const cfg=await settings(env),id=session.user.id,t=Date.now();
 if(url.pathname==='/api/owner/runtime'&&request.method==='POST'){
  if(cfg.maintenance&&!session.user.isAdmin)return json({error:'MAINTENANCE'},503);
  const b=await request.json(),locations=['menu','garage','shop','racing','drift','online','freeroam','settings','owner','paused'];const location=locations.includes(b.location)?b.location:'menu';
  await env.DB.prepare(`INSERT INTO owner_activity VALUES (?,?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET total_ms=total_ms+CASE WHEN ?>seen AND ?-seen<=45000 THEN ?-seen ELSE 0 END,seen=MAX(seen,?),location=?`).bind(id,t,location,t,t,t,t,t,location).run();
  const grants=(await env.DB.prepare('SELECT car_id FROM owner_grants').all()).results||[];
  // Grant lazily to every account, including accounts offline at the time of issuance.
  if(grants.length){const d=await accountDetail(env,id);if(grants.some(g=>!d.save.ownedLiveries.includes(g.car_id)))await mutateTargetSave(env,id,s=>{s.ownedLiveries=Array.from(new Set([...(s.ownedLiveries||['apexLime']),...grants.map(g=>g.car_id)]));});}
  const tuning=(await env.DB.prepare('SELECT car_id,value FROM owner_tuning WHERE user_id=?').bind(id).all()).results||[];
  return json({ok:true,cars:cfg.cars||{},tuning:Object.fromEntries(tuning.map(x=>[x.car_id,JSON.parse(x.value)])),maintenance:cfg.maintenance});
 }
 if(url.pathname==='/api/owner/race'&&request.method==='POST'){
  if(cfg.maintenance&&!session.user.isAdmin)return json({error:'MAINTENANCE'},503);
  const b=await request.json();if(!/^[a-z0-9:-]{8,100}$/i.test(b.raceId||'')||!['solo','drift'].includes(b.kind)||!Number.isFinite(b.time)||b.time<1000||b.time>86400000)return json({error:'INVALID_RACE'},400);
  await recordResult(env,'client:'+b.raceId,id,b.kind,b.won===true,b.time);return json({ok:true});
 }
 const access=await requireAdmin(env,request);if(access.error)return access.error;
 if(url.pathname==='/api/owner/summary'&&request.method==='GET'){
  const active=(await env.DB.prepare('SELECT a.user_id,u.username,a.location FROM owner_activity a JOIN users u ON u.id=a.user_id WHERE a.seen>?').bind(t-45000).all()).results||[];
  const live=await rooms(env,'/free/owner-status',{}),ids=new Set(active.map(x=>x.user_id));let guests=0;for(const r of live)for(const p of r.players){if(p.userId)ids.add(p.userId);else guests++;}
  return json({ok:true,online:ids.size+guests,maintenance:!!cfg.maintenance,cars:Object.fromEntries(Object.entries(CARS).map(([k,v])=>[k,{...v,...cfg.cars?.[k]}])),live,updatedAt:t});
 }
 if(url.pathname==='/api/owner/maintenance'&&request.method==='POST'){
  const b=await request.json();if(typeof b.enabled!=='boolean')return json({error:'INVALID_VALUE'},400);cfg.maintenance=b.enabled;
  await env.DB.prepare("INSERT INTO owner_settings VALUES ('config',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(JSON.stringify(cfg)).run();
  await audit(env,id,null,'maintenance',{enabled:b.enabled});if(b.enabled)await rooms(env,'/free/owner-kick',{maintenance:true});return json({ok:true,maintenance:b.enabled});
 }
 const profile=url.pathname.match(/^\/api\/owner\/profile\/([0-9a-f-]{16,64})$/i);
 if(profile&&request.method==='GET'){
  const uid=profile[1],detail=await accountDetail(env,uid);if(!detail)return json({error:'USER_NOT_FOUND'},404);
  const activity=await env.DB.prepare('SELECT * FROM owner_activity WHERE user_id=?').bind(uid).first();
  const live=await rooms(env,'/free/owner-status',{}),server=live.find(r=>r.players.some(p=>p.userId===uid))?.server||null;
  const raw=await env.DB.prepare('SELECT save_json FROM player_saves WHERE user_id=?').bind(uid).first();const save=raw?JSON.parse(raw.save_json):{};
  const stats=await env.DB.prepare("SELECT COUNT(*) AS races,SUM(CASE WHEN kind='drag' AND won=1 THEN 1 ELSE 0 END) AS wins,SUM(CASE WHEN kind='drag' AND won=0 THEN 1 ELSE 0 END) AS losses,MIN(CASE WHEN kind='drag' THEN time_ms END) AS bestDrag FROM owner_results WHERE user_id=?").bind(uid).first();
  const friends=(await env.DB.prepare('SELECT u.username FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low=? THEN f.user_high ELSE f.user_low END WHERE f.user_low=? OR f.user_high=?').bind(uid,uid,uid).all()).results||[];
  const promos=(await env.DB.prepare('SELECT p.code,r.redeemed_at FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE r.user_id=? ORDER BY r.redeemed_at DESC').bind(uid).all()).results||[];
  const inviter=await env.DB.prepare('SELECT u.username FROM referrals r JOIN users u ON u.id=r.inviter_user_id WHERE r.invited_user_id=?').bind(uid).first();
  const history=(await env.DB.prepare('SELECT action,details,created_at FROM admin_audit WHERE target_user_id=? OR (target_user_id IS NULL AND action=\'grant_all\') ORDER BY created_at DESC LIMIT 200').bind(uid).all()).results||[];
  const bans=(await env.DB.prepare('SELECT reason,created_at,expires_at,revoked_at FROM account_bans WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(uid).all()).results||[];
  return json({ok:true,...detail,activity,online:!!server||!!activity&&activity.seen>t-45000,server,stats,friends,promos,inviter,history,bans,carUpgrades:save.carUpgrades||{},bestLap:save.bestLap||null,bestScore:save.bestScore||null});
 }
 const kick=url.pathname.match(/^\/api\/owner\/kick\/([0-9a-f-]{16,64})$/i);
 if(kick&&request.method==='POST'){const d=await accountDetail(env,kick[1]);if(!d)return json({error:'USER_NOT_FOUND'},404);if(d.user.isAdmin)return json({error:'ADMIN_ACCOUNT_PROTECTED'},403);const result=await rooms(env,'/free/owner-kick',{userId:kick[1]});await audit(env,id,kick[1],'kick',{});return json({ok:true,kicked:result.reduce((n,r)=>n+r.kicked,0)});}
 const car=url.pathname.match(/^\/api\/owner\/car\/([\w-]+)$/);
 if(car&&request.method==='POST'){
  const carId=car[1];if(!CARS[carId])return json({error:'INVALID_CAR'},400);const b=await request.json();
  if(b.action==='grantAll'){await env.DB.prepare('INSERT INTO owner_grants VALUES (?,?) ON CONFLICT(car_id) DO UPDATE SET created_at=excluded.created_at').bind(carId,t).run();await audit(env,id,null,'grant_all',{carId});return json({ok:true});}
  if(b.action==='grant'){const d=await mutateTargetSave(env,String(b.userId||id),s=>{s.ownedLiveries=Array.from(new Set([...(s.ownedLiveries||['apexLime']),carId]));});if(d.error)return json(d,400);await audit(env,id,String(b.userId||id),'resource',{kind:'car',id:carId,action:'grant'});return json({ok:true});}
  const v=b.values;if(!v||typeof v!=='object')return json({error:'INVALID_VALUE'},400);const clean={};
  const ranges={price:[0,999999999],maxSpeed:[1,100000],accel:[1,100000],brakePower:[1,100000],turnRate:[.01,100],drift:[.05,20]};
  for(const [k,[min,max]] of Object.entries(ranges))if(k in v){if(typeof v[k]!=='number'||!Number.isFinite(v[k])||v[k]<min||v[k]>max)return json({error:'INVALID_'+k,range:[min,max]},400);clean[k]=v[k];}
  if(b.action==='personal'){const uid=String(b.userId||id);if(!await accountDetail(env,uid))return json({error:'USER_NOT_FOUND'},404);delete clean.price;await env.DB.prepare('INSERT INTO owner_tuning VALUES (?,?,?) ON CONFLICT(user_id,car_id) DO UPDATE SET value=excluded.value').bind(uid,carId,JSON.stringify(clean)).run();await audit(env,id,uid,'personal_tuning',{carId,...clean});return json({ok:true});}
  if(b.action==='resetPersonal'){await env.DB.prepare('DELETE FROM owner_tuning WHERE user_id=? AND car_id=?').bind(String(b.userId||id),carId).run();await audit(env,id,String(b.userId||id),'personal_tuning_reset',{carId});return json({ok:true});}
  if(b.action!=='save')return json({error:'INVALID_ACTION'},400);
  if('category' in v){if(!['basic','sport','premium','rare','legendary','lux'].includes(v.category))return json({error:'INVALID_CATEGORY'},400);clean.category=v.category;}
  for(const k of ['enabled','unavailable','limited'])if(k in v){if(typeof v[k]!=='boolean')return json({error:'INVALID_VALUE'},400);clean[k]=v[k];}
  if(carId==='apexLime'&&(clean.enabled===false||clean.unavailable===true))return json({error:'SYSTEM_CAR_PROTECTED'},400);
  if(v.upgrades){clean.upgrades={};for(const k of ['speed','acceleration','brakes']){const u=v.upgrades[k];if(!u||!Number.isFinite(u.step)||u.step<0||u.step>10||!Number.isFinite(u.priceFactor)||u.priceFactor<0||u.priceFactor>100)return json({error:'INVALID_UPGRADES'},400);clean.upgrades[k]={step:u.step,priceFactor:u.priceFactor};}}
  cfg.cars={...cfg.cars,[carId]:{...cfg.cars?.[carId],...clean}};await env.DB.prepare("INSERT INTO owner_settings VALUES ('config',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(JSON.stringify(cfg)).run();await audit(env,id,null,'car_settings',{carId,...clean});return json({ok:true});
 }
 return json({error:'NOT_FOUND'},404);
 }catch(e){console.error('owner',e);return json({error:'OWNER_SERVER_ERROR'},500);}
}

export async function playerLimits(env,p){
 if(!env.DB)return {speed:650,yaw:20};const cfg=await settings(env),c={...CARS[p.liveryId],...cfg.cars?.[p.liveryId]};
 const row=p.userId?await env.DB.prepare('SELECT value FROM owner_tuning WHERE user_id=? AND car_id=?').bind(p.userId,p.liveryId).first():null;
 const personal=row?JSON.parse(row.value):{};return {speed:Math.max(650,(personal.maxSpeed??((c.maxSpeed||555)*(1+5*(c.upgrades?.speed?.step??.03))))*1.1),yaw:Math.max(20,(personal.turnRate??c.turnRate??2.4)*10)};
}
