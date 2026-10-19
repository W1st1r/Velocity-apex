(function(){
  'use strict';
  const $=id=>document.getElementById(id),SAVE_KEY='velocityApex.v1',ACCOUNTS_KEY='velocityApex.accounts.v1',INSTALL_KEY='velocityApex.installId.v1';
  const els={
    root:$('account'),button:$('accountBtn'),menuStatus:$('accountMenuStatus'),close:$('accountCloseBtn'),guest:$('accountGuestView'),profile:$('accountProfileView'),loginTab:$('accountLoginTab'),registerTab:$('accountRegisterTab'),form:$('accountForm'),displayWrap:$('accountDisplayNameWrap'),emailWrap:$('accountEmailWrap'),registerEmail:$('accountRegisterEmail'),display:$('accountDisplayName'),username:$('accountUsername'),password:$('accountPassword'),confirmWrap:$('accountConfirmWrap'),confirm:$('accountPasswordConfirm'),inviterWrap:$('accountInviterWrap'),inviter:$('accountInviter'),message:$('accountMessage'),submit:$('accountSubmitBtn'),displayView:$('accountDisplayNameView'),usernameView:$('accountUsernameView'),avatar:$('accountAvatar'),sync:$('accountSyncStatus'),profileMessage:$('accountProfileMessage'),logout:$('accountLogoutBtn'),
    gate:$('authGate'),gateChooser:$('authGateChooser'),gateSession:$('authGateSession'),gateAvatar:$('authGateAvatar'),gateDisplayName:$('authGateDisplayName'),gateUsername:$('authGateUsername'),gateKnownWrap:$('authGateKnownWrap'),gateKnownList:$('authGateKnownList'),gateEmpty:$('authGateEmpty'),gateOther:$('authGateOtherBtn'),gateCreate:$('authGateCreateBtn'),gateFormPanel:$('authGateFormPanel'),gateLoginTab:$('authGateLoginTab'),gateRegisterTab:$('authGateRegisterTab'),gateForm:$('authGateForm'),gateDisplayWrap:$('authGateDisplayWrap'),gateEmailWrap:$('authGateEmailWrap'),gateEmail:$('authGateEmail'),gateDisplay:$('authGateDisplay'),gateLogin:$('authGateLogin'),gatePassword:$('authGatePassword'),gateConfirmWrap:$('authGateConfirmWrap'),gateConfirm:$('authGateConfirm'),gateInviterWrap:$('authGateInviterWrap'),gateInviter:$('authGateInviter'),gateMessage:$('authGateMessage'),gateSubmit:$('authGateSubmit'),gateBack:$('authGateBack'),gateBan:$('authGateBan'),banUsername:$('authBanUsername'),banRemaining:$('authBanRemaining'),banReason:$('authBanReason'),banUntil:$('authBanUntil'),banOther:$('authBanOtherBtn'),rootSettings:$('rootSettingsCard')
  };
  if(!els.root||!els.button||!els.gate)return;

  const state={mode:'login',gateMode:'login',user:null,revision:0,lastSave:null,pendingSave:null,syncTimer:0,syncing:false,bootstrapped:false,gameEntered:false,banTimer:0,ban:null,statusTimer:0,pendingEconomy:new Map(),saveGeneration:0,savedGeneration:-1};
  let preferenceTools=null;const preferenceToolsReady=import('./account-preferences-v77.mjs').then(module=>{preferenceTools=module;return module;}).catch(()=>null);
  const errors={CLIENT_UPDATE_REQUIRED:'Обновите игру: старый формат сохранений больше не принимается.',SERVER_STATE_ONLY:'Баланс и имущество изменяются только игровыми действиями на сервере.',INVALID_USERNAME:'Логин: 3–24 символа, только a-z, 0-9 и _.',INVALID_DISPLAY_NAME:'Имя игрока: 2–24 символа без опасных спецсимволов.',INVALID_PASSWORD:'Пароль должен содержать от 8 до 128 символов.',USERNAME_TAKEN:'Этот логин уже занят.',INVALID_CREDENTIALS:'Неверный логин или пароль.',AUTH_REQUIRED:'Сессия истекла. Войдите снова.',REQUEST_TOO_LARGE:'Сохранение слишком большое.',DATABASE_UNAVAILABLE:'База аккаунтов временно недоступна.',SERVER_ERROR:'Ошибка сервера. Повторите попытку.',MAINTENANCE:'Технические работы. Вход временно закрыт.',ACCOUNT_BANNED:'Аккаунт заблокирован.',ADMIN_REQUIRED:'Недостаточно прав.',SAVE_CONFLICT:'Облачное сохранение было обновлено на сервере.',INVALID_INVITER:'Ник пригласителя указан неверно.',INVITER_NOT_FOUND:'Пригласитель с таким ником не найден.',CANNOT_INVITE_SELF:'Нельзя указать собственный ник как пригласителя.'};
  const normalizeSave=raw=>window.Racing?.normalizeSave?window.Racing.normalizeSave(raw):raw;
  function installId(){try{let id=localStorage.getItem(INSTALL_KEY)||'';if(!/^[A-Za-z0-9_-]{16,128}$/.test(id)){id=(crypto.randomUUID?.()||String(Date.now())+Math.random()).replace(/[^A-Za-z0-9_-]/g,'');localStorage.setItem(INSTALL_KEY,id);}return id;}catch{return '';} }
  function localSave(){try{const x=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');return normalizeSave(x);}catch{return normalizeSave({});}}
  function setMessage(text='',bad=false,profile=false){const el=profile?els.profileMessage:els.message;if(!el)return;el.textContent=text;el.classList.toggle('bad',!!bad);}
  function setGateMessage(text='',bad=false){els.gateMessage.textContent=text;els.gateMessage.classList.toggle('bad',!!bad);}
  function initials(name){const p=String(name||'VA').trim().split(/\s+/).filter(Boolean);return (p[0]?.[0]||'V')+(p[1]?.[0]||p[0]?.[1]||'A');}

  function readAccounts(){
    try{
      const raw=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||'[]');
      if(!Array.isArray(raw))return[];
      return raw.filter(x=>x&&typeof x.username==='string'&&x.username).map(x=>({username:String(x.username).toLowerCase().slice(0,24),displayName:String(x.displayName||x.username).slice(0,24),lastUsedAt:Number(x.lastUsedAt)||0})).sort((a,b)=>b.lastUsedAt-a.lastUsedAt).slice(0,5);
    }catch{return[];}
  }
  function writeAccounts(list){try{localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(list.slice(0,5)));}catch{}}
  function rememberAccount(user){
    if(!user?.username)return;
    const username=String(user.username).toLowerCase(),list=readAccounts().filter(x=>x.username!==username);
    list.unshift({username,displayName:String(user.displayName||user.username).slice(0,24),lastUsedAt:Date.now()});writeAccounts(list);
  }
  function forgetAccount(username){writeAccounts(readAccounts().filter(x=>x.username!==username));renderGateChooser();}

  function render(){
    const logged=!!state.user;els.guest.classList.toggle('hidden',logged);els.profile.classList.toggle('hidden',!logged);
    const copy=els.button.querySelector('.menu-tile-copy>span');if(copy)copy.textContent=logged?'АККАУНТ':'ВОЙТИ / РЕГИСТРАЦИЯ';
    els.menuStatus.textContent=logged?String(state.user.displayName||state.user.username).slice(0,12).toUpperCase():'ГОСТЕВОЙ РЕЖИМ';els.button.classList.toggle('account-active',logged);
    if(els.rootSettings)els.rootSettings.classList.toggle('hidden',!state.user?.isAdmin);
    if(logged){els.displayView.textContent=state.user.displayName;els.usernameView.textContent='@'+state.user.username;els.avatar.textContent=initials(state.user.displayName).toUpperCase();}
    window.dispatchEvent(new CustomEvent('velocity-account-changed',{detail:{user:state.user}}));
  }
  function setMode(mode){state.mode=mode==='register'?'register':'login';const reg=state.mode==='register';els.loginTab.classList.toggle('active',!reg);els.registerTab.classList.toggle('active',reg);els.loginTab.setAttribute('aria-selected',String(!reg));els.registerTab.setAttribute('aria-selected',String(reg));els.displayWrap.classList.toggle('hidden',!reg);els.emailWrap?.classList.toggle('hidden',!reg);els.confirmWrap.classList.toggle('hidden',!reg);els.inviterWrap?.classList.toggle('hidden',!reg);els.submit.textContent=reg?'СОЗДАТЬ АККАУНТ':'ВОЙТИ';els.password.autocomplete=reg?'new-password':'current-password';setMessage();}
  function setGateMode(mode){
    state.gateMode=mode==='register'?'register':'login';const reg=state.gateMode==='register';
    els.gateLoginTab.classList.toggle('active',!reg);els.gateRegisterTab.classList.toggle('active',reg);els.gateLoginTab.setAttribute('aria-selected',String(!reg));els.gateRegisterTab.setAttribute('aria-selected',String(reg));els.gateDisplayWrap.classList.toggle('hidden',!reg);els.gateEmailWrap?.classList.toggle('hidden',!reg);els.gateConfirmWrap.classList.toggle('hidden',!reg);els.gateInviterWrap?.classList.toggle('hidden',!reg);els.gateSubmit.textContent=reg?'СОЗДАТЬ АККАУНТ':'ВОЙТИ';els.gatePassword.autocomplete=reg?'new-password':'current-password';setGateMessage();
  }
  async function api(path,options={}){
    const init={credentials:'same-origin',headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})},...options};
    const res=await fetch(path,init);let data={};try{data=await res.json();}catch{}
    if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';e.data=data;e.ban=data.ban||null;throw e;}return data;
  }
  function formatRemaining(ms){
    const total=Math.max(0,Math.ceil(Number(ms)||0)),sec=Math.ceil(total/1000);if(sec<60)return sec+' сек';
    const min=Math.ceil(sec/60);if(min<60)return min+' мин';const h=Math.ceil(min/60);if(h<48)return h+' ч';return Math.ceil(h/24)+' д';
  }
  function stopBanTimer(){if(state.banTimer){clearInterval(state.banTimer);state.banTimer=0;}}
  function showBan(ban,user){
    stopBanTimer();state.ban=ban||null;state.user=null;state.gameEntered=false;render();$('menu')?.classList.add('hidden');els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');els.gateChooser.classList.add('hidden');els.gateFormPanel.classList.add('hidden');els.gateBan.classList.remove('hidden');
    const username=user?.username||'account';els.banUsername.textContent='@'+username;els.banReason.textContent=ban?.reason||'Причина не указана';
    const update=()=>{const left=Math.max(0,(Number(ban?.expiresAt)||0)-Date.now());els.banRemaining.textContent=formatRemaining(left);els.banUntil.textContent=ban?.expiresAt?'Блокировка до '+new Date(Number(ban.expiresAt)).toLocaleString('ru-RU'):'';if(left<=0)stopBanTimer();};update();state.banTimer=setInterval(update,1000);
  }

  function open(){
    if(!state.user){showGateForm('login');return;}
    els.root.classList.remove('hidden');els.root.setAttribute('aria-hidden','false');$('menu')?.classList.add('hidden');setMessage();setMessage('',false,true);setTimeout(()=>els.logout.focus(),30);
  }
  function close(){els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');if(state.gameEntered)$('menu')?.classList.remove('hidden');}
  function enterGuestGame(){
    state.gameEntered=true;stopBanTimer();els.gate.classList.add('hidden');els.gate.setAttribute('aria-hidden','true');els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');$('menu')?.classList.remove('hidden');setGateMessage();
    window.dispatchEvent(new CustomEvent('velocity-account-entered',{detail:{user:null,guest:true}}));
  }
  async function enterGame(){
    if(!state.user){enterGuestGame();return;}
    try{const r=await fetch('/api/owner/runtime',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({location:'menu'})});const d=await r.json();if(!r.ok){setGateMessage(d.error==='MAINTENANCE'?'Технические работы. Вход временно закрыт.':'Не удалось проверить доступ. Попробуйте ещё раз.',true);return;}window.Racing.ownerCars=d.cars;window.Racing.ownerTuning=d.tuning;}catch(e){setGateMessage('Нет связи с сервером. Попробуйте ещё раз.',true);return;}
    state.gameEntered=true;els.gate.classList.add('hidden');els.gate.setAttribute('aria-hidden','true');$('menu')?.classList.remove('hidden');setGateMessage();
    window.dispatchEvent(new CustomEvent('velocity-account-entered',{detail:{user:state.user}}));
  }
  function requireGate(message=''){
    state.gameEntered=false;$('menu')?.classList.add('hidden');els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');renderGateChooser();if(message)setGateMessage(message,true);
  }
  function showGateForm(mode='login',username=''){
    stopBanTimer();els.gateBan.classList.add('hidden');$('menu')?.classList.add('hidden');els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');els.gateChooser.classList.add('hidden');els.gateFormPanel.classList.remove('hidden');setGateMode(mode);
    if(username)els.gateLogin.value=username;else if(mode==='login')els.gateLogin.value='';
    els.gatePassword.value='';els.gateConfirm.value='';if(els.gateInviter)els.gateInviter.value='';if(mode==='register'&&!username)els.gateDisplay.value='';
    setTimeout(()=>{(mode==='register'?els.gateDisplay:els.gateLogin)?.focus();},30);
  }
  function showGateChooser(){
    stopBanTimer();els.gateBan.classList.add('hidden');els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');$('menu')?.classList.add('hidden');els.gateFormPanel.classList.add('hidden');els.gateChooser.classList.remove('hidden');setGateMessage();renderGateChooser();
  }
  function renderGateChooser(){
    const accounts=readAccounts(),current=state.user?.username?.toLowerCase()||'';
    if(state.user){
      els.gateSession.classList.remove('hidden');els.gateAvatar.textContent=initials(state.user.displayName).toUpperCase();els.gateDisplayName.textContent=state.user.displayName;els.gateUsername.textContent='@'+state.user.username;
    }else els.gateSession.classList.add('hidden');
    const others=accounts.filter(x=>x.username!==current);els.gateKnownList.replaceChildren();
    for(const acct of others){
      const row=document.createElement('div');row.className='auth-known-account';
      const pick=document.createElement('button');pick.type='button';pick.className='auth-known-pick';
      const av=document.createElement('span');av.className='auth-known-avatar';av.textContent=initials(acct.displayName).toUpperCase();
      const copy=document.createElement('span');copy.className='auth-known-copy';const strong=document.createElement('strong');strong.textContent=acct.displayName;const em=document.createElement('em');em.textContent='@'+acct.username;copy.append(strong,em);
      const arrow=document.createElement('b');arrow.textContent='›';pick.append(av,copy,arrow);pick.addEventListener('click',()=>showGateForm('login',acct.username));
      const forget=document.createElement('button');forget.type='button';forget.className='auth-known-forget';forget.setAttribute('aria-label','Забыть профиль '+acct.username);forget.textContent='×';forget.addEventListener('click',()=>forgetAccount(acct.username));
      row.append(pick,forget);els.gateKnownList.append(row);
    }
    els.gateKnownWrap.classList.toggle('hidden',others.length===0);els.gateEmpty.classList.toggle('hidden',!!state.user||others.length>0);
  }

  function applySave(raw){const save=normalizeSave(raw);if(!save||typeof save!=='object')return;state.pendingSave=save;state.lastSave=save;try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{}window.dispatchEvent(new CustomEvent('velocity-account-save',{detail:{save,source:'cloud'}}));}
  async function loadCloud(){
    if(!state.user)return;clearTimeout(state.syncTimer);state.syncTimer=0;els.sync.textContent='СИНХРОНИЗАЦИЯ…';
    try{const data=await api('/api/account/save');state.revision=data.revision||0;if(data.save){applySave(data.save);els.sync.textContent='СИНХРОНИЗИРОВАНО';}else{state.lastSave=localSave();await flushSave();}return true;}
    catch(e){els.sync.textContent='ОШИБКА СИНХРОНИЗАЦИИ';setMessage(errors[e.code]||'Не удалось загрузить облачный прогресс.',true,true);return false;}
  }
  async function bootstrap(){
    let banned=null;
    try{const data=await api('/api/auth/me');if(data.authenticated){state.user=data.user;rememberAccount(state.user);render();await loadCloud();}else{state.user=null;render();}}
    catch(e){state.user=null;render();if(e.code==='ACCOUNT_BANNED')banned={ban:e.ban,user:e.data?.user};}
    finally{state.bootstrapped=true;startStatusWatch();if(banned){if(banned.user)rememberAccount(banned.user);showBan(banned.ban,banned.user);}else if(state.user){enterGame();}else{enterGuestGame();}}
  }
  let saveFlight=null;
  async function flushSave(){
    if(!saveFlight){const generation=state.saveGeneration;saveFlight=performSave().then(ok=>{if(ok)state.savedGeneration=Math.max(state.savedGeneration,generation);return ok;}).finally(()=>{saveFlight=null;});}
    const ok=await saveFlight;
    if(ok&&state.savedGeneration<state.saveGeneration)return flushSave();
    return ok;
  }
  async function performSave(){
    clearTimeout(state.syncTimer);state.syncTimer=0;if(!state.user||state.syncing||!state.lastSave)return false;state.syncing=true;els.sync.textContent='СОХРАНЕНИЕ…';
    const generation=state.saveGeneration,snapshot=normalizeSave(state.lastSave),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const {preferencesFromSave}=await preferenceToolsReady,preferences=preferencesFromSave(snapshot);let data;
      for(let attempt=0;attempt<3;attempt++){
        try{data=await api('/api/account/save',{method:'PUT',body:JSON.stringify({preferences,revision:state.revision}),signal:controller.signal});break;}
        catch(e){if(e.code!=='SAVE_CONFLICT'||attempt===2)throw e;state.revision=Number(e.data?.revision)||state.revision;}
      }
      state.revision=data.revision||state.revision;
      if(data.save){const pending=state.saveGeneration!==generation?preferencesFromSave(state.lastSave):{};applySave({...data.save,...pending});}
      els.sync.textContent='СИНХРОНИЗИРОВАНО';return true;
    }catch(e){
      if(e.code==='SAVE_CONFLICT'){state.revision=Number(e.data?.revision)||state.revision;if(e.data?.save)applySave(e.data.save);setMessage('Профиль изменён другой операцией. Повторите сохранение настроек.',true,true);}
      if(e.code==='ACCOUNT_BANNED'){showBan(e.ban,e.data?.user);window.dispatchEvent(new CustomEvent('velocity-account-banned',{detail:e.data||{}}));}else if(e.code==='AUTH_REQUIRED'){state.user=null;render();requireGate('Сессия истекла. Войдите снова.');}
      else if(e.code==='CLIENT_UPDATE_REQUIRED'||e.code==='SERVER_STATE_ONLY')setMessage(errors[e.code],true,true);
      els.sync.textContent='НЕ СИНХРОНИЗИРОВАНО';return false;
    }finally{clearTimeout(timeout);state.syncing=false;if(state.user&&state.saveGeneration!==generation){clearTimeout(state.syncTimer);state.syncTimer=setTimeout(flushSave,0);}}
  }

  async function economyTransaction(endpoint,payload){
    if(!state.user)throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
    const fingerprint=JSON.stringify([endpoint,payload]);let requestId=state.pendingEconomy.get(fingerprint);
    if(!requestId){try{const storageKey='velocityApex.economy.pending.v1:'+fingerprint;requestId=sessionStorage.getItem(storageKey)||crypto.randomUUID();sessionStorage.setItem(storageKey,requestId);state.pendingEconomy.set(fingerprint,{requestId,storageKey});}catch{requestId=crypto.randomUUID();state.pendingEconomy.set(fingerprint,{requestId,storageKey:''});}}
    if(typeof requestId==='object')requestId=requestId.requestId;
    while(state.syncing)await new Promise(resolve=>setTimeout(resolve,25));
    if(await flushSave()===false)throw Object.assign(new Error('SAVE_SYNC_FAILED'),{code:'SAVE_SYNC_FAILED'});
    try{
      const data=await api(endpoint,{method:'POST',body:JSON.stringify({...payload,requestId})});
      if(data.save)applySave(data.save);state.revision=Number(data.revision)||state.revision;
      const pending=state.pendingEconomy.get(fingerprint),storageKey=pending?.storageKey;if(storageKey)try{sessionStorage.removeItem(storageKey);}catch{}state.pendingEconomy.delete(fingerprint);
      els.sync.textContent='СИНХРОНИЗИРОВАНО';return data.result;
    }catch(e){
      if(['INSUFFICIENT_CR','CASE_LIMIT','NO_CASES','INVALID_CASE_REQUEST','INVALID_ITEM','IDEMPOTENCY_KEY_REUSED'].includes(e.code)){const pending=state.pendingEconomy.get(fingerprint);if(pending?.storageKey)try{sessionStorage.removeItem(pending.storageKey);}catch{}state.pendingEconomy.delete(fingerprint);}
      throw e;
    }
  }
  async function raceRequest(action,payload){
    if(!state.user)throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let data;
    try{data=await api('/api/economy/races/'+action,{method:'POST',body:JSON.stringify(payload),signal:controller.signal});}finally{clearTimeout(timer);}
    if(data.save){state.revision=Number(data.revision)||state.revision;applySave(data.save);els.sync.textContent='СИНХРОНИЗИРОВАНО';}
    if(data.progression)window.dispatchEvent(new CustomEvent('velocity-progression-updated',{detail:data.progression}));
    return data;
  }
  const caseTransaction=(action,caseId,quantity)=>economyTransaction('/api/economy/cases/'+(action==='buy'?'buy':'open'),{caseId,quantity});
  function queueSave(raw){if(!raw||typeof raw!=='object')return;const next=normalizeSave(JSON.parse(JSON.stringify(raw))),unchanged=preferenceTools&&state.lastSave&&JSON.stringify(preferenceTools.preferencesFromSave(next))===JSON.stringify(preferenceTools.preferencesFromSave(state.lastSave));state.lastSave=next;if(unchanged)return;state.saveGeneration++;if(!state.user)return;clearTimeout(state.syncTimer);els.sync.textContent='ОЖИДАНИЕ…';state.syncTimer=setTimeout(flushSave,650);}
  function referralMessage(ref){
    if(!ref?.rewarded)return '';const parts=[];const credits=Math.max(0,Math.floor(Number(ref.inviteeReward?.credits)||0));if(credits)parts.push(credits.toLocaleString('ru-RU')+' CR');for(const [id,qty] of Object.entries(ref.inviteeReward?.cases||{}))if(Number(qty)>0)parts.push((window.Racing?.CASES?.[id]?.label||String(id).toUpperCase())+' ×'+Number(qty));
    return `Реферальный бонус LVL ${Number(ref.inviterLevel)||1}: вы получили ${parts.join(' + ')||'бонус'}. Пригласителю начислено ${Number(ref.rewardCredits||0).toLocaleString('ru-RU')} CR.`;
  }
  async function finishAuth(data){
    state.user=data.user;rememberAccount(state.user);state.lastSave=localSave();render();await loadCloud();
    try{if(!localStorage.getItem('velocityApex.onlineName'))localStorage.setItem('velocityApex.onlineName',state.user.displayName);}catch{}
  }
  async function onSubmit(event){
    event.preventDefault();const username=els.username.value.trim().toLowerCase(),password=els.password.value;setMessage();els.submit.disabled=true;
    try{
      let data;
      if(state.mode==='register'){
        const displayName=els.display.value.trim();if(password!==els.confirm.value){setMessage('Пароли не совпадают.',true);return;}
        data=await api('/api/auth/register',{method:'POST',body:JSON.stringify({username,displayName,password,email:els.registerEmail?.value.trim()||'',inviterUsername:els.inviter?.value.trim().replace(/^@/,'')||'',deviceId:installId()})});
      }else data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      await finishAuth(data);els.password.value='';els.confirm.value='';if(els.inviter)els.inviter.value='';setMessage([referralMessage(data.referral),state.mode==='register'&&els.registerEmail?.value.trim()?(data.emailVerification==='sent'?'Письмо подтверждения отправлено. Проверьте входящие и папку «Спам».':'Подтверждение email сейчас не отправлено. В профиле можно повторить попытку позже.'):''].filter(Boolean).join(' '),false,true);
    }catch(e){if(e.code==='ACCOUNT_BANNED')showBan(e.ban,e.data?.user||{username});else setMessage(errors[e.code]||'Не удалось выполнить запрос.',true);}finally{els.submit.disabled=false;}
  }
  async function onGateSubmit(event){
    event.preventDefault();const username=els.gateLogin.value.trim().toLowerCase(),password=els.gatePassword.value;setGateMessage();els.gateSubmit.disabled=true;
    try{
      let data;
      if(state.gateMode==='register'){
        const displayName=els.gateDisplay.value.trim();if(password!==els.gateConfirm.value){setGateMessage('Пароли не совпадают.',true);return;}
        data=await api('/api/auth/register',{method:'POST',body:JSON.stringify({username,displayName,password,email:els.gateEmail?.value.trim()||'',inviterUsername:els.gateInviter?.value.trim().replace(/^@/,'')||'',deviceId:installId()})});
      }else data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      await finishAuth(data);els.gatePassword.value='';els.gateConfirm.value='';if(els.gateInviter)els.gateInviter.value='';enterGame();
    }catch(e){if(e.code==='ACCOUNT_BANNED')showBan(e.ban,e.data?.user||{username});else setGateMessage(errors[e.code]||'Не удалось выполнить запрос.',true);}finally{els.gateSubmit.disabled=false;}
  }
  async function checkAccess(){
    if(!state.user||!state.bootstrapped)return;
    try{
      const data=await api('/api/auth/me');
      if(!data.authenticated){state.user=null;state.revision=0;render();enterGuestGame();return;}
      const remoteRevision=Number(data.saveRevision)||0;
      if(remoteRevision>state.revision&&!state.syncing)await loadCloud();
    }
    catch(e){if(e.code==='ACCOUNT_BANNED'){showBan(e.ban,e.data?.user);window.dispatchEvent(new CustomEvent('velocity-account-banned',{detail:e.data||{}}));}}
  }
  function startStatusWatch(){if(state.statusTimer)clearInterval(state.statusTimer);state.statusTimer=setInterval(checkAccess,20000);}

  async function logout(){
    els.logout.disabled=true;setMessage('Сохраняем прогресс…',false,true);try{await flushSave();await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}
    state.user=null;state.revision=0;state.lastSave=null;render();setMode('login');setMessage();els.logout.disabled=false;enterGuestGame();
  }

  function ensureAuthPrompt(){
    let modal=$('onlineAuthPrompt');if(modal)return modal;
    modal=document.createElement('div');modal.id='onlineAuthPrompt';modal.className='guest-auth-prompt hidden';modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`<section class="guest-auth-card glass" role="dialog" aria-modal="true" aria-labelledby="onlineAuthPromptTitle"><div class="eyebrow">VELOCITY APEX / ONLINE</div><h2 id="onlineAuthPromptTitle">ОНЛАЙН НЕДОСТУПЕН</h2><p id="onlineAuthPromptText">Чтобы играть с другими игроками, войдите в аккаунт или зарегистрируйтесь.</p><div class="guest-auth-actions"><button data-auth-action="login" class="primary-btn" type="button">ВОЙТИ</button><button data-auth-action="register" class="secondary-btn" type="button">РЕГИСТРАЦИЯ</button><button data-auth-action="cancel" class="secondary-btn guest-auth-cancel" type="button">ОТМЕНА</button></div></section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{const action=e.target.closest('[data-auth-action]')?.dataset.authAction;if(!action&&e.target!==modal)return;if(action==='login'){hideAuthPrompt();showGateForm('login');}else if(action==='register'){hideAuthPrompt();showGateForm('register');}else hideAuthPrompt();});
    return modal;
  }
  function hideAuthPrompt(){const modal=$('onlineAuthPrompt');if(!modal)return;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
  function requestAuth(message='Чтобы играть с другими игроками, войдите в аккаунт или зарегистрируйтесь.'){
    if(state.user)return true;const modal=ensureAuthPrompt(),text=$('onlineAuthPromptText');if(text)text.textContent=message;modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');return false;
  }

  els.button.addEventListener('click',open);els.close.addEventListener('click',close);els.loginTab.addEventListener('click',()=>setMode('login'));els.registerTab.addEventListener('click',()=>setMode('register'));els.form.addEventListener('submit',onSubmit);els.logout.addEventListener('click',logout);
  els.gateSession.addEventListener('click',enterGame);els.gateOther.addEventListener('click',()=>showGateForm('login'));els.banOther.addEventListener('click',showGateChooser);els.gateCreate.addEventListener('click',()=>showGateForm('register'));els.gateBack.addEventListener('click',showGateChooser);els.gateLoginTab.addEventListener('click',()=>setGateMode('login'));els.gateRegisterTab.addEventListener('click',()=>setGateMode('register'));els.gateForm.addEventListener('submit',onGateSubmit);
  els.root.addEventListener('click',e=>{if(e.target===els.root)close();});addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.root.classList.contains('hidden'))close();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();else checkAccess();});addEventListener('pagehide',()=>{if(state.user&&state.lastSave&&preferenceTools)fetch('/api/account/save',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({preferences:preferenceTools.preferencesFromSave(state.lastSave),revision:state.revision}),keepalive:true}).catch(()=>{});});
  window.VelocityAccount={get user(){return state.user;},get authenticated(){return!!state.user;},get isAdmin(){return!!state.user?.isAdmin;},get pendingSave(){return state.pendingSave;},get ready(){return state.bootstrapped;},queueSave,flushSave,refreshCloud:loadCloud,raceRequest,economyTransaction,caseTransaction,open,enterGame,enterGuestGame,requestAuth};
  setMode('login');setGateMode('login');render();bootstrap();
})();
