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
    drag:{x:3120,y:2670,r:125,label:'AIRPORT DRAG',kind:'drag'},
    speed:{x:2020,y:430,r:120,label:'SPEED TRAP',kind:'speed'},
    drift:{x:620,y:2290,r:310,label:'PORT DRIFT',kind:'drift'},
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

  let lastMapDraw=0;
  const mapView={zoom:1,x:WORLD.w/2,y:WORLD.h/2};
  let mapDrag=null,mapWasDragged=false;

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
      R.applyCarPerformance(car,state.loadout.liveryId,loadSave());
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
    if(m.type==='free_chat'){addChat(m.name,m.text,m.playerId===state.playerId,m.owner===true);return;}
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
      r.name=p.name;r.owner=p.owner===true;
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

  function roadAt(x,y){return CITY.roadAt(x,y,-20);}

  function district(x,y){return CITY.district(x,y);}

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

    CITY.resolveCarMotion(car,prevX,prevY);

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

  function appendPlayerName(el,name,owner){
    if(owner){const badge=document.createElement('span');badge.className='free-owner-badge';badge.textContent='OWNER';el.append(badge);}
    el.append(document.createTextNode(name||'RACER'));
  }

  function addChat(name,text,mine=false,owner=false){
    state.chat.push({name,text,mine,owner,system:false,time:Date.now()});
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
      const n=document.createElement('strong');appendPlayerName(n,m.name,m.owner);
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
      const name=document.createElement('b');appendPlayerName(name,m.name,m.owner);
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
    drawZone(ctx,ZONES.drag,'#67c6ff','DRAG');
    drawZone(ctx,ZONES.speed,'#f6e75d','SPEED');
    drawZone(ctx,ZONES.drift,'#c678ff','DRIFT');
    drawZone(ctx,ZONES.meet,'#8dff49','CAR MEET');
    if(state.waypoint)drawWaypoint(ctx,state.waypoint);
    for(const [id,r] of state.remotes)drawVisualCar(ctx,r.visual,r.x,r.y,r.angle,r.name||'RACER',false,colorFor(id),r.owner);
    drawVisualCar(ctx,state.playerVisual,car.x,car.y,car.angle,state.room?.players?.find(p=>p.id===state.playerId)?.name||accountName(),true,'#a9ff5a',state.room?.players?.find(p=>p.id===state.playerId)?.owner===true);
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

  function drawVisualCar(c,visual,x,y,a,name,me,fallbackColor,owner=false){
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
    const label=name||'RACER',nameWidth=c.measureText(label).width,badgeWidth=owner?65:0,total=nameWidth+badgeWidth+20,left=x-total/2;
    c.fillStyle='#101a1eef';roundRect(c,left,y-52,total,26,8,true,false);
    if(owner){
      c.shadowColor='#ff304f';c.shadowBlur=9;c.fillStyle='#b51232';roundRect(c,left+4,y-48,57,18,5,true,false);c.shadowBlur=0;
      c.strokeStyle='#ff687c';c.lineWidth=1;roundRect(c,left+4,y-48,57,18,5,false,true);
      c.fillStyle='#fff0f2';c.font='900 10px system-ui';c.textAlign='center';c.fillText('OWNER',left+32.5,y-35);
    }
    c.font='900 14px system-ui';c.textAlign='left';c.fillStyle=owner?'#ffd6dd':me?'#dfffcb':'#dce9e5';
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

  updateChatPreview();
  refreshPlayerLoadout();
  window.VelocityFreeRoam={open:openBrowser,leave,get active(){return state.active;},state};
})();
