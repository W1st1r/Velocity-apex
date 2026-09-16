(function(){
  'use strict';
  const R=window.Racing;
  const $=id=>document.getElementById(id);
  const money=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('ru-RU')+' CR';
  const date=value=>{try{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(Number(value)||0));}catch{return '—';}};
  const state={tab:'cars',data:{listings:[],buyOrders:[],history:[],balance:0},loading:false,tradeMode:null,pending:null};
  const errors={
    AUTH_REQUIRED:'Нужно войти в аккаунт.',INVALID_CAR:'Эту машину нельзя выставить на рынок.',INVALID_PRICE:'Укажите корректную цену.',CAR_NOT_OWNED:'Этой машины больше нет в вашем гараже.',CAR_ALREADY_OWNED:'Эта машина уже есть в вашем гараже.',INSUFFICIENT_CREDITS:'Недостаточно кредитов.',ALREADY_LISTED:'Машина уже выставлена на продажу.',ORDER_EXISTS:'У вас уже есть активная заявка на эту машину.',LISTING_NOT_FOUND:'Объявление уже недоступно.',LISTING_UNAVAILABLE:'Объявление уже изменилось. Обновите рынок.',ORDER_NOT_FOUND:'Заявка уже недоступна.',ORDER_UNAVAILABLE:'Заявка уже изменилась. Обновите рынок.',CANNOT_BUY_OWN:'Нельзя купить собственную машину.',CANNOT_FILL_OWN:'Нельзя выполнить собственную заявку.',TRADE_RETRY:'Сделка не завершена. Средства и машина возвращены, попробуйте ещё раз.',CREDIT_LIMIT:'Достигнут лимит баланса.',SERVER_ERROR:'Ошибка сервера рынка. Попробуйте обновить.'
  };

  async function api(path,options={}){
    const response=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json',...(options.headers||{})},...options});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok){const error=new Error(data.error||'MARKET_ERROR');error.code=data.error||'MARKET_ERROR';error.data=data;throw error;}return data;
  }
  function save(){
    try{return R.normalizeSave(JSON.parse(localStorage.getItem('velocityApex.v1')||'{}'));}catch{return R.normalizeSave({});}
  }
  function car(id){return R.LIVERIES?.[id]||null;}
  function carName(id){return car(id)?.name||id;}
  function thumbnail(id){return car(id)?.sprite?.thumbnail||car(id)?.sprite?.src||'';}
  function category(id){return R.normalizeCarCategory?.(car(id)?.category)||car(id)?.category||'basic';}
  function categoryLabel(id){const c=category(id);return R.CAR_CATEGORIES?.[c]?.label||String(c).toUpperCase();}
  function upgradeCount(upgrades){return Object.values(upgrades&&typeof upgrades==='object'?upgrades:{}).reduce((sum,v)=>sum+Math.max(0,Math.floor(Number(v)||0)),0);}
  function owns(id){return save().ownedLiveries.includes(id);}
  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}

  function setNotice(message,bad=false){const node=$('marketNotice');if(!node)return;node.textContent=message||'';node.classList.toggle('bad',!!bad);}
  function setBusy(value){state.loading=!!value;$('marketRefreshBtn')?.classList.toggle('spinning',state.loading);if($('marketPrimaryAction'))$('marketPrimaryAction').disabled=state.loading;}

  function updateCounts(){
    const sales=state.data.listings.filter(x=>x.mine).length;
    $('marketCarsCount').textContent=String(state.data.listings.length);
    $('marketPurchasesCount').textContent=String(state.data.buyOrders.length);
    $('marketSalesCount').textContent=String(sales);
    $('marketHistoryCount').textContent=String(state.data.history.length);
    $('marketCredits').textContent=money(state.data.balance);
  }
  function syncToolbar(){
    const title=$('marketSectionTitle'),hint=$('marketSectionHint'),action=$('marketPrimaryAction'),search=$('marketSearch');
    const map={
      cars:['МАШИНЫ НА РЫНКЕ','Объявления игроков. Покупка сразу переносит машину в ваш гараж.','ВЫСТАВИТЬ МАШИНУ'],
      purchases:['ЗАПРОСЫ НА ПОКУПКУ','Создайте заявку со своей ценой. Сумма резервируется до сделки или отмены.','СОЗДАТЬ ЗАПРОС'],
      sales:['МОИ ПРОДАЖИ','Ваши активные объявления. До отмены машина хранится на рынке.','ВЫСТАВИТЬ МАШИНУ'],
      history:['ИСТОРИЯ СДЕЛОК','Завершённые покупки и продажи вашего аккаунта.','']
    },cfg=map[state.tab]||map.cars;
    title.textContent=cfg[0];hint.textContent=cfg[1];action.textContent=cfg[2]||'';action.classList.toggle('hidden',!cfg[2]);
    search.placeholder=state.tab==='history'?'Поиск по истории':'Поиск машины или игрока';
  }

  function emptyCard(text,sub){const wrap=el('div','market-empty');wrap.append(el('strong','',text),el('small','',sub));return wrap;}
  function carVisual(id){
    const visual=el('div','market-card-car'),src=thumbnail(id);if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';visual.append(img);}else visual.append(el('span','', 'VA'));
    return visual;
  }
  function priceBlock(value,label='ЦЕНА'){const box=el('div','market-card-price');box.append(el('small','',label),el('strong','',money(value)));return box;}
  function actionButton(label,action,id,kind='primary'){const b=el('button',kind==='danger'?'market-danger-btn':kind==='secondary'?'secondary-btn':'primary-btn',label);b.type='button';b.dataset.marketAction=action;b.dataset.marketId=id;return b;}

  function listingCard(item){
    const cardNode=el('article','market-card');cardNode.dataset.search=(carName(item.carId)+' '+item.seller).toLowerCase();cardNode.append(carVisual(item.carId));
    const body=el('div','market-card-main'),top=el('div','market-card-title');top.append(el('span','market-rarity '+category(item.carId),categoryLabel(item.carId)),el('strong','',carName(item.carId)));
    const meta=el('div','market-card-meta');meta.append(el('span','',item.seller),el('span','',date(item.createdAt)));const u=upgradeCount(item.upgrades);if(u)meta.append(el('span','market-tune','ТЮНИНГ +'+u));body.append(top,meta);cardNode.append(body,priceBlock(item.price));
    const actions=el('div','market-card-actions');if(item.mine)actions.append(actionButton('ОТМЕНИТЬ','cancel-listing',item.id,'secondary'));else if(owns(item.carId))actions.append(el('span','market-owned-label','УЖЕ В ГАРАЖЕ'));else actions.append(actionButton('КУПИТЬ','buy-listing',item.id));cardNode.append(actions);return cardNode;
  }
  function orderCard(item){
    const node=el('article','market-card market-order-card');node.dataset.search=(carName(item.carId)+' '+item.buyer).toLowerCase();node.append(carVisual(item.carId));
    const body=el('div','market-card-main'),top=el('div','market-card-title');top.append(el('span','market-rarity '+category(item.carId),categoryLabel(item.carId)),el('strong','',carName(item.carId)));const meta=el('div','market-card-meta');meta.append(el('span','',item.buyer),el('span','',date(item.createdAt)));if(item.mine)meta.append(el('span','market-mine','МОЯ ЗАЯВКА'));body.append(top,meta);node.append(body,priceBlock(item.price,'ПРЕДЛОЖЕНИЕ'));
    const actions=el('div','market-card-actions');if(item.mine)actions.append(actionButton('ОТМЕНИТЬ','cancel-order',item.id,'secondary'));else if(owns(item.carId))actions.append(actionButton('ПРОДАТЬ','fulfill-order',item.id));else actions.append(el('span','market-owned-label','НЕТ МАШИНЫ'));node.append(actions);return node;
  }
  function historyCard(item){
    const node=el('article','market-card market-history-card');node.dataset.search=(carName(item.carId)+' '+item.buyer+' '+item.seller).toLowerCase();node.append(carVisual(item.carId));
    const body=el('div','market-card-main'),top=el('div','market-card-title');top.append(el('span','market-history-side '+item.side,item.side==='buy'?'ПОКУПКА':'ПРОДАЖА'),el('strong','',carName(item.carId)));const meta=el('div','market-card-meta');meta.append(el('span','',item.side==='buy'?'Продавец '+item.seller:'Покупатель '+item.buyer),el('span','',date(item.createdAt)));const u=upgradeCount(item.upgrades);if(u)meta.append(el('span','market-tune','ТЮНИНГ +'+u));body.append(top,meta);node.append(body,priceBlock(item.price,item.side==='buy'?'ПОТРАЧЕНО':'ПОЛУЧЕНО'));return node;
  }

  function render(){
    updateCounts();syncToolbar();$('marketTabs')?.querySelectorAll('button[data-market-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.marketTab===state.tab));
    const list=$('marketList');if(!list)return;list.replaceChildren();let items=[];
    if(state.tab==='cars')items=state.data.listings.map(listingCard);
    else if(state.tab==='purchases')items=[...state.data.buyOrders].sort((a,b)=>(b.mine?1:0)-(a.mine?1:0)||b.createdAt-a.createdAt).map(orderCard);
    else if(state.tab==='sales')items=state.data.listings.filter(x=>x.mine).map(listingCard);
    else items=state.data.history.map(historyCard);
    const q=String($('marketSearch')?.value||'').trim().toLowerCase();if(q)items=items.filter(node=>node.dataset.search.includes(q));
    if(!items.length){const messages={cars:['ПОКА НЕТ ОБЪЯВЛЕНИЙ','Первая выставленная машина появится здесь.'],purchases:['НЕТ ЗАПРОСОВ','Создайте заявку на нужную машину и укажите свою цену.'],sales:['НЕТ АКТИВНЫХ ПРОДАЖ','Выставьте машину из своего гаража.'],history:['ИСТОРИЯ ПУСТА','После первой сделки она появится здесь.']};list.append(emptyCard(...messages[state.tab]));return;}
    list.append(...items);
  }

  async function refresh({quiet=false}={}){
    if(state.loading)return;setBusy(true);if(!quiet)setNotice('Обновляем рынок…');
    try{state.data=await api('/api/market');setNotice('Рынок обновлён.');render();}
    catch(e){setNotice(errors[e.code]||'Не удалось загрузить рынок.',true);}
    finally{setBusy(false);}
  }
  async function syncBeforeTrade(){try{await window.VelocityAccount?.flushSave?.();}catch{}}
  async function refreshAfterTrade(message){
    try{await window.VelocityAccount?.refreshCloud?.();}catch{}await refresh({quiet:true});setNotice(message||'Сделка выполнена.');
  }

  function marketCars(mode){
    const current=save(),owned=new Set(current.ownedLiveries||[]),entries=Object.entries(R.LIVERIES||{}).filter(([id,item])=>id!=='apexLime'&&!item?.legacy&&item?.sprite);
    if(mode==='sell')return entries.filter(([id])=>owned.has(id));
    return entries.filter(([id])=>!owned.has(id));
  }
  function fillCarSelect(mode){
    const select=$('marketCarSelect');select.replaceChildren();const cars=marketCars(mode);for(const [id,item] of cars){const option=document.createElement('option');option.value=id;option.textContent=item.name+' · '+categoryLabel(id);select.append(option);}return cars;
  }
  function syncPriceHint(){
    const id=$('marketCarSelect').value,item=car(id),price=Math.max(1,Math.floor(Number($('marketPriceInput').value)||0));
    if(!$('marketTradeHint'))return;const base=Number(item?.price)||0;
    $('marketTradeHint').textContent=state.tradeMode==='order'?`Будет зарезервировано ${money(price)}. Базовая цена машины: ${money(base)}.`:`Машина временно уйдёт с аккаунта на рынок. Базовая цена: ${money(base)}. Тюнинг сохранится.`;
  }
  function openTrade(mode){
    state.tradeMode=mode;state.pending=null;const dialog=$('marketDialog'),form=$('marketTradeForm'),confirm=$('marketConfirmView');dialog.classList.remove('hidden');dialog.setAttribute('aria-hidden','false');form.classList.remove('hidden');confirm.classList.add('hidden');
    $('marketDialogTitle').textContent=mode==='sell'?'ВЫСТАВИТЬ МАШИНУ':'ЗАПРОС НА ПОКУПКУ';$('marketTradeSubmit').textContent=mode==='sell'?'ВЫСТАВИТЬ':'СОЗДАТЬ ЗАПРОС';const cars=fillCarSelect(mode);
    if(!cars.length){$('marketTradeForm').classList.add('hidden');$('marketConfirmView').classList.remove('hidden');$('marketConfirmCar').replaceChildren();$('marketConfirmText').textContent=mode==='sell'?'Нет доступных машин для продажи.':'Все доступные машины уже есть в вашем гараже.';$('marketConfirmSubmit').classList.add('hidden');$('marketConfirmCancel').textContent='ЗАКРЫТЬ';return;}
    $('marketConfirmSubmit').classList.remove('hidden');$('marketConfirmCancel').textContent='ОТМЕНА';const id=cars[0][0],base=Math.max(1,Math.floor(Number(car(id)?.price)||1000));$('marketPriceInput').value=String(base);syncPriceHint();
  }
  function closeDialog(){const d=$('marketDialog');d.classList.add('hidden');d.setAttribute('aria-hidden','true');state.pending=null;}
  function openConfirm(action,item){
    state.pending={action,item};const dialog=$('marketDialog');dialog.classList.remove('hidden');dialog.setAttribute('aria-hidden','false');$('marketTradeForm').classList.add('hidden');$('marketConfirmView').classList.remove('hidden');$('marketConfirmSubmit').classList.remove('hidden');$('marketConfirmCancel').textContent='ОТМЕНА';
    const titleMap={'buy-listing':'ПОДТВЕРДИТЬ ПОКУПКУ','cancel-listing':'СНЯТЬ С ПРОДАЖИ','cancel-order':'ОТМЕНИТЬ ЗАПРОС','fulfill-order':'ПРОДАТЬ ПО ЗАПРОСУ'};$('marketDialogTitle').textContent=titleMap[action]||'ПОДТВЕРЖДЕНИЕ';
    const visual=$('marketConfirmCar');visual.replaceChildren(carVisual(item.carId),el('div','',carName(item.carId)),priceBlock(item.price));
    const texts={
      'buy-listing':`Купить ${carName(item.carId)} у ${item.seller} за ${money(item.price)}? Машина сразу появится в гараже.`,
      'cancel-listing':`Снять ${carName(item.carId)} с продажи? Машина вернётся в гараж вместе с тюнингом.`,
      'cancel-order':`Отменить заявку на ${carName(item.carId)}? Зарезервированные ${money(item.price)} вернутся на баланс.`,
      'fulfill-order':`Продать ${carName(item.carId)} игроку ${item.buyer} за ${money(item.price)}? Тюнинг машины перейдёт покупателю.`
    };
    $('marketConfirmText').textContent=texts[action]||'';$('marketConfirmSubmit').textContent=action.startsWith('cancel')?'ПОДТВЕРДИТЬ ОТМЕНУ':action==='fulfill-order'?'ПРОДАТЬ':'КУПИТЬ';
  }
  async function executePending(){
    const p=state.pending;if(!p)return;const {action,item}=p;$('marketConfirmSubmit').disabled=true;setNotice('Проводим сделку…');
    try{
      await syncBeforeTrade();
      if(action==='buy-listing')await api(`/api/market/listings/${item.id}/buy`,{method:'POST',body:'{}'});
      else if(action==='cancel-listing')await api(`/api/market/listings/${item.id}/cancel`,{method:'POST',body:'{}'});
      else if(action==='cancel-order')await api(`/api/market/buy-orders/${item.id}/cancel`,{method:'POST',body:'{}'});
      else if(action==='fulfill-order')await api(`/api/market/buy-orders/${item.id}/fulfill`,{method:'POST',body:'{}'});
      closeDialog();const msg=action==='buy-listing'?'Машина куплена и добавлена в гараж.':action==='fulfill-order'?'Машина продана, кредиты зачислены.':action==='cancel-listing'?'Объявление снято, машина возвращена в гараж.':'Заявка отменена, кредиты возвращены.';await refreshAfterTrade(msg);
    }catch(e){setNotice(errors[e.code]||'Не удалось выполнить операцию.',true);closeDialog();await refresh({quiet:true});}
    finally{$('marketConfirmSubmit').disabled=false;}
  }

  async function submitTrade(event){
    event.preventDefault();const carId=$('marketCarSelect').value,price=Math.floor(Number($('marketPriceInput').value)||0);if(!carId||price<1){setNotice('Выберите машину и укажите цену.',true);return;}$('marketTradeSubmit').disabled=true;
    try{
      await syncBeforeTrade();
      if(state.tradeMode==='sell')await api('/api/market/listings',{method:'POST',body:JSON.stringify({carId,price})});
      else await api('/api/market/buy-orders',{method:'POST',body:JSON.stringify({carId,price})});
      closeDialog();await refreshAfterTrade(state.tradeMode==='sell'?'Машина выставлена на рынок.':'Запрос создан. Сумма зарезервирована.');
    }catch(e){setNotice(errors[e.code]||'Не удалось создать предложение.',true);closeDialog();await refresh({quiet:true});}
    finally{$('marketTradeSubmit').disabled=false;}
  }
  function findItem(action,id){if(action.includes('order'))return state.data.buyOrders.find(x=>x.id===id);return state.data.listings.find(x=>x.id===id);}

  function bind(){
    $('marketTabs')?.addEventListener('click',e=>{const b=e.target.closest('button[data-market-tab]');if(!b)return;state.tab=b.dataset.marketTab;$('marketSearch').value='';render();});
    $('marketSearch')?.addEventListener('input',render);$('marketRefreshBtn')?.addEventListener('click',()=>refresh());
    $('marketPrimaryAction')?.addEventListener('click',()=>openTrade(state.tab==='purchases'?'order':'sell'));
    $('marketList')?.addEventListener('click',e=>{const b=e.target.closest('[data-market-action]');if(!b)return;const item=findItem(b.dataset.marketAction,b.dataset.marketId);if(item)openConfirm(b.dataset.marketAction,item);});
    $('marketDialogClose')?.addEventListener('click',closeDialog);$('marketConfirmCancel')?.addEventListener('click',closeDialog);$('marketConfirmSubmit')?.addEventListener('click',executePending);$('marketTradeForm')?.addEventListener('submit',submitTrade);$('marketCarSelect')?.addEventListener('change',()=>{const id=$('marketCarSelect').value;$('marketPriceInput').value=String(Math.max(1,Math.floor(Number(car(id)?.price)||1000)));syncPriceHint();});$('marketPriceInput')?.addEventListener('input',syncPriceHint);
    $('marketDialog')?.addEventListener('click',e=>{if(e.target===$('marketDialog'))closeDialog();});
    addEventListener('velocity-account-save',()=>{if(!$('shopMarketPanel')?.classList.contains('hidden'))refresh({quiet:true});});
  }
  function open(){state.tab='cars';$('marketSearch').value='';render();refresh();}
  bind();window.VelocityMarket={open,refresh};
})();
