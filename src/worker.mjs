import {handleAuthRequest,freeAccountIdentity} from './auth.mjs';
import {PROTOCOL_VERSION,generateRoomCode,normalizeRoomCode,validRoomCode,sanitizeNickname,validNickname,validSettings,normalizeSettings,validWager,validPlayerState,parseClientMessage,PLAYER_STATE_RATE_MS,RECONNECT_GRACE_MS,EMPTY_ROOM_TTL_MS,ROOM_TTL_MS} from './protocol.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}});
const now=()=>Date.now();
const token=()=>crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
const playerId=()=>crypto.randomUUID().slice(0,8);
const safeLoadout=v=>({liveryId:typeof v?.liveryId==='string'&&v.liveryId.length<=40?v.liveryId:'apexLime',effectId:typeof v?.effectId==='string'&&v.effectId.length<=40?v.effectId:'standard'});
const safeBalance=v=>Number.isInteger(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER?v:null;
const FREE_SERVERS=Object.freeze(['city-01','city-02','city-03','city-04','city-05','city-06']);
const FREE_MAX_PLAYERS=20;
const FREE_WORLD={w:4200,h:3000};
const validFreeName=v=>validNickname(v)||(typeof v==='string'&&/^@[a-z0-9_]{3,24}$/.test(v));

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/health')return json({ok:true,protocol:PROTOCOL_VERSION});

    if(url.pathname==='/api/free/servers'&&request.method==='GET'){
      const servers=await Promise.all(FREE_SERVERS.map(async(serverId)=>{try{const stub=env.ROOMS.get(env.ROOMS.idFromName('FREE:'+serverId)),r=await stub.fetch(new Request('https://room.internal/free/status'));const d=await r.json();return {id:serverId,name:'APEX CITY '+serverId.slice(-2),players:d.players||0,maxPlayers:FREE_MAX_PLAYERS,records:d.records||{}};}catch{return {id:serverId,name:'APEX CITY '+serverId.slice(-2),players:0,maxPlayers:FREE_MAX_PLAYERS,records:{}};}}));
      return json({ok:true,servers});
    }
    const fm=url.pathname.match(/^\/api\/free\/(city-0[1-6])\/(join|ws)$/);
    if(fm){
      const serverId=fm[1],stub=env.ROOMS.get(env.ROOMS.idFromName('FREE:'+serverId));
      if(fm[2]==='join'&&request.method==='POST'){
        let body;try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
        const identity=await freeAccountIdentity(env,request);if(identity.response)return identity.response;
        const payload={name:identity.user?('@'+identity.user.username):body?.name,loadout:body?.loadout,owner:identity.owner===true};
        return stub.fetch(new Request('https://room.internal/free/join?serverId='+encodeURIComponent(serverId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));
      }
      if(fm[2]==='ws')return stub.fetch(new Request('https://room.internal/free/ws?serverId='+encodeURIComponent(serverId)+'&playerId='+encodeURIComponent(url.searchParams.get('playerId')||'')+'&token='+encodeURIComponent(url.searchParams.get('token')||''),{headers:request.headers}));
    }
    const authResponse=await handleAuthRequest(request,env,url);if(authResponse)return authResponse;
    if(url.pathname==='/api/rooms/create'&&request.method==='POST'){
      let body;try{body=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
      if(!validNickname(body?.name))return json({error:'INVALID_NAME'},400);
      const settings=normalizeSettings(body?.settings||{});if(!validSettings(settings))return json({error:'INVALID_SETTINGS'},400);
      for(let i=0;i<12;i++){
        const code=generateRoomCode(),id=env.ROOMS.idFromName(code),stub=env.ROOMS.get(id);
        const resp=await stub.fetch(new Request('https://room.internal/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,name:sanitizeNickname(body.name),settings,loadout:safeLoadout(body.loadout)})}));
        if(resp.status===409)continue;
        const result=await resp.json();return json(result,resp.status);
      }
      return json({error:'ROOM_CODE_EXHAUSTED'},503);
    }
    const m=url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/(join|ws)$/);
    if(m){
      const code=normalizeRoomCode(m[1]);if(!validRoomCode(code))return json({error:'INVALID_CODE'},400);
      const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
      if(m[2]==='join'&&request.method==='POST')return stub.fetch(new Request('https://room.internal/join',{method:'POST',headers:request.headers,body:request.body}));
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
    if(this.room.mode==='freeroam'){this.room.records=this.room.records||{speed:0,drift:0};this.room.dragQueue=this.room.dragQueue||[];this.room.dragChallenges=this.room.dragChallenges||{};return;}
    this.room.finishOrder=this.room.finishOrder||[];this.room.settings=normalizeSettings(this.room.settings||{});this.room.settlement=this.room.settlement||null;
    for(const p of this.room.players){
      if(typeof p.wagerConfirmed!=='boolean')p.wagerConfirmed=this.room.settings.wager===0;
      if(!Number.isInteger(p.stake))p.stake=0;
    }
  }
  async save(){if(this.room){this.room.updatedAt=now();await this.ctx.storage.put('room',this.room);await this.scheduleAlarm();}}
  async scheduleAlarm(){
    if(!this.room)return;let at=this.room.mode==='freeroam'?now()+24*60*60*1000:this.room.createdAt+ROOM_TTL_MS;
    const disconnected=this.room.players.filter(p=>!p.connected&&p.disconnectedUntil).map(p=>p.disconnectedUntil);
    if(disconnected.length)at=Math.min(at,...disconnected);
    if(!this.room.players.some(p=>p.connected))at=Math.min(at,this.room.emptySince?this.room.emptySince+EMPTY_ROOM_TTL_MS:now()+EMPTY_ROOM_TTL_MS);
    await this.ctx.storage.setAlarm(Math.max(now()+1000,at));
  }

  publicFreeRoom(){
    const r=this.room;return {protocol:PROTOCOL_VERSION,mode:'freeroam',serverId:r.serverId,maxPlayers:FREE_MAX_PLAYERS,records:r.records||{speed:0,drift:0},players:r.players.map(p=>({id:p.id,name:p.name,owner:p.owner===true,connected:!!p.connected,liveryId:p.liveryId,effectId:p.effectId,state:p.state||null}))};
  }
  async handleFreeMessage(ws,p,m){
    if(m.type==='ping'){if(typeof m.clientTime==='number')this.send(ws,{type:'pong',v:PROTOCOL_VERSION,clientTime:m.clientTime,serverTime:now()});return;}
    if(m.type==='free_state'){
      const t=now(),s=m.state;if(!s||!Number.isInteger(s.seq)||s.seq<=p.lastSeq||t-p.lastStateAt<45)return;
      if(![s.x,s.y,s.vx,s.vy,s.angle,s.speed].every(Number.isFinite)||s.x<0||s.x>FREE_WORLD.w||s.y<0||s.y>FREE_WORLD.h||Math.abs(s.vx)>1200||Math.abs(s.vy)>1200||s.speed<0||s.speed>650)return;
      p.lastSeq=s.seq;p.lastStateAt=t;p.state={x:s.x,y:s.y,vx:s.vx,vy:s.vy,angle:s.angle,speed:s.speed,serverTime:t};this.broadcast({type:'free_state',v:PROTOCOL_VERSION,playerId:p.id,serverTime:t,state:p.state},ws);return;
    }
    if(m.type==='chat'){
      const t=now(),text=String(m.text||'').trim().replace(/\s+/g,' ').slice(0,180);if(!text||t-(p.lastChatAt||0)<700)return;p.lastChatAt=t;this.broadcast({type:'free_chat',v:PROTOCOL_VERSION,playerId:p.id,name:p.name,owner:p.owner===true,text,serverTime:t});return;
    }
    if(m.type==='record'){
      const kind=m.kind,value=Math.floor(Number(m.value)||0);if(!['speed','drift'].includes(kind)||value<=0||value>(kind==='speed'?650:100000000))return;
      if(value>(this.room.records?.[kind]||0)){this.room.records[kind]=value;await this.save();this.broadcast({type:'free_record',v:PROTOCOL_VERSION,kind,value,playerId:p.id,name:p.name,serverTime:now()});}return;
    }
    if(m.type==='activity_join'&&m.activity==='drag'){
      const q=this.room.dragQueue=this.room.dragQueue||[];if(!q.includes(p.id))q.push(p.id);this.broadcast({type:'drag_queue',v:PROTOCOL_VERSION,count:q.length});
      const live=q.filter(id=>this.room.players.some(x=>x.id===id&&x.connected));this.room.dragQueue=live;
      if(live.length>=2){const ids=live.splice(0,2),challengeId=crypto.randomUUID(),startAt=now()+3200;this.room.dragQueue=live;this.room.dragChallenges[challengeId]={ids,startAt,finishes:{},createdAt:now()};await this.save();this.broadcast({type:'activity_start',v:PROTOCOL_VERSION,activity:'drag',challengeId,participants:ids,startAt});}return;
    }
    if(m.type==='activity_finish'&&m.activity==='drag'){
      const c=this.room.dragChallenges?.[m.challengeId];if(!c||!c.ids.includes(p.id)||c.finishes[p.id])return;const elapsed=Math.floor(Number(m.elapsedMs)||0);if(elapsed<500||elapsed>120000)return;c.finishes[p.id]=elapsed;
      const done=c.ids.every(id=>c.finishes[id]);if(done){const sorted=[...c.ids].sort((a,b)=>c.finishes[a]-c.finishes[b]),names=Object.fromEntries(c.ids.map(id=>[id,this.room.players.find(x=>x.id===id)?.name||'RACER']));this.broadcast({type:'activity_result',v:PROTOCOL_VERSION,activity:'drag',challengeId:m.challengeId,winnerId:sorted[0],times:c.finishes,names});delete this.room.dragChallenges[m.challengeId];await this.save();}return;
    }
    if(m.type==='leave'){
      this.room.players=this.room.players.filter(x=>x.id!==p.id);this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>id!==p.id);if(!this.room.players.length){this.room=null;await this.ctx.storage.deleteAll();try{ws.close(1000,'leave');}catch{};return;}await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicFreeRoom()},ws);try{ws.close(1000,'leave');}catch{};return;
    }
  }

  publicRoom(){
    const r=this.room,settlement=r.settlement?{raceId:r.settlement.raceId,status:r.settlement.status,pot:r.settlement.pot||0,wager:r.settlement.wager||0,winnerId:r.settlement.winnerId||null,reason:r.settlement.reason||'',stakes:r.settlement.stakes||{}}:null;
    return {protocol:PROTOCOL_VERSION,code:r.code,status:r.status,settings:r.settings,hostId:r.hostId,raceId:r.raceId||null,raceStartAt:r.raceStartAt||0,gridOrder:r.gridOrder||[],finishOrder:r.finishOrder||[],settlement,pot:settlement?.pot||0,players:r.players.map(p=>({id:p.id,name:p.name,ready:!!p.ready,connected:!!p.connected,host:p.id===r.hostId,liveryId:p.liveryId,effectId:p.effectId,wagerConfirmed:!!p.wagerConfirmed,stake:p.stake||0,finishPlace:p.finishPlace||0,finishTime:p.finishTime||0,state:p.state?{laps:p.state.laps,progress:p.state.progress,finished:!!p.state.finished,driftScore:Math.max(0,Math.floor(Number(p.state.driftScore)||0))}:null}))};
  }
  send(ws,obj){try{ws.send(JSON.stringify(obj));}catch{}}
  broadcast(obj,except=null){const text=JSON.stringify(obj);for(const ws of this.ctx.getWebSockets()){if(ws===except)continue;try{ws.send(text);}catch{}}}
  error(ws,code,message){this.send(ws,{type:'error',v:PROTOCOL_VERSION,code,message});}
  resetRaceState({resetConfirmation=false}={}){
    const r=this.room;r.status='lobby';r.raceId=null;r.raceStartAt=0;r.gridOrder=[];r.finishOrder=[];
    for(const x of r.players){x.ready=false;x.finishPlace=0;x.finishTime=0;x.state=null;x.lastSeq=-1;x.lastStateAt=0;x.serverLaps=0;x.lastLapAt=0;x.stake=0;if(resetConfirmation)x.wagerConfirmed=r.settings.wager===0;}
  }
  refundActiveWager(reason='RACE_CANCELLED'){
    const s=this.room?.settlement;if(!s||s.status!=='locked')return false;
    s.status='refunded';s.reason=reason;s.refundedAt=now();s.winnerId=null;
    this.resetRaceState({resetConfirmation:true});return true;
  }
  async fetch(request){
    await this.load();const url=new URL(request.url);

    if(url.pathname==='/free/status')return json({ok:true,players:this.room?.mode==='freeroam'?this.room.players.filter(p=>p.connected).length:0,records:this.room?.mode==='freeroam'?(this.room.records||{}):{}});
    if(url.pathname==='/free/join'&&request.method==='POST'){
      let b;try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}if(!validFreeName(b?.name))return json({error:'INVALID_NAME'},400);
      const serverId=url.searchParams.get('serverId')||'city-01',t=now();if(!this.room||this.room.mode!=='freeroam')this.room={mode:'freeroam',serverId,createdAt:t,updatedAt:t,emptySince:0,records:{speed:0,drift:0},dragQueue:[],dragChallenges:{},players:[]};
      const live=this.room.players.filter(p=>p.connected||p.disconnectedUntil>t);if(live.length>=FREE_MAX_PLAYERS)return json({error:'SERVER_FULL'},409);
      const id=playerId(),sessionToken=token(),loadout=safeLoadout(b.loadout);this.room.players.push({id,name:sanitizeNickname(b.name),owner:b.owner===true,token:sessionToken,connected:false,disconnectedUntil:t+RECONNECT_GRACE_MS,liveryId:loadout.liveryId,effectId:loadout.effectId,lastSeq:-1,lastStateAt:0,lastChatAt:0,state:null});await this.save();return json({ok:true,serverId:this.room.serverId,playerId:id,sessionToken,room:this.publicFreeRoom()},201);
    }
    if(url.pathname==='/free/ws'){
      if(request.headers.get('Upgrade')!=='websocket')return json({error:'WEBSOCKET_REQUIRED'},426);if(!this.room||this.room.mode!=='freeroam')return json({error:'SERVER_NOT_FOUND'},404);
      const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);if(!p)return json({error:'SESSION_INVALID'},401);
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server,['free']);server.serializeAttachment({playerId:p.id});for(const old of this.ctx.getWebSockets()){if(old===server)continue;const a=old.deserializeAttachment?.();if(a?.playerId===p.id)try{old.close(4001,'replaced');}catch{}}
      p.connected=true;p.disconnectedUntil=0;this.room.emptySince=0;await this.save();this.send(server,{type:'free_hello',v:PROTOCOL_VERSION,playerId:p.id,serverTime:now(),room:this.publicFreeRoom()});this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicFreeRoom()},server);return new Response(null,{status:101,webSocket:client});
    }

    if(url.pathname==='/create'&&request.method==='POST'){
      if(this.room&&this.room.players.length&&now()-(this.room.updatedAt||0)<ROOM_TTL_MS)return json({error:'ROOM_EXISTS'},409);
      const b=await request.json(),created=now(),id=playerId(),sessionToken=token(),settings=normalizeSettings(b.settings);
      this.room={code:b.code,createdAt:created,updatedAt:created,emptySince:created,status:'lobby',settings,hostId:id,raceId:null,raceStartAt:0,gridOrder:[],finishOrder:[],settlement:null,players:[{id,name:sanitizeNickname(b.name),token:sessionToken,ready:false,connected:false,disconnectedUntil:created+RECONNECT_GRACE_MS,liveryId:b.loadout?.liveryId||'apexLime',effectId:b.loadout?.effectId||'standard',wagerConfirmed:settings.wager===0,stake:0,creditSnapshot:null,lastSeq:-1,lastStateAt:0,state:null,serverLaps:0,lastLapAt:0,finishPlace:0,finishTime:0}]};
      await this.save();return json({ok:true,code:b.code,playerId:id,sessionToken,room:this.publicRoom()},201);
    }
    if(url.pathname==='/join'&&request.method==='POST'){
      if(!this.room)return json({error:'ROOM_NOT_FOUND'},404);
      let b;try{b=await request.json();}catch{return json({error:'INVALID_REQUEST'},400);}
      if(!validNickname(b?.name))return json({error:'INVALID_NAME'},400);
      if(this.room.status!=='lobby')return json({error:'RACE_ALREADY_STARTED'},409);
      const active=this.room.players.filter(p=>p.connected||p.disconnectedUntil>now());if(active.length>=this.room.settings.maxPlayers)return json({error:'ROOM_FULL'},409);
      const id=playerId(),sessionToken=token(),t=now(),loadout=safeLoadout(b.loadout);this.room.players.push({id,name:sanitizeNickname(b.name),token:sessionToken,ready:false,connected:false,disconnectedUntil:t+RECONNECT_GRACE_MS,liveryId:loadout.liveryId,effectId:loadout.effectId,wagerConfirmed:this.room.settings.wager===0,stake:0,creditSnapshot:null,lastSeq:-1,lastStateAt:0,state:null,serverLaps:0,lastLapAt:0,finishPlace:0,finishTime:0});
      await this.save();return json({ok:true,code:this.room.code,playerId:id,sessionToken,room:this.publicRoom()},201);
    }
    if(url.pathname==='/ws'||url.pathname.endsWith('/ws')){
      if(request.headers.get('Upgrade')!=='websocket')return json({error:'WEBSOCKET_REQUIRED'},426);
      if(!this.room)return json({error:'ROOM_NOT_FOUND'},404);
      const id=url.searchParams.get('playerId')||'',sessionToken=url.searchParams.get('token')||'',p=this.room.players.find(x=>x.id===id&&x.token===sessionToken);
      if(!p)return json({error:'SESSION_INVALID'},401);
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server,['room']);server.serializeAttachment({playerId:p.id});
      for(const old of this.ctx.getWebSockets()){if(old===server)continue;const a=old.deserializeAttachment?.();if(a?.playerId===p.id)try{old.close(4001,'replaced');}catch{}}
      p.connected=true;p.disconnectedUntil=0;this.room.emptySince=0;await this.save();
      this.send(server,{type:'hello',v:PROTOCOL_VERSION,playerId:p.id,serverTime:now(),room:this.publicRoom()});this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()},server);
      return new Response(null,{status:101,webSocket:client});
    }
    return json({error:'NOT_FOUND'},404);
  }
  async webSocketMessage(ws,message){
    await this.load();if(!this.room)return;const a=ws.deserializeAttachment?.(),p=this.room.players.find(x=>x.id===a?.playerId);if(!p)return this.error(ws,'SESSION_INVALID','Сессия игрока недействительна');
    const parsed=parseClientMessage(message);if(!parsed.ok){if(parsed.error==='message_too_large')try{ws.close(1009,'message too large');}catch{};return;}
    const m=parsed.msg;if(this.room.mode==='freeroam')return this.handleFreeMessage(ws,p,m);if(m.v!==undefined&&m.v!==PROTOCOL_VERSION)return this.error(ws,'PROTOCOL_VERSION','Версия Online-протокола не поддерживается');
    if(m.type==='ping'){if(typeof m.clientTime==='number')this.send(ws,{type:'pong',v:PROTOCOL_VERSION,clientTime:m.clientTime,serverTime:now()});return;}
    if(m.type==='wager_confirm'){
      if(this.room.status!=='lobby')return;
      const amount=m.amount,balance=safeBalance(m.balance);if(!validWager(amount)||amount!==this.room.settings.wager)return this.error(ws,'WAGER_MISMATCH','Ставка комнаты изменилась');
      if(balance===null||balance<amount)return this.error(ws,'INSUFFICIENT_CR','Недостаточно CR для этой ставки');
      p.wagerConfirmed=true;p.creditSnapshot=balance;p.ready=false;await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='ready'){
      if(this.room.status!=='lobby'||typeof m.ready!=='boolean')return;
      if(m.ready&&this.room.settings.wager>0&&!p.wagerConfirmed)return this.error(ws,'WAGER_CONFIRM_REQUIRED','Сначала подтвердите ставку');
      p.ready=m.ready;await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='settings_update'){
      if(p.id!==this.room.hostId)return this.error(ws,'HOST_ONLY','Только HOST может менять настройки');
      if(this.room.status!=='lobby'||!validSettings(m.settings))return this.error(ws,'INVALID_SETTINGS','Недопустимые параметры комнаты');
      const next=normalizeSettings(m.settings);if(next.maxPlayers<this.room.players.filter(x=>x.connected).length)return this.error(ws,'ROOM_TOO_LARGE','Сначала уменьшите число игроков');
      const wagerChanged=next.wager!==this.room.settings.wager;this.room.settings=next;
      if(wagerChanged)for(const x of this.room.players){x.wagerConfirmed=next.wager===0;x.creditSnapshot=null;x.ready=false;x.stake=0;}
      await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='start_race'){
      if(p.id!==this.room.hostId)return this.error(ws,'HOST_ONLY','Только HOST может начать гонку');
      if(this.room.status!=='lobby')return;
      const live=this.room.players.filter(x=>x.connected);if(live.length<2)return this.error(ws,'NEED_PLAYERS','Нужно минимум 2 игрока');
      if(live.some(x=>!x.ready))return this.error(ws,'NOT_READY','Все игроки должны быть готовы');
      const wager=this.room.settings.wager||0;if(wager>0&&live.some(x=>!x.wagerConfirmed||safeBalance(x.creditSnapshot)===null||x.creditSnapshot<wager))return this.error(ws,'WAGER_NOT_CONFIRMED','Все игроки должны подтвердить ставку и иметь достаточно CR');
      this.room.status='countdown';this.room.raceId=crypto.randomUUID();this.room.raceStartAt=now()+3500;this.room.gridOrder=live.map(x=>x.id);this.room.finishOrder=[];
      const stakes={};for(const x of this.room.players){x.finishPlace=0;x.finishTime=0;x.state=null;x.lastSeq=-1;x.lastStateAt=0;x.serverLaps=0;x.lastLapAt=this.room.raceStartAt;x.stake=this.room.gridOrder.includes(x.id)?wager:0;if(x.stake)stakes[x.id]=x.stake;}
      this.room.settlement={raceId:this.room.raceId,status:wager>0?'locked':'none',wager,pot:wager*live.length,winnerId:null,reason:'',stakes,createdAt:now()};
      await this.save();this.broadcast({type:'start_countdown',v:PROTOCOL_VERSION,serverTime:now(),raceStartAt:this.room.raceStartAt,raceId:this.room.raceId,room:this.publicRoom()});return;
    }
    if(m.type==='player_state'){
      if(!['countdown','racing'].includes(this.room.status)||m.raceId!==this.room.raceId||!validPlayerState(m.state))return;
      const t=now();if(m.state.seq<=p.lastSeq||t-p.lastStateAt<PLAYER_STATE_RATE_MS)return;
      const knownLaps=Number.isInteger(p.serverLaps)?p.serverLaps:(p.state?.laps||0);if(m.state.laps<knownLaps||m.state.laps>knownLaps+1)return;if(m.state.laps>knownLaps){if(t-(p.lastLapAt||this.room.raceStartAt)<8000)return;p.serverLaps=m.state.laps;p.lastLapAt=t;}
      if(p.state){const dt=Math.max(.04,(t-p.lastStateAt)/1000),dist=Math.hypot(m.state.x-p.state.x,m.state.y-p.state.y);if(dist>Math.max(145,dt*1050))return;}
      p.lastSeq=m.state.seq;p.lastStateAt=t;p.state={...m.state,serverTime:t};if(this.room.status==='countdown'&&t>=this.room.raceStartAt)this.room.status='racing';
      this.broadcast({type:'player_state',v:PROTOCOL_VERSION,raceId:this.room.raceId,playerId:p.id,serverTime:t,state:p.state},ws);return;
    }
    if(m.type==='race_finish'){
      if(this.room.status!=='racing'||m.raceId!==this.room.raceId||p.finishPlace)return;
      if(validPlayerState(m.state)&&m.state.seq>p.lastSeq){const t=now(),knownLaps=Number.isInteger(p.serverLaps)?p.serverLaps:(p.state?.laps||0);if(m.state.laps>=knownLaps&&m.state.laps<=knownLaps+1&&(!(m.state.laps>knownLaps)||t-(p.lastLapAt||this.room.raceStartAt)>=8000)){if(m.state.laps>knownLaps){p.serverLaps=m.state.laps;p.lastLapAt=t;}p.lastSeq=m.state.seq;p.lastStateAt=t;p.state={...m.state,serverTime:t};}}
      if(!p.state||p.state.laps<this.room.settings.laps)return this.error(ws,'FINISH_REJECTED','Финиш не подтверждён состоянием гонки');
      p.finishPlace=this.room.finishOrder.length+1;p.finishTime=Math.max(0,now()-this.room.raceStartAt);this.room.finishOrder.push(p.id);p.state.finished=true;
      if(p.finishPlace===1&&this.room.settlement?.status==='locked'){this.room.settlement.status='awarded';this.room.settlement.winnerId=p.id;this.room.settlement.awardedAt=now();}
      await this.save();this.broadcast({type:'race_finish',v:PROTOCOL_VERSION,raceId:this.room.raceId,playerId:p.id,finishPlace:p.finishPlace,finishTime:p.finishTime,room:this.publicRoom()});return;
    }
    if(m.type==='return_lobby'){
      if(p.id!==this.room.hostId)return this.error(ws,'HOST_ONLY','Только HOST может вернуть комнату в Lobby');
      const racers=(this.room.gridOrder||[]).map(id=>this.room.players.find(x=>x.id===id)).filter(Boolean);if(racers.some(x=>!x.finishPlace))return this.error(ws,'RACE_NOT_FINISHED','Дождитесь финиша остальных игроков');
      this.resetRaceState({resetConfirmation:true});await this.save();this.broadcast({type:'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.publicRoom()});return;
    }
    if(m.type==='leave'){
      const wagerCancelled=this.room.settlement?.status==='locked'&&Object.prototype.hasOwnProperty.call(this.room.settlement.stakes||{},p.id);if(wagerCancelled)this.refundActiveWager('PLAYER_LEFT');
      this.room.players=this.room.players.filter(x=>x.id!==p.id);if(this.room.hostId===p.id)this.room.hostId=this.room.players.find(x=>x.connected)?.id||this.room.players[0]?.id||null;
      if(!this.room.players.length){this.room=null;await this.ctx.storage.deleteAll();try{ws.close(1000,'leave');}catch{};return;}
      await this.save();this.broadcast({type:wagerCancelled?'race_cancelled':'room_state',v:PROTOCOL_VERSION,serverTime:now(),reason:wagerCancelled?'PLAYER_LEFT':'',room:this.publicRoom()},ws);try{ws.close(1000,'leave');}catch{};return;
    }
  }
  async webSocketClose(ws){await this.handleDisconnect(ws);}
  async webSocketError(ws){await this.handleDisconnect(ws);}
  async handleDisconnect(ws){
    await this.load();if(!this.room)return;const a=ws.deserializeAttachment?.(),p=this.room.players.find(x=>x.id===a?.playerId);if(!p)return;
    const stillLive=this.ctx.getWebSockets().some(s=>s!==ws&&s.deserializeAttachment?.()?.playerId===p.id);if(stillLive)return;
    p.connected=false;p.disconnectedUntil=now()+RECONNECT_GRACE_MS;if(!this.room.players.some(x=>x.connected))this.room.emptySince=now();await this.save();this.broadcast({type:this.room.mode==='freeroam'?'free_room':'room_state',v:PROTOCOL_VERSION,serverTime:now(),room:this.room.mode==='freeroam'?this.publicFreeRoom():this.publicRoom()});
  }
  async alarm(){
    await this.load();if(!this.room)return;const t=now();const removed=this.room.players.filter(p=>!p.connected&&p.disconnectedUntil&&p.disconnectedUntil<=t);
    if(this.room.mode==='freeroam'){if(removed.length){const ids=new Set(removed.map(p=>p.id));this.room.players=this.room.players.filter(p=>!ids.has(p.id));this.room.dragQueue=(this.room.dragQueue||[]).filter(id=>!ids.has(id));}if(!this.room.players.length||(!this.room.players.some(p=>p.connected)&&this.room.emptySince&&t>=this.room.emptySince+EMPTY_ROOM_TTL_MS)){this.room=null;await this.ctx.storage.deleteAll();return;}await this.save();this.broadcast({type:'free_room',v:PROTOCOL_VERSION,serverTime:t,room:this.publicFreeRoom()});return;}
    const removedLockedRacer=removed.some(p=>this.room.settlement?.status==='locked'&&Object.prototype.hasOwnProperty.call(this.room.settlement.stakes||{},p.id));if(removedLockedRacer)this.refundActiveWager('CONNECTION_TIMEOUT');
    if(removed.length){this.room.players=this.room.players.filter(p=>!removed.includes(p));if(!this.room.players.some(p=>p.id===this.room.hostId))this.room.hostId=this.room.players.find(p=>p.connected)?.id||this.room.players[0]?.id||null;}
    if(!this.room.players.length||t>=this.room.createdAt+ROOM_TTL_MS||(!this.room.players.some(p=>p.connected)&&this.room.emptySince&&t>=this.room.emptySince+EMPTY_ROOM_TTL_MS)){if(this.room?.settlement?.status==='locked')this.refundActiveWager('ROOM_EXPIRED');this.room=null;await this.ctx.storage.deleteAll();return;}
    await this.save();this.broadcast({type:removedLockedRacer?'race_cancelled':'room_state',v:PROTOCOL_VERSION,serverTime:t,reason:removedLockedRacer?'CONNECTION_TIMEOUT':'',room:this.publicRoom()});
  }
}
