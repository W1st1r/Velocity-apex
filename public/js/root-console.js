(function(){
  'use strict';
  const R=window.Racing;
  const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
  const SYSTEM_CAR='apexLime',SYSTEM_EFFECT='standard',MAX_CR=999999999;

  function replaceSave(target,next){
    for(const key of Object.keys(target))delete target[key];
    Object.assign(target,next);
    return target;
  }
  function normalizeInPlace(save){return replaceSave(save,R.normalizeSave(save));}
  function setCredits(save,value){
    let n=value;
    if(typeof value==='string'){
      const raw=value.trim();if(!raw||!/^\d+$/.test(raw))return false;n=Number(raw);
    }
    if(typeof n!=='number'||!Number.isFinite(n)||!Number.isInteger(n)||n<0||n>Number.MAX_SAFE_INTEGER)return false;
    save.credits=n;normalizeInPlace(save);return true;
  }
  function grant(save,kind,id){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects';
    if(!catalog||!has(catalog,id))return false;
    if(!Array.isArray(save[key]))save[key]=[];
    if(!save[key].includes(id))save[key].push(id);
    normalizeInPlace(save);return true;
  }
  function revoke(save,kind,id){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects',selectedKey=cars?'selectedLivery':'selectedEffect',fallback=cars?SYSTEM_CAR:SYSTEM_EFFECT;
    if(!catalog||!has(catalog,id)||id===fallback)return false;
    if(!Array.isArray(save[key]))save[key]=[];
    save[key]=save[key].filter(x=>x!==id);
    if(save[selectedKey]===id)save[selectedKey]=fallback;
    normalizeInPlace(save);return true;
  }
  function equip(save,kind,id){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects',selectedKey=cars?'selectedLivery':'selectedEffect';
    if(!catalog||!has(catalog,id)||!Array.isArray(save[key])||!save[key].includes(id))return false;
    save[selectedKey]=id;normalizeInPlace(save);return true;
  }
  function grantAll(save,kind){
    const cars=kind==='car',catalog=cars?R.LIVERIES:R.EFFECTS,key=cars?'ownedLiveries':'ownedEffects';
    save[key]=Object.keys(catalog);normalizeInPlace(save);return true;
  }
  function revokeExtras(save,kind){
    const cars=kind==='car',key=cars?'ownedLiveries':'ownedEffects',selectedKey=cars?'selectedLivery':'selectedEffect',fallback=cars?SYSTEM_CAR:SYSTEM_EFFECT;
    save[key]=[fallback];save[selectedKey]=fallback;normalizeInPlace(save);return true;
  }
  function unlockEverything(save){grantAll(save,'car');grantAll(save,'effect');return true;}
  function resetInventory(save){revokeExtras(save,'car');revokeExtras(save,'effect');return true;}
  function resetPlayerProgress(save){replaceSave(save,R.normalizeSave({}));return true;}

  R.RootTools={SYSTEM_CAR,SYSTEM_EFFECT,MAX_CR,setCredits,grant,revoke,equip,grantAll,revokeExtras,unlockEverything,resetInventory,resetPlayerProgress,normalizeInPlace};

  const $=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('ru-RU');

  class RootConsole{
    constructor(opts){
      this.save=opts.save;this.onChange=opts.onChange||(()=>{});this.onBack=opts.onBack||(()=>{});this.onView=opts.onView||(()=>{});
      this.authorized=false;this.confirmAction=null;this.lastMessage='';this.authTimer=0;
      this.auth=$('rootAuth');this.console=$('rootConsole');this.password=$('rootPassword');this.authMessage=$('rootAuthMessage');
      this.balance=$('rootCurrentBalance');this.creditInput=$('rootCreditInput');this.cars=$('rootCars');this.effects=$('rootEffects');this.diag=$('rootDiagnostics');this.notice=$('rootNotice');
      this.confirm=$('rootConfirm');this.confirmTitle=$('rootConfirmTitle');this.confirmText=$('rootConfirmText');
      this._bind();
    }
    _bind(){
      $('rootAuthCancel').addEventListener('click',()=>this.back());
      $('rootAuthSubmit').addEventListener('click',()=>this.authorize());
      this.password.addEventListener('input',()=>{this.password.value=this.password.value.replace(/\D/g,'').slice(0,8);this.authMessage.textContent='AUTHORIZATION REQUIRED';this.authMessage.classList.remove('denied','granted');});
      this.password.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.authorize();}});
      $('rootBackBtn').addEventListener('click',()=>this.back());
      $('rootLockBtn').addEventListener('click',()=>this.lock());
      $('rootApplyCredits').addEventListener('click',()=>this.applyCredits());
      this.creditInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.applyCredits();}});
      this.console.addEventListener('click',e=>this._quickAction(e));
      this.cars.addEventListener('click',e=>this._itemAction(e,'car'));
      this.effects.addEventListener('click',e=>this._itemAction(e,'effect'));
      $('rootCopySave').addEventListener('click',()=>this.copySave());
      $('rootResetProgress').addEventListener('click',()=>this.askConfirm('RESET PLAYER PROGRESS?','CR, inventory, records and race settings will return to normal defaults.','reset-progress'));
      $('rootConfirmCancel').addEventListener('click',()=>this.closeConfirm());
      $('rootConfirmApply').addEventListener('click',()=>this.runConfirm());
    }
    open(){
      this.closeConfirm();
      if(this.authorized)this.showConsole();else this.showAuth();
    }
    showAuth(){
      clearTimeout(this.authTimer);this.authTimer=0;this.console.classList.add('hidden');this.auth.classList.remove('hidden');this.password.value='';this.authMessage.textContent='AUTHORIZATION REQUIRED';this.authMessage.className='root-auth-message';this.onView('auth');
      setTimeout(()=>{try{this.password.focus({preventScroll:true});}catch(_){this.password.focus();}},80);
    }
    showConsole(){
      this.auth.classList.add('hidden');this.console.classList.remove('hidden');this.onView('console');this.render();
    }
    authorize(){
      if(this.password.value==='19832811'){
        this.authorized=true;this.authMessage.textContent='ACCESS GRANTED';this.authMessage.className='root-auth-message granted';
        clearTimeout(this.authTimer);this.authTimer=setTimeout(()=>{this.authTimer=0;this.showConsole();},180);
      }else{
        this.authMessage.textContent='ACCESS DENIED';this.authMessage.className='root-auth-message denied';this.password.classList.remove('root-shake');void this.password.offsetWidth;this.password.classList.add('root-shake');this.password.select();
      }
    }
    back(){clearTimeout(this.authTimer);this.authTimer=0;this.auth.classList.add('hidden');this.console.classList.add('hidden');this.closeConfirm();this.onBack();}
    lock(){this.authorized=false;this.message('ROOT LOCKED','warn');this.back();}
    message(text,kind='ok'){this.lastMessage=text;if(this.notice){this.notice.textContent=text;this.notice.className='root-notice '+kind;}}
    changed(reason){this.onChange(reason);this.render();}
    applyCredits(){
      if(!R.RootTools.setCredits(this.save,this.creditInput.value)){this.message('INVALID CREDIT VALUE','bad');this.creditInput.classList.remove('root-shake');void this.creditInput.offsetWidth;this.creditInput.classList.add('root-shake');return;}
      this.creditInput.value=String(this.save.credits);this.message('BALANCE APPLIED');this.changed('credits');
    }
    _quickAction(e){
      const btn=e.target.closest('[data-root-action]');if(!btn)return;const action=btn.dataset.rootAction;
      if(action==='add-credits'){
        const add=Number(btn.dataset.amount);const next=this.save.credits+add;
        if(!Number.isSafeInteger(next)||!R.RootTools.setCredits(this.save,next)){this.message('CREDIT LIMIT REACHED','bad');return;}this.message('CREDITS ADDED');this.changed('credits');return;
      }
      if(action==='set-zero'){R.RootTools.setCredits(this.save,0);this.message('BALANCE SET TO 0');this.changed('credits');return;}
      if(action==='max-cr'){R.RootTools.setCredits(this.save,R.RootTools.MAX_CR);this.message('MAX CR APPLIED');this.changed('credits');return;}
      if(action==='unlock'){R.RootTools.unlockEverything(this.save);this.message('ALL ITEMS UNLOCKED');this.changed('inventory');return;}
      if(action==='reset-inventory'){this.askConfirm('RESET INVENTORY?','Extra cars and effects will be revoked. APEX LIME and STANDARD stay equipped.','reset-inventory');return;}
      if(action==='grant-cars'){R.RootTools.grantAll(this.save,'car');this.message('ALL CARS GRANTED');this.changed('inventory');return;}
      if(action==='revoke-cars'){R.RootTools.revokeExtras(this.save,'car');this.message('PAID CARS REVOKED');this.changed('inventory');return;}
      if(action==='grant-effects'){R.RootTools.grantAll(this.save,'effect');this.message('ALL EFFECTS GRANTED');this.changed('inventory');return;}
      if(action==='revoke-effects'){R.RootTools.revokeExtras(this.save,'effect');this.message('EXTRA EFFECTS REVOKED');this.changed('inventory');}
    }
    _itemAction(e,kind){
      const btn=e.target.closest('[data-item-action]');if(!btn)return;const id=btn.dataset.itemId,action=btn.dataset.itemAction;let ok=false;
      if(action==='grant')ok=R.RootTools.grant(this.save,kind,id);
      if(action==='revoke')ok=R.RootTools.revoke(this.save,kind,id);
      if(action==='equip')ok=R.RootTools.equip(this.save,kind,id);
      if(!ok){this.message('ACTION REJECTED','bad');return;}this.message((action+' '+id).toUpperCase());this.changed('inventory');
    }
    askConfirm(title,text,action){this.confirmAction=action;this.confirmTitle.textContent=title;this.confirmText.textContent=text;this.confirm.classList.remove('hidden');}
    closeConfirm(){this.confirmAction=null;if(this.confirm)this.confirm.classList.add('hidden');}
    runConfirm(){const action=this.confirmAction;this.closeConfirm();if(action==='reset-inventory'){R.RootTools.resetInventory(this.save);this.message('INVENTORY RESET','warn');this.changed('inventory');}else if(action==='reset-progress'){R.RootTools.resetPlayerProgress(this.save);this.message('PLAYER PROGRESS RESET','warn');this.changed('reset-progress');}}
    async copySave(){
      const text=JSON.stringify(this.save,null,2);let ok=false;
      try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);ok=true;}}catch(_){}
      if(!ok){
        try{const area=document.createElement('textarea');area.value=text;area.className='root-copy-fallback';document.body.appendChild(area);area.focus();area.select();ok=document.execCommand&&document.execCommand('copy');area.remove();}catch(_){}
      }
      this.message(ok?'SAVE COPIED':'CLIPBOARD UNAVAILABLE',ok?'ok':'bad');
    }
    storageStatus(){try{const key='__va_root_probe__';localStorage.setItem(key,'1');localStorage.removeItem(key);return 'AVAILABLE';}catch(_){return 'UNAVAILABLE';}}
    render(){
      if(!this.authorized||this.console.classList.contains('hidden'))return;
      normalizeInPlace(this.save);
      this.balance.textContent=fmt(this.save.credits)+' CR';
      if(document.activeElement!==this.creditInput)this.creditInput.value=String(this.save.credits);
      this.cars.innerHTML=Object.entries(R.LIVERIES).map(([id,item])=>this.itemCard('car',id,item)).join('');
      this.effects.innerHTML=Object.entries(R.EFFECTS).map(([id,item])=>this.itemCard('effect',id,item)).join('');
      const diag=[
        ['Save version',this.save.saveVersion],['Credits',fmt(this.save.credits)+' CR'],['Owned cars',this.save.ownedLiveries.length+' / '+Object.keys(R.LIVERIES).length],['Owned effects',this.save.ownedEffects.length+' / '+Object.keys(R.EFFECTS).length],
        ['Selected car',this.save.selectedLivery],['Selected effect',this.save.selectedEffect],['Control mode',this.save.controlMode],['Browser viewport',innerWidth+' × '+innerHeight],['devicePixelRatio',window.devicePixelRatio||1],['localStorage',this.storageStatus()]
      ];
      this.diag.innerHTML=diag.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
    }
    itemCard(kind,id,item){
      const cars=kind==='car',owned=this.save[cars?'ownedLiveries':'ownedEffects'].includes(id),equipped=this.save[cars?'selectedLivery':'selectedEffect']===id,system=id===(cars?SYSTEM_CAR:SYSTEM_EFFECT);
      const preview=cars&&item.sprite&&item.sprite.thumbnail?`<img src="${esc(item.sprite.thumbnail)}" alt="" draggable="false">`:`<span class="root-swatch" style="--swatch:${esc(item.primary||item.outer||'#8dff49')};--swatch2:${esc(item.secondary||item.inner||'#eaffdf')}"></span>`;
      const meta=cars?`${esc((R.CAR_CATEGORIES&&R.CAR_CATEGORIES[item.category||'regular'])||item.category||'regular')} · ${item.price?fmt(item.price)+' CR':'FREE'}`:(item.price?fmt(item.price)+' CR':'FREE');
      let actions='';
      if(!owned)actions=`<button type="button" data-item-action="grant" data-item-id="${esc(id)}">GRANT</button>`;
      else{
        actions=equipped?'<span class="root-equipped">EQUIPPED</span>':`<button type="button" data-item-action="equip" data-item-id="${esc(id)}">EQUIP</button>`;
        if(!system)actions+=`<button type="button" class="danger" data-item-action="revoke" data-item-id="${esc(id)}">REVOKE</button>`;
      }
      return `<article class="root-item ${equipped?'equipped':''}"><div class="root-item-preview">${preview}</div><div class="root-item-copy"><strong>${esc(item.name)}</strong><small>${meta}</small><div class="root-badges"><span class="${owned?'owned':'locked'}">${owned?'OWNED':'LOCKED'}</span>${system?'<span class="system">SYSTEM</span>':''}</div></div><div class="root-item-actions">${actions}</div></article>`;
    }
  }
  R.RootConsole=RootConsole;
})();
