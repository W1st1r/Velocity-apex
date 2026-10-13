(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const root=$('topup');if(!root)return;
  function ensureDonateButton(){
    let btn=$('topupBtn');
    const donateDock=document.querySelector('#menu .menu-wallet-section')||document.querySelector('#menu .menu-play-section .mode-actions');
    if(!btn&&donateDock){
      btn=document.createElement('button');
      btn.id='topupBtn';btn.type='button';btn.className='primary-btn donate-main-btn';
      btn.setAttribute('aria-label','Донат — пополнить APEX Credits');
      btn.classList.add('menu-donate-bar');
      btn.innerHTML='<span class="donate-main-icon" aria-hidden="true">◆</span><span class="menu-primary-copy donate-main-copy"><small>APEX CREDITS · ЮMONEY</small><strong>ПОПОЛНИТЬ БАЛАНС</strong></span><span class="menu-wallet-balance"><small>БАЛАНС</small><strong id="menuCredits">0 CR</strong></span>';
      donateDock.append(btn);
    }
    if(btn){
      btn.classList.remove('hidden');btn.removeAttribute('hidden');btn.setAttribute('aria-hidden','false');
      btn.style.setProperty('display','grid','important');btn.style.setProperty('visibility','visible','important');btn.style.setProperty('opacity','1','important');
      if(donateDock&&btn.parentElement!==donateDock)donateDock.append(btn);
    }
    return btn;
  }
  const openBtn=ensureDonateButton();if(!openBtn)return;
  document.addEventListener('DOMContentLoaded',ensureDonateButton,{once:true});
  window.addEventListener('pageshow',ensureDonateButton);
  const els={close:$('topupCloseBtn'),packages:$('topupPackages'),message:$('topupMessage'),history:$('topupHistory'),historyEmpty:$('topupHistoryEmpty'),card:$('topupPayCard'),wallet:$('topupPayWallet'),selected:$('topupSelected'),status:$('topupStatus'),webhook:$('topupWebhook'),collection:$('topupCollectionBtn'),refresh:$('topupRefreshBtn')};
  let data=null,selected='cr_35000',busy=false;
  const fmt=n=>Number(n||0).toLocaleString('ru-RU');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function api(path,options={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok){const e=new Error(d.error||`HTTP_${r.status}`);e.code=d.error||`HTTP_${r.status}`;e.data=d;throw e;}return d;}
  function setMessage(text='',kind=''){els.message.textContent=text;els.message.dataset.kind=kind;}
  function pack(){return data?.packages?.find(x=>x.id===selected)||data?.packages?.[0]||null;}
  function renderPackages(){
    const list=data?.packages||[];if(!list.length){els.packages.innerHTML='<div class="topup-empty">Пакеты пока недоступны.</div>';return;}
    if(!list.some(x=>x.id===selected))selected=list[0].id;
    const bestId=list.reduce((best,p)=>((p.credits/Math.max(1,p.rub))>(best.credits/Math.max(1,best.rub))?p:best),list[0]).id;
    els.packages.innerHTML=list.map((p,index)=>{
      const ratio=Math.round((Number(p.credits)||0)/Math.max(1,Number(p.rub)||1));
      const cls=['topup-pack',p.id===selected?'selected':'',p.id===bestId?'is-best-value':'',index===0?'is-starter':'',index===list.length-1?'is-ultimate':''].filter(Boolean).join(' ');
      const badge=p.badge||(p.id===bestId?'ВЫГОДНО':'');
      return `<button class="${cls}" type="button" data-pack="${esc(p.id)}"><span class="topup-pack-name">${esc(p.title)}</span><strong>${fmt(p.credits)} <em>CR</em></strong><b>${fmt(p.rub)} ₽</b><small>${fmt(ratio)} CR / 1 ₽</small>${badge?`<i>${esc(badge)}</i>`:''}</button>`;
    }).join('');
    els.packages.querySelectorAll('[data-pack]').forEach(btn=>btn.addEventListener('click',()=>{selected=btn.dataset.pack;renderPackages();renderSelected();}));renderSelected();
  }
  function renderSelected(){
    const p=pack();
    if(p){
      const ratio=Math.round((Number(p.credits)||0)/Math.max(1,Number(p.rub)||1));
      els.selected.innerHTML=`<em>${esc(p.title)}</em><b>${fmt(p.credits)} CR · ${fmt(p.rub)} ₽</b><small>${fmt(ratio)} CR за 1 ₽</small>`;
    }else els.selected.textContent='—';
    els.card.disabled=!p||!data?.configured||busy;els.wallet.disabled=!p||!data?.configured||busy;
  }
  function statusLabel(s){return s==='paid'?'ОПЛАЧЕНО':s==='pending'?'ОЖИДАЕТ ОПЛАТЫ':s==='expired'?'ИСТЁК':'ОТМЕНЕНО';}
  function renderHistory(items=[]){
    els.historyEmpty.classList.toggle('hidden',items.length>0);
    els.history.innerHTML=items.map(x=>`<article class="topup-history-row" data-status="${esc(x.status)}"><div><strong>${fmt(x.credits)} CR</strong><span>${new Date(x.createdAt).toLocaleString('ru-RU')}</span></div><div><b>${fmt(x.rub)} ₽</b><em>${statusLabel(x.status)}</em></div></article>`).join('');
  }
  async function load(){
    setMessage('Загрузка…');
    try{
      const [cfg,hist]=await Promise.all([api('/api/payments/packages'),api('/api/payments/history')]);data=cfg;renderPackages();renderHistory(hist.items||[]);
      els.webhook.textContent=cfg.webhookUrl||'—';els.status.textContent=cfg.configured?'ЮMONEY ПОДКЛЮЧЕН':'НУЖНА НАСТРОЙКА';els.status.dataset.ready=cfg.configured?'1':'0';
      if(cfg.collectionUrl){els.collection.classList.remove('hidden');els.collection.onclick=()=>location.assign(cfg.collectionUrl);}else els.collection.classList.add('hidden');
      setMessage(cfg.configured?'Выберите пакет и удобный способ оплаты. После подтверждения ЮMoney сервер автоматически начислит CR на ваш аккаунт.':'Пополнение временно недоступно. Проверьте настройку ЮMoney в панели проекта.','info');
    }catch(e){setMessage(e.code==='AUTH_REQUIRED'?'Сначала войдите в аккаунт.':'Не удалось загрузить раздел пополнения.','bad');}
  }
  function open(){root.classList.remove('hidden');root.setAttribute('aria-hidden','false');load();}
  function close(){root.classList.add('hidden');root.setAttribute('aria-hidden','true');setMessage();}
  async function create(paymentType){
    const p=pack();if(!p||busy)return;busy=true;renderSelected();setMessage('Создаём безопасный заказ…','info');
    try{
      const r=await api('/api/payments/create',{method:'POST',body:JSON.stringify({packageId:p.id})});
      const form=document.createElement('form');form.method=r.form.method||'POST';form.action=r.form.action;form.style.display='none';
      const fields={...r.form.fields,paymentType};for(const [name,value] of Object.entries(fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value);form.append(input);}document.body.append(form);form.submit();
    }catch(e){
      if(e.code==='PAYMENTS_NOT_CONFIGURED'){setMessage('Пополнение временно недоступно. Попробуйте позже.','bad');}
      else setMessage('Не удалось создать платёж. Попробуйте ещё раз.','bad');busy=false;renderSelected();
    }
  }
  async function checkReturn(orderId){
    root.classList.remove('hidden');root.setAttribute('aria-hidden','false');setMessage('Платёж завершён. Проверяем начисление CR…','info');
    for(let i=0;i<10;i++){
      try{const r=await api('/api/payments/order/'+encodeURIComponent(orderId));if(r.order?.status==='paid'){setMessage(`Готово: +${fmt(r.order.credits)} CR начислено на аккаунт.`,'good');await window.VelocityAccount?.refreshCloud?.();await load();return;}if(r.order?.status==='expired'){setMessage('Срок этого заказа истёк. Создайте новый платёж.','bad');await load();return;}}catch(e){if(e.code==='AUTH_REQUIRED'){setMessage('Войдите в тот аккаунт, с которого создавали платёж.','bad');return;}}
      await sleep(1500);
    }
    setMessage('Платёж ещё обрабатывается. Нажмите «Обновить» через несколько секунд, чтобы проверить начисление.','info');await load();
  }
  openBtn.addEventListener('click',open);els.close.addEventListener('click',close);els.card.addEventListener('click',()=>create('AC'));els.wallet.addEventListener('click',()=>create('PC'));els.refresh.addEventListener('click',load);root.addEventListener('click',e=>{if(e.target===root)close();});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.classList.contains('hidden'))close();});
  const qs=new URLSearchParams(location.search),returned=qs.get('payment'),order=qs.get('order');if(returned==='success'&&/^APEX-[A-Z0-9]{16}$/.test(order||'')){
    const run=()=>{if(window.VelocityAccount?.ready&&window.VelocityAccount?.authenticated){history.replaceState({},'',location.pathname+location.hash);checkReturn(order);}else setTimeout(run,250);};run();
  }
  window.VelocityPayments={open,refresh:load};
})();
