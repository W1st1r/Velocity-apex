(function(){
  'use strict';
  const $=id=>document.getElementById(id),SAVE_KEY='velocityApex.v1',ACCOUNTS_KEY='velocityApex.accounts.v1';
  const els={
    root:$('account'),button:$('accountBtn'),menuStatus:$('accountMenuStatus'),close:$('accountCloseBtn'),guest:$('accountGuestView'),profile:$('accountProfileView'),loginTab:$('accountLoginTab'),registerTab:$('accountRegisterTab'),form:$('accountForm'),displayWrap:$('accountDisplayNameWrap'),display:$('accountDisplayName'),username:$('accountUsername'),password:$('accountPassword'),confirmWrap:$('accountConfirmWrap'),confirm:$('accountPasswordConfirm'),message:$('accountMessage'),submit:$('accountSubmitBtn'),displayView:$('accountDisplayNameView'),usernameView:$('accountUsernameView'),avatar:$('accountAvatar'),sync:$('accountSyncStatus'),profileMessage:$('accountProfileMessage'),logout:$('accountLogoutBtn'),
    gate:$('authGate'),gateChooser:$('authGateChooser'),gateSession:$('authGateSession'),gateAvatar:$('authGateAvatar'),gateDisplayName:$('authGateDisplayName'),gateUsername:$('authGateUsername'),gateKnownWrap:$('authGateKnownWrap'),gateKnownList:$('authGateKnownList'),gateEmpty:$('authGateEmpty'),gateOther:$('authGateOtherBtn'),gateCreate:$('authGateCreateBtn'),gateFormPanel:$('authGateFormPanel'),gateLoginTab:$('authGateLoginTab'),gateRegisterTab:$('authGateRegisterTab'),gateForm:$('authGateForm'),gateDisplayWrap:$('authGateDisplayWrap'),gateDisplay:$('authGateDisplay'),gateLogin:$('authGateLogin'),gatePassword:$('authGatePassword'),gateConfirmWrap:$('authGateConfirmWrap'),gateConfirm:$('authGateConfirm'),gateMessage:$('authGateMessage'),gateSubmit:$('authGateSubmit'),gateBack:$('authGateBack')
  };
  if(!els.root||!els.button||!els.gate)return;

  const state={mode:'login',gateMode:'login',user:null,revision:0,lastSave:null,pendingSave:null,syncTimer:0,syncing:false,bootstrapped:false,gameEntered:false};
  const errors={INVALID_USERNAME:'Логин: 3–24 символа, только a-z, 0-9 и _.',INVALID_DISPLAY_NAME:'Имя игрока: 2–24 символа без опасных спецсимволов.',INVALID_PASSWORD:'Пароль должен содержать от 8 до 128 символов.',USERNAME_TAKEN:'Этот логин уже занят.',INVALID_CREDENTIALS:'Неверный логин или пароль.',AUTH_REQUIRED:'Сессия истекла. Войдите снова.',REQUEST_TOO_LARGE:'Сохранение слишком большое.',DATABASE_UNAVAILABLE:'База аккаунтов временно недоступна.',SERVER_ERROR:'Ошибка сервера. Повторите попытку.'};
  const normalizeSave=raw=>window.Racing?.normalizeSave?window.Racing.normalizeSave(raw):raw;
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
    els.menuStatus.textContent=logged?String(state.user.displayName||state.user.username).slice(0,12).toUpperCase():'ГОСТЬ';els.button.classList.toggle('account-active',logged);
    if(logged){els.displayView.textContent=state.user.displayName;els.usernameView.textContent='@'+state.user.username;els.avatar.textContent=initials(state.user.displayName).toUpperCase();}
  }
  function setMode(mode){state.mode=mode==='register'?'register':'login';const reg=state.mode==='register';els.loginTab.classList.toggle('active',!reg);els.registerTab.classList.toggle('active',reg);els.loginTab.setAttribute('aria-selected',String(!reg));els.registerTab.setAttribute('aria-selected',String(reg));els.displayWrap.classList.toggle('hidden',!reg);els.confirmWrap.classList.toggle('hidden',!reg);els.submit.textContent=reg?'СОЗДАТЬ АККАУНТ':'ВОЙТИ';els.password.autocomplete=reg?'new-password':'current-password';setMessage();}
  function setGateMode(mode){
    state.gateMode=mode==='register'?'register':'login';const reg=state.gateMode==='register';
    els.gateLoginTab.classList.toggle('active',!reg);els.gateRegisterTab.classList.toggle('active',reg);els.gateLoginTab.setAttribute('aria-selected',String(!reg));els.gateRegisterTab.setAttribute('aria-selected',String(reg));els.gateDisplayWrap.classList.toggle('hidden',!reg);els.gateConfirmWrap.classList.toggle('hidden',!reg);els.gateSubmit.textContent=reg?'СОЗДАТЬ АККАУНТ':'ВОЙТИ';els.gatePassword.autocomplete=reg?'new-password':'current-password';setGateMessage();
  }
  async function api(path,options={}){
    const init={credentials:'same-origin',headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})},...options};
    const res=await fetch(path,init);let data={};try{data=await res.json();}catch{}
    if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';throw e;}return data;
  }

  function open(){
    if(!state.user){showGateForm('login');return;}
    els.root.classList.remove('hidden');els.root.setAttribute('aria-hidden','false');$('menu')?.classList.add('hidden');setMessage();setMessage('',false,true);setTimeout(()=>els.logout.focus(),30);
  }
  function close(){els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');if(state.gameEntered)$('menu')?.classList.remove('hidden');}
  function enterGame(){
    if(!state.user)return;
    state.gameEntered=true;els.gate.classList.add('hidden');els.gate.setAttribute('aria-hidden','true');$('menu')?.classList.remove('hidden');setGateMessage();
    window.dispatchEvent(new CustomEvent('velocity-account-entered',{detail:{user:state.user}}));
  }
  function requireGate(message=''){
    state.gameEntered=false;$('menu')?.classList.add('hidden');els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');renderGateChooser();if(message)setGateMessage(message,true);
  }
  function showGateForm(mode='login',username=''){
    $('menu')?.classList.add('hidden');els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');els.gateChooser.classList.add('hidden');els.gateFormPanel.classList.remove('hidden');setGateMode(mode);
    if(username)els.gateLogin.value=username;else if(mode==='login')els.gateLogin.value='';
    els.gatePassword.value='';els.gateConfirm.value='';if(mode==='register'&&!username)els.gateDisplay.value='';
    setTimeout(()=>{(mode==='register'?els.gateDisplay:els.gateLogin)?.focus();},30);
  }
  function showGateChooser(){
    els.gate.classList.remove('hidden');els.gate.setAttribute('aria-hidden','false');$('menu')?.classList.add('hidden');els.gateFormPanel.classList.add('hidden');els.gateChooser.classList.remove('hidden');setGateMessage();renderGateChooser();
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
    if(!state.user)return;els.sync.textContent='СИНХРОНИЗАЦИЯ…';
    try{const data=await api('/api/account/save');state.revision=data.revision||0;if(data.save){applySave(data.save);els.sync.textContent='СИНХРОНИЗИРОВАНО';}else{state.lastSave=localSave();await flushSave();}}
    catch(e){els.sync.textContent='ОШИБКА СИНХРОНИЗАЦИИ';setMessage(errors[e.code]||'Не удалось загрузить облачный прогресс.',true,true);}
  }
  async function bootstrap(){
    try{const data=await api('/api/auth/me');if(data.authenticated){state.user=data.user;rememberAccount(state.user);render();await loadCloud();}else{state.user=null;render();}}
    catch{state.user=null;render();}finally{state.bootstrapped=true;showGateChooser();if(!state.user&&readAccounts().length===0)showGateForm('login');}
  }
  async function flushSave(){
    clearTimeout(state.syncTimer);state.syncTimer=0;if(!state.user||state.syncing||!state.lastSave)return false;state.syncing=true;els.sync.textContent='СОХРАНЕНИЕ…';
    const snapshot=normalizeSave(state.lastSave);
    try{const data=await api('/api/account/save',{method:'PUT',body:JSON.stringify({save:snapshot})});state.revision=data.revision||state.revision;els.sync.textContent='СИНХРОНИЗИРОВАНО';return true;}
    catch(e){if(e.code==='AUTH_REQUIRED'){state.user=null;render();requireGate('Сессия истекла. Войдите снова.');}els.sync.textContent='НЕ СИНХРОНИЗИРОВАНО';return false;}
    finally{state.syncing=false;}
  }
  function queueSave(raw){if(!raw||typeof raw!=='object')return;state.lastSave=normalizeSave(JSON.parse(JSON.stringify(raw)));if(!state.user)return;clearTimeout(state.syncTimer);els.sync.textContent='ОЖИДАНИЕ…';state.syncTimer=setTimeout(flushSave,650);}
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
        data=await api('/api/auth/register',{method:'POST',body:JSON.stringify({username,displayName,password,save:localSave()})});
      }else data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      await finishAuth(data);els.password.value='';els.confirm.value='';setMessage('',false,true);
    }catch(e){setMessage(errors[e.code]||'Не удалось выполнить запрос.',true);}finally{els.submit.disabled=false;}
  }
  async function onGateSubmit(event){
    event.preventDefault();const username=els.gateLogin.value.trim().toLowerCase(),password=els.gatePassword.value;setGateMessage();els.gateSubmit.disabled=true;
    try{
      let data;
      if(state.gateMode==='register'){
        const displayName=els.gateDisplay.value.trim();if(password!==els.gateConfirm.value){setGateMessage('Пароли не совпадают.',true);return;}
        data=await api('/api/auth/register',{method:'POST',body:JSON.stringify({username,displayName,password,save:localSave()})});
      }else data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      await finishAuth(data);els.gatePassword.value='';els.gateConfirm.value='';enterGame();
    }catch(e){setGateMessage(errors[e.code]||'Не удалось выполнить запрос.',true);}finally{els.gateSubmit.disabled=false;}
  }
  async function logout(){
    els.logout.disabled=true;setMessage('Сохраняем прогресс…',false,true);try{await flushSave();await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}
    state.user=null;state.revision=0;state.lastSave=null;render();setMode('login');setMessage();els.logout.disabled=false;requireGate();
  }

  els.button.addEventListener('click',open);els.close.addEventListener('click',close);els.loginTab.addEventListener('click',()=>setMode('login'));els.registerTab.addEventListener('click',()=>setMode('register'));els.form.addEventListener('submit',onSubmit);els.logout.addEventListener('click',logout);
  els.gateSession.addEventListener('click',enterGame);els.gateOther.addEventListener('click',()=>showGateForm('login'));els.gateCreate.addEventListener('click',()=>showGateForm('register'));els.gateBack.addEventListener('click',showGateChooser);els.gateLoginTab.addEventListener('click',()=>setGateMode('login'));els.gateRegisterTab.addEventListener('click',()=>setGateMode('register'));els.gateForm.addEventListener('submit',onGateSubmit);
  els.root.addEventListener('click',e=>{if(e.target===els.root)close();});addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.root.classList.contains('hidden'))close();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});addEventListener('pagehide',()=>{if(state.user&&state.lastSave)fetch('/api/account/save',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({save:state.lastSave}),keepalive:true}).catch(()=>{});});
  window.VelocityAccount={get user(){return state.user;},get authenticated(){return!!state.user;},get pendingSave(){return state.pendingSave;},get ready(){return state.bootstrapped;},queueSave,flushSave,open,enterGame};
  setMode('login');setGateMode('login');render();bootstrap();
})();
