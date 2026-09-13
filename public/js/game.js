(function(){
  'use strict';
  const R=window.Racing, clamp=R.clamp, lerp=R.lerp;
  const PHYS=R.RACE_PHYSICS||{maxSpeed:510,accel:268,brakePower:368,turnRate:2.40};
  const $=id=>document.getElementById(id);
  const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});

  const UI={
    menu:$('menu'),play:$('playBtn'),menuBestScore:$('menuBestScore'),menuBestLap:$('menuBestLap'),menuMaxLaps:$('menuMaxLaps'),menuMute:$('menuMute'),
    setup:$('setup'),setupBack:$('setupBackBtn'),startRace:$('startRaceBtn'),botsMinus:$('botsMinus'),botsPlus:$('botsPlus'),botCount:$('botCountValue'),botsInline:$('botsSummaryInline'),
    setupBots:$('setupBotsSummary'),setupLaps:$('setupLapsSummary'),setupDifficulty:$('setupDifficultySummary'),setupReward:$('setupRewardEstimate'),lapsSelector:$('lapsSelector'),difficultySelector:$('difficultySelector'),
    countdown:$('countdown'),hud:$('hud'),miniMap:$('miniMap'),pos:$('posText'),lap:$('lapText'),speed:$('speedText'),score:$('scoreText'),lapTime:$('lapTime'),bestLap:$('bestLap'),
    controls:$('controls'),pauseBtn:$('pauseBtn'),pause:$('pause'),continueBtn:$('continueBtn'),pauseSettingsBtn:$('pauseSettingsBtn'),restartBtn:$('restartBtn'),mainMenuBtn:$('mainMenuBtn'),pauseMute:$('pauseMute'),toasts:$('toastLayer'),
    settings:$('settings'),settingsBtn:$('settingsBtn'),settingsBack:$('settingsBackBtn'),settingsSelected:$('settingsSelectedMode'),settingsMessage:$('settingsMessage'),controlModeSelector:$('controlModeSelector'),tiltSettings:$('tiltSettings'),tiltSensitivitySelector:$('tiltSensitivitySelector'),rootOpen:$('rootOpenBtn'),
    finish:$('finish'),finishCard:document.querySelector('.finish-card'),finishPlace:$('finishPlace'),finishPosition:$('finishPosition'),finishLaps:$('finishLaps'),finishTime:$('finishTime'),finishBestLap:$('finishBestLap'),finishScore:$('finishScore'),finishDifficulty:$('finishDifficultyBadge'),again:$('againBtn'),finishMenu:$('finishMenuBtn')
  };

  const STORAGE='velocityApex.v1';
  const LAP_OPTIONS=[3,5,7,10,15];
  const DIFFICULTY_LABELS=R.DIFFICULTY_LABELS;
  const palette=[
    ['#80ff44','#f5f5ed'],['#ff405f','#ffe45d'],['#3bb8ff','#f7f7f1'],['#9c63ff','#ff66c4'],['#ff8a34','#fff1d8'],['#21d7c5','#eaffff'],['#f5d94d','#20252b'],
    ['#e9edf2','#ec3c50'],['#ff5be7','#d7ff43'],['#6d7cff','#f2f2ff'],['#36dd6f','#13252b'],['#ff6548','#72e9ff'],['#d8ff4f','#4b2eff'],['#f0a4ff','#272a31']
  ];
  const OFFLINE_BOT_PAINTS=Object.freeze([
    ['#80ff44','#efffe7'],['#ff405f','#fff0f2'],['#3bb8ff','#eef9ff'],['#ff8a34','#fff1d8'],['#21d7c5','#eaffff'],['#ff5fbf','#ffe7f5'],['#f5d94d','#25262a'],
    ['#9c63ff','#f3ecff'],['#e9edf2','#707983'],['#ff6548','#fff0ea'],['#6d7cff','#f2f2ff'],['#36dd6f','#13252b'],['#d8ff4f','#4b2eff']
  ]);

  function loadSave(){
    try{return R.normalizeSave(JSON.parse(localStorage.getItem(STORAGE)||'{}'));}
    catch(e){return R.normalizeSave({});}
  }
  let saveWarningShown=false;
  function writeSave(){try{localStorage.setItem(STORAGE,JSON.stringify(save));}catch(e){if(!saveWarningShown){saveWarningShown=true;toast('СОХРАНЕНИЕ НЕДОСТУПНО · проверьте хранилище браузера','bad');}}}
  function fmt(ms){
    if(!ms||!isFinite(ms))return'--:--.---';
    const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,x=Math.floor(ms%1000);
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(x).padStart(3,'0');
  }
  function ordinal(n){
    const m=n%100;if(m>=11&&m<=13)return n+'TH';
    switch(n%10){case 1:return n+'ST';case 2:return n+'ND';case 3:return n+'RD';default:return n+'TH';}
  }

  const save=loadSave();
  const raceSettings={bots:save.botCount,laps:save.raceLaps,difficulty:save.difficulty,trackId:save.trackId};
  const audio=new R.AudioSystem();audio.setMuted(save.muted);
  let track=new R.Track(R.TRACKS[raceSettings.trackId]);
  let raceRewardClaimed=false,catalogReturn='menu',settingsReturn='menu',settingsNotice='',settingsNoticeKind='';
  let raceMode='offline',onlineRace=null,onlineLocalPaused=false,onlineFinishSent=false,onlineLocalFinished=false;

  let W=innerWidth,H=innerHeight,DPR=1,last=performance.now(),state='menu',raceTime=0,lapTime=0,raceBestLap=0,score=0,scoreCarry=0;
  let cars=[],rankBuffer=[],finishOrder=[],finishCandidates=[],player=null,demoCars=[],demoT=0,prevRank=1,shake=0,impactCooldown=0,grassSoundCooldown=0,countdownToken=0;
  let cam={x:0,y:0,rot:0,zoom:.65,screenY:.47,look:90};
  const input={left:false,right:false,gas:false,brake:false};
  const playerControl={steer:0,throttle:0,brake:0};
  const controlInput=new R.InputController({
    mode:save.controlMode,tiltSensitivity:save.tiltSensitivity,
    onModeChange:mode=>{save.controlMode=mode;writeSave();syncSettingsUI();},
    onSensitivityChange:value=>{save.tiltSensitivity=value;writeSave();syncSettingsUI();},
    onNotice:(message,kind)=>controlNotice(message,kind)
  });
  const particles=Array.from({length:190},()=>({active:false,x:0,y:0,vx:0,vy:0,life:0,max:1,size:2,type:'dust'}));
  let pCursor=0;
  const skid=Array.from({length:220},()=>({active:false,x1:0,y1:0,x2:0,y2:0,life:0}));let skidCursor=0,skidTick=0;
  let miniMapState=null;

  function resize(){
    W=Math.max(1,innerWidth);H=Math.max(1,innerHeight);DPR=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0);
    if(UI.miniMap&&!UI.hud.classList.contains('hidden'))prepareMiniMap();
  }
  resize();addEventListener('resize',resize,{passive:true});addEventListener('orientationchange',()=>setTimeout(resize,100),{passive:true});

  function initDemo(){
    demoCars=[];for(let i=0;i<7;i++){const c=new R.Car({id:i,color:palette[i][0],accent:palette[i][1]});c.demoOffset=i/7;demoCars.push(c);}
  }
  initDemo();

  function updateMuteUI(){
    const label=save.muted?'SOUND OFF':'SOUND ON';
    for(const el of [UI.menuMute,UI.pauseMute]){
      const text=el.querySelector('strong');if(text)text.textContent=label;else el.textContent=label;
      el.classList.toggle('muted',save.muted);el.setAttribute('aria-pressed',save.muted?'true':'false');
    }
  }
  function updateMenuStats(){
    $('menuCredits').textContent=save.credits.toLocaleString()+' CR';
    UI.menuBestScore.textContent=Math.floor(save.bestScore).toLocaleString();UI.menuBestLap.textContent=fmt(save.bestLap);UI.menuMaxLaps.textContent=save.maxLaps;updateMuteUI();
  }
  function persistSettings(){
    save.botCount=raceSettings.bots;save.raceLaps=raceSettings.laps;save.difficulty=raceSettings.difficulty;save.trackId=raceSettings.trackId;writeSave();
  }
  function syncSetupUI(){
    $('setupTrackSummary').textContent=R.TRACKS[raceSettings.trackId].name;
    $('loadoutLivery').textContent=R.LIVERIES[save.selectedLivery].name;
    $('loadoutEffect').textContent=R.EFFECTS[save.selectedEffect].name;
    $('trackCards').querySelectorAll('button').forEach(btn=>{const active=btn.dataset.track===raceSettings.trackId;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
    UI.botCount.textContent=raceSettings.bots;UI.botsInline.textContent=raceSettings.bots;UI.setupBots.textContent=raceSettings.bots;UI.setupLaps.textContent=raceSettings.laps;
    UI.setupDifficulty.textContent=DIFFICULTY_LABELS[raceSettings.difficulty];
    const minReward=R.raceReward(raceSettings,raceSettings.bots+1),maxReward=R.raceReward(raceSettings,1);
    UI.setupReward.textContent=minReward.toLocaleString('ru-RU')+'–'+maxReward.toLocaleString('ru-RU')+' CR';
    UI.botsMinus.disabled=raceSettings.bots<=1;UI.botsPlus.disabled=raceSettings.bots>=13;
    UI.lapsSelector.querySelectorAll('button').forEach(btn=>{const active=+btn.dataset.laps===raceSettings.laps;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',active?'true':'false');});
    UI.difficultySelector.querySelectorAll('button').forEach(btn=>{const active=btn.dataset.difficulty===raceSettings.difficulty;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',active?'true':'false');});
  }
  function loadTrack(){
    if(track.id!==raceSettings.trackId){track.release();track=new R.Track(R.TRACKS[raceSettings.trackId]);}
  }
  $('trackCards').innerHTML=Object.values(R.TRACKS).map(config=>{
    const t=new R.Track(config),minX=Math.min(...t.samples.map(p=>p.x)),maxX=Math.max(...t.samples.map(p=>p.x)),minY=Math.min(...t.samples.map(p=>p.y)),maxY=Math.max(...t.samples.map(p=>p.y)),b={minX,minY,maxX,maxY},w=maxX-minX,h=maxY-minY,scale=Math.min(160/w,96/h),ox=(180-w*scale)/2,oy=(110-h*scale)/2;
    const xy=p=>((p.x-b.minX)*scale+ox).toFixed(1)+','+((p.y-b.minY)*scale+oy).toFixed(1);
    const start=xy(t.samples[0]).split(',');
    return `<button class="track-card" style="--track-accent:${config.theme.accent};--track-ground:${config.theme.ground};--track-road:${config.theme.road}" type="button" data-track="${config.id}" data-theme="${config.theme.kind}" aria-label="${config.name}, ${(t.length/1000).toFixed(1)} километра"><div class="track-visual"><svg viewBox="0 0 180 110" aria-hidden="true"><path d="M${t.samples.filter((_,i)=>i%3===0).map(xy).join('L')}Z"/><circle cx="${start[0]}" cy="${start[1]}" r="3"/></svg></div><div class="track-meta"><span>${config.name}</span><small>${config.type} · ${(t.length/1000).toFixed(1)} KM</small><p>${config.description}</p></div><div class="selected-pill">ВЫБРАНО</div></button>`;
  }).join('');
  $('trackCards').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{raceSettings.trackId=btn.dataset.track;loadTrack();syncSetupUI();persistSettings();}));
  const trackHint=document.querySelector('.track-hint');if(trackHint)trackHint.textContent=Object.keys(R.TRACKS).length+' ТРАСС · ЛИСТАЙТЕ →';
  const garage=new R.Garage(save,()=>{writeSave();updateMenuStats();syncSetupUI();});
  let rootConsole=null;
  function syncRootChange(reason){
    if(reason==='reset-progress'){
      raceSettings.bots=save.botCount;raceSettings.laps=save.raceLaps;raceSettings.difficulty=save.difficulty;raceSettings.trackId=save.trackId;loadTrack();
      controlInput.setMode(save.controlMode,{requestPermission:false});controlInput.setSensitivity(save.tiltSensitivity);
    }
    writeSave();updateMenuStats();syncSetupUI();syncSettingsUI();garage.syncFromSave();
  }
  function returnFromRoot(){
    $('rootAuth').classList.add('hidden');$('rootConsole').classList.add('hidden');state='settings';UI.settings.classList.remove('hidden');syncSettingsUI();last=performance.now();
  }
  rootConsole=new R.RootConsole({save,onChange:syncRootChange,onBack:returnFromRoot,onView:()=>{last=performance.now();}});
  function openRoot(){if(state!=='settings')return;state='root';UI.settings.classList.add('hidden');rootConsole.open();last=performance.now();}
  function openCatalog(mode){
    catalogReturn=state==='setup'?'setup':'menu';state=mode;UI.menu.classList.add('hidden');UI.setup.classList.add('hidden');$(mode).classList.remove('hidden');garage.open(mode);
  }
  function closeCatalog(mode){
    state=catalogReturn;$(mode).classList.add('hidden');(state==='setup'?UI.setup:UI.menu).classList.remove('hidden');syncSetupUI();updateMenuStats();
  }
  const openShop=()=>openCatalog('shop'),openGarage=()=>openCatalog('garage');
  $('shopBtn').addEventListener('click',openShop);$('garageBtn').addEventListener('click',openGarage);$('loadoutBtn').addEventListener('click',openGarage);
  $('shopBackBtn').addEventListener('click',()=>closeCatalog('shop'));$('garageBackBtn').addEventListener('click',()=>closeCatalog('garage'));

  function controlNotice(message,kind='warn'){
    settingsNotice=message;settingsNoticeKind=kind;syncSettingsUI();
    if(UI.settings.classList.contains('hidden'))toast(message,kind==='bad'?'warn':'good');
  }
  function syncSettingsUI(){
    if(!UI.settingsSelected)return;
    UI.settingsSelected.textContent=R.CONTROL_MODES[save.controlMode]||R.CONTROL_MODES.arrows;
    UI.controlModeSelector.querySelectorAll('button').forEach(btn=>{const active=btn.dataset.controlMode===save.controlMode;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
    UI.tiltSensitivitySelector.querySelectorAll('button').forEach(btn=>{const active=btn.dataset.tiltSensitivity===save.tiltSensitivity;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
    UI.tiltSettings.classList.toggle('hidden',save.controlMode!=='tilt');
    const defaults={arrows:'Стрелки слева, GAS и BRAKE справа. Поддерживается одновременное удерживание.',tilt:'Держите iPhone в удобном нейтральном положении. Небольшие движения фильтруются.',wheel:'Коснитесь руля и поворачивайте палец. После отпускания руль плавно вернётся в центр.'};
    UI.settingsMessage.textContent=settingsNotice||defaults[save.controlMode]||defaults.arrows;
    UI.settingsMessage.classList.toggle('warning',settingsNoticeKind==='bad');
  }
  function openSettings(){
    settingsReturn=state==='paused'?'paused':'menu';settingsNotice='';settingsNoticeKind='';controlInput.setActive(false);state='settings';
    UI.menu.classList.add('hidden');UI.pause.classList.add('hidden');UI.settings.classList.remove('hidden');syncSettingsUI();last=performance.now();
  }
  function closeSettings(){
    if(state!=='settings')return;UI.settings.classList.add('hidden');state=settingsReturn;
    if(state==='paused')UI.pause.classList.remove('hidden');else UI.menu.classList.remove('hidden');
    syncSettingsUI();last=performance.now();
  }
  async function selectControlMode(mode){
    settingsNotice='';settingsNoticeKind='';const ok=await controlInput.setMode(mode,{requestPermission:mode==='tilt'});save.controlMode=controlInput.mode;writeSave();
    if(ok&&mode==='tilt'){settingsNotice='Датчик наклона подключён. Текущее положение телефона принято за нейтраль.';settingsNoticeKind='';}
    syncSettingsUI();
  }

  function installAppInteractionGuards(){
    const app=$('app');if(!app)return;
    const editableSelector='input,textarea,select,[contenteditable="true"]';
    const isEditable=target=>!!(target&&target.closest&&target.closest(editableSelector));
    const asElement=node=>node&&node.nodeType===1?node:node?.parentElement||null;
    const clearProtectedSelection=()=>{
      const selection=window.getSelection?.();if(!selection||selection.isCollapsed)return;
      const anchor=asElement(selection.anchorNode),focus=asElement(selection.focusNode);
      const protectedAnchor=anchor&&app.contains(anchor)&&!isEditable(anchor);
      const protectedFocus=focus&&app.contains(focus)&&!isEditable(focus);
      if(protectedAnchor||protectedFocus)selection.removeAllRanges();
    };
    const suppress=e=>{
      if(isEditable(e.target))return;
      if(e.cancelable)e.preventDefault();
      if(e.type==='selectstart'||e.type==='dblclick'||e.type==='contextmenu'){
        clearProtectedSelection();
        requestAnimationFrame(clearProtectedSelection);
      }
    };
    const hardenMedia=root=>{
      if(!root||root.nodeType!==1)return;
      if(root.matches?.('img,svg'))root.setAttribute('draggable','false');
      root.querySelectorAll?.('img,svg').forEach(el=>el.setAttribute('draggable','false'));
    };
    // Never globally cancel touchstart/touchmove/touchend: race controls depend on
    // independent pointers and shop/settings panels need their native pan/scroll.
    for(const type of ['selectstart','dragstart','contextmenu','dblclick','copy'])app.addEventListener(type,suppress,{capture:true,passive:false});
    hardenMedia(app);
    // Shop/garage/track/ROOT markup is rendered dynamically. Keep newly inserted
    // IMG/SVG nodes non-draggable instead of only hardening the initial DOM snapshot.
    const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(hardenMedia)));
    observer.observe(app,{childList:true,subtree:true});
    // WebKit can occasionally create a range after a rapid double tap despite the
    // originating event being cancelled. Remove only ranges inside protected UI.
    document.addEventListener('selectionchange',clearProtectedSelection,{passive:true});
  }
  installAppInteractionGuards();
  updateMenuStats();syncSetupUI();syncSettingsUI();writeSave();

  // Use pointer/touch release directly for game UI taps. In iOS Safari a synthetic
  // click can be cancelled when another finger is holding a control or touchmove is
  // prevented, so relying on click alone makes Pause/Continue feel intermittent.
  function bindTap(el,handler){
    let activePointer=null,lastHandled=-Infinity,touchActive=false;
    if(window.PointerEvent){
      el.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;activePointer=e.pointerId;try{el.setPointerCapture(e.pointerId);}catch(_){}});
      el.addEventListener('pointerup',e=>{if(activePointer!==e.pointerId)return;activePointer=null;e.preventDefault();lastHandled=performance.now();handler(e);});
      el.addEventListener('pointercancel',e=>{if(activePointer===e.pointerId)activePointer=null;});
      el.addEventListener('lostpointercapture',e=>{if(activePointer===e.pointerId)activePointer=null;});
    }else{
      el.addEventListener('touchstart',()=>{touchActive=true;},{passive:true});
      el.addEventListener('touchend',e=>{if(!touchActive)return;touchActive=false;e.preventDefault();lastHandled=performance.now();handler(e);},{passive:false});
      el.addEventListener('touchcancel',()=>{touchActive=false;},{passive:true});
    }
    el.addEventListener('click',e=>{if(performance.now()-lastHandled<700){e.preventDefault();return;}handler(e);});
  }

  function setMute(v){save.muted=v;audio.setMuted(v);writeSave();updateMuteUI();}
  bindTap(UI.menuMute,()=>{audio.init();setMute(!save.muted);});
  bindTap(UI.pauseMute,()=>setMute(!save.muted));

  bindTap(UI.botsMinus,()=>{if(raceSettings.bots<=1)return;raceSettings.bots--;syncSetupUI();persistSettings();});
  bindTap(UI.botsPlus,()=>{if(raceSettings.bots>=13)return;raceSettings.bots++;syncSetupUI();persistSettings();});
  UI.lapsSelector.querySelectorAll('button').forEach(btn=>bindTap(btn,()=>{const value=+btn.dataset.laps;if(!LAP_OPTIONS.includes(value))return;raceSettings.laps=value;syncSetupUI();persistSettings();}));
  UI.difficultySelector.querySelectorAll('button').forEach(btn=>bindTap(btn,()=>{const value=btn.dataset.difficulty;if(!DIFFICULTY_LABELS[value])return;raceSettings.difficulty=value;syncSetupUI();persistSettings();}));

  function createCars(){
    cars=[];finishOrder.length=0;finishCandidates.length=0;player=null;
    const names=['NOVA','VECTOR','PULSE','KITE','EMBER','VOLT','RIFT','ION','COMET','ARC','ZENITH','FLUX','NEON','APEX'];
    const total=raceSettings.bots+1,playerGrid=Math.floor(total/2);
    let botName=0,botPaint=0;
    for(let i=0;i<total;i++){
      const isPlayer=i===playerGrid;
      // Player and bots share exactly the same physical performance. Difficulty is
      // produced by the driver model/racing line, never max-speed or acceleration cheats.
      const c=new R.Car({
        id:i,name:isPlayer?'YOU':names[botName++],player:isPlayer,color:palette[i%palette.length][0],accent:palette[i%palette.length][1],
        maxSpeed:PHYS.maxSpeed,accel:PHYS.accel,brakePower:PHYS.brakePower,turnRate:PHYS.turnRate
      });
      const prog=-(65+Math.floor(i/2)*140)/track.length,lane=i%2===0?-34:34;
      c.place(track,prog,lane);c.raceFinished=false;c.finishPlace=0;c.finishTime=0;c._impactThisFrame=false;
      if(!isPlayer){
        c.ai=new R.AIController(c,i,raceSettings.difficulty);c._control=c.ai.output;
        c.setLoadout('apexLime','standard');
        const paint=OFFLINE_BOT_PAINTS[botPaint++%OFFLINE_BOT_PAINTS.length];
        c.setPaintOverride({primary:paint[0],secondary:paint[1],accent:paint[1],stripe:paint[1]});
      }else {player=c;c.setLoadout(save.selectedLivery,save.selectedEffect);}
      cars.push(c);
    }
    rankBuffer=cars.slice();updateRanks();prevRank=player.rank;
    cam.x=player.x;cam.y=player.y;cam.rot=-Math.PI/2-player.angle;cam.screenY=.47;cam.look=90;lapTime=0;raceTime=0;raceBestLap=0;score=0;scoreCarry=0;shake=0;impactCooldown=0;grassSoundCooldown=0;skidTick=0;
    UI.toasts.replaceChildren();particles.forEach(p=>p.active=false);skid.forEach(s=>s.active=false);updateHUD();
  }

  function createOnlineCars(room,localId){
    cars=[];finishOrder.length=0;finishCandidates.length=0;player=null;
    const order=(room.gridOrder&&room.gridOrder.length?room.gridOrder:room.players.filter(p=>p.connected).map(p=>p.id)).slice(0,8);
    for(let i=0;i<order.length;i++){
      const pd=room.players.find(p=>p.id===order[i]);if(!pd)continue;const isPlayer=pd.id===localId;
      const c=new R.Car({id:pd.id,name:pd.name,player:isPlayer,color:palette[i%palette.length][0],accent:palette[i%palette.length][1],maxSpeed:PHYS.maxSpeed,accel:PHYS.accel,brakePower:PHYS.brakePower,turnRate:PHYS.turnRate});
      c.networkId=pd.id;c.setLoadout(pd.liveryId||'apexLime',pd.effectId||'standard');const prog=-(65+Math.floor(i/2)*140)/track.length,lane=i%2===0?-34:34;c.place(track,prog,lane);c.raceFinished=false;c.finishPlace=0;c.finishTime=0;c._impactThisFrame=false;if(isPlayer)player=c;cars.push(c);
    }
    if(!player)return false;rankBuffer=cars.slice();updateRanks();prevRank=player.rank;cam.x=player.x;cam.y=player.y;cam.rot=-Math.PI/2-player.angle;cam.screenY=.47;cam.look=90;lapTime=0;raceTime=0;raceBestLap=0;score=0;scoreCarry=0;shake=0;impactCooldown=0;grassSoundCooldown=0;skidTick=0;UI.toasts.replaceChildren();particles.forEach(p=>p.active=false);skid.forEach(x=>x.active=false);updateHUD();return true;
  }
  function onlineStateFor(c,finished=false){return{x:c.x,y:c.y,vx:c.vx,vy:c.vy,angle:c.angle,speed:c.speed,yawRate:c.yawRate||0,progress:Math.max(0,Math.min(1,c.progress||0)),laps:Math.max(0,Math.min(raceSettings.laps,c.laps||0)),checkpoint:c.checkpoint||0,steer:playerControl.steer||0,throttle:finished||onlineLocalPaused?0:(playerControl.throttle||0),brake:finished||onlineLocalPaused?0:(playerControl.brake||0),finished:!!finished,liveryId:c.liveryId||'apexLime',effectId:c.effect||'standard'};}
  function syncOnlineRoomCars(room){
    if(!room)return;onlineRace.room=room;for(const c of cars){const pd=room.players.find(p=>p.id===c.networkId);if(!pd)continue;c.finishPlace=pd.finishPlace||0;c.finishTime=pd.finishTime||0;if(pd.finishPlace)c.raceFinished=true;}
  }
  function updateRemoteCars(){
    if(!onlineRace||!window.VelocityOnline)return;for(const c of cars){if(c===player)continue;const snap=window.VelocityOnline.sampleRemote(c.networkId);if(!snap)continue;if(!Number.isFinite(snap.x)||!Number.isFinite(snap.y)||!Number.isFinite(snap.angle))continue;c.x=snap.x;c.y=snap.y;c.vx=Number.isFinite(snap.vx)?snap.vx:0;c.vy=Number.isFinite(snap.vy)?snap.vy:0;c.angle=snap.angle;c.speed=Number.isFinite(snap.speed)?snap.speed:Math.hypot(c.vx,c.vy);c.yawRate=Number.isFinite(snap.yawRate)?snap.yawRate:0;c.progress=Math.max(0,Math.min(1,snap.progress||0));c.laps=Math.max(0,Math.min(raceSettings.laps,snap.laps||0));c.checkpoint=snap.checkpoint||0;c.steerVisual=snap.steer||0;c.throttleVisual=snap.throttle||0;c.brakeVisual=snap.brake||0;if(snap.finished)c.raceFinished=true;}
  }
  function handleOnlinePlayerLap(){
    const lapMs=lapTime;lapTime=0;if(!raceBestLap||lapMs<raceBestLap)raceBestLap=lapMs;if(!save.bestLap||lapMs<save.bestLap){save.bestLap=lapMs;writeSave();toast('NEW BEST LAP','good');}else toast('LAP '+Math.min(player.laps,raceSettings.laps),'good');player.collisionThisLap=false;player.offroadThisLap=false;player.offroadTime=0;audio.lap(false);
  }
  async function startOnlineRace(detail){
    if(!detail?.room||!detail.playerId)return;let tiltFallback=false;if(save.controlMode==='tilt')tiltFallback=!(await controlInput.prepareForRace());
    raceMode='online';onlineLocalPaused=false;onlineFinishSent=false;onlineLocalFinished=false;document.body.classList.add('online-race');onlineRace={room:detail.room,raceId:detail.raceId,raceStartAt:detail.raceStartAt,playerId:detail.playerId};raceSettings.trackId=detail.room.settings.trackId;raceSettings.laps=detail.room.settings.laps;loadTrack();resetInput();if(!createOnlineCars(detail.room,detail.playerId)){mainMenu();return;}if(tiltFallback)toast('НАКЛОН недоступен · включены СТРЕЛКИ','warn');state='onlineCountdown';
    UI.menu.classList.add('hidden');UI.setup.classList.add('hidden');UI.pause.classList.add('hidden');UI.settings.classList.add('hidden');UI.finish.classList.add('hidden');$('onlineFinish').classList.add('hidden');showRaceUI(true);controlInput.setActive(false);setPauseButton(false,false);UI.countdown.classList.remove('hidden');last=performance.now();
  }
  function updateOnlineCountdown(dt){
    if(!onlineRace||!window.VelocityOnline)return;updateRemoteCars();updateCamera(dt);const left=onlineRace.raceStartAt-window.VelocityOnline.client.serverNow();if(left>0){UI.countdown.textContent=String(Math.min(3,Math.max(1,Math.ceil(left/1000))));return;}UI.countdown.textContent='GO!';if(state==='onlineCountdown'){state='onlineRacing';resetInput();if(onlineLocalPaused){controlInput.setActive(false);UI.pause.classList.remove('hidden');UI.controls.classList.add('hidden');setPauseButton(false,true);}else{controlInput.setActive(true);setPauseButton(true,true);}audio.countdown(0);setTimeout(()=>{if(state==='onlineRacing'||state==='onlineFinished')UI.countdown.classList.add('hidden');},520);last=performance.now();}
  }
  function updateOnlineRace(dt){
    if(!onlineRace||!player||!window.VelocityOnline)return;raceTime=Math.max(0,(window.VelocityOnline.client.serverNow()-onlineRace.raceStartAt)/1000);if(!onlineLocalFinished)lapTime+=dt*1000;impactCooldown-=dt;grassSoundCooldown-=dt;skidTick-=dt;updateRemoteCars();
    if(!onlineLocalPaused&&!onlineLocalFinished){controlInput.update(dt);const tc=controlInput.getControl(),ks=(input.right?1:0)-(input.left?1:0);playerControl.steer=ks||tc.steer;playerControl.throttle=input.gas?1:tc.throttle;playerControl.brake=input.brake?1:tc.brake;}else playerControl.steer=playerControl.throttle=playerControl.brake=0;
    const steps=Math.min(MAX_PHYSICS_STEPS,Math.max(1,Math.ceil(dt/PHYSICS_STEP))),stepDt=dt/steps;let playerTrackImpact=0;
    for(let step=0;step<steps&&!onlineLocalFinished;step++){const r=player.update(stepDt,playerControl,track);playerTrackImpact=Math.max(playerTrackImpact,r.impact);if(onlineRace.room.settings.collisions)resolveCarCollisions();if(player.finishedLap){handleOnlinePlayerLap();if(player.laps>=raceSettings.laps){player.laps=raceSettings.laps;player.raceFinished=true;onlineLocalFinished=true;onlineFinishSent=true;window.VelocityOnline.finish(onlineRace.raceId,onlineStateFor(player,true));break;}}}
    if(playerTrackImpact>.05&&impactCooldown<=0){impactCooldown=.16;shake=Math.max(shake,3+playerTrackImpact*10);audio.collision(playerTrackImpact);}
    updateEffects(dt);updateRanks();updateCamera(dt);updateHUD();window.VelocityOnline.sendState(onlineRace.raceId,onlineStateFor(player,onlineLocalFinished));audio.updateEngine(player.speed,onlineLocalPaused||onlineLocalFinished?0:playerControl.throttle,true);
  }
  function resetOnlineMode(){raceMode='offline';onlineRace=null;onlineLocalPaused=false;onlineFinishSent=false;onlineLocalFinished=false;document.body.classList.remove('online-race');$('onlineFinish').classList.add('hidden');$('raceNetStatus').classList.add('hidden');UI.countdown.classList.add('hidden');showRaceUI(false);resetInput();}
  window.addEventListener('velocity-online-start',e=>startOnlineRace(e.detail));
  window.addEventListener('velocity-online-room',e=>{if(!onlineRace||!e.detail?.room)return;const room=e.detail.room;onlineRace.room=room;const ids=new Set(room.players.map(p=>p.id));cars=cars.filter(c=>c===player||ids.has(c.networkId));rankBuffer=cars.slice();syncOnlineRoomCars(room);});
  window.addEventListener('velocity-online-network-status',e=>{const el=$('raceNetStatus');if(raceMode!=='online'||!onlineRace||e.detail?.status==='connected'){el.classList.add('hidden');return;}const s=e.detail?.status;el.dataset.status=s||'';el.textContent=s==='disconnected'?'СОЕДИНЕНИЕ ПОТЕРЯНО':'ПЕРЕПОДКЛЮЧЕНИЕ…';el.classList.remove('hidden');});
  window.addEventListener('velocity-online-wallet',e=>{const balance=Number(e.detail?.balance);if(!Number.isFinite(balance))return;save.credits=Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(balance)));writeSave();updateMenuStats();syncSetupUI();garage.syncFromSave();});
  window.addEventListener('velocity-online-finish-update',e=>{if(!onlineRace)return;syncOnlineRoomCars(e.detail.room);updateRanks();if(e.detail.playerId===onlineRace.playerId){onlineLocalFinished=true;player.raceFinished=true;player.finishPlace=e.detail.finishPlace;player.finishTime=(e.detail.finishTime||0)/1000;state='onlineFinished';resetInput();controlInput.setActive(false);setPauseButton(false,false);UI.controls.classList.add('hidden');window.VelocityOnline.showFinish({place:e.detail.finishPlace,time:fmt(e.detail.finishTime||raceTime*1000),bestLap:fmt(raceBestLap)});}});
  window.addEventListener('velocity-online-lobby',e=>{if(!onlineRace)return;resetOnlineMode();state='menu';last=performance.now();});
  window.addEventListener('velocity-online-exit',()=>{resetOnlineMode();state='menu';last=performance.now();});

  function resetInput(){input.left=input.right=input.gas=input.brake=false;controlInput.reset();playerControl.steer=playerControl.throttle=playerControl.brake=0;if(player)player.throttleVisual=player.brakeVisual=0;}
  function setPauseButton(enabled,visible=true){UI.pauseBtn.disabled=!enabled;UI.pauseBtn.classList.toggle('hidden',!visible);UI.pauseBtn.setAttribute('aria-hidden',visible?'false':'true');}
  function showRaceUI(show){UI.hud.classList.toggle('hidden',!show);UI.controls.classList.toggle('hidden',!show);if(show)prepareMiniMap();else{controlInput.setActive(false);setPauseButton(false,false);}}

  function openSetup(){
    audio.init();state='setup';UI.menu.classList.add('hidden');UI.setup.classList.remove('hidden');UI.finish.classList.add('hidden');syncSetupUI();$('trackCards').querySelector('.selected')?.scrollIntoView?.({block:'nearest',inline:'center'});last=performance.now();
  }
  function backToMenuFromSetup(){
    state='menu';UI.setup.classList.add('hidden');UI.menu.classList.remove('hidden');updateMenuStats();last=performance.now();
  }
  async function startRace(){
    let tiltFallback=false;if(save.controlMode==='tilt')tiltFallback=!(await controlInput.prepareForRace());
    countdownToken++;audio.init();persistSettings();loadTrack();raceRewardClaimed=false;resetInput();createCars();if(tiltFallback)toast('НАКЛОН недоступен · включены СТРЕЛКИ','warn');state='countdown';
    UI.menu.classList.add('hidden');UI.setup.classList.add('hidden');UI.pause.classList.add('hidden');UI.settings.classList.add('hidden');$('rootAuth').classList.add('hidden');$('rootConsole').classList.add('hidden');$('rootConfirm').classList.add('hidden');UI.finish.classList.add('hidden');UI.finishCard.classList.remove('winner');
    showRaceUI(true);controlInput.setActive(false);setPauseButton(false,false);runCountdown();last=performance.now();
  }
  function runCountdown(){
    const token=++countdownToken,seq=['3','2','1','GO!'];let i=0;UI.countdown.classList.remove('hidden');
    const step=()=>{
      if(token!==countdownToken)return;
      UI.countdown.textContent=seq[i];UI.countdown.style.animation='none';void UI.countdown.offsetWidth;UI.countdown.style.animation='countPop .52s ease';audio.countdown(i===3?0:3-i);i++;
      if(i<seq.length)setTimeout(step,650);else setTimeout(()=>{if(token!==countdownToken)return;UI.countdown.classList.add('hidden');state='racing';resetInput();controlInput.setActive(true);setPauseButton(true,true);last=performance.now();},570);
    };step();
  }
  function persistRecords(){
    save.bestScore=Math.max(save.bestScore,Math.floor(score));if(player)save.maxLaps=Math.max(save.maxLaps,Math.min(player.laps,raceSettings.laps));writeSave();updateMenuStats();
  }
  function pauseRace(){
    if(raceMode==='online'&&(state==='onlineRacing'||state==='onlineFinished')){if(onlineLocalFinished)return;onlineLocalPaused=true;resetInput();controlInput.setActive(false);audio.updateEngine(0,0,false);setPauseButton(false,true);UI.pause.classList.remove('hidden');UI.controls.classList.add('hidden');return;}
    if(state!=='racing')return;state='paused';resetInput();controlInput.setActive(false);persistRecords();audio.updateEngine(0,0,false);setPauseButton(false,true);UI.pause.classList.remove('hidden');UI.controls.classList.add('hidden');
  }
  function continueRace(){
    if(raceMode==='online'&&onlineLocalPaused){resetInput();audio.init();onlineLocalPaused=false;UI.pause.classList.add('hidden');UI.controls.classList.remove('hidden');controlInput.setActive(true);setPauseButton(true,true);last=performance.now();return;}
    if(state!=='paused')return;resetInput();audio.init();state='racing';UI.pause.classList.add('hidden');UI.controls.classList.remove('hidden');controlInput.setActive(true);setPauseButton(true,true);last=performance.now();if(player)audio.updateEngine(player.speed,0,true);
  }
  function restartRace(){if(raceMode==='online')return;countdownToken++;resetInput();audio.updateEngine(0,0,false);UI.pause.classList.add('hidden');UI.finish.classList.add('hidden');startRace();}
  function mainMenu(){
    countdownToken++;resetInput();persistRecords();if(raceMode==='online'&&window.VelocityOnline){window.VelocityOnline.leave();resetOnlineMode();}state='menu';audio.updateEngine(0,0,false);UI.pause.classList.add('hidden');UI.settings.classList.add('hidden');UI.finish.classList.add('hidden');UI.setup.classList.add('hidden');UI.countdown.classList.add('hidden');UI.menu.classList.remove('hidden');UI.toasts.replaceChildren();showRaceUI(false);updateMenuStats();last=performance.now();
  }

  bindTap(UI.play,openSetup);bindTap(UI.setupBack,backToMenuFromSetup);bindTap(UI.startRace,startRace);bindTap(UI.pauseBtn,pauseRace);bindTap(UI.continueBtn,continueRace);bindTap(UI.pauseSettingsBtn,openSettings);bindTap(UI.restartBtn,restartRace);bindTap(UI.mainMenuBtn,mainMenu);bindTap(UI.again,restartRace);bindTap(UI.finishMenu,mainMenu);bindTap(UI.settingsBtn,openSettings);bindTap(UI.settingsBack,closeSettings);bindTap(UI.rootOpen,openRoot);
  UI.controlModeSelector.querySelectorAll('button').forEach(btn=>bindTap(btn,()=>selectControlMode(btn.dataset.controlMode)));
  UI.tiltSensitivitySelector.querySelectorAll('button').forEach(btn=>bindTap(btn,()=>{controlInput.setSensitivity(btn.dataset.tiltSensitivity);settingsNotice='';settingsNoticeKind='';syncSettingsUI();}));
  const keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'gas',KeyW:'gas',ArrowDown:'brake',KeyS:'brake'};
  addEventListener('keydown',e=>{if(keyMap[e.code]&&(state==='racing'||(state==='onlineRacing'&&!onlineLocalPaused&&!onlineLocalFinished))){input[keyMap[e.code]]=true;e.preventDefault();}if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(raceMode==='online'&&state==='onlineRacing'){onlineLocalPaused?continueRace():pauseRace();}else state==='racing'?pauseRace():state==='paused'&&continueRace();}});
  addEventListener('keyup',e=>{if(keyMap[e.code]){input[keyMap[e.code]]=false;e.preventDefault();}});
  document.addEventListener('touchmove',e=>{if(state==='racing'||state==='countdown'||state==='onlineRacing'||state==='onlineCountdown')e.preventDefault();},{passive:false});
  document.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(raceMode==='online'&&(state==='onlineRacing'||state==='onlineCountdown')){onlineLocalPaused=true;controlInput.setActive(false);if(onlineRace&&player&&window.VelocityOnline)window.VelocityOnline.sendState(onlineRace.raceId,onlineStateFor(player,false));}else if(state==='racing')pauseRace();}else if(raceMode==='online'&&state==='onlineRacing'&&onlineLocalPaused&&!onlineLocalFinished){UI.pause.classList.remove('hidden');UI.controls.classList.add('hidden');setPauseButton(false,true);}});

  function toast(text,kind='good'){
    while(UI.toasts.children.length>=2)UI.toasts.firstElementChild.remove();
    const d=document.createElement('div');d.className='toast '+kind;d.textContent=text;UI.toasts.appendChild(d);setTimeout(()=>d.remove(),900);
  }
  function spawnParticle(x,y,type,count=1){
    for(let k=0;k<count;k++){const p=particles[pCursor++%particles.length];p.active=true;p.x=x+(Math.random()-.5)*10;p.y=y+(Math.random()-.5)*10;p.life=p.max=type==='spark'?.28:type==='smoke'?.65:.48;p.type=type;p.size=type==='smoke'?4+Math.random()*5:1.5+Math.random()*3;const a=Math.random()*Math.PI*2,sp=type==='spark'?90+Math.random()*150:20+Math.random()*45;p.vx=Math.cos(a)*sp-(player?player.vx*.1:0);p.vy=Math.sin(a)*sp-(player?player.vy*.1:0);}
  }
  function addSkid(c){const s=skid[skidCursor++%skid.length],hx=Math.cos(c.angle),hy=Math.sin(c.angle),nx=-hy,ny=hx,backX=c.x-hx*20,backY=c.y-hy*20;s.active=true;s.life=1;s.x1=backX+nx*13;s.y1=backY+ny*13;s.x2=backX-nx*13;s.y2=backY-ny*13;}
  function updateEffects(dt){
    for(const p of particles)if(p.active){p.life-=dt;if(p.life<=0){p.active=false;continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.95,dt*60);p.vy*=Math.pow(.95,dt*60);if(p.type==='smoke')p.size+=dt*8;}
    for(const s of skid)if(s.active){s.life-=dt*.18;if(s.life<=0)s.active=false;}
  }

  const PHYSICS_STEP=1/120,MAX_PHYSICS_STEPS=4,COLLISION_SOLVER_ITERATIONS=4;
  const COLLISION_RESTITUTION=.035,COLLISION_FRICTION=.12,COLLISION_SEPARATION=.025;

  function resolveCarCollisions(){
    let playerImpact=0,impactX=0,impactY=0;
    for(let iteration=0;iteration<COLLISION_SOLVER_ITERATIONS;iteration++){
      let contacts=0;
      for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
        const a=cars[i],b=cars[j],dx=b.x-a.x,dy=b.y-a.y;
        const broad=a.collisionRadius+b.collisionRadius+Math.hypot(a.collisionOffsetX||0,a.collisionOffsetY||0)+Math.hypot(b.collisionOffsetX||0,b.collisionOffsetY||0);
        if(dx*dx+dy*dy>broad*broad)continue;
        const hit=R.intersectCarOBBs(a,b);if(!hit)continue;contacts++;
        const correction=(hit.depth+COLLISION_SEPARATION)*.5,nx=hit.nx,ny=hit.ny;
        a.x-=nx*correction;a.y-=ny*correction;b.x+=nx*correction;b.y+=ny*correction;
        const rvx=b.vx-a.vx,rvy=b.vy-a.vy,rvn=rvx*nx+rvy*ny;let closingImpact=0;
        if(rvn<0){
          closingImpact=-rvn;const impulse=-(1+COLLISION_RESTITUTION)*rvn*.5;
          a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;
          const postRvx=b.vx-a.vx,postRvy=b.vy-a.vy,tangentSpeed=postRvx*(-ny)+postRvy*nx,maxFriction=impulse*COLLISION_FRICTION,friction=clamp(-tangentSpeed*.5,-maxFriction,maxFriction);
          a.vx-=(-ny)*friction;a.vy-=nx*friction;b.vx+=(-ny)*friction;b.vy+=nx*friction;a.speed=Math.hypot(a.vx,a.vy);b.speed=Math.hypot(b.vx,b.vy);
        }
        a.collisionThisLap=b.collisionThisLap=true;if(closingImpact>2){a.markImpact?.(Math.min(1,.28+closingImpact/150));b.markImpact?.(Math.min(1,.28+closingImpact/150));}
        if((a.player||b.player)&&closingImpact>playerImpact){playerImpact=closingImpact;impactX=hit.cx;impactY=hit.cy;}
      }
      if(!contacts)break;
    }
    return{playerImpact,impactX,impactY};
  }

  function finishCar(c){
    if(c.raceFinished)return;c.raceFinished=true;c.laps=raceSettings.laps;c.finishPlace=finishOrder.length+1;c.finishTime=raceTime;finishOrder.push(c);
  }
  function handlePlayerLap(){
    const completed=Math.min(player.laps,raceSettings.laps),lapMs=lapTime;lapTime=0;
    if(!raceBestLap||lapMs<raceBestLap)raceBestLap=lapMs;
    const positionValue=Math.max(0,cars.length+1-player.rank),bonus=750+positionValue*45;score+=bonus;
    const clean=!player.collisionThisLap&&!player.offroadThisLap;if(clean){score+=350;toast('CLEAN LAP  +350');}
    let best=false;
    if(!save.bestLap||lapMs<save.bestLap){save.bestLap=lapMs;best=true;score+=600;toast('NEW BEST LAP  +600');}
    else if(completed<raceSettings.laps)toast('LAP '+completed+'  +'+bonus);
    save.maxLaps=Math.max(save.maxLaps,completed);save.bestScore=Math.max(save.bestScore,Math.floor(score));writeSave();audio.lap(best);
    player.collisionThisLap=false;player.offroadThisLap=false;player.offroadTime=0;
  }
  function finishRace(){
    if(state!=='racing'||!player||!player.raceFinished||player.laps<raceSettings.laps||raceRewardClaimed)return;
    raceRewardClaimed=true;
    const reward=R.raceReward(raceSettings,player.finishPlace);save.credits=Math.min(Number.MAX_SAFE_INTEGER,save.credits+reward);writeSave();
    $('finishReward').textContent='+'+reward.toLocaleString()+' CR';$('finishBalance').textContent=save.credits.toLocaleString()+' CR';$('finishTrack').textContent=track.config.name;
    state='finished';resetInput();audio.updateEngine(0,0,false);setPauseButton(false,false);showRaceUI(false);persistRecords();
    const place=player.finishPlace||player.rank||cars.length;
    UI.finishPlace.textContent=ordinal(place);UI.finishPosition.textContent=place+' / '+cars.length;UI.finishLaps.textContent=raceSettings.laps+' / '+raceSettings.laps;
    UI.finishTime.textContent=fmt(raceTime*1000);UI.finishBestLap.textContent=fmt(raceBestLap);UI.finishScore.textContent=Math.floor(score).toLocaleString();UI.finishDifficulty.textContent=DIFFICULTY_LABELS[raceSettings.difficulty];
    UI.finishCard.classList.toggle('winner',place===1);UI.finish.classList.remove('hidden');updateMenuStats();
  }

  function updateRace(dt){
    raceTime+=dt;lapTime+=dt*1000;impactCooldown-=dt;grassSoundCooldown-=dt;skidTick-=dt;
    controlInput.update(dt);const touchControl=controlInput.getControl(),keyboardSteer=(input.right?1:0)-(input.left?1:0);
    playerControl.steer=keyboardSteer||touchControl.steer;playerControl.throttle=input.gas?1:touchControl.throttle;playerControl.brake=input.brake?1:touchControl.brake;
    for(const c of cars)if(c!==player){c._impactThisFrame=false;c._control=c.ai.think(dt,track,cars);}

    const steps=Math.min(MAX_PHYSICS_STEPS,Math.max(1,Math.ceil(dt/PHYSICS_STEP))),stepDt=dt/steps;
    let playerTrackImpact=0,carImpact=0,impactX=0,impactY=0,raceEnded=false;
    for(let step=0;step<steps;step++){
      const pResult=player.update(stepDt,playerControl,track);playerTrackImpact=Math.max(playerTrackImpact,pResult.impact);
      for(const c of cars)if(c!==player){const r=c.update(stepDt,c._control,track);if(r.impact>.45)c._impactThisFrame=true;if(c.raceFinished&&c.laps>raceSettings.laps)c.laps=raceSettings.laps;}
      const collision=resolveCarCollisions();if(collision.playerImpact>carImpact){carImpact=collision.playerImpact;impactX=collision.impactX;impactY=collision.impactY;}

      finishCandidates.length=0;
      for(const c of cars){
        if(!c.finishedLap)continue;
        if(c===player)handlePlayerLap();
        if(!c.raceFinished&&c.laps>=raceSettings.laps)finishCandidates.push(c);
        else if(c.raceFinished&&c.laps>raceSettings.laps)c.laps=raceSettings.laps;
      }
      if(finishCandidates.length){
        finishCandidates.sort((a,b)=>b.progress-a.progress);
        for(const c of finishCandidates)finishCar(c);
        if(player.raceFinished){raceEnded=true;break;}
      }
    }
    for(const c of cars)if(c!==player&&c._impactThisFrame)spawnParticle(c.x,c.y,'spark',2);

    if(carImpact>3&&impactCooldown<=0){impactCooldown=.18;shake=Math.max(shake,3+Math.min(6,carImpact*.04));audio.collision(Math.min(1,carImpact/110));spawnParticle(impactX,impactY,'spark',4);}
    if(playerTrackImpact>.05&&impactCooldown<=0){impactCooldown=.16;shake=Math.max(shake,3+playerTrackImpact*10);audio.collision(playerTrackImpact);spawnParticle(player.x,player.y,'spark',7);}
    if(!player.onRoad&&player.speed>100){if(Math.random()<dt*26)spawnParticle(player.x-player.vx*.035,player.y-player.vy*.035,'grass',2);if(grassSoundCooldown<=0){audio.grass();grassSoundCooldown=.16;}}
    const lateral=Math.abs(-Math.sin(player.angle)*player.vx+Math.cos(player.angle)*player.vy);
    if(skidTick<=0&&player.speed>160&&(lateral>32||playerControl.brake)){addSkid(player);skidTick=.055;if((playerControl.brake||lateral>52)&&Math.random()<.58)spawnParticle(player.x-player.vx*.05,player.y-player.vy*.05,'smoke',1);}
    updateEffects(dt);updateRanks();

    scoreCarry+=player.speed*dt*(.055+(cars.length+1-player.rank)*.0018);if(scoreCarry>=1){const add=Math.floor(scoreCarry);score+=add;scoreCarry-=add;}
    if(player.rank<prevRank){score+=100*(prevRank-player.rank);audio.overtake();}prevRank=player.rank;
    save.bestScore=Math.max(save.bestScore,Math.floor(score));
    updateCamera(dt);updateHUD();
    if(raceEnded){finishRace();return;}
    audio.updateEngine(player.speed,playerControl.throttle,true);
  }

  function updateRanks(){
    if(rankBuffer.length!==cars.length)rankBuffer=cars.slice();
    rankBuffer.sort((a,b)=>{
      if(a.raceFinished&&b.raceFinished)return a.finishPlace-b.finishPlace;
      if(a.raceFinished)return-1;if(b.raceFinished)return 1;
      return b.raceMetric()-a.raceMetric();
    });
    for(let i=0;i<rankBuffer.length;i++)rankBuffer[i].rank=i+1;
  }

  function prepareMiniMap(){
    const map=UI.miniMap;if(!map||!track||!track.samples.length)return;
    const rect=map.getBoundingClientRect(),cssW=Math.max(72,Math.round(rect.width||104)),cssH=Math.max(52,Math.round(rect.height||75));
    const dpr=Math.min(window.devicePixelRatio||1,2),pxW=Math.max(1,Math.round(cssW*dpr)),pxH=Math.max(1,Math.round(cssH*dpr));
    map.width=pxW;map.height=pxH;const visible=map.getContext('2d');
    const base=document.createElement('canvas');base.width=pxW;base.height=pxH;const m=base.getContext('2d');m.setTransform(dpr,0,0,dpr,0,0);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of track.samples){if(p.x<minX)minX=p.x;if(p.y<minY)minY=p.y;if(p.x>maxX)maxX=p.x;if(p.y>maxY)maxY=p.y;}
    const pad=8,spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY),scale=Math.min((cssW-pad*2)/spanX,(cssH-pad*2)/spanY);
    const ox=(cssW-spanX*scale)*.5-minX*scale,oy=(cssH-spanY*scale)*.5-minY*scale;
    m.clearRect(0,0,cssW,cssH);m.lineJoin='round';m.lineCap='round';
    const path=()=>{m.beginPath();const first=track.samples[0];m.moveTo(first.x*scale+ox,first.y*scale+oy);for(let i=1;i<track.samples.length;i++){const p=track.samples[i];m.lineTo(p.x*scale+ox,p.y*scale+oy);}m.closePath();};
    path();m.globalAlpha=.72;m.strokeStyle='#0a1113';m.lineWidth=5;m.stroke();
    path();m.globalAlpha=.9;m.strokeStyle='#aeb8b8';m.lineWidth=2.05;m.stroke();m.globalAlpha=1;
    const st=track.samples[0],sx=st.x*scale+ox,sy=st.y*scale+oy;
    m.strokeStyle=track.theme.accent||'#8dff49';m.lineWidth=2.1;m.beginPath();m.moveTo(sx-st.nx*5.5,sy-st.ny*5.5);m.lineTo(sx+st.nx*5.5,sy+st.ny*5.5);m.stroke();
    miniMapState={trackId:track.id,cssW,cssH,dpr,base,scale,ox,oy,ctx:visible};
  }

  function drawMiniMap(){
    const map=UI.miniMap;if(!map||UI.hud.classList.contains('hidden')||!cars.length)return;
    if(!miniMapState||miniMapState.trackId!==track.id)prepareMiniMap();
    const mm=miniMapState;if(!mm)return;
    const m=mm.ctx;m.setTransform(1,0,0,1,0,0);m.clearRect(0,0,map.width,map.height);m.drawImage(mm.base,0,0);m.setTransform(mm.dpr,0,0,mm.dpr,0,0);
    for(const c of cars){
      if(c===player)continue;const x=c.x*mm.scale+mm.ox,y=c.y*mm.scale+mm.oy;
      m.globalAlpha=c.raceFinished?.52:.82;m.fillStyle='#e8eeee';m.beginPath();m.arc(x,y,2.15,0,Math.PI*2);m.fill();
    }
    if(player){
      const x=player.x*mm.scale+mm.ox,y=player.y*mm.scale+mm.oy;m.save();m.translate(x,y);m.rotate(player.angle);m.globalAlpha=1;m.fillStyle='#9dff57';m.beginPath();m.moveTo(5.2,0);m.lineTo(-3.6,-3.4);m.lineTo(-2.1,0);m.lineTo(-3.6,3.4);m.closePath();m.fill();m.restore();
    }
    m.globalAlpha=1;
  }

  function setText(el,value){const text=String(value);if(el.textContent!==text)el.textContent=text;}
  function updateHUD(){
    if(!player)return;setText(UI.pos,player.rank+' / '+cars.length);setText(UI.lap,Math.min(raceSettings.laps,player.laps+1)+' / '+raceSettings.laps);setText(UI.speed,Math.round(player.speed));setText(UI.score,Math.floor(score).toLocaleString());setText(UI.lapTime,fmt(lapTime));setText(UI.bestLap,fmt(save.bestLap));
  }

  function updateCamera(dt){
    if(!player)return;
    const speedT=clamp(player.speed/PHYS.maxSpeed,0,1),targetLook=84+speedT*124;cam.look=lerp(cam.look,targetLook,Math.min(1,dt*4.35));
    const tx=player.x+Math.cos(player.angle)*cam.look,ty=player.y+Math.sin(player.angle)*cam.look;
    const follow=1-Math.pow(.0024,dt);cam.x=lerp(cam.x,tx,follow);cam.y=lerp(cam.y,ty,follow);
    let target=-Math.PI/2-player.angle,d=target-cam.rot;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;cam.rot+=d*Math.min(1,dt*7.2);
    const base=clamp(Math.min(W/920,H/520)*.80,.52,.94),speedZoom=1-speedT*.145;cam.zoom=lerp(cam.zoom,base*speedZoom,Math.min(1,dt*3.8));
    cam.screenY=lerp(cam.screenY,.47-speedT*.013,Math.min(1,dt*3.4));
    shake*=Math.pow(.035,dt);if(player.speed>455)shake=Math.max(shake,.32*clamp((player.speed-455)/55,0,1));
  }

  function drawParticles(){
    for(const s of skid)if(s.active){ctx.globalAlpha=.24*s.life;ctx.fillStyle='#080a0b';ctx.beginPath();ctx.arc(s.x1,s.y1,2.15,0,Math.PI*2);ctx.arc(s.x2,s.y2,2.15,0,Math.PI*2);ctx.fill();}
    for(const p of particles)if(p.active){
      const a=p.life/p.max;ctx.globalAlpha=Math.min(1,a)*(p.type==='grass'?.72:p.type==='smoke'?.5:1);
      if(p.type==='spark'){ctx.strokeStyle='#ffd45e';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);ctx.stroke();}
      else{ctx.fillStyle=p.type==='grass'?track.theme.dust:'#d7dedc';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}
    }
    ctx.globalAlpha=1;
  }
  function drawRace(){
    ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#102e20';ctx.fillRect(0,0,W,H);
    const sx=shake?(Math.random()-.5)*shake:0,sy=shake?(Math.random()-.5)*shake:0;
    ctx.save();ctx.translate(W*.5+sx,H*cam.screenY+sy);ctx.scale(cam.zoom,cam.zoom);ctx.rotate(cam.rot);ctx.translate(-cam.x,-cam.y);track.draw(ctx);drawParticles();
    for(const c of cars)if(c!==player)c.draw(ctx);if(player)player.draw(ctx);ctx.restore();drawSpeedLines();drawMiniMap();
  }
  function drawSpeedLines(){
    if(!player||player.speed<275||state!=='racing')return;const t=clamp((player.speed-275)/(PHYS.maxSpeed-275),0,1);ctx.save();ctx.globalAlpha=.105*t;ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
    const cx=W*.5,cy=Math.min(H*.68,H*cam.screenY+cam.look*cam.zoom);for(let i=0;i<16;i++){const a=(i*2.399+raceTime*.7)%6.283,r=90+((i*73+raceTime*330)%Math.max(120,W*.55)),len=16+38*t;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*(r+len),cy+Math.sin(a)*(r+len));ctx.stroke();}ctx.restore();
  }
  function drawMenu(dt){
    demoT+=dt;ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#123521';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(W*.5,H*.5);const b=track.bounds,z=Math.min(W/(b.maxX-b.minX),H/(b.maxY-b.minY))*1.18;ctx.scale(z,z);ctx.rotate(-.08);ctx.translate(-(b.minX+b.maxX)/2,-(b.minY+b.maxY)/2);track.draw(ctx);
    for(const c of demoCars){const pr=(demoT*.032+c.demoOffset)%1,p=track.sampleAtProgress(pr,Math.sin(pr*18+c.id)*18);c.x=p.x;c.y=p.y;c.angle=Math.atan2(p.ty,p.tx);c.draw(ctx,1.1);}ctx.restore();
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(0,0,0,.06)');g.addColorStop(1,'rgba(0,0,0,.32)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }

  function frame(now){
    let dt=(now-last)/1000;last=now;dt=Math.min(.033,Math.max(0,dt));
    if(state==='menu'||state==='setup'||state==='shop'||state==='garage'||(state==='settings'&&settingsReturn!=='paused')){drawMenu(dt);if(state==='shop'||state==='garage')garage.draw(dt);}
    else{if(state==='racing')updateRace(dt);else if(state==='countdown')updateCamera(dt);else if(state==='onlineCountdown')updateOnlineCountdown(dt);else if(state==='onlineRacing')updateOnlineRace(dt);else if(state==='onlineFinished'){updateRemoteCars();updateCamera(dt);}drawRace();}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
