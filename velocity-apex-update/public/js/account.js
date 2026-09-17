(function(){
  'use strict';
  const $=id=>document.getElementById(id),SAVE_KEY='velocityApex.v1';
  const els={root:$('account'),button:$('accountBtn'),menuStatus:$('accountMenuStatus'),close:$('accountCloseBtn'),guest:$('accountGuestView'),profile:$('accountProfileView'),loginTab:$('accountLoginTab'),registerTab:$('accountRegisterTab'),form:$('accountForm'),displayWrap:$('accountDisplayNameWrap'),display:$('accountDisplayName'),username:$('accountUsername'),password:$('accountPassword'),confirmWrap:$('accountConfirmWrap'),confirm:$('accountPasswordConfirm'),message:$('accountMessage'),submit:$('accountSubmitBtn'),displayView:$('accountDisplayNameView'),usernameView:$('accountUsernameView'),avatar:$('accountAvatar'),sync:$('accountSyncStatus'),profileMessage:$('accountProfileMessage'),logout:$('accountLogoutBtn')};
  if(!els.root||!els.button)return;
  const state={mode:'login',user:null,revision:0,lastSave:null,pendingSave:null,syncTimer:0,syncing:false,bootstrapped:false};
  const errors={INVALID_USERNAME:'Логин: 3–24 символа, только a-z, 0-9 и _.',INVALID_DISPLAY_NAME:'Имя игрока: 2–24 символа без опасных спецсимволов.',INVALID_PASSWORD:'Пароль должен содержать от 8 до 128 символов.',USERNAME_TAKEN:'Этот логин уже занят.',INVALID_CREDENTIALS:'Неверный логин или пароль.',AUTH_REQUIRED:'Сессия истекла. Войдите снова.',REQUEST_TOO_LARGE:'Сохранение слишком большое.',DATABASE_UNAVAILABLE:'База аккаунтов временно недоступна.',SERVER_ERROR:'Ошибка сервера. Повторите попытку.'};
  const normalizeSave=raw=>window.Racing?.normalizeSave?window.Racing.normalizeSave(raw):raw;
  function localSave(){try{const x=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');return normalizeSave(x);}catch{return normalizeSave({});}}
  function setMessage(text='',bad=false,profile=false){const el=profile?els.profileMessage:els.message;el.textContent=text;el.classList.toggle('bad',!!bad);}
  function initials(name){const p=String(name||'VA').trim().split(/\s+/).filter(Boolean);return (p[0]?.[0]||'V')+(p[1]?.[0]||p[0]?.[1]||'A');}
  function render(){
    const logged=!!state.user;els.guest.classList.toggle('hidden',logged);els.profile.classList.toggle('hidden',!logged);
    els.menuStatus.textContent=logged?String(state.user.displayName||state.user.username).slice(0,12).toUpperCase():'ГОСТЬ';els.button.classList.toggle('account-active',logged);
    if(logged){els.displayView.textContent=state.user.displayName;els.usernameView.textContent='@'+state.user.username;els.avatar.textContent=initials(state.user.displayName).toUpperCase();}
  }
  function setMode(mode){state.mode=mode==='register'?'register':'login';const reg=state.mode==='register';els.loginTab.classList.toggle('active',!reg);els.registerTab.classList.toggle('active',reg);els.loginTab.setAttribute('aria-selected',String(!reg));els.registerTab.setAttribute('aria-selected',String(reg));els.displayWrap.classList.toggle('hidden',!reg);els.confirmWrap.classList.toggle('hidden',!reg);els.submit.textContent=reg?'СОЗДАТЬ АККАУНТ':'ВОЙТИ';els.password.autocomplete=reg?'new-password':'current-password';setMessage();}
  async function api(path,options={}){
    const init={credentials:'same-origin',headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})},...options};
    const res=await fetch(path,init);let data={};try{data=await res.json();}catch{}
    if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';throw e;}return data;
  }
  function open(){els.root.classList.remove('hidden');els.root.setAttribute('aria-hidden','false');$('menu')?.classList.add('hidden');setMessage();setMessage('',false,true);setTimeout(()=>state.user?els.logout.focus():els.username.focus(),30);}
  function close(){els.root.classList.add('hidden');els.root.setAttribute('aria-hidden','true');$('menu')?.classList.remove('hidden');}
  function applySave(raw){const save=normalizeSave(raw);if(!save||typeof save!=='object')return;state.pendingSave=save;try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{}window.dispatchEvent(new CustomEvent('velocity-account-save',{detail:{save,source:'cloud'}}));}
  async function loadCloud(){
    if(!state.user)return;els.sync.textContent='СИНХРОНИЗАЦИЯ…';
    try{const data=await api('/api/account/save');state.revision=data.revision||0;if(data.save){applySave(data.save);els.sync.textContent='СИНХРОНИЗИРОВАНО';}else{state.lastSave=localSave();await flushSave();}}
    catch(e){els.sync.textContent='ОШИБКА СИНХРОНИЗАЦИИ';setMessage(errors[e.code]||'Не удалось загрузить облачный прогресс.',true,true);}
  }
  async function bootstrap(){
    try{const data=await api('/api/auth/me');if(data.authenticated){state.user=data.user;render();await loadCloud();}else{state.user=null;render();}}
    catch{state.user=null;render();}finally{state.bootstrapped=true;}
  }
  async function flushSave(){
    clearTimeout(state.syncTimer);state.syncTimer=0;if(!state.user||state.syncing||!state.lastSave)return false;state.syncing=true;els.sync.textContent='СОХРАНЕНИЕ…';
    const snapshot=normalizeSave(state.lastSave);
    try{const data=await api('/api/account/save',{method:'PUT',body:JSON.stringify({save:snapshot})});state.revision=data.revision||state.revision;els.sync.textContent='СИНХРОНИЗИРОВАНО';return true;}
    catch(e){if(e.code==='AUTH_REQUIRED'){state.user=null;render();}els.sync.textContent='НЕ СИНХРОНИЗИРОВАНО';return false;}
    finally{state.syncing=false;}
  }
  function queueSave(raw){if(!raw||typeof raw!=='object')return;state.lastSave=normalizeSave(JSON.parse(JSON.stringify(raw)));if(!state.user)return;clearTimeout(state.syncTimer);els.sync.textContent='ОЖИДАНИЕ…';state.syncTimer=setTimeout(flushSave,650);}
  async function onSubmit(event){
    event.preventDefault();const username=els.username.value.trim().toLowerCase(),password=els.password.value;setMessage();els.submit.disabled=true;
    try{
      let data;
      if(state.mode==='register'){
        const displayName=els.display.value.trim();if(password!==els.confirm.value){setMessage('Пароли не совпадают.',true);return;}
        data=await api('/api/auth/register',{method:'POST',body:JSON.stringify({username,displayName,password,save:localSave()})});
      }else data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      state.user=data.user;state.lastSave=localSave();els.password.value='';els.confirm.value='';render();setMessage('',false,true);await loadCloud();
      try{if(!localStorage.getItem('velocityApex.onlineName'))localStorage.setItem('velocityApex.onlineName',state.user.displayName);}catch{}
    }catch(e){setMessage(errors[e.code]||'Не удалось выполнить запрос.',true);}finally{els.submit.disabled=false;}
  }
  async function logout(){els.logout.disabled=true;setMessage('Сохраняем прогресс…',false,true);try{await flushSave();await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}state.user=null;state.revision=0;state.lastSave=null;render();setMode('login');setMessage();els.logout.disabled=false;}
  els.button.addEventListener('click',open);els.close.addEventListener('click',close);els.loginTab.addEventListener('click',()=>setMode('login'));els.registerTab.addEventListener('click',()=>setMode('register'));els.form.addEventListener('submit',onSubmit);els.logout.addEventListener('click',logout);
  els.root.addEventListener('click',e=>{if(e.target===els.root)close();});addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.root.classList.contains('hidden'))close();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});addEventListener('pagehide',()=>{if(state.user&&state.lastSave)fetch('/api/account/save',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({save:state.lastSave}),keepalive:true}).catch(()=>{});});
  window.VelocityAccount={get user(){return state.user;},get authenticated(){return!!state.user;},get pendingSave(){return state.pendingSave;},queueSave,flushSave,open};
  setMode('login');render();bootstrap();
})();
