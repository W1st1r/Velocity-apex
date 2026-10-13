const now=()=>Date.now();
const jsonSafe=value=>{try{return JSON.stringify(value??{}).slice(0,12000);}catch{return '{}';}};
const clean=(value,max=500)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const validCategory=value=>['blocks','mutes','joins','purchases','sales','system','chat'].includes(value)?value:'system';
const logId=()=>`LOG-${crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()}`;
let schemaPromise=null;

export async function ensureGameLogs(env){
  if(!env?.DB)return;
  if(schemaPromise)return schemaPromise;
  schemaPromise=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_logs (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id TEXT,
      actor_username TEXT,
      actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
      target_user_id TEXT,
      target_username TEXT,
      server_id TEXT,
      source TEXT,
      subject TEXT,
      message TEXT,
      reason TEXT,
      amount INTEGER,
      currency TEXT,
      related_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_logs_category_created ON game_logs(category,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_logs_actor_created ON game_logs(actor_user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_logs_target_created ON game_logs(target_user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_logs_server_created ON game_logs(server_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_logs_event_created ON game_logs(event_type,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_logs_related ON game_logs(related_id,created_at DESC)')
  ]).catch(e=>{schemaPromise=null;throw e;});
  return schemaPromise;
}

async function usernames(env,ids){
  const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return new Map();
  const placeholders=unique.map(()=>'?').join(','),r=await env.DB.prepare(`SELECT id,username FROM users WHERE id IN (${placeholders})`).bind(...unique).all();
  return new Map((r.results||[]).map(row=>[row.id,row.username]));
}

export async function writeGameLog(env,event={}){
  if(!env?.DB)return null;
  await ensureGameLogs(env);
  const actorId=clean(event.actorUserId,80)||null,targetId=clean(event.targetUserId,80)||null;
  let actorUsername=clean(event.actorUsername,64)||null,targetUsername=clean(event.targetUsername,64)||null;
  if((actorId&&!actorUsername)||(targetId&&!targetUsername)){
    try{const names=await usernames(env,[actorId,targetId]);if(actorId&&!actorUsername)actorUsername=names.get(actorId)||null;if(targetId&&!targetUsername)targetUsername=names.get(targetId)||null;}catch{}
  }
  let actorRole=clean(event.actorRole,32).toUpperCase();
  if(!actorRole)actorRole=!actorId?'SYSTEM':String(actorUsername||'').toLowerCase()==='w1st1r'?'OWNER':'ADMIN';
  const id=clean(event.id,80)||logId(),createdAt=Number.isFinite(Number(event.createdAt))?Math.max(0,Math.floor(Number(event.createdAt))):now();
  await env.DB.prepare(`INSERT OR IGNORE INTO game_logs
    (id,category,event_type,actor_user_id,actor_username,actor_role,target_user_id,target_username,server_id,source,subject,message,reason,amount,currency,related_id,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,validCategory(event.category),clean(event.eventType,64)||'event',actorId,actorUsername,actorRole,targetId,targetUsername,clean(event.serverId,80)||null,clean(event.source,100)||null,clean(event.subject,500)||null,clean(event.message,2000)||null,clean(event.reason,500)||null,Number.isFinite(Number(event.amount))?Math.round(Number(event.amount)):null,clean(event.currency,24)||null,clean(event.relatedId,100)||null,jsonSafe(event.metadata),createdAt).run();
  return id;
}

function toPublic(row){let metadata={};try{metadata=JSON.parse(row.metadata_json||'{}');}catch{}
  return {id:row.id,category:row.category,eventType:row.event_type,actorUserId:row.actor_user_id||null,actorUsername:row.actor_username||'',actorRole:row.actor_role||'SYSTEM',targetUserId:row.target_user_id||null,targetUsername:row.target_username||'',serverId:row.server_id||'',source:row.source||'',subject:row.subject||'',message:row.message||'',reason:row.reason||'',amount:row.amount===null||row.amount===undefined?null:Number(row.amount),currency:row.currency||'',relatedId:row.related_id||'',metadata,createdAt:Number(row.created_at)||0};
}

export async function queryGameLogs(env,params={}){
  await ensureGameLogs(env);
  const where=[],bind=[];
  const category=String(params.category||'all');if(category!=='all'&&['blocks','mutes','joins','purchases','sales','system','chat'].includes(category)){where.push('category=?');bind.push(category);}
  const q=clean(params.q,120).toLowerCase();if(q){const like='%'+q.replace(/[%_]/g,m=>'\\'+m)+'%';where.push(`(lower(COALESCE(actor_username,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(target_username,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(actor_user_id,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(target_user_id,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(event_type,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(subject,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(message,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(reason,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(related_id,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(server_id,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(metadata_json,'')) LIKE ? ESCAPE '\\')`);for(let i=0;i<11;i++)bind.push(like);}
  const server=clean(params.server,80).toLowerCase();if(server){where.push("lower(COALESCE(server_id,'')) LIKE ?");bind.push('%'+server+'%');}
  const eventType=clean(params.eventType,64).toLowerCase();if(eventType){where.push("lower(event_type)=?");bind.push(eventType);}
  const actorRole=clean(params.actorRole,32).toUpperCase();if(actorRole&&actorRole!=='ALL'){if(actorRole==='ADMIN'){where.push("actor_role LIKE 'ADMIN%'");}else{where.push('actor_role=?');bind.push(actorRole);}}
  const from=Number(params.from)||0,to=Number(params.to)||0,before=Number(params.before)||0;
  if(from>0){where.push('created_at>=?');bind.push(Math.floor(from));}if(to>0){where.push('created_at<=?');bind.push(Math.floor(to));}if(before>0){where.push('created_at<?');bind.push(Math.floor(before));}
  const limit=Math.max(10,Math.min(100,Math.floor(Number(params.limit)||50))),sql=`SELECT * FROM game_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT ?`;bind.push(limit+1);
  const r=await env.DB.prepare(sql).bind(...bind).all(),rows=r.results||[],hasMore=rows.length>limit,items=rows.slice(0,limit).map(toPublic),nextBefore=hasMore&&items.length?items[items.length-1].createdAt:0;
  return {items,hasMore,nextBefore};
}

export function classifyAuditAction(action){
  const a=String(action||'').toLowerCase();
  if(a==='ban'||a==='unban'||a.includes('block'))return 'blocks';
  if(a==='mute'||a==='unmute')return 'mutes';
  return 'system';
}

const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const num=v=>Math.max(0,Math.floor(Number(v)||0));

export function detectSavePurchases(beforeRaw,afterRaw){
  const before=obj(beforeRaw),after=obj(afterRaw),balanceBefore=num(before.credits),balanceAfter=num(after.credits),spent=Math.max(0,balanceBefore-balanceAfter);if(spent<=0)return null;
  const items=[];
  const beforeCars=new Set(arr(before.ownedLiveries)),beforeFx=new Set(arr(before.ownedEffects));
  for(const id of arr(after.ownedLiveries))if(!beforeCars.has(id))items.push({kind:'car',id});
  for(const id of arr(after.ownedEffects))if(!beforeFx.has(id))items.push({kind:'effect',id});
  const bCases=obj(before.caseInventory),aCases=obj(after.caseInventory);for(const [id,value] of Object.entries(aCases)){const delta=num(value)-num(bCases[id]);if(delta>0)items.push({kind:'case',id,quantity:delta});}
  const bUp=obj(before.carUpgrades),aUp=obj(after.carUpgrades);for(const [carId,levels] of Object.entries(aUp)){for(const [kind,level] of Object.entries(obj(levels))){const old=num(obj(bUp[carId])[kind]),next=num(level);if(next>old)items.push({kind:'upgrade',id:kind,carId,from:old,to:next});}}
  const bCustom=obj(before.carCustomization),aCustom=obj(after.carCustomization);for(const [carId,custom] of Object.entries(aCustom)){const prev=obj(bCustom[carId]),next=obj(custom),oldColors=new Set(arr(prev.ownedColors)),oldVinyls=new Set(arr(prev.ownedVinyls));for(const id of arr(next.ownedColors))if(!oldColors.has(id)&&id!=='stock')items.push({kind:'color',id,carId});for(const id of arr(next.ownedVinyls))if(!oldVinyls.has(id)&&id!=='none')items.push({kind:'vinyl',id,carId});}
  if(!items.length)return null;
  return {balanceBefore,balanceAfter,spent,items};
}
