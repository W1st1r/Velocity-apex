(function(){
  'use strict';

  const $=id=>document.getElementById(id),R=window.Racing||{};
  const browser=$('freeServers'),roam=$('freeRoam'),canvas=$('freeCanvas');
  if(!browser||!roam||!canvas)return;

  const ctx=canvas.getContext('2d');
  const mapCanvas=$('freeMapCanvas');
  const mctx=mapCanvas.getContext('2d');

  const CITY=window.ApexCity;
  if(!CITY)throw new Error("APEX BAY map module is missing");
  const WORLD={w:CITY.width,h:CITY.height};
  const MAX=20;
  const ZONES={
    crews:{x:2020,y:1250,r:150,label:'КЛАНЫ',kind:'crews'},
    drag:{x:3120,y:2670,r:125,label:'AIRPORT DRAG',kind:'drag'},
    speed:{x:2020,y:430,r:120,label:'SPEED TRAP',kind:'speed'},
    drift:{x:620,y:2290,r:310,label:'PORT DRIFT',kind:'drift',battleId:'harbor'},
    driftIndustrial:{x:1110,y:1320,r:260,label:'INDUSTRIAL DRIFT',kind:'driftBattle',battleId:'industrial'},
    driftParking:{x:3700,y:1710,r:285,label:'PARKING DRIFT',kind:'driftBattle',battleId:'parking'},
    koth:{x:2320,y:1590,r:100,label:'KING OF THE HILL',kind:'koth'},
    levels:{x:2470,y:1590,r:100,label:'LEVELS',kind:'levels'},
    meet:{x:2320,y:1590,r:260,label:'CAR MEET',kind:'meet'}
  };
  // MOUNTAIN PASS now follows the lakeside spline in free-city.js.
  const CHAT_PREVIEW_LIMIT=4;
  const SOLO_PHYS=R.RACE_PHYSICS||{maxSpeed:510,accel:268,brakePower:368,turnRate:2.40};
  const FREE_PHYS_TRACK={
    roadWidth:100000,barrierMargin:0,theme:{drag:1},
    nearest(x,y){return{x,y,tx:1,ty:0,nx:0,ny:1,signed:0,index:0,progress:.5};},
    surfaceAtOffset(){return{type:'asphalt'};},
    barrierCenterLimit(){return 1e9;}
  };

  const state={
    active:false,servers:[],server:null,playerId:null,token:null,ws:null,seq:0,lastSend:0,serverOffset:0,serverOffsetReady:false,rtt:0,pingTimer:0,
    room:null,remotes:new Map(),chat:[],drag:null,dragQueued:false,activityPending:false,liveEvent:null,progress:{totalExp:0,level:0,levelExp:0,requiredExp:100,toNext:100},driftScore:0,driftInside:false,
    speedCooldown:0,waypoint:null,chatUnread:0,loadout:null,playerVisual:null,driftPhysicsTime:0,paused:false
  };
  const input={left:false,right:false,gas:false,brake:false,handbrake:false};
  const car=R.Car?new R.Car({player:true,maxSpeed:SOLO_PHYS.maxSpeed,accel:SOLO_PHYS.accel,brakePower:SOLO_PHYS.brakePower,turnRate:SOLO_PHYS.turnRate}):{x:2320,y:1590,vx:0,vy:0,angle:-Math.PI/2,speed:0};
  let W=1,H=1,DPR=1,last=performance.now(),raf=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
  const TAU=Math.PI*2;
  const DRAG_START_X=3130,DRAG_FINISH_X=4710,DRAG_LENGTH=DRAG_FINISH_X-DRAG_START_X;
  const FREE_SEND_MS=50,DRAG_SEND_MS=30,REMOTE_BACKTIME_MS=55,DRAG_REMOTE_BACKTIME_MS=32,REMOTE_EXTRAPOLATE_MS=260,KOTH_SWITCH_MS=[0,55000,110000,165000,210000];

  let lastMapDraw=0;
  const mapView={zoom:1,x:WORLD.w/2,y:WORLD.h/2};
  let mapDrag=null,mapWasDragged=false;

  function angleLerp(a,b,t){let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return a+d*t;}
  function pushRemoteSnapshot(r,s,serverTime){
    if(!r||!s)return;const at=Number.isFinite(s.sampleTime)?s.sampleTime:(Number.isFinite(serverTime)?serverTime:Date.now()+state.serverOffset);if(Number.isFinite(r.ignoreBefore)&&at<r.ignoreBefore)return;const item={...s,_at:at};
    r.snapshots=r.snapshots||[];const last=r.snapshots[r.snapshots.length-1];if(last&&Number.isFinite(item.seq)&&Number.isFinite(last.seq)&&item.seq<=last.seq)return;
    if(last&&Math.hypot((item.x||0)-(last.x||0),(item.y||0)-(last.y||0))>720)r.snapshots.length=0;
    r.snapshots.push(item);if(r.snapshots.length>18)r.snapshots.splice(0,r.snapshots.length-18);r.target=s;
  }
  function sampleRemote(r,targetTime){
    const a=r?.snapshots;if(!a?.length)return r?.target||null;while(a.length>3&&a[1]._at<targetTime-500)a.shift();
    let before=null,after=null;for(const snap of a){if(snap._at<=targetTime)before=snap;if(snap._at>=targetTime){after=snap;break;}}
    if(before&&after&&before!==after){const t=clamp((targetTime-before._at)/Math.max(1,after._at-before._at),0,1);return {...after,x:before.x+(after.x-before.x)*t,y:before.y+(after.y-before.y)*t,vx:before.vx+(after.vx-before.vx)*t,vy:before.vy+(after.vy-before.vy)*t,speed:before.speed+(after.speed-before.speed)*t,angle:angleLerp(before.angle,after.angle,t)};}
    const latest=a[a.length-1],age=targetTime-latest._at;if(age>0&&age<=REMOTE_EXTRAPOLATE_MS){const dt=age/1000;return {...latest,x:latest.x+(latest.vx||0)*dt,y:latest.y+(latest.vy||0)*dt,angle:latest.angle+(latest.yawRate||0)*dt};}
    return latest;
  }
  function resetRemoteToGrid(playerId,lane,startAt){
    const r=state.remotes.get(playerId);if(!r)return;const y=2635+lane*70;r.ignoreBefore=(Number(startAt)||0)-250;r.x=DRAG_START_X;r.y=y;r.angle=0;r.target={...(r.target||{}),x:DRAG_START_X,y,angle:0,vx:0,vy:0,speed:0,sampleTime:Date.now()+state.serverOffset};r.snapshots=[];pushRemoteSnapshot(r,r.target,r.target.sampleTime);
  }

  function accountName(){
    return (window.VelocityAccount?.user?.displayName||localStorage.getItem('velocityApex.onlineName')||'RACER').trim().slice(0,14)||'RACER';
  }

  function loadSave(){
    try{return R.normalizeSave?R.normalizeSave(JSON.parse(localStorage.getItem('velocityApex.v1')||'{}')):{};}
    catch{return R.normalizeSave?R.normalizeSave({}):{};}
  }

  function loadout(){
    const s=loadSave();
    const liveryId=R.carAvailable(s.selectedLivery)?(s.selectedLivery||'apexLime'):'apexLime',effectId=s.selectedEffect||'standard',style=R.getCarCustomization?.(s,liveryId)||{colorId:'stock',vinylId:'none'};
    return {liveryId,effectId,colorId:style.colorId,vinylId:style.vinylId,livery:R.LIVERIES?.[liveryId]||R.LIVERIES?.apexLime||null};
  }

  function expRequired(level){const l=Math.max(0,Math.min(99,Math.floor(Number(level)||0))),raw=100+10*l+.25*l*l;return Math.floor((raw+5-1e-9)/10)*10;}
  function progressFromTotal(totalExp){let left=Math.max(0,Math.floor(Number(totalExp)||0)),level=0;while(level<100){const need=expRequired(level);if(left<need)break;left-=need;level++;}return {totalExp:Math.max(0,Math.floor(Number(totalExp)||0)),level,levelExp:level>=100?0:left,requiredExp:level>=100?0:expRequired(level),toNext:level>=100?0:Math.max(0,expRequired(level)-left)};}
  function ownPlayer(){return state.room?.players?.find(p=>p.id===state.playerId)||null;}
  function syncProgress(progress){state.progress={...state.progress,...progress};const pill=$('freeLevelValue');if(pill)pill.textContent=String(state.progress.level||0);renderLevelsPanel();}
  function renderLevelsPanel(){
    const p=state.progress||progressFromTotal(0),max=p.level>=100,number=$('freeLevelsNumber'),maxEl=$('freeLevelsMax'),bar=$('freeLevelsBar'),text=$('freeLevelsProgressText'),next=$('freeLevelsNext'),total=$('freeLevelsTotal');if(!number)return;
    number.textContent=String(p.level||0);maxEl.textContent=max?'MAX LEVEL':'';total.textContent=Number(p.totalExp||0).toLocaleString('ru-RU');const ratio=max?1:Math.max(0,Math.min(1,(Number(p.levelExp)||0)/Math.max(1,Number(p.requiredExp)||1)));bar.style.width=(ratio*100).toFixed(1)+'%';text.textContent=max?'MAX LEVEL':`${Number(p.levelExp||0).toLocaleString('ru-RU')} / ${Number(p.requiredExp||0).toLocaleString('ru-RU')} EXP`;next.textContent=max?'LEVEL 100 · MAX LEVEL':`До следующего уровня: ${Number(p.toNext||0).toLocaleString('ru-RU')} EXP`;
  }
  function toggleLevels(force){const panel=$('freeLevelsPanel');if(!panel)return;const show=force??panel.classList.contains('hidden');panel.classList.toggle('hidden',!show);panel.setAttribute('aria-hidden',String(!show));if(show){toggleChat(false);toggleMap(false);renderLevelsPanel();}}
  function formatEventTime(ms){const sec=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
  function eventTitle(activity){return activity==='drift_battle'?'DRIFT BATTLE':activity==='koth'?'KING OF THE HILL':'LIVE EVENT';}
  function renderEventHud(){
    const hud=$('freeEventHud'),e=state.liveEvent;if(!hud)return;
    const active=!!e&&['waiting','countdown','running'].includes(e.status);roam.classList.toggle('event-active',!!e);
    if(!e){hud.classList.add('hidden');hud.classList.remove('final','result','ending');return;}hud.classList.remove('hidden');hud.classList.toggle('final',!!e.finalZone);hud.classList.toggle('result',e.status==='result');$('freeEventTitle').textContent=eventTitle(e.activity);$('freeEventMode').textContent=e.status==='result'?'SERVER RESULT':'LIVE EVENT';const leave=$('freeEventLeave');if(leave)leave.classList.toggle('hidden',!active);const zone=e.zone?.label||e.zoneId||'';$('freeEventZone').textContent=e.activity==='koth'?(e.finalZone?'FINAL ZONE · ':'ACTIVE ZONE · ')+(zone||'—'):(zone?`ZONE · ${String(zone).toUpperCase()}`:'');const root=$('freeEventStandings');root.replaceChildren();const rows=(e.results||e.standings||[]).slice(0,6);if(!rows.length){const empty=document.createElement('div');empty.className='free-event-row';empty.textContent=e.status==='waiting'?'ОЖИДАЕМ ИГРОКОВ…':'ПОДГОТОВКА…';root.appendChild(empty);}else rows.forEach((r,i)=>{const row=document.createElement('div');row.className='free-event-row'+(r.id===state.playerId?' me':'')+(r.eligible===false?' ineligible':'');const place=document.createElement('b');place.textContent=String(r.place||i+1);const name=document.createElement('strong');appendPlayerName(name,r.name||'RACER',false,Number(r.level)||0,r.adminLevel??null);const score=document.createElement('span');score.textContent=e.activity==='drift_battle'?Number(r.score||0).toLocaleString('ru-RU'):String(Math.floor(Number(r.score)||0));row.append(place,name,score);if(e.status==='result'){const reward=document.createElement('small');reward.textContent=r.eligible===false?(e.activity==='drift_battle'?'НАГРАДА НЕ ВЫДАНА · НУЖНО АКТИВНО ДРИФТИТЬ':'НАГРАДА НЕ ВЫДАНА · НУЖНО УЧАСТВОВАТЬ'):`+${r.exp||0} EXP · +${r.credits||0} CR${r.capped?' · CR LIMIT':''}`;row.append(reward);}root.appendChild(row);});
  }
  function updateEventClock(now){
    const e=state.liveEvent,hud=$('freeEventHud');if(!e||!hud||hud.classList.contains('hidden'))return;const phase=$('freeEventPhase'),clock=$('freeEventTime');
    if(e.status==='waiting'){phase.textContent='WAITING';clock.textContent=`${e.participants?.length||1}/${e.minPlayers||2}`;return;}
    if(e.status==='countdown'){phase.textContent='СТАРТ ЧЕРЕЗ';clock.textContent=String(Math.max(1,Math.ceil(((e.startAt||now)-now)/1000)));return;}
    if(e.status==='result'){phase.textContent='FINISHED';clock.textContent='00:00';return;}
    const overallLeft=Math.max(0,(e.endAt||now)-now);hud.classList.toggle('ending',overallLeft<=10000);
    if(e.activity==='koth'&&!e.finalZone){const elapsed=Math.max(0,now-(e.startAt||now)),next=KOTH_SWITCH_MS.find(v=>v>elapsed);if(Number.isFinite(next)&&next-elapsed<=10000){phase.textContent='ЗОНА ЧЕРЕЗ';clock.textContent=String(Math.max(1,Math.ceil((next-elapsed)/1000)));return;}}
    phase.textContent=e.finalZone?'FINAL ZONE':'TIME';clock.textContent=formatEventTime(overallLeft);
  }

  function createVisual(liveryId,effectId,colorId='stock',vinylId='none'){
    if(!R.Car)return null;
    const visual=new R.Car();
    visual.setLoadout(liveryId||'apexLime',effectId||'standard','full');visual.setCustomization(R.getCarStyleByIds?.(colorId,vinylId));
    visual.throttleVisual=.92;
    return visual;
  }

  function refreshPlayerLoadout(){
    state.loadout=loadout();
    if(R.Car&&car.setLoadout){
      car.maxSpeed=SOLO_PHYS.maxSpeed;car.baseMaxSpeed=SOLO_PHYS.maxSpeed;car.accel=SOLO_PHYS.accel;car.brakePower=SOLO_PHYS.brakePower;car.turnRate=SOLO_PHYS.turnRate;
      car.setLoadout(state.loadout.liveryId,state.loadout.effectId,'full');car.setCustomization(R.getCarStyleByIds?.(state.loadout.colorId,state.loadout.vinylId));
      R.applyCarPerformance(car,state.loadout.liveryId,loadSave());
      state.playerVisual=car;
    }else state.playerVisual=createVisual(state.loadout.liveryId,state.loadout.effectId,state.loadout.colorId,state.loadout.vinylId);
    const currentCar=$('freeCurrentCar');
    if(currentCar)currentCar.textContent=(state.loadout.livery?.name||state.loadout.liveryId||'APEX CAR').toUpperCase();
  }

  async function jsonFetch(url,opts={}){
    const r=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(opts.headers||{})},...opts});
    let d={};
    try{d=await r.json();}catch{}
    if(!r.ok){const e=new Error(d.error||'SERVER_ERROR');e.code=d.error||'SERVER_ERROR';throw e;}
    return d;
  }

  function msg(text,bad=false){
    const el=$('freeServerMessage');
    if(!el)return;
    el.textContent=text||'';
    el.className='online-message'+(bad?' bad':'');
  }

  async function loadServers(){
    msg('ОБНОВЛЕНИЕ СПИСКА…');
    try{
      const d=await jsonFetch('/api/free/servers');
      state.servers=d.servers||[];
      renderServers();
      msg('');
    }catch{
      msg('Не удалось загрузить серверы.',true);
    }
  }

  function renderServers(){
    const root=$('freeServerList');
    if(!root)return;
    root.replaceChildren();
    let total=0;
    for(const s of state.servers){
      total+=s.players||0;
      const b=document.createElement('button');
      b.type='button';
      b.className='free-server-card';
      b.disabled=s.players>=s.maxPlayers;
      const load=Math.round((s.players/s.maxPlayers)*100);
      const top=document.createElement('div');
      top.className='free-server-card-top';
      const title=document.createElement('div');
      title.innerHTML=`<small>OPEN CITY / ${s.id.toUpperCase()}</small><strong>${s.name}</strong>`;
      const online=document.createElement('span');
      online.className='free-server-online';
      online.textContent=`${s.players} / ${s.maxPlayers}`;
      top.append(title,online);
      const meta=document.createElement('div');
      meta.className='free-server-meta';
      meta.innerHTML=`<span>ГОРОД · LIVE</span><span>DRAG · DRIFT · SPEED</span><span>РЕКОРД ${Math.floor(s.records?.speed||0)} KM/H</span>`;
      const bar=document.createElement('div');
      bar.className='free-server-load';
      bar.innerHTML=`<i style="width:${load}%"></i>`;
      b.append(top,meta,bar);
      b.addEventListener('click',()=>joinServer(s));
      root.appendChild(b);
    }
    $('freeServersOnline').textContent=`${total} игроков онлайн`;
  }

  function openBrowser(){
    refreshPlayerLoadout();
    window.VelocityOnline?.client?.leave?.();
    $('online')?.classList.add('hidden');
    $('menu')?.classList.add('hidden');
    browser.classList.remove('hidden');
    browser.setAttribute('aria-hidden','false');
    loadServers();
  }

  function closeBrowser(){
    browser.classList.add('hidden');
    browser.setAttribute('aria-hidden','true');
    $('online')?.classList.remove('hidden');
  }

  async function joinServer(server){
    refreshPlayerLoadout();
    msg('ПОДКЛЮЧЕНИЕ К '+server.name+'…');
    try{
      const d=await jsonFetch(`/api/free/${server.id}/join`,{method:'POST',body:JSON.stringify({name:accountName(),loadout:{liveryId:state.loadout.liveryId,effectId:state.loadout.effectId,colorId:state.loadout.colorId,vinylId:state.loadout.vinylId}})});
      state.server=server;
      state.playerId=d.playerId;
      state.token=d.sessionToken;
      state.room=d.room;
      connect();
      browser.classList.add('hidden');
      startRoam();
    }catch(e){
      msg(e.code==='SERVER_FULL'?'Сервер заполнен. Выберите другой.':'Не удалось подключиться.',true);
      loadServers();
    }
  }

  function stopClockSync(){clearInterval(state.pingTimer);state.pingTimer=0;}
  function pingServer(){if(state.ws?.readyState===WebSocket.OPEN)send({type:'ping',v:1,clientTime:Date.now()});}
  function startClockSync(){stopClockSync();pingServer();state.pingTimer=setInterval(pingServer,2000);}
  function connect(){
    stopClockSync();try{state.ws?.close();}catch{}
    const proto=location.protocol==='https:'?'wss:':'ws:';
    const ws=state.ws=new WebSocket(`${proto}//${location.host}/api/free/${state.server.id}/ws?playerId=${encodeURIComponent(state.playerId)}&token=${encodeURIComponent(state.token)}`);
    ws.onopen=()=>{if(ws===state.ws)startClockSync();};
    ws.onmessage=e=>onMessage(e.data);
    ws.onclose=e=>{if(ws!==state.ws)return;stopClockSync();if(e.code===4003){leave();alert('Вы отключены владельцем или начались технические работы.');return;}if(state.active)setBanner('СОЕДИНЕНИЕ ПОТЕРЯНО · ВОЗВРАТ В МЕНЮ',3500);};
  }

  function send(o){
    if(state.ws?.readyState===WebSocket.OPEN){state.ws.send(JSON.stringify(o));return true;}
    return false;
  }

  function eventRowsFromParticipants(m){
    return (m.participants||[]).map((id,i)=>({id,name:m.names?.[id]||state.room?.players?.find(p=>p.id===id)?.name||'RACER',level:Number(m.levels?.[id]??state.room?.players?.find(p=>p.id===id)?.level)||0,score:0,place:i+1}));
  }

  function onMessage(raw){
    let m;
    try{m=JSON.parse(raw);}catch{return;}
    if(!m?.type)return;
    if(m.type==='error'){
      if(['ACTIVITY_LOCATION','ACTIVITY_BUSY','ACTIVITY_RUNNING','ACTIVITY_FULL'].includes(m.code)){state.dragQueued=false;state.activityPending=false;}
      setBanner(m.message||m.code||'ОШИБКА СЕРВЕРА',3000);return;
    }
    if(m.type==='free_hello'){
      state.serverOffset=(m.serverTime||Date.now())-Date.now();state.serverOffsetReady=true;
      applyRoom(m.room);pingServer();addSystem('Подключено к '+state.server.name+'.');return;
    }
    if(m.type==='pong'&&Number.isFinite(m.clientTime)&&Number.isFinite(m.serverTime)){
      const recv=Date.now(),rtt=Math.max(0,recv-m.clientTime);if(rtt<1500){const estimate=m.serverTime+rtt*.5,offset=estimate-recv,alpha=!state.serverOffsetReady?1:(rtt<80?.36:rtt<180?.24:.14);state.serverOffset+=(offset-state.serverOffset)*alpha;state.serverOffsetReady=true;state.rtt=state.rtt?state.rtt*.72+rtt*.28:rtt;}if(typeof m.probeId==='string')send({type:'sync_echo',v:1,probeId:m.probeId});return;
    }
    if(m.type==='free_room'){applyRoom(m.room);return;}
    if(m.type==='free_state'&&m.playerId!==state.playerId){
      let r=state.remotes.get(m.playerId);
      if(!r){r={x:m.state.x,y:m.state.y,angle:m.state.angle,target:m.state,snapshots:[],name:'RACER',level:0,liveryId:'apexLime',effectId:'standard',visual:createVisual('apexLime','standard')};state.remotes.set(m.playerId,r);}
      pushRemoteSnapshot(r,m.state,m.serverTime);return;
    }
    if(m.type==='free_chat'){addChat(m.name,m.text,m.playerId===state.playerId,m.owner===true,Number(m.level)||0,Number(m.adminLevel)||0);return;}
    if(m.type==='free_chat_blocked'){const left=Math.max(0,Number(m.expiresAt||0)-Date.now()),mins=Math.max(1,Math.ceil(left/60000));setBanner(`ЧАТ ЗАБЛОКИРОВАН · ${mins} МИН · ${m.reason||'Нарушение правил'}`,4200);return;}
    if(m.type==='free_record'){
      if(state.room)state.room.records={...(state.room.records||{}),[m.kind]:m.value};
      addSystem(`${m.name}: новый рекорд ${m.kind==='speed'?m.value+' km/h':m.value+' drift'}.`);return;
    }
    if(m.type==='player_progress'){
      const p=state.room?.players?.find(x=>x.id===m.playerId);if(p){p.level=Number(m.level)||0;p.totalExp=Number(m.totalExp)||0;}
      const r=state.remotes.get(m.playerId);if(r)r.level=Number(m.level)||0;
      if(m.playerId===state.playerId)syncProgress(progressFromTotal(m.totalExp));return;
    }
    if(m.type==='progress_override'){
      syncProgress({totalExp:Number(m.totalExp)||0,level:Number(m.level)||0,levelExp:Number(m.levelExp)||0,requiredExp:Number(m.requiredExp)||0,toNext:Number(m.toNext)||0});
      const me=ownPlayer();if(me){me.level=Number(m.level)||0;me.totalExp=Number(m.totalExp)||0;}setBanner(`УРОВЕНЬ ИЗМЕНЁН · LEVEL ${Number(m.level)||0}`,3200);return;
    }
    if(m.type==='progress_reward'){
      syncProgress({totalExp:Number(m.totalExp)||0,level:Number(m.level)||0,levelExp:Number(m.levelExp)||0,requiredExp:Number(m.requiredExp)||0,toNext:Number(m.toNext)||0});
      const levelUp=Number(m.level)>Number(m.levelBefore),money=Number(m.credits)||0,exp=Number(m.exp)||0;
      if(levelUp)setBanner(`LEVEL UP · ${m.levelBefore} → ${m.level} · +${exp} EXP${money?` · +${money} CR`:''}`,5200);
      else setBanner(`+${exp} EXP${money?` · +${money} CR`:''}${m.capped?' · CR LIMIT':''}`,3200);
      if(m.capped&&money===0)addSystem('Лимит бонусной валюты достигнут. EXP продолжает начисляться.');
      setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),180);return;
    }
    if(m.type==='drag_queue'){
      if(state.dragQueued)setBanner(`DRAG · очередь ${m.count}/2`,1800);return;
    }
    if(m.type==='activity_lobby'&&['drift_battle','koth'].includes(m.activity)&&m.participants?.includes(state.playerId)){
      state.activityPending=false;state.liveEvent={activity:m.activity,id:m.eventId,status:m.status||'waiting',participants:[...(m.participants||[])],minPlayers:m.minPlayers||2,maxPlayers:m.maxPlayers||8,startAt:m.startAt||0,endAt:m.startAt?(m.startAt+(m.durationMs||0)):0,zoneId:m.zoneId||null,zone:m.zone||null,standings:eventRowsFromParticipants(m),names:m.names||{},levels:m.levels||{}};
      renderEventHud();toggleChat(false);setBanner(`${eventTitle(m.activity)} · ${m.status==='countdown'?'СТАРТ СКОРО':'ОЖИДАЕМ ИГРОКОВ'}`,2200);return;
    }
    if(m.type==='activity_start'&&m.activity==='drag'&&m.participants.includes(state.playerId)){
      const lane=m.participants.indexOf(state.playerId),opponentId=m.participants.find(id=>id!==state.playerId)||null;
      state.drag={id:m.challengeId,startAt:m.startAt,finishX:m.finishX||DRAG_FINISH_X,participants:[...m.participants],opponentId,finished:false,localCrossed:false,progress:null,confirmed:{},result:null};
      state.dragQueued=false;car.x=DRAG_START_X;car.y=2635+lane*70;car.angle=0;car.vx=car.vy=car.speed=0;
      m.participants.forEach((id,index)=>{if(id!==state.playerId)resetRemoteToGrid(id,index,m.startAt);});pingServer();toggleChat(false);
      setBanner('DRAG · СИНХРОНИЗАЦИЯ СТАРТА',1800);updateDragHud(Date.now()+state.serverOffset);updateChatPreview();return;
    }
    if(m.type==='activity_start'&&['drift_battle','koth'].includes(m.activity)&&m.participants?.includes(state.playerId)){
      const prev=state.liveEvent?.id===m.eventId?state.liveEvent:{};state.liveEvent={...prev,activity:m.activity,id:m.eventId,status:'running',participants:[...(m.participants||prev.participants||[])],startAt:m.startAt||0,endAt:m.endAt||0,zoneId:m.zoneId??prev.zoneId,zone:m.zone??prev.zone,zoneIndex:m.zoneIndex||0,finalZone:!!m.finalZone};renderEventHud();setBanner(`${eventTitle(m.activity)} · GO!`,2200);return;
    }
    if(m.type==='activity_progress'&&m.activity==='drag'&&state.drag?.id===m.challengeId){state.drag.progress=m;return;}
    if(m.type==='activity_progress'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){state.liveEvent={...state.liveEvent,status:'running',startAt:m.startAt||state.liveEvent.startAt,endAt:m.endAt||state.liveEvent.endAt,zoneId:m.zoneId??state.liveEvent.zoneId,zone:m.zone??state.liveEvent.zone,zoneIndex:m.zoneIndex??state.liveEvent.zoneIndex,finalZone:!!m.finalZone,standings:m.standings||state.liveEvent.standings};renderEventHud();return;}
    if(m.type==='activity_zone'&&m.activity==='koth'&&state.liveEvent?.id===m.eventId){state.liveEvent={...state.liveEvent,zoneIndex:m.zoneIndex,zone:m.zone,finalZone:!!m.finalZone};renderEventHud();setBanner(m.finalZone?'KING OF THE HILL · FINAL ZONE':`НОВАЯ ЗОНА · ${m.zone?.label||''}`,2800);return;}
    if(m.type==='activity_finish_confirmed'&&m.activity==='drag'&&state.drag?.id===m.challengeId){state.drag.confirmed[m.playerId]=m.elapsedMs;if(m.playerId===state.playerId){state.drag.localCrossed=true;setBanner(`ФИНИШ ЗАФИКСИРОВАН · ${(m.elapsedMs/1000).toFixed(3)} сек`,1800);}return;}
    if(m.type==='activity_cancelled'&&m.activity==='drag'&&state.drag?.id===m.challengeId){setBanner('DRAG ОТМЕНЁН · СОПЕРНИК ВЫШЕЛ',3000);state.drag=null;updateDragHud(Date.now()+state.serverOffset);return;}
    if(m.type==='activity_left'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){state.activityPending=false;state.liveEvent=null;renderEventHud();setBanner(`${eventTitle(m.activity)} · ВЫ ВЫШЛИ ИЗ ИВЕНТА`,2600);return;}
    if(m.type==='activity_cancelled'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){setBanner(`${eventTitle(m.activity)} ОТМЕНЁН · НЕДОСТАТОЧНО ИГРОКОВ`,3200);state.liveEvent=null;renderEventHud();return;}
    if(m.type==='activity_result'&&m.activity==='drag'){
      const mine=m.times?.[state.playerId];if(Number.isFinite(mine)){const draw=m.draw===true,won=!draw&&m.winnerId===state.playerId,gap=Math.abs(Number(m.gapMs)||0),photo=m.photoFinish===true||gap<=100,label=draw?'НИЧЬЯ':photo?'PHOTO FINISH':(won?'ПОБЕДА':'ПОРАЖЕНИЕ');setBanner(`${label} · ${(mine/1000).toFixed(3)} сек · Δ ${(gap/1000).toFixed(3)}`,5200);if(state.drag?.id===m.challengeId){state.drag.finished=true;state.drag.result=m;const dragId=m.challengeId;setTimeout(()=>{if(state.drag?.id===dragId){state.drag=null;updateDragHud(Date.now()+state.serverOffset);}},5400);}}
      if(m.draw)addSystem(`DRAG: ничья · ${((m.times?.[m.participants?.[0]]||0)/1000).toFixed(3)} сек.`);else addSystem(`DRAG: ${m.names?.[m.winnerId]||'RACER'} победил · ${(m.times?.[m.winnerId]/1000).toFixed(3)} сек${m.photoFinish?' · PHOTO FINISH':''}.`);return;
    }
    if(m.type==='activity_result'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){
      state.liveEvent={...state.liveEvent,status:'result',results:m.results||[],standings:m.results||[],endAt:m.serverTime||Date.now()+state.serverOffset};renderEventHud();const mine=m.results?.find(r=>r.id===state.playerId);if(mine){if(mine.eligible)setBanner(`${eventTitle(m.activity)} · #${mine.place} · +${mine.exp||0} EXP · +${mine.credits||0} CR`,5200);else setBanner(`${eventTitle(m.activity)} · НАГРАДА НЕ ВЫДАНА · НЕДОСТАТОЧНО АКТИВНОГО УЧАСТИЯ`,5200);}const id=m.eventId;setTimeout(()=>{if(state.liveEvent?.id===id&&state.liveEvent.status==='result'){state.liveEvent=null;renderEventHud();}},7600);return;
    }
  }

  function syncLiveEventFromRoom(room){
    if(state.liveEvent?.status==='result')return;
    const active=[room?.activities?.drift,room?.activities?.koth].find(e=>e?.participants?.includes(state.playerId)&&['waiting','countdown','running'].includes(e.status));
    if(!active){if(state.liveEvent&&['waiting','countdown','running'].includes(state.liveEvent.status)){state.liveEvent=null;renderEventHud();}return;}
    const activity=active.activity,existing=state.liveEvent?.id===active.id?state.liveEvent:{};
    const standings=(active.participants||[]).map((id,i)=>{const p=room.players?.find(x=>x.id===id);return{id,name:p?.name||existing.names?.[id]||'RACER',level:Number(p?.level??existing.levels?.[id])||0,score:existing.standings?.find(r=>r.id===id)?.score||0,place:i+1};});
    state.liveEvent={...existing,activity,id:active.id,status:active.status,participants:[...(active.participants||[])],minPlayers:activity==='koth'?3:2,maxPlayers:activity==='koth'?12:8,startAt:active.startAt||0,endAt:active.endAt||0,zoneId:active.zoneId||existing.zoneId||null,zone:active.zone||existing.zone||null,zoneIndex:active.zoneIndex||0,finalZone:!!active.finalZone,standings};renderEventHud();
  }

  function applyRoom(room){
    if(!room)return;
    state.room=room;
    const live=new Set(room.players.map(p=>p.id));
    for(const p of room.players){
      if(p.id===state.playerId){syncProgress(progressFromTotal(p.totalExp));continue;}
      let r=state.remotes.get(p.id);
      if(!r){
        const s=p.state||{x:2320,y:1590,angle:0};
        r={x:s.x,y:s.y,angle:s.angle,target:s,snapshots:[],name:p.name,adminLevel:Number(p.adminLevel)||0,level:Number(p.level)||0,liveryId:p.liveryId||'apexLime',effectId:p.effectId||'standard',colorId:p.colorId||'stock',vinylId:p.vinylId||'none',visual:createVisual(p.liveryId,p.effectId,p.colorId,p.vinylId)};pushRemoteSnapshot(r,s,s.sampleTime||s.serverTime||Date.now()+state.serverOffset);state.remotes.set(p.id,r);
      }
      r.name=p.name;r.owner=p.owner===true;r.adminLevel=Number(p.adminLevel)||0;r.level=Number(p.level)||0;
      if(r.liveryId!==p.liveryId||r.effectId!==p.effectId||r.colorId!==(p.colorId||'stock')||r.vinylId!==(p.vinylId||'none')||!r.visual){r.liveryId=p.liveryId||'apexLime';r.effectId=p.effectId||'standard';r.colorId=p.colorId||'stock';r.vinylId=p.vinylId||'none';r.visual=createVisual(r.liveryId,r.effectId,r.colorId,r.vinylId);}
      if(p.state)pushRemoteSnapshot(r,p.state,p.state.sampleTime||p.state.serverTime||Date.now()+state.serverOffset);
    }
    for(const id of state.remotes.keys())if(!live.has(id))state.remotes.delete(id);
    $('freePlayerCount').textContent=`${room.players.filter(p=>p.connected).length} / ${room.maxPlayers||MAX}`;
    syncLiveEventFromRoom(room);
  }

  function startRoam(){
    state.active=true;
    state.chatUnread=0;
    state.chat.length=0;
    state.driftScore=0;
    state.driftInside=false;state.paused=false;
    $('freePausePanel')?.classList.add('hidden');roam.classList.remove('paused');
    refreshPlayerLoadout();
    if(state.playerVisual)state.playerVisual.effectTime=0;
    car.x=2320;car.y=1590;car.vx=0;car.vy=0;car.angle=-Math.PI/2;car.speed=0;car.yawRate=0;car.steerInput=0;car.gripDisturbance=0;state.driftPhysicsTime=0;
    updateUnreadBadge();
    $('freeChatLog').replaceChildren();
    updateChatPreview();
    roam.classList.remove('hidden');
    roam.setAttribute('aria-hidden','false');
    $('freeServerName').textContent=state.server.name;
    if(state.room)applyRoom(state.room);renderEventHud();renderLevelsPanel();
    resize();
    last=performance.now();
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function leave(){
    state.active=false;
    stopClockSync();send({type:'leave',v:1});
    try{state.ws?.close(1000,'leave');}catch{}
    state.ws=null;
    state.remotes.clear();
    state.drag=null;
    state.dragQueued=false;
    state.activityPending=false;
    state.liveEvent=null;state.paused=false;renderEventHud();toggleLevels(false);$('freePausePanel')?.classList.add('hidden');roam.classList.remove('paused');
    state.chatUnread=0;
    updateUnreadBadge();
    roam.classList.add('hidden');
    roam.setAttribute('aria-hidden','true');
    browser.classList.add('hidden');
    $('online')?.classList.add('hidden');
    $('menu')?.classList.remove('hidden');
    clearInputs();
    toggleChat(false);
    toggleMap(false);
    cancelAnimationFrame(raf);
  }

  function resize(){
    W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);
    canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  function roadAt(x,y){return CITY.roadAt(x,y,-20);}

  function district(x,y){return CITY.district(x,y);}

  function update(dt){
    const now=Date.now()+state.serverOffset;
    const crewModalOpen=window.VelocityCrews?.active;
    if(crewModalOpen||state.paused){input.left=false;input.right=false;input.gas=false;input.brake=false;input.handbrake=false;}
    const dragLock=state.drag&&now<state.drag.startAt;
    let steer=(input.right?1:0)-(input.left?1:0);
    let throttle=input.gas?1:0,brake=input.brake?1:0,handbrake=input.handbrake?1:0;
    if(dragLock||crewModalOpen){steer=0;throttle=0;brake=1;handbrake=0;}
    else if(state.paused){steer=0;throttle=0;brake=0;handbrake=0;}

    const prevX=car.x,prevY=car.y;
    if(R.Car&&typeof car.update==='function'){
      if(handbrake>0&&car.speed>34)state.driftPhysicsTime=1.2;
      else state.driftPhysicsTime=Math.max(0,state.driftPhysicsTime-dt);
      if(car.speed>92&&throttle>.5&&Math.abs(steer)>.82)state.driftPhysicsTime=Math.max(state.driftPhysicsTime,.48);
      const driftActive=state.driftPhysicsTime>0;
      car.update(dt,{steer,throttle,brake,handbrake,drift:driftActive},FREE_PHYS_TRACK);
    }else{
      const fx=Math.cos(car.angle),fy=Math.sin(car.angle);let signed=car.vx*fx+car.vy*fy;
      if(throttle)signed+=SOLO_PHYS.accel*dt;if(brake)signed-=Math.sign(signed||1)*SOLO_PHYS.brakePower*.8*dt;
      signed=clamp(signed,-90,SOLO_PHYS.maxSpeed);car.angle+=steer*SOLO_PHYS.turnRate*dt*clamp(Math.abs(signed)/70,0,1)*(signed>=0?1:-1);
      car.vx=Math.cos(car.angle)*signed;car.vy=Math.sin(car.angle)*signed;car.x+=car.vx*dt;car.y+=car.vy*dt;car.speed=Math.hypot(car.vx,car.vy);
    }

    CITY.resolveCarMotion(car,prevX,prevY);

    const remoteTargetTime=now-(state.drag?DRAG_REMOTE_BACKTIME_MS:REMOTE_BACKTIME_MS);
    for(const r of state.remotes.values()){
      const sampled=sampleRemote(r,remoteTargetTime);if(!sampled)continue;r.x=sampled.x;r.y=sampled.y;r.angle=sampled.angle;
      if(r.visual){r.visual.speed=Math.max(40,sampled.speed||0);r.visual.effectTime+=dt;r.visual.throttleVisual=.88;}
    }

    const sendEvery=state.drag&&!state.drag.result?DRAG_SEND_MS:FREE_SEND_MS;if(performance.now()-state.lastSend>sendEvery)sendFreeState();

    $('freeSpeed').textContent=Math.round(car.speed);
    $('freeLocation').textContent=district(car.x,car.y);
    updateActivities(dt,now);updateDragHud(now);updateEventClock(now);
  }

  function sendFreeState(force=false){
    const t=performance.now(),every=state.drag&&!state.drag.result?DRAG_SEND_MS:FREE_SEND_MS;if(!force&&t-state.lastSend<every)return false;if(state.ws?.bufferedAmount>65536)return false;state.lastSend=t;
    return send({type:'free_state',v:1,state:{seq:++state.seq,x:car.x,y:car.y,vx:car.vx,vy:car.vy,angle:car.angle,speed:car.speed,yawRate:Number(car.yawRate)||0,sampleTime:Math.round(Date.now()+state.serverOffset)}});
  }

  function updateDragHud(now){
    const hud=$('freeDragHud');if(!hud)return;const d=state.drag;
    // CSS uses this state to keep chat and controls out of the race sightline on small touch screens.
    roam.classList.toggle('drag-active',!!d);
    if(!d){hud.classList.add('hidden');hud.classList.remove('win','lose','photo');return;}hud.classList.remove('hidden');
    const stateEl=$('freeDragState'),leadEl=$('freeDragLead'),gapEl=$('freeDragGap'),netEl=$('freeDragNet'),mineEl=$('freeDragMine'),rivalEl=$('freeDragRival');if(netEl)netEl.textContent=`PING ${Math.round(state.rtt||0)} MS`;
    const remain=d.startAt-now;if(remain>0){const n=Math.max(1,Math.ceil(remain/1000));if(stateEl)stateEl.textContent='START SYNC';if(leadEl)leadEl.textContent=remain>3000?'READY':String(n);if(gapEl)gapEl.textContent='СТАРТ ПО СЕРВЕРНОМУ ТАЙМЕРУ';hud.classList.remove('win','lose','photo');}
    else if(d.result){const mine=d.result.times?.[state.playerId],draw=d.result.draw===true,won=!draw&&d.result.winnerId===state.playerId,gap=Math.abs(Number(d.result.gapMs)||0);hud.classList.toggle('win',won);hud.classList.toggle('lose',!draw&&!won);hud.classList.toggle('photo',d.result.photoFinish===true||draw);if(stateEl)stateEl.textContent=draw?'DRAW':d.result.photoFinish?'PHOTO FINISH':'SERVER RESULT';if(leadEl)leadEl.textContent=draw?'DRAW':won?'YOU WIN':'YOU LOSE';if(gapEl)gapEl.textContent=`${(mine/1000).toFixed(3)} s · Δ ${(gap/1000).toFixed(3)} s`; }
    else{const p=d.progress,leadId=p?.leadId,gap=Math.abs(Number(p?.gap)||0),oppName=state.room?.players?.find(x=>x.id===d.opponentId)?.name||'RIVAL';if(stateEl)stateEl.textContent='SERVER LIVE';if(leadEl){if(!leadId||gap<3)leadEl.textContent='PHOTO FINISH';else leadEl.textContent=leadId===state.playerId?'YOU LEAD':`${oppName} LEADS`;}if(gapEl)gapEl.textContent=gap<3?'РАЗНИЦА МЕНЬШЕ НОСА МАШИНЫ':`ОТРЫВ ≈ ${(gap/54).toFixed(1)} КОРП.`;hud.classList.toggle('photo',gap<8);hud.classList.remove('win','lose');}
    const positions=d.progress?.positions||{},mineX=Number(positions[state.playerId]),rivalX=Number(positions[d.opponentId]);if(remain>0){if(mineEl)mineEl.style.left='0%';if(rivalEl)rivalEl.style.left='0%';}else{if(mineEl&&Number.isFinite(mineX))mineEl.style.left=(clamp((mineX-DRAG_START_X)/DRAG_LENGTH,0,1)*100)+'%';if(rivalEl&&Number.isFinite(rivalX))rivalEl.style.left=(clamp((rivalX-DRAG_START_X)/DRAG_LENGTH,0,1)*100)+'%';}
  }

  function updateActivities(dt,now){
    state.speedCooldown=Math.max(0,state.speedCooldown-dt);

    if(dist(car.x,car.y,ZONES.speed.x,ZONES.speed.y)<ZONES.speed.r&&state.speedCooldown<=0&&car.speed>90){
      state.speedCooldown=4;const v=Math.round(car.speed);setBanner(`SPEED TRAP · ${v} KM/H`,2600);send({type:'record',v:1,kind:'speed',value:v});
    }

    const inDrift=dist(car.x,car.y,ZONES.drift.x,ZONES.drift.y)<ZONES.drift.r;
    if(inDrift&&car.speed>55&&(input.handbrake||Math.abs((input.right?1:0)-(input.left?1:0))>.45)){
      state.driftScore+=car.speed*dt*4.9;state.driftInside=true;
    }else if(state.driftInside&&!inDrift){
      const score=Math.floor(state.driftScore);if(score>120){setBanner(`DRIFT ZONE · ${score.toLocaleString('ru-RU')}`,3000);send({type:'record',v:1,kind:'drift',value:score});}state.driftScore=0;state.driftInside=false;
    }

    if(state.drag&&!state.drag.finished&&!state.drag.localCrossed&&now>=state.drag.startAt&&car.x>DRAG_FINISH_X&&car.y>2510&&car.y<2820){state.drag.localCrossed=true;sendFreeState(true);setBanner('ФИНИШ · СЕРВЕР ПРОВЕРЯЕТ РЕЗУЛЬТАТ',1800);}

    const action=$('freeContextAction');if(!action)return;action.onclick=null;
    if(state.drag||state.dragQueued||state.activityPending||state.liveEvent){action.classList.add('hidden');return;}

    if(dist(car.x,car.y,ZONES.levels.x,ZONES.levels.y)<ZONES.levels.r){
      action.textContent='УРОВНИ · ОТКРЫТЬ';action.classList.remove('hidden');action.onclick=()=>toggleLevels(true);return;
    }

    if(dist(car.x,car.y,ZONES.koth.x,ZONES.koth.y)<92){
      action.textContent='KING OF THE HILL · УЧАСТВОВАТЬ';action.classList.remove('hidden');action.onclick=()=>{state.activityPending=true;if(send({type:'activity_join',v:1,activity:'koth'})){action.classList.add('hidden');setBanner('KING OF THE HILL · РЕГИСТРАЦИЯ',1800);}else state.activityPending=false;};return;
    }

    const driftZones=[ZONES.drift,ZONES.driftIndustrial,ZONES.driftParking],battle=driftZones.find(z=>dist(car.x,car.y,z.x,z.y)<88);
    if(battle){
      action.textContent='DRIFT BATTLE · УЧАСТВОВАТЬ';action.classList.remove('hidden');action.onclick=()=>{state.activityPending=true;if(send({type:'activity_join',v:1,activity:'drift_battle',zoneId:battle.battleId})){action.classList.add('hidden');setBanner('DRIFT BATTLE · РЕГИСТРАЦИЯ',1800);}else state.activityPending=false;};return;
    }

    if(dist(car.x,car.y,ZONES.crews.x,ZONES.crews.y)<ZONES.crews.r){action.textContent='КЛАНЫ · РЕЙТИНГ';action.classList.remove('hidden');action.onclick=()=>window.VelocityCrews?.open();return;}
    const nearDrag=dist(car.x,car.y,ZONES.drag.x,ZONES.drag.y)<ZONES.drag.r;
    if(nearDrag){
      action.textContent='DRAG · ВСТАТЬ В ОЧЕРЕДЬ';action.classList.remove('hidden');action.onclick=()=>{state.dragQueued=true;if(!send({type:'activity_join',v:1,activity:'drag'})){state.dragQueued=false;return;}action.classList.add('hidden');setBanner('DRAG · ОЖИДАЕМ СОПЕРНИКА');};return;
    }
    action.classList.add('hidden');
  }

  function setBanner(text,ms=2200){
    const b=$('freeActivityBanner');
    b.textContent=text;
    b.classList.remove('hidden');
    clearTimeout(setBanner.t);
    setBanner.t=setTimeout(()=>b.classList.add('hidden'),ms);
  }

  const isQueenName=name=>String(name||'').trim().replace(/^@/,'').toLowerCase()==='mary';
  const ADMIN_PREFIXES=Object.freeze({
    1:{label:'HELPER',key:'helper',fill:'#0e7c76',stroke:'#47e3d2',glow:'#2fd9c7',text:'#e9fffc'},
    2:{label:'MODER',key:'moder',fill:'#145fa8',stroke:'#66b8ff',glow:'#3d9eff',text:'#eef8ff'},
    3:{label:'ST.MODER',key:'st-moder',fill:'#6540a8',stroke:'#b28aff',glow:'#9567ee',text:'#f8f2ff'},
    4:{label:'ADMIN',key:'admin',fill:'#a35d12',stroke:'#ffc166',glow:'#ffa43d',text:'#fff8e8'},
    5:{label:'CURATOR',key:'curator',fill:'#8d7410',stroke:'#ffe26e',glow:'#ffd447',text:'#fffce8'}
  });
  const adminPrefix=level=>ADMIN_PREFIXES[Math.max(0,Math.min(5,Math.floor(Number(level)||0)))]||null;

  function appendPlayerName(el,name,owner,level=null,adminLevel=null){
    const player=state.room?.players?.find(p=>p.name===name),isOwner=owner===true||player?.owner===true,rank=adminPrefix(adminLevel===null?player?.adminLevel:adminLevel);
    if(isOwner){const badge=document.createElement('span');badge.className='free-owner-badge';badge.textContent='OWNER';el.append(badge);}
    else if(isQueenName(name)){const badge=document.createElement('span');badge.className='free-queen-badge';badge.textContent='QUEEN';el.append(badge);}
    else if(rank){const badge=document.createElement('span');badge.className=`free-admin-badge admin-${rank.key}`;badge.textContent=rank.label;el.append(badge);}
    const crew=player?.crew;if(crew){const tag=document.createElement('span');tag.className='crew-tag';tag.style.setProperty('--crew-color',crew.color);tag.textContent='['+crew.tag+'] ';el.append(tag);}
    el.append(document.createTextNode(name||'RACER'));
    if(player?.userId){el.classList.add('crew-profile-link');el.tabIndex=0;el.setAttribute('role','button');el.onclick=()=>window.VelocityCrews?.profile({id:player.userId});el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};}
    if(level!==null&&Number.isFinite(Number(level))){const tag=document.createElement('span');tag.className='free-level-tag';tag.textContent=`[${Math.max(0,Math.min(100,Math.floor(Number(level)||0)))}]`;el.append(document.createTextNode(' '),tag);}
  }

  function addChat(name,text,mine=false,owner=false,level=0,adminLevel=0){
    state.chat.push({name,text,mine,owner,level,adminLevel,system:false,time:Date.now()});
    if(state.chat.length>80)state.chat.shift();
    if($('freeChatPanel').classList.contains('hidden')&&!mine){state.chatUnread++;updateUnreadBadge();}
    renderChat();
    updateChatPreview();
  }

  function addSystem(text){
    state.chat.push({name:'SYSTEM',text,system:true,mine:false,time:Date.now()});
    if(state.chat.length>80)state.chat.shift();
    renderChat();
    updateChatPreview();
  }

  function renderChat(){
    const log=$('freeChatLog');
    log.replaceChildren();
    for(const m of state.chat.slice(-50)){
      const row=document.createElement('div');
      row.className='free-chat-line'+(m.system?' system':'')+(m.mine?' mine':'')+(m.owner?' has-owner':'');
      const n=document.createElement('strong');appendPlayerName(n,m.name,m.owner,m.system?null:m.level,m.system?0:m.adminLevel);
      const t=document.createElement('span');t.textContent=m.text;
      row.append(n,t);log.appendChild(row);
    }
    log.scrollTop=log.scrollHeight;
  }

  function updateChatPreview(){
    const root=$('freeChatPreview');
    if(!root)return;
    root.replaceChildren();
    const entries=state.chat.slice(-CHAT_PREVIEW_LIMIT);
    if(!entries.length){
      const empty=document.createElement('div');
      empty.className='free-chat-preview-empty';
      empty.textContent='Сообщения сервера будут появляться здесь';
      root.appendChild(empty);
      return;
    }
    for(const m of entries){
      const row=document.createElement('div');
      row.className='free-chat-preview-line'+(m.system?' system':'')+(m.mine?' mine':'')+(m.owner?' has-owner':'');
      const name=document.createElement('b');appendPlayerName(name,m.name,m.owner,m.system?null:m.level,m.system?0:m.adminLevel);
      const text=document.createElement('span');text.textContent=m.text;
      row.append(name,text);
      root.appendChild(row);
    }
  }

  function updateUnreadBadge(){
    const badge=$('freeChatUnread');
    if(!badge)return;
    badge.textContent=state.chatUnread>99?'99+':String(state.chatUnread||0);
    badge.classList.toggle('hidden',!state.chatUnread);
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    const zoom=clamp(.82-Math.min(1,car.speed/580)*.10,.68,.85);
    const cx=car.x,cy=car.y;
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(zoom,zoom);
    ctx.translate(-cx,-cy);
    CITY.draw(ctx,{x:cx-W/(2*zoom),y:cy-H/(2*zoom),w:W/zoom,h:H/zoom});
    drawZone(ctx,ZONES.crews,'#a9ff5a','КЛАНЫ');
    drawZone(ctx,ZONES.drag,'#67c6ff','DRAG');
    drawZone(ctx,ZONES.speed,'#f6e75d','SPEED');
    drawZone(ctx,ZONES.drift,'#c678ff','DRIFT BATTLE');
    drawZone(ctx,ZONES.driftIndustrial,'#c678ff','DRIFT BATTLE');
    drawZone(ctx,ZONES.driftParking,'#c678ff','DRIFT BATTLE');
    drawZone(ctx,ZONES.koth,'#ffad5a','KOTH');
    drawZone(ctx,ZONES.levels,'#ffd86a','LEVELS');
    drawZone(ctx,ZONES.meet,'#8dff49','CAR MEET');
    if(state.liveEvent?.activity==='koth'&&state.liveEvent.zone){drawZone(ctx,{...state.liveEvent.zone,kind:'koth'},state.liveEvent.finalZone?'#ffd86a':'#ff8f4f',state.liveEvent.finalZone?'FINAL ZONE':'ACTIVE ZONE');}
    if(state.waypoint)drawWaypoint(ctx,state.waypoint);
    for(const [id,r] of state.remotes)drawVisualCar(ctx,r.visual,r.x,r.y,r.angle,r.name||'RACER',false,colorFor(id),r.owner,r.level||0,r.adminLevel||0);
    const me=state.room?.players?.find(p=>p.id===state.playerId);drawVisualCar(ctx,state.playerVisual,car.x,car.y,car.angle,me?.name||accountName(),true,'#a9ff5a',me?.owner===true,me?.level??state.progress.level??0,me?.adminLevel||0);
    ctx.restore();
    if(!$('freeMapPanel').classList.contains('hidden')&&performance.now()-lastMapDraw>80){lastMapDraw=performance.now();drawMiniMap();}
  }

  function drawZone(c,z,color,label){
    c.save();
    c.strokeStyle=color;c.lineWidth=3;c.setLineDash([12,18]);c.globalAlpha=.55;
    c.beginPath();c.arc(z.x,z.y,Math.min(z.r,80),0,TAU);c.stroke();c.setLineDash([]);
    if(z.kind==='meet'){c.restore();return;}
    c.globalAlpha=.94;c.fillStyle='#243d3de8';
    roundRect(c,z.x-66,z.y-119,132,30,8,true,false);
    c.fillStyle=color;c.font='900 15px system-ui';c.textAlign='center';c.fillText(label,z.x,z.y-99);
    c.restore();
  }

  function drawVisualCar(c,visual,x,y,a,name,me,fallbackColor,owner=false,level=0,adminLevel=0){
    const queen=!owner&&isQueenName(name),rank=!owner&&!queen?adminPrefix(adminLevel):null;
    c.save();
    if(visual){
      visual.x=x;visual.y=y;visual.angle=a;
      visual.draw(c,.66);
    }else{
      c.translate(x,y);c.rotate(a);
      c.fillStyle='rgba(0,0,0,.36)';c.fillRect(-24,-13,55,30);
      c.fillStyle=fallbackColor||'#72bfff';c.fillRect(-27,-14,54,28);
      c.fillStyle='#07100e';c.fillRect(-8,-11,20,22);
      c.fillStyle='#eaffdf';c.fillRect(22,-10,4,7);c.fillRect(22,3,4,7);
    }
    c.restore();
    c.save();
    c.font='900 14px system-ui';
    const crew=state.room?.players?.find(p=>p.name===name)?.crew;
    const label=`${crew?'['+crew.tag+'] ':''}${name||'RACER'} [${Math.max(0,Math.min(100,Math.floor(Number(level)||0)))}]`,nameWidth=c.measureText(label).width;
    let badgeWidth=0;if(owner||queen)badgeWidth=65;else if(rank){c.font='900 10px system-ui';badgeWidth=Math.max(58,Math.ceil(c.measureText(rank.label).width)+18);c.font='900 14px system-ui';}
    const total=nameWidth+badgeWidth+20,left=x-total/2;c.fillStyle='#101a1eef';roundRect(c,left,y-52,total,26,8,true,false);
    if(owner){
      c.shadowColor='#ff304f';c.shadowBlur=9;c.fillStyle='#b51232';roundRect(c,left+4,y-48,57,18,5,true,false);c.shadowBlur=0;
      c.strokeStyle='#ff687c';c.lineWidth=1;roundRect(c,left+4,y-48,57,18,5,false,true);
      c.fillStyle='#fff0f2';c.font='900 10px system-ui';c.textAlign='center';c.fillText('OWNER',left+32.5,y-35);
    }else if(queen){
      c.shadowColor='#ff4fbd';c.shadowBlur=11;c.fillStyle='#b51678';roundRect(c,left+4,y-48,57,18,5,true,false);c.shadowBlur=0;
      c.strokeStyle='#ff86d2';c.lineWidth=1;roundRect(c,left+4,y-48,57,18,5,false,true);
      c.fillStyle='#fff0fa';c.font='900 10px system-ui';c.textAlign='center';c.fillText('QUEEN',left+32.5,y-35);
    }else if(rank){
      const w=badgeWidth-8;c.shadowColor=rank.glow;c.shadowBlur=9;c.fillStyle=rank.fill;roundRect(c,left+4,y-48,w,18,5,true,false);c.shadowBlur=0;c.strokeStyle=rank.stroke;c.lineWidth=1;roundRect(c,left+4,y-48,w,18,5,false,true);c.fillStyle=rank.text;c.font='900 10px system-ui';c.textAlign='center';c.fillText(rank.label,left+4+w/2,y-35);
    }
    c.font='900 14px system-ui';c.textAlign='left';c.fillStyle=owner?'#ffd6dd':queen?'#ffd9f1':me?'#dfffcb':'#dce9e5';
    c.fillText(label,left+10+badgeWidth,y-34);
    c.restore();
  }

  function colorFor(id){
    let n=0;
    for(const ch of String(id))n=(n*31+ch.charCodeAt(0))%360;
    return `hsl(${n} 72% 58%)`;
  }

  function drawWaypoint(c,w){
    c.save();
    c.strokeStyle='#8dff49';
    c.setLineDash([18,14]);
    c.lineWidth=4;
    c.beginPath();c.moveTo(car.x,car.y);c.lineTo(w.x,w.y);c.stroke();
    c.setLineDash([]);
    c.fillStyle='#8dff49';c.beginPath();c.arc(w.x,w.y,18,0,TAU);c.fill();
    c.fillStyle='rgba(255,255,255,.85)';c.beginPath();c.arc(w.x,w.y,7,0,TAU);c.fill();
    c.restore();
  }

  function drawMiniMap(){
    mctx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
    const scale=mapScale();
    const vw=WORLD.w*scale,vh=WORLD.h*scale,ox=mapCanvas.width/2-mapView.x*scale,oy=mapCanvas.height/2-mapView.y*scale;
    mctx.fillStyle='#172f30';mctx.fillRect(0,0,mapCanvas.width,mapCanvas.height);
    mctx.save();mctx.translate(ox,oy);
    const sx=scale,sy=scale;
    CITY.drawOverview(mctx,vw,vh);

    if(state.waypoint){
      mctx.strokeStyle='#8dff49';mctx.setLineDash([10,8]);mctx.lineWidth=2;
      mctx.beginPath();mctx.moveTo(car.x*sx,car.y*sy);mctx.lineTo(state.waypoint.x*sx,state.waypoint.y*sy);mctx.stroke();mctx.setLineDash([]);
    }

    for(const z of Object.values(ZONES))drawMapZone(mctx,z,sx,sy);
    for(const r of state.remotes.values())drawMapMarker(mctx,r.x*sx,r.y*sy,r.angle,'#77c7ff');
    if(state.waypoint){mctx.strokeStyle='#8dff49';mctx.lineWidth=2;mctx.strokeRect(state.waypoint.x*sx-7,state.waypoint.y*sy-7,14,14);}
    drawMapMarker(mctx,car.x*sx,car.y*sy,car.angle,'#ffffff',true);
    mctx.restore();
  }

  function drawMapZone(c,z,sx,sy){
    const color=z.kind==='drag'?'#67c6ff':z.kind==='speed'?'#f6e75d':(z.kind==='drift'||z.kind==='driftBattle')?'#c678ff':z.kind==='koth'?'#ff9c52':z.kind==='levels'?'#ffd86a':'#8dff49';
    c.save();c.translate(z.x*sx,z.y*sy);c.rotate(Math.PI/4);
    c.fillStyle=color;c.globalAlpha=.88;c.fillRect(-6,-6,12,12);c.restore();
  }

  function drawMapMarker(c,x,y,angle,color,isPlayer=false){
    c.save();c.translate(x,y);c.rotate(angle);
    c.fillStyle=color;c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1.5;
    c.beginPath();c.moveTo(7,0);c.lineTo(-5,-4.5);c.lineTo(-2,0);c.lineTo(-5,4.5);c.closePath();c.fill();c.stroke();
    if(isPlayer){c.strokeStyle='rgba(141,255,73,.55)';c.lineWidth=2;c.beginPath();c.arc(0,0,9,0,TAU);c.stroke();}
    c.restore();
  }

  function loop(t){
    if(!state.active)return;
    const dt=Math.min(.033,Math.max(.001,(t-last)/1000));
    last=t;
    update(dt);
    draw();
    raf=requestAnimationFrame(loop);
  }

  function clearInputs(){for(const k in input)input[k]=false;}

  const keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'gas',KeyW:'gas',ArrowDown:'brake',KeyS:'brake',Space:'handbrake'};
  addEventListener('keydown',e=>{
    if(!state.active||e.target.matches?.('input,textarea'))return;
    const k=keyMap[e.code];
    if(k){input[k]=true;e.preventDefault();}
    if(e.code==='KeyM')toggleMap();
    if(e.code==='Enter')toggleChat();
    if(e.code==='Escape'){if(!$('freeChatPanel').classList.contains('hidden')||!$('freeMapPanel').classList.contains('hidden')||!$('freeLevelsPanel').classList.contains('hidden')){toggleChat(false);toggleMap(false);toggleLevels(false);}else togglePause(!state.paused);}
  });
  addEventListener('keyup',e=>{const k=keyMap[e.code];if(k)input[k]=false;});

  const freeMobileControls=$('freeMobileControls');
  if(freeMobileControls){
    // Mobile Safari can interpret rapid taps on control labels as text selection,
    // copy/callout or double-tap zoom. Keep the gameplay surface non-selectable
    // without affecting editable chat inputs elsewhere in Free Roam.
    for(const eventName of ['selectstart','contextmenu','dragstart','dblclick']){
      freeMobileControls.addEventListener(eventName,e=>e.preventDefault());
    }
    freeMobileControls.addEventListener('touchstart',e=>{
      if(e.target.closest?.('[data-control]'))e.preventDefault();
    },{passive:false});
  }
  for(const b of document.querySelectorAll('#freeMobileControls [data-control]')){
    const k=b.dataset.control;
    const on=e=>{e.preventDefault();if(!state.paused)input[k]=true;};
    const off=e=>{e.preventDefault();input[k]=false;};
    b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off);
  }

  function togglePause(force){
    const panel=$('freePausePanel');if(!panel||!state.active)return;
    const show=force??panel.classList.contains('hidden');state.paused=!!show;panel.classList.toggle('hidden',!show);panel.setAttribute('aria-hidden',String(!show));roam.classList.toggle('paused',show);clearInputs();
    if(show){toggleChat(false);toggleMap(false);toggleLevels(false);}
  }

  function toggleChat(force){
    const p=$('freeChatPanel');
    const show=force??p.classList.contains('hidden');
    p.classList.toggle('hidden',!show);
    if(show){
      state.chatUnread=0;updateUnreadBadge();
      setTimeout(()=>$('freeChatInput').focus(),30);
    }else $('freeChatInput').blur();
  }

  function syncMapClear(){const b=$('freeMapClear');if(b)b.disabled=!state.waypoint;}

  function mapScale(){return Math.min(mapCanvas.width/WORLD.w,mapCanvas.height/WORLD.h)*mapView.zoom;}

  function sizeMap(){
    const rect=mapCanvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);
    mapCanvas.width=Math.max(1,Math.round(rect.width*ratio));mapCanvas.height=Math.max(1,Math.round(rect.height*ratio));
  }

  function toggleMap(force){
    const p=$('freeMapPanel');
    const show=force??p.classList.contains('hidden');
    p.classList.toggle('hidden',!show);
    syncMapClear();
    if(show){sizeMap();drawMiniMap();}
  }

  $('freeChatForm').addEventListener('submit',e=>{
    e.preventDefault();
    const i=$('freeChatInput'),text=i.value.trim();
    if(text){send({type:'chat',v:1,text});i.value='';}
  });
  $('freeChatBtn').addEventListener('click',()=>toggleChat());
  $('freeChatClose').addEventListener('click',()=>toggleChat(false));
  $('freePauseBtn')?.addEventListener('click',()=>togglePause(true));
  $('freePauseContinue')?.addEventListener('click',()=>togglePause(false));
  $('freePauseControls')?.addEventListener('click',()=>{const panel=$('freePausePanel');panel?.classList.add('hidden');panel?.setAttribute('aria-hidden','true');window.VelocityControlLayout?.open?.();});
  addEventListener('velocity-control-layout-close',()=>{if(state.active&&state.paused){const panel=$('freePausePanel');panel?.classList.remove('hidden');panel?.setAttribute('aria-hidden','false');}});
  addEventListener('velocity-control-layout-change',()=>window.VelocityControlLayout?.apply?.());
  $('freePauseChat')?.addEventListener('click',()=>{togglePause(false);toggleChat(true);});
  $('freePauseMap')?.addEventListener('click',()=>{togglePause(false);toggleMap(true);});
  $('freePauseLeave')?.addEventListener('click',leave);
  $('freeLevelPill')?.addEventListener('click',()=>toggleLevels());
  $('freeLevelsClose')?.addEventListener('click',()=>toggleLevels(false));
  $('freeEventLeave')?.addEventListener('click',()=>{const e=state.liveEvent;if(!e||!['waiting','countdown','running'].includes(e.status))return;if(!confirm('Выйти из '+eventTitle(e.activity)+'? Награда за этот ивент не будет выдана.'))return;if(send({type:'activity_leave',v:1,activity:e.activity,eventId:e.id})){$('freeEventLeave').disabled=true;setTimeout(()=>{if($('freeEventLeave'))$('freeEventLeave').disabled=false;},1500);}});
  $('freeMapBtn').addEventListener('click',()=>toggleMap());
  $('freeMapClose').addEventListener('click',()=>toggleMap(false));
  $('freeMapClear')?.addEventListener('click',()=>{state.waypoint=null;syncMapClear();drawMiniMap();setBanner('МЕТКА УДАЛЕНА',1800);});
  $('freeLeaveBtn').addEventListener('click',leave);
  $('freeRefreshBtn').addEventListener('click',loadServers);
  $('freeServersBackBtn').addEventListener('click',closeBrowser);
  $('onlineFreeModeBtn')?.addEventListener('click',openBrowser);
  addEventListener('resize',()=>{if(state.active){resize();if(!$('freeMapPanel').classList.contains('hidden')){sizeMap();drawMiniMap();}}},{passive:true});
  function zoomMap(delta){
    if(mapView.zoom===1&&delta>0){mapView.x=car.x;mapView.y=car.y;}
    mapView.zoom=clamp(mapView.zoom+delta,1,4);
    if(mapView.zoom===1){mapView.x=WORLD.w/2;mapView.y=WORLD.h/2;}
    drawMiniMap();
  }
  $('freeMapZoomIn').addEventListener('click',()=>zoomMap(.5));
  $('freeMapZoomOut').addEventListener('click',()=>zoomMap(-.5));
  $('freeMapFit').addEventListener('click',()=>{mapView.zoom=1;mapView.x=WORLD.w/2;mapView.y=WORLD.h/2;drawMiniMap();});
  mapCanvas.addEventListener('wheel',e=>{e.preventDefault();zoomMap(e.deltaY<0?.5:-.5);},{passive:false});
  mapCanvas.addEventListener('pointerdown',e=>{
    mapWasDragged=false;mapDrag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:mapView.x,cy:mapView.y};
    mapCanvas.setPointerCapture?.(e.pointerId);
  });
  mapCanvas.addEventListener('pointermove',e=>{
    if(!mapDrag||mapDrag.id!==e.pointerId)return;
    const dx=e.clientX-mapDrag.x,dy=e.clientY-mapDrag.y;
    if(Math.hypot(dx,dy)>6)mapWasDragged=true;
    if(!mapWasDragged||mapView.zoom===1)return;
    const rect=mapCanvas.getBoundingClientRect(),scale=mapScale();
    mapView.x=clamp(mapDrag.cx-dx*mapCanvas.width/rect.width/scale,0,WORLD.w);
    mapView.y=clamp(mapDrag.cy-dy*mapCanvas.height/rect.height/scale,0,WORLD.h);
    drawMiniMap();
  });
  mapCanvas.addEventListener('pointerup',()=>{mapDrag=null;});
  mapCanvas.addEventListener('pointercancel',()=>{mapDrag=null;mapWasDragged=true;});
  mapCanvas.addEventListener('click',e=>{
    if(mapWasDragged){mapWasDragged=false;return;}
    const r=mapCanvas.getBoundingClientRect(),scale=mapScale();
    const px=(e.clientX-r.left)/r.width*mapCanvas.width,py=(e.clientY-r.top)/r.height*mapCanvas.height;
    const x=mapView.x+(px-mapCanvas.width/2)/scale,y=mapView.y+(py-mapCanvas.height/2)/scale;
    if(x<0||y<0||x>WORLD.w||y>WORLD.h)return;
    state.waypoint=CITY.nearestRoad(x,y);
    syncMapClear();setBanner('МЕТКА УСТАНОВЛЕНА НА ДОРОГЕ');toggleMap(false);
  });

  function fillRect(c,x,y,w,h,fill){c.fillStyle=fill;c.fillRect(x,y,w,h);}

  function roundRect(c,x,y,w,h,r,fill=true,stroke=false){
    const rr=Math.min(r,w*.5,h*.5);
    c.beginPath();
    c.moveTo(x+rr,y);
    c.arcTo(x+w,y,x+w,y+h,rr);
    c.arcTo(x+w,y+h,x,y+h,rr);
    c.arcTo(x,y+h,x,y,rr);
    c.arcTo(x,y,x+w,y,rr);
    c.closePath();
    if(fill)c.fill();
    if(stroke)c.stroke();
  }

  canvas.addEventListener('click',e=>{
    if(!state.active||window.VelocityCrews?.active)return;
    const rect=canvas.getBoundingClientRect(),px=(e.clientX-rect.left)*W/rect.width,py=(e.clientY-rect.top)*H/rect.height;
    const zoom=clamp(.82-Math.min(1,car.speed/580)*.10,.68,.85),wx=(px-W/2)/zoom+car.x,wy=(py-H/2)/zoom+car.y;
    const targets=[...state.remotes.entries()].map(([id,r])=>({id,r,d:Math.hypot(r.x-wx,r.y-wy)})).sort((a,b)=>a.d-b.d);
    const target=targets.find(t=>t.d<55||(Math.abs(t.r.x-wx)<95&&Math.abs(t.r.y-39-wy)<25));
    if(target){const p=state.room?.players?.find(p=>p.id===target.id);if(p?.userId)window.VelocityCrews?.profile({id:p.userId});}
  });
  updateChatPreview();
  refreshPlayerLoadout();
  window.VelocityFreeRoam={open:openBrowser,leave,get active(){return state.active;},state};
})();
