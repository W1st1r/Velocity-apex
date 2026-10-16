import {lockRoomWager,settleRoomWager,readRoomWager} from './room-wager-escrow.mjs';
import {handleCrewRequest,crewIdentity,settleCrews,awardCrewRep} from './crews.mjs';
import {ownerRequest,maintenanceGate,recordResult,settings,playerLimits} from './owner.mjs';
import {handleAuthRequest,freeAccountIdentity} from './auth.mjs';
import {handleMarketRequest} from './market.mjs';
import {handleAdminSystemRequest,activeMute,staffOnlineLevel} from './admin-system.mjs';
import {getProgression,awardProgression,PROGRESSION_REWARDS,levelFromTotalExp} from './progression.mjs';
import {PROTOCOL_VERSION,generateRoomCode,normalizeRoomCode,validRoomCode,sanitizeNickname,validNickname,validSettings,normalizeSettings,validWager,validPlayerState,parseClientMessage,PLAYER_STATE_RATE_MS,RECONNECT_GRACE_MS,CONNECTION_HEARTBEAT_TIMEOUT_MS,CONNECTION_HEARTBEAT_SWEEP_MS,EMPTY_ROOM_TTL_MS,ROOM_TTL_MS} from './protocol.mjs';
import {writeGameLog} from './logs.mjs';
import {handlePaymentRequest} from './payments.mjs';
import {handleMediaRequest,mediaRole,markMediaEventRunning,settleMediaEvent,refundMediaEvent} from './media.mjs';
import {handleUpgradeRequest} from './upgrade.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}});
const now=()=>Date.now();
const token=()=>crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
const playerId=()=>crypto.randomUUID().slice(0,8);
const STYLE_COLORS=new Set(['stock','obsidian','arctic','apex-lime','velocity-red','electric-blue','royal-purple','sunset-orange','champagne','queen-pink']);
const STYLE_VINYLS=new Set(['none','racing-stripe','apex-cut','carbon-edge','neon-slash','heritage','velocity-wave']);
const safeLoadout=v=>({liveryId:typeof v?.liveryId==='string'&&v.liveryId.length<=40?v.liveryId:'apexLime',effectId:typeof v?.effectId==='string'&&v.effectId.length<=40?v.effectId:'standard',colorId:STYLE_COLORS.has(v?.colorId)?v.colorId:'stock',vinylId:STYLE_VINYLS.has(v?.vinylId)?v.vinylId:'none'});
const safeBalance=v=>Number.isInteger(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER?v:null;
const FREE_SERVERS=Object.freeze(['city-01','city-02','city-03']);
const FREE_MAX_PLAYERS=50;
const FREE_WORLD={w:5000,h:3000};
// Free Roam is tuned separately from 8-player race rooms. 14–17 Hz is enough
// for smooth interpolation while keeping a 50-player Durable Object comfortably below
// the message fan-out that caused micro-stutters in the old 20 Hz broadcast-all model.
const FREE_STATE_RATE_MS=60;
const FREE_FOOTBALL_STATE_RATE_MS=36;
const FREE_DRAG_STATE_RATE_MS=28;
const FREE_NEAR_RADIUS=1900;
const FREE_FAR_STATE_RATE_MS=240;
const FREE_RECONNECT_GRACE_MS=5000;
const FREE_HEARTBEAT_TIMEOUT_MS=6500;
const FREE_HEARTBEAT_SWEEP_MS=2000;
const FREE_DRAG_FINISH_X=4710;
const FREE_DRAG_Y_MIN=2510;
const FREE_DRAG_Y_MAX=2820;
const FREE_DRAG_SAMPLE_MAX_AGE_MS=900;
const FREE_DRAG_SAMPLE_FUTURE_MS=90;
const FREE_DRAG_PROGRESS_RATE_MS=45;
const FREE_DRAG_JOIN=Object.freeze({x:3120,y:2670,r:125,label:'AIRPORT DRAG'});
const FREE_GARAGE=Object.freeze({x:2675,y:654,r:125,access:{x:2590,y:475,w:170,h:135},apron:{x:2470,y:560,w:410,h:200},exitX:2675,exitY:535,exitAngle:-Math.PI/2,label:'GARAGE'});
const FREE_DRAG_WAGERS=Object.freeze([0,100,250,500,1000,2500,5000]);
const validFreeDragWager=v=>FREE_DRAG_WAGERS.includes(Number(v));
const validFreeName=v=>validNickname(v)||(typeof v==='string'&&/^@[a-z0-9_]{3,24}$/.test(v));
const FREE_DRIFT_DURATION_MS=90000;
const FREE_KOTH_DURATION_MS=240000;
const FREE_ACTIVITY_COUNTDOWN_MS=10000;
const FREE_ACTIVITY_WAIT_MS=120000;
const FREE_ACTIVITY_PROGRESS_MS=500;
const FREE_ONLINE_REWARD_MS=20*60*1000;
const FREE_DRIFT_ZONES=Object.freeze({
  // V40: Free Roam has one large authoritative drift zone only.
  harbor:{x:670,y:2310,r:320,label:'HARBOR DRIFT MEGAPARK'}
});
const FREE_KOTH_JOIN=Object.freeze({x:2320,y:1590,r:210,label:'MOTOR CLUB'});
const FREE_KOTH_ZONES=Object.freeze([
  {id:'downtown',x:2850,y:980,r:170,label:'DOWNTOWN'},
  {id:'industrial',x:1180,y:1260,r:175,label:'INDUSTRIAL'},
  {id:'harbor',x:720,y:2230,r:180,label:'HARBOR'},
  {id:'motor_club',x:2320,y:1590,r:170,label:'MOTOR CLUB'}
]);
const FREE_KOTH_SWITCH_MS=Object.freeze([0,55000,110000,165000,210000]);
const FREE_MINIGAME_COUNTDOWN_MS=8000;
const FREE_MINIGAME_WAIT_MS=150000;
const FREE_MINIGAME_PROGRESS_MS=100;
const FREE_FOOTBALL_PROGRESS_MS=50;
const FREE_FOOTBALL_BALL_RADIUS=30;
const FREE_FOOTBALL_GOAL_HALF=245;
const FREE_FOOTBALL_GOAL_DEPTH=100;
const FREE_FOOTBALL_CONTACT_RADIUS=78;
const FREE_FOOTBALL_MAX_BALL_SPEED=1050;
const FREE_MINIGAME_ARENA=Object.freeze({x:2500,y:1500,w:2500,h:1500,left:1250,right:3750,top:750,bottom:2250});
const FREE_MINIGAME_HUBS=Object.freeze({
  // Centers match the client city-map aprons; keep r aligned with the prompt.
  football:{x:1997.5,y:272.5,r:45,label:'APEX STADIUM'},
  checkpoint:{x:3337.5,y:860,r:45,label:'RUSH CENTER'},
  hot_potato:{x:745,y:1387.5,r:45,label:'BOMB ARENA'}
});
const FREE_MINIGAME_CONFIG=Object.freeze({
  football_3v3:{hub:'football',label:'MINI FOOTBALL 3×3',minPlayers:6,maxPlayers:6,durationMs:150000,teamSize:3,kind:'football'},
  football_5v5:{hub:'football',label:'MINI FOOTBALL 5×5',minPlayers:10,maxPlayers:10,durationMs:180000,teamSize:5,kind:'football'},
  checkpoint:{hub:'checkpoint',label:'CHECKPOINT RUSH',minPlayers:2,maxPlayers:8,durationMs:105000,kind:'checkpoint'},
  hot_potato:{hub:'hot_potato',label:'HOT POTATO',minPlayers:2,maxPlayers:8,durationMs:100000,kind:'hot_potato'},
  drag:{hub:'football',label:'MEDIA DRAG',minPlayers:2,maxPlayers:8,durationMs:120000,kind:'drag_event'}
});
const FREE_CHECKPOINTS=Object.freeze([
  {x:1550,y:980},{x:2500,y:860},{x:3450,y:980},{x:3480,y:1500},
  {x:3450,y:2020},{x:2500,y:2140},{x:1550,y:2020},{x:1520,y:1500},
  {x:2050,y:1180},{x:2950,y:1180},{x:2950,y:1820},{x:2050,y:1820}
]);
const insideCircle=(state,zone,extra=0)=>!!state&&Math.hypot(state.x-zone.x,state.y-zone.y)<=zone.r+extra;
const insideRect=(state,rect,pad=0)=>!!state&&!!rect&&state.x>=rect.x-pad&&state.x<=rect.x+rect.w+pad&&state.y>=rect.y-pad&&state.y<=rect.y+rect.h+pad;
const insideGarageZone=state=>insideRect(state,FREE_GARAGE.apron,34)||(Number(state?.y)>=525&&insideRect(state,FREE_GARAGE.access,26));
const angleDelta=(a,b)=>{let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return Math.abs(d);};

export default {
  async scheduled(event,env,ctx){ctx.waitUntil(settleCrews(env));},
  async fetch(request,env){
    const url=new URL(request.url);
    const owner=await ownerRequest(request,env,url);if(owner)return owner;
    const adminSystem=await handleAdminSystemRequest(request,env,url);if(adminSystem)return adminSystem;
    if(url.pathname==='/api/payments/yoomoney'){const payment=await handlePaymentRequest(request,env,url);if(payment)return payment;}
    if(url.pathname.startsWith('/api/')&&!['/api/auth/login','/api/auth/logout','/api/health','/api/payments/yoomoney'].includes(url.pathname)){const gate=await maintenanceGate(env,request);if(gate)return gate;}
    if(url.pathname==='/api/health')return json({ok:true,protocol:PROTOCOL_VERSION});
    const paymentResponse=await handlePaymentRequest(request,env,url);if(paymentResponse)return paymentResponse;
    const mediaResponse=await handleMediaRequest(request,env,url);if(mediaResponse)return mediaResponse;
    const upgradeResponse=await handleUpgradeRequest(request,env,url);if(upgradeResponse)return upgradeResponse;

    if(url.pathname==='/api/progression/me'&&request.method==='GET'){
      const identity=await freeAccountIdentity(env,request);
      if(identity.response)return identity.response;
      if(!identity.user)return json({authenticated:false,level:0});
      const progress=await getProgression(env,identity.user.id);
      return json({ok:true,authenticated:true,...progress});
    }
    if(url.pathname==='/api/free/servers'&&request.method==='GET'){
      const servers=await Promise.all(FREE_SERVERS.map(async(serverId)=>{try{const stub=env.ROOMS.get(env.ROOMS.idFromName('FREE:'+serverId)),r=await stub.fetch(new Request('https://room.internal/free/status'));const d=await r.json();return {id:serverId,name:'APEX CITY '+serverId.slice(-2),players:d.players||0,maxPlayers:FREE_MAX_PLAYERS,records:d.records||{}};}catch{return {id:serverId,name:'APEX CITY '+serverId.slice(-2),players:0,maxPlayers:FREE_MAX_PLAYERS,records:{}};}}));
      return json({ok:true,servers});
    }
    const fm=url.pathname.match(/^\/api\/free\/(city-0[1-3])\/(join|ws|leave)$/);
    if(fm){
      const serverId=fm[1],stub=env.ROOMS.get(env.ROOMS.idFromName('FREE:'+serverId));
      if(fm[2]==='join'&&request.method==='POST'){
        let body;try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
        const identity=await freeAccountIdentity(env,request);if(identity.response)return identity.response;if(!identity.user)return json({error:'AUTH_REQUIRED'},401);
        const progress=await getProgression(env,identity.user.id);
        const adminLevel=identity.user?await staffOnlineLevel(env,identity.user.id):0;
        const payload={name:identity.user?('@'+identity.user.username):body?.name,loadout:body?.loadout,crew:await crewIdentity(env,identity.user?.id),owner:identity.owner===true,adminLevel,media:!!(await mediaRole(env,identity.user?.id)),userId:identity.user?.id||null,progress};
        return stub.fetch(new Request('https://room.internal/free/join?serverId='+encodeURIComponent(serverId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));
      }
      if(fm[2]==='ws')return stub.fetch(new Request('https://room.internal/free/ws?serverId='+encodeURIComponent(serverId)+'&playerId='+encodeURIComponent(url.searchParams.get('playerId')||'')+'&token='+encodeURIComponent(url.searchParams.get('token')||''),{headers:request.headers}));
      if(fm[2]==='leave'&&request.method==='POST')return stub.fetch(new Request('https://room.internal/free/leave?serverId='+encodeURIComponent(serverId)+'&playerId='+encodeURIComponent(url.searchParams.get('playerId')||'')+'&token='+encodeURIComponent(url.searchParams.get('token')||''),{method:'POST'}));
    }
    const crewResponse=await handleCrewRequest(request,env,url);if(crewResponse)return crewResponse;
    const authResponse=await handleAuthRequest(request,env,url);if(authResponse)return authResponse;
    const marketResponse=await handleMarketRequest(request,env,url);if(marketResponse)return marketResponse;
    if(url.pathname==='/api/rooms/create'&&request.method==='POST'){
      let body;try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
      if(!validNickname(body?.name))return json({error:'INVALID_NAME'},400);
      const settings=normalizeSettings(body?.settings||{});if(!validSettings(settings))return json({error:'INVALID_SETTINGS'},400);
      const identity=await freeAccountIdentity(env,request);if(identity.response)return identity.response;if(!identity.user)return json({error:'AUTH_REQUIRED'},401);
      for(let i=0;i<12;i++){
        const code=generateRoomCode(),id=env.ROOMS.idFromName(code),stub=env.ROOMS.get(id);
        const resp=await stub.fetch(new Request('https://room.internal/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,userId:identity.user?.id||null,crew:await crewIdentity(env,identity.user?.id),owner:identity.owner===true,media:!!(await mediaRole(env,identity.user?.id)),adminLevel:identity.user?await staffOnlineLevel(env,identity.user.id):0,name:identity.user?'@'+identity.user.username:sanitizeNickname(body.name),settings,loadout:safeLoadout(body.loadout)})}));
        if(resp.status===409)continue;
        const result=await resp.json();return json(result,resp.status);
      }
      return json({error:'ROOM_CODE_EXHAUSTED'},503);
    }
    const m=url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/(join|ws)$/);
    if(m){
      const code=normalizeRoomCode(m[1]);if(!validRoomCode(code))return json({error:'INVALID_CODE'},400);
      const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
      if(m[2]==='join'&&request.method==='POST'){const identity=await freeAccountIdentity(env,request);if(identity.response)return identity.response;if(!identity.user)return json({error:'AUTH_REQUIRED'},401);const body=await request.json();return stub.fetch(new Request('https://room.internal/join',{method:'POST',body:JSON.stringify({...body,name:identity.user?'@'+identity.user.username:body.name,userId:identity.user?.id||null,crew:await crewIdentity(env,identity.user?.id),owner:identity.owner===true,media:!!(await mediaRole(env,identity.user?.id)),adminLevel:identity.user?await staffOnlineLevel(env,identity.user.id):0})}));}
      if(m[2]==='ws')return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class Room {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.room=null;this.loaded=false;}
  async load(){
    if(this.loaded)return;this.room=await this.ctx.storage.get('room')||null;this.loaded=true;
    if(!this.room)return;
    this.room.players=this.room.players||[];
    if(this.room.mode==='freeroam'){this.room.records=this.room.records||{speed:0,drift:0};this.room.dragQueue=this.room.dragQueue||[];this.room.dragChallenges=this.room.dragChallenges||{};this.room.driftBattle=this.room.driftBattle||null;if(this.room.driftBattle&&!FREE_DRIFT_ZONES[this.room.driftBattle.zoneId])this.room.driftBattle=null;this.room.koth=this.room.koth||null;this.room.minigames=this.room.minigames||{};this.room.eventsDisabled=!!this.room.eventsDisabled;for(const p of this.room.players){p.adminLevel=Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0)));p.media=!!p.media;p.spectator=!!p.spectator;p.mediaReady=!!p.mediaReady;p.level=Math.max(0,Math.min(100,Math.floor(Number(p.level)||0)));p.totalExp=Math.max(0,Math.floor(Number(p.totalExp)||0));p.activePlayMs=Math.max(0,Number(p.activePlayMs)||0);p.onlineRewardCounter=Math.max(0,Math.floor(Number(p.onlineRewardCounter)||0));p.activeSessionId=p.activeSessionId||crypto.randomUUID();p.dragWager=validFreeDragWager(p.dragWager)?Number(p.dragWager):0;}return;}
    try{
      await this.recoverInterruptedWager();
      if(this.room.settlement?.authority==='server'&&this.room.settlement.status==='locked'){
        const escrow=await readRoomWager(this.env.DB,this.room.settlement.raceId);
        if(!escrow)throw Error('WAGER_JOURNAL_MISSING');
        if(escrow.status==='refunded'){this.room.settlement.status='refunded';this.room.settlement.reason='RECOVERED_REFUND';this.resetRaceState({resetConfirmation:true});await this.save();}
        else if(escrow.status==='awarded'){
          const winner=this.room.players.find(p=>p.userId===escrow.winner_user_id);if(!winner)throw Error('WAGER_WINNER_MISSING');
          this.room.settlement.status='awarded';this.room.settlement.winnerId=winner.id;this.room.settlement.awardedAt=escrow.settled_at;
          winner.finishPlace=1;winner.finishTime=Math.max(0,escrow.settled_at-this.room.raceStartAt);this.room.finishOrder=[winner.id,...(this.room.finishOrder||[]).filter(id=>id!==winner.id)];await this.save();
        }
      }
    }catch(e){this.loaded=false;throw e;}
    this.room.finishOrder=this.room.finishOrder||[];this.room.settings=normalizeSettings(this.room.settings||{});this.room.settlement=this.room.settlement||null;
    if(this.room.mode==='media_race'&&this.room.mediaEvent){this.room.mediaEvent.status=this.room.mediaEvent.status||'WAITING';this.room.mediaEvent.settings=this.room.mediaEvent.settings||{};}
    for(const p of this.room.players){
      p.adminLevel=Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0)));p.media=!!p.media;p.spectator=!!p.spectator;
      if(typeof p.wagerConfirmed!=='boolean')p.wagerConfirmed=this.room.settings.wager===0;
      if(!Number.isInteger(p.stake))p.stake=0;
    }
  }
  async save(){if(this.room){this.room.updatedAt=now();await this.ctx.storage.put('room',this.room);await this.scheduleAlarm();}}
  async scheduleAlarm(){
    if(!this.room)return;let at=this.room.mode==='freeroam'?now()+24*60*60*1000:this.room.createdAt+ROOM_TTL_MS;
    if(this.room.mode==='freeroam'){const t=now();for(const event of [this.room.driftBattle,this.room.koth]){if(!event)continue;if(event.status==='waiting'&&event.createdAt)at=Math.min(at,event.createdAt+FREE_ACTIVITY_WAIT_MS);if(event.status==='countdown'&&event.startAt)at=Math.min(at,event.startAt);if(event.status==='running'&&event.endAt)at=Math.min(at,event.endAt);if(event.activity==='koth'&&event.status==='running'){const elapsed=Math.max(0,t-event.startAt);for(const off of FREE_KOTH_SWITCH_MS)if(off>elapsed+50){at=Math.min(at,event.startAt+off);break;}}}for(const event of Object.values(this.room.minigames||{})){if(!event)continue;if(event.status==='waiting'&&event.createdAt)at=Math.min(at,event.createdAt+FREE_MINIGAME_WAIT_MS);if(event.status==='countdown'&&event.startAt)at=Math.min(at,event.startAt);if(event.status==='running'&&event.endAt)at=Math.min(at,event.endAt);if(event.gameKey==='hot_potato'&&event.status==='running'&&event.bombDeadline)at=Math.min(at,event.bombDeadline);}}
    const disconnected=this.room.players.filter(p=>!p.connected&&p.disconnectedUntil).map(p=>p.disconnectedUntil);
    if(disconnected.length)at=Math.min(at,...disconnected);
    if(this.room.players.some(p=>p.connected))at=Math.min(at,now()+(this.room.mode==='freeroam'?FREE_HEARTBEAT_SWEEP_MS:CONNECTION_HEARTBEAT_SWEEP_MS));
    if(!this.room.players.some(p=>p.connected))at=Math.min(at,this.room.emptySince?this.room.emptySince+EMPTY_ROOM_TTL_MS:now()+EMPTY_ROOM_TTL_MS);
    await this.ctx.storage.setAlarm(Math.max(now()+1000,at));
  }
  markSocketSeen(ws,seenAt=now()){
    try{const a=ws.deserializeAttachment?.()||{};if(!a.playerId)return null;const next={...a,lastSeenAt:seenAt};ws.serializeAttachment?.(next);return next;}catch{return null;}
  }
  heartbeatExpiredPlayers(t=now(),timeoutMs=CONNECTION_HEARTBEAT_TIMEOUT_MS){
    if(!this.room)return [];const lastSeen=new Map();
    for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(!a?.playerId)continue;const seen=Number(a.lastSeenAt)||0;if(seen>(lastSeen.get(a.playerId)||0))lastSeen.set(a.playerId,seen);}
    return this.room.players.filter(p=>p.connected&&(!lastSeen.has(p.id)||t-(lastSeen.get(p.id)||0)>=timeoutMs));
  }
  expireHeartbeatPlayers(t=now()){
    const timeout=this.room?.mode==='freeroam'?FREE_HEARTBEAT_TIMEOUT_MS:CONNECTION_HEARTBEAT_TIMEOUT_MS,expired=this.heartbeatExpiredPlayers(t,timeout);if(!expired.length)return expired;const ids=new Set(expired.map(p=>p.id));
    for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(!ids.has(a?.playerId))continue;try{ws.close(4008,'heartbeat_timeout');}catch{}}
    for(const p of expired){p.connected=false;p.disconnectedUntil=t;p.disconnectReason='timeout';}
    if(!this.room.players.some(p=>p.connected))this.room.emptySince=t;return expired;
  }

  publicActivity(event){
    if(!event)return null;
    const base={activity:event.activity,id:event.id,status:event.status,startAt:event.startAt||0,endAt:event.endAt||0,participants:[...(event.participants||[])],mediaEvent:!!event.mediaEvent,settings:event.settings||null};
    if(event.activity==='drift_battle')return {...base,zoneId:event.zoneId,zone:FREE_DRIFT_ZONES[event.zoneId]||null};
    if(event.activity==='koth')return {...base,zoneIndex:event.zoneIndex||0,zone:FREE_KOTH_ZONES[(event.zoneIndex||0)%FREE_KOTH_ZONES.length]||FREE_KOTH_ZONES[0],finalZone:!!event.finalZone};
    return base;
  }
  eventIdentity(event,id){
    const live=this.room?.players?.find(p=>p.id===id);if(live)return live;
    const snap=event?.identities?.[id];return snap?{id,userId:snap.userId||null,name:snap.name||'RACER',level:snap.level||0,totalExp:snap.totalExp||0,connected:false}:null;
  }
  eventMetric(event,id){
    event.metrics=event.metrics||{};return event.metrics[id]||(event.metrics[id]={score:0,points:0,insideMs:0,zoneMs:0,activeMs:0,driftMs:0,distance:0,lastX:null,lastY:null});
  }
  eventNames(event){return Object.fromEntries((event?.participants||[]).map(id=>[id,this.eventIdentity(event,id)?.name||'RACER']));}
  eventLevels(event){return Object.fromEntries((event?.participants||[]).map(id=>[id,Math.max(0,Math.min(100,Math.floor(Number(this.eventIdentity(event,id)?.level)||0)))]));}
  playerBusy(playerId){
    if(this.freeDragForPlayer(playerId))return true;
    for(const e of [this.room?.driftBattle,this.room?.koth])if(e&&['waiting','countdown','running'].includes(e.status)&&e.participants?.includes(playerId))return true;
    if(this.minigameForPlayer(playerId))return true;
    return false;
  }
  async grantProgress(playerLike,source,eventId,rewardKey,meta={}){
    const reward=PROGRESSION_REWARDS[rewardKey];if(!reward||!playerLike?.userId)return null;
    let result;for(let attempt=0;attempt<3;attempt++){result=await awardProgression(this.env,playerLike.userId,{source,eventId,exp:reward.exp,credits:reward.credits,meta});if(result?.ok)break;}if(!result?.ok||result.duplicate)return result;
    const live=this.room?.players?.find(p=>p.id===playerLike.id)||this.room?.players?.find(p=>p.userId===playerLike.userId);
    if(live){live.level=result.level;live.totalExp=result.totalExp;this.sendToPlayers([live.id],{type:'progress_reward',v:PROTOCOL_VERSION,source,eventId,rewardKey,exp:result.expAdded,credits:result.creditsAdded,requestedCredits:result.requestedCredits,capped:!!result.capped,balance:result.balance,totalExp:result.totalExp,level:result.level,levelBefore:result.levelBefore,levelExp:result.levelExp,requiredExp:result.requiredExp,toNext:result.toNext,serverTime:now()});this.broadcast({type:'player_progress',v:PROTOCOL_VERSION,playerId:live.id,level:result.level,totalExp:result.totalExp,serverTime:now()});}
    return result;
  }
  async trackOnlineActivity(p,previous,current){
    if(!p?.userId||!previous||!current)return;
    const prevTime=Number(previous.sampleTime||previous.serverTime),curTime=Number(current.sampleTime||current.serverTime);if(!Number.isFinite(prevTime)||!Number.isFinite(curTime)||curTime<=prevTime)return;
    const dt=Math.min(250,Math.max(0,curTime-prevTime)),travel=Math.hypot(current.x-previous.x,current.y-previous.y);if(dt<=0)return;
    const active=travel>=1.4&&current.speed>=12;if(!active)return;p.activePlayMs=(Number(p.activePlayMs)||0)+dt;
    while(p.activePlayMs>=FREE_ONLINE_REWARD_MS){const nextCounter=(Number(p.onlineRewardCounter)||0)+1,eventId=`${p.activeSessionId||p.id}:${nextCounter}`;const reward=await this.grantProgress(p,'online_time',eventId,'ONLINE_REWARD',{activeMs:FREE_ONLINE_REWARD_MS});if(!reward?.ok)break;p.activePlayMs-=FREE_ONLINE_REWARD_MS;p.onlineRewardCounter=nextCounter;}
  }
  makeEvent(activity,participants,t,extra={}){
    const identities={};for(const id of participants){const p=this.room.players.find(x=>x.id===id);if(p)identities[id]={userId:p.userId||null,name:p.name,level:p.level||0,totalExp:p.totalExp||0};}
    return {id:crypto.randomUUID(),activity,status:'waiting',participants:[...participants],identities,metrics:{},createdAt:t,startAt:0,endAt:0,lastProgressAt:0,...extra};
  }
  syncEventIdentity(event,p){event.identities=event.identities||{};event.identities[p.id]={userId:p.userId||null,name:p.name,level:p.level||0,totalExp:p.totalExp||0};this.eventMetric(event,p.id);}
  minigameForPlayer(playerId){
    return Object.values(this.room?.minigames||{}).find(e=>e&&['waiting','countdown','running'].includes(e.status)&&e.participants?.includes(playerId))||null;
  }
  publicMinigame(e){
    if(!e)return null;const cfg=FREE_MINIGAME_CONFIG[e.gameKey]||{};
    return {activity:'minigame',id:e.id,gameKey:e.gameKey,label:cfg.label||e.gameKey,status:e.status,participants:[...(e.participants||[])],names:this.eventNames(e),levels:this.eventLevels(e),minPlayers:e.settings?.minPlayers||cfg.minPlayers||2,maxPlayers:e.settings?.maxPlayers||cfg.maxPlayers||8,startAt:e.startAt||0,endAt:e.endAt||0,teams:e.teams||null,teamByPlayer:e.teamByPlayer||null,score:e.score||null,ball:e.ball?{x:e.ball.x,y:e.ball.y,vx:e.ball.vx,vy:e.ball.vy,seq:e.ball.seq||0,lastTouchId:e.ball.lastTouchId||null}:null,checkpoint:e.checkpoint||null,checkpointIndex:e.checkpointIndex||0,points:e.points||null,bombHolderId:e.bombHolderId||null,bombDeadline:e.bombDeadline||0,strikes:e.strikes||null,spawns:e.spawns||null,finishes:e.finishes||null,mediaEvent:!!e.mediaEvent,settings:e.settings||null};
  }
  minigameSpawn(gameKey,index,count,team=null){
    const a=FREE_MINIGAME_ARENA;
    if(String(gameKey).startsWith('football')){
      const side=team==='blue'?1:-1,x=a.x+side*620,rows=Math.max(1,Math.ceil(count/2)),slot=index%rows,y=a.y+(slot-(rows-1)/2)*230;
      return {x,y,angle:team==='blue'?Math.PI:0};
    }
    if(gameKey==='drag'){const laneGap=Math.min(150,Math.max(72,860/Math.max(2,count))),y=a.y+(index-(count-1)/2)*laneGap;return {x:a.left+185,y,angle:0};}
    const angle=(index/Math.max(1,count))*Math.PI*2-Math.PI/2,rad=gameKey==='hot_potato'?480:540;
    return {x:a.x+Math.cos(angle)*rad,y:a.y+Math.sin(angle)*rad,angle:angle+Math.PI};
  }
  resetPlayerToMinigameSpawn(e,p,index){
    const team=e.teamByPlayer?.[p.id]||null,spawn=this.minigameSpawn(e.gameKey,index,e.participants.length,team),t=now();
    p.state={seq:p.lastSeq,x:spawn.x,y:spawn.y,vx:0,vy:0,angle:spawn.angle,speed:0,yawRate:0,sampleTime:t,serverTime:t};p.lastSampleTime=t;p.lastStateAt=t-100;p.minigameTeleportedAt=t;
    return spawn;
  }
  async joinMinigame(ws,p,gameKey,t){
    const cfg=FREE_MINIGAME_CONFIG[gameKey],hub=cfg&&FREE_MINIGAME_HUBS[cfg.hub];if(!cfg||!hub)return this.error(ws,'INVALID_ACTIVITY','Неизвестная мини-игра');
    if(!insideCircle(p.state,hub))return this.error(ws,'ACTIVITY_LOCATION',`Подъедьте к ${hub.label}`);
    if(this.playerBusy(p.id))return this.error(ws,'ACTIVITY_BUSY','Вы уже участвуете в активности');
    this.room.minigames=this.room.minigames||{};let e=this.room.minigames[gameKey];
    if(e?.status==='running')return this.error(ws,'ACTIVITY_RUNNING',`${cfg.label} уже идёт`);
    if(!e||!['waiting','countdown'].includes(e.status))e=this.room.minigames[gameKey]=this.makeEvent('minigame',[p.id],t,{gameKey,points:{},strikes:{},score:{red:0,blue:0}});
    else if(!e.participants.includes(p.id)&&e.participants.length<cfg.maxPlayers)e.participants.push(p.id);
    if(!e.participants.includes(p.id))return this.error(ws,'ACTIVITY_FULL',`В ${cfg.label} уже максимум игроков`);
    this.syncEventIdentity(e,p);e.points=e.points||{};e.strikes=e.strikes||{};e.points[p.id]=e.points[p.id]||0;e.strikes[p.id]=e.strikes[p.id]||0;
    const live=e.participants.filter(id=>this.room.players.find(x=>x.id===id&&x.connected)).length;
    if(e.status==='waiting'&&live>=cfg.minPlayers){e.status='countdown';e.startAt=t+FREE_MINIGAME_COUNTDOWN_MS;e.endAt=e.startAt+cfg.durationMs;}
    await this.save();this.sendToPlayers(e.participants,{type:'minigame_lobby',v:PROTOCOL_VERSION,...this.publicMinigame(e),serverTime:t});
  }
  async ownerStartMinigame(ws,p,t=now()){
    if(p?.owner!==true)return this.error(ws,'OWNER_ONLY','Только владелец может запустить мини-игру без ожидания');
    const e=this.minigameForPlayer(p.id);if(!e)return this.error(ws,'ACTIVITY_NOT_JOINED','Сначала вступите в мини-игру');
    if(!['waiting','countdown'].includes(e.status))return this.error(ws,'ACTIVITY_RUNNING','Мини-игра уже запущена');
    const cfg=FREE_MINIGAME_CONFIG[e.gameKey];if(!cfg)return this.error(ws,'INVALID_ACTIVITY','Неизвестная мини-игра');
    e.ownerForced=true;e.startAt=t;e.endAt=t+cfg.durationMs;this.startMinigame(e,t);await this.save();
  }
  async leaveMinigame(ws,p,t=now()){
    const e=this.minigameForPlayer(p.id);if(!e)return this.error(ws,'ACTIVITY_NOT_JOINED','Вы не участвуете в мини-игре');const cfg=FREE_MINIGAME_CONFIG[e.gameKey];
    e.disqualified=e.disqualified||{};e.disqualified[p.id]=true;e.participants=e.participants.filter(id=>id!==p.id);delete e.metrics?.[p.id];delete e.identities?.[p.id];delete e.points?.[p.id];delete e.strikes?.[p.id];delete e.teamByPlayer?.[p.id];
    if(e.teams){e.teams.red=(e.teams.red||[]).filter(id=>id!==p.id);e.teams.blue=(e.teams.blue||[]).filter(id=>id!==p.id);}p.state=null;p.lastSampleTime=0;p.lastStateAt=0;
    this.send(ws,{type:'minigame_left',v:PROTOCOL_VERSION,activity:'minigame',gameKey:e.gameKey,eventId:e.id,serverTime:t});
    if(!e.participants.length){delete this.room.minigames[e.gameKey];await this.save();return;}
    if(e.status!=='running'){const live=e.participants.filter(id=>this.room.players.find(x=>x.id===id&&x.connected)).length;if(e.status==='countdown'&&live<cfg.minPlayers){e.status='waiting';e.startAt=0;e.endAt=0;e.createdAt=t;}this.sendToPlayers(e.participants,{type:'minigame_lobby',v:PROTOCOL_VERSION,...this.publicMinigame(e),serverTime:t});}
    else this.sendMinigameProgress(e,t,true);
    await this.save();
  }
  startMinigame(e,t){
    const cfg=FREE_MINIGAME_CONFIG[e.gameKey];if(!cfg)return;const durationMs=e.settings?.durationMs||cfg.durationMs;e.status='running';if(e.mediaEvent&&this.room.mediaEvent)this.room.mediaEvent.status='RUNNING';e.endAt=e.startAt+durationMs;e.lastProgressAt=0;e.metrics=e.metrics||{};e.points=e.points||{};e.strikes=e.strikes||{};e.score=e.score||{red:0,blue:0};
    if(cfg.kind==='football'){
      e.teams={red:[],blue:[]};e.teamByPlayer={};e.participants.forEach((id,i)=>{const team=i%2===0?'red':'blue';e.teams[team].push(id);e.teamByPlayer[id]=team;});e.ball={x:FREE_MINIGAME_ARENA.x,y:FREE_MINIGAME_ARENA.y,vx:0,vy:0,lastAt:t,lastTouchAt:0,lastTouchId:null,lastTouchBy:{},seq:0};e.score={red:0,blue:0};
    }else if(cfg.kind==='checkpoint'){e.checkpointIndex=0;e.checkpointSerial=0;e.checkpoint={...FREE_CHECKPOINTS[0]};for(const id of e.participants)e.points[id]=0;}
    else if(cfg.kind==='hot_potato'){for(const id of e.participants)e.strikes[id]=0;e.bombHolderId=e.participants[0]||null;e.bombDeadline=t+(Number(e.settings?.bombIntervalMs)||12000);e.lastBombTransferAt=t;}else if(cfg.kind==='drag_event'){e.finishes={};e.finishX=FREE_MINIGAME_ARENA.right-150;}
    const spawns={};e.participants.forEach((id,i)=>{const p=this.room.players.find(x=>x.id===id);if(p)spawns[id]=this.resetPlayerToMinigameSpawn(e,p,i);});e.spawns=spawns;
    this.sendToPlayers(e.participants,{type:'minigame_start',v:PROTOCOL_VERSION,...this.publicMinigame(e),spawns,serverTime:t});
  }
  resetFootballBall(e,t){
    if(!e?.ball)return;e.ball.x=FREE_MINIGAME_ARENA.x;e.ball.y=FREE_MINIGAME_ARENA.y;e.ball.vx=0;e.ball.vy=0;e.ball.lastAt=t;e.ball.lastTouchAt=t;e.ball.lastTouchId=null;e.ball.lastTouchBy={};e.ball.seq=(e.ball.seq||0)+1;
  }
  scoreFootballGoal(e,team,t){
    e.score=e.score||{red:0,blue:0};e.score[team]=(e.score[team]||0)+1;this.resetFootballBall(e,t);
    this.sendToPlayers(e.participants,{type:'minigame_goal',v:PROTOCOL_VERSION,activity:'minigame',gameKey:e.gameKey,eventId:e.id,team,score:e.score,ball:{x:e.ball.x,y:e.ball.y,vx:0,vy:0,seq:e.ball.seq||0},serverTime:t});
  }
  stepFootballBall(e,t){
    const ball=e?.ball;if(!ball)return false;const a=FREE_MINIGAME_ARENA,r=FREE_FOOTBALL_BALL_RADIUS,goalHalf=FREE_FOOTBALL_GOAL_HALF,goalClear=goalHalf-r*.45;
    const last=Number(ball.lastAt)||t,total=Math.max(0,Math.min(.18,(t-last)/1000));ball.lastAt=t;if(total<=0)return false;
    let remaining=total,goal=null;
    while(remaining>1e-6&&!goal){
      const dt=Math.min(1/120,remaining);remaining-=dt;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
      const damping=Math.exp(-.58*dt);ball.vx*=damping;ball.vy*=damping;
      if(ball.y<a.top+r){ball.y=a.top+r;ball.vy=Math.abs(ball.vy)*.78;}else if(ball.y>a.bottom-r){ball.y=a.bottom-r;ball.vy=-Math.abs(ball.vy)*.78;}
      const inGoalMouth=Math.abs(ball.y-a.y)<=goalClear;
      if(inGoalMouth){
        if(ball.x<a.left-r*.22)goal='blue';else if(ball.x>a.right+r*.22)goal='red';
        else{if(ball.x<a.left-FREE_FOOTBALL_GOAL_DEPTH+r){ball.x=a.left-FREE_FOOTBALL_GOAL_DEPTH+r;ball.vx=Math.abs(ball.vx)*.5;}else if(ball.x>a.right+FREE_FOOTBALL_GOAL_DEPTH-r){ball.x=a.right+FREE_FOOTBALL_GOAL_DEPTH-r;ball.vx=-Math.abs(ball.vx)*.5;}}
      }else{
        if(ball.x<a.left+r){ball.x=a.left+r;ball.vx=Math.abs(ball.vx)*.78;}else if(ball.x>a.right-r){ball.x=a.right-r;ball.vx=-Math.abs(ball.vx)*.78;}
      }
    }
    if(goal){this.scoreFootballGoal(e,goal,t);return true;}
    const speed=Math.hypot(ball.vx,ball.vy);if(speed>FREE_FOOTBALL_MAX_BALL_SPEED){const k=FREE_FOOTBALL_MAX_BALL_SPEED/speed;ball.vx*=k;ball.vy*=k;}else if(speed<4){ball.vx=0;ball.vy=0;}
    return false;
  }
  projectFootballPlayerState(p,t){
    const s=p?.state;if(!s)return null;const basis=Number(s.sampleTime||s.serverTime)||t,dt=Math.max(0,Math.min(.12,(t-basis)/1000));return {...s,x:s.x+(Number(s.vx)||0)*dt,y:s.y+(Number(s.vy)||0)*dt,sampleTime:t,serverTime:t};
  }
  validatedFootballTouchState(p,raw,t){
    const projected=this.projectFootballPlayerState(p,t);if(!projected)return null;if(!raw||![raw.x,raw.y,raw.vx,raw.vy,raw.angle,raw.speed].every(Number.isFinite))return projected;
    if(raw.speed<0||raw.speed>(p.speedLimit||900)||Math.abs(raw.vx)>Math.max(1200,(p.speedLimit||900)*2)||Math.abs(raw.vy)>Math.max(1200,(p.speedLimit||900)*2))return projected;
    const stamp=Number(raw.sampleTime),age=Number.isFinite(stamp)?Math.abs(t-stamp):9999,maxError=70+Math.min(90,(Number(p.netRttMs)||0)*.35);if(age>260||Math.hypot(raw.x-projected.x,raw.y-projected.y)>maxError)return projected;
    return {x:raw.x,y:raw.y,vx:raw.vx,vy:raw.vy,angle:raw.angle,speed:raw.speed,sampleTime:stamp,serverTime:t};
  }
  applyFootballContact(e,p,current,t,broadcast=false){
    const ball=e?.ball;if(!ball||!current)return false;ball.lastTouchBy=ball.lastTouchBy||{};if(t-(ball.lastTouchBy[p.id]||0)<32)return false;
    const dx=ball.x-current.x,dy=ball.y-current.y,d=Math.hypot(dx,dy);if(!Number.isFinite(d)||d<=0||d>FREE_FOOTBALL_CONTACT_RADIUS+8)return false;
    const nx=dx/d,ny=dy/d,cvx=Number(current.vx)||0,cvy=Number(current.vy)||0,bnx=(Number(ball.vx)||0)*nx+(Number(ball.vy)||0)*ny,carNormal=cvx*nx+cvy*ny,closing=carNormal-bnx;
    if(closing<=4&&d>FREE_FOOTBALL_CONTACT_RADIUS-4)return false;
    const speed=Math.hypot(cvx,cvy),forwardX=Math.cos(Number(current.angle)||0),forwardY=Math.sin(Number(current.angle)||0),drive=Math.max(0,forwardX*nx+forwardY*ny);
    // Give momentum only while the car closes on the ball. Repeated snapshots during
    // a dribble separate overlapping bodies without adding a fresh kick each time.
    const impulse=closing>4?closing*1.02+(closing>12?drive*Math.min(25,speed*.06):0):0;
    if(impulse){ball.vx+=nx*impulse;ball.vy+=ny*impulse;}
    const ballSpeed=Math.hypot(ball.vx,ball.vy);if(ballSpeed>FREE_FOOTBALL_MAX_BALL_SPEED){const k=FREE_FOOTBALL_MAX_BALL_SPEED/ballSpeed;ball.vx*=k;ball.vy*=k;}
    if(d<FREE_FOOTBALL_CONTACT_RADIUS+1){ball.x=current.x+nx*(FREE_FOOTBALL_CONTACT_RADIUS+1);ball.y=current.y+ny*(FREE_FOOTBALL_CONTACT_RADIUS+1);}
    ball.lastTouchAt=t;ball.lastTouchId=p.id;ball.lastTouchBy[p.id]=t;ball.seq=(ball.seq||0)+1;
    if(broadcast)this.sendToPlayers(e.participants,{type:'minigame_ball',v:PROTOCOL_VERSION,activity:'minigame',gameKey:e.gameKey,eventId:e.id,ball:{x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy,seq:ball.seq,lastTouchId:p.id},serverTime:t});
    return true;
  }
  updateFootballBall(e,p,current,t){
    const scored=this.stepFootballBall(e,t);if(scored)return;this.applyFootballContact(e,p,current,t,false);
  }
  updateMinigameMetrics(p,previous,current,t){
    const e=this.minigameForPlayer(p.id);if(!e||e.status!=='running'||t<e.startAt||t>e.endAt)return;const cfg=FREE_MINIGAME_CONFIG[e.gameKey],m=this.eventMetric(e,p.id);
    if(p.minigameTeleportedAt&&t-p.minigameTeleportedAt<650)previous=null;else if(p.minigameTeleportedAt)delete p.minigameTeleportedAt;
    if(previous){const a=Number(previous.sampleTime||previous.serverTime),b=Number(current.sampleTime||current.serverTime),dt=Math.min(250,Math.max(0,b-a)),travel=Math.hypot(current.x-previous.x,current.y-previous.y);m.distance+=travel;if(travel>=1.2&&current.speed>=10)m.activeMs+=dt;}
    if(cfg.kind==='football')this.applyFootballContact(e,p,current,t,true);
    else if(cfg.kind==='checkpoint'){
      const cp=e.checkpoint;if(cp&&Math.hypot(current.x-cp.x,current.y-cp.y)<=92&&m.lastCheckpointSerial!==e.checkpointSerial){m.lastCheckpointSerial=e.checkpointSerial;e.points[p.id]=(e.points[p.id]||0)+1;e.checkpointSerial=(e.checkpointSerial||0)+1;e.checkpointIndex=e.checkpointSerial%FREE_CHECKPOINTS.length;e.checkpoint={...FREE_CHECKPOINTS[e.checkpointIndex]};}
    }else if(cfg.kind==='drag_event'){if(!e.finishes?.[p.id]&&previous&&previous.x<(e.finishX||FREE_MINIGAME_ARENA.right-150)&&current.x>=(e.finishX||FREE_MINIGAME_ARENA.right-150)){e.finishes=e.finishes||{};e.finishes[p.id]=Math.max(e.startAt,t);this.sendToPlayers(e.participants,{type:'activity_finish_confirmed',v:PROTOCOL_VERSION,activity:'drag',eventId:e.id,playerId:p.id,elapsedMs:Math.max(0,Math.round(e.finishes[p.id]-e.startAt)),serverTime:t});if(e.participants.every(id=>Number.isFinite(e.finishes?.[id])))e.endAt=Math.min(e.endAt,t);}
    }else if(cfg.kind==='hot_potato'&&e.bombHolderId&&p.id!==e.bombHolderId&&t-(e.lastBombTransferAt||0)>=800){
      const holder=this.room.players.find(x=>x.id===e.bombHolderId);if(holder?.state&&Math.hypot(current.x-holder.state.x,current.y-holder.state.y)<=78){e.bombHolderId=p.id;e.bombDeadline=t+(Number(e.settings?.bombIntervalMs)||12000);e.lastBombTransferAt=t;this.sendToPlayers(e.participants,{type:'minigame_bomb_pass',v:PROTOCOL_VERSION,eventId:e.id,gameKey:e.gameKey,bombHolderId:p.id,bombDeadline:e.bombDeadline,serverTime:t});}
    }
    if(t-(e.lastProgressAt||0)>=FREE_MINIGAME_PROGRESS_MS){e.lastProgressAt=t;this.sendMinigameProgress(e,t);}
  }
  minigameStandings(e){
    const cfg=FREE_MINIGAME_CONFIG[e.gameKey];if(cfg.kind==='checkpoint')return [...e.participants].map(id=>({id,name:this.eventIdentity(e,id)?.name||'RACER',level:this.eventIdentity(e,id)?.level||0,score:e.points?.[id]||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    if(cfg.kind==='hot_potato')return [...e.participants].map(id=>({id,name:this.eventIdentity(e,id)?.name||'RACER',level:this.eventIdentity(e,id)?.level||0,score:e.strikes?.[id]||0,strikes:e.strikes?.[id]||0})).sort((a,b)=>a.strikes-b.strikes||a.name.localeCompare(b.name));
    if(cfg.kind==='drag_event')return [...e.participants].map(id=>{const fin=Number(e.finishes?.[id]);const live=this.room.players.find(p=>p.id===id);return {id,name:this.eventIdentity(e,id)?.name||'RACER',level:this.eventIdentity(e,id)?.level||0,score:Number.isFinite(fin)?Math.max(0,Math.round(fin-e.startAt)):null,elapsedMs:Number.isFinite(fin)?Math.max(0,Math.round(fin-e.startAt)):null,progress:Math.max(0,Number(live?.state?.x)||0)};}).sort((a,b)=>(a.elapsedMs??1e15)-(b.elapsedMs??1e15)||b.progress-a.progress||a.name.localeCompare(b.name));
    return [...e.participants].map(id=>({id,name:this.eventIdentity(e,id)?.name||'RACER',level:this.eventIdentity(e,id)?.level||0,team:e.teamByPlayer?.[id]||null,score:e.score?.[e.teamByPlayer?.[id]]||0}));
  }
  sendMinigameProgress(e,t,force=false){
    const rate=FREE_MINIGAME_CONFIG[e?.gameKey]?.kind==='football'?FREE_FOOTBALL_PROGRESS_MS:FREE_MINIGAME_PROGRESS_MS;if(!e||(!force&&t-(e.lastProgressBroadcastAt||0)<rate))return;e.lastProgressBroadcastAt=t;
    this.sendToPlayers(e.participants,{type:'minigame_progress',v:PROTOCOL_VERSION,...this.publicMinigame(e),standings:this.minigameStandings(e),serverTime:t});
  }
  async settleMinigame(e,t){
    if(!e||e.settled)return;e.settled=true;const cfg=FREE_MINIGAME_CONFIG[e.gameKey],standings=this.minigameStandings(e),results=[];
    if(cfg.kind==='football'){
      const red=e.score?.red||0,blue=e.score?.blue||0,winner=red===blue?null:(red>blue?'red':'blue');
      for(const row of standings){const m=this.eventMetric(e,row.id),eligible=!e.disqualified?.[row.id]&&(m.activeMs>=8000||m.distance>=120),won=winner&&row.team===winner,draw=!winner;let reward=null;if(eligible&&!e.mediaEvent)reward=await this.grantProgress(this.eventIdentity(e,row.id),'mini_football',e.id,draw?'FOOTBALL_DRAW':won?'FOOTBALL_WIN':'FOOTBALL_LOSS',{gameKey:e.gameKey,team:row.team,score:e.score,activeMs:Math.round(m.activeMs),distance:Math.round(m.distance)});results.push({...row,place:draw?1:won?1:2,eligible,won:!!won,draw,exp:reward?.expAdded||0,credits:reward?.creditsAdded||0,capped:!!reward?.capped});}
    }else{
      for(let i=0;i<standings.length;i++){const row=standings[i],m=this.eventMetric(e,row.id),eligible=!e.disqualified?.[row.id]&&(m.activeMs>=6500||m.distance>=100);let reward=null;if(eligible&&!e.mediaEvent){const key=i===0?'MINIGAME_FIRST':i===1?'MINIGAME_SECOND':i===2?'MINIGAME_THIRD':'MINIGAME_PARTICIPATION';reward=await this.grantProgress(this.eventIdentity(e,row.id),`minigame_${e.gameKey}`,e.id,key,{place:i+1,score:row.score,activeMs:Math.round(m.activeMs),distance:Math.round(m.distance)});}results.push({...row,place:i+1,eligible,exp:reward?.expAdded||0,credits:reward?.creditsAdded||0,capped:!!reward?.capped});}
    }
    for(const id of e.participants){const p=this.room.players.find(x=>x.id===id);if(p){p.state=null;p.lastSampleTime=0;p.lastStateAt=0;}}
    this.sendToPlayers(e.participants,{type:'minigame_result',v:PROTOCOL_VERSION,activity:'minigame',gameKey:e.gameKey,eventId:e.id,score:e.score||null,results,serverTime:t});if(e.mediaEvent){const draw=cfg.kind==='football'&&(e.score?.red||0)===(e.score?.blue||0);await this.completeMediaEvent(e,results,{draw,gameKey:e.gameKey,score:e.score||null});}delete this.room.minigames[e.gameKey];await this.save();
  }
  async advanceMinigames(t){
    for(const [gameKey,e] of Object.entries(this.room.minigames||{})){if(!e)continue;const cfg=FREE_MINIGAME_CONFIG[gameKey];if(!cfg){delete this.room.minigames[gameKey];continue;}const live=e.participants.filter(id=>this.room.players.find(p=>p.id===id&&p.connected));
      if(!e.mediaEvent&&e.status==='waiting'&&t-e.createdAt>=FREE_MINIGAME_WAIT_MS){this.sendToPlayers(e.participants,{type:'minigame_cancelled',v:PROTOCOL_VERSION,activity:'minigame',gameKey,eventId:e.id,reason:'WAIT_TIMEOUT',serverTime:t});delete this.room.minigames[gameKey];continue;}
      if(e.status==='countdown'&&t>=e.startAt){if(live.length<(e.settings?.minPlayers||cfg.minPlayers)){e.status='waiting';e.startAt=0;e.endAt=0;e.createdAt=t;this.sendToPlayers(e.participants,{type:'minigame_lobby',v:PROTOCOL_VERSION,...this.publicMinigame(e),serverTime:t});}else{this.startMinigame(e,t);}}
      if(e.status==='running'){
        if(cfg.kind==='football')this.stepFootballBall(e,t);
        if(cfg.kind==='hot_potato'&&e.bombHolderId&&e.bombDeadline&&t>=e.bombDeadline){e.strikes[e.bombHolderId]=(e.strikes[e.bombHolderId]||0)+1;const idx=Math.max(0,e.participants.indexOf(e.bombHolderId)),next=e.participants.length?e.participants[(idx+1)%e.participants.length]:null;e.bombHolderId=next;e.bombDeadline=t+(Number(e.settings?.bombIntervalMs)||12000);e.lastBombTransferAt=t;this.sendToPlayers(e.participants,{type:'minigame_bomb_burst',v:PROTOCOL_VERSION,eventId:e.id,gameKey,bombHolderId:next,bombDeadline:e.bombDeadline,strikes:e.strikes,serverTime:t});}
        if(cfg.kind==='football'&&Math.max(e.score?.red||0,e.score?.blue||0)>=(e.settings?.goalLimit||5))e.endAt=Math.min(e.endAt,t);if(cfg.kind==='checkpoint'&&Math.max(0,...Object.values(e.points||{}))>=(e.settings?.checkpointCount||Infinity))e.endAt=Math.min(e.endAt,t);
        if(t>=e.endAt)await this.settleMinigame(e,t);else this.sendMinigameProgress(e,t);
      }
    }
  }
  async joinDriftBattle(ws,p,zoneId,t){
    const zone=FREE_DRIFT_ZONES[zoneId];if(!zone||!insideCircle(p.state,zone,90))return this.error(ws,'ACTIVITY_LOCATION','Подъедьте к зоне Drift Battle');
    if(this.playerBusy(p.id))return this.error(ws,'ACTIVITY_BUSY','Вы уже участвуете в активности');let e=this.room.driftBattle;
    if(e?.status==='running')return this.error(ws,'ACTIVITY_RUNNING','Drift Battle уже идёт');
    if(!e||e.zoneId!==zoneId||!['waiting','countdown'].includes(e.status))e=this.room.driftBattle=this.makeEvent('drift_battle',[p.id],t,{zoneId});
    else if(!e.participants.includes(p.id)&&e.participants.length<8)e.participants.push(p.id);
    if(!e.participants.includes(p.id))return this.error(ws,'ACTIVITY_FULL','В Drift Battle уже 8 игроков');this.syncEventIdentity(e,p);
    if(e.status==='waiting'&&e.participants.filter(id=>this.room.players.find(x=>x.id===id&&x.connected)).length>=2){e.status='countdown';e.startAt=t+FREE_ACTIVITY_COUNTDOWN_MS;e.endAt=e.startAt+FREE_DRIFT_DURATION_MS;}
    await this.save();this.sendToPlayers(e.participants,{type:'activity_lobby',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:e.id,zoneId:e.zoneId,zone,participants:[...e.participants],names:this.eventNames(e),levels:this.eventLevels(e),status:e.status,startAt:e.startAt,minPlayers:2,maxPlayers:8,durationMs:FREE_DRIFT_DURATION_MS,serverTime:t});
  }
  async joinKoth(ws,p,t){
    if(!insideCircle(p.state,FREE_KOTH_JOIN,100))return this.error(ws,'ACTIVITY_LOCATION','Подъедьте к APEX MOTOR CLUB');if(this.playerBusy(p.id))return this.error(ws,'ACTIVITY_BUSY','Вы уже участвуете в активности');let e=this.room.koth;
    if(e?.status==='running')return this.error(ws,'ACTIVITY_RUNNING','King of the Hill уже идёт');if(!e||!['waiting','countdown'].includes(e.status))e=this.room.koth=this.makeEvent('koth',[p.id],t,{zoneIndex:0,finalZone:false,lastTickAt:0});else if(!e.participants.includes(p.id)&&e.participants.length<12)e.participants.push(p.id);
    if(!e.participants.includes(p.id))return this.error(ws,'ACTIVITY_FULL','В King of the Hill уже 12 игроков');this.syncEventIdentity(e,p);
    if(e.status==='waiting'&&e.participants.filter(id=>this.room.players.find(x=>x.id===id&&x.connected)).length>=3){e.status='countdown';e.startAt=t+FREE_ACTIVITY_COUNTDOWN_MS;e.endAt=e.startAt+FREE_KOTH_DURATION_MS;}
    await this.save();this.sendToPlayers(e.participants,{type:'activity_lobby',v:PROTOCOL_VERSION,activity:'koth',eventId:e.id,participants:[...e.participants],names:this.eventNames(e),levels:this.eventLevels(e),status:e.status,startAt:e.startAt,minPlayers:3,maxPlayers:12,durationMs:FREE_KOTH_DURATION_MS,serverTime:t});
  }
  async leaveLiveActivity(ws,p,activity,t=now()){
    const key=activity==='drift_battle'?'driftBattle':activity==='koth'?'koth':null;if(!key)return this.error(ws,'INVALID_ACTIVITY','Неизвестный ивент');
    const e=this.room?.[key];if(!e||!e.participants?.includes(p.id))return this.error(ws,'ACTIVITY_NOT_JOINED','Вы не участвуете в этом ивенте');
    const wasRunning=e.status==='running',minPlayers=activity==='drift_battle'?2:3;
    e.disqualified=e.disqualified||{};e.disqualified[p.id]=true;e.participants=e.participants.filter(id=>id!==p.id);delete e.metrics?.[p.id];delete e.identities?.[p.id];
    this.send(ws,{type:'activity_left',v:PROTOCOL_VERSION,activity,eventId:e.id,serverTime:t});
    if(!e.participants.length){this.room[key]=null;await this.save();return;}
    if(!wasRunning){const live=e.participants.filter(id=>this.room.players.find(x=>x.id===id&&x.connected));if(e.status==='countdown'&&live.length<minPlayers){e.status='waiting';e.startAt=0;e.endAt=0;e.createdAt=t;}this.sendToPlayers(e.participants,{type:'activity_lobby',v:PROTOCOL_VERSION,activity:e.activity,eventId:e.id,zoneId:e.zoneId||null,zone:e.activity==='drift_battle'?FREE_DRIFT_ZONES[e.zoneId]:null,participants:[...e.participants],names:this.eventNames(e),levels:this.eventLevels(e),status:e.status,startAt:e.startAt||0,minPlayers,maxPlayers:e.activity==='drift_battle'?8:12,durationMs:e.activity==='drift_battle'?FREE_DRIFT_DURATION_MS:FREE_KOTH_DURATION_MS,serverTime:t});}
    else{const standings=activity==='drift_battle'?this.driftStandings(e):this.kothStandings(e);this.sendToPlayers(e.participants,{type:'activity_progress',v:PROTOCOL_VERSION,activity,eventId:e.id,startAt:e.startAt,endAt:e.endAt,zoneId:e.zoneId||null,zoneIndex:e.zoneIndex||0,zone:activity==='drift_battle'?FREE_DRIFT_ZONES[e.zoneId]:FREE_KOTH_ZONES[(e.zoneIndex||0)%FREE_KOTH_ZONES.length],finalZone:!!e.finalZone,standings,serverTime:t});}
    await this.save();
  }
  handleActivityDeparture(playerId,hardLeave=false){
    for(const [key,minPlayers] of [['driftBattle',2],['koth',3]]){
      const e=this.room?.[key];if(!e||!e.participants?.includes(playerId))continue;
      if(e.status==='running'){
        if(hardLeave){e.disqualified=e.disqualified||{};e.disqualified[playerId]=true;}
        continue;
      }
      e.participants=e.participants.filter(id=>id!==playerId);delete e.metrics?.[playerId];
      if(!e.participants.length){this.room[key]=null;continue;}
      const live=e.participants.filter(id=>this.room.players.find(p=>p.id===id&&p.connected&&p.id!==playerId));
      if(e.status==='countdown'&&live.length<minPlayers){e.status='waiting';e.startAt=0;e.endAt=0;}
      this.sendToPlayers(e.participants,{type:'activity_lobby',v:PROTOCOL_VERSION,activity:e.activity,eventId:e.id,zoneId:e.zoneId||null,participants:[...e.participants],names:this.eventNames(e),levels:this.eventLevels(e),status:e.status,startAt:e.startAt||0,minPlayers,maxPlayers:e.activity==='drift_battle'?8:12,serverTime:now()});
    }
    const mg=this.minigameForPlayer(playerId);if(mg){
      const cfg=FREE_MINIGAME_CONFIG[mg.gameKey];mg.disqualified=mg.disqualified||{};mg.disqualified[playerId]=true;
      if(mg.status==='running'){if(hardLeave){mg.participants=mg.participants.filter(id=>id!==playerId);delete mg.metrics?.[playerId];delete mg.identities?.[playerId];delete mg.points?.[playerId];delete mg.strikes?.[playerId];delete mg.teamByPlayer?.[playerId];if(mg.teams){mg.teams.red=(mg.teams.red||[]).filter(id=>id!==playerId);mg.teams.blue=(mg.teams.blue||[]).filter(id=>id!==playerId);}if(mg.bombHolderId===playerId){mg.bombHolderId=mg.participants[0]||null;mg.bombDeadline=now()+12000;}}}
      else{mg.participants=mg.participants.filter(id=>id!==playerId);delete mg.metrics?.[playerId];delete mg.identities?.[playerId];if(!mg.participants.length)delete this.room.minigames[mg.gameKey];else{const live=mg.participants.filter(id=>this.room.players.find(p=>p.id===id&&p.connected&&p.id!==playerId));if(mg.status==='countdown'&&live.length<(cfg?.minPlayers||2)){mg.status='waiting';mg.startAt=0;mg.endAt=0;mg.createdAt=now();}this.sendToPlayers(mg.participants,{type:'minigame_lobby',v:PROTOCOL_VERSION,...this.publicMinigame(mg),serverTime:now()});}}
    }
  }
  driftStandings(e){return [...e.participants].map(id=>({id,name:this.eventIdentity(e,id)?.name||'RACER',level:this.eventIdentity(e,id)?.level||0,score:Math.floor(this.eventMetric(e,id).score||0)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));}
  kothStandings(e){return [...e.participants].map(id=>({id,name:this.eventIdentity(e,id)?.name||'RACER',level:this.eventIdentity(e,id)?.level||0,score:Math.floor(this.eventMetric(e,id).points||0),zoneTimeMs:Math.floor(this.eventMetric(e,id).zoneMs||0)})).sort((a,b)=>b.score-a.score||b.zoneTimeMs-a.zoneTimeMs||a.name.localeCompare(b.name));}
  updateDriftMetrics(p,previous,current,t){
    const e=this.room.driftBattle;if(!e||e.status!=='running'||!e.participants.includes(p.id)||t<e.startAt||t>e.endAt||!previous)return;
    const zone=FREE_DRIFT_ZONES[e.zoneId];if(!zone){this.room.driftBattle=null;return;}const m=this.eventMetric(e,p.id),a=Number(previous.sampleTime||previous.serverTime),b=Number(current.sampleTime||current.serverTime),dt=Math.min(.15,Math.max(0,(b-a)/1000)),travel=Math.hypot(current.x-previous.x,current.y-previous.y);if(dt<=0)return;
    m.distance+=travel;if(insideCircle(current,zone)){m.insideMs+=dt*1000;if(travel>=.55&&current.speed>=12)m.activeMs+=dt*1000;
      const velocityAngle=Math.atan2(current.vy,current.vx),rawSlip=angleDelta(velocityAngle,current.angle),slip=Math.min(rawSlip,Math.PI-rawSlip),yaw=Math.abs(Number(current.yawRate)||0);
      const drifting=current.speed>=32&&(slip>=.08||yaw>=.38);
      if(drifting){const quality=Math.min(1.55,.78+Math.max(0,slip-.08)*.9+Math.min(.28,yaw*.08));m.score+=current.speed*dt*4.9*quality;m.driftMs=(Number(m.driftMs)||0)+dt*1000;}
    }
    if(t-(e.lastProgressAt||0)>=FREE_ACTIVITY_PROGRESS_MS){e.lastProgressAt=t;this.sendToPlayers(e.participants,{type:'activity_progress',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:e.id,startAt:e.startAt,endAt:e.endAt,zoneId:e.zoneId,standings:this.driftStandings(e),serverTime:t});}
  }
  tickKoth(e,t){
    if(!e||e.status!=='running')return;const from=Number(e.lastTickAt)||e.startAt;if(t<=from){e.lastTickAt=t;return;}const dtMs=Math.min(300,Math.max(0,t-from));e.lastTickAt=t;if(dtMs<=0)return;const zone=FREE_KOTH_ZONES[(e.zoneIndex||0)%FREE_KOTH_ZONES.length],inside=[];
    for(const id of e.participants){const p=this.room.players.find(x=>x.id===id);if(!p?.connected||!p.state||t-(p.lastStateAt||0)>650)continue;if(insideCircle(p.state,zone))inside.push(id);}
    if(!inside.length)return;const rate=inside.length===1?2:1,dt=dtMs/1000;for(const id of inside){const m=this.eventMetric(e,id);m.points+=dt*rate;m.zoneMs+=dtMs;}
  }
  updateKothMetrics(p,previous,current,t){
    const e=this.room.koth;if(!e||e.status!=='running'||!e.participants.includes(p.id)||t<e.startAt||t>e.endAt)return;this.tickKoth(e,t);if(previous){const m=this.eventMetric(e,p.id),a=Number(previous.sampleTime||previous.serverTime),b=Number(current.sampleTime||current.serverTime),dt=Math.min(250,Math.max(0,b-a)),travel=Math.hypot(current.x-previous.x,current.y-previous.y);m.distance+=travel;if(travel>=1.4&&current.speed>=12)m.activeMs+=dt;}
    if(t-(e.lastProgressAt||0)>=FREE_ACTIVITY_PROGRESS_MS){e.lastProgressAt=t;const zone=FREE_KOTH_ZONES[(e.zoneIndex||0)%FREE_KOTH_ZONES.length];this.sendToPlayers(e.participants,{type:'activity_progress',v:PROTOCOL_VERSION,activity:'koth',eventId:e.id,startAt:e.startAt,endAt:e.endAt,zoneIndex:e.zoneIndex||0,zone,finalZone:!!e.finalZone,standings:this.kothStandings(e),serverTime:t});}
  }
  async settleDrift(e,t){
    if(!e||e.settled)return;e.settled=true;const standings=this.driftStandings(e),results=[];
    for(let i=0;i<standings.length;i++){const row=standings[i],m=this.eventMetric(e,row.id),driftMs=Number(m.driftMs)||0,eligible=!e.disqualified?.[row.id]&&m.score>=400&&m.insideMs>=12000&&m.activeMs>=8000&&driftMs>=5000&&m.distance>=120;let reward=null;if(eligible&&!e.mediaEvent){const key=i===0?'DRIFT_FIRST':i===1?'DRIFT_SECOND':i===2?'DRIFT_THIRD':'DRIFT_PARTICIPATION';reward=await this.grantProgress(this.eventIdentity(e,row.id),'drift_battle',e.id,key,{place:i+1,score:row.score,insideMs:Math.round(m.insideMs),activeMs:Math.round(m.activeMs),driftMs:Math.round(driftMs),distance:Math.round(m.distance)});}results.push({...row,place:i+1,eligible,insideMs:Math.round(m.insideMs),activeMs:Math.round(m.activeMs),driftMs:Math.round(driftMs),distance:Math.round(m.distance),exp:reward?.expAdded||0,credits:reward?.creditsAdded||0,capped:!!reward?.capped});}
    this.sendToPlayers(e.participants,{type:'activity_result',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:e.id,results,serverTime:t});if(e.mediaEvent)await this.completeMediaEvent(e,results,{gameKey:'drift_battle'});this.room.driftBattle=null;await this.save();
  }
  async settleKoth(e,t){
    if(!e||e.settled)return;e.settled=true;this.tickKoth(e,t);const standings=this.kothStandings(e),results=[];
    for(let i=0;i<standings.length;i++){const row=standings[i],m=this.eventMetric(e,row.id),eligible=!e.disqualified?.[row.id]&&m.points>=10&&m.zoneMs>=10000&&(m.activeMs>=15000||m.distance>=250);let reward=null;if(eligible&&!e.mediaEvent){const key=i===0?'KOTH_FIRST':i===1?'KOTH_SECOND':i===2?'KOTH_THIRD':'KOTH_PARTICIPATION';reward=await this.grantProgress(this.eventIdentity(e,row.id),'koth',e.id,key,{place:i+1,score:row.score,zoneTimeMs:Math.round(m.zoneMs),activeMs:Math.round(m.activeMs),distance:Math.round(m.distance)});}results.push({...row,place:i+1,eligible,zoneTimeMs:Math.round(m.zoneMs),activeMs:Math.round(m.activeMs),distance:Math.round(m.distance),exp:reward?.expAdded||0,credits:reward?.creditsAdded||0,capped:!!reward?.capped});}
    this.sendToPlayers(e.participants,{type:'activity_result',v:PROTOCOL_VERSION,activity:'koth',eventId:e.id,results,serverTime:t});if(e.mediaEvent)await this.completeMediaEvent(e,results,{gameKey:'koth'});this.room.koth=null;await this.save();
  }
  async advanceFreeActivities(t){
    const drift=this.room.driftBattle;if(drift){const live=drift.participants.filter(id=>this.room.players.find(p=>p.id===id&&p.connected));if(!drift.mediaEvent&&drift.status==='waiting'&&t-drift.createdAt>=FREE_ACTIVITY_WAIT_MS){this.sendToPlayers(drift.participants,{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:drift.id,reason:'WAIT_TIMEOUT'});this.room.driftBattle=null;await this.save();}else if(drift.status==='countdown'&&t>=drift.startAt){if(live.length<(drift.settings?.minPlayers||2)){this.sendToPlayers(drift.participants,{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:drift.id,reason:'NOT_ENOUGH_PLAYERS'});this.room.driftBattle=null;}else{drift.status='running';if(drift.mediaEvent&&this.room.mediaEvent)this.room.mediaEvent.status='RUNNING';drift.endAt=drift.startAt+(drift.settings?.durationMs||FREE_DRIFT_DURATION_MS);drift.lastProgressAt=0;this.sendToPlayers(drift.participants,{type:'activity_start',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:drift.id,participants:[...drift.participants],zoneId:drift.zoneId,zone:FREE_DRIFT_ZONES[drift.zoneId],startAt:drift.startAt,endAt:drift.endAt,serverTime:t});await this.save();}}else if(drift.status==='running'&&t>=drift.endAt)await this.settleDrift(drift,t);}
    const koth=this.room.koth;if(koth){const live=koth.participants.filter(id=>this.room.players.find(p=>p.id===id&&p.connected));if(!koth.mediaEvent&&koth.status==='waiting'&&t-koth.createdAt>=FREE_ACTIVITY_WAIT_MS){this.sendToPlayers(koth.participants,{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'koth',eventId:koth.id,reason:'WAIT_TIMEOUT'});this.room.koth=null;await this.save();}else if(koth.status==='countdown'&&t>=koth.startAt){if(live.length<(koth.settings?.minPlayers||3)){this.sendToPlayers(koth.participants,{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'koth',eventId:koth.id,reason:'NOT_ENOUGH_PLAYERS'});this.room.koth=null;}else{koth.status='running';if(koth.mediaEvent&&this.room.mediaEvent)this.room.mediaEvent.status='RUNNING';koth.endAt=koth.startAt+(koth.settings?.durationMs||FREE_KOTH_DURATION_MS);koth.lastTickAt=koth.startAt;koth.zoneIndex=0;koth.finalZone=false;this.sendToPlayers(koth.participants,{type:'activity_start',v:PROTOCOL_VERSION,activity:'koth',eventId:koth.id,participants:[...koth.participants],startAt:koth.startAt,endAt:koth.endAt,zoneIndex:0,zone:FREE_KOTH_ZONES[0],serverTime:t});await this.save();}}else if(koth.status==='running'){this.tickKoth(koth,t);const elapsed=Math.max(0,t-koth.startAt);let index=0;for(let i=0;i<FREE_KOTH_SWITCH_MS.length;i++)if(elapsed>=FREE_KOTH_SWITCH_MS[i])index=i;if(index!==koth.zoneIndex){koth.zoneIndex=index;koth.finalZone=index===FREE_KOTH_SWITCH_MS.length-1;this.sendToPlayers(koth.participants,{type:'activity_zone',v:PROTOCOL_VERSION,activity:'koth',eventId:koth.id,zoneIndex:index,zone:FREE_KOTH_ZONES[index%FREE_KOTH_ZONES.length],finalZone:koth.finalZone,serverTime:t});await this.save();}if(t>=koth.endAt)await this.settleKoth(koth,t);}}
    await this.advanceMinigames(t);
  }

  publicFreeRoom(includePendingId=null){
    const r=this.room,live=r.players.filter(p=>p.connected||p.id===includePendingId),media=r.mediaEvent||null;return {protocol:PROTOCOL_VERSION,mode:'freeroam',serverId:r.serverId,maxPlayers:media?.settings?.maxPlayers||FREE_MAX_PLAYERS,eventsDisabled:!!r.eventsDisabled,records:r.records||{speed:0,drift:0},mediaEvent:media?{id:media.id,code:media.code,title:media.title,gameKey:media.gameKey,creatorUserId:media.creatorUserId,creatorUsername:media.creatorUsername,organizerMode:media.organizerMode,accessType:media.accessType,prize:Number(media.prize)||0,status:media.status||'WAITING',settings:media.settings||{},result:media.result||null}:null,activities:{drift:this.publicActivity(r.driftBattle),koth:this.publicActivity(r.koth),minigames:Object.values(r.minigames||{}).map(e=>this.publicMinigame(e))},players:live.map(p=>({id:p.id,userId:p.userId||null,crew:p.crew||null,name:p.name,owner:p.owner===true,media:!!p.media,spectator:!!p.spectator,mediaReady:!!p.mediaReady,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0))),connected:true,liveryId:p.liveryId,effectId:p.effectId,colorId:p.colorId||'stock',vinylId:p.vinylId||'none',level:Math.max(0,Math.min(100,Math.floor(Number(p.level)||0))),totalExp:Math.max(0,Math.floor(Number(p.totalExp)||0)),state:p.spectator?null:(p.state||null)}))};
  }
  mediaActivity(){
    const media=this.room?.mediaEvent;if(!media)return null;
    if(media.gameKey==='drift_battle')return this.room.driftBattle;
    if(media.gameKey==='koth')return this.room.koth;
    return this.room.minigames?.[media.gameKey]||null;
  }
  ensureMediaActivity(t=now()){const media=this.room?.mediaEvent;if(!media)return null;let e=this.mediaActivity();if(e)return e;const settings=media.settings||{};if(media.gameKey==='drift_battle')e=this.room.driftBattle=this.makeEvent('drift_battle',[],t,{zoneId:'harbor',mediaEvent:true,settings});else if(media.gameKey==='koth')e=this.room.koth=this.makeEvent('koth',[],t,{zoneIndex:0,finalZone:false,lastTickAt:0,mediaEvent:true,settings});else if(FREE_MINIGAME_CONFIG[media.gameKey])e=this.room.minigames[media.gameKey]=this.makeEvent('minigame',[],t,{gameKey:media.gameKey,points:{},strikes:{},score:{red:0,blue:0},mediaEvent:true,settings});return e;}
  mediaPlayerIds(){return (this.room?.players||[]).filter(p=>!p.spectator).map(p=>p.id);}
  mediaSpawnMap(ids){
    const media=this.room?.mediaEvent,spawns={};if(!media)return spawns;
    const e=this.mediaActivity();
    if(!['drift_battle','koth'].includes(media.gameKey))return e?.spawns||spawns;
    const zone=media.gameKey==='drift_battle'?(FREE_DRIFT_ZONES.harbor||{x:670,y:2310,r:320}):(FREE_KOTH_ZONES[0]||{x:2850,y:980,r:170});
    ids.forEach((id,i)=>{const a=(i/Math.max(1,ids.length))*Math.PI*2,r=Math.max(90,Math.min(180,(zone.r||180)*.68)),spawn={x:zone.x+Math.cos(a)*r,y:zone.y+Math.sin(a)*r,angle:a+Math.PI};spawns[id]=spawn;const p=this.room.players.find(x=>x.id===id);if(p){const t=now();p.state={seq:p.lastSeq,x:spawn.x,y:spawn.y,vx:0,vy:0,angle:spawn.angle,speed:0,yawRate:0,sampleTime:t,serverTime:t};p.lastStateAt=t-100;p.lastSampleTime=t;}});
    return spawns;
  }
  async completeMediaEvent(e,results,{draw=false,gameKey=null,score=null}={}){
    const media=this.room?.mediaEvent;if(!media||media.status==='FINISHED'||media.status==='CANCELLED')return null;
    let winners=[];
    if(!draw){
      if((gameKey||media.gameKey).startsWith('football'))winners=(results||[]).filter(r=>r.won).map(r=>this.eventIdentity(e,r.id)?.userId).filter(Boolean);
      else{const top=(results||[])[0];if(top)winners=[this.eventIdentity(e,top.id)?.userId].filter(Boolean);}
    }
    let settlement;
    if(draw||!winners.length)settlement=await refundMediaEvent(this.env,media.id,draw?'DRAW':'NO_WINNER');
    else settlement=await settleMediaEvent(this.env,media.id,winners,{gameKey:gameKey||media.gameKey,score:score||null,results:(results||[]).map(r=>({id:r.id,name:r.name,place:r.place,score:r.score,team:r.team||null,elapsedMs:r.elapsedMs??null}))});
    media.status=settlement?.ok?'FINISHED':'FAILED';media.result={winners,draw:!!draw,settlement};
    this.broadcast({type:'media_event_result',v:PROTOCOL_VERSION,eventId:media.id,gameKey:gameKey||media.gameKey,winners,draw:!!draw,prize:media.prize||0,settlement,results,serverTime:now()});
    return settlement;
  }
  async mediaStart(ws,p,t=now()){
    const media=this.room?.mediaEvent;if(!media)return this.error(ws,'MEDIA_EVENT_REQUIRED','Это не MEDIA EVENT');
    if(p?.userId!==media.creatorUserId&&!p?.owner)return this.error(ws,'MEDIA_OWNER_ONLY','Запустить мероприятие может только организатор');
    if(!['WAITING','STARTING'].includes(media.status||'WAITING'))return this.error(ws,'MEDIA_ALREADY_STARTED','Мероприятие уже запущено');
    const e=this.ensureMediaActivity(t);if(!e)return this.error(ws,'MEDIA_ACTIVITY_MISSING','Игровая активность не найдена');
    const players=this.room.players.filter(x=>!x.spectator&&x.connected),min=Math.max(2,Number(media.settings?.minPlayers)||2);
    if(players.length<min)return this.error(ws,'NOT_ENOUGH_PLAYERS',`Нужно минимум ${min} игроков`);
    const notReady=players.filter(x=>!x.mediaReady);if(notReady.length)return this.error(ws,'PLAYERS_NOT_READY','Не все игроки нажали ГОТОВ');
    e.participants=players.map(x=>x.id);e.identities={};e.metrics={};for(const x of players)this.syncEventIdentity(e,x);e.mediaEvent=true;e.settings=media.settings||{};e.status='countdown';e.startAt=t+3000;e.endAt=e.startAt+(Number(media.settings?.durationMs)||FREE_MINIGAME_CONFIG[media.gameKey]?.durationMs||90000);e.createdAt=t;
    media.status='STARTING';await markMediaEventRunning(this.env,media.id);
    if(media.gameKey==='drift_battle')this.sendToPlayers(e.participants,{type:'activity_lobby',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:e.id,zoneId:e.zoneId,zone:FREE_DRIFT_ZONES[e.zoneId],participants:[...e.participants],names:this.eventNames(e),levels:this.eventLevels(e),status:e.status,startAt:e.startAt,minPlayers:min,maxPlayers:media.settings?.maxPlayers||12,durationMs:media.settings?.durationMs||FREE_DRIFT_DURATION_MS,mediaEvent:true,serverTime:t});
    else if(media.gameKey==='koth')this.sendToPlayers(e.participants,{type:'activity_lobby',v:PROTOCOL_VERSION,activity:'koth',eventId:e.id,participants:[...e.participants],names:this.eventNames(e),levels:this.eventLevels(e),status:e.status,startAt:e.startAt,minPlayers:min,maxPlayers:media.settings?.maxPlayers||12,durationMs:media.settings?.durationMs||FREE_KOTH_DURATION_MS,mediaEvent:true,serverTime:t});
    else this.sendToPlayers(e.participants,{type:'minigame_lobby',v:PROTOCOL_VERSION,...this.publicMinigame(e),serverTime:t});
    const spawns=this.mediaSpawnMap(e.participants);if(Object.keys(spawns).length)this.broadcast({type:'media_event_spawn',v:PROTOCOL_VERSION,eventId:media.id,spawns,startAt:e.startAt,serverTime:t});
    await this.save();this.broadcast({type:'media_event_state',v:PROTOCOL_VERSION,mediaEvent:this.publicFreeRoom().mediaEvent,room:this.publicFreeRoom(),serverTime:t});
  }
  async mediaReady(ws,p,ready=true){
    const media=this.room?.mediaEvent;if(!media||p.spectator)return this.error(ws,'MEDIA_PLAYER_ONLY','Наблюдатель не участвует в READY');if(!['WAITING','STARTING'].includes(media.status||'WAITING'))return this.error(ws,'MEDIA_ALREADY_STARTED','Мероприятие уже запущено');p.mediaReady=ready!==false;await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,room:this.publicFreeRoom(),serverTime:now()});
  }
  async mediaShuffle(ws,p){
    const media=this.room?.mediaEvent,e=this.mediaActivity();if(!media||!e)return;if(p?.userId!==media.creatorUserId&&!p?.owner)return this.error(ws,'MEDIA_OWNER_ONLY','Только организатор');if(!String(media.gameKey).startsWith('football')||!['waiting','countdown'].includes(e.status))return this.error(ws,'MEDIA_SHUFFLE_UNAVAILABLE','Перемешивание доступно только до старта футбола');e.participants=[...e.participants].sort(()=>Math.random()-.5);await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,room:this.publicFreeRoom(),serverTime:now()});
  }
  freeDragForPlayer(playerId){
    const challengeId=this.room?.players?.find(x=>x.id===playerId)?.dragChallengeId;if(!challengeId)return null;
    const challenge=this.room?.dragChallenges?.[challengeId];return challenge&&challenge.ids?.includes(playerId)?challenge:null;
  }
  sendToPlayers(ids,obj){
    const wanted=new Set(ids||[]),text=JSON.stringify(obj),mediaAudience=!!this.room?.mediaEvent&&/^(?:minigame_|activity_|media_)/.test(String(obj?.type||''));for(const socket of this.ctx.getWebSockets()){const a=socket.deserializeAttachment?.();if(!mediaAudience&&!wanted.has(a?.playerId))continue;try{socket.send(text);}catch{}}
  }
  sharedFreeActivity(aId,bId){
    const drag=this.freeDragForPlayer(aId);if(drag?.ids?.includes(bId))return true;
    for(const e of [this.room?.driftBattle,this.room?.koth,...Object.values(this.room?.minigames||{})])if(e&&['waiting','countdown','running'].includes(e.status)&&e.participants?.includes(aId)&&e.participants?.includes(bId))return true;
    return false;
  }
  broadcastFreeState(source,t,except=null){
    const text=JSON.stringify({type:'free_state',v:PROTOCOL_VERSION,playerId:source.id,serverTime:t,state:source.state}),farPulse=t-(source.lastFarBroadcastAt||0)>=FREE_FAR_STATE_RATE_MS;
    for(const socket of this.ctx.getWebSockets()){
      if(socket===except)continue;const a=socket.deserializeAttachment?.(),target=this.room.players.find(p=>p.id===a?.playerId&&p.connected);if(!target)continue;
      const near=!!target.state&&!!source.state&&Math.hypot(target.state.x-source.state.x,target.state.y-source.state.y)<=FREE_NEAR_RADIUS,mediaWatch=!!this.room?.mediaEvent&&!!target.spectator&&!!this.mediaActivity()?.participants?.includes(source.id),priority=mediaWatch||this.sharedFreeActivity(source.id,target.id);
      if(!near&&!priority&&!farPulse)continue;try{socket.send(text);}catch{}
    }
    if(farPulse)source.lastFarBroadcastAt=t;
  }
  projectFreeDragState(player,asOf){
    const s=player?.state;if(!s)return null;const basis=Number.isFinite(s.sampleTime)?s.sampleTime:(s.serverTime||asOf),dt=Math.max(0,Math.min(.24,(asOf-basis)/1000));
    return {x:s.x+s.vx*dt,y:s.y+s.vy*dt,vx:s.vx,vy:s.vy,speed:s.speed,sampleTime:basis,latencyMs:Math.max(0,Math.min(999,asOf-basis))};
  }
  broadcastFreeDragProgress(challenge,asOf,force=false){
    if(!challenge||(!force&&asOf-(challenge.lastProgressAt||0)<FREE_DRAG_PROGRESS_RATE_MS))return;challenge.lastProgressAt=asOf;
    const positions={},latencies={};for(const id of challenge.ids){const player=this.room.players.find(x=>x.id===id),projected=this.projectFreeDragState(player,asOf);if(!projected)continue;positions[id]=projected.x;latencies[id]=Math.round(projected.latencyMs);}
    const [a,b]=challenge.ids,gap=Number.isFinite(positions[a])&&Number.isFinite(positions[b])?positions[a]-positions[b]:0,leadId=Math.abs(gap)<2?null:(gap>0?a:b);
    this.sendToPlayers(challenge.ids,{type:'activity_progress',v:PROTOCOL_VERSION,activity:'drag',challengeId:challenge.id,asOf,startAt:challenge.startAt,finishX:FREE_DRAG_FINISH_X,positions,latencies,leadId,gap:Math.abs(gap)});
  }
  dragCrossingTime(previous,current,startAt){
    if(!previous||!current)return null;const aTime=Number(previous.sampleTime),bTime=Number(current.sampleTime);if(!Number.isFinite(aTime)||!Number.isFinite(bTime)||bTime<=aTime)return null;
    const dx=current.x-previous.x;if(previous.x>=FREE_DRAG_FINISH_X||current.x<FREE_DRAG_FINISH_X||dx<=0)return null;const alpha=(FREE_DRAG_FINISH_X-previous.x)/dx;if(alpha<0||alpha>1)return null;
    const y=previous.y+(current.y-previous.y)*alpha;if(y<FREE_DRAG_Y_MIN||y>FREE_DRAG_Y_MAX)return null;const crossedAt=aTime+(bTime-aTime)*alpha;if(crossedAt<startAt-35)return null;return Math.max(startAt,crossedAt);
  }
  async freeDragBalances(ids){
    const balances={};for(const id of ids||[]){const racer=this.room.players.find(p=>p.id===id);if(!racer?.userId||!this.env.DB){balances[id]=0;continue;}const row=await this.env.DB.prepare("SELECT COALESCE(json_extract(save_json,'$.credits'),0) AS credits FROM player_saves WHERE user_id=? LIMIT 1").bind(racer.userId).first();balances[id]=Math.max(0,Math.floor(Number(row?.credits)||0));}return balances;
  }
  async lockFreeDragWager(challenge){
    const wager=Math.max(0,Math.floor(Number(challenge?.wager)||0));challenge.wager=wager;challenge.pot=wager*2;if(!wager){challenge.wagerLocked=false;return {ok:true,balances:{}};}if(!validFreeDragWager(wager)||!this.env.DB)return {ok:false,code:'INVALID_WAGER'};
    const racers=(challenge.ids||[]).map(id=>this.room.players.find(p=>p.id===id));if(racers.length!==2||racers.some(p=>!p?.userId)||racers[0].userId===racers[1].userId)return {ok:false,code:'DRAG_ACCOUNT_REQUIRED'};
    const before=await this.freeDragBalances(challenge.ids),badIds=challenge.ids.filter(id=>(before[id]||0)<wager);if(badIds.length)return {ok:false,code:'INSUFFICIENT_CR',badIds,balances:before};
    const [a,b]=racers,t=now();const result=await this.env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',MAX(0,COALESCE(json_extract(save_json,'$.credits'),0)-?)),revision=revision+1,updated_at=? WHERE user_id IN (?,?) AND (SELECT COUNT(*) FROM player_saves WHERE user_id IN (?,?) AND COALESCE(json_extract(save_json,'$.credits'),0)>=?)=2`).bind(wager,t,a.userId,b.userId,a.userId,b.userId,wager).run();
    if(Number(result?.meta?.changes)!==2){const balances=await this.freeDragBalances(challenge.ids);return {ok:false,code:'INSUFFICIENT_CR',badIds:challenge.ids.filter(id=>(balances[id]||0)<wager),balances};}
    challenge.wagerLocked=true;challenge.wagerSettled=false;challenge.wagerLockedAt=t;const balances=await this.freeDragBalances(challenge.ids);
    for(const racer of racers){try{await writeGameLog(this.env,{category:'system',eventType:'free_drag_wager_locked',actorUserId:racer.userId,actorUsername:this.logUsername(racer),actorRole:this.logRole(racer),targetUserId:racer.userId,targetUsername:this.logUsername(racer),serverId:this.room.serverId||'free',source:'FREE_DRAG',subject:'DRAG · ставка заблокирована',relatedId:challenge.id,metadata:{wager,pot:challenge.pot,playerId:racer.id},createdAt:t});}catch{}}
    return {ok:true,balances};
  }
  async settleFreeDragWager(challenge,{draw=false,winnerId=null,reason='FINISH'}={}){
    const wager=Math.max(0,Math.floor(Number(challenge?.wager)||0));if(!wager||!challenge?.wagerLocked)return {ok:true,balances:{}};if(challenge.wagerSettled)return {ok:true,balances:await this.freeDragBalances(challenge.ids)};if(!this.env.DB)return {ok:false,code:'WAGER_DB_UNAVAILABLE'};
    const racers=challenge.ids.map(id=>this.room.players.find(p=>p.id===id)),t=now();if(racers.some(p=>!p?.userId))return {ok:false,code:'DRAG_ACCOUNT_REQUIRED'};
    if(draw){const [a,b]=racers;const result=await this.env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',MIN(999999999,COALESCE(json_extract(save_json,'$.credits'),0)+?)),revision=revision+1,updated_at=? WHERE user_id IN (?,?)`).bind(wager,t,a.userId,b.userId).run();if(Number(result?.meta?.changes)!==2)return {ok:false,code:'WAGER_REFUND_FAILED'};}
    else{const winner=racers.find(p=>p.id===winnerId);if(!winner)return {ok:false,code:'WAGER_WINNER_MISSING'};const result=await this.env.DB.prepare(`UPDATE player_saves SET save_json=json_set(save_json,'$.credits',MIN(999999999,COALESCE(json_extract(save_json,'$.credits'),0)+?)),revision=revision+1,updated_at=? WHERE user_id=?`).bind(challenge.pot||wager*2,t,winner.userId).run();if(Number(result?.meta?.changes)!==1)return {ok:false,code:'WAGER_PAYOUT_FAILED'};}
    challenge.wagerSettled=true;challenge.wagerSettlement=draw?'refund':'winner';challenge.wagerSettledAt=t;const balances=await this.freeDragBalances(challenge.ids);
    try{const winner=winnerId?racers.find(p=>p.id===winnerId):null;await writeGameLog(this.env,{category:'system',eventType:draw?'free_drag_wager_refund':'free_drag_wager_payout',actorUserId:winner?.userId||null,actorUsername:winner?this.logUsername(winner):'SYSTEM',actorRole:winner?this.logRole(winner):'SYSTEM',targetUserId:winner?.userId||null,targetUsername:winner?this.logUsername(winner):'',serverId:this.room.serverId||'free',source:'FREE_DRAG',subject:draw?'DRAG · возврат ставки':'DRAG · выплата банка',reason,relatedId:challenge.id,metadata:{wager,pot:challenge.pot||wager*2,winnerId,draw,balances},createdAt:t});}catch{}
    return {ok:true,balances};
  }
  async refundFreeDragWager(challenge,reason='CANCELLED'){
    if(!challenge?.wagerLocked||challenge.wagerSettled||!Number(challenge.wager))return {ok:true,balances:{}};return this.settleFreeDragWager(challenge,{draw:true,reason});
  }
  clearFreeDragChallenge(challenge){
    if(!challenge)return;for(const id of challenge.ids||[]){const racer=this.room.players.find(x=>x.id===id);if(racer?.dragChallengeId===challenge.id)delete racer.dragChallengeId;if(racer)racer.dragWager=0;}delete this.room.dragChallenges?.[challenge.id];
  }
  async cancelFreeDrag(challenge,reason='CANCELLED',culpritId=null,allowForfeit=false){
    if(!challenge)return;const afterStart=now()>=Number(challenge.startAt||Infinity),otherId=culpritId&&(challenge.ids||[]).find(id=>id!==culpritId),other=this.room.players.find(p=>p.id===otherId);if(allowForfeit&&afterStart&&otherId&&other?.connected&&challenge.wagerLocked&&Number(challenge.wager)>0){const payout=await this.settleFreeDragWager(challenge,{draw:false,winnerId:otherId,reason:'FORFEIT'});if(payout.ok){const names=Object.fromEntries(challenge.ids.map(id=>[id,this.room.players.find(x=>x.id===id)?.name||'RACER']));this.sendToPlayers(challenge.ids,{type:'activity_result',v:PROTOCOL_VERSION,activity:'drag',challengeId:challenge.id,participants:[...challenge.ids],winnerId:otherId,times:{},names,gapMs:0,draw:false,photoFinish:false,forfeit:true,wager:challenge.wager,pot:challenge.pot,balances:payout.balances,serverTime:now()});this.clearFreeDragChallenge(challenge);return;}}
    const refund=await this.refundFreeDragWager(challenge,reason);this.sendToPlayers(challenge.ids||[],{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'drag',challengeId:challenge.id,reason,wagerRefunded:!!Number(challenge.wager)&&refund.ok,wager:Number(challenge.wager)||0,balances:refund.balances||{},serverTime:now()});this.clearFreeDragChallenge(challenge);
  }
  async settleFreeDrag(challenge){
    if(!challenge||challenge.settled)return false;if(!challenge.ids.every(id=>Number.isFinite(challenge.finishes?.[id])))return false;
    const sorted=[...challenge.ids].sort((a,b)=>challenge.finishes[a]-challenge.finishes[b]),winnerId=sorted[0],times=Object.fromEntries(challenge.ids.map(id=>[id,Math.max(0,Math.round(challenge.finishes[id]-challenge.startAt))])),gapMs=Math.max(0,Math.round(challenge.finishes[sorted[1]]-challenge.finishes[winnerId])),draw=gapMs<=10,names=Object.fromEntries(challenge.ids.map(id=>[id,this.room.players.find(x=>x.id===id)?.name||'RACER']));
    const money=await this.settleFreeDragWager(challenge,{draw,winnerId,reason:'FINISH'});if(!money.ok){challenge.wagerError=money.code||'WAGER_SETTLEMENT_FAILED';await this.save();return false;}challenge.settled=true;
    for(const pid of challenge.ids){const racer=this.room.players.find(p=>p.id===pid);await recordResult(this.env,challenge.id,racer?.userId,'drag',!draw&&pid===winnerId,times[pid]);const rewardKey=draw?'DRAG_DRAW':(pid===winnerId?'DRAG_WIN':'DRAG_LOSS');await this.grantProgress(racer,'drag',challenge.id,rewardKey,{timeMs:times[pid],gapMs,draw,opponentId:challenge.ids.find(id=>id!==pid)||null,wager:Number(challenge.wager)||0,pot:Number(challenge.pot)||0});}
    this.sendToPlayers(challenge.ids,{type:'activity_result',v:PROTOCOL_VERSION,activity:'drag',challengeId:challenge.id,participants:[...challenge.ids],winnerId,times,names,gapMs,draw,photoFinish:gapMs<=100,wager:Number(challenge.wager)||0,pot:Number(challenge.pot)||0,balances:money.balances||{},serverTime:now()});
    this.clearFreeDragChallenge(challenge);await this.save();return true;
  }
  async updateFreeDragFromState(player,previous,current,receivedAt){
    const challenge=this.freeDragForPlayer(player.id);if(!challenge)return;this.broadcastFreeDragProgress(challenge,receivedAt);if(challenge.finishes[player.id]){if(challenge.ids.every(id=>Number.isFinite(challenge.finishes?.[id])))await this.settleFreeDrag(challenge);return;}
    const crossedAt=this.dragCrossingTime(previous,current,challenge.startAt);if(!Number.isFinite(crossedAt))return;challenge.finishes[player.id]=crossedAt;
    this.sendToPlayers(challenge.ids,{type:'activity_finish_confirmed',v:PROTOCOL_VERSION,activity:'drag',challengeId:challenge.id,playerId:player.id,elapsedMs:Math.max(0,Math.round(crossedAt-challenge.startAt)),serverTime:receivedAt});this.broadcastFreeDragProgress(challenge,receivedAt,true);
    if(await this.settleFreeDrag(challenge))return;await this.save();
  }
  async refreshPublicIdentity(p){
    const t=now();if(!p?.userId||t-(p.publicIdentityCheckedAt||0)<30000)return false;p.publicIdentityCheckedAt=t;
    const [crew,adminLevel,media]=await Promise.all([crewIdentity(this.env,p.userId),staffOnlineLevel(this.env,p.userId),mediaRole(this.env,p.userId)]);let changed=false;
    if(JSON.stringify(crew)!==JSON.stringify(p.crew)){p.crew=crew;changed=true;}
    const mediaFlag=!!media;if(mediaFlag!==!!p.media){p.media=mediaFlag;changed=true;}
    const level=Math.max(0,Math.min(8,Math.floor(Number(adminLevel)||0)));if(level!==Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0)))){p.adminLevel=level;changed=true;}
    return changed;
  }
  async refreshOwnerLimits(p){if(!p.limitsAt||now()-p.limitsAt>15000){const limits=await playerLimits(this.env,p);p.speedLimit=limits.speed;p.yawLimit=limits.yaw;p.limitsAt=now();}}
  async handleFreeMessage(ws,p,m){
    if(m.type==='loadout_update'){
      if(!p.userId||!this.env.DB)return this.error(ws,'AUTH_REQUIRED','Войдите в аккаунт.');
      if(!insideGarageZone(p.state))return this.error(ws,'GARAGE_LOCATION','Подъедьте ближе к въезду гаража для смены машины.');
      if(this.freeDragForPlayer(p.id)||this.sharedFreeActivity(p.id,p.id))return this.error(ws,'GARAGE_BUSY','Нельзя менять машину во время активности.');
      const requested=safeLoadout(m.loadout||{}),row=await this.env.DB.prepare('SELECT save_json FROM player_saves WHERE user_id=? LIMIT 1').bind(p.userId).first();
      let save={};try{save=JSON.parse(row?.save_json||'{}')||{};}catch{}
      const ownedCars=Array.isArray(save.ownedLiveries)?save.ownedLiveries:['apexLime'],ownedEffects=Array.isArray(save.ownedEffects)?save.ownedEffects:['standard'];
      if(!ownedCars.includes(requested.liveryId))return this.error(ws,'CAR_NOT_OWNED','Эта машина отсутствует в вашем гараже.');
      const effectId=ownedEffects.includes(requested.effectId)?requested.effectId:'standard',custom=save.carCustomizations?.[requested.liveryId]||{};
      const ownedColors=new Set(['stock',...(Array.isArray(custom.ownedColors)?custom.ownedColors:[])]),ownedVinyls=new Set(['none',...(Array.isArray(custom.ownedVinyls)?custom.ownedVinyls:[])]);
      const colorId=STYLE_COLORS.has(custom.colorId)&&ownedColors.has(custom.colorId)?custom.colorId:'stock',vinylId=STYLE_VINYLS.has(custom.vinylId)&&ownedVinyls.has(custom.vinylId)?custom.vinylId:'none';
      p.liveryId=requested.liveryId;p.effectId=effectId;p.colorId=colorId;p.vinylId=vinylId;
      p.state={...(p.state||{}),x:FREE_GARAGE.exitX,y:FREE_GARAGE.exitY,vx:0,vy:0,speed:0,angle:FREE_GARAGE.exitAngle,sampleTime:now(),serverTime:now()};
      await this.save();const room=this.publicFreeRoom();this.send(ws,{type:'loadout_updated',v:PROTOCOL_VERSION,loadout:{liveryId:p.liveryId,effectId:p.effectId,colorId:p.colorId,vinylId:p.vinylId},spawn:{x:FREE_GARAGE.exitX,y:FREE_GARAGE.exitY,angle:FREE_GARAGE.exitAngle},serverTime:now()});this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room});return;
    }
    if(m.type==='ping'){if(await this.refreshPublicIdentity(p)){await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,room:this.publicFreeRoom(),serverTime:now()});}if(typeof m.clientTime==='number'){const t=now(),probeId=crypto.randomUUID().slice(0,12);p.syncProbeId=probeId;p.syncProbeAt=t;this.send(ws,{type:'pong',v:PROTOCOL_VERSION,clientTime:m.clientTime,serverTime:t,probeId});}return;}
    if(m.type==='sync_echo'){if(typeof m.probeId!=='string'||m.probeId!==p.syncProbeId||!p.syncProbeAt)return;const rtt=now()-p.syncProbeAt;delete p.syncProbeId;delete p.syncProbeAt;if(rtt>=0&&rtt<=2000)p.netRttMs=Number.isFinite(p.netRttMs)?Math.min(rtt,p.netRttMs+8):rtt;return;}
    if(this.room.mediaEvent&&m.type==='media_ready'){await this.mediaReady(ws,p,m.ready!==false);return;}
    if(this.room.mediaEvent&&m.type==='media_start'){await this.mediaStart(ws,p,now());return;}
    if(this.room.mediaEvent&&m.type==='media_shuffle'){await this.mediaShuffle(ws,p);return;}
    if(this.room.mediaEvent&&p.spectator&&['free_state','football_touch','activity_join','activity_leave','owner_minigame_start','loadout_update','record'].includes(m.type))return;
    if(this.room.mediaEvent&&['activity_join','owner_minigame_start'].includes(m.type))return this.error(ws,'MEDIA_EVENT_LOCKED','В MEDIA EVENT активность выбирает организатор');
    if(m.type==='football_touch'){
      const t=now(),e=this.minigameForPlayer(p.id),cfg=e&&FREE_MINIGAME_CONFIG[e.gameKey];if(!e||cfg?.kind!=='football'||e.status!=='running'||t<e.startAt||t>e.endAt)return;if(t-(p.lastFootballTouchPacketAt||0)<24)return;p.lastFootballTouchPacketAt=t;
      this.stepFootballBall(e,t);const touch=this.validatedFootballTouchState(p,m.state,t);this.applyFootballContact(e,p,touch,t,true);return;
    }
    if(m.type==='free_state'){
      await this.refreshOwnerLimits(p);
      const t=now(),s=m.state,drag=this.freeDragForPlayer(p.id),mg=this.minigameForPlayer(p.id),football=mg&&FREE_MINIGAME_CONFIG[mg.gameKey]?.kind==='football'&&mg.status==='running',minRate=drag?FREE_DRAG_STATE_RATE_MS:football?FREE_FOOTBALL_STATE_RATE_MS:FREE_STATE_RATE_MS;if(!s||!Number.isInteger(s.seq)||s.seq<=p.lastSeq||t-p.lastStateAt<minRate)return;
      if(![s.x,s.y,s.vx,s.vy,s.angle,s.speed].every(Number.isFinite)||s.x<0||s.x>FREE_WORLD.w||s.y<0||s.y>FREE_WORLD.h||Math.abs(s.vx)>Math.max(1200,p.speedLimit*2)||Math.abs(s.vy)>Math.max(1200,p.speedLimit*2)||s.speed<0||s.speed>p.speedLimit)return;
      const claimed=Number(s.sampleTime),rtt=Number.isFinite(p.netRttMs)?Math.max(0,Math.min(500,p.netRttMs)):null,expected=rtt===null?t:t-rtt*.5,allowance=rtt===null?90:Math.max(28,Math.min(75,24+rtt*.18)),trusted=Number.isFinite(claimed)?Math.max(expected-allowance,Math.min(expected+allowance,claimed)):expected,bounded=Math.max(t-FREE_DRAG_SAMPLE_MAX_AGE_MS,Math.min(t+FREE_DRAG_SAMPLE_FUTURE_MS,trusted)),sampleTime=Math.max((p.lastSampleTime||0)+1,bounded);
      const previous=p.state;if(previous){const dt=Math.max(.02,(sampleTime-(previous.sampleTime||previous.serverTime||sampleTime-50))/1000),travel=Math.hypot(s.x-previous.x,s.y-previous.y);if(travel>Math.max(150,dt*Math.max(1250,p.speedLimit*2)))return;}
      p.lastSeq=s.seq;p.lastStateAt=t;p.lastSampleTime=sampleTime;p.state={seq:s.seq,x:s.x,y:s.y,vx:s.vx,vy:s.vy,angle:s.angle,speed:s.speed,yawRate:Number.isFinite(s.yawRate)?Math.max(-20,Math.min(20,s.yawRate)):0,sampleTime,serverTime:t};await this.advanceFreeActivities(t);await this.trackOnlineActivity(p,previous,p.state);this.updateDriftMetrics(p,previous,p.state,t);this.updateKothMetrics(p,previous,p.state,t);this.updateMinigameMetrics(p,previous,p.state,t);this.broadcastFreeState(p,t,ws);await this.updateFreeDragFromState(p,previous,p.state,t);return;
    }
    if(m.type==='chat'){
      const t=now(),text=String(m.text||'').trim().replace(/\s+/g,' ').slice(0,180);if(!text||t-(p.lastChatAt||0)<700)return;
      if(p.userId&&(!p.muteCheckedAt||t-p.muteCheckedAt>10000)){p.muteCheckedAt=t;p.activeMute=await activeMute(this.env,p.userId,t);}
      if(p.activeMute&&Number(p.activeMute.expiresAt)>t){this.send(ws,{type:'free_chat_blocked',v:PROTOCOL_VERSION,reason:p.activeMute.reason,expiresAt:p.activeMute.expiresAt,serverTime:t});return;}
      p.activeMute=null;p.lastChatAt=t;const prefix=p.owner?'OWNER':this.logUsername(p).toLowerCase()==='mary'?'QUEEN':p.media?'MEDIA':Number(p.adminLevel)>0?`ADMIN ${Math.max(1,Math.min(8,Math.floor(Number(p.adminLevel))))}`:'';
      try{await writeGameLog(this.env,{category:'chat',eventType:'chat_message',actorUserId:p.userId||null,actorUsername:this.logUsername(p),actorRole:this.logRole(p),targetUserId:p.userId||null,targetUsername:this.logUsername(p),serverId:this.room.serverId||'free',source:'CHAT',subject:'Сообщение чата',message:text,relatedId:p.logSessionId||'',metadata:{prefix,playerId:p.id,level:p.level||0,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0))),deleted:false},createdAt:t});}catch(e){console.error('chat log',e);}
      this.broadcast({type:'free_chat',v:PROTOCOL_VERSION,playerId:p.id,name:p.name,owner:p.owner===true,media:!!p.media,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0))),level:p.level||0,text,serverTime:t});return;
    }
    if(m.type==='record'){
      const kind=m.kind,value=Math.floor(Number(m.value)||0);if(!['speed','drift'].includes(kind)||value<=0||value>(kind==='speed'?(p.speedLimit||650):100000000))return;
      if(value>(this.room.records?.[kind]||0)){this.room.records[kind]=value;await this.save();this.broadcast({type:'free_record',v:PROTOCOL_VERSION,kind,value,playerId:p.id,name:p.name,serverTime:now()});}return;
    }
    if(m.type==='activity_join'&&['drift_battle','koth','minigame','drag'].includes(m.activity)&&this.room.eventsDisabled&&!p.owner){this.error(ws,'EVENTS_DISABLED','Игровые активности временно отключены ROOT');return;}
    if(m.type==='activity_join'&&m.activity==='drift_battle'){await this.joinDriftBattle(ws,p,String(m.zoneId||''),now());return;}
    if(m.type==='activity_join'&&m.activity==='koth'){await this.joinKoth(ws,p,now());return;}
    if(m.type==='activity_join'&&m.activity==='minigame'){await this.joinMinigame(ws,p,String(m.gameKey||''),now());return;}
    if(m.type==='owner_minigame_start'){await this.ownerStartMinigame(ws,p,now());return;}
    if(m.type==='activity_leave'&&['drift_battle','koth'].includes(m.activity)){await this.leaveLiveActivity(ws,p,m.activity,now());return;}
    if(m.type==='activity_leave'&&m.activity==='minigame'){await this.leaveMinigame(ws,p,now());return;}
    if(m.type==='activity_leave'&&m.activity==='drag'){
      const active=this.freeDragForPlayer(p.id);if(active){await this.cancelFreeDrag(active,'PLAYER_LEFT',p.id,true);await this.save();return;}
      this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>id!==p.id);p.dragWager=0;this.send(ws,{type:'drag_queue_left',v:PROTOCOL_VERSION,serverTime:now()});await this.save();return;
    }
    if(m.type==='activity_join'&&m.activity==='drag'){
      if(!insideCircle(p.state,FREE_DRAG_JOIN,120))return this.error(ws,'ACTIVITY_LOCATION','Подъедьте к зоне AIRPORT DRAG');if(this.playerBusy(p.id))return this.error(ws,'ACTIVITY_BUSY','Вы уже участвуете в активности');const wager=Math.floor(Number(m.wager)||0);if(!validFreeDragWager(wager))return this.error(ws,'INVALID_WAGER','Недопустимая ставка DRAG');if(wager>0&&(!p.userId||!this.env.DB))return this.error(ws,'DRAG_ACCOUNT_REQUIRED','Для DRAG на CR нужен игровой аккаунт');
      p.dragWager=wager;let q=this.room.dragQueue=this.room.dragQueue||[];q=q.filter(id=>{const racer=this.room.players.find(x=>x.id===id);return !!racer?.connected&&!this.freeDragForPlayer(id);});if(!q.includes(p.id))q.push(p.id);this.room.dragQueue=q;
      const same=q.filter(id=>{const racer=this.room.players.find(x=>x.id===id);return racer&&Number(racer.dragWager||0)===wager;});this.sendToPlayers(same,{type:'drag_queue',v:PROTOCOL_VERSION,count:same.length,wager,serverTime:now()});this.send(ws,{type:'drag_queue_joined',v:PROTOCOL_VERSION,wager,count:same.length,serverTime:now()});
      let ids=null;if(same.length>=2){outer:for(let i=0;i<same.length-1;i++)for(let j=i+1;j<same.length;j++){const a=this.room.players.find(x=>x.id===same[i]),b=this.room.players.find(x=>x.id===same[j]);if(!a||!b)continue;if(wager>0&&a.userId===b.userId)continue;ids=[a.id,b.id];break outer;}}
      if(ids){const challengeId=crypto.randomUUID(),startAt=now()+3600,challenge={id:challengeId,ids,startAt,finishes:{},createdAt:now(),lastProgressAt:0,wager,pot:wager*2,wagerLocked:false,wagerSettled:false};const locked=await this.lockFreeDragWager(challenge);if(!locked.ok){const bad=new Set(locked.badIds?.length?locked.badIds:ids);this.room.dragQueue=q.filter(id=>!bad.has(id));for(const id of bad){const racer=this.room.players.find(x=>x.id===id);if(racer)racer.dragWager=0;this.sendToPlayers([id],{type:'error',v:PROTOCOL_VERSION,code:locked.code||'WAGER_LOCK_FAILED',message:locked.code==='INSUFFICIENT_CR'?'Недостаточно CR для выбранной ставки':'Не удалось заблокировать ставку DRAG'});}await this.save();return;}
        this.room.dragQueue=q.filter(id=>!ids.includes(id));this.room.dragChallenges[challengeId]=challenge;for(const id of ids){const racer=this.room.players.find(x=>x.id===id);if(racer)racer.dragChallengeId=challengeId;}await this.save();this.sendToPlayers(ids,{type:'activity_start',v:PROTOCOL_VERSION,activity:'drag',challengeId,participants:ids,startAt,finishX:FREE_DRAG_FINISH_X,wager,pot:challenge.pot,balances:locked.balances||{},serverTime:now()});this.broadcastFreeDragProgress(challenge,now(),true);
        const remain=this.room.dragQueue.filter(id=>Number(this.room.players.find(x=>x.id===id)?.dragWager||0)===wager);if(remain.length)this.sendToPlayers(remain,{type:'drag_queue',v:PROTOCOL_VERSION,count:remain.length,wager,serverTime:now()});}
      else await this.save();return;
    }
    // Legacy clients may still send activity_finish. The server deliberately ignores
    // elapsedMs: drag results are derived only from timestamped movement snapshots.
    if(m.type==='activity_finish'&&m.activity==='drag')return;
    if(m.type==='leave'){
      const active=this.freeDragForPlayer(p.id);if(active)await this.cancelFreeDrag(active,'PLAYER_LEFT',p.id,true);
      p.connected=false;await this.endSessionLog(p,'normal_exit');this.handleActivityDeparture(p.id,true);this.room.players=this.room.players.filter(x=>x.id!==p.id);this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>id!==p.id);if(!this.room.players.length){this.room=null;await this.ctx.storage.deleteAll();try{ws.close(1000,'leave');}catch{};return;}await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicFreeRoom()},ws);try{ws.close(1000,'leave');}catch{};return;
    }
  }

  publicRoom(){
    const r=this.room,settlement=r.settlement?{raceId:r.settlement.raceId,authority:r.settlement.authority||'legacy',status:r.settlement.status,pot:r.settlement.pot||0,wager:r.settlement.wager||0,winnerId:r.settlement.winnerId||null,reason:r.settlement.reason||'',stakes:r.settlement.stakes||{}}:null;
    const mediaEvent=r.mode==='media_race'&&r.mediaEvent?{id:r.mediaEvent.id,code:r.mediaEvent.code,title:r.mediaEvent.title,gameKey:r.mediaEvent.gameKey,creatorUserId:r.mediaEvent.creatorUserId,organizerMode:r.mediaEvent.organizerMode,prize:Number(r.mediaEvent.prize)||0,status:r.mediaEvent.status||'WAITING',settings:r.mediaEvent.settings||{},result:r.mediaEvent.result||null}:null;
    return {protocol:PROTOCOL_VERSION,mode:r.mode||'race',mediaEvent,code:r.code,status:r.status,settings:r.settings,hostId:r.hostId,raceId:r.raceId||null,raceStartAt:r.raceStartAt||0,gridOrder:r.gridOrder||[],finishOrder:r.finishOrder||[],settlement,pot:settlement?.pot||0,players:r.players.map(p=>({id:p.id,userId:p.userId||null,crew:p.crew||null,name:p.name,media:!!p.media,spectator:!!p.spectator,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0))),ready:!!p.ready,connected:!!p.connected,host:p.id===r.hostId,liveryId:p.liveryId,effectId:p.effectId,colorId:p.colorId||'stock',vinylId:p.vinylId||'none',wagerConfirmed:!!p.wagerConfirmed,stake:p.stake||0,finishPlace:p.finishPlace||0,finishTime:p.finishTime||0,state:p.state?{laps:p.state.laps,progress:p.state.progress,finished:!!p.state.finished,driftScore:Math.max(0,Math.floor(Number(p.state.driftScore)||0))}:null}))};
  }
  send(ws,obj){try{ws.send(JSON.stringify(obj));}catch{}}
  broadcast(obj,except=null){const text=JSON.stringify(obj);for(const ws of this.ctx.getWebSockets()){if(ws===except)continue;try{ws.send(text);}catch{}}}
  error(ws,code,message){this.send(ws,{type:'error',v:PROTOCOL_VERSION,code,message});}
  logRole(p){return p?.owner?'OWNER':p?.media?'MEDIA':Number(p?.adminLevel)>0?`ADMIN_L${Math.max(1,Math.min(8,Math.floor(Number(p.adminLevel))))}`:'PLAYER';}
  logUsername(p){return String(p?.name||'').replace(/^@/,'').slice(0,64);}
  async startSessionLog(p){
    if(!p||p.logSessionId)return;const t=now(),mode=this.room?.mode==='freeroam'?'freeroam':'online',serverId=mode==='freeroam'?(this.room?.serverId||'free'):`race:${this.room?.code||'room'}`,sessionId=`SESSION-${crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()}`;p.logSessionId=sessionId;p.logSessionStartedAt=t;p.disconnectReason='';
    try{await writeGameLog(this.env,{category:'joins',eventType:'session_start',actorUserId:p.userId||null,actorUsername:this.logUsername(p),actorRole:this.logRole(p),targetUserId:p.userId||null,targetUsername:this.logUsername(p),serverId,source:'GAME_SERVER',subject:mode==='freeroam'?'Вход · Свободный режим':'Вход · Онлайн-гонка',relatedId:sessionId,metadata:{sessionId,mode,playerId:p.id,roomCode:this.room?.code||'',serverId},createdAt:t});}catch(e){console.error('session start log',e);}
  }
  async endSessionLog(p,reason='connection_lost'){
    if(!p?.logSessionId)return;const t=now(),sessionId=p.logSessionId,startedAt=Number(p.logSessionStartedAt)||t,mode=this.room?.mode==='freeroam'?'freeroam':'online',serverId=mode==='freeroam'?(this.room?.serverId||'free'):`race:${this.room?.code||'room'}`;
    try{await writeGameLog(this.env,{category:'joins',eventType:'session_end',actorUserId:p.userId||null,actorUsername:this.logUsername(p),actorRole:this.logRole(p),targetUserId:p.userId||null,targetUsername:this.logUsername(p),serverId,source:'GAME_SERVER',subject:mode==='freeroam'?'Выход · Свободный режим':'Выход · Онлайн-гонка',reason,relatedId:sessionId,metadata:{sessionId,mode,playerId:p.id,roomCode:this.room?.code||'',serverId,startedAt,endedAt:t,durationMs:Math.max(0,t-startedAt),disconnectReason:reason},createdAt:t});}catch(e){console.error('session end log',e);}
    p.logSessionId='';p.logSessionStartedAt=0;p.disconnectReason='';
  }
  resetRaceState({resetConfirmation=false}={}){
    const r=this.room;r.status='lobby';r.raceId=null;r.raceStartAt=0;r.gridOrder=[];r.finishOrder=[];
    for(const x of r.players){x.ready=false;x.finishPlace=0;x.finishTime=0;x.state=null;x.lastSeq=-1;x.lastStateAt=0;x.serverLaps=0;x.lastLapAt=0;x.stake=0;if(resetConfirmation)x.wagerConfirmed=r.settings.wager===0;}
  }
  async recoverInterruptedWager(){
    if(this.room?.settlement?.authority!=='server'||this.room.settlement.status!=='locking')return false;
    const escrow=await readRoomWager(this.env.DB,this.room.settlement.raceId);
    if(escrow?.status==='locked'){const refund=await settleRoomWager(this.env.DB,{raceId:escrow.race_id,refund:true});if(!refund.ok)throw Error(refund.code);}
    if(escrow?.status==='awarded')throw Error('UNEXPECTED_SETTLED_START');
    this.room.settlement.status='refunded';this.room.settlement.reason='START_INTERRUPTED';this.resetRaceState({resetConfirmation:true});await this.save();return true;
  }
  async refundActiveWager(reason='RACE_CANCELLED'){
    const s=this.room?.settlement;if(!s||s.status!=='locked')return false;
    if(s.authority==='server'){const result=await settleRoomWager(this.env.DB,{raceId:s.raceId,refund:true});if(!result.ok)throw Error(result.code);}
    s.status='refunded';s.reason=reason;s.refundedAt=now();s.winnerId=null;
    this.resetRaceState({resetConfirmation:true});return true;
  }
  async fetch(request){
    await this.load();const url=new URL(request.url);

    if(url.pathname==='/media/create'&&request.method==='POST'){
      if(this.room&&this.room.players?.length)return json({error:'ROOM_EXISTS'},409);let b={};try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}const event=b.event||{},gameKey=String(event.gameKey||''),cfg=FREE_MINIGAME_CONFIG[gameKey],supported=!!cfg||['drift_battle','koth'].includes(gameKey);if(!supported||!event.id||!event.code)return json({error:'INVALID_MEDIA_EVENT'},400);const t=now(),settings=event.settings||{};
      this.room={mode:'freeroam',serverId:'MEDIA:'+event.code,createdAt:t,updatedAt:t,emptySince:t,records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{},eventsDisabled:false,mediaEvent:{...event,status:'WAITING',settings},players:[]};
      if(gameKey==='drift_battle')this.room.driftBattle=this.makeEvent('drift_battle',[],t,{zoneId:'harbor',mediaEvent:true,settings});
      else if(gameKey==='koth')this.room.koth=this.makeEvent('koth',[],t,{zoneIndex:0,finalZone:false,lastTickAt:0,mediaEvent:true,settings});
      else this.room.minigames[gameKey]=this.makeEvent('minigame',[],t,{gameKey,points:{},strikes:{},score:{red:0,blue:0},mediaEvent:true,settings});
      await this.save();return json({ok:true,room:this.publicFreeRoom()},201);
    }
    if(url.pathname==='/media/join'&&request.method==='POST'){
      if(!this.room?.mediaEvent||this.room.mode!=='freeroam')return json({error:'EVENT_NOT_FOUND'},404);let b={};try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}if(!b.userId||!validFreeName(b.name))return json({error:'INVALID_NAME'},400);const t=now(),media=this.room.mediaEvent;if(!['WAITING','STARTING','RUNNING'].includes(media.status||'WAITING'))return json({error:'EVENT_CLOSED'},409);
      const existing=this.room.players.find(x=>x.userId===b.userId);if(existing?.connected)return json({error:'ALREADY_JOINED'},409);if(existing){this.handleActivityDeparture(existing.id,true);this.room.players=this.room.players.filter(x=>x.id!==existing.id);}
      const spectator=b.spectator===true&&b.userId===media.creatorUserId,livePlayers=this.room.players.filter(x=>!x.spectator&&(x.connected||x.disconnectedUntil>t));if(!spectator&&livePlayers.length>=Math.max(2,Number(media.settings?.maxPlayers)||8))return json({error:'ROOM_FULL'},409);
      const id=playerId(),sessionToken=token(),loadout=safeLoadout(b.loadout),p={id,name:sanitizeNickname(b.name),crew:b.crew||null,owner:b.owner===true,media:!!b.media,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(b.adminLevel)||0))),userId:b.userId,token:sessionToken,connected:false,disconnectedUntil:t+FREE_RECONNECT_GRACE_MS,liveryId:loadout.liveryId,effectId:loadout.effectId,colorId:loadout.colorId,vinylId:loadout.vinylId,level:Math.max(0,Math.min(100,Math.floor(Number(b.progress?.level)||0))),totalExp:Math.max(0,Math.floor(Number(b.progress?.totalExp)||0)),activePlayMs:0,onlineRewardCounter:0,activeSessionId:crypto.randomUUID(),lastSeq:-1,lastStateAt:0,lastSampleTime:0,lastChatAt:0,netRttMs:null,dragWager:0,state:null,spectator,mediaReady:spectator};this.room.players.push(p);
      if(!spectator){const e=this.ensureMediaActivity(t);if(e&&!e.participants.includes(id)){e.participants.push(id);this.syncEventIdentity(e,p);e.points=e.points||{};e.strikes=e.strikes||{};e.points[id]=0;e.strikes[id]=0;}}
      await this.save();return json({ok:true,serverId:this.room.serverId,playerId:id,sessionToken,room:this.publicFreeRoom(id)},201);
    }
    if(url.pathname==='/media/ws'){
      if(request.headers.get('Upgrade')!=='websocket')return json({error:'WEBSOCKET_REQUIRED'},426);if(!this.room?.mediaEvent||this.room.mode!=='freeroam')return json({error:'EVENT_NOT_FOUND'},404);const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);if(!p)return json({error:'SESSION_INVALID'},401);
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server,['free','media']);server.serializeAttachment({playerId:p.id,lastSeenAt:now()});for(const old of this.ctx.getWebSockets()){if(old===server)continue;const a=old.deserializeAttachment?.();if(a?.playerId===p.id)try{old.close(4001,'replaced');}catch{}}
      p.connected=true;p.disconnectedUntil=0;this.room.emptySince=0;await this.startSessionLog(p);await this.save();this.send(server,{type:'free_hello',v:PROTOCOL_VERSION,playerId:p.id,serverTime:now(),room:this.publicFreeRoom()});this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicFreeRoom()},server);return new Response(null,{status:101,webSocket:client});
    }
    if(url.pathname==='/media/leave'&&request.method==='POST'){
      if(!this.room?.mediaEvent)return json({ok:true});const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);if(!p)return json({ok:true});for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(a?.playerId===p.id)try{ws.close(1000,'media_leave');}catch{}}
      p.connected=false;await this.endSessionLog(p,'media_leave');if(!p.spectator)this.handleActivityDeparture(p.id,true);this.room.players=this.room.players.filter(x=>x.id!==p.id);const playersLeft=this.room.players.filter(x=>!x.spectator).length;if(!playersLeft&&['WAITING','STARTING','RUNNING'].includes(this.room.mediaEvent.status||'WAITING')){await refundMediaEvent(this.env,this.room.mediaEvent.id,'ALL_PLAYERS_LEFT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'ALL_PLAYERS_LEFT'};}
      if(!this.room.players.length){this.room=null;await this.ctx.storage.deleteAll();return json({ok:true});}await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,room:this.publicFreeRoom(),serverTime:now()});return json({ok:true});
    }
    if(url.pathname==='/media/cancel'&&request.method==='POST'){
      if(!this.room?.mediaEvent)return json({ok:true});this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'ORGANIZER_CANCELLED'};this.broadcast({type:'media_event_cancelled',v:PROTOCOL_VERSION,eventId:this.room.mediaEvent.id,reason:'ORGANIZER_CANCELLED',serverTime:now()});await this.save();return json({ok:true});
    }

    if(url.pathname==='/media-race/create'&&request.method==='POST'){
      if(this.room&&this.room.players?.length)return json({error:'ROOM_EXISTS'},409);let b={};try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}const event=b.event||{},raw=event.settings||{};if(!event.id||!event.code||event.gameKey!=='race')return json({error:'INVALID_MEDIA_EVENT'},400);
      const settings=normalizeSettings({...raw,wager:0}),t=now();this.room={mode:'media_race',code:event.code,createdAt:t,updatedAt:t,emptySince:t,status:'lobby',settings:{...settings,wager:0},hostId:null,raceId:null,raceStartAt:0,gridOrder:[],finishOrder:[],settlement:null,mediaEvent:{...event,status:'WAITING',settings:{...raw,...settings,wager:0}},players:[]};await this.save();return json({ok:true,room:this.publicRoom()},201);
    }
    if(url.pathname==='/media-race/join'&&request.method==='POST'){
      if(!this.room?.mediaEvent||this.room.mode!=='media_race')return json({error:'EVENT_NOT_FOUND'},404);let b={};try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}if(!b.userId||!validFreeName(b.name))return json({error:'INVALID_NAME'},400);if(this.room.status!=='lobby')return json({error:'RACE_ALREADY_STARTED'},409);const t=now(),media=this.room.mediaEvent,spectator=b.spectator===true&&b.userId===media.creatorUserId;
      const existing=this.room.players.find(x=>x.userId===b.userId);if(existing?.connected)return json({error:'ALREADY_JOINED'},409);if(existing)this.room.players=this.room.players.filter(x=>x.id!==existing.id);const racers=this.room.players.filter(x=>!x.spectator&&(x.connected||x.disconnectedUntil>t));if(!spectator&&racers.length>=Math.max(2,Number(media.settings?.maxPlayers)||8))return json({error:'ROOM_FULL'},409);
      const id=playerId(),sessionToken=token(),loadout=safeLoadout(b.loadout),p={id,userId:b.userId,crew:b.crew||null,owner:b.owner===true,media:!!b.media,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(b.adminLevel)||0))),name:sanitizeNickname(b.name),token:sessionToken,spectator,ready:spectator,connected:false,disconnectedUntil:t+RECONNECT_GRACE_MS,liveryId:loadout.liveryId,effectId:loadout.effectId,colorId:loadout.colorId,vinylId:loadout.vinylId,wagerConfirmed:true,stake:0,creditSnapshot:null,lastSeq:-1,lastStateAt:0,state:null,serverLaps:0,lastLapAt:0,finishPlace:0,finishTime:0};this.room.players.push(p);if(b.userId===media.creatorUserId)this.room.hostId=id;else if(!this.room.hostId)this.room.hostId=id;await this.save();return json({ok:true,code:this.room.code,playerId:id,sessionToken,room:this.publicRoom()},201);
    }
    if(url.pathname==='/media-race/leave'&&request.method==='POST'){
      if(!this.room?.mediaEvent||this.room.mode!=='media_race')return json({ok:true});const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);if(!p)return json({ok:true});for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(a?.playerId===p.id)try{ws.close(1000,'media_race_leave');}catch{}}await this.endSessionLog(p,'media_race_leave');const creatorLeft=p.userId===this.room.mediaEvent.creatorUserId;this.room.players=this.room.players.filter(x=>x.id!==p.id);if(creatorLeft&&['WAITING','STARTING'].includes(this.room.mediaEvent.status||'WAITING')){await refundMediaEvent(this.env,this.room.mediaEvent.id,'ORGANIZER_LEFT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'ORGANIZER_LEFT'};this.broadcast({type:'media_event_cancelled',v:PROTOCOL_VERSION,eventId:this.room.mediaEvent.id,reason:'ORGANIZER_LEFT',serverTime:now()});}if(this.room.mediaEvent.status==='RUNNING'&&!this.room.players.some(x=>!x.spectator)){await refundMediaEvent(this.env,this.room.mediaEvent.id,'NO_RACERS_LEFT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'NO_RACERS_LEFT'};}
      if(!this.room.players.length){this.room=null;await this.ctx.storage.deleteAll();return json({ok:true});}if(this.room.hostId===p.id)this.room.hostId=this.room.players.find(x=>x.userId===this.room.mediaEvent?.creatorUserId)?.id||null;await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return json({ok:true});
    }
    if(url.pathname==='/media-race/cancel'&&request.method==='POST'){
      if(!this.room?.mediaEvent||this.room.mode!=='media_race')return json({ok:true});this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'ORGANIZER_CANCELLED'};this.broadcast({type:'media_event_cancelled',v:PROTOCOL_VERSION,eventId:this.room.mediaEvent.id,reason:'ORGANIZER_CANCELLED',serverTime:now()});await this.save();return json({ok:true});
    }

    if(url.pathname==='/free/admin-status'&&request.method==='POST'){
      if(this.room?.mode!=='freeroam')return json({ok:true,players:[],eventsDisabled:false,activities:{drift:false,koth:false,minigames:0,dragQueue:0}});
      return json({ok:true,serverId:this.room.serverId||'',eventsDisabled:!!this.room.eventsDisabled,players:this.room.players.filter(p=>p.connected).map(p=>({userId:p.userId||null,playerId:p.id,name:p.name,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(p.adminLevel)||0))),owner:p.owner===true,level:p.level||0,state:p.state?{x:p.state.x,y:p.state.y,speed:p.state.speed}:null})),activities:{drift:!!this.room.driftBattle,koth:!!this.room.koth,minigames:Object.keys(this.room.minigames||{}).length,dragQueue:(this.room.dragQueue||[]).length}});
    }
    if(url.pathname==='/free/admin-control'&&request.method==='POST'){
      let b={};try{b=await request.json();}catch{}
      if(this.room?.mode!=='freeroam')return json({ok:true,updated:0,kicked:0});
      const action=String(b.action||''),t=now();
      if(action==='announcement'){
        const message=String(b.message||'').trim().slice(0,220);if(!message)return json({error:'MESSAGE_REQUIRED'},400);
        this.broadcast({type:'admin_announcement',v:PROTOCOL_VERSION,message,by:String(b.by||'ADMIN').slice(0,32),adminLevel:Math.max(0,Math.min(8,Math.floor(Number(b.adminLevel)||0))),serverTime:t});return json({ok:true,updated:this.room.players.filter(p=>p.connected).length});
      }
      if(action==='kick_user'){
        const ids=new Set(this.room.players.filter(p=>!p.owner&&b.userId&&p.userId===b.userId).map(p=>p.id));
        for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(ids.has(a?.playerId)){this.send(ws,{type:'admin_kick',v:PROTOCOL_VERSION,reason:String(b.reason||'Отключён администрацией').slice(0,160)});try{ws.close(4003,'admin_kick');}catch{}}}
        for(const player of this.room.players.filter(p=>ids.has(p.id)))await this.endSessionLog(player,'staff_kick');for(const c of [...Object.values(this.room.dragChallenges||{})])if(c.ids.some(id=>ids.has(id)))await this.cancelFreeDrag(c,'ADMIN_KICK',null,false);for(const id of ids)this.handleActivityDeparture(id,true);
        this.room.players=this.room.players.filter(p=>!ids.has(p.id));this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>!ids.has(id));
        await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:t,room:this.publicFreeRoom()});return json({ok:true,kicked:ids.size});
      }
      if(action==='clear_events'||action==='events_disabled'){
        if(action==='events_disabled')this.room.eventsDisabled=b.disabled===true;
        const shouldClear=action==='clear_events'||this.room.eventsDisabled;
        if(shouldClear){
          if(this.room.driftBattle?.participants?.length)this.sendToPlayers(this.room.driftBattle.participants,{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'drift_battle',eventId:this.room.driftBattle.id,reason:'ADMIN_STOP'});
          if(this.room.koth?.participants?.length)this.sendToPlayers(this.room.koth.participants,{type:'activity_cancelled',v:PROTOCOL_VERSION,activity:'koth',eventId:this.room.koth.id,reason:'ADMIN_STOP'});
          for(const e of Object.values(this.room.minigames||{}))if(e?.participants?.length)this.sendToPlayers(e.participants,{type:'minigame_cancelled',v:PROTOCOL_VERSION,activity:'minigame',gameKey:e.gameKey,eventId:e.id,reason:'ADMIN_STOP',serverTime:t});
          this.room.driftBattle=null;this.room.koth=null;this.room.minigames={};for(const id of this.room.dragQueue||[]){const racer=this.room.players.find(p=>p.id===id);if(racer)racer.dragWager=0;}this.room.dragQueue=[];
          for(const c of [...Object.values(this.room.dragChallenges||{})])await this.cancelFreeDrag(c,'ADMIN_STOP',null,false);this.room.dragChallenges={};
        }
        await this.save();this.broadcast({type:'admin_events_state',v:PROTOCOL_VERSION,disabled:!!this.room.eventsDisabled,cleared:shouldClear,by:String(b.by||'ADMIN').slice(0,32),serverTime:t});this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:t,room:this.publicFreeRoom()});return json({ok:true,eventsDisabled:!!this.room.eventsDisabled,cleared:shouldClear});
      }
      return json({error:'INVALID_ADMIN_ACTION'},400);
    }
    if(url.pathname==='/free/owner-status')return json({players:this.room?.mode==='freeroam'?this.room.players.filter(p=>p.connected).map(p=>({userId:p.userId||null,playerId:p.id})):[]});
    if(url.pathname==='/free/owner-progress'&&request.method==='POST'){
      const b=await request.json();if(this.room?.mode!=='freeroam')return json({ok:true,updated:0});const totalExp=Math.max(0,Math.floor(Number(b.totalExp)||0)),progress={totalExp,...levelFromTotalExp(totalExp)};let updated=0;
      for(const p of this.room.players){if(!b.userId||p.userId!==b.userId)continue;p.level=progress.level;p.totalExp=progress.totalExp;updated++;for(const e of [this.room.driftBattle,this.room.koth,...Object.values(this.room.minigames||{})])if(e?.identities?.[p.id]){e.identities[p.id].level=p.level;e.identities[p.id].totalExp=p.totalExp;}this.sendToPlayers([p.id],{type:'progress_override',v:PROTOCOL_VERSION,...progress,serverTime:now()});this.broadcast({type:'player_progress',v:PROTOCOL_VERSION,playerId:p.id,level:p.level,totalExp:p.totalExp,serverTime:now()});}
      if(updated)await this.save();return json({ok:true,updated});
    }
    if(url.pathname==='/free/owner-kick'&&request.method==='POST'){
      const b=await request.json();let kicked=0;
      if(this.room?.mode==='freeroam'){
        const ids=new Set(this.room.players.filter(p=>!p.owner&&(b.maintenance||p.userId===b.userId)).map(p=>p.id));
        for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(ids.has(a?.playerId)){this.send(ws,{type:'owner_kick',reason:b.maintenance?'Технические работы':'Владелец отключил вас от сервера'});try{ws.close(4003,'owner_kick');}catch{}}}
        kicked=ids.size;for(const player of this.room.players.filter(p=>ids.has(p.id)))await this.endSessionLog(player,b.maintenance?'maintenance':'kick');for(const c of [...Object.values(this.room.dragChallenges||{})])if(c.ids.some(id=>ids.has(id)))await this.cancelFreeDrag(c,b.maintenance?'MAINTENANCE':'OWNER_KICK',null,false);for(const id of ids)this.handleActivityDeparture(id,true);this.room.players=this.room.players.filter(p=>!ids.has(p.id));this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>!ids.has(id));
        await this.save();this.broadcast({type:'free_room',room:this.publicFreeRoom()});
      }return json({ok:true,kicked});
    }
    if(url.pathname==='/free/leave'&&request.method==='POST'){
      if(!this.room||this.room.mode!=='freeroam')return json({ok:true});const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);if(!p)return json({ok:true});
      for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment?.();if(a?.playerId===p.id)try{ws.close(1000,'page_exit');}catch{}}
      const active=this.freeDragForPlayer(p.id);if(active)await this.cancelFreeDrag(active,'PLAYER_LEFT',p.id,true);p.connected=false;await this.endSessionLog(p,'page_exit');this.handleActivityDeparture(p.id,true);this.room.players=this.room.players.filter(x=>x.id!==p.id);this.room.dragQueue=(this.room.dragQueue||[]).filter(pid=>pid!==p.id);
      if(!this.room.players.length){this.room=null;await this.ctx.storage.deleteAll();return json({ok:true});}await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicFreeRoom()});return json({ok:true});
    }
    if(url.pathname==='/free/status')return json({ok:true,players:this.room?.mode==='freeroam'?this.room.players.filter(p=>p.connected).length:0,records:this.room?.mode==='freeroam'?(this.room.records||{}):{}});
    if(url.pathname==='/free/join'&&request.method==='POST'){
      let b;try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}if(!validFreeName(b?.name))return json({error:'INVALID_NAME'},400);
      const serverId=url.searchParams.get('serverId')||'city-01',t=now();if(!this.room||this.room.mode!=='freeroam')this.room={mode:'freeroam',serverId,createdAt:t,updatedAt:t,emptySince:0,records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},driftBattle:null,koth:null,minigames:{},eventsDisabled:false,players:[]};
      const live=this.room.players.filter(p=>p.connected||p.disconnectedUntil>t);if(live.length>=FREE_MAX_PLAYERS)return json({error:'SERVER_FULL'},409);
      const id=playerId(),sessionToken=token(),loadout=safeLoadout(b.loadout);this.room.players.push({id,name:sanitizeNickname(b.name),crew:b.crew||null,owner:b.owner===true,media:!!b.media,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(b.adminLevel)||0))),userId:b.userId||null,token:sessionToken,connected:false,disconnectedUntil:t+FREE_RECONNECT_GRACE_MS,liveryId:loadout.liveryId,effectId:loadout.effectId,colorId:loadout.colorId,vinylId:loadout.vinylId,level:Math.max(0,Math.min(100,Math.floor(Number(b.progress?.level)||0))),totalExp:Math.max(0,Math.floor(Number(b.progress?.totalExp)||0)),activePlayMs:0,onlineRewardCounter:0,activeSessionId:crypto.randomUUID(),lastSeq:-1,lastStateAt:0,lastSampleTime:0,lastChatAt:0,netRttMs:null,dragWager:0,state:null});await this.save();return json({ok:true,serverId:this.room.serverId,playerId:id,sessionToken,room:this.publicFreeRoom(id)},201);
    }
    if(url.pathname==='/free/ws'){
      if(request.headers.get('Upgrade')!=='websocket')return json({error:'WEBSOCKET_REQUIRED'},426);if(!this.room||this.room.mode!=='freeroam')return json({error:'SERVER_NOT_FOUND'},404);
      const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);if(!p)return json({error:'SESSION_INVALID'},401);
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server,['free']);server.serializeAttachment({playerId:p.id,lastSeenAt:now()});for(const old of this.ctx.getWebSockets()){if(old===server)continue;const a=old.deserializeAttachment?.();if(a?.playerId===p.id)try{old.close(4001,'replaced');}catch{}}
      p.connected=true;p.disconnectedUntil=0;this.room.emptySince=0;await this.startSessionLog(p);await this.save();this.send(server,{type:'free_hello',v:PROTOCOL_VERSION,playerId:p.id,serverTime:now(),room:this.publicFreeRoom()});this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicFreeRoom()},server);return new Response(null,{status:101,webSocket:client});
    }

    if(url.pathname==='/create'&&request.method==='POST'){
      if(this.room&&this.room.players.length&&now()-(this.room.updatedAt||0)<ROOM_TTL_MS)return json({error:'ROOM_EXISTS'},409);
      const b=await request.json(),created=now(),id=playerId(),sessionToken=token(),settings=normalizeSettings(b.settings);
      this.room={code:b.code,createdAt:created,updatedAt:created,emptySince:created,status:'lobby',settings,hostId:id,raceId:null,raceStartAt:0,gridOrder:[],finishOrder:[],settlement:null,players:[{id,userId:b.userId||null,crew:b.crew||null,owner:b.owner===true,media:!!b.media,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(b.adminLevel)||0))),name:sanitizeNickname(b.name),token:sessionToken,ready:false,connected:false,disconnectedUntil:created+RECONNECT_GRACE_MS,liveryId:b.loadout?.liveryId||'apexLime',effectId:b.loadout?.effectId||'standard',colorId:b.loadout?.colorId||'stock',vinylId:b.loadout?.vinylId||'none',wagerConfirmed:settings.wager===0,stake:0,creditSnapshot:null,lastSeq:-1,lastStateAt:0,state:null,serverLaps:0,lastLapAt:0,finishPlace:0,finishTime:0}]};
      await this.save();return json({ok:true,code:b.code,playerId:id,sessionToken,room:this.publicRoom()},201);
    }
    if(url.pathname==='/join'&&request.method==='POST'){
      if(!this.room)return json({error:'ROOM_NOT_FOUND'},404);
      let b;try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
      if(!(b?.userId?validFreeName(b?.name):validNickname(b?.name)))return json({error:'INVALID_NAME'},400);
      if(this.room.status!=='lobby')return json({error:'RACE_ALREADY_STARTED'},409);
      const active=this.room.players.filter(p=>p.connected||p.disconnectedUntil>now());if(active.length>=this.room.settings.maxPlayers)return json({error:'ROOM_FULL'},409);
      const id=playerId(),sessionToken=token(),t=now(),loadout=safeLoadout(b.loadout);this.room.players.push({id,userId:b.userId||null,crew:b.crew||null,owner:b.owner===true,media:!!b.media,adminLevel:Math.max(0,Math.min(8,Math.floor(Number(b.adminLevel)||0))),name:sanitizeNickname(b.name),token:sessionToken,ready:false,connected:false,disconnectedUntil:t+RECONNECT_GRACE_MS,liveryId:loadout.liveryId,effectId:loadout.effectId,colorId:loadout.colorId,vinylId:loadout.vinylId,wagerConfirmed:this.room.settings.wager===0,stake:0,creditSnapshot:null,lastSeq:-1,lastStateAt:0,state:null,serverLaps:0,lastLapAt:0,finishPlace:0,finishTime:0});
      await this.save();return json({ok:true,code:this.room.code,playerId:id,sessionToken,room:this.publicRoom()},201);
    }
    if(url.pathname==='/ws'||url.pathname.endsWith('/ws')){
      if(request.headers.get('Upgrade')!=='websocket')return json({error:'WEBSOCKET_REQUIRED'},426);
      if(!this.room)return json({error:'ROOM_NOT_FOUND'},404);
      const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);
      if(!p)return json({error:'SESSION_INVALID'},401);
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server,['room']);server.serializeAttachment({playerId:p.id,lastSeenAt:now()});
      for(const old of this.ctx.getWebSockets()){if(old===server)continue;const a=old.deserializeAttachment?.();if(a?.playerId===p.id)try{old.close(4001,'replaced');}catch{}}
      p.connected=true;p.disconnectedUntil=0;this.room.emptySince=0;await this.startSessionLog(p);await this.save();
      this.send(server,{type:'hello',v:PROTOCOL_VERSION,playerId:p.id,serverTime:now(),room:this.publicRoom()});this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()},server);
      return new Response(null,{status:101,webSocket:client});
    }
    return json({error:'NOT_FOUND'},404);
  }
  async webSocketMessage(ws,message){
    if(this.env.DB){const t=now();if(!this.ownerCheckAt||t-this.ownerCheckAt>10000){this.ownerMaintenance=(await settings(this.env)).maintenance;this.ownerCheckAt=t;}if(this.ownerMaintenance){await this.load();const pid=ws.deserializeAttachment?.()?.playerId,p=this.room?.players.find(x=>x.id===pid);if(!p?.owner){try{ws.close(4003,'maintenance');}catch{}return;}}}

    await this.load();if(!this.room)return;const a=this.markSocketSeen(ws)||ws.deserializeAttachment?.(),p=this.room.players.find(x=>x.id===a?.playerId);if(!p)return this.error(ws,'SESSION_INVALID','Сессия игрока недействительна');
    const parsed=parseClientMessage(message);if(!parsed.ok){if(parsed.error==='message_too_large')try{ws.close(1009,'message too large');}catch{};return;}
    const m=parsed.msg;if(['state','finish'].includes(m.type))await this.refreshOwnerLimits(p);if(this.room.mode==='freeroam')return this.handleFreeMessage(ws,p,m);if(m.v!==undefined&&m.v!==PROTOCOL_VERSION)return this.error(ws,'PROTOCOL_VERSION','Версия Online-протокола не поддерживается');
    if(m.type==='ping'){if(await this.refreshPublicIdentity(p)){await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});}if(typeof m.clientTime==='number')this.send(ws,{type:'pong',v:PROTOCOL_VERSION,clientTime:m.clientTime,serverTime:now()});return;}
    if(m.type==='wager_confirm'){
      if(this.room.mode==='media_race')return this.error(ws,'MEDIA_WAGER_DISABLED','В MEDIA гонке используется отдельный призовой фонд');
      if(this.room.status!=='lobby')return;
      const amount=m.amount,balance=p.userId&&this.env.DB?(await this.freeDragBalances([p.id]))[p.id]:null;if(!validWager(amount)||amount!==this.room.settings.wager)return this.error(ws,'WAGER_MISMATCH','Ставка комнаты изменилась');
      if(balance===null||balance<amount)return this.error(ws,'INSUFFICIENT_CR','Недостаточно CR для этой ставки');
      p.wagerConfirmed=true;p.creditSnapshot=balance;p.ready=false;await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='ready'){
      if(p.spectator)return this.error(ws,'SPECTATOR_ONLY','Наблюдатель не участвует в READY');
      if(this.room.status!=='lobby'||typeof m.ready!=='boolean')return;
      if(m.ready&&this.room.settings.wager>0&&!p.wagerConfirmed)return this.error(ws,'WAGER_CONFIRM_REQUIRED','Сначала подтвердите ставку');
      p.ready=m.ready;await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='settings_update'){
      if(this.room.mode==='media_race')return this.error(ws,'MEDIA_SETTINGS_LOCKED','Настройки MEDIA Event фиксируются при создании');
      if(p.id!==this.room.hostId)return this.error(ws,'HOST_ONLY','Только HOST может менять настройки');
      if(this.room.status!=='lobby'||!validSettings(m.settings))return this.error(ws,'INVALID_SETTINGS','Недопустимые параметры комнаты');
      const next=normalizeSettings(m.settings);if(next.maxPlayers<this.room.players.filter(x=>x.connected).length)return this.error(ws,'ROOM_TOO_LARGE','Сначала уменьшите число игроков');
      const wagerChanged=next.wager!==this.room.settings.wager;this.room.settings=next;
      if(wagerChanged)for(const x of this.room.players){x.wagerConfirmed=next.wager===0;x.creditSnapshot=null;x.ready=false;x.stake=0;}
      await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='start_race'){
      if(await this.recoverInterruptedWager()){this.broadcast({type:'race_cancelled',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;}
      if(p.id!==this.room.hostId)return this.error(ws,'HOST_ONLY','Только HOST может начать гонку');
      if(this.room.status!=='lobby')return;
      const mediaRace=this.room.mode==='media_race',live=this.room.players.filter(x=>x.connected&&!x.spectator),minPlayers=mediaRace?Math.max(2,Number(this.room.mediaEvent?.settings?.minPlayers)||2):2;if(live.length<minPlayers)return this.error(ws,'NEED_PLAYERS',`Нужно минимум ${minPlayers} игрока`);
      if(live.some(x=>!x.ready))return this.error(ws,'NOT_READY','Все игроки должны быть готовы');
      const wager=mediaRace?0:(this.room.settings.wager||0);if(wager>0&&live.some(x=>!x.wagerConfirmed||!x.userId))return this.error(ws,'WAGER_NOT_CONFIRMED','Все игроки должны подтвердить ставку и иметь достаточно CR');
      this.room.status='countdown';this.room.raceId=crypto.randomUUID();this.room.raceStartAt=now()+3500;this.room.gridOrder=live.map(x=>x.id);this.room.finishOrder=[];if(mediaRace){this.room.mediaEvent.status='STARTING';await markMediaEventRunning(this.env,this.room.mediaEvent.id);this.room.mediaEvent.status='RUNNING';}
      const stakes={};for(const x of this.room.players){x.finishPlace=0;x.finishTime=0;x.state=null;x.lastSeq=-1;x.lastStateAt=0;x.serverLaps=0;x.lastLapAt=this.room.raceStartAt;x.stake=this.room.gridOrder.includes(x.id)?wager:0;if(x.stake)stakes[x.id]=x.stake;}
      this.room.settlement={raceId:this.room.raceId,status:wager>0?'locked':'none',wager,pot:wager*live.length,winnerId:null,reason:'',stakes,createdAt:now()};
      if(wager>0){
        this.room.status='locking';this.room.settlement.authority='server';this.room.settlement.status='locking';await this.save();
        const locked=await lockRoomWager(this.env.DB,{raceId:this.room.raceId,userIds:live.map(x=>x.userId),stake:wager});
        if(!locked.ok){this.room.settlement.status='refunded';this.room.settlement.reason=locked.code;this.resetRaceState({resetConfirmation:true});await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return this.error(ws,locked.code,'Не удалось зарезервировать ставки');}
        this.room.status='countdown';this.room.settlement.status='locked';this.room.raceStartAt=now()+3500;
        for(const x of this.room.players)x.lastLapAt=this.room.raceStartAt;
      }
      await this.save();this.broadcast({type:'start_countdown',v:PROTOCOL_VERSION,serverTime:now(),raceStartAt:this.room.raceStartAt,raceId:this.room.raceId,room:this.publicRoom()});return;
    }
    if(m.type==='player_state'){
      if(p.spectator)return;
      if(!['countdown','racing'].includes(this.room.status)||m.raceId!==this.room.raceId||!validPlayerState(m.state,p.speedLimit||650,p.yawLimit||20))return;
      const t=now();if(m.state.seq<=p.lastSeq||t-p.lastStateAt<PLAYER_STATE_RATE_MS)return;
      const knownLaps=Number.isInteger(p.serverLaps)?p.serverLaps:(p.state?.laps||0);if(m.state.laps<knownLaps||m.state.laps>knownLaps+1)return;if(m.state.laps>knownLaps){if(t-(p.lastLapAt||this.room.raceStartAt)<8000)return;p.serverLaps=m.state.laps;p.lastLapAt=t;}
      if(p.state){const dt=Math.max(.04,(t-p.lastStateAt)/1000),dist=Math.hypot(m.state.x-p.state.x,m.state.y-p.state.y);if(dist>Math.max(145,dt*1050))return;}
      p.lastSeq=m.state.seq;p.lastStateAt=t;p.state={...m.state,serverTime:t};if(this.room.status==='countdown'&&t>=this.room.raceStartAt)this.room.status='racing';
      this.broadcast({type:'player_state',v:PROTOCOL_VERSION,raceId:this.room.raceId,playerId:p.id,serverTime:t,state:p.state},ws);return;
    }
    if(m.type==='race_finish'){
      if(p.spectator)return;
      if(this.room.status!=='racing'||m.raceId!==this.room.raceId||p.finishPlace)return;
      if(validPlayerState(m.state,p.speedLimit||650,p.yawLimit||20)&&m.state.seq>p.lastSeq){const t=now(),knownLaps=Number.isInteger(p.serverLaps)?p.serverLaps:(p.state?.laps||0);if(m.state.laps>=knownLaps&&m.state.laps<=knownLaps+1&&(!(m.state.laps>knownLaps)||t-(p.lastLapAt||this.room.raceStartAt)>=8000)){if(m.state.laps>knownLaps){p.serverLaps=m.state.laps;p.lastLapAt=t;}p.lastSeq=m.state.seq;p.lastStateAt=t;p.state={...m.state,serverTime:t};}}
      if(!p.state||p.state.laps<this.room.settings.laps)return this.error(ws,'FINISH_REJECTED','Финиш не подтверждён состоянием гонки');
      if(!this.room.finishOrder.length&&this.room.settlement?.status==='locked'&&this.room.settlement.authority==='server'){
        const paid=await settleRoomWager(this.env.DB,{raceId:this.room.raceId,winnerUserId:p.userId});
        if(!paid.ok)return this.error(ws,paid.code,'Выплата ожидает восстановления связи');
      }
      p.finishPlace=this.room.finishOrder.length+1;p.finishTime=Math.max(0,now()-this.room.raceStartAt);this.room.finishOrder.push(p.id);p.state.finished=true;
      if(p.finishPlace===1&&this.room.settlement?.status==='locked'){this.room.settlement.status='awarded';this.room.settlement.winnerId=p.id;this.room.settlement.awardedAt=now();}
      await recordResult(this.env,this.room.raceId,p.userId,'online',p.finishPlace===1,p.finishTime);
      await this.grantProgress(p,'online',this.room.raceId,'ONLINE_FINISH',{place:p.finishPlace});
      if(p.finishPlace===1&&this.room.mode==='media_race'&&this.room.mediaEvent&&!['FINISHED','CANCELLED'].includes(this.room.mediaEvent.status)){const settled=await settleMediaEvent(this.env,this.room.mediaEvent.id,p.userId?[p.userId]:[],{type:'track_race',raceId:this.room.raceId,trackId:this.room.settings.trackId,drift:!!this.room.settings.drift,winnerPlayerId:p.id,finishTime:p.finishTime});if(settled.ok){this.room.mediaEvent.status='FINISHED';this.room.mediaEvent.result={winnerPlayerId:p.id,winnerUserId:p.userId||null,finishTime:p.finishTime,payouts:settled.payouts||[]};this.broadcast({type:'media_event_result',v:PROTOCOL_VERSION,eventId:this.room.mediaEvent.id,winners:p.userId?[p.userId]:[],payouts:settled.payouts||[],result:this.room.mediaEvent.result,serverTime:now()});}}
      await this.save();this.broadcast({type:'race_finish',v:PROTOCOL_VERSION,raceId:this.room.raceId,playerId:p.id,finishPlace:p.finishPlace,finishTime:p.finishTime,room:this.publicRoom()});return;
    }
    if(m.type==='return_lobby'){
      if(this.room.mode==='media_race')return this.error(ws,'MEDIA_EVENT_COMPLETE','MEDIA гонка является одноразовым Event');
      if(p.id!==this.room.hostId)return this.error(ws,'HOST_ONLY','Только HOST может вернуть комнату в Lobby');
      const racers=(this.room.gridOrder||[]).map(id=>this.room.players.find(x=>x.id===id)).filter(Boolean);if(racers.some(x=>!x.finishPlace))return this.error(ws,'RACE_NOT_FINISHED','Дождитесь финиша остальных игроков');
      this.resetRaceState({resetConfirmation:true});await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='leave'){
      const mediaRace=this.room.mode==='media_race',wagerCancelled=!mediaRace&&this.room.settlement?.status==='locked'&&Object.prototype.hasOwnProperty.call(this.room.settlement.stakes||{},p.id);if(wagerCancelled)await this.refundActiveWager('PLAYER_LEFT');const creatorLeft=mediaRace&&p.userId===this.room.mediaEvent?.creatorUserId;
      await this.endSessionLog(p,mediaRace?'media_race_leave':'normal_exit');this.room.players=this.room.players.filter(x=>x.id!==p.id);if(creatorLeft&&['WAITING','STARTING'].includes(this.room.mediaEvent?.status||'')){await refundMediaEvent(this.env,this.room.mediaEvent.id,'ORGANIZER_LEFT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'ORGANIZER_LEFT'};}if(mediaRace&&this.room.mediaEvent?.status==='RUNNING'&&!this.room.players.some(x=>!x.spectator)){await refundMediaEvent(this.env,this.room.mediaEvent.id,'NO_RACERS_LEFT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'NO_RACERS_LEFT'};}if(this.room.hostId===p.id)this.room.hostId=mediaRace?(this.room.players.find(x=>x.userId===this.room.mediaEvent?.creatorUserId)?.id||null):(this.room.players.find(x=>x.connected)?.id||this.room.players[0]?.id||null);
      if(!this.room.players.length){if(mediaRace&&this.room.mediaEvent&&['WAITING','STARTING','RUNNING'].includes(this.room.mediaEvent.status||'WAITING'))await refundMediaEvent(this.env,this.room.mediaEvent.id,'ALL_PLAYERS_LEFT');this.room=null;await this.ctx.storage.deleteAll();try{ws.close(1000,'leave');}catch{};return;}
      await this.save();this.broadcast({type:wagerCancelled?'race_cancelled':'room_state',v:PROTOCOL_VERSION,serverTime:now(),reason:wagerCancelled?'PLAYER_LEFT':'',room:this.publicRoom()},ws);try{ws.close(1000,'leave');}catch{};return;
    }
  }
  async webSocketClose(ws){await this.handleDisconnect(ws);}
  async webSocketError(ws){await this.handleDisconnect(ws);}
  async handleDisconnect(ws){
    await this.load();if(!this.room)return;const a=ws.deserializeAttachment?.(),p=this.room.players.find(x=>x.id===a?.playerId);if(!p)return;
    const stillLive=this.ctx.getWebSockets().some(s=>s!==ws&&s.deserializeAttachment?.()?.playerId===p.id);if(stillLive)return;
    if(this.room.mode==='freeroam'){const active=this.freeDragForPlayer(p.id);if(!active){this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>id!==p.id);p.dragWager=0;}p.connected=false;}
    p.connected=false;p.disconnectReason=p.disconnectReason||'connection_lost';p.disconnectedUntil=now()+(this.room.mode==='freeroam'?FREE_RECONNECT_GRACE_MS:RECONNECT_GRACE_MS);if(!this.room.players.some(x=>x.connected))this.room.emptySince=now();await this.save();this.broadcast({type:this.room.mode==='freeroam'?'free_room':'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.room.mode==='freeroam'?this.publicFreeRoom():this.publicRoom()});
  }
  async alarm(){
    await this.load();if(!this.room)return;await this.recoverInterruptedWager();const t=now(),expired=this.expireHeartbeatPlayers(t),removed=this.room.players.filter(p=>!p.connected&&p.disconnectedUntil&&p.disconnectedUntil<=t);
    if(this.room.mode==='freeroam'){await this.advanceFreeActivities(t);if(!this.room)return;if(removed.length){const ids=new Set(removed.map(p=>p.id));for(const player of removed)await this.endSessionLog(player,player.disconnectReason||'connection_lost');for(const player of removed){const active=this.freeDragForPlayer(player.id);if(active)await this.cancelFreeDrag(active,'CONNECTION_TIMEOUT',player.id,true);}for(const id of ids)this.handleActivityDeparture(id,true);this.room.players=this.room.players.filter(p=>!ids.has(p.id));this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>!ids.has(id));}if(!this.room.players.length||(!this.room.players.some(p=>p.connected)&&this.room.emptySince&&t>=this.room.emptySince+EMPTY_ROOM_TTL_MS)){for(const c of [...Object.values(this.room.dragChallenges||{})])await this.cancelFreeDrag(c,'ROOM_EXPIRED',null,false);if(this.room.mediaEvent&&['WAITING','STARTING','RUNNING'].includes(this.room.mediaEvent.status||'WAITING'))await refundMediaEvent(this.env,this.room.mediaEvent.id,'ROOM_EXPIRED');this.room=null;await this.ctx.storage.deleteAll();return;}const rosterSync=removed.length||expired.length||t-(this.room.lastRosterBroadcastAt||0)>=10000;if(rosterSync)this.room.lastRosterBroadcastAt=t;await this.save();if(rosterSync)this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:t,room:this.publicFreeRoom()});return;}
    const removedLockedRacer=removed.some(p=>this.room.settlement?.status==='locked'&&Object.prototype.hasOwnProperty.call(this.room.settlement.stakes||{},p.id));if(removedLockedRacer)await this.refundActiveWager('CONNECTION_TIMEOUT');
    if(removed.length){for(const player of removed)await this.endSessionLog(player,player.disconnectReason||'connection_lost');const creatorExpired=this.room.mode==='media_race'&&removed.some(p=>p.userId===this.room.mediaEvent?.creatorUserId);this.room.players=this.room.players.filter(p=>!removed.includes(p));if(creatorExpired&&['WAITING','STARTING'].includes(this.room.mediaEvent?.status||'')){await refundMediaEvent(this.env,this.room.mediaEvent.id,'ORGANIZER_TIMEOUT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'ORGANIZER_TIMEOUT'};this.broadcast({type:'media_event_cancelled',v:PROTOCOL_VERSION,eventId:this.room.mediaEvent.id,reason:'ORGANIZER_TIMEOUT',serverTime:t});}if(!this.room.players.some(p=>p.id===this.room.hostId))this.room.hostId=this.room.mode==='media_race'?(this.room.players.find(p=>p.userId===this.room.mediaEvent?.creatorUserId)?.id||null):(this.room.players.find(p=>p.connected)?.id||this.room.players[0]?.id||null);if(this.room.mode==='media_race'&&this.room.mediaEvent?.status==='RUNNING'&&!this.room.players.some(p=>!p.spectator)){await refundMediaEvent(this.env,this.room.mediaEvent.id,'NO_RACERS_LEFT');this.room.mediaEvent.status='CANCELLED';this.room.mediaEvent.result={reason:'NO_RACERS_LEFT'};}}
    if(!this.room.players.length||t>=this.room.createdAt+ROOM_TTL_MS||(!this.room.players.some(p=>p.connected)&&this.room.emptySince&&t>=this.room.emptySince+EMPTY_ROOM_TTL_MS)){if(this.room?.settlement?.status==='locked')await this.refundActiveWager('ROOM_EXPIRED');if(this.room?.mode==='media_race'&&this.room.mediaEvent&&['WAITING','STARTING','RUNNING'].includes(this.room.mediaEvent.status||'WAITING'))await refundMediaEvent(this.env,this.room.mediaEvent.id,'ROOM_EXPIRED');this.room=null;await this.ctx.storage.deleteAll();return;}
    await this.save();this.broadcast({type:removedLockedRacer?'race_cancelled':'room_state',v:PROTOCOL_VERSION,serverTime:t,reason:removedLockedRacer?'CONNECTION_TIMEOUT':'',room:this.publicRoom()});
  }
}
