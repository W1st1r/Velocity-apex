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
  // Interaction beacons are derived from the same rendered venue aprons as the
  // city map. This prevents the visual arena and its prompt from drifting apart.
  const MINIGAME_VENUE_CENTERS=Object.fromEntries((CITY.minigameVenues||[]).map(v=>[v.id,{x:v.apron.x+v.apron.w/2,y:v.apron.y+v.apron.h/2}]));
  const GARAGE_VENUE=CITY.garageVenue||{apron:{x:2470,y:560,w:410,h:200},access:{x:2590,y:475,w:170,h:135}};
  const GARAGE_ZONE={x:GARAGE_VENUE.apron.x+GARAGE_VENUE.apron.w/2,y:GARAGE_VENUE.apron.y+GARAGE_VENUE.apron.h/2-6,r:125,label:'GARAGE',kind:'garage'};
  const MAX=50;
  const ZONES={
    crews:{x:2020,y:1250,r:150,label:'КЛАНЫ',kind:'crews'},
    drag:{x:3120,y:2670,r:125,label:'AIRPORT DRAG',kind:'drag'},
    speed:{x:2020,y:430,r:120,label:'SPEED TRAP',kind:'speed'},
    drift:{x:670,y:2310,r:320,label:'HARBOR DRIFT MEGAPARK',kind:'drift',battleId:'harbor'},
    koth:{x:2320,y:1590,r:100,label:'KING OF THE HILL',kind:'koth',labelOffset:{x:-76,y:-8}},
    levels:{x:2470,y:1590,r:100,label:'LEVELS',kind:'levels',labelOffset:{x:76,y:8}},
    footballHub:{...MINIGAME_VENUE_CENTERS.football,r:45,label:'APEX STADIUM',kind:'minigame',hub:'football'},
    checkpointHub:{...MINIGAME_VENUE_CENTERS.checkpoint,r:45,label:'RUSH CENTER',kind:'minigame',hub:'checkpoint'},
    hotPotatoHub:{...MINIGAME_VENUE_CENTERS.hot_potato,r:45,label:'BOMB ARENA',kind:'minigame',hub:'hot_potato'},
    garage:GARAGE_ZONE,
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
    active:false,servers:[],server:null,playerId:null,token:null,ws:null,seq:0,lastSend:0,serverOffset:0,serverOffsetReady:false,rtt:0,pingTimer:0,reconnectTimer:0,reconnectAttempts:0,intentionalClose:false,
    room:null,remotes:new Map(),chat:[],drag:null,dragQueued:false,dragWager:0,activityPending:false,liveEvent:null,minigame:null,minigameHub:null,minigameReturn:null,progress:{totalExp:0,level:0,levelExp:0,requiredExp:100,toNext:100},driftScore:0,driftInside:false,
    speedCooldown:0,waypoint:null,chatUnread:0,loadout:null,playerVisual:null,paused:false,lastFootballTouchAt:0,minigameHudExpanded:false,minigameHudAutoCollapseAt:0,garageOpen:false,garageBusy:false,mediaEvent:null,spectator:false,spectatorTarget:null,mediaHudHidden:false
  };
  const input={left:false,right:false,gas:false,brake:false,handbrake:false};
  const car=R.Car?new R.Car({player:true,maxSpeed:SOLO_PHYS.maxSpeed,accel:SOLO_PHYS.accel,brakePower:SOLO_PHYS.brakePower,turnRate:SOLO_PHYS.turnRate}):{x:2320,y:1590,vx:0,vy:0,angle:-Math.PI/2,speed:0};
  let W=1,H=1,DPR=1,last=performance.now(),raf=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
  const insideRect=(x,y,r,pad=0)=>!!r&&x>=r.x-pad&&x<=r.x+r.w+pad&&y>=r.y-pad&&y<=r.y+r.h+pad;
  const nearGarage=(x=car.x,y=car.y)=>insideRect(x,y,GARAGE_VENUE.apron,30)||(y>=525&&insideRect(x,y,GARAGE_VENUE.access,22));
  const TAU=Math.PI*2;
  const DRAG_START_X=3130,DRAG_FINISH_X=4710,DRAG_LENGTH=DRAG_FINISH_X-DRAG_START_X;
  const DRAG_WAGER_OPTIONS=Object.freeze([0,100,250,500,1000,2500,5000]);
  const FREE_SEND_MS=62,FOOTBALL_SEND_MS=40,DRAG_SEND_MS=30,REMOTE_BACKTIME_MS=72,DRAG_REMOTE_BACKTIME_MS=34,REMOTE_EXTRAPOLATE_MS=220,KOTH_SWITCH_MS=[0,55000,110000,165000,210000];
  const RECONNECT_DELAYS=[180,520,1100,2200];
  const MINI_ARENA={x:2500,y:1500,left:1250,right:3750,top:750,bottom:2250};
  const FOOTBALL_BALL_R=30,FOOTBALL_GOAL_HALF=245,FOOTBALL_CONTACT_R=78,FOOTBALL_MAX_BALL_SPEED=1050;
  const miniCamera={x:MINI_ARENA.x,y:MINI_ARENA.y,zoom:.46,last:performance.now()};
  const MINI_CONFIG={
    football_3v3:{label:'МИНИ-ФУТБОЛ 3×3',desc:'6 игроков · 2:30 · до 5 голов',hub:'football'},
    football_5v5:{label:'МИНИ-ФУТБОЛ 5×5',desc:'10 игроков · 3:00 · большая командная игра',hub:'football'},
    checkpoint:{label:'CHECKPOINT RUSH',desc:'2–8 игроков · 1:45 · собирайте контрольные точки',hub:'checkpoint'},
    hot_potato:{label:'HOT POTATO',desc:'2–8 игроков · 1:40 · передайте бомбу касанием',hub:'hot_potato'},
    drag:{label:'MEDIA DRAG',desc:'2–8 игроков · серверный финиш',hub:'football'}
  };

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
  const fmtCR=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('ru-RU')+' CR';
  const walletBalance=()=>Math.max(0,Math.floor(Number(loadSave().credits)||0));
  function renderDragBetPanel(){
    const balance=walletBalance(),balanceEl=$('freeDragBetBalance'),potEl=$('freeDragBetPot'),join=$('freeDragBetJoin');if(balanceEl)balanceEl.textContent=fmtCR(balance);
    let selected=DRAG_WAGER_OPTIONS.includes(Number(state.dragWager))?Number(state.dragWager):0;
    if(selected>balance)selected=0;state.dragWager=selected;
    document.querySelectorAll('#freeDragBetChoices [data-wager]').forEach(button=>{const amount=Number(button.dataset.wager)||0,disabled=amount>balance;button.disabled=disabled;button.classList.toggle('selected',amount===selected);button.setAttribute('aria-pressed',String(amount===selected));});
    if(potEl)potEl.textContent=selected>0?`${fmtCR(selected)} × 2 = ${fmtCR(selected*2)}`:'БЕЗ СТАВКИ · ТРЕНИРОВОЧНЫЙ DRAG';
    if(join){join.disabled=selected>balance;join.textContent=selected>0?`В ОЧЕРЕДЬ · ${fmtCR(selected)}`:'В ОЧЕРЕДЬ · БЕЗ СТАВКИ';}
  }
  function toggleDragBetPanel(force){
    const panel=$('freeDragBetPanel');if(!panel)return;const show=force??panel.classList.contains('hidden');panel.classList.toggle('hidden',!show);panel.setAttribute('aria-hidden',String(!show));
    if(show){toggleChat(false);toggleMap(false);toggleLevels(false);toggleMinigamePanel(false);try{const saved=Number(localStorage.getItem('velocityApex.freeDragWager')||0);if(DRAG_WAGER_OPTIONS.includes(saved))state.dragWager=saved;}catch{}renderDragBetPanel();}
  }
  async function joinDragQueue(){
    if(state.drag||state.dragQueued)return;let wager=Number(state.dragWager)||0;if(!DRAG_WAGER_OPTIONS.includes(wager))wager=0;
    if(wager>0&&!window.VelocityAccount?.authenticated){setBanner('DRAG · СТАВКИ ДОСТУПНЫ ТОЛЬКО В АККАУНТЕ',3200);return;}
    if(wager>walletBalance()){setBanner(`DRAG · НЕДОСТАТОЧНО CR · БАЛАНС ${fmtCR(walletBalance())}`,3200);renderDragBetPanel();return;}
    if(wager>0){await window.VelocityAccount?.flushSave?.();await window.VelocityAccount?.refreshCloud?.();if(wager>walletBalance()){setBanner(`DRAG · НЕДОСТАТОЧНО CR · БАЛАНС ${fmtCR(walletBalance())}`,3200);renderDragBetPanel();return;}}
    state.dragWager=wager;state.dragQueued=true;try{localStorage.setItem('velocityApex.freeDragWager',String(wager));}catch{}
    if(!send({type:'activity_join',v:1,activity:'drag',wager})){state.dragQueued=false;return;}toggleDragBetPanel(false);setBanner(wager?`DRAG · СТАВКА ${fmtCR(wager)} · ИЩЕМ СОПЕРНИКА`:'DRAG · ИЩЕМ СОПЕРНИКА',2600);
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


  function minigameTitle(key){return MINI_CONFIG[key]?.label||'APEX MINI GAME';}
  function minigameKind(key){return String(key||'').startsWith('football')?'football':key;}
  function teamColorId(team){return team==='red'?'velocity-red':team==='blue'?'electric-blue':'stock';}
  function activeMinigameForPlayer(id){
    return (state.room?.activities?.minigames||[]).find(e=>e?.participants?.includes(id)&&['waiting','countdown','running'].includes(e.status))||null;
  }
  function renderMinigameHud(){
    const hud=$('freeMinigameHud'),e=state.minigame;if(!hud)return;const active=!!e&&['waiting','countdown','running'].includes(e.status);
    roam.classList.toggle('minigame-active',!!e);
    if(!e){hud.classList.add('hidden');hud.classList.remove('result','football-compact','minigame-compact','minigame-expanded');roam.classList.remove('football-playing','minigame-playing');state.minigameHudExpanded=false;state.minigameHudAutoCollapseAt=0;return;}
    hud.classList.remove('hidden');hud.classList.toggle('result',e.status==='result');$('freeMinigameTitle').textContent=minigameTitle(e.gameKey);
    const score=$('freeMinigameScore'),info=$('freeMinigameInfo'),root=$('freeMinigameStandings');score.replaceChildren();root.replaceChildren();
    const kind=minigameKind(e.gameKey),compactPlaying=e.status==='running',footballCompact=kind==='football'&&compactPlaying,rows=(e.results||e.standings||[]).slice(0,8);
    const autoIntro=compactPlaying&&performance.now()<(state.minigameHudAutoCollapseAt||0),expanded=!compactPlaying||state.minigameHudExpanded||autoIntro;
    hud.classList.toggle('minigame-compact',compactPlaying);hud.classList.toggle('minigame-expanded',expanded);roam.classList.toggle('minigame-playing',compactPlaying);hud.classList.toggle('football-compact',footballCompact);roam.classList.toggle('football-playing',footballCompact);
    const toggle=$('freeMinigameToggle');if(toggle){toggle.classList.toggle('hidden',!compactPlaying);toggle.textContent=expanded?'⌃':'⌄';toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'Скрыть таблицу мини-игры':'Показать таблицу мини-игры');}
    if(kind==='football'){
      score.innerHTML=`<span class="red">RED ${Number(e.score?.red)||0}</span><b>:</b><span class="blue">${Number(e.score?.blue)||0} BLUE</span>`;
      const mineTeam=e.teamByPlayer?.[state.playerId];info.textContent=e.status==='waiting'||e.status==='countdown'?`СОБРАНО ${e.participants?.length||0} / ${e.maxPlayers||e.minPlayers||0}`:`ВАША КОМАНДА · ${mineTeam==='red'?'КРАСНЫЕ':'СИНИЕ'}`;
    }else if(kind==='checkpoint'){
      const myScore=Number(e.points?.[state.playerId]??rows.find(r=>r.id===state.playerId)?.score)||0,target=(Number(e.checkpointIndex)||0)+1;
      score.textContent=`CHECKPOINT #${target} · ${myScore} ВЗЯТО`;info.textContent=e.checkpoint?'ДОЕДЬТЕ ДО СВЕТЯЩЕЙСЯ ТОЧКИ':`СОБИРАЕМ ИГРОКОВ · ${e.participants?.length||0}/${e.minPlayers||2}`;
    }else{
      const holder=e.bombHolderId,holderName=e.names?.[holder]||state.room?.players?.find(p=>p.id===holder)?.name||'—';
      score.textContent=`💣 ${holderName}`;info.textContent=holder===state.playerId?'БОМБА У ВАС · КОСНИТЕСЬ ДРУГОЙ МАШИНЫ':'НЕ ДАЙТЕ ПЕРЕДАТЬ БОМБУ ВАМ';
    }
    if(!rows.length){
      for(const id of (e.participants||[]).slice(0,8)){const r={id,name:e.names?.[id]||state.room?.players?.find(p=>p.id===id)?.name||'RACER',level:e.levels?.[id]||0,team:e.teamByPlayer?.[id],score:e.points?.[id]??e.strikes?.[id]??0};rows.push(r);}
    }
    rows.forEach((r,i)=>{
      const row=document.createElement('div');row.className='free-minigame-row'+(r.id===state.playerId?' me':'');
      const lead=document.createElement('span');if(kind==='football'){lead.className='team-dot '+(r.team||e.teamByPlayer?.[r.id]||'');}else lead.textContent=String(r.place||i+1);
      const name=document.createElement('strong');appendPlayerName(name,r.name||'RACER',false,Number(r.level)||0,r.adminLevel??null);
      const val=document.createElement('span');if(kind==='football')val.textContent=(r.team||e.teamByPlayer?.[r.id]||'').toUpperCase();else if(kind==='hot_potato')val.textContent=`${Number(r.strikes??r.score)||0} 💥`;else val.textContent=String(Number(r.score)||0);
      row.append(lead,name,val);root.appendChild(row);
    });
    const leave=$('freeMinigameLeave');if(leave)leave.classList.toggle('hidden',!active);
    const ownerStart=$('freeMinigameOwnerStart'),me=ownPlayer(),ownerCanStart=!!me?.owner&&active&&['waiting','countdown'].includes(e.status);
    if(ownerStart){ownerStart.classList.toggle('hidden',!ownerCanStart);ownerStart.disabled=!ownerCanStart;ownerStart.textContent=e.status==='countdown'?'OWNER · НАЧАТЬ СЕЙЧАС':'OWNER · ЗАПУСТИТЬ БЕЗ ОЖИДАНИЯ';}
  }
  function updateMinigameClock(now){
    const e=state.minigame,hud=$('freeMinigameHud');if(!e||!hud||hud.classList.contains('hidden'))return;const phase=$('freeMinigamePhase'),clock=$('freeMinigameTime');
    if(e.status==='waiting'){phase.textContent='WAITING';clock.textContent=`${e.participants?.length||1}/${e.minPlayers||2}`;return;}
    if(e.status==='countdown'){phase.textContent='СТАРТ ЧЕРЕЗ';clock.textContent=String(Math.max(1,Math.ceil(((e.startAt||now)-now)/1000)));return;}
    if(e.status==='result'){phase.textContent='FINISH';clock.textContent='00:00';return;}
    if(minigameKind(e.gameKey)==='hot_potato'&&e.bombHolderId===state.playerId&&e.bombDeadline){phase.textContent='💣 ВЗРЫВ ЧЕРЕЗ';clock.textContent=(Math.max(0,e.bombDeadline-now)/1000).toFixed(1);return;}
    phase.textContent='TIME';clock.textContent=formatEventTime(Math.max(0,(e.endAt||now)-now));
  }
  function openMinigamePanel(hub){
    state.minigameHub=hub;const panel=$('freeMinigamePanel'),root=$('freeMinigameChoices');if(!panel||!root)return;
    const titles={football:'APEX STADIUM',checkpoint:'RUSH CENTER',hot_potato:'BOMB ARENA'},texts={football:'Командный автомобильный футбол. Мяч синхронизируется сервером, а машины автоматически получают цвета команд.',checkpoint:'Аркадная гонка за контрольными точками. Новая цель появляется сразу после захвата предыдущей.',hot_potato:'Передавайте бомбу касанием другой машины. Каждые 12 секунд держатель получает взрывной штраф.'};
    $('freeMinigamePanelTitle').textContent=titles[hub]||'МИНИ-ИГРЫ';$('freeMinigamePanelText').textContent=texts[hub]||'';root.replaceChildren();
    const keys=Object.keys(MINI_CONFIG).filter(k=>MINI_CONFIG[k].hub===hub);for(const key of keys){const cfg=MINI_CONFIG[key],b=document.createElement('button');b.type='button';b.className='free-minigame-choice';b.innerHTML=`<b>${cfg.label}</b><span>${cfg.desc}</span><em>ВСТАТЬ В ОЧЕРЕДЬ</em>`;b.onclick=()=>{state.activityPending=true;if(send({type:'activity_join',v:1,activity:'minigame',gameKey:key})){toggleMinigamePanel(false);setBanner(`${cfg.label} · РЕГИСТРАЦИЯ`,2000);}else state.activityPending=false;};root.appendChild(b);}
    panel.classList.remove('hidden');panel.setAttribute('aria-hidden','false');toggleChat(false);toggleMap(false);toggleLevels(false);
  }
  function toggleMinigamePanel(force){
    const panel=$('freeMinigamePanel');if(!panel)return;const show=force??panel.classList.contains('hidden');panel.classList.toggle('hidden',!show);panel.setAttribute('aria-hidden',String(!show));if(!show)state.minigameHub=null;
  }
  function setOwnTeamStyle(team){
    if(!R.Car||!car.setCustomization)return;const color=teamColorId(team);car.setCustomization(R.getCarStyleByIds?.(color,'none'));
  }
  function restoreOwnStyle(){refreshPlayerLoadout();}
  function enterMinigameArena(m){
    if(!state.minigameReturn)state.minigameReturn={x:car.x,y:car.y,angle:car.angle};
    state.minigame={...(state.minigame||{}),...m,status:'running'};state.minigameHudExpanded=false;state.minigameHudAutoCollapseAt=performance.now()+1400;const spawn=m.spawns?.[state.playerId];if(spawn){car.x=spawn.x;car.y=spawn.y;car.angle=spawn.angle;car.vx=car.vy=car.speed=0;car.yawRate=0;}miniCamera.x=car.x;miniCamera.y=car.y;miniCamera.zoom=.46;miniCamera.last=performance.now();
    if(minigameKind(m.gameKey)==='football')setOwnTeamStyle(m.teamByPlayer?.[state.playerId]);else restoreOwnStyle();
    for(const id of m.participants||[]){if(id===state.playerId)continue;const r=state.remotes.get(id),sp=m.spawns?.[id];if(r&&sp){r.x=sp.x;r.y=sp.y;r.angle=sp.angle;r.snapshots=[];r.target={...sp,vx:0,vy:0,speed:0,sampleTime:Date.now()+state.serverOffset};pushRemoteSnapshot(r,r.target,r.target.sampleTime);}}
    renderMinigameHud();toggleChat(false);toggleMap(false);toggleLevels(false);pingServer();
  }
  function leaveMinigameArena(){
    const back=state.minigameReturn;state.minigame=null;state.activityPending=false;state.minigameReturn=null;state.minigameHudExpanded=false;state.minigameHudAutoCollapseAt=0;roam.classList.remove('minigame-active');renderMinigameHud();restoreOwnStyle();
    if(back){car.x=back.x;car.y=back.y;car.angle=back.angle;car.vx=car.vy=car.speed=0;car.yawRate=0;sendFreeState(true);}
  }
  function resolveMinigameMotion(obj){
    const pad=42,a=MINI_ARENA;if(obj.x<a.left+pad){obj.x=a.left+pad;obj.vx=Math.abs(obj.vx||0)*.25;}if(obj.x>a.right-pad){obj.x=a.right-pad;obj.vx=-Math.abs(obj.vx||0)*.25;}if(obj.y<a.top+pad){obj.y=a.top+pad;obj.vy=Math.abs(obj.vy||0)*.25;}if(obj.y>a.bottom-pad){obj.y=a.bottom-pad;obj.vy=-Math.abs(obj.vy||0)*.25;}obj.speed=Math.hypot(obj.vx||0,obj.vy||0);
  }
  function minigameRemoteVisual(r,id){
    const team=state.minigame?.teamByPlayer?.[id];if(minigameKind(state.minigame?.gameKey)!=='football'||!team)return r.visual;
    const key=`${r.liveryId}|${r.effectId}|${team}`;if(r._miniVisualKey!==key||!r._miniVisual){r._miniVisualKey=key;r._miniVisual=createVisual(r.liveryId,r.effectId,teamColorId(team),'none');}return r._miniVisual;
  }
  function drawMinigameEntrance(c,z,color,label){
    // The event-pad ring is the authoritative radius; this label adds no second ring.
    c.save();c.translate(z.x,z.y);c.globalAlpha=.9;c.fillStyle='rgba(11,27,30,.74)';roundRect(c,-43,-10,86,20,7,true,false);c.fillStyle=color;c.font='900 9px system-ui';c.textAlign='center';c.fillText('PLAY · '+label,0,3);c.restore();
  }
  function projectMinigameBall(e,serverNow=Date.now()+state.serverOffset){
    const b=e?.ball;if(!b)return null;const syncAt=Number(e._ballServerTime)||Number(e.serverTime)||serverNow,age=clamp((serverNow-syncAt)/1000,0,.32),drag=Math.exp(-.58*age),travel=age>0?(1-drag)/.58:0;
    let x=(Number(b.x)||MINI_ARENA.x)+(Number(b.vx)||0)*travel,y=(Number(b.y)||MINI_ARENA.y)+(Number(b.vy)||0)*travel,vx=(Number(b.vx)||0)*drag,vy=(Number(b.vy)||0)*drag;const a=MINI_ARENA,r=FOOTBALL_BALL_R,goalClear=FOOTBALL_GOAL_HALF-r*.45;
    if(y<a.top+r){y=a.top+r;vy=Math.abs(vy)*.78;}else if(y>a.bottom-r){y=a.bottom-r;vy=-Math.abs(vy)*.78;}
    if(Math.abs(y-a.y)>goalClear){if(x<a.left+r){x=a.left+r;vx=Math.abs(vx)*.78;}else if(x>a.right-r){x=a.right-r;vx=-Math.abs(vx)*.78;}}
    return {x,y,vx,vy,seq:Number(b.seq)||0,lastTouchId:b.lastTouchId||null};
  }
  function acceptFootballBall(e,ball,serverTime){
    if(!ball)return false;
    const stamp=Number(serverTime)||0;
    if(stamp&&stamp<(Number(e._ballServerTime)||0))return false;
    e.ball=ball;e._ballServerTime=stamp||Date.now()+state.serverOffset;return true;
  }
  function advanceFootballBall(e,dt,serverNow){
    const target=projectMinigameBall(e,serverNow);if(!target)return;
    let b=e._ballPred;
    if(!b){b=e._ballPred={...target};return;}
    // Integrate every display frame. Network snapshots correct drift gradually; they never
    // replace the ball under a driver's wheels or reset its motion every 40–50 ms.
    const step=clamp(dt,0,.05),drag=Math.exp(-.58*step),travel=step?(1-drag)/.58:0;
    b.x+=b.vx*travel;b.y+=b.vy*travel;b.vx*=drag;b.vy*=drag;
    const a=MINI_ARENA,r=FOOTBALL_BALL_R,goalClear=FOOTBALL_GOAL_HALF-r*.45;
    if(b.y<a.top+r){b.y=a.top+r;b.vy=Math.abs(b.vy)*.78;}else if(b.y>a.bottom-r){b.y=a.bottom-r;b.vy=-Math.abs(b.vy)*.78;}
    if(Math.abs(b.y-a.y)>goalClear){if(b.x<a.left+r){b.x=a.left+r;b.vx=Math.abs(b.vx)*.78;}else if(b.x>a.right-r){b.x=a.right-r;b.vx=-Math.abs(b.vx)*.78;}}
    const local=e.status==='running'&&!state.spectator;
    const dx=b.x-car.x,dy=b.y-car.y,d=Math.hypot(dx,dy);
    const touching=local&&Number.isFinite(d)&&d>0&&d<FOOTBALL_CONTACT_R+7;
    if(touching){
      const nx=dx/d,ny=dy/d,cvx=Number(car.vx)||0,cvy=Number(car.vy)||0,closing=cvx*nx+cvy*ny-b.vx*nx-b.vy*ny;
      if(closing>4||d<FOOTBALL_CONTACT_R-1){
        if(closing>4){const speed=Math.hypot(cvx,cvy),drive=Math.max(0,Math.cos(car.angle)*nx+Math.sin(car.angle)*ny),impulse=closing*1.02+(closing>12?drive*Math.min(25,speed*.06):0);b.vx+=nx*impulse;b.vy+=ny*impulse;}
        if(d<FOOTBALL_CONTACT_R+1){b.x=car.x+nx*(FOOTBALL_CONTACT_R+1);b.y=car.y+ny*(FOOTBALL_CONTACT_R+1);}
        const ballSpeed=Math.hypot(b.vx,b.vy);if(ballSpeed>FOOTBALL_MAX_BALL_SPEED){b.vx*=FOOTBALL_MAX_BALL_SPEED/ballSpeed;b.vy*=FOOTBALL_MAX_BALL_SPEED/ballSpeed;}
        b.lastTouchId=state.playerId;
      }
      if(serverNow-state.lastFootballTouchAt>=40){state.lastFootballTouchAt=serverNow;send({type:'football_touch',v:1,state:{x:car.x,y:car.y,vx:car.vx,vy:car.vy,angle:car.angle,speed:car.speed,sampleTime:Math.round(serverNow)}});}
    }
    const age=serverNow-(Number(e._ballServerTime)||0);
    if(age>=0&&age<280&&!touching){
      const error=Math.hypot(target.x-b.x,target.y-b.y);
      if(error>480){Object.assign(b,target);return;}
      const rate=9,alpha=1-Math.exp(-rate*step);
      b.x+=(target.x-b.x)*alpha;b.y+=(target.y-b.y)*alpha;
      const velocityAlpha=1-Math.exp(-7*step);
      b.vx+=(target.vx-b.vx)*velocityAlpha;b.vy+=(target.vy-b.vy)*velocityAlpha;
    }
  }
  function minigameBallVisual(e){return e._ballPred||projectMinigameBall(e);}
  function minigameObjective(e,kind){
    if(kind==='football')return minigameBallVisual(e);
    if(kind==='checkpoint'&&e?.checkpoint)return {x:e.checkpoint.x,y:e.checkpoint.y};
    if(kind==='hot_potato'&&e?.bombHolderId&&e.bombHolderId!==state.playerId){const r=state.remotes.get(e.bombHolderId);if(r)return {x:r.x,y:r.y};}
    return null;
  }
  function updateMinigameCamera(e,kind){
    const t=performance.now(),dt=clamp((t-(miniCamera.last||t))/1000,0,.05);miniCamera.last=t;if(state.spectator){const target=state.spectatorTarget?state.remotes.get(state.spectatorTarget):null,desiredX=target?.x??MINI_ARENA.x,desiredY=target?.y??MINI_ARENA.y,overview=Math.min((W-40)/(MINI_ARENA.right-MINI_ARENA.left+220),(H-120)/(MINI_ARENA.bottom-MINI_ARENA.top+220)),desiredZoom=target?clamp(.62,.42,.68):clamp(overview,.28,.62),a=1-Math.exp(-6*dt);miniCamera.x+=(desiredX-miniCamera.x)*a;miniCamera.y+=(desiredY-miniCamera.y)*a;miniCamera.zoom+=(desiredZoom-miniCamera.zoom)*a;return{x:miniCamera.x,y:miniCamera.y,zoom:miniCamera.zoom,anchorX:W*.5,anchorY:H*.5};}
    const speed=Math.hypot(Number(car.vx)||0,Number(car.vy)||0),look=clamp(speed*.18,0,105),fx=Math.cos(Number(car.angle)||0),fy=Math.sin(Number(car.angle)||0);
    const baseX=car.x+fx*look,baseY=car.y+fy*look,objective=minigameObjective(e,kind);
    let desiredX=baseX,desiredY=baseY,desiredZoom=(W>H&&H<=700)?.57:.62;
    if(objective){
      const dx=objective.x-car.x,dy=objective.y-car.y,d=Math.hypot(dx,dy),weight=kind==='football'?clamp(.28+d/9000,.28,.42):kind==='checkpoint'?clamp(.18+d/12000,.18,.31):.18;
      desiredX=baseX+(objective.x-baseX)*weight;desiredY=baseY+(objective.y-baseY)*weight;
      const safeW=Math.max(620,W-270),safeH=Math.max(330,H-165),fitX=safeW/(Math.abs(dx)+610),fitY=safeH/(Math.abs(dy)+520);
      desiredZoom=Math.min(desiredZoom,fitX,fitY);
    }
    desiredZoom=clamp(desiredZoom,(W>H&&H<=700)?.31:.34,(W>H&&H<=700)?.60:.68);
    const moveAlpha=1-Math.exp(-6.5*dt),zoomAlpha=1-Math.exp(-5*dt);miniCamera.x+=(desiredX-miniCamera.x)*moveAlpha;miniCamera.y+=(desiredY-miniCamera.y)*moveAlpha;miniCamera.zoom+=(desiredZoom-miniCamera.zoom)*zoomAlpha;
    return {x:miniCamera.x,y:miniCamera.y,zoom:miniCamera.zoom,anchorX:W*.5,anchorY:H*.46};
  }
  function drawMinigameArena(){
    const e=state.minigame,kind=minigameKind(e?.gameKey),a=MINI_ARENA;ctx.fillStyle='#071316';ctx.fillRect(0,0,W,H);
    // V43: safe-zone camera follows the car and gently biases toward the active objective.
    // It keeps gameplay out from under the top HUD and bottom touch controls instead of showing the entire arena at all times.
    const cam=updateMinigameCamera(e,kind),zoom=cam.zoom;ctx.save();ctx.translate(cam.anchorX,cam.anchorY);ctx.scale(zoom,zoom);ctx.translate(-cam.x,-cam.y);
    if(kind==='football'){
      // Stadium apron and stands make the arena read as a separate polished location.
      ctx.fillStyle='#10191b';ctx.fillRect(a.left-170,a.top-150,a.right-a.left+340,a.bottom-a.top+300);
      ctx.fillStyle='#1c292b';for(let x=a.left-135;x<a.right+135;x+=105){ctx.fillRect(x,a.top-122,76,72);ctx.fillRect(x,a.bottom+50,76,72);}for(let y=a.top+10;y<a.bottom;y+=110){ctx.fillRect(a.left-142,y,78,76);ctx.fillRect(a.right+64,y,78,76);}
      ctx.fillStyle='#244f37';ctx.fillRect(a.left,a.top,a.right-a.left,a.bottom-a.top);for(let x=a.left;x<a.right;x+=250){ctx.fillStyle=((x-a.left)/250)%2?'#2b5b3e':'#27543a';ctx.fillRect(x,a.top,250,a.bottom-a.top);}ctx.strokeStyle='#e9f0dd';ctx.lineWidth=8;ctx.strokeRect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.beginPath();ctx.moveTo(a.x,a.top);ctx.lineTo(a.x,a.bottom);ctx.stroke();ctx.beginPath();ctx.arc(a.x,a.y,180,0,TAU);ctx.stroke();ctx.fillStyle='#e9f0dd';ctx.beginPath();ctx.arc(a.x,a.y,11,0,TAU);ctx.fill();
      // Penalty boxes + goal frames/nets.
      ctx.strokeStyle='#e9f0dd';ctx.lineWidth=7;ctx.strokeRect(a.left,a.y-330,260,660);ctx.strokeRect(a.right-260,a.y-330,260,660);ctx.strokeRect(a.left-90,a.y-245,90,490);ctx.strokeRect(a.right,a.y-245,90,490);
      ctx.strokeStyle='rgba(230,242,235,.34)';ctx.lineWidth=3;for(let y=a.y-225;y<=a.y+225;y+=42){ctx.beginPath();ctx.moveTo(a.left-88,y);ctx.lineTo(a.left,y);ctx.stroke();ctx.beginPath();ctx.moveTo(a.right,y);ctx.lineTo(a.right+88,y);ctx.stroke();}for(let x=18;x<88;x+=18){ctx.beginPath();ctx.moveTo(a.left-x,a.y-242);ctx.lineTo(a.left-x,a.y+242);ctx.stroke();ctx.beginPath();ctx.moveTo(a.right+x,a.y-242);ctx.lineTo(a.right+x,a.y+242);ctx.stroke();}
      const ball=minigameBallVisual(e);if(ball){ctx.save();ctx.shadowColor='rgba(255,255,255,.82)';ctx.shadowBlur=18;ctx.fillStyle='#f4f3e8';ctx.beginPath();ctx.arc(ball.x,ball.y,30,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#25323a';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#26343a';for(let i=0;i<5;i++){const q=i*TAU/5-Math.PI/2;ctx.beginPath();ctx.arc(ball.x+Math.cos(q)*13,ball.y+Math.sin(q)*13,5,0,TAU);ctx.fill();}ctx.restore();}
    }else{
      const grad=ctx.createLinearGradient(a.left,a.top,a.right,a.bottom);grad.addColorStop(0,kind==='checkpoint'?'#132838':'#351a23');grad.addColorStop(1,'#081417');ctx.fillStyle=grad;ctx.fillRect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=6;ctx.strokeRect(a.left,a.top,a.right-a.left,a.bottom-a.top);for(let x=a.left+150;x<a.right;x+=220)for(let y=a.top+130;y<a.bottom;y+=220){ctx.fillStyle='rgba(255,255,255,.025)';ctx.fillRect(x,y,80,80);}
      if(kind==='checkpoint'){
        ctx.strokeStyle='rgba(126,255,140,.12)';ctx.lineWidth=5;ctx.setLineDash([18,24]);ctx.beginPath();const route=[[1550,980],[2500,860],[3450,980],[3480,1500],[3450,2020],[2500,2140],[1550,2020],[1520,1500]];route.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
        if(e.checkpoint){const pulse=1+Math.sin(performance.now()/150)*.12;ctx.shadowColor='#7eff8c';ctx.shadowBlur=24;ctx.strokeStyle='#7eff8c';ctx.lineWidth=14;ctx.beginPath();ctx.arc(e.checkpoint.x,e.checkpoint.y,72*pulse,0,TAU);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#c8ffcb';ctx.font='950 24px system-ui';ctx.textAlign='center';ctx.fillText('CHECKPOINT',e.checkpoint.x,e.checkpoint.y-95);}
      }else{
        const pulse=.5+.5*Math.sin(performance.now()/180);ctx.strokeStyle=`rgba(255,181,72,${.25+pulse*.35})`;ctx.lineWidth=12;ctx.beginPath();ctx.arc(a.x,a.y,320+pulse*22,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(255,92,92,.18)';ctx.lineWidth=5;for(let r=520;r<=900;r+=190){ctx.beginPath();ctx.arc(a.x,a.y,r,0,TAU);ctx.stroke();}
      }
    }
    const ids=new Set(e.participants||[]);for(const [id,r] of state.remotes){if(!ids.has(id))continue;const holder=kind==='hot_potato'&&e.bombHolderId===id;drawVisualCar(ctx,minigameRemoteVisual(r,id),r.x,r.y,r.angle,r.name||'RACER',false,colorFor(id),r.owner,r.level||0,r.adminLevel||0);if(holder){ctx.fillStyle='#ffb548';ctx.font='32px system-ui';ctx.textAlign='center';ctx.fillText('💣',r.x,r.y-76);}}
    const me=ownPlayer(),holder=kind==='hot_potato'&&e.bombHolderId===state.playerId;if(!state.spectator)drawVisualCar(ctx,state.playerVisual,car.x,car.y,car.angle,me?.name||accountName(),true,'#a9ff5a',me?.owner===true,me?.level??state.progress.level??0,me?.adminLevel||0);if(holder&&!state.spectator){ctx.fillStyle='#ffb548';ctx.font='34px system-ui';ctx.textAlign='center';ctx.fillText('💣',car.x,car.y-80);}
    ctx.restore();
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

  function ensureFreeGarage(){
    let modal=$('freeGarageModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='freeGarageModal';modal.className='free-garage-modal hidden';modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`<section class="free-garage-card glass" role="dialog" aria-modal="true" aria-labelledby="freeGarageTitle"><header><div><div class="eyebrow">APEX BAY / LIVE GARAGE</div><h2 id="freeGarageTitle">ГАРАЖ</h2><p>Выберите автомобиль. Сервер останется подключён.</p></div><button id="freeGarageClose" type="button" class="secondary-btn">ЗАКРЫТЬ</button></header><div id="freeGarageList" class="free-garage-list"></div><div id="freeGarageStatus" class="free-garage-status">Машина меняется без выхода с сервера.</div></section>`;
    document.body.appendChild(modal);$('freeGarageClose').addEventListener('click',closeFreeGarage);modal.addEventListener('click',e=>{if(e.target===modal)closeFreeGarage();});$('freeGarageList').addEventListener('click',e=>{const b=e.target.closest('[data-free-garage-car]');if(b&&!b.disabled)selectFreeGarageCar(b.dataset.freeGarageCar);});return modal;
  }
  function renderFreeGarage(){
    const modal=ensureFreeGarage(),list=$('freeGarageList'),save=loadSave(),active=state.loadout?.liveryId||save.selectedLivery;
    list.replaceChildren();for(const id of save.ownedLiveries||[]){const item=R.LIVERIES?.[id];if(!item||!R.carAvailable(id))continue;const card=document.createElement('button');card.type='button';card.className='free-garage-car'+(id===active?' selected':'');card.dataset.freeGarageCar=id;card.disabled=state.garageBusy;const src=item.sprite?.thumbnail||item.sprite?.src||'';card.innerHTML=`${src?`<img src="/${String(src).replace(/^\/?/,'')}" alt="">`:''}<span><strong>${item.name}</strong><small>${String(item.category||'basic').toUpperCase()}</small></span><b>${id===active?'ВЫБРАНО':'ВЫБРАТЬ'}</b>`;list.appendChild(card);}modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
  }
  function openFreeGarage(){if(!window.VelocityAccount?.authenticated){window.VelocityAccount?.requestAuth?.();return;}if(state.drag||state.activityPending||state.liveEvent||state.minigame)return;state.garageOpen=true;clearInputs();toggleChat(false);toggleMap(false);renderFreeGarage();}
  function closeFreeGarage(){const modal=$('freeGarageModal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}state.garageOpen=false;state.garageBusy=false;}
  async function selectFreeGarageCar(id){
    if(state.garageBusy)return;const save=loadSave();if(!save.ownedLiveries?.includes(id)||!R.carAvailable(id))return;state.garageBusy=true;const status=$('freeGarageStatus');if(status)status.textContent='ПРОВЕРКА МАШИНЫ НА СЕРВЕРЕ…';
    const style=R.getCarCustomization?.(save,id)||{colorId:'stock',vinylId:'none'},requested={liveryId:id,effectId:save.selectedEffect||'standard',colorId:style.colorId,vinylId:style.vinylId};
    const ok=send({type:'loadout_update',v:1,loadout:requested});if(!ok){state.garageBusy=false;if(status)status.textContent='Нет соединения с сервером.';renderFreeGarage();}
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
      meta.innerHTML=`<span>ГОРОД · LIVE</span><span>DRAG · DRIFT · MINI GAMES</span><span>РЕКОРД ${Math.floor(s.records?.speed||0)} KM/H</span>`;
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
    if(!window.VelocityAccount?.authenticated){window.VelocityAccount?.requestAuth?.('Свободный режим доступен только после входа или регистрации.');return;}
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
      state.server={...server,apiBase:`/api/free/${server.id}`,media:false};
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

  async function joinMediaEvent(code,{spectator=false}={}){
    refreshPlayerLoadout();const clean=String(code||'').toUpperCase().replace(/\s+/g,'');if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(clean)){const e=new Error('INVALID_CODE');e.code='INVALID_CODE';throw e;}
    const d=await jsonFetch(`/api/media/events/${clean}/join`,{method:'POST',body:JSON.stringify({spectator:!!spectator,loadout:{liveryId:state.loadout.liveryId,effectId:state.loadout.effectId,colorId:state.loadout.colorId,vinylId:state.loadout.vinylId}})});
    state.server={id:clean,name:`MEDIA EVENT · ${clean}`,apiBase:`/api/media/events/${clean}`,media:true};state.playerId=d.playerId;state.token=d.sessionToken;state.room=d.room;state.mediaEvent=d.room?.mediaEvent||null;state.spectator=!!d.room?.players?.find(p=>p.id===d.playerId)?.spectator;state.spectatorTarget=null;
    window.VelocityOnline?.client?.leave?.();$('online')?.classList.add('hidden');browser.classList.add('hidden');$('menu')?.classList.add('hidden');connect();startRoam();return d;
  }

  function stopClockSync(){clearInterval(state.pingTimer);state.pingTimer=0;}
  function stopReconnect(){clearTimeout(state.reconnectTimer);state.reconnectTimer=0;}
  function pingServer(){if(state.ws?.readyState===WebSocket.OPEN)send({type:'ping',v:1,clientTime:Date.now()});}
  function startClockSync(){stopClockSync();pingServer();state.pingTimer=setInterval(pingServer,1800);}
  function reconnect(){
    if(!state.active||state.intentionalClose)return;const attempt=state.reconnectAttempts++;if(attempt>=RECONNECT_DELAYS.length){setBanner('СЕРВЕР НЕДОСТУПЕН · ВОЗВРАТ В МЕНЮ',2600);setTimeout(()=>{if(state.active)leave(false);},700);return;}
    stopReconnect();const delay=RECONNECT_DELAYS[attempt];setBanner(`ПЕРЕПОДКЛЮЧЕНИЕ · ${attempt+1}/${RECONNECT_DELAYS.length}`,Math.max(1200,delay+650));state.reconnectTimer=setTimeout(()=>{state.reconnectTimer=0;if(state.active&&!state.intentionalClose)connect(true);},delay);
  }
  function connect(isRetry=false){
    stopClockSync();stopReconnect();const old=state.ws;state.ws=null;try{old?.close();}catch{}
    state.intentionalClose=false;const proto=location.protocol==='https:'?'wss:':'ws:';
    const base=state.server?.apiBase||`/api/free/${state.server.id}`;const ws=state.ws=new WebSocket(`${proto}//${location.host}${base}/ws?playerId=${encodeURIComponent(state.playerId)}&token=${encodeURIComponent(state.token)}`);
    ws.onopen=()=>{if(ws===state.ws)startClockSync();};
    ws.onmessage=e=>onMessage(e.data);
    ws.onerror=()=>{};
    ws.onclose=e=>{if(ws!==state.ws)return;stopClockSync();state.ws=null;if(e.code===4003){state.intentionalClose=true;leave(false);alert(state.lastAdminKickReason||'Вы отключены владельцем или администрацией.');state.lastAdminKickReason='';return;}if(state.active&&!state.intentionalClose)reconnect();};
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
      if(['ACTIVITY_LOCATION','ACTIVITY_BUSY','ACTIVITY_RUNNING','ACTIVITY_FULL','INVALID_WAGER','INSUFFICIENT_CR','DRAG_ACCOUNT_REQUIRED','WAGER_LOCK_FAILED'].includes(m.code)){state.dragQueued=false;state.activityPending=false;renderDragBetPanel();}
      if(['GARAGE_LOCATION','GARAGE_BUSY','CAR_NOT_OWNED','AUTH_REQUIRED'].includes(m.code)){state.garageBusy=false;const gs=$('freeGarageStatus');if(gs)gs.textContent=m.message||m.code;renderFreeGarage();}
      setBanner(m.message||m.code||'ОШИБКА СЕРВЕРА',3000);return;
    }
    if(m.type==='free_hello'){
      state.reconnectAttempts=0;stopReconnect();state.serverOffset=(m.serverTime||Date.now())-Date.now();state.serverOffsetReady=true;
      applyRoom(m.room);pingServer();addSystem('Подключено к '+state.server.name+'.');return;
    }
    if(m.type==='pong'&&Number.isFinite(m.clientTime)&&Number.isFinite(m.serverTime)){
      const recv=Date.now(),rtt=Math.max(0,recv-m.clientTime);if(rtt<1500){const estimate=m.serverTime+rtt*.5,offset=estimate-recv,alpha=!state.serverOffsetReady?1:(rtt<80?.36:rtt<180?.24:.14);state.serverOffset+=(offset-state.serverOffset)*alpha;state.serverOffsetReady=true;state.rtt=state.rtt?state.rtt*.72+rtt*.28:rtt;}if(typeof m.probeId==='string')send({type:'sync_echo',v:1,probeId:m.probeId});return;
    }
    if(m.type==='loadout_updated'){
      state.garageBusy=false;if(m.loadout){const save=loadSave();if(save.ownedLiveries?.includes(m.loadout.liveryId)){save.selectedLivery=m.loadout.liveryId;try{localStorage.setItem('velocityApex.v1',JSON.stringify(save));}catch{}window.VelocityAccount?.queueSave?.(save);}refreshPlayerLoadout();state.loadout={...state.loadout,...m.loadout,livery:R.LIVERIES?.[m.loadout.liveryId]||state.loadout?.livery};if(car.setLoadout){car.setLoadout(m.loadout.liveryId,m.loadout.effectId,'full');car.setCustomization(R.getCarStyleByIds?.(m.loadout.colorId,m.loadout.vinylId));R.applyCarPerformance?.(car,m.loadout.liveryId,save);}}
      if(m.spawn){car.x=Number(m.spawn.x)||GARAGE_VENUE.access.x+GARAGE_VENUE.access.w/2;car.y=Number(m.spawn.y)||535;car.angle=Number.isFinite(m.spawn.angle)?m.spawn.angle:-Math.PI/2;car.vx=car.vy=car.speed=0;car.yawRate=0;}
      closeFreeGarage();setBanner(`ГАРАЖ · ${state.loadout?.livery?.name||'МАШИНА'} ВЫБРАНА`,2600);return;
    }
    if(m.type==='media_event_state'){if(m.room)applyRoom(m.room);else if(m.mediaEvent){state.mediaEvent=m.mediaEvent;renderMediaControl();}return;}
    if(m.type==='media_event_spawn'&&!state.spectator){const sp=m.spawns?.[state.playerId];if(sp){car.x=Number(sp.x)||car.x;car.y=Number(sp.y)||car.y;car.angle=Number.isFinite(sp.angle)?sp.angle:car.angle;car.vx=car.vy=car.speed=0;}return;}
    if(m.type==='media_event_result'){if(state.mediaEvent){state.mediaEvent={...state.mediaEvent,status:'FINISHED',result:m};renderMediaControl();}setBanner(m.draw?'MEDIA EVENT · НИЧЬЯ · ПРИЗ ВОЗВРАЩЁН':`MEDIA EVENT · ЗАВЕРШЁН · ПРИЗ ${fmtCR(m.prize||0)}`,5600);setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),180);return;}
    if(m.type==='media_event_cancelled'){if(state.mediaEvent){state.mediaEvent={...state.mediaEvent,status:'CANCELLED'};renderMediaControl();}setBanner('MEDIA EVENT · ОТМЕНЁН · ПРИЗ ВОЗВРАЩЁН',4200);setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),180);return;}
    if(m.type==='free_room'){applyRoom(m.room);return;}
    if(m.type==='free_state'&&m.playerId!==state.playerId){
      let r=state.remotes.get(m.playerId);
      if(!r){r={x:m.state.x,y:m.state.y,angle:m.state.angle,target:m.state,snapshots:[],name:'RACER',level:0,liveryId:'apexLime',effectId:'standard',visual:createVisual('apexLime','standard')};state.remotes.set(m.playerId,r);}
      pushRemoteSnapshot(r,m.state,m.serverTime);return;
    }
    if(m.type==='free_chat'){addChat(m.name,m.text,m.playerId===state.playerId,m.owner===true,Number(m.level)||0,Number(m.adminLevel)||0,!!m.media);return;}
    if(m.type==='admin_announcement'){addSystem(`ADMIN ${m.adminLevel||''} @${m.by||'SYSTEM'}: ${m.message||''}`);setBanner(`ОБЪЯВЛЕНИЕ · ${m.message||''}`,5200);return;}
    if(m.type==='admin_events_state'){if(state.room)state.room.eventsDisabled=!!m.disabled;if(m.cleared){state.liveEvent=null;state.minigame=null;state.drag=null;state.dragQueued=false;state.activityPending=false;renderEventHud();renderMinigameHud();updateDragHud(Date.now()+state.serverOffset);}setBanner(m.disabled?'ROOT · ИГРОВЫЕ АКТИВНОСТИ ОТКЛЮЧЕНЫ':'ИГРОВЫЕ АКТИВНОСТИ ВКЛЮЧЕНЫ',4200);return;}
    if(m.type==='admin_kick'){state.lastAdminKickReason=m.reason||'Вы отключены администрацией.';return;}

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
      if(state.dragQueued&&(m.wager===undefined||Number(m.wager)===Number(state.dragWager)))setBanner(`DRAG · ${m.wager?`СТАВКА ${fmtCR(m.wager)} · `:''}ОЧЕРЕДЬ ${m.count}/2`,1800);return;
    }
    if(m.type==='drag_queue_joined'){state.dragQueued=true;state.dragWager=Number(m.wager)||0;setBanner(`DRAG · ${state.dragWager?`СТАВКА ${fmtCR(state.dragWager)} · `:''}ОЖИДАЕМ СОПЕРНИКА`,2200);return;}
    if(m.type==='drag_queue_left'){state.dragQueued=false;setBanner('DRAG · ВЫ ВЫШЛИ ИЗ ОЧЕРЕДИ',1800);return;}
    if(m.type==='minigame_lobby'&&(m.participants?.includes(state.playerId)||state.spectator&&state.mediaEvent)){
      state.activityPending=false;state.minigame={...state.minigame,...m,id:m.id||m.eventId,status:m.status||'waiting',results:null};renderMinigameHud();toggleMinigamePanel(false);toggleChat(false);setBanner(`${minigameTitle(m.gameKey)} · ${m.status==='countdown'?'СТАРТ СКОРО':'ОЖИДАЕМ ИГРОКОВ'}`,2400);return;
    }
    if(m.type==='minigame_start'&&(m.participants?.includes(state.playerId)||state.spectator&&state.mediaEvent)){
      if(state.spectator){state.minigame={...state.minigame,...m,id:m.id||m.eventId,status:'running',_ballServerTime:m.serverTime};renderMinigameHud();}else enterMinigameArena({...m,id:m.id||m.eventId,_ballServerTime:m.serverTime});setBanner(`${minigameTitle(m.gameKey)} · GO!`,2400);return;
    }
    if(m.type==='minigame_progress'&&state.minigame&&(state.minigame.id===(m.id||m.eventId)||state.minigame.gameKey===m.gameKey)){
      const e=state.minigame,ball=m.ball;state.minigame={...e,...m,id:m.id||m.eventId||e.id,status:'running',ball:e.ball,_ballServerTime:e._ballServerTime};acceptFootballBall(state.minigame,ball,m.serverTime);renderMinigameHud();return;
    }
    if(m.type==='minigame_ball'&&state.minigame?.id===m.eventId){
      acceptFootballBall(state.minigame,m.ball,m.serverTime);return;
    }
    if(m.type==='minigame_goal'&&state.minigame?.id===m.eventId){
      const e=state.minigame,reset=m.ball||{x:MINI_ARENA.x,y:MINI_ARENA.y,vx:0,vy:0,seq:(Number(e.ball?.seq)||0)+1};e.score=m.score;acceptFootballBall(e,reset,m.serverTime);e._ballPred={...reset};renderMinigameHud();setBanner(`ГОЛ · ${String(m.team||'').toUpperCase()} · ${m.score?.red||0}:${m.score?.blue||0}`,2600);return;
    }
    if(m.type==='minigame_bomb_pass'&&state.minigame?.id===m.eventId){
      state.minigame={...state.minigame,bombHolderId:m.bombHolderId,bombDeadline:m.bombDeadline};renderMinigameHud();return;
    }
    if(m.type==='minigame_bomb_burst'&&state.minigame?.id===m.eventId){
      state.minigame={...state.minigame,bombHolderId:m.bombHolderId,bombDeadline:m.bombDeadline,strikes:m.strikes||state.minigame.strikes};renderMinigameHud();setBanner('💥 ВЗРЫВ · ШТРАФ ДЕРЖАТЕЛЮ',2200);return;
    }
    if(m.type==='minigame_left'){
      const title=minigameTitle(m.gameKey);leaveMinigameArena();setBanner(`${title} · ВЫ ВЫШЛИ`,2500);return;
    }
    if(m.type==='minigame_cancelled'&&state.minigame&&(state.minigame.id===m.eventId||state.minigame.gameKey===m.gameKey)){
      const title=minigameTitle(m.gameKey);leaveMinigameArena();setBanner(`${title} · ОЧЕРЕДЬ ОТМЕНЕНА`,3000);return;
    }
    if(m.type==='minigame_result'&&state.minigame&&(state.minigame.id===m.eventId||state.minigame.gameKey===m.gameKey)){
      state.minigameHudExpanded=true;state.minigameHudAutoCollapseAt=0;state.minigame={...state.minigame,status:'result',score:m.score||state.minigame.score,results:m.results||[],standings:m.results||[]};renderMinigameHud();
      const mine=(m.results||[]).find(r=>r.id===state.playerId);if(mine){const label=minigameKind(m.gameKey)==='football'?(mine.draw?'НИЧЬЯ':mine.won?'ПОБЕДА':'ПОРАЖЕНИЕ'):`#${mine.place||'—'}`;setBanner(`${minigameTitle(m.gameKey)} · ${label}${mine.eligible?` · +${mine.exp||0} EXP · +${mine.credits||0} CR`:' · БЕЗ НАГРАДЫ'}`,5600);}
      const resultId=m.eventId;setTimeout(()=>{if(state.minigame?.id===resultId&&state.minigame.status==='result')leaveMinigameArena();},6500);return;
    }
    if(m.type==='activity_lobby'&&['drift_battle','koth'].includes(m.activity)&&(m.participants?.includes(state.playerId)||state.spectator&&state.mediaEvent)){
      state.activityPending=false;state.liveEvent={activity:m.activity,id:m.eventId,status:m.status||'waiting',participants:[...(m.participants||[])],minPlayers:m.minPlayers||2,maxPlayers:m.maxPlayers||8,startAt:m.startAt||0,endAt:m.startAt?(m.startAt+(m.durationMs||0)):0,zoneId:m.zoneId||null,zone:m.zone||null,standings:eventRowsFromParticipants(m),names:m.names||{},levels:m.levels||{}};
      renderEventHud();toggleChat(false);setBanner(`${eventTitle(m.activity)} · ${m.status==='countdown'?'СТАРТ СКОРО':'ОЖИДАЕМ ИГРОКОВ'}`,2200);return;
    }
    if(m.type==='activity_start'&&m.activity==='drag'&&m.participants.includes(state.playerId)){
      const lane=m.participants.indexOf(state.playerId),opponentId=m.participants.find(id=>id!==state.playerId)||null;
      state.drag={id:m.challengeId,startAt:m.startAt,finishX:m.finishX||DRAG_FINISH_X,participants:[...m.participants],opponentId,wager:Number(m.wager)||0,pot:Number(m.pot)||0,finished:false,localCrossed:false,progress:null,confirmed:{},result:null};
      state.dragWager=Number(m.wager)||0;state.dragQueued=false;car.x=DRAG_START_X;car.y=2635+lane*70;car.angle=0;car.vx=car.vy=car.speed=0;
      m.participants.forEach((id,index)=>{if(id!==state.playerId)resetRemoteToGrid(id,index,m.startAt);});pingServer();toggleChat(false);
      setBanner(state.drag.wager?`DRAG · СТАВКА ${fmtCR(state.drag.wager)} · БАНК ${fmtCR(state.drag.pot)}`:'DRAG · СИНХРОНИЗАЦИЯ СТАРТА',2400);if(state.drag.wager)setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),120);updateDragHud(Date.now()+state.serverOffset);updateChatPreview();return;
    }
    if(m.type==='activity_start'&&['drift_battle','koth'].includes(m.activity)&&(m.participants?.includes(state.playerId)||state.spectator&&state.mediaEvent)){
      const prev=state.liveEvent?.id===m.eventId?state.liveEvent:{};state.liveEvent={...prev,activity:m.activity,id:m.eventId,status:'running',participants:[...(m.participants||prev.participants||[])],startAt:m.startAt||0,endAt:m.endAt||0,zoneId:m.zoneId??prev.zoneId,zone:m.zone??prev.zone,zoneIndex:m.zoneIndex||0,finalZone:!!m.finalZone};renderEventHud();setBanner(`${eventTitle(m.activity)} · GO!`,2200);return;
    }
    if(m.type==='activity_progress'&&m.activity==='drag'&&state.drag?.id===m.challengeId){state.drag.progress=m;return;}
    if(m.type==='activity_progress'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){state.liveEvent={...state.liveEvent,status:'running',startAt:m.startAt||state.liveEvent.startAt,endAt:m.endAt||state.liveEvent.endAt,zoneId:m.zoneId??state.liveEvent.zoneId,zone:m.zone??state.liveEvent.zone,zoneIndex:m.zoneIndex??state.liveEvent.zoneIndex,finalZone:!!m.finalZone,standings:m.standings||state.liveEvent.standings};renderEventHud();return;}
    if(m.type==='activity_zone'&&m.activity==='koth'&&state.liveEvent?.id===m.eventId){state.liveEvent={...state.liveEvent,zoneIndex:m.zoneIndex,zone:m.zone,finalZone:!!m.finalZone};renderEventHud();setBanner(m.finalZone?'KING OF THE HILL · FINAL ZONE':`НОВАЯ ЗОНА · ${m.zone?.label||''}`,2800);return;}
    if(m.type==='activity_finish_confirmed'&&m.activity==='drag'&&state.drag?.id===m.challengeId){state.drag.confirmed[m.playerId]=m.elapsedMs;if(m.playerId===state.playerId){state.drag.localCrossed=true;setBanner(`ФИНИШ ЗАФИКСИРОВАН · ${(m.elapsedMs/1000).toFixed(3)} сек`,1800);}return;}
    if(m.type==='activity_cancelled'&&m.activity==='drag'&&state.drag?.id===m.challengeId){const refunded=m.wagerRefunded&&Number(m.wager)>0;setBanner(refunded?`DRAG ОТМЕНЁН · ${fmtCR(m.wager)} ВОЗВРАЩЕНО`:'DRAG ОТМЕНЁН · СОПЕРНИК ВЫШЕЛ',3400);state.drag=null;state.dragQueued=false;if(refunded)setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),100);updateDragHud(Date.now()+state.serverOffset);return;}
    if(m.type==='activity_left'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){state.activityPending=false;state.liveEvent=null;renderEventHud();setBanner(`${eventTitle(m.activity)} · ВЫ ВЫШЛИ ИЗ ИВЕНТА`,2600);return;}
    if(m.type==='activity_cancelled'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){setBanner(`${eventTitle(m.activity)} ОТМЕНЁН · НЕДОСТАТОЧНО ИГРОКОВ`,3200);state.liveEvent=null;renderEventHud();return;}
    if(m.type==='activity_result'&&m.activity==='drag'){
      const stake=Number(m.wager)||0,pot=Number(m.pot)||0,won=m.winnerId===state.playerId,draw=m.draw===true,mine=m.times?.[state.playerId];
      if(m.forfeit){setBanner(won?`DRAG · ПОБЕДА ТЕХНИЧЕСКИ${pot?` · +${fmtCR(pot)}`:''}`:'DRAG · ТЕХНИЧЕСКОЕ ПОРАЖЕНИЕ',5200);}
      else if(Number.isFinite(mine)){const gap=Math.abs(Number(m.gapMs)||0),photo=m.photoFinish===true||gap<=100,label=draw?'НИЧЬЯ':photo?'PHOTO FINISH':(won?'ПОБЕДА':'ПОРАЖЕНИЕ'),money=stake?(draw?` · ${fmtCR(stake)} ВОЗВРАЩЕНО`:won?` · +${fmtCR(pot)}`:` · −${fmtCR(stake)}`):'';setBanner(`${label} · ${(mine/1000).toFixed(3)} сек · Δ ${(gap/1000).toFixed(3)}${money}`,5600);}
      if(state.drag?.id===m.challengeId){state.drag.finished=true;state.drag.result=m;const dragId=m.challengeId;setTimeout(()=>{if(state.drag?.id===dragId){state.drag=null;updateDragHud(Date.now()+state.serverOffset);}},5600);}
      if(stake)setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),120);
      if(m.forfeit)addSystem(`DRAG: ${m.names?.[m.winnerId]||'RACER'} победил технически${pot?` · банк ${fmtCR(pot)}`:''}.`);else if(m.draw)addSystem(`DRAG: ничья · ${((m.times?.[m.participants?.[0]]||0)/1000).toFixed(3)} сек${stake?' · ставки возвращены':''}.`);else addSystem(`DRAG: ${m.names?.[m.winnerId]||'RACER'} победил · ${(m.times?.[m.winnerId]/1000).toFixed(3)} сек${m.photoFinish?' · PHOTO FINISH':''}${pot?` · банк ${fmtCR(pot)}`:''}.`);return;
    }
    if(m.type==='activity_result'&&['drift_battle','koth'].includes(m.activity)&&state.liveEvent?.id===m.eventId){
      state.liveEvent={...state.liveEvent,status:'result',results:m.results||[],standings:m.results||[],endAt:m.serverTime||Date.now()+state.serverOffset};renderEventHud();const mine=m.results?.find(r=>r.id===state.playerId);if(mine){if(mine.eligible)setBanner(`${eventTitle(m.activity)} · #${mine.place} · +${mine.exp||0} EXP · +${mine.credits||0} CR`,5200);else setBanner(`${eventTitle(m.activity)} · НАГРАДА НЕ ВЫДАНА · НЕДОСТАТОЧНО АКТИВНОГО УЧАСТИЯ`,5200);}const id=m.eventId;setTimeout(()=>{if(state.liveEvent?.id===id&&state.liveEvent.status==='result'){state.liveEvent=null;renderEventHud();}},7600);return;
    }
  }

  function syncLiveEventFromRoom(room){
    if(state.liveEvent?.status==='result')return;
    const active=[room?.activities?.drift,room?.activities?.koth].find(e=>(e?.participants?.includes(state.playerId)||(state.spectator&&room?.mediaEvent&&e?.activity===room.mediaEvent.gameKey))&&['waiting','countdown','running'].includes(e.status));
    if(!active){if(state.liveEvent&&['waiting','countdown','running'].includes(state.liveEvent.status)){state.liveEvent=null;renderEventHud();}return;}
    const activity=active.activity,existing=state.liveEvent?.id===active.id?state.liveEvent:{};
    const standings=(active.participants||[]).map((id,i)=>{const p=room.players?.find(x=>x.id===id);return{id,name:p?.name||existing.names?.[id]||'RACER',level:Number(p?.level??existing.levels?.[id])||0,score:existing.standings?.find(r=>r.id===id)?.score||0,place:i+1};});
    state.liveEvent={...existing,activity,id:active.id,status:active.status,participants:[...(active.participants||[])],minPlayers:activity==='koth'?3:2,maxPlayers:activity==='koth'?12:8,startAt:active.startAt||0,endAt:active.endAt||0,zoneId:active.zoneId||existing.zoneId||null,zone:active.zone||existing.zone||null,zoneIndex:active.zoneIndex||0,finalZone:!!active.finalZone,standings};renderEventHud();
  }

  function syncMinigameFromRoom(room){
    if(state.minigame?.status==='result')return;
    const active=(room?.activities?.minigames||[]).find(e=>(e?.participants?.includes(state.playerId)||(state.spectator&&room?.mediaEvent&&e?.gameKey===room.mediaEvent.gameKey))&&['waiting','countdown','running'].includes(e.status));
    if(!active){if(state.minigame&&['waiting','countdown','running'].includes(state.minigame.status)){if(state.minigameReturn)leaveMinigameArena();else{state.minigame=null;renderMinigameHud();}}return;}
    const existing=state.minigame?.id===active.id?state.minigame:{};
    state.minigame={...existing,...active,id:active.id,status:active.status,ball:existing.ball||active.ball};
    if(active.status==='running'&&!state.spectator&&!state.minigameReturn&&active.spawns)enterMinigameArena(state.minigame);else renderMinigameHud();
  }

  function applyRoom(room){
    if(!room)return;
    state.room=room;state.mediaEvent=room.mediaEvent||null;const meNow=room.players?.find(p=>p.id===state.playerId);state.spectator=!!meNow?.spectator;roam.classList.toggle('media-event-active',!!state.mediaEvent);roam.classList.toggle('media-spectator',state.spectator);
    const live=new Set(room.players.map(p=>p.id));
    for(const p of room.players){
      if(p.id===state.playerId){syncProgress(progressFromTotal(p.totalExp));continue;}
      let r=state.remotes.get(p.id);
      if(!r){
        const s=p.state||{x:2320,y:1590,angle:0};
        r={x:s.x,y:s.y,angle:s.angle,target:s,snapshots:[],name:p.name,adminLevel:Number(p.adminLevel)||0,level:Number(p.level)||0,liveryId:p.liveryId||'apexLime',effectId:p.effectId||'standard',colorId:p.colorId||'stock',vinylId:p.vinylId||'none',visual:createVisual(p.liveryId,p.effectId,p.colorId,p.vinylId)};pushRemoteSnapshot(r,s,s.sampleTime||s.serverTime||Date.now()+state.serverOffset);state.remotes.set(p.id,r);
      }
      r.name=p.name;r.owner=p.owner===true;r.media=!!p.media;r.adminLevel=Number(p.adminLevel)||0;r.level=Number(p.level)||0;
      if(r.liveryId!==p.liveryId||r.effectId!==p.effectId||r.colorId!==(p.colorId||'stock')||r.vinylId!==(p.vinylId||'none')||!r.visual){r.liveryId=p.liveryId||'apexLime';r.effectId=p.effectId||'standard';r.colorId=p.colorId||'stock';r.vinylId=p.vinylId||'none';r.visual=createVisual(r.liveryId,r.effectId,r.colorId,r.vinylId);}
      if(p.state)pushRemoteSnapshot(r,p.state,p.state.sampleTime||p.state.serverTime||Date.now()+state.serverOffset);
    }
    for(const id of state.remotes.keys())if(!live.has(id))state.remotes.delete(id);
    $('freePlayerCount').textContent=`${room.players.filter(p=>p.connected).length} / ${room.maxPlayers||MAX}`;
    syncLiveEventFromRoom(room);syncMinigameFromRoom(room);renderMediaControl();
  }

  function startRoam(){
    state.active=true;
    state.chatUnread=0;
    state.chat.length=0;
    state.driftScore=0;
    state.driftInside=false;state.paused=false;state.intentionalClose=false;state.reconnectAttempts=0;stopReconnect();
    $('freePausePanel')?.classList.add('hidden');roam.classList.remove('paused');
    refreshPlayerLoadout();
    if(state.playerVisual)state.playerVisual.effectTime=0;
    car.x=2320;car.y=1590;car.vx=0;car.vy=0;car.angle=-Math.PI/2;car.speed=0;car.yawRate=0;car.steerInput=0;car.gripDisturbance=0;
    updateUnreadBadge();
    $('freeChatLog').replaceChildren();
    updateChatPreview();
    roam.classList.remove('hidden');
    roam.setAttribute('aria-hidden','false');
    $('freeServerName').textContent=state.server.name;
    if(state.room)applyRoom(state.room);renderEventHud();renderMinigameHud();renderLevelsPanel();
    resize();
    last=performance.now();
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(loop);
  }

  function leaveBeacon(){
    if(!state.server?.id||!state.playerId||!state.token)return;const base=state.server?.apiBase||`/api/free/${state.server.id}`;const url=`${base}/leave?playerId=${encodeURIComponent(state.playerId)}&token=${encodeURIComponent(state.token)}`;try{navigator.sendBeacon?.(url,'');}catch{}
  }
  function leave(notify=true){
    state.active=false;state.intentionalClose=true;
    stopClockSync();stopReconnect();if(notify){send({type:'leave',v:1});leaveBeacon();}
    try{state.ws?.close(1000,'leave');}catch{}
    state.ws=null;
    state.remotes.clear();
    state.drag=null;
    state.dragQueued=false;state.dragWager=0;toggleDragBetPanel(false);
    state.activityPending=false;
    state.liveEvent=null;state.minigame=null;state.minigameReturn=null;state.mediaEvent=null;state.spectator=false;state.spectatorTarget=null;state.mediaHudHidden=false;state.paused=false;closeFreeGarage();renderEventHud();renderMinigameHud();toggleMinigamePanel(false);toggleLevels(false);$('freePausePanel')?.classList.add('hidden');roam.classList.remove('paused','minigame-active','media-event-active','media-spectator','media-clean-hud');ensureMediaControl().classList.add('hidden');
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
    const dragLock=state.drag&&now<state.drag.startAt,spectating=state.spectator&&!!state.mediaEvent;
    let steer=(input.right?1:0)-(input.left?1:0);
    let throttle=input.gas?1:0,brake=input.brake?1:0,handbrake=input.handbrake?1:0;
    if(dragLock||crewModalOpen){steer=0;throttle=0;brake=1;handbrake=0;}
    else if(state.paused){steer=0;throttle=0;brake=0;handbrake=0;}

    const prevX=car.x,prevY=car.y;
    if(spectating){car.vx=car.vy=car.speed=0;}else if(R.Car&&typeof car.update==='function'){
      // Free Roam now uses the high-grip race tyre model for every normal turn.
      // Drift physics is opt-in only: it exists while the player is actually holding HB.
      // Releasing HB immediately returns the car to normal grip, so a hard steering input
      // or full throttle can no longer trigger an automatic slide.
      const driftActive=handbrake>.05&&car.speed>28;
      car.update(dt,{steer,throttle,brake,handbrake,drift:driftActive},FREE_PHYS_TRACK);
    }else{
      const fx=Math.cos(car.angle),fy=Math.sin(car.angle);let signed=car.vx*fx+car.vy*fy;
      if(throttle)signed+=SOLO_PHYS.accel*dt;if(brake)signed-=Math.sign(signed||1)*SOLO_PHYS.brakePower*.8*dt;
      signed=clamp(signed,-90,SOLO_PHYS.maxSpeed);car.angle+=steer*SOLO_PHYS.turnRate*dt*clamp(Math.abs(signed)/70,0,1)*(signed>=0?1:-1);
      car.vx=Math.cos(car.angle)*signed;car.vy=Math.sin(car.angle)*signed;car.x+=car.vx*dt;car.y+=car.vy*dt;car.speed=Math.hypot(car.vx,car.vy);
    }

    if(!spectating){if(state.minigame&&['running','result'].includes(state.minigame.status))resolveMinigameMotion(car);else CITY.resolveCarMotion(car,prevX,prevY);}

    if(state.minigame?.status==='running'&&minigameKind(state.minigame.gameKey)==='football')advanceFootballBall(state.minigame,dt,now);

    const jitterPad=state.drag?clamp((state.rtt||0)*.12,0,28):clamp((state.rtt||0)*.22,0,55),remoteTargetTime=now-(state.drag?DRAG_REMOTE_BACKTIME_MS:REMOTE_BACKTIME_MS)-jitterPad;
    for(const r of state.remotes.values()){
      const sampled=sampleRemote(r,remoteTargetTime);if(!sampled)continue;r.x=sampled.x;r.y=sampled.y;r.angle=sampled.angle;
      if(r.visual){r.visual.speed=Math.max(40,sampled.speed||0);r.visual.effectTime+=dt;r.visual.throttleVisual=.88;}
    }

    const sendEvery=freeSendInterval();if(!spectating&&performance.now()-state.lastSend>sendEvery)sendFreeState();

    $('freeSpeed').textContent=spectating?'SPECTATOR':Math.round(car.speed);
    $('freeLocation').textContent=state.minigame&&['running','result'].includes(state.minigame.status)?minigameTitle(state.minigame.gameKey):district(car.x,car.y);
    updateActivities(dt,now);updateDragHud(now);updateEventClock(now);updateMinigameClock(now);
  }

  function freeSendInterval(){
    if(state.drag&&!state.drag.result)return DRAG_SEND_MS;const buffered=state.ws?.bufferedAmount||0,rtt=Number(state.rtt)||0,football=state.minigame?.status==='running'&&minigameKind(state.minigame.gameKey)==='football';if(buffered>48000)return football?88:115;if(football){if(rtt>260)return 78;if(rtt>160)return 66;if(rtt>90)return 54;return FOOTBALL_SEND_MS;}if(rtt>260)return 96;if(rtt>160)return 82;if(rtt>90)return 72;return FREE_SEND_MS;
  }
  function sendFreeState(force=false){
    if(state.minigame?.status==='result')return false;
    const t=performance.now(),every=freeSendInterval();if(!force&&t-state.lastSend<every)return false;if(!state.ws||state.ws.readyState!==WebSocket.OPEN||state.ws.bufferedAmount>98304)return false;state.lastSend=t;
    return send({type:'free_state',v:1,state:{seq:++state.seq,x:car.x,y:car.y,vx:car.vx,vy:car.vy,angle:car.angle,speed:car.speed,yawRate:Number(car.yawRate)||0,sampleTime:Math.round(Date.now()+state.serverOffset)}});
  }

  function updateDragHud(now){
    const hud=$('freeDragHud');if(!hud)return;const d=state.drag;
    // CSS uses this state to keep chat and controls out of the race sightline on small touch screens.
    roam.classList.toggle('drag-active',!!d);
    if(!d){hud.classList.add('hidden');hud.classList.remove('win','lose','photo');return;}hud.classList.remove('hidden');
    const stateEl=$('freeDragState'),leadEl=$('freeDragLead'),gapEl=$('freeDragGap'),netEl=$('freeDragNet'),mineEl=$('freeDragMine'),rivalEl=$('freeDragRival');if(netEl)netEl.textContent=`PING ${Math.round(state.rtt||0)} MS`;
    const remain=d.startAt-now;if(remain>0){const n=Math.max(1,Math.ceil(remain/1000));if(stateEl)stateEl.textContent=d.wager?`BET ${fmtCR(d.wager).replace(' CR','')}`:'START SYNC';if(leadEl)leadEl.textContent=remain>3000?'READY':String(n);if(gapEl)gapEl.textContent=d.wager?`БАНК ${fmtCR(d.pot)} · СТАРТ ПО СЕРВЕРНОМУ ТАЙМЕРУ`:'СТАРТ ПО СЕРВЕРНОМУ ТАЙМЕРУ';hud.classList.remove('win','lose','photo');}
    else if(d.result){const mine=d.result.times?.[state.playerId],draw=d.result.draw===true,won=!draw&&d.result.winnerId===state.playerId,gap=Math.abs(Number(d.result.gapMs)||0);hud.classList.toggle('win',won);hud.classList.toggle('lose',!draw&&!won);hud.classList.toggle('photo',d.result.photoFinish===true||draw);if(stateEl)stateEl.textContent=draw?'DRAW':d.result.photoFinish?'PHOTO FINISH':'SERVER RESULT';if(leadEl)leadEl.textContent=draw?'DRAW':won?'YOU WIN':'YOU LOSE';if(gapEl)gapEl.textContent=`${Number.isFinite(mine)?(mine/1000).toFixed(3)+' s · ':''}Δ ${(gap/1000).toFixed(3)} s${d.wager?` · БАНК ${fmtCR(d.pot)}`:''}`; }
    else{const p=d.progress,leadId=p?.leadId,gap=Math.abs(Number(p?.gap)||0),oppName=state.room?.players?.find(x=>x.id===d.opponentId)?.name||'RIVAL';if(stateEl)stateEl.textContent='SERVER LIVE';if(leadEl){if(!leadId||gap<3)leadEl.textContent='PHOTO FINISH';else leadEl.textContent=leadId===state.playerId?'YOU LEAD':`${oppName} LEADS`;}if(gapEl)gapEl.textContent=gap<3?'РАЗНИЦА МЕНЬШЕ НОСА МАШИНЫ':`ОТРЫВ ≈ ${(gap/54).toFixed(1)} КОРП.`;hud.classList.toggle('photo',gap<8);hud.classList.remove('win','lose');}
    const positions=d.progress?.positions||{},mineX=Number(positions[state.playerId]),rivalX=Number(positions[d.opponentId]);if(remain>0){if(mineEl)mineEl.style.left='0%';if(rivalEl)rivalEl.style.left='0%';}else{if(mineEl&&Number.isFinite(mineX))mineEl.style.left=(clamp((mineX-DRAG_START_X)/DRAG_LENGTH,0,1)*100)+'%';if(rivalEl&&Number.isFinite(rivalX))rivalEl.style.left=(clamp((rivalX-DRAG_START_X)/DRAG_LENGTH,0,1)*100)+'%';}
  }

  function updateActivities(dt,now){
    state.speedCooldown=Math.max(0,state.speedCooldown-dt);
    if(state.mediaEvent){const action=$('freeContextAction');if(action)action.classList.add('hidden');return;}
    if(state.minigame){const action=$('freeContextAction');if(action)action.classList.add('hidden');return;}

    if(dist(car.x,car.y,ZONES.speed.x,ZONES.speed.y)<ZONES.speed.r&&state.speedCooldown<=0&&car.speed>90){
      state.speedCooldown=4;const v=Math.round(car.speed);setBanner(`SPEED TRAP · ${v} KM/H`,2600);send({type:'record',v:1,kind:'speed',value:v});
    }

    const inDrift=dist(car.x,car.y,ZONES.drift.x,ZONES.drift.y)<ZONES.drift.r;
    if(inDrift&&car.speed>55&&input.handbrake){
      state.driftScore+=car.speed*dt*4.9;state.driftInside=true;
    }else if(state.driftInside&&!inDrift){
      const score=Math.floor(state.driftScore);if(score>120){setBanner(`DRIFT ZONE · ${score.toLocaleString('ru-RU')}`,3000);send({type:'record',v:1,kind:'drift',value:score});}state.driftScore=0;state.driftInside=false;
    }

    if(state.drag&&!state.drag.finished&&!state.drag.localCrossed&&now>=state.drag.startAt&&car.x>DRAG_FINISH_X&&car.y>2510&&car.y<2820){state.drag.localCrossed=true;sendFreeState(true);setBanner('ФИНИШ · СЕРВЕР ПРОВЕРЯЕТ РЕЗУЛЬТАТ',1800);}

    const action=$('freeContextAction');if(!action)return;action.onclick=null;
    if(state.drag||state.activityPending||state.liveEvent){action.classList.add('hidden');return;}
    if(state.dragQueued){action.textContent=`DRAG · ОТМЕНИТЬ ОЧЕРЕДЬ${state.dragWager?` · ${fmtCR(state.dragWager)}`:''}`;action.classList.remove('hidden');action.onclick=()=>send({type:'activity_leave',v:1,activity:'drag'});return;}

    if(nearGarage()){
      action.textContent='ГАРАЖ · ВОЙТИ';action.classList.remove('hidden');action.onclick=openFreeGarage;return;
    }

    if(dist(car.x,car.y,ZONES.levels.x,ZONES.levels.y)<ZONES.levels.r){
      action.textContent='УРОВНИ · ОТКРЫТЬ';action.classList.remove('hidden');action.onclick=()=>toggleLevels(true);return;
    }

    if(dist(car.x,car.y,ZONES.koth.x,ZONES.koth.y)<92){
      action.textContent='KING OF THE HILL · УЧАСТВОВАТЬ';action.classList.remove('hidden');action.onclick=()=>{state.activityPending=true;if(send({type:'activity_join',v:1,activity:'koth'})){action.classList.add('hidden');setBanner('KING OF THE HILL · РЕГИСТРАЦИЯ',1800);}else state.activityPending=false;};return;
    }

    const driftZones=[ZONES.drift],battle=driftZones.find(z=>dist(car.x,car.y,z.x,z.y)<Math.min(150,z.r));
    if(battle){
      action.textContent='DRIFT BATTLE · УЧАСТВОВАТЬ';action.classList.remove('hidden');action.onclick=()=>{state.activityPending=true;if(send({type:'activity_join',v:1,activity:'drift_battle',zoneId:battle.battleId})){action.classList.add('hidden');setBanner('DRIFT BATTLE · РЕГИСТРАЦИЯ',1800);}else state.activityPending=false;};return;
    }

    const miniHub=[ZONES.footballHub,ZONES.checkpointHub,ZONES.hotPotatoHub].find(z=>dist(car.x,car.y,z.x,z.y)<z.r);
    if(miniHub){const labels={football:'МИНИ-ФУТБОЛ',checkpoint:'CHECKPOINT RUSH',hot_potato:'HOT POTATO'};action.textContent=`${labels[miniHub.hub]||'МИНИ-ИГРЫ'} · ОТКРЫТЬ`;action.classList.remove('hidden');action.onclick=()=>openMinigamePanel(miniHub.hub);return;}

    if(dist(car.x,car.y,ZONES.crews.x,ZONES.crews.y)<ZONES.crews.r){action.textContent='КЛАНЫ · РЕЙТИНГ';action.classList.remove('hidden');action.onclick=()=>window.VelocityCrews?.open();return;}
    const nearDrag=dist(car.x,car.y,ZONES.drag.x,ZONES.drag.y)<ZONES.drag.r;
    if(nearDrag){
      action.textContent='DRAG · ВЫБРАТЬ СТАВКУ';action.classList.remove('hidden');action.onclick=()=>toggleDragBetPanel(true);return;
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
    5:{label:'ST.ADMIN',key:'st-admin',fill:'#8b6517',stroke:'#ffd36b',glow:'#f3b83f',text:'#fff8de'},
    6:{label:'CURATOR',key:'curator',fill:'#0d6b57',stroke:'#55f0c2',glow:'#28d7a4',text:'#ecfff9'},
    7:{label:'GL.ADMIN',key:'gl-admin',fill:'#174fbd',stroke:'#6bb4ff',glow:'#3e8cff',text:'#eef6ff'},
    8:{label:'ROOT',key:'root',fill:'#252b36',stroke:'#d6e0ef',glow:'#98a8c0',text:'#ffffff'}
  });
  const adminPrefix=level=>ADMIN_PREFIXES[Math.max(0,Math.min(8,Math.floor(Number(level)||0)))]||null;

  function appendPlayerName(el,name,owner,level=null,adminLevel=null){
    const player=state.room?.players?.find(p=>p.name===name),isOwner=owner===true||player?.owner===true,isMedia=player?.media===true,rank=adminPrefix(adminLevel===null?player?.adminLevel:adminLevel);
    if(isOwner){const badge=document.createElement('span');badge.className='free-owner-badge';badge.textContent='OWNER';el.append(badge);}
    else if(isQueenName(name)){const badge=document.createElement('span');badge.className='free-queen-badge';badge.textContent='QUEEN';el.append(badge);}
    else if(isMedia){const badge=document.createElement('span');badge.className='free-media-badge';badge.textContent='MEDIA';el.append(badge);}
    else if(rank){const badge=document.createElement('span');badge.className=`free-admin-badge admin-${rank.key}`;badge.textContent=rank.label;el.append(badge);}
    const crew=player?.crew;if(crew){const tag=document.createElement('span');tag.className='crew-tag';tag.style.setProperty('--crew-color',crew.color);tag.textContent='['+crew.tag+'] ';el.append(tag);}
    el.append(document.createTextNode(name||'RACER'));
    if(player?.userId){el.classList.add('crew-profile-link');el.tabIndex=0;el.setAttribute('role','button');el.onclick=()=>window.VelocityCrews?.profile({id:player.userId});el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};}
    if(level!==null&&Number.isFinite(Number(level))){const tag=document.createElement('span');tag.className='free-level-tag';tag.textContent=`[${Math.max(0,Math.min(100,Math.floor(Number(level)||0)))}]`;el.append(document.createTextNode(' '),tag);}
  }

  function addChat(name,text,mine=false,owner=false,level=0,adminLevel=0,media=false){
    state.chat.push({name,text,mine,owner,level,adminLevel,media,system:false,time:Date.now()});
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

  function ensureMediaControl(){
    let root=$('freeMediaControl');if(root)return root;
    root=document.createElement('section');root.id='freeMediaControl';root.className='free-media-control hidden';
    root.innerHTML='<header><div><small>VELOCITY APEX / MEDIA EVENT</small><strong id="freeMediaTitle">MEDIA EVENT</strong></div><button id="freeMediaCopy" type="button">CODE</button></header><div class="free-media-meta"><span id="freeMediaGame">—</span><span id="freeMediaPrize">0 CR</span><span id="freeMediaReady">0/0 READY</span></div><div class="free-media-actions"><button id="freeMediaReadyBtn" type="button">ГОТОВ</button><button id="freeMediaShuffleBtn" type="button">ПЕРЕМЕШАТЬ</button><button id="freeMediaStartBtn" type="button">START</button><button id="freeMediaCancelBtn" type="button">ОТМЕНИТЬ</button></div><div id="freeMediaCamera" class="free-media-camera hidden"><button data-media-cam="prev" type="button">◀</button><button data-media-cam="overview" type="button">ОБЩИЙ ВИД</button><button data-media-cam="next" type="button">▶</button><button data-media-cam="hud" type="button">HUD</button></div></section>';
    roam.appendChild(root);
    $('freeMediaReadyBtn').onclick=()=>{const me=ownPlayer();if(me&&!state.spectator)send({type:'media_ready',v:1,ready:!me.mediaReady});};
    $('freeMediaStartBtn').onclick=()=>send({type:'media_start',v:1});
    $('freeMediaShuffleBtn').onclick=()=>send({type:'media_shuffle',v:1});
    $('freeMediaCancelBtn').onclick=async()=>{const e=state.mediaEvent;if(!e||!confirm('Отменить MEDIA EVENT? Приз будет возвращён на баланс.'))return;try{await jsonFetch(`/api/media/events/${e.code}/cancel`,{method:'POST',body:'{}'});setBanner('MEDIA EVENT ОТМЕНЁН · ПРИЗ ВОЗВРАЩЁН',3500);setTimeout(()=>window.VelocityAccount?.refreshCloud?.(),120);}catch(err){setBanner(err.code==='EVENT_ALREADY_STARTED'?'EVENT УЖЕ НАЧАЛСЯ · ОТМЕНА НЕДОСТУПНА':'НЕ УДАЛОСЬ ОТМЕНИТЬ EVENT',2800);}};
    $('freeMediaCopy').onclick=async()=>{const code=state.mediaEvent?.code||'';try{await navigator.clipboard.writeText(code);setBanner('КОД MEDIA EVENT СКОПИРОВАН',1600);}catch{setBanner('КОД: '+code,2400);}};
    root.querySelector('[data-media-cam="overview"]').onclick=()=>{state.spectatorTarget=null;renderMediaControl();};
    const cycle=dir=>{const ids=(state.room?.players||[]).filter(p=>!p.spectator&&p.connected).map(p=>p.id);if(!ids.length){state.spectatorTarget=null;return;}let i=ids.indexOf(state.spectatorTarget);if(i<0)i=dir>0?-1:0;i=(i+dir+ids.length)%ids.length;state.spectatorTarget=ids[i];renderMediaControl();};
    root.querySelector('[data-media-cam="prev"]').onclick=()=>cycle(-1);root.querySelector('[data-media-cam="next"]').onclick=()=>cycle(1);
    root.querySelector('[data-media-cam="hud"]').onclick=()=>{state.mediaHudHidden=!state.mediaHudHidden;roam.classList.toggle('media-clean-hud',state.mediaHudHidden);renderMediaControl();};
    return root;
  }

  function renderMediaControl(){
    const root=ensureMediaControl(),e=state.mediaEvent;if(!e){root.classList.add('hidden');roam.classList.remove('media-clean-hud');return;}
    root.classList.remove('hidden');const me=ownPlayer(),players=(state.room?.players||[]).filter(p=>!p.spectator),ready=players.filter(p=>p.mediaReady).length,isOrganizer=me?.userId===e.creatorUserId||me?.owner===true,waiting=['WAITING','STARTING'].includes(String(e.status||'').toUpperCase());
    const labels={football_3v3:'MINI FOOTBALL 3×3',football_5v5:'MINI FOOTBALL 5×5',checkpoint:'CHECKPOINT RUSH',hot_potato:'HOT POTATO',drift_battle:'DRIFT BATTLE',koth:'KING OF THE HILL',drag:'DRAG EVENT'};
    $('freeMediaTitle').textContent=e.title||'MEDIA EVENT';$('freeMediaGame').textContent=labels[e.gameKey]||String(e.gameKey||'EVENT').toUpperCase();$('freeMediaPrize').textContent='ПРИЗ '+fmtCR(e.prize||0);$('freeMediaReady').textContent=`${ready}/${players.length} READY`;$('freeMediaCopy').textContent=e.code||'CODE';
    $('freeMediaReadyBtn').classList.toggle('hidden',state.spectator||!waiting);$('freeMediaReadyBtn').textContent=me?.mediaReady?'ГОТОВ ✓':'ГОТОВ';$('freeMediaReadyBtn').classList.toggle('selected',!!me?.mediaReady);
    $('freeMediaStartBtn').classList.toggle('hidden',!isOrganizer||!waiting);$('freeMediaCancelBtn').classList.toggle('hidden',!isOrganizer||!waiting);$('freeMediaShuffleBtn').classList.toggle('hidden',!isOrganizer||!waiting||!String(e.gameKey).startsWith('football'));
    $('freeMediaCamera').classList.toggle('hidden',!state.spectator);root.querySelector('[data-media-cam="hud"]').textContent=state.mediaHudHidden?'ПОКАЗАТЬ HUD':'СКРЫТЬ HUD';
    const target=state.spectatorTarget&&(state.room?.players||[]).find(p=>p.id===state.spectatorTarget);root.dataset.camera=target?target.name:'overview';
  }

  function draw(){
    if(state.minigame&&['running','result'].includes(state.minigame.status)){drawMinigameArena();return;}
    ctx.clearRect(0,0,W,H);
    const zoom=state.spectator?.74:clamp(.82-Math.min(1,car.speed/580)*.10,.68,.85);
    let cx=car.x,cy=car.y;
    if(state.spectator){const target=state.spectatorTarget?state.remotes.get(state.spectatorTarget):null;if(target){cx=target.x;cy=target.y;}else if(state.liveEvent?.zone){cx=Number(state.liveEvent.zone.x)||cx;cy=Number(state.liveEvent.zone.y)||cy;}else if(state.mediaEvent?.gameKey==='drift_battle'){cx=ZONES.drift.x;cy=ZONES.drift.y;}else if(state.mediaEvent?.gameKey==='koth'){cx=ZONES.koth.x;cy=ZONES.koth.y;}}
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(zoom,zoom);
    ctx.translate(-cx,-cy);
    CITY.draw(ctx,{x:cx-W/(2*zoom),y:cy-H/(2*zoom),w:W/zoom,h:H/zoom});
    drawZone(ctx,ZONES.crews,'#a9ff5a','КЛАНЫ');
    drawZone(ctx,ZONES.drag,'#67c6ff','DRAG');
    drawZone(ctx,ZONES.speed,'#f6e75d','SPEED');
    drawZone(ctx,ZONES.drift,'#c678ff','DRIFT BATTLE');
    drawZone(ctx,ZONES.koth,'#ffad5a','KOTH');
    drawZone(ctx,ZONES.levels,'#ffd86a','LEVELS');
    drawZone(ctx,ZONES.garage,'#8dff49','GARAGE');
    // The venue apron itself draws the interaction ring. Do not paint a second
    // independent beacon over it; the same center/radius drives the prompt.
    drawZone(ctx,ZONES.meet,'#8dff49','CAR MEET');
    if(state.liveEvent?.activity==='koth'&&state.liveEvent.zone){drawZone(ctx,{...state.liveEvent.zone,kind:'koth'},state.liveEvent.finalZone?'#ffd86a':'#ff8f4f',state.liveEvent.finalZone?'FINAL ZONE':'ACTIVE ZONE');}
    if(state.waypoint)drawWaypoint(ctx,state.waypoint);
    const viewHalfW=W/(2*zoom)+180,viewHalfH=H/(2*zoom)+180;for(const [id,r] of state.remotes){if(Math.abs(r.x-cx)>viewHalfW||Math.abs(r.y-cy)>viewHalfH)continue;const mg=(state.room?.activities?.minigames||[]).find(e=>e?.status==='running'&&e.participants?.includes(id));if(mg)continue;drawVisualCar(ctx,r.visual,r.x,r.y,r.angle,r.name||'RACER',false,colorFor(id),r.owner,r.level||0,r.adminLevel||0);}
    const me=state.room?.players?.find(p=>p.id===state.playerId);if(!state.spectator)drawVisualCar(ctx,state.playerVisual,car.x,car.y,car.angle,me?.name||accountName(),true,'#a9ff5a',me?.owner===true,me?.level??state.progress.level??0,me?.adminLevel||0);
    ctx.restore();
    if(!$('freeMapPanel').classList.contains('hidden')&&performance.now()-lastMapDraw>80){lastMapDraw=performance.now();drawMiniMap();}
  }

  function drawZone(c,z,color,label){
    c.save();
    c.strokeStyle=color;c.lineWidth=3;c.setLineDash([12,18]);c.globalAlpha=.55;
    c.beginPath();c.arc(z.x,z.y,Math.min(z.r,80),0,TAU);c.stroke();c.setLineDash([]);
    if(z.kind==='meet'){c.restore();return;}
    const lx=z.x+(Number(z.labelOffset?.x)||0),ly=z.y+(Number(z.labelOffset?.y)||0);
    c.globalAlpha=.94;c.fillStyle='#243d3de8';
    roundRect(c,lx-66,ly-119,132,30,8,true,false);
    c.fillStyle=color;c.font='900 15px system-ui';c.textAlign='center';c.fillText(label,lx,ly-99);
    c.restore();
  }

  function drawVisualCar(c,visual,x,y,a,name,me,fallbackColor,owner=false,level=0,adminLevel=0){
    const visualPlayer=state.room?.players?.find(p=>p.name===name),queen=!owner&&isQueenName(name),media=!owner&&!queen&&visualPlayer?.media===true,rank=!owner&&!queen&&!media?adminPrefix(adminLevel):null;
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
    let badgeWidth=0;if(owner||queen||media)badgeWidth=65;else if(rank){c.font='900 10px system-ui';badgeWidth=Math.max(58,Math.ceil(c.measureText(rank.label).width)+18);c.font='900 14px system-ui';}
    const total=nameWidth+badgeWidth+20,left=x-total/2;c.fillStyle='#101a1eef';roundRect(c,left,y-52,total,26,8,true,false);
    if(owner){
      c.shadowColor='#ff304f';c.shadowBlur=9;c.fillStyle='#b51232';roundRect(c,left+4,y-48,57,18,5,true,false);c.shadowBlur=0;
      c.strokeStyle='#ff687c';c.lineWidth=1;roundRect(c,left+4,y-48,57,18,5,false,true);
      c.fillStyle='#fff0f2';c.font='900 10px system-ui';c.textAlign='center';c.fillText('OWNER',left+32.5,y-35);
    }else if(queen){
      c.shadowColor='#ff4fbd';c.shadowBlur=11;c.fillStyle='#b51678';roundRect(c,left+4,y-48,57,18,5,true,false);c.shadowBlur=0;
      c.strokeStyle='#ff86d2';c.lineWidth=1;roundRect(c,left+4,y-48,57,18,5,false,true);
      c.fillStyle='#fff0fa';c.font='900 10px system-ui';c.textAlign='center';c.fillText('QUEEN',left+32.5,y-35);
    }else if(media){
      c.shadowColor='#42e8ff';c.shadowBlur=11;c.fillStyle='#0b6375';roundRect(c,left+4,y-48,57,18,5,true,false);c.shadowBlur=0;
      c.strokeStyle='#69f0ff';c.lineWidth=1;roundRect(c,left+4,y-48,57,18,5,false,true);
      c.fillStyle='#edfdff';c.font='900 10px system-ui';c.textAlign='center';c.fillText('MEDIA',left+32.5,y-35);
    }else if(rank){
      const w=badgeWidth-8;c.shadowColor=rank.glow;c.shadowBlur=9;c.fillStyle=rank.fill;roundRect(c,left+4,y-48,w,18,5,true,false);c.shadowBlur=0;c.strokeStyle=rank.stroke;c.lineWidth=1;roundRect(c,left+4,y-48,w,18,5,false,true);c.fillStyle=rank.text;c.font='900 10px system-ui';c.textAlign='center';c.fillText(rank.label,left+4+w/2,y-35);
    }
    c.font='900 14px system-ui';c.textAlign='left';c.fillStyle=owner?'#ffd6dd':queen?'#ffd9f1':media?'#d9fbff':me?'#dfffcb':'#dce9e5';
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
    // V70: at map zoom use the same world-resolution vector tiles as the car
    // camera. The legacy 1500x900 overview would blur at 2x–4x map zoom.
    if(mapView.zoom>=1.75){
      mctx.save();mctx.scale(scale,scale);
      CITY.draw(mctx,{x:-ox/scale,y:-oy/scale,w:mapCanvas.width/scale,h:mapCanvas.height/scale});
      mctx.restore();
    }else CITY.drawOverview(mctx,vw,vh);

    if(state.waypoint){
      mctx.strokeStyle='#8dff49';mctx.setLineDash([10,8]);mctx.lineWidth=2;
      mctx.beginPath();mctx.moveTo(car.x*sx,car.y*sy);mctx.lineTo(state.waypoint.x*sx,state.waypoint.y*sy);mctx.stroke();mctx.setLineDash([]);
    }

    for(const z of Object.values(ZONES))drawMapZone(mctx,z,sx,sy);
    for(const r of state.remotes.values())drawMapMarker(mctx,r.x*sx,r.y*sy,r.angle,'#77c7ff');
    if(state.waypoint){mctx.strokeStyle='#8dff49';mctx.lineWidth=2;mctx.strokeRect(state.waypoint.x*sx-7,state.waypoint.y*sy-7,14,14);}
    if(!state.spectator)drawMapMarker(mctx,car.x*sx,car.y*sy,car.angle,'#ffffff',true);
    mctx.restore();
  }

  function drawMapZone(c,z,sx,sy){
    const color=z.kind==='drag'?'#67c6ff':z.kind==='speed'?'#f6e75d':(z.kind==='drift'||z.kind==='driftBattle')?'#c678ff':z.kind==='koth'?'#ff9c52':z.kind==='levels'?'#ffd86a':z.kind==='minigame'?'#69dcff':z.kind==='garage'?'#8dff49':'#8dff49';
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
    if(e.code==='Escape'){if(!$('freeChatPanel').classList.contains('hidden')||!$('freeMapPanel').classList.contains('hidden')||!$('freeLevelsPanel').classList.contains('hidden')||!$('freeMinigamePanel').classList.contains('hidden')){toggleChat(false);toggleMap(false);toggleLevels(false);toggleMinigamePanel(false);}else togglePause(!state.paused);}
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

  let pauseTapLockUntil=0,suppressNextPauseClick=false,suppressPauseClickUntil=0;
  const lockPauseTaps=(ms=700)=>{pauseTapLockUntil=Math.max(pauseTapLockUntil,performance.now()+ms);};
  const pauseTapLocked=()=>performance.now()<pauseTapLockUntil;
  const suppressFollowupClick=(ms=700)=>{suppressNextPauseClick=true;suppressPauseClickUntil=performance.now()+ms;};
  document.addEventListener('click',e=>{
    if(!suppressNextPauseClick)return;
    if(performance.now()>suppressPauseClickUntil){suppressNextPauseClick=false;return;}
    suppressNextPauseClick=false;e.preventDefault();e.stopImmediatePropagation();
  },true);
  function bindPauseTap(el,handler){
    if(!el||typeof handler!=='function')return;
    let pointerId=null;
    if(window.PointerEvent){
      el.addEventListener('pointerdown',e=>{if(pauseTapLocked()||(e.pointerType==='mouse'&&e.button!==0))return;pointerId=e.pointerId;try{el.setPointerCapture(e.pointerId);}catch(_){}});
      el.addEventListener('pointerup',e=>{if(pointerId!==e.pointerId)return;pointerId=null;e.preventDefault();e.stopPropagation();lockPauseTaps();suppressFollowupClick();handler(e);});
      el.addEventListener('pointercancel',e=>{if(pointerId===e.pointerId)pointerId=null;});
      el.addEventListener('lostpointercapture',e=>{if(pointerId===e.pointerId)pointerId=null;});
    }
    el.addEventListener('click',e=>{
      if(pauseTapLocked()){e.preventDefault();e.stopImmediatePropagation();return;}
      lockPauseTaps();handler(e);
    });
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
  bindPauseTap($('freePauseBtn'),()=>togglePause(true));
  bindPauseTap($('freePauseContinue'),()=>togglePause(false));
  bindPauseTap($('freePauseControls'),()=>{
    if(!state.active||!state.paused)return;
    const panel=$('freePausePanel');panel?.classList.add('hidden');panel?.setAttribute('aria-hidden','true');
    // Keep Free Roam paused while editing. The editor writes one shared layout that is
    // immediately applied to both Solo/Online race controls and Free Roam controls.
    window.VelocityControlLayout?.open?.({source:'freeRoam'});
  });
  addEventListener('velocity-control-layout-close',()=>{
    if(state.active&&state.paused){
      // iOS Safari may emit a delayed synthetic click after the editor disappears.
      // Lock the newly revealed pause buttons so that tap cannot reopen the editor
      // or hit EXIT underneath the closing editor.
      lockPauseTaps(750);
      const panel=$('freePausePanel');panel?.classList.remove('hidden');panel?.setAttribute('aria-hidden','false');
      window.VelocityControlLayout?.apply?.();
    }
  });
  addEventListener('velocity-control-layout-change',()=>window.VelocityControlLayout?.apply?.());
  bindPauseTap($('freePauseChat'),()=>{togglePause(false);toggleChat(true);});
  bindPauseTap($('freePauseMap'),()=>{togglePause(false);toggleMap(true);});
  bindPauseTap($('freePauseLeave'),()=>{
    // Suppress Safari's follow-up click before Free Roam is hidden; otherwise it can
    // land on a menu/settings control at the same screen coordinates.
    lockPauseTaps(900);leave();
  });
  $('freeLevelPill')?.addEventListener('click',()=>toggleLevels());
  $('freeLevelsClose')?.addEventListener('click',()=>toggleLevels(false));
  $('freeDragBetClose')?.addEventListener('click',()=>toggleDragBetPanel(false));
  $('freeDragBetCancel')?.addEventListener('click',()=>toggleDragBetPanel(false));
  $('freeDragBetChoices')?.addEventListener('click',event=>{const button=event.target.closest?.('[data-wager]');if(!button||button.disabled)return;const amount=Number(button.dataset.wager)||0;if(!DRAG_WAGER_OPTIONS.includes(amount))return;state.dragWager=amount;renderDragBetPanel();});
  $('freeDragBetJoin')?.addEventListener('click',()=>joinDragQueue());
  $('freeEventLeave')?.addEventListener('click',()=>{const e=state.liveEvent;if(!e||!['waiting','countdown','running'].includes(e.status))return;if(!confirm('Выйти из '+eventTitle(e.activity)+'? Награда за этот ивент не будет выдана.'))return;if(send({type:'activity_leave',v:1,activity:e.activity,eventId:e.id})){$('freeEventLeave').disabled=true;setTimeout(()=>{if($('freeEventLeave'))$('freeEventLeave').disabled=false;},1500);}});
  $('freeMinigameClose')?.addEventListener('click',()=>toggleMinigamePanel(false));
  $('freeMinigameToggle')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(state.minigame?.status!=='running')return;state.minigameHudExpanded=!state.minigameHudExpanded;state.minigameHudAutoCollapseAt=0;renderMinigameHud();});
  $('freeMinigameLeave')?.addEventListener('click',()=>{const e=state.minigame;if(!e||!['waiting','countdown','running'].includes(e.status))return;if(!confirm('Выйти из '+minigameTitle(e.gameKey)+'? Награда за этот матч не будет выдана.'))return;if(send({type:'activity_leave',v:1,activity:'minigame',gameKey:e.gameKey,eventId:e.id})){$('freeMinigameLeave').disabled=true;setTimeout(()=>{if($('freeMinigameLeave'))$('freeMinigameLeave').disabled=false;},1500);}});
  $('freeMinigameOwnerStart')?.addEventListener('click',()=>{const e=state.minigame;if(!e||!ownPlayer()?.owner||!['waiting','countdown'].includes(e.status))return;const b=$('freeMinigameOwnerStart');if(b)b.disabled=true;if(!send({type:'owner_minigame_start',v:1,eventId:e.id,gameKey:e.gameKey})){if(b)b.disabled=false;return;}setBanner('OWNER · ЗАПУСК МИНИ-ИГРЫ',1800);});
  $('freeMapBtn').addEventListener('click',()=>toggleMap());
  $('freeMapClose').addEventListener('click',()=>toggleMap(false));
  $('freeMapClear')?.addEventListener('click',()=>{state.waypoint=null;syncMapClear();drawMiniMap();setBanner('МЕТКА УДАЛЕНА',1800);});
  $('freeLeaveBtn').addEventListener('click',leave);
  $('freeRefreshBtn').addEventListener('click',loadServers);
  $('freeServersBackBtn').addEventListener('click',closeBrowser);
  $('onlineFreeModeBtn')?.addEventListener('click',openBrowser);
  addEventListener('pagehide',()=>{if(state.active){state.intentionalClose=true;send({type:'leave',v:1});leaveBeacon();try{state.ws?.close(1000,'pagehide');}catch{}}},{capture:true});
  addEventListener('pageshow',e=>{if(e.persisted&&state.active&&!state.ws)leave(false);},{capture:true});
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
  window.VelocityFreeRoam={open:openBrowser,joinMediaEvent,leave,get active(){return state.active;},state};
})();
