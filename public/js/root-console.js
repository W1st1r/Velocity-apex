(function(){
  'use strict';
  const R=window.Racing;
  const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
  const SYSTEM_CAR='apexLime',SYSTEM_EFFECT='standard',MAX_CR=999999999;

  function replaceSave(target,next){for(const key of Object.keys(target))delete target[key];Object.assign(target,next);return target;}
  function normalizeInPlace(save){return replaceSave(save,R.normalizeSave(save));}
  function setCredits(save,value){
    let n=value;if(typeof value==='string'){const raw=value.trim();if(!raw||!/^\d+$/.test(raw))return false;n=Number(raw);}
    if(typeof n!=='number'||!Number.isFinite(n)||!Number.isInteger(n)||n<0||n>Number.MAX_SAFE_INTEGER)return false;
    save.credits=n;normalizeInPlace(save);return true;
  }
  function grant(save,kind,id){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects';if(!catalog||!has(catalog,id))return false;
    if(!Array.isArray(save[key]))save[key]=[];if(!save[key].includes(id))save[key].push(id);normalizeInPlace(save);return true;
  }
  function revoke(save,kind,id){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects',selectedKey=cars?'selectedLivery':'selectedEffect',fallback=cars?SYSTEM_CAR:SYSTEM_EFFECT;
    if(!catalog||!has(catalog,id)||id===fallback)return false;if(!Array.isArray(save[key]))save[key]=[];save[key]=save[key].filter(x=>x!==id);if(save[selectedKey]===id)save[selectedKey]=fallback;normalizeInPlace(save);return true;
  }
  function equip(save,kind,id){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects',selectedKey=cars?'selectedLivery':'selectedEffect';
    if(!catalog||!has(catalog,id)||!Array.isArray(save[key])||!save[key].includes(id))return false;save[selectedKey]=id;normalizeInPlace(save);return true;
  }
  function grantAll(save,kind){const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects';save[key]=Object.keys(catalog);normalizeInPlace(save);return true;}
  function revokeExtras(save,kind){const cars=kind==='car',key=cars?'ownedLiveries':'ownedEffects',selectedKey=cars?'selectedLivery':'selectedEffect',fallback=cars?SYSTEM_CAR:SYSTEM_EFFECT;save[key]=[fallback];save[selectedKey]=fallback;normalizeInPlace(save);return true;}
  function unlockEverything(save){grantAll(save,'car');grantAll(save,'effect');for(const id of R.CASE_ORDER||[])setCase(save,id,10);return true;}
  function resetInventory(save){revokeExtras(save,'car');revokeExtras(save,'effect');if(!save.caseInventory||typeof save.caseInventory!=='object')save.caseInventory={};for(const id of R.CASE_ORDER||[])save.caseInventory[id]=0;normalizeInPlace(save);return true;}
  function resetPlayerProgress(save){replaceSave(save,R.normalizeSave({}));return true;}
  function setCase(save,id,value){if(!R.CASES||!has(R.CASES,id))return false;const n=Math.max(0,Math.min(999,Math.floor(Number(value)||0)));if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};save.caseInventory[id]=n;normalizeInPlace(save);return true;}
  function changeCase(save,id,delta){if(!R.CASES||!has(R.CASES,id)||!Number.isInteger(delta))return false;const now=Math.max(0,Math.floor(Number(save.caseInventory?.[id])||0));return setCase(save,id,now+delta);}

  R.RootTools={SYSTEM_CAR,SYSTEM_EFFECT,MAX_CR,setCredits,grant,revoke,equip,grantAll,revokeExtras,unlockEverything,resetInventory,resetPlayerProgress,normalizeInPlace,setCase,changeCase};

  const $=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('ru-RU');
  const when=value=>value?new Date(Number(value)).toLocaleString('ru-RU'):'—';
  const remaining=expiresAt=>{const ms=Math.max(0,Number(expiresAt||0)-Date.now()),sec=Math.ceil(ms/1000);if(sec<60)return sec+' сек';const m=Math.ceil(sec/60);if(m<60)return m+' мин';const h=Math.ceil(m/60);return h<48?h+' ч':Math.ceil(h/24)+' д';};
  const BAN_UNIT_MS={second:1000,minute:60000,hour:3600000,day:86400000};

  class RootConsole{
    constructor(opts){
      this.save=opts.save;this.onChange=opts.onChange||(()=>{});this.onBack=opts.onBack||(()=>{});this.onView=opts.onView||(()=>{});
      this.authorized=false;this.confirmAction=null;this.lastMessage='';this.authTimer=0;this.tab='money';this.remoteDetail=null;this.remoteDetailTab='overview';this.remoteResourceTab='car';this.remoteContext='accounts';this.searchTimer=0;
      this.auth=$('rootAuth');this.console=$('rootConsole');this.password=$('rootPassword');this.authMessage=$('rootAuthMessage');this.notice=$('rootNotice');
      this.balance=$('rootCurrentBalance');this.creditInput=$('rootCreditInput');this.cars=$('rootCars');this.effects=$('rootEffects');this.cases=$('rootCases');this.diag=$('rootDiagnostics');
      this.tabs=$('rootTabs');this.accountSearch=$('rootAccountSearch');this.accountList=$('rootAccountList');this.accountDetail=$('rootAccountDetail');this.blockedSearch=$('rootBlockedSearch');this.blockedList=$('rootBlockedList');this.blockedDetail=$('rootBlockedDetail');
      this.confirm=$('rootConfirm');this.confirmTitle=$('rootConfirmTitle');this.confirmText=$('rootConfirmText');this._bind();
    }
    async api(path,options={}){
      const init={credentials:'same-origin',headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})},...options};const res=await fetch(path,init);let data={};try{data=await res.json();}catch{}
      if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';e.data=data;throw e;}return data;
    }
    _bind(){
      $('rootAuthCancel').addEventListener('click',()=>this.back());$('rootAuthSubmit').addEventListener('click',()=>this.authorize());
      this.password.addEventListener('input',()=>{this.password.value=this.password.value.replace(/\D/g,'').slice(0,8);this.authMessage.textContent='AUTHORIZATION REQUIRED';this.authMessage.classList.remove('denied','granted');});
      this.password.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.authorize();}});
      $('rootBackBtn').addEventListener('click',()=>this.back());$('rootLockBtn').addEventListener('click',()=>this.lock());$('rootApplyCredits').addEventListener('click',()=>this.applyCredits());this.creditInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.applyCredits();}});
      this.console.addEventListener('click',e=>this._quickAction(e));this.cars.addEventListener('click',e=>this._itemAction(e,'car'));this.effects.addEventListener('click',e=>this._itemAction(e,'effect'));this.cases.addEventListener('click',e=>this._caseAction(e));
      this.tabs.addEventListener('click',e=>{const b=e.target.closest('[data-root-tab]');if(b)this.switchTab(b.dataset.rootTab);});
      $('rootCopySave').addEventListener('click',()=>this.copySave());$('rootResetProgress').addEventListener('click',()=>this.askConfirm('RESET PLAYER PROGRESS?','CR, inventory, records and race settings will return to normal defaults.','reset-progress'));$('rootConfirmCancel').addEventListener('click',()=>this.closeConfirm());$('rootConfirmApply').addEventListener('click',()=>this.runConfirm());
      $('rootAccountSearchBtn').addEventListener('click',()=>this.searchAccounts(false));$('rootBlockedSearchBtn').addEventListener('click',()=>this.searchAccounts(true));
      this.accountSearch.addEventListener('input',()=>this.queueSearch(false));this.blockedSearch.addEventListener('input',()=>this.queueSearch(true));
      this.accountList.addEventListener('click',e=>this._accountListAction(e,false));this.blockedList.addEventListener('click',e=>this._accountListAction(e,true));
      this.accountDetail.addEventListener('click',e=>this._remoteAction(e,false));this.blockedDetail.addEventListener('click',e=>this._remoteAction(e,true));
    }
    open(){this.closeConfirm();if(!window.VelocityAccount?.isAdmin){this.message('ADMIN ACCOUNT REQUIRED','bad');this.back();return;}this.authorized=false;this.showAuth();}
    showAuth(){clearTimeout(this.authTimer);this.authTimer=0;this.console.classList.add('hidden');this.auth.classList.remove('hidden');this.password.value='';this.authMessage.textContent='AUTHORIZATION REQUIRED';this.authMessage.className='root-auth-message';this.onView('auth');setTimeout(()=>{try{this.password.focus({preventScroll:true});}catch(_){this.password.focus();}},80);}
    showConsole(){this.auth.classList.add('hidden');this.console.classList.remove('hidden');this.onView('console');this.switchTab('money');this.render();}
    async authorize(){
      if(!window.VelocityAccount?.isAdmin){this.authMessage.textContent='ADMIN ACCOUNT REQUIRED';this.authMessage.className='root-auth-message denied';return;}
      $('rootAuthSubmit').disabled=true;this.authMessage.textContent='ПРОВЕРКА…';
      try{await this.api('/api/admin/unlock',{method:'POST',body:JSON.stringify({password:this.password.value})});this.authorized=true;this.authMessage.textContent='ACCESS GRANTED';this.authMessage.className='root-auth-message granted';clearTimeout(this.authTimer);this.authTimer=setTimeout(()=>{this.authTimer=0;this.showConsole();},180);}
      catch(e){this.authorized=false;this.authMessage.textContent=e.code==='ADMIN_PASSWORD_INVALID'?'ACCESS DENIED':'ADMIN AUTH ERROR';this.authMessage.className='root-auth-message denied';this.password.classList.remove('root-shake');void this.password.offsetWidth;this.password.classList.add('root-shake');this.password.select();}
      finally{$('rootAuthSubmit').disabled=false;}
    }
    back(){clearTimeout(this.authTimer);this.authTimer=0;this.auth.classList.add('hidden');this.console.classList.add('hidden');this.closeConfirm();this.onBack();}
    async lock(){this.authorized=false;try{await this.api('/api/admin/lock',{method:'POST',body:'{}'});}catch{}this.message('ADMIN PANEL LOCKED','warn');this.back();}
    message(text,kind='ok'){this.lastMessage=text;if(this.notice){this.notice.textContent=text;this.notice.className='root-notice '+kind;}}
    changed(reason){this.onChange(reason);this.renderLocal();}
    switchTab(tab){
      const allowed=['money','cars','effects','cases','accounts','blocked'];if(!allowed.includes(tab))tab='money';this.tab=tab;
      this.tabs.querySelectorAll('[data-root-tab]').forEach(b=>b.classList.toggle('active',b.dataset.rootTab===tab));this.console.querySelectorAll('[data-root-pane]').forEach(p=>p.classList.toggle('hidden',p.dataset.rootPane!==tab));
      if(tab==='accounts')this.searchAccounts(false);if(tab==='blocked')this.searchAccounts(true);this.renderLocal();
    }
    applyCredits(){if(!R.RootTools.setCredits(this.save,this.creditInput.value)){this.message('INVALID CREDIT VALUE','bad');this.creditInput.classList.remove('root-shake');void this.creditInput.offsetWidth;this.creditInput.classList.add('root-shake');return;}this.creditInput.value=String(this.save.credits);this.message('BALANCE APPLIED');this.changed('credits');}
    _quickAction(e){
      const btn=e.target.closest('[data-root-action]');if(!btn)return;const action=btn.dataset.rootAction;
      if(action==='add-credits'){const add=Number(btn.dataset.amount),next=this.save.credits+add;if(!Number.isSafeInteger(next)||!R.RootTools.setCredits(this.save,next)){this.message('CREDIT LIMIT REACHED','bad');return;}this.message('CREDITS ADDED');this.changed('credits');return;}
      if(action==='set-zero'){R.RootTools.setCredits(this.save,0);this.message('BALANCE SET TO 0');this.changed('credits');return;}if(action==='max-cr'){R.RootTools.setCredits(this.save,R.RootTools.MAX_CR);this.message('MAX CR APPLIED');this.changed('credits');return;}
      if(action==='unlock'){R.RootTools.unlockEverything(this.save);this.message('ALL ITEMS UNLOCKED');this.changed('inventory');return;}if(action==='reset-inventory'){this.askConfirm('RESET INVENTORY?','Extra cars, effects and cases will be revoked.','reset-inventory');return;}
      if(action==='grant-cars'){R.RootTools.grantAll(this.save,'car');this.message('ALL CARS GRANTED');this.changed('inventory');return;}if(action==='revoke-cars'){R.RootTools.revokeExtras(this.save,'car');this.message('PAID CARS REVOKED');this.changed('inventory');return;}
      if(action==='grant-effects'){R.RootTools.grantAll(this.save,'effect');this.message('ALL EFFECTS GRANTED');this.changed('inventory');return;}if(action==='revoke-effects'){R.RootTools.revokeExtras(this.save,'effect');this.message('EXTRA EFFECTS REVOKED');this.changed('inventory');}
    }
    _itemAction(e,kind){const btn=e.target.closest('[data-item-action]');if(!btn)return;const id=btn.dataset.itemId,action=btn.dataset.itemAction;let ok=false;if(action==='grant')ok=R.RootTools.grant(this.save,kind,id);if(action==='revoke')ok=R.RootTools.revoke(this.save,kind,id);if(action==='equip')ok=R.RootTools.equip(this.save,kind,id);if(!ok){this.message('ACTION REJECTED','bad');return;}this.message((action+' '+id).toUpperCase());this.changed('inventory');}
    _caseAction(e){const btn=e.target.closest('[data-case-action]');if(!btn)return;const id=btn.dataset.caseId,delta=Number(btn.dataset.delta)||0;if(!R.RootTools.changeCase(this.save,id,delta)){this.message('CASE ACTION REJECTED','bad');return;}this.message(`${id.toUpperCase()} ${delta>0?'+':''}${delta}`);this.changed('cases');}
    askConfirm(title,text,action){this.confirmAction=action;this.confirmTitle.textContent=title;this.confirmText.textContent=text;this.confirm.classList.remove('hidden');}
    closeConfirm(){this.confirmAction=null;if(this.confirm)this.confirm.classList.add('hidden');}
    runConfirm(){const action=this.confirmAction;this.closeConfirm();if(action==='reset-inventory'){R.RootTools.resetInventory(this.save);this.message('INVENTORY RESET','warn');this.changed('inventory');}else if(action==='reset-progress'){R.RootTools.resetPlayerProgress(this.save);this.message('PLAYER PROGRESS RESET','warn');this.changed('reset-progress');}}
    async copySave(){const text=JSON.stringify(this.save,null,2);let ok=false;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);ok=true;}}catch(_){}if(!ok){try{const area=document.createElement('textarea');area.value=text;area.className='root-copy-fallback';document.body.appendChild(area);area.focus();area.select();ok=document.execCommand&&document.execCommand('copy');area.remove();}catch(_){}}this.message(ok?'SAVE COPIED':'CLIPBOARD UNAVAILABLE',ok?'ok':'bad');}
    storageStatus(){try{const key='__va_root_probe__';localStorage.setItem(key,'1');localStorage.removeItem(key);return 'AVAILABLE';}catch(_){return 'UNAVAILABLE';}}
    render(){if(!this.authorized||this.console.classList.contains('hidden'))return;this.renderLocal();}
    renderLocal(){
      if(!this.authorized)return;normalizeInPlace(this.save);this.balance.textContent=fmt(this.save.credits)+' CR';if(document.activeElement!==this.creditInput)this.creditInput.value=String(this.save.credits);
      if(this.tab==='cars')this.cars.innerHTML=Object.entries(R.LIVERIES).map(([id,item])=>this.itemCard('car',id,item)).join('');
      if(this.tab==='effects')this.effects.innerHTML=Object.entries(R.EFFECTS).map(([id,item])=>this.itemCard('effect',id,item)).join('');
      if(this.tab==='cases')this.cases.innerHTML=(R.CASE_ORDER||[]).map(id=>this.caseCard(id,R.CASES[id])).join('');
      if(this.tab==='money'){
        const diag=[['Save version',this.save.saveVersion],['Credits',fmt(this.save.credits)+' CR'],['Owned cars',this.save.ownedLiveries.length+' / '+Object.keys(R.LIVERIES).length],['Owned effects',this.save.ownedEffects.length+' / '+Object.keys(R.EFFECTS).length],['Cases',Object.values(this.save.caseInventory||{}).reduce((a,b)=>a+(Number(b)||0),0)],['Selected car',this.save.selectedLivery],['Selected effect',this.save.selectedEffect],['localStorage',this.storageStatus()]];
        this.diag.innerHTML=diag.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
      }
    }
    itemCard(kind,id,item){
      const cars=kind==='car',owned=this.save[cars?'ownedLiveries':'ownedEffects'].includes(id),equipped=this.save[cars?'selectedLivery':'selectedEffect']===id,system=id===(cars?SYSTEM_CAR:SYSTEM_EFFECT);
      const preview=cars&&item.sprite&&item.sprite.thumbnail?`<img src="${esc(item.sprite.thumbnail)}" alt="" draggable="false">`:`<span class="root-swatch" style="--swatch:${esc(item.primary||item.outer||'#8dff49')};--swatch2:${esc(item.secondary||item.inner||'#eaffdf')}"></span>`;
      const meta=cars?`${esc((R.CAR_CATEGORIES&&R.CAR_CATEGORIES[R.normalizeCarCategory?R.normalizeCarCategory(item.category):item.category]?.label)||item.category||'basic')} · ${item.price?fmt(item.price)+' CR':'FREE'}`:(item.price?fmt(item.price)+' CR':'FREE');let actions='';
      if(!owned)actions=`<button type="button" data-item-action="grant" data-item-id="${esc(id)}">GRANT</button>`;else{actions=equipped?'<span class="root-equipped">EQUIPPED</span>':`<button type="button" data-item-action="equip" data-item-id="${esc(id)}">EQUIP</button>`;if(!system)actions+=`<button type="button" class="danger" data-item-action="revoke" data-item-id="${esc(id)}">REVOKE</button>`;}
      return `<article class="root-item ${equipped?'equipped':''}"><div class="root-item-preview">${preview}</div><div class="root-item-copy"><strong>${esc(item.name)}</strong><small>${meta}</small><div class="root-badges"><span class="${owned?'owned':'locked'}">${owned?'OWNED':'LOCKED'}</span>${system?'<span class="system">SYSTEM</span>':''}</div></div><div class="root-item-actions">${actions}</div></article>`;
    }
    caseCard(id,item){const count=Math.max(0,Math.floor(Number(this.save.caseInventory?.[id])||0));return `<article class="root-item root-case-item"><div class="root-case-orb" style="--case:${esc(item?.accent||'#8dff49')}"></div><div class="root-item-copy"><strong>${esc(item?.name||id)}</strong><small>${esc(item?.label||id)} · ${fmt(item?.price||0)} CR</small><div class="root-badges"><span class="owned">${count} ШТ.</span></div></div><div class="root-item-actions"><button type="button" data-case-action="change" data-case-id="${esc(id)}" data-delta="1">+1</button><button type="button" data-case-action="change" data-case-id="${esc(id)}" data-delta="5">+5</button><button type="button" class="danger" data-case-action="change" data-case-id="${esc(id)}" data-delta="-1">−1</button></div></article>`;}
    queueSearch(blocked){clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.searchAccounts(blocked),260);}
    async searchAccounts(blocked){
      if(!this.authorized)return;const input=blocked?this.blockedSearch:this.accountSearch,list=blocked?this.blockedList:this.accountList,q=input.value.trim().toLowerCase().replace(/^@/,'');list.innerHTML='<div class="root-loading">ЗАГРУЗКА…</div>';
      try{const data=await this.api(`/api/admin/accounts?q=${encodeURIComponent(q)}${blocked?'&blocked=1':''}`);this.renderAccountList(list,data.accounts||[],blocked);}catch(e){list.innerHTML=`<div class="root-empty">${esc(this.adminError(e.code))}</div>`;if(e.code==='ADMIN_LOCKED')this.showAuth();}
    }
    renderAccountList(list,accounts,blocked){
      if(!accounts.length){list.innerHTML='<div class="root-empty">НИЧЕГО НЕ НАЙДЕНО</div>';return;}
      list.innerHTML=accounts.map(a=>{const selected=this.remoteDetail?.user?.id===a.id&&this.remoteContext===(blocked?'blocked':'accounts');return `<button class="root-account-row ${selected?'selected':''}" type="button" data-account-id="${esc(a.id)}"><span class="root-account-avatar">${esc((a.displayName||a.username||'VA').slice(0,2).toUpperCase())}</span><span class="root-account-copy"><strong>${esc(a.displayName||a.username)}</strong><em>@${esc(a.username)}</em><small>${a.lastLoginAt?'Вход: '+esc(when(a.lastLoginAt)):'Входов ещё не было'}</small></span>${a.ban?`<span class="root-ban-chip">BAN · ${esc(remaining(a.ban.expiresAt))}</span>`:'<span class="root-open-chip">ОТКРЫТЬ ›</span>'}</button>`;}).join('');
    }
    _accountListAction(e,blocked){const row=e.target.closest('[data-account-id]');if(row)this.openAccount(row.dataset.accountId,blocked);}
    async openAccount(id,blocked){
      const detail=blocked?this.blockedDetail:this.accountDetail;detail.classList.remove('root-account-detail-empty');detail.innerHTML='<div class="root-loading">ЗАГРУЗКА ПРОФИЛЯ…</div>';this.remoteContext=blocked?'blocked':'accounts';this.remoteResourceTab='car';this.remoteDetailTab='overview';
      try{const data=await this.api('/api/admin/account/'+encodeURIComponent(id));this.remoteDetail=data;this.renderRemoteDetail(detail,data,blocked);this.searchAccounts(blocked);detail.scrollIntoView?.({block:'nearest'});}catch(e){detail.innerHTML=`<div class="root-empty">${esc(this.adminError(e.code))}</div>`;}
    }
    renderRemoteDetail(container,data,blocked){
      if(!data?.user)return;const u=data.user,s=data.save||{},ban=data.ban,protectedAdmin=!!u.isAdmin;this.remoteDetail=data;
      const carCount=Array.isArray(s.ownedLiveries)?s.ownedLiveries.length:0,effectCount=Array.isArray(s.ownedEffects)?s.ownedEffects.length:0,caseCount=Object.values(s.caseInventory||{}).reduce((sum,n)=>sum+Math.max(0,Math.floor(Number(n)||0)),0);
      const status=protectedAdmin?'ADMIN':ban?'ЗАБЛОКИРОВАН':'АКТИВЕН';
      container.classList.remove('root-account-detail-empty');
      container.innerHTML=`<div class="root-admin-profile-card">
          <div class="root-admin-profile"><span class="root-account-avatar large">${esc((u.displayName||u.username).slice(0,2).toUpperCase())}</span><div><small>ПРОФИЛЬ ИГРОКА</small><strong>${esc(u.displayName||u.username)}</strong><em>@${esc(u.username)}</em></div><div class="root-admin-profile-meta"><span>${fmt(s.credits)} CR</span><small class="root-account-status ${ban?'banned':protectedAdmin?'admin':''}">${esc(status)}</small></div></div>
          <div class="root-admin-facts">
            <div><small>ДАТА РЕГИСТРАЦИИ</small><strong>${esc(when(u.createdAt))}</strong></div>
            <div><small>ПОСЛЕДНИЙ ЗАХОД</small><strong>${esc(u.lastLoginAt?when(u.lastLoginAt):'Ещё не входил')}</strong></div>
            <div><small>ОБЛАЧНЫЙ SAVE</small><strong>${esc(data.updatedAt?when(data.updatedAt):'Нет данных')}</strong></div>
            <div><small>SERVER REVISION</small><strong>${Number(data.revision)||0}</strong></div>
          </div>
        </div>
        <div class="root-admin-detail-tabs" role="tablist" aria-label="Управление аккаунтом">
          <button class="${this.remoteDetailTab==='overview'?'active':''}" type="button" data-admin-detail-tab="overview">ОБЗОР</button>
          <button class="${this.remoteDetailTab==='money'?'active':''}" type="button" data-admin-detail-tab="money">ДЕНЬГИ</button>
          <button class="${this.remoteDetailTab==='resources'?'active':''}" type="button" data-admin-detail-tab="resources">РЕСУРСЫ</button>
          <button class="${this.remoteDetailTab==='ban'?'active':''}" type="button" data-admin-detail-tab="ban">БЛОКИРОВКА</button>
        </div>
        ${this.remoteDetailPane(data,{blocked,protectedAdmin,ban,carCount,effectCount,caseCount})}`;
    }
    remoteDetailPane(data,meta){
      const u=data.user,s=data.save||{},ban=meta.ban;
      if(this.remoteDetailTab==='money')return `<section class="root-admin-section root-admin-action-card"><div class="root-admin-section-head"><div><span>ДЕНЬГИ</span><small>Баланс игрока: ${fmt(s.credits)} CR</small></div></div><div class="root-admin-credit-presets"><button type="button" data-credit-preset="1000">1 000</button><button type="button" data-credit-preset="10000">10 000</button><button type="button" data-credit-preset="100000">100 000</button><button type="button" data-credit-preset="1000000">1 000 000</button></div><div class="root-admin-credit-row"><input class="root-input root-admin-credit-input" type="text" inputmode="numeric" placeholder="Введите сумму CR"><button type="button" data-admin-act="credit-add">+ ДОБАВИТЬ</button><button type="button" class="danger" data-admin-act="credit-take">− ЗАБРАТЬ</button></div><p class="root-admin-hint">Укажите сумму без знака. Выберите нужное действие справа.</p></section>`;
      if(this.remoteDetailTab==='resources'){const resourceList=this.remoteResourceList(data,this.remoteResourceTab);return `<section class="root-admin-section root-admin-action-card"><div class="root-admin-section-head"><div><span>РЕСУРСЫ</span><small>Выдача и изъятие предметов</small></div></div><div class="root-admin-resource-tabs"><button class="${this.remoteResourceTab==='car'?'active':''}" type="button" data-admin-resource-tab="car">МАШИНЫ · ${meta.carCount}</button><button class="${this.remoteResourceTab==='effect'?'active':''}" type="button" data-admin-resource-tab="effect">ЭФФЕКТЫ · ${meta.effectCount}</button><button class="${this.remoteResourceTab==='case'?'active':''}" type="button" data-admin-resource-tab="case">КЕЙСЫ · ${meta.caseCount}</button></div><div class="root-admin-resource-list">${resourceList}</div></section>`;}
      if(this.remoteDetailTab==='ban'){
        if(meta.protectedAdmin)return '<section class="root-admin-section root-admin-action-card"><div class="root-admin-section-head"><div><span>БЛОКИРОВКА</span><small>ACCOUNT ACCESS</small></div></div><div class="root-protected-note">Администраторский аккаунт защищён от блокировки.</div></section>';
        return `<section class="root-admin-section root-admin-action-card root-ban-editor"><div class="root-admin-section-head"><div><span>БЛОКИРОВКА</span><small>Настройте точный срок и причину</small></div></div>${ban?this.activeBanCard(ban):''}<label class="root-admin-label">ПРИЧИНА БЛОКИРОВКИ<textarea class="root-admin-ban-reason" maxlength="240" placeholder="Например: нарушение правил Online"></textarea></label><div class="root-ban-duration-label">СРОК БЛОКИРОВКИ</div><div class="root-admin-ban-presets"><button type="button" data-ban-preset-value="30" data-ban-preset-unit="second">30 СЕК</button><button type="button" data-ban-preset-value="5" data-ban-preset-unit="minute">5 МИН</button><button type="button" data-ban-preset-value="1" data-ban-preset-unit="hour">1 ЧАС</button><button type="button" data-ban-preset-value="1" data-ban-preset-unit="day">1 ДЕНЬ</button><button type="button" data-ban-preset-value="7" data-ban-preset-unit="day">7 ДНЕЙ</button></div><div class="root-admin-ban-row"><input class="root-input root-admin-ban-duration" type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="Длительность блокировки"><select class="root-admin-ban-unit" aria-label="Единица срока"><option value="second">СЕКУНДА</option><option value="minute">МИНУТА</option><option value="hour">ЧАС</option><option value="day" selected>ДЕНЬ</option></select><button type="button" class="danger" data-admin-act="ban">ЗАБЛОКИРОВАТЬ</button></div><p class="root-admin-hint">Минимум 1 секунда. Максимальный срок — 365 дней. Новая блокировка заменит текущую.</p></section>`;
      }
      return `<section class="root-admin-overview"><div class="root-admin-overview-grid"><div><small>БАЛАНС</small><strong>${fmt(s.credits)} CR</strong></div><div><small>МАШИНЫ</small><strong>${meta.carCount} / ${Object.keys(R.LIVERIES||{}).length}</strong></div><div><small>ЭФФЕКТЫ</small><strong>${meta.effectCount} / ${Object.keys(R.EFFECTS||{}).length}</strong></div><div><small>КЕЙСЫ</small><strong>${meta.caseCount} ШТ.</strong></div></div><div class="root-admin-loadout"><div><small>АКТИВНАЯ МАШИНА</small><strong>${esc(R.LIVERIES?.[s.selectedLivery]?.name||s.selectedLivery||'—')}</strong></div><div><small>АКТИВНЫЙ ЭФФЕКТ</small><strong>${esc(R.EFFECTS?.[s.selectedEffect]?.name||s.selectedEffect||'—')}</strong></div></div>${ban?this.activeBanCard(ban):'<div class="root-account-ok"><strong>ДОСТУП К АККАУНТУ РАЗРЕШЁН</strong><span>Активной блокировки нет.</span></div>'}<p class="root-admin-overview-help">Выберите сверху «Деньги», «Ресурсы» или «Блокировка», чтобы изменить аккаунт.</p></section>`;
    }
    activeBanCard(ban){return `<div class="root-ban-active"><strong>АКТИВНАЯ БЛОКИРОВКА · ${esc(remaining(ban.expiresAt))}</strong><p>${esc(ban.reason||'Причина не указана')}</p><small>До ${esc(when(ban.expiresAt))}</small><button type="button" data-admin-act="unban">РАЗБЛОКИРОВАТЬ</button></div>`;}
    remoteResourceList(data,kind){
      const s=data.save||{};
      if(kind==='car'){const owned=new Set(s.ownedLiveries||[]);return Object.entries(R.LIVERIES).map(([id,item])=>this.remoteResourceRow('car',id,item.name,owned.has(id),item.sprite?.thumbnail)).join('');}
      if(kind==='effect'){const owned=new Set(s.ownedEffects||[]);return Object.entries(R.EFFECTS).map(([id,item])=>this.remoteResourceRow('effect',id,item.name,owned.has(id),null,item.outer||item.inner)).join('');}
      return (R.CASE_ORDER||[]).map(id=>{const item=R.CASES[id],count=Math.max(0,Math.floor(Number(s.caseInventory?.[id])||0));return `<div class="root-admin-resource-row"><span class="root-case-orb small" style="--case:${esc(item?.accent||'#8dff49')}"></span><div><strong>${esc(item?.name||id)}</strong><small>${count} ШТ.</small></div><div><button type="button" data-admin-act="resource" data-resource-kind="case" data-resource-id="${esc(id)}" data-resource-action="grant" data-resource-qty="1">+1</button><button type="button" data-admin-act="resource" data-resource-kind="case" data-resource-id="${esc(id)}" data-resource-action="grant" data-resource-qty="5">+5</button><button type="button" class="danger" data-admin-act="resource" data-resource-kind="case" data-resource-id="${esc(id)}" data-resource-action="revoke" data-resource-qty="1">−1</button></div></div>`;}).join('');
    }
    remoteResourceRow(kind,id,name,owned,img,color){const system=id===(kind==='car'?SYSTEM_CAR:SYSTEM_EFFECT),visual=img?`<img src="${esc(img)}" alt="">`:`<span class="root-swatch" style="--swatch:${esc(color||'#8dff49')};--swatch2:#eaffdf"></span>`;return `<div class="root-admin-resource-row"><span class="root-admin-resource-visual">${visual}</span><div><strong>${esc(name)}</strong><small>${owned?'ВЫДАНО':'НЕ ВЫДАНО'}</small></div><div>${owned?(system?'<span class="root-equipped">SYSTEM</span>':`<button type="button" class="danger" data-admin-act="resource" data-resource-kind="${kind}" data-resource-id="${esc(id)}" data-resource-action="revoke">ЗАБРАТЬ</button>`):`<button type="button" data-admin-act="resource" data-resource-kind="${kind}" data-resource-id="${esc(id)}" data-resource-action="grant">ВЫДАТЬ</button>`}</div></div>`;}
    async _remoteAction(e,blocked){
      const container=blocked?this.blockedDetail:this.accountDetail;
      const detailTab=e.target.closest('[data-admin-detail-tab]');if(detailTab){this.remoteDetailTab=detailTab.dataset.adminDetailTab;this.renderRemoteDetail(container,this.remoteDetail,blocked);return;}
      const resourceTab=e.target.closest('[data-admin-resource-tab]');if(resourceTab){this.remoteResourceTab=resourceTab.dataset.adminResourceTab;this.renderRemoteDetail(container,this.remoteDetail,blocked);return;}
      const creditPreset=e.target.closest('[data-credit-preset]');if(creditPreset){const input=container.querySelector('.root-admin-credit-input');if(input){input.value=creditPreset.dataset.creditPreset;input.focus();}return;}
      const banPreset=e.target.closest('[data-ban-preset-value]');if(banPreset){const input=container.querySelector('.root-admin-ban-duration'),unit=container.querySelector('.root-admin-ban-unit');if(input)input.value=banPreset.dataset.banPresetValue;if(unit)unit.value=banPreset.dataset.banPresetUnit;return;}
      const btn=e.target.closest('[data-admin-act]');if(!btn||!this.remoteDetail?.user)return;const id=this.remoteDetail.user.id,action=btn.dataset.adminAct;btn.disabled=true;
      try{
        let data;
        if(action==='credit-add'||action==='credit-take'){const input=container.querySelector('.root-admin-credit-input'),amount=Math.floor(Number(String(input?.value||'').replace(/\s/g,'')));if(!Number.isSafeInteger(amount)||amount<=0)throw Object.assign(new Error('INVALID_AMOUNT'),{code:'INVALID_AMOUNT'});data=await this.api(`/api/admin/account/${id}/credits`,{method:'POST',body:JSON.stringify({delta:action==='credit-add'?amount:-amount})});}
        else if(action==='resource'){data=await this.api(`/api/admin/account/${id}/resource`,{method:'POST',body:JSON.stringify({kind:btn.dataset.resourceKind,id:btn.dataset.resourceId,action:btn.dataset.resourceAction,quantity:Number(btn.dataset.resourceQty)||1})});}
        else if(action==='ban'){const reason=container.querySelector('.root-admin-ban-reason')?.value.trim()||'',value=Math.floor(Number(container.querySelector('.root-admin-ban-duration')?.value)),unit=container.querySelector('.root-admin-ban-unit')?.value,durationMs=value*(BAN_UNIT_MS[unit]||0);if(!Number.isSafeInteger(value)||value<1||!BAN_UNIT_MS[unit]||durationMs<1000||durationMs>365*86400000)throw Object.assign(new Error('INVALID_BAN_DURATION'),{code:'INVALID_BAN_DURATION'});data=await this.api(`/api/admin/account/${id}/ban`,{method:'POST',body:JSON.stringify({durationMs,reason})});}
        else if(action==='unban'){data=await this.api(`/api/admin/account/${id}/unban`,{method:'POST',body:'{}'});}else return;
        const detail=data.detail||await this.api('/api/admin/account/'+id);this.remoteDetail=detail;this.renderRemoteDetail(container,detail,blocked);
        const result=data.result||{};let note='ACCOUNT UPDATED';
        if(action==='credit-add'||action==='credit-take')note=`CR: ${fmt(result.before)} → ${fmt(result.after)}`;
        else if(action==='resource')note=`${String(result.action||'').toUpperCase()} ${String(result.id||'').toUpperCase()} · SERVER REV ${Number(detail.revision)||0}`;
        else if(action==='ban')note=`БЛОКИРОВКА ДО ${when(data.ban?.expiresAt||detail.ban?.expiresAt)}`;
        else if(action==='unban')note='АККАУНТ РАЗБЛОКИРОВАН';
        this.message(note);this.searchAccounts(blocked);
      }catch(err){this.message(this.adminError(err.code),'bad');if(err.code==='ADMIN_LOCKED')this.showAuth();}finally{btn.disabled=false;}
    }
    adminError(code){return ({ADMIN_LOCKED:'ПАНЕЛЬ ЗАБЛОКИРОВАНА · ВВЕДИТЕ ROOT ПАРОЛЬ',ADMIN_REQUIRED:'НЕТ ПРАВ АДМИНИСТРАТОРА',USER_NOT_FOUND:'АККАУНТ НЕ НАЙДЕН',INVALID_AMOUNT:'НЕВЕРНАЯ СУММА',INVALID_BAN_DURATION:'НЕВЕРНЫЙ СРОК БЛОКИРОВКИ',INVALID_BAN_REASON:'УКАЖИТЕ ПРИЧИНУ',ADMIN_ACCOUNT_PROTECTED:'АККАУНТ АДМИНИСТРАТОРА ЗАЩИЩЁН',SYSTEM_RESOURCE:'СИСТЕМНЫЙ РЕСУРС НЕЛЬЗЯ ЗАБРАТЬ'}[code]||'ОШИБКА АДМИН-ПАНЕЛИ');}
  }
  R.RootConsole=RootConsole;
})();
