(function(){
  'use strict';

  const $=id=>document.getElementById(id),R=window.Racing||{};
  const browser=$('freeServers'),roam=$('freeRoam'),canvas=$('freeCanvas');
  if(!browser||!roam||!canvas)return;

  const ctx=canvas.getContext('2d');
  const mapCanvas=$('freeMapCanvas');
  const mctx=mapCanvas.getContext('2d');

  const WORLD={w:4200,h:3000};
  const MAX=20;
  const ROAD_W=190;
  const H_ROADS=[430,1010,1590,2170,2670];
  const V_ROADS=[430,1050,1680,2320,3020,3660];
  const ZONES={
    drag:{x:3120,y:2670,r:125,label:'AIRPORT DRAG',kind:'drag'},
    speed:{x:2020,y:430,r:120,label:'SPEED TRAP',kind:'speed'},
    drift:{x:620,y:2290,r:310,label:'PORT DRIFT',kind:'drift'},
    meet:{x:2320,y:1590,r:260,label:'CAR MEET',kind:'meet'}
  };
  const MOUNTAIN=[[140,760],[190,600],[320,520],[520,560],[650,690],[720,850],[820,940],[980,900]];
  const DISTRICT_COLORS={
    downtown:'#10201c',industrial:'#151f21',suburbs:'#14231d',port:'#112227',airport:'#1a2125',mountain:'#14201c',city:'#0d1816'
  };
  const CHAT_PREVIEW_LIMIT=4;
  const SOLO_PHYS=R.RACE_PHYSICS||{maxSpeed:510,accel:268,brakePower:368,turnRate:2.40};
  const FREE_PHYS_TRACK={
    roadWidth:100000,barrierMargin:0,theme:{drag:1},
    nearest(x,y){return{x,y,tx:1,ty:0,nx:0,ny:1,signed:0,index:0,progress:.5};},
    surfaceAtOffset(){return{type:'asphalt'};},
    barrierCenterLimit(){return 1e9;}
  };

  const state={
    active:false,servers:[],server:null,playerId:null,token:null,ws:null,seq:0,lastSend:0,serverOffset:0,
    room:null,remotes:new Map(),chat:[],drag:null,dragQueued:false,driftScore:0,driftInside:false,
    speedCooldown:0,waypoint:null,chatUnread:0,loadout:null,playerVisual:null,driftPhysicsTime:0
  };
  const input={left:false,right:false,gas:false,brake:false,handbrake:false};
  const car=R.Car?new R.Car({player:true,maxSpeed:SOLO_PHYS.maxSpeed,accel:SOLO_PHYS.accel,brakePower:SOLO_PHYS.brakePower,turnRate:SOLO_PHYS.turnRate}):{x:2320,y:1590,vx:0,vy:0,angle:-Math.PI/2,speed:0};
  let W=1,H=1,DPR=1,last=performance.now(),raf=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
  const TAU=Math.PI*2;

  const scenery=buildScenery();

  function accountName(){
    return (window.VelocityAccount?.user?.displayName||localStorage.getItem('velocityApex.onlineName')||'RACER').trim().slice(0,14)||'RACER';
  }

  function loadSave(){
    try{return R.normalizeSave?R.normalizeSave(JSON.parse(localStorage.getItem('velocityApex.v1')||'{}')):{};}
    catch{return R.normalizeSave?R.normalizeSave({}):{};}
  }

  function loadout(){
    const s=loadSave();
    const liveryId=s.selectedLivery||'apexLime',effectId=s.selectedEffect||'standard';
    return {liveryId,effectId,livery:R.LIVERIES?.[liveryId]||R.LIVERIES?.apexLime||null};
  }

  function createVisual(liveryId,effectId){
    if(!R.Car)return null;
    const visual=new R.Car();
    visual.setLoadout(liveryId||'apexLime',effectId||'standard','full');
    visual.throttleVisual=.92;
    return visual;
  }

  function refreshPlayerLoadout(){
    state.loadout=loadout();
    if(R.Car&&car.setLoadout){
      car.maxSpeed=SOLO_PHYS.maxSpeed;car.baseMaxSpeed=SOLO_PHYS.maxSpeed;car.accel=SOLO_PHYS.accel;car.brakePower=SOLO_PHYS.brakePower;car.turnRate=SOLO_PHYS.turnRate;
      car.setLoadout(state.loadout.liveryId,state.loadout.effectId,'full');
      state.playerVisual=car;
    }else state.playerVisual=createVisual(state.loadout.liveryId,state.loadout.effectId);
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
      const d=await jsonFetch(`/api/free/${server.id}/join`,{method:'POST',body:JSON.stringify({name:accountName(),loadout:{liveryId:state.loadout.liveryId,effectId:state.loadout.effectId}})});
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

  function connect(){
    try{state.ws?.close();}catch{}
    const proto=location.protocol==='https:'?'wss:':'ws:';
    const ws=state.ws=new WebSocket(`${proto}//${location.host}/api/free/${state.server.id}/ws?playerId=${encodeURIComponent(state.playerId)}&token=${encodeURIComponent(state.token)}`);
    ws.onmessage=e=>onMessage(e.data);
    ws.onclose=()=>{if(state.active)setBanner('СОЕДИНЕНИЕ ПОТЕРЯНО · ВОЗВРАТ В МЕНЮ',3500);};
  }

  function send(o){
    if(state.ws?.readyState===WebSocket.OPEN){state.ws.send(JSON.stringify(o));return true;}
    return false;
  }

  function onMessage(raw){
    let m;
    try{m=JSON.parse(raw);}catch{return;}
    if(!m?.type)return;
    if(m.type==='free_hello'){
      state.serverOffset=(m.serverTime||Date.now())-Date.now();
      applyRoom(m.room);
      addSystem('Подключено к '+state.server.name+'.');
      return;
    }
    if(m.type==='free_room'){applyRoom(m.room);return;}
    if(m.type==='free_state'&&m.playerId!==state.playerId){
      let r=state.remotes.get(m.playerId);
      if(!r){
        r={x:m.state.x,y:m.state.y,angle:m.state.angle,target:m.state,name:'RACER',liveryId:'apexLime',effectId:'standard',visual:createVisual('apexLime','standard')};
        state.remotes.set(m.playerId,r);
      }
      r.target=m.state;
      return;
    }
    if(m.type==='free_chat'){addChat(m.name,m.text,m.playerId===state.playerId);return;}
    if(m.type==='free_record'){
      if(state.room)state.room.records={...(state.room.records||{}),[m.kind]:m.value};
      addSystem(`${m.name}: новый рекорд ${m.kind==='speed'?m.value+' km/h':m.value+' drift'}.`);
      return;
    }
    if(m.type==='drag_queue'){
      if(state.dragQueued)setBanner(`DRAG · очередь ${m.count}/2`,1800);
      return;
    }
    if(m.type==='activity_start'&&m.activity==='drag'&&m.participants.includes(state.playerId)){
      const lane=m.participants.indexOf(state.playerId);
      state.drag={id:m.challengeId,startAt:m.startAt,finished:false};
      state.dragQueued=false;
      car.x=3130;
      car.y=2635+lane*70;
      car.angle=0;
      car.vx=car.vy=car.speed=0;
      setBanner('DRAG · ПРИГОТОВЬТЕСЬ',2000);
      updateChatPreview();
      return;
    }
    if(m.type==='activity_result'&&m.activity==='drag'){
      const mine=m.times?.[state.playerId];
      if(mine){
        const won=m.winnerId===state.playerId;
        setBanner(`${won?'ПОБЕДА':'ФИНИШ'} · ${(mine/1000).toFixed(3)} сек`,5000);
        state.drag=null;
      }
      addSystem(`DRAG: ${m.names?.[m.winnerId]||'RACER'} победил.`);
    }
  }

  function applyRoom(room){
    if(!room)return;
    state.room=room;
    const live=new Set(room.players.map(p=>p.id));
    for(const p of room.players){
      if(p.id===state.playerId)continue;
      let r=state.remotes.get(p.id);
      if(!r){
        const s=p.state||{x:2320,y:1590,angle:0};
        r={x:s.x,y:s.y,angle:s.angle,target:s,name:p.name,liveryId:p.liveryId||'apexLime',effectId:p.effectId||'standard',visual:createVisual(p.liveryId,p.effectId)};
        state.remotes.set(p.id,r);
      }
      r.name=p.name;
      if(r.liveryId!==p.liveryId||r.effectId!==p.effectId||!r.visual){
        r.liveryId=p.liveryId||'apexLime';
        r.effectId=p.effectId||'standard';
        r.visual=createVisual(r.liveryId,r.effectId);
      }
      if(p.state)r.target=p.state;
    }
    for(const id of state.remotes.keys())if(!live.has(id))state.remotes.delete(id);
    $('freePlayerCount').textContent=`${room.players.filter(p=>p.connected).length} / ${room.maxPlayers||MAX}`;
  }

  function startRoam(){
    state.active=true;
    state.chatUnread=0;
    state.chat.length=0;
    state.driftScore=0;
    state.driftInside=false;
    refreshPlayerLoadout();
    if(state.playerVisual)state.playerVisual.effectTime=0;
    car.x=2320;car.y=1590;car.vx=0;car.vy=0;car.angle=-Math.PI/2;car.speed=0;car.yawRate=0;car.steerInput=0;car.gripDisturbance=0;state.driftPhysicsTime=0;
    updateUnreadBadge();
    $('freeChatLog').replaceChildren();
    updateChatPreview();
    roam.classList.remove('hidden');
    roam.setAttribute('aria-hidden','false');
    $('freeServerName').textContent=state.server.name;
    resize();
    last=performance.now();
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function leave(){
    state.active=false;
    send({type:'leave',v:1});
    try{state.ws?.close(1000,'leave');}catch{}
    state.ws=null;
    state.remotes.clear();
    state.drag=null;
    state.dragQueued=false;
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

  function roadAt(x,y){
    for(const yy of H_ROADS)if(Math.abs(y-yy)<ROAD_W/2)return true;
    for(const xx of V_ROADS)if(Math.abs(x-xx)<ROAD_W/2)return true;
    if(x>2840&&x<4140&&y>2510&&y<2830)return true;
    if(x>1950&&x<2690&&y>1370&&y<1810)return true;
    if(x>250&&x<930&&y>2030&&y<2580)return true;
    for(let i=1;i<MOUNTAIN.length;i++){
      const a=MOUNTAIN[i-1],b=MOUNTAIN[i],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;
      const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/l,0,1);
      if(Math.hypot(x-(a[0]+dx*t),y-(a[1]+dy*t))<95)return true;
    }
    return false;
  }

  function district(x,y){
    if(y>2450&&x>2800)return 'AIRPORT';
    if(x<980&&y>1900)return 'PORT';
    if(x<1050&&y<1000)return 'MOUNTAIN PASS';
    if(x>2900&&y<1550)return 'INDUSTRIAL';
    if(x>2700&&y>1600)return 'SUBURBS';
    if(x>1800&&x<2850&&y>1150&&y<2050)return 'DOWNTOWN';
    return 'APEX CITY';
  }

  function update(dt){
    const now=Date.now()+state.serverOffset;
    const dragLock=state.drag&&now<state.drag.startAt;
    let steer=(input.right?1:0)-(input.left?1:0);
    let throttle=input.gas?1:0,brake=input.brake?1:0,handbrake=input.handbrake?1:0;
    if(dragLock){steer=0;throttle=0;brake=1;handbrake=0;}

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

    const outside=car.x<24||car.x>WORLD.w-24||car.y<24||car.y>WORLD.h-24;
    if(outside||!roadAt(car.x,car.y)){
      car.x=clamp(prevX,24,WORLD.w-24);car.y=clamp(prevY,24,WORLD.h-24);
      car.vx*=.58;car.vy*=.58;car.speed=Math.hypot(car.vx,car.vy);
      car.markImpact?.(.28);
    }

    for(const r of state.remotes.values()){
      if(!r.target)continue;
      const t=Math.min(1,dt*7.5);
      r.x+=(r.target.x-r.x)*t;
      r.y+=(r.target.y-r.y)*t;
      let d=(r.target.angle-r.angle)%(Math.PI*2);
      if(d>Math.PI)d-=Math.PI*2;
      if(d<-Math.PI)d+=Math.PI*2;
      r.angle+=d*t;
      if(r.visual){
        r.visual.speed=Math.max(40,r.target.speed||0);
        r.visual.effectTime+=dt;
        r.visual.throttleVisual=.88;
      }
    }

    if(performance.now()-state.lastSend>55){
      state.lastSend=performance.now();
      send({type:'free_state',v:1,state:{seq:++state.seq,x:car.x,y:car.y,vx:car.vx,vy:car.vy,angle:car.angle,speed:car.speed}});
    }

    $('freeSpeed').textContent=Math.round(car.speed);
    $('freeLocation').textContent=district(car.x,car.y);
    updateActivities(dt,now);
  }

  function updateActivities(dt,now){
    state.speedCooldown=Math.max(0,state.speedCooldown-dt);

    if(dist(car.x,car.y,ZONES.speed.x,ZONES.speed.y)<ZONES.speed.r&&state.speedCooldown<=0&&car.speed>90){
      state.speedCooldown=4;
      const v=Math.round(car.speed);
      setBanner(`SPEED TRAP · ${v} KM/H`,2600);
      send({type:'record',v:1,kind:'speed',value:v});
    }

    const inDrift=dist(car.x,car.y,ZONES.drift.x,ZONES.drift.y)<ZONES.drift.r;
    if(inDrift&&car.speed>55&&(input.handbrake||Math.abs((input.right?1:0)-(input.left?1:0))>.45)){
      state.driftScore+=car.speed*dt*4.9;
      state.driftInside=true;
    }else if(state.driftInside&&!inDrift){
      const score=Math.floor(state.driftScore);
      if(score>120){
        setBanner(`DRIFT ZONE · ${score.toLocaleString('ru-RU')}`,3000);
        send({type:'record',v:1,kind:'drift',value:score});
      }
      state.driftScore=0;
      state.driftInside=false;
    }

    if(state.drag&&!state.drag.finished&&now>=state.drag.startAt&&car.x>3920&&car.y>2510&&car.y<2820){
      state.drag.finished=true;
      const elapsed=now-state.drag.startAt;
      send({type:'activity_finish',v:1,activity:'drag',challengeId:state.drag.id,elapsedMs:elapsed});
      setBanner(`DRAG · ${(elapsed/1000).toFixed(3)} сек`,3200);
    }

    const action=$('freeContextAction');
    const nearDrag=dist(car.x,car.y,ZONES.drag.x,ZONES.drag.y)<ZONES.drag.r&&!state.drag;
    if(nearDrag&&!state.dragQueued){
      action.textContent='DRAG · ВСТАТЬ В ОЧЕРЕДЬ';
      action.classList.remove('hidden');
      action.onclick=()=>{
        state.dragQueued=true;
        send({type:'activity_join',v:1,activity:'drag'});
        action.classList.add('hidden');
        setBanner('DRAG · ОЖИДАЕМ СОПЕРНИКА');
      };
    }else if(!nearDrag||state.dragQueued){
      action.classList.add('hidden');
    }
  }

  function setBanner(text,ms=2200){
    const b=$('freeActivityBanner');
    b.textContent=text;
    b.classList.remove('hidden');
    clearTimeout(setBanner.t);
    setBanner.t=setTimeout(()=>b.classList.add('hidden'),ms);
  }

  function addChat(name,text,mine=false){
    state.chat.push({name,text,mine,system:false,time:Date.now()});
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
      row.className='free-chat-line'+(m.system?' system':'')+(m.mine?' mine':'');
      const n=document.createElement('strong');n.textContent=m.name;
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
      row.className='free-chat-preview-line'+(m.system?' system':'')+(m.mine?' mine':'');
      const name=document.createElement('b');name.textContent=m.name;
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
    drawCity(ctx);
    if(state.waypoint)drawWaypoint(ctx,state.waypoint);
    for(const [id,r] of state.remotes)drawVisualCar(ctx,r.visual,r.x,r.y,r.angle,r.name||'RACER',false,colorFor(id));
    drawVisualCar(ctx,state.playerVisual,car.x,car.y,car.angle,accountName(),true,'#a9ff5a');
    ctx.restore();
    drawMiniMap();
  }

  function drawCity(c){
    const sky=c.createLinearGradient(0,0,0,WORLD.h);
    sky.addColorStop(0,'#091513');sky.addColorStop(.45,'#0c1a17');sky.addColorStop(1,'#0a1312');
    c.fillStyle=sky;c.fillRect(0,0,WORLD.w,WORLD.h);

    drawWater(c);
    drawDistrictGrounds(c);
    drawParks(c);
    drawAirportTarmac(c);
    drawRoadNetwork(c);
    drawIntersections(c);
    drawBuildings(c);
    drawProps(c);
    drawZone(c,ZONES.drag,'#67c6ff','DRAG');
    drawZone(c,ZONES.speed,'#f6e75d','SPEED');
    drawZone(c,ZONES.drift,'#c678ff','DRIFT');
    drawZone(c,ZONES.meet,'#8dff49','CAR MEET');
    drawLabels(c);
  }

  function drawWater(c){
    c.save();
    c.fillStyle='#0c2b34';
    c.beginPath();
    c.moveTo(0,1840);c.lineTo(0,WORLD.h);c.lineTo(1160,WORLD.h);c.lineTo(1030,2690);c.lineTo(1120,2460);c.lineTo(980,2210);c.lineTo(1020,1960);c.closePath();
    c.fill();
    c.globalAlpha=.22;c.fillStyle='#5ad2ff';
    for(let i=0;i<14;i++){
      c.beginPath();c.ellipse(120+i*72,2160+i*38,150,18,Math.PI/26,0,TAU);c.fill();
    }
    c.restore();
  }

  function drawDistrictGrounds(c){
    fillRect(c,1750,1070,1160,1040,'rgba(33,48,42,.55)');
    fillRect(c,2850,0,1350,1540,'rgba(34,37,40,.62)');
    fillRect(c,2690,1570,1510,760,'rgba(23,38,29,.55)');
    fillRect(c,2790,2420,1410,580,'rgba(34,39,43,.75)');
    fillRect(c,0,0,1180,1080,'rgba(27,43,35,.58)');
    fillRect(c,0,1910,1040,720,'rgba(25,42,46,.65)');
  }

  function drawParks(c){
    for(const park of scenery.parks){
      c.save();
      c.fillStyle=park.color;c.strokeStyle='rgba(141,255,73,.10)';c.lineWidth=3;
      roundRect(c,park.x,park.y,park.w,park.h,20,true,true);
      c.globalAlpha=.28;
      for(let i=0;i<park.trees.length;i++){
        const t=park.trees[i];
        c.fillStyle=i%2?'#2f6d45':'#387b4c';
        c.beginPath();c.arc(t.x,t.y,t.r,0,TAU);c.fill();
      }
      c.restore();
    }
  }

  function drawAirportTarmac(c){
    c.save();
    fillRect(c,2840,2510,1300,320,'#2a3136');
    c.strokeStyle='rgba(255,255,255,.19)';c.lineWidth=3;
    for(let y=2570;y<2800;y+=70){
      c.beginPath();c.moveTo(2920,y);c.lineTo(4070,y);c.stroke();
    }
    c.strokeStyle='rgba(255,214,92,.68)';c.setLineDash([34,24]);c.lineWidth=4;
    c.beginPath();c.moveTo(2920,2670);c.lineTo(4070,2670);c.stroke();
    c.setLineDash([]);
    for(const hangar of scenery.airport){
      c.fillStyle=hangar.fill;c.strokeStyle=hangar.stroke;c.lineWidth=2.5;
      roundRect(c,hangar.x,hangar.y,hangar.w,hangar.h,14,true,true);
      c.fillStyle='rgba(215,235,241,.11)';c.fillRect(hangar.x+18,hangar.y+16,hangar.w-36,14);
    }
    c.restore();
  }

  function drawRoadNetwork(c){
    c.save();
    for(const yy of H_ROADS)drawRoadLine(c,[[0,yy],[WORLD.w,yy]],ROAD_W,false);
    for(const xx of V_ROADS)drawRoadLine(c,[[xx,0],[xx,WORLD.h]],ROAD_W,true);
    drawRoadLine(c,MOUNTAIN,190,false,true);
    c.restore();
  }

  function drawRoadLine(c,pts,w,vertical=false,mountain=false){
    c.save();
    c.strokeStyle=mountain?'#242d2f':'#222b2d';c.lineWidth=w+22;c.lineCap='round';c.lineJoin='round';
    c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
    c.strokeStyle=mountain?'#2d3739':'#2b3335';c.lineWidth=w;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
    c.strokeStyle='rgba(255,255,255,.07)';c.lineWidth=w-20;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
    c.strokeStyle='rgba(255,255,255,.16)';c.lineWidth=3.5;c.setLineDash([36,26]);c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
    c.setLineDash([]);
    c.strokeStyle='rgba(255,255,255,.11)';c.lineWidth=2;
    if(mountain){
      c.beginPath();pts.forEach((p,i)=>{const offset=75;if(i===0)c.moveTo(p[0],p[1]-offset);else c.lineTo(p[0],p[1]-offset);});c.stroke();
      c.beginPath();pts.forEach((p,i)=>{const offset=75;if(i===0)c.moveTo(p[0],p[1]+offset);else c.lineTo(p[0],p[1]+offset);});c.stroke();
    }else if(vertical){
      c.beginPath();c.moveTo(pts[0][0]-w*.33,pts[0][1]);c.lineTo(pts[1][0]-w*.33,pts[1][1]);c.stroke();
      c.beginPath();c.moveTo(pts[0][0]+w*.33,pts[0][1]);c.lineTo(pts[1][0]+w*.33,pts[1][1]);c.stroke();
    }else{
      c.beginPath();c.moveTo(pts[0][0],pts[0][1]-w*.33);c.lineTo(pts[1][0],pts[1][1]-w*.33);c.stroke();
      c.beginPath();c.moveTo(pts[0][0],pts[0][1]+w*.33);c.lineTo(pts[1][0],pts[1][1]+w*.33);c.stroke();
    }
    c.restore();
  }

  function drawIntersections(c){
    c.save();
    c.fillStyle='rgba(241,248,244,.13)';
    for(const xx of V_ROADS)for(const yy of H_ROADS){
      for(let i=-3;i<=3;i++){
        c.fillRect(xx-76+i*14,yy-ROAD_W*.47,7,28);
        c.fillRect(xx-76+i*14,yy+ROAD_W*.47-28,7,28);
      }
    }
    c.restore();
  }

  function drawBuildings(c){
    c.save();
    for(const b of scenery.buildings){
      const shadowAlpha=b.kind==='tower'?.22:b.kind==='house'?.18:.20;
      c.fillStyle=`rgba(0,0,0,${shadowAlpha})`;
      roundRect(c,b.x+7,b.y+8,b.w,b.h,Math.min(18,b.r),true,false);
      c.fillStyle=b.fill;c.strokeStyle=b.stroke;c.lineWidth=2;
      roundRect(c,b.x,b.y,b.w,b.h,b.r,true,true);
      if(b.roof){c.fillStyle=b.roof;roundRect(c,b.x+8,b.y+8,b.w-16,Math.max(12,Math.min(22,b.h*.20)),Math.max(8,b.r-4),true,false);}
      if(b.windows){
        c.fillStyle=b.window;
        for(let yy=b.y+18;yy<b.y+b.h-14;yy+=b.windowStepY){
          for(let xx=b.x+14;xx<b.x+b.w-12;xx+=b.windowStepX)c.fillRect(xx,yy,b.windowW,b.windowH);
        }
      }
      if(b.kind==='house'){
        c.fillStyle='rgba(220,242,229,.22)';
        c.beginPath();
        c.moveTo(b.x+12,b.y+10);c.lineTo(b.x+b.w/2,b.y-8);c.lineTo(b.x+b.w-12,b.y+10);c.closePath();
        c.fill();
      }
    }
    c.restore();
  }

  function drawProps(c){
    c.save();
    for(const light of scenery.streetLights){
      c.strokeStyle='rgba(200,225,214,.22)';c.lineWidth=3;
      c.beginPath();c.moveTo(light.x,light.y);c.lineTo(light.x,light.y+20);c.stroke();
      c.fillStyle='rgba(255,239,172,.18)';c.beginPath();c.arc(light.x,light.y,6,0,TAU);c.fill();
    }
    for(const crane of scenery.cranes){
      c.fillStyle='#506066';c.fillRect(crane.x,crane.y,18,96);
      c.fillRect(crane.x-8,crane.y+14,142,12);
      c.fillStyle='#f0c84e';c.fillRect(crane.x+116,crane.y+18,18,46);
    }
    for(const container of scenery.containers){
      c.fillStyle=container.fill;roundRect(c,container.x,container.y,container.w,container.h,8,true,false);
      c.strokeStyle='rgba(255,255,255,.16)';c.strokeRect(container.x+4,container.y+4,container.w-8,container.h-8);
    }
    c.restore();
  }

  function drawZone(c,z,color,label){
    c.save();
    c.strokeStyle=color;c.fillStyle=color;c.globalAlpha=.13;c.lineWidth=7;
    c.beginPath();c.arc(z.x,z.y,z.r,0,TAU);c.fill();
    c.globalAlpha=.9;c.stroke();
    c.font='900 24px system-ui';c.textAlign='center';c.fillText(label,z.x,z.y-z.r-18);
    c.restore();
  }

  function drawLabels(c){
    c.save();
    c.fillStyle='rgba(226,243,235,.58)';
    c.font='800 34px system-ui';
    c.fillText('DOWNTOWN',1960,1320);
    c.fillText('AIRPORT',3300,2470);
    c.fillText('PORT',300,1970);
    c.fillText('INDUSTRIAL',3070,820);
    c.fillText('MOUNTAIN PASS',120,330);
    c.fillText('SUBURBS',3015,1740);
    c.restore();
  }

  function drawVisualCar(c,visual,x,y,a,name,me,fallbackColor){
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
    c.textAlign='center';
    c.font='900 14px system-ui';
    c.fillStyle='rgba(0,0,0,.34)';
    c.fillRect(x-62,y-48,124,20);
    c.fillStyle=me?'#dfffcb':'#dce9e5';
    c.fillText(name||'RACER',x,y-34);
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
    const sx=mapCanvas.width/WORLD.w,sy=mapCanvas.height/WORLD.h;
    const bg=mctx.createLinearGradient(0,0,0,mapCanvas.height);
    bg.addColorStop(0,'#0a1615');bg.addColorStop(1,'#071210');
    mctx.fillStyle=bg;mctx.fillRect(0,0,mapCanvas.width,mapCanvas.height);

    mctx.fillStyle='#11313b';
    mctx.beginPath();
    mctx.moveTo(0,1840*sy);mctx.lineTo(0,mapCanvas.height);mctx.lineTo(1160*sx,mapCanvas.height);mctx.lineTo(1030*sx,2690*sy);mctx.lineTo(1120*sx,2460*sy);mctx.lineTo(980*sx,2210*sy);mctx.lineTo(1020*sx,1960*sy);mctx.closePath();
    mctx.fill();

    for(const park of scenery.parks){
      mctx.fillStyle='#163526';
      roundRect(mctx,park.x*sx,park.y*sy,park.w*sx,park.h*sy,10,true,false);
    }

    for(const b of scenery.mapBlocks){
      mctx.fillStyle=b.fill;
      mctx.fillRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy);
    }

    mctx.strokeStyle='#3b4d50';mctx.lineWidth=ROAD_W*sx+4;
    for(const yy of H_ROADS){mctx.beginPath();mctx.moveTo(0,yy*sy);mctx.lineTo(mapCanvas.width,yy*sy);mctx.stroke();}
    for(const xx of V_ROADS){mctx.beginPath();mctx.moveTo(xx*sx,0);mctx.lineTo(xx*sx,mapCanvas.height);mctx.stroke();}
    mctx.lineWidth=152*sx;drawMapPath(mctx,MOUNTAIN,sx,sy,'#3b4d50');
    mctx.strokeStyle='rgba(255,255,255,.12)';mctx.lineWidth=2;
    for(const yy of H_ROADS){mctx.beginPath();mctx.moveTo(0,yy*sy);mctx.lineTo(mapCanvas.width,yy*sy);mctx.stroke();}
    for(const xx of V_ROADS){mctx.beginPath();mctx.moveTo(xx*sx,0);mctx.lineTo(xx*sx,mapCanvas.height);mctx.stroke();}
    mctx.strokeStyle='rgba(255,255,255,.12)';mctx.lineWidth=2;drawMapPath(mctx,MOUNTAIN,sx,sy,'rgba(255,255,255,.12)');

    if(state.waypoint){
      mctx.strokeStyle='#8dff49';mctx.setLineDash([10,8]);mctx.lineWidth=2;
      mctx.beginPath();mctx.moveTo(car.x*sx,car.y*sy);mctx.lineTo(state.waypoint.x*sx,state.waypoint.y*sy);mctx.stroke();mctx.setLineDash([]);
    }

    for(const z of Object.values(ZONES))drawMapZone(mctx,z,sx,sy);
    for(const r of state.remotes.values())drawMapMarker(mctx,r.x*sx,r.y*sy,r.angle,'#77c7ff');
    if(state.waypoint){mctx.strokeStyle='#8dff49';mctx.lineWidth=2;mctx.strokeRect(state.waypoint.x*sx-7,state.waypoint.y*sy-7,14,14);}
    drawMapMarker(mctx,car.x*sx,car.y*sy,car.angle,'#ffffff',true);
  }

  function drawMapPath(c,pts,sx,sy,color){
    c.strokeStyle=color;c.beginPath();
    pts.forEach((p,i)=>i?c.lineTo(p[0]*sx,p[1]*sy):c.moveTo(p[0]*sx,p[1]*sy));
    c.stroke();
  }

  function drawMapZone(c,z,sx,sy){
    const color=z.kind==='drag'?'#67c6ff':z.kind==='speed'?'#f6e75d':z.kind==='drift'?'#c678ff':'#8dff49';
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
    const on=e=>{e.preventDefault();input[k]=true;};
    const off=e=>{e.preventDefault();input[k]=false;};
    b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off);
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

  function toggleMap(force){
    const p=$('freeMapPanel');
    const show=force??p.classList.contains('hidden');
    p.classList.toggle('hidden',!show);
    syncMapClear();
    if(show)drawMiniMap();
  }

  $('freeChatForm').addEventListener('submit',e=>{
    e.preventDefault();
    const i=$('freeChatInput'),text=i.value.trim();
    if(text){send({type:'chat',v:1,text});i.value='';}
  });
  $('freeChatBtn').addEventListener('click',()=>toggleChat());
  $('freeChatClose').addEventListener('click',()=>toggleChat(false));
  $('freeMapBtn').addEventListener('click',()=>toggleMap());
  $('freeMapClose').addEventListener('click',()=>toggleMap(false));
  $('freeMapClear')?.addEventListener('click',()=>{state.waypoint=null;syncMapClear();drawMiniMap();setBanner('МЕТКА УДАЛЕНА',1800);});
  $('freeLeaveBtn').addEventListener('click',leave);
  $('freeRefreshBtn').addEventListener('click',loadServers);
  $('freeServersBackBtn').addEventListener('click',closeBrowser);
  $('onlineFreeModeBtn')?.addEventListener('click',openBrowser);
  addEventListener('resize',()=>state.active&&resize(),{passive:true});
  mapCanvas.addEventListener('click',e=>{
    const r=mapCanvas.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width*WORLD.w;
    const y=(e.clientY-r.top)/r.height*WORLD.h;
    state.waypoint={x,y};
    syncMapClear();
    setBanner('МАРШРУТ УСТАНОВЛЕН');
    toggleMap(false);
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

  function buildScenery(){
    const buildings=[];
    const mapBlocks=[];
    const parks=[];
    const airport=[];
    const cranes=[];
    const containers=[];
    const streetLights=[];

    const xs=[0,...V_ROADS,WORLD.w],ys=[0,...H_ROADS,WORLD.h];
    for(let i=0;i<xs.length-1;i++){
      for(let j=0;j<ys.length-1;j++){
        const x=xs[i]+ROAD_W/2+34,y=ys[j]+ROAD_W/2+34;
        const w=xs[i+1]-xs[i]-ROAD_W-68,h=ys[j+1]-ys[j]-ROAD_W-68;
        if(w<100||h<100)continue;
        if((x<1000&&y<1000)||(x<980&&y>1900)||(x>2800&&y>2400))continue;
        mapBlocks.push({x,y,w,h,fill:(i+j)%2?'rgba(255,255,255,.03)':'rgba(255,255,255,.018)'});

        const area=district(x+w/2,y+h/2);
        if(area==='DOWNTOWN'){
          addBuildingCluster(buildings,x,y,w,h,'tower');
          if((i+j)%2===0&&w>200&&h>180)parks.push(makePark(x+w*.08,y+h*.10,w*.24,h*.23));
        }else if(area==='INDUSTRIAL'){
          addBuildingCluster(buildings,x,y,w,h,'warehouse');
        }else if(area==='SUBURBS'){
          addBuildingCluster(buildings,x,y,w,h,'house');
          if((i+j)%3===0)parks.push(makePark(x+w*.10,y+h*.12,w*.28,h*.24));
        }else{
          addBuildingCluster(buildings,x,y,w,h,'midrise');
        }

        for(let lx=x+14;lx<x+w;lx+=78)streetLights.push({x:lx,y:y-20});
        for(let ly=y+14;ly<y+h;ly+=86)streetLights.push({x:x-18,y:ly});
      }
    }

    for(let i=0;i<5;i++)airport.push({x:2920+i*220,y:2860,w:170,h:90,fill:'#343c40',stroke:'rgba(255,255,255,.12)'});
    for(let i=0;i<6;i++)cranes.push({x:150+i*120,y:2030+(i%2)*110});

    const containerColors=['#b24848','#355fbc','#48885e','#c7853c','#7860b7'];
    for(let row=0;row<4;row++)for(let col=0;col<7;col++)containers.push({x:240+col*72,y:2145+row*58,w:58,h:36,fill:containerColors[(row+col)%containerColors.length]});

    return {buildings,mapBlocks,parks,airport,cranes,containers,streetLights};
  }

  function addBuildingCluster(out,x,y,w,h,type){
    if(type==='tower'){
      const cols=Math.max(2,Math.floor(w/125)),rows=Math.max(2,Math.floor(h/130));
      const cellW=w/cols,cellH=h/rows;
      for(let cx=0;cx<cols;cx++)for(let cy=0;cy<rows;cy++){
        const bw=cellW*(.62+.18*((cx+cy)%3));
        const bh=cellH*(.56+.22*((cx*2+cy)%4));
        const bx=x+cx*cellW+10,by=y+cy*cellH+10;
        out.push(makeBuilding(bx,by,Math.min(cellW-18,bw),Math.min(cellH-18,bh),'tower'));
      }
      return;
    }
    if(type==='warehouse'){
      const cols=Math.max(1,Math.floor(w/170)),rows=Math.max(1,Math.floor(h/150));
      const cellW=w/cols,cellH=h/rows;
      for(let cx=0;cx<cols;cx++)for(let cy=0;cy<rows;cy++){
        out.push(makeBuilding(x+cx*cellW+10,y+cy*cellH+10,Math.max(96,cellW-20),Math.max(84,cellH-20),'warehouse'));
      }
      return;
    }
    if(type==='house'){
      const cols=Math.max(2,Math.floor(w/110)),rows=Math.max(2,Math.floor(h/112));
      const cellW=w/cols,cellH=h/rows;
      for(let cx=0;cx<cols;cx++)for(let cy=0;cy<rows;cy++){
        out.push(makeBuilding(x+cx*cellW+18,y+cy*cellH+22,Math.max(52,cellW-34),Math.max(46,cellH-40),'house'));
      }
      return;
    }
    const cols=Math.max(1,Math.floor(w/145)),rows=Math.max(1,Math.floor(h/140));
    const cellW=w/cols,cellH=h/rows;
    for(let cx=0;cx<cols;cx++)for(let cy=0;cy<rows;cy++)out.push(makeBuilding(x+cx*cellW+12,y+cy*cellH+12,Math.max(70,cellW-22),Math.max(70,cellH-22),'midrise'));
  }

  function makeBuilding(x,y,w,h,kind){
    if(kind==='tower')return {x,y,w,h,r:16,kind,fill:'#223136',stroke:'rgba(255,255,255,.06)',roof:'rgba(255,255,255,.05)',windows:true,window:'#7bd2ff22',windowW:10,windowH:6,windowStepX:19,windowStepY:18};
    if(kind==='warehouse')return {x,y,w,h,r:12,kind,fill:'#2a3538',stroke:'rgba(255,255,255,.05)',roof:'rgba(255,255,255,.04)',windows:true,window:'#f7f1c81e',windowW:18,windowH:5,windowStepX:28,windowStepY:20};
    if(kind==='house')return {x,y,w,h,r:10,kind,fill:'#31423b',stroke:'rgba(255,255,255,.05)',roof:'rgba(255,255,255,.03)',windows:true,window:'#fff6d824',windowW:8,windowH:6,windowStepX:16,windowStepY:18};
    return {x,y,w,h,r:14,kind:'midrise',fill:'#273733',stroke:'rgba(255,255,255,.05)',roof:'rgba(255,255,255,.04)',windows:true,window:'#a8f0ff1d',windowW:11,windowH:6,windowStepX:20,windowStepY:20};
  }

  function makePark(x,y,w,h){
    const trees=[];
    const cols=Math.max(2,Math.floor(w/42)),rows=Math.max(2,Math.floor(h/42));
    for(let cx=0;cx<cols;cx++)for(let cy=0;cy<rows;cy++)trees.push({x:x+18+cx*(w-36)/Math.max(1,cols-1),y:y+18+cy*(h-36)/Math.max(1,rows-1),r:6+((cx+cy)%3)});
    return {x,y,w,h,color:'rgba(32,73,50,.72)',trees};
  }

  updateChatPreview();
  refreshPlayerLoadout();
  window.VelocityFreeRoam={open:openBrowser,leave,get active(){return state.active;},state};
})();
