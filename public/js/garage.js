(function(){
  'use strict';
  const R=window.Racing,$=id=>document.getElementById(id);
  const formatCredits=value=>Math.max(0,Math.floor(Number(value)||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  const categoryOf=item=>R.normalizeCarCategory(item&&item.category);
  const chanceText=bps=>(Math.max(0,Number(bps)||0)/100).toFixed(2).replace(/\.00$/,'')+'%';
  const assetUrl=src=>{
    if(typeof src!=='string'||!src)return '';
    if(/^(?:https?:|data:|blob:|\/)/i.test(src))return src;
    return '/'+src.replace(/^\.\//,'').replace(/^\/+/, '');
  };
  const effectVisualMarkup=(id,item)=>{
    if(id==='standard')return `<span class="effect-swatch standard" aria-hidden="true"><i>STD</i></span>`;
    const a=item.rainbow?'#70ff9d':(item.outer||'#61e8ff'),b=item.rainbow?'#ff58ce':(item.inner||'#efffff');
    return `<span class="effect-swatch ${item.rainbow?'rainbow':''}" style="--effect-a:${a};--effect-b:${b}" aria-hidden="true"><i></i><b></b><em></em></span>`;
  };
  const catalogVisualMarkup=(id,item,isCars)=>{
    if(!isCars)return effectVisualMarkup(id,item);
    const src=item?.sprite?.thumbnail||item?.sprite?.src;
    if(src)return `<span class="catalog-car-visual"><img class="catalog-car-thumb" src="${assetUrl(src)}" alt="" loading="lazy" decoding="async"><span class="catalog-car-fallback" aria-hidden="true">VA</span></span>`;
    return `<canvas class="catalog-fallback-canvas" width="280" height="112" aria-hidden="true"></canvas>`;
  };
  const badgeMarkup=id=>{
    const meta=R.CAR_CATEGORIES[id]||R.CAR_CATEGORIES.basic;
    return `<span class="rarity-badge ${meta.className}" data-rarity="${id}"><span class="rarity-icon" aria-hidden="true"><i></i></span><b>${meta.label}</b></span>`;
  };
  const rewardVisual=reward=>{
    if(reward.kind==='livery'&&reward.thumbnail)return `<span class="case-reward-visual car"><img src="${assetUrl(reward.thumbnail)}" alt="" loading="lazy" decoding="async"></span>`;
    const a=reward.rainbow?'#70ff9d':(reward.outer||'#61e8ff'),b=reward.rainbow?'#ff58ce':(reward.inner||'#efffff');
    return `<span class="case-reward-visual effect" style="--effect-a:${a};--effect-b:${b}" aria-hidden="true"><i></i><b></b></span>`;
  };
  const rewardRarity=reward=>reward.kind==='livery'?(R.CAR_CATEGORIES[reward.category]||R.CAR_CATEGORIES.basic):{label:'EFFECT',className:'rarity-effect',color:'#61E8FF'};

  class Garage{
    constructor(save,onChange){
      this.save=save;this.onChange=onChange;this.mode='shop';this.cards=[];this.categoryEmpty=false;this.activeCaseId=null;this.caseSpinning=false;this.caseSpinToken=0;this.caseQuantity=1;this.previewLoadToken=0;this.catalogPreloadToken=0;
      this.state={
        shop:{tab:'livery',category:'all',previewLivery:save.selectedLivery,previewEffect:save.selectedEffect,previewCase:'all'},
        garage:{tab:'livery',category:'all',previewLivery:save.selectedLivery,previewEffect:save.selectedEffect}
      };
      this.car=new R.Car();this.car.x=280;this.car.y=190;this.car.angle=-.20;this.car.speed=260;this.car.throttleVisual=1;
      this.bindView('shop');this.bindView('garage');this.bindCaseDialog();this.bindTuning();
    }
    view(mode=this.mode){
      const prefix=mode==='shop'?'shop':'garage';
      return {
        tabs:$(prefix+'Tabs'),categories:$(prefix+'CategoryTabs'),items:$(prefix+'Items'),message:$(prefix+'Message'),
        preview:$(prefix+'Preview'),previewName:$(prefix+'PreviewName'),previewEffect:$(prefix+'PreviewEffect'),previewCopy:mode==='shop'?$('shopPreviewCopy'):null,caseHero:mode==='shop'?$('shopCaseHero'):null,
        credits:mode==='shop'?$('shopCredits'):$('garageCollection')
      };
    }
    caseDialog(){
      return {modal:$('caseModal'),title:$('caseModalTitle'),subtitle:$('caseModalSubtitle'),credits:$('caseModalCredits'),close:$('caseCloseBtn'),crate:$('caseModalCrate'),owned:$('caseOwnedCount'),price:$('casePriceLabel'),qtyMinus:$('caseQtyMinus'),qtyValue:$('caseQtyValue'),qtyPlus:$('caseQtyPlus'),buyBatch:$('caseBuyBatchBtn'),roulette:$('caseRoulette'),viewport:document.querySelector('#caseRoulette .case-roulette-viewport'),strip:$('caseRollStrip'),ready:$('caseReadyLabel'),result:$('caseResult'),open:$('caseOpenBtn'),rewardCount:$('caseRewardCount'),rewardList:$('caseRewardList')};
    }
    bindView(mode){
      const v=this.view(mode);if(!v.tabs||!v.categories||!v.items)return;
      v.tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.mode=mode;this.state[mode].tab=b.dataset.tab;this.render();}));
      v.categories.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.mode=mode;this.state[mode].category=b.dataset.category;this.render();}));
      v.items.addEventListener('pointerdown',e=>{const card=e.target.closest('[data-item]');if(card&&this.state[mode].tab==='livery')this.prewarmLivery(card.dataset.item);},{passive:true});
      v.items.addEventListener('click',e=>this.handleItemsClick(mode,e));
    }
    bindCaseDialog(){
      const d=this.caseDialog();if(!d.modal)return;
      d.close.addEventListener('click',()=>this.closeCaseDialog());
      d.open.addEventListener('click',()=>this.spinActiveCase());
      d.buyBatch.addEventListener('click',()=>this.buyCaseBatch());
      d.qtyMinus.addEventListener('click',()=>this.setCaseQuantity(this.caseQuantity-1));
      d.qtyPlus.addEventListener('click',()=>this.setCaseQuantity(this.caseQuantity+1));
      d.modal.addEventListener('click',e=>{if(e.target===d.modal)this.closeCaseDialog();});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!d.modal.classList.contains('hidden'))this.closeCaseDialog();});
    }
    handleItemsClick(mode,e){
      const tuning=e.target.closest('[data-tune]');if(tuning&&mode==='garage'){this.openTuning(tuning.dataset.tune);return;}
      const caseCard=e.target.closest('[data-case]');
      if(caseCard&&mode==='shop'&&this.state.shop.tab==='case'){
        const id=caseCard.dataset.case;this.state.shop.previewCase=id;
        const buy=e.target.closest('.case-buy-btn'),open=e.target.closest('.case-owned-open-btn');
        if(buy||open)this.openCaseDialog(id);else this.render();
        return;
      }
      const card=e.target.closest('[data-item]');if(!card)return;
      this.mode=mode;const s=this.state[mode],id=card.dataset.item,action=e.target.closest('.purchase-btn,.select-btn');
      const previewKey=s.tab==='livery'?'previewLivery':'previewEffect',changed=s[previewKey]!==id;s[previewKey]=id;
      // Preview taps are the hot path on iPhone. Do not rebuild dozens of car cards
      // just to move the preview highlight; update only the two affected cards and
      // the hero preview. Purchases/equips still use a full render because ownership changes.
      if(!action){if(changed)this.updatePreviewOnly(mode,id);return;}
      if(action&&mode==='shop'&&action.classList.contains('purchase-btn')){
        const kind=s.tab,result=R.shopAction(this.save,kind,id),v=this.view(mode);
        v.message.textContent=result==='insufficient'?'НЕДОСТАТОЧНО CR':result==='purchased'?'КУПЛЕНО · предмет уже доступен в ГАРАЖЕ':'Предмет недоступен';
        v.message.classList.toggle('warning',result==='insufficient');
        if(result==='purchased')this.onChange();
      }else if(action&&mode==='garage'&&action.classList.contains('select-btn')){
        const result=R.selectOwned(this.save,s.tab,id),v=this.view(mode);
        v.message.textContent=result==='selected'?'ВЫБРАНО · готово к следующему заезду':'Предмет недоступен';
        v.message.classList.toggle('warning',result!=='selected');
        if(result==='selected')this.onChange();
      }
      this.render();
    }
    bindTuning(){
      const modal=$('tuningModal');if(!modal)return;
      $('tuningClose').addEventListener('click',()=>modal.close());
      modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
      modal.addEventListener('close',()=>{this.tuningPurchase=null;this.tuningTrigger?.focus();});
      $('tuningRows').addEventListener('click',e=>{
        const b=e.target.closest('[data-upgrade]');if(!b||b.disabled)return;
        this.tuningPurchase={key:b.dataset.upgrade,level:Number(b.dataset.level)};this.renderTuning();$('tuningConfirm').focus();
      });
      $('tuningCancel').addEventListener('click',()=>{this.tuningPurchase=null;this.renderTuning();});
      $('tuningConfirm').addEventListener('click',()=>{
        const pending=this.tuningPurchase;if(!pending)return;this.tuningPurchase=null;
        const result=R.buyCarUpgrade(this.save,this.tuningId,pending.key,pending.level);
        if(result.status==='purchased'){this.onChange();this.render();}
        this.renderTuning();$('tuningStatus').textContent=result.status==='purchased'?`Установлено · уровень ${result.level} · −${formatCredits(result.cost)} CR`:result.status==='insufficient'?'Недостаточно CR. Покупка не выполнена.':'Данные изменились. Выберите улучшение заново.';
      });
    }
    openTuning(id){
      if(!this.save.ownedLiveries.includes(id))return;
      this.tuningId=id;this.tuningPurchase=null;this.tuningTrigger=document.activeElement;this.renderTuning();$('tuningStatus').textContent='Улучшения постоянные и устанавливаются сразу после покупки.';
      $('tuningModal').showModal();$('tuningClose').focus();
    }
    renderTuning(){
      const id=this.tuningId,item=R.LIVERIES[id];if(!item)return;
      const levels=R.getUpgradeLevels(this.save,id),stats=R.getCarPerformance(id,this.save),base=R.CAR_PERFORMANCE[id];
      $('tuningTitle').textContent=item.name;$('tuningCredits').textContent=formatCredits(this.save.credits)+' CR';
      $('tuningCategory').textContent=R.CAR_CATEGORIES[categoryOf(item)].label+' / '+Object.values(levels).reduce((a,b)=>a+b,0)+' ИЗ 15 УЛУЧШЕНИЙ';
      $('tuningRows').innerHTML=Object.entries(R.UPGRADE_TYPES).map(([key,type])=>{
        const level=levels[key],cost=R.getUpgradeCost(id,key,level),max=level>=5,next=Math.round(base[type.stat]*(1+(level+1)*type.step)),missing=Math.max(0,(cost||0)-this.save.credits);
        return `<article class="tuning-row"><div class="tuning-row-heading"><strong>${type.name}</strong><span>УРОВЕНЬ ${level} / 5</span></div><p>${type.description}</p><div class="tuning-levels" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<level?'filled':''}"></i>`).join('')}</div><div class="tuning-values"><span>БАЗА <b>${base[type.stat]}</b></span><span>СЕЙЧАС <b>${stats[type.stat]}${key==='speed'?' км/ч':''}</b></span>${max?'':`<span>ДАЛЕЕ <b>${next}</b></span>`}</div><button type="button" data-upgrade="${key}" data-level="${level}" ${max||missing?'disabled':''}>${max?'✓ МАКСИМУМ':`УРОВЕНЬ ${level+1} · ${formatCredits(cost)} CR`}</button>${missing?`<small>Не хватает ${formatCredits(missing)} CR</small>`:''}</article>`;
      }).join('');
      const pending=this.tuningPurchase;$('tuningPurchase').classList.toggle('hidden',!pending);
      if(pending){const cost=R.getUpgradeCost(id,pending.key,pending.level);$('tuningPurchaseText').textContent=`${R.UPGRADE_TYPES[pending.key].name}: уровень ${pending.level+1}. Списать ${formatCredits(cost)} CR?`;$('tuningConfirm').disabled=cost===null||cost>this.save.credits;}
    }
    prewarmLivery(id){
      const item=R.LIVERIES[id],src=item?.sprite?.src;if(src&&R.preloadSprite)R.preloadSprite(src);
    }
    scheduleCatalogPreload(entries,mode){
      const token=++this.catalogPreloadToken,limit=mode==='garage'?entries.length:Math.min(entries.length,14),queue=entries.slice(0,limit);
      queue.forEach(([id,item],index)=>setTimeout(()=>{if(token!==this.catalogPreloadToken)return;const src=item?.sprite?.src;if(src&&R.preloadSprite)R.preloadSprite(src);},35+index*65));
    }
    setPreviewCar(liveryId,effectId){
      const item=R.LIVERIES[liveryId],src=item?.sprite?.src,token=++this.previewLoadToken;
      if(!src||!R.preloadSprite){this.car.setLoadout(liveryId,effectId,'preview');return;}
      R.preloadSprite(src).then(()=>{if(token!==this.previewLoadToken)return;const s=this.state[this.mode];if(s?.previewLivery!==liveryId||s?.previewEffect!==effectId)return;this.car.setLoadout(liveryId,effectId,'preview');});
    }
    syncPreviewChip(card,isPreview,isSelected){
      if(!card)return;card.classList.toggle('previewing',isPreview);card.dataset.previewed=isPreview?'true':'false';
      const button=card.querySelector('.item-preview');if(button)button.setAttribute('aria-pressed',String(isPreview));
      let chip=card.querySelector('.item-preview-state');
      if(isSelected){if(!chip){chip=document.createElement('span');chip.className='item-preview-state';button?.appendChild(chip);}chip.className='item-preview-state active';chip.textContent='АКТИВНО';}
      else if(isPreview){if(!chip){chip=document.createElement('span');chip.className='item-preview-state';button?.appendChild(chip);}chip.className='item-preview-state';chip.textContent='ПРОСМОТР';}
      else if(chip)chip.remove();
    }
    updatePreviewOnly(mode,id){
      const s=this.state[mode],v=this.view(mode),isCars=s.tab==='livery',previewKey=isCars?'previewLivery':'previewEffect',selected=this.save[isCars?'selectedLivery':'selectedEffect'];
      const previous=v.items.querySelector('[data-previewed="true"]'),next=v.items.querySelector(`[data-item="${CSS.escape(id)}"]`);
      if(previous&&previous!==next)this.syncPreviewChip(previous,false,previous.dataset.item===selected);
      this.syncPreviewChip(next,true,id===selected);
      if(isCars)this.setPreviewCar(id,s.previewEffect);else this.setPreviewCar(s.previewLivery,id);
      v.previewName.textContent=R.LIVERIES[s.previewLivery].name;
      v.previewEffect.textContent=R.EFFECTS[s.previewEffect].name+(mode==='garage'?' · '+(s[previewKey]===selected?'АКТИВНО':'ПРЕДПРОСМОТР'):'');
    }
    open(mode='shop'){
      this.mode=mode;const s=this.state[mode];
      s.previewLivery=this.save.selectedLivery;s.previewEffect=this.save.selectedEffect;s.tab='livery';s.category='all';if(mode==='shop')s.previewCase='all';
      this.render();const v=this.view(mode);
      v.message.textContent=mode==='shop'?'Кредиты начисляются за завершённые гонки.':'Выберите машину и эффект из своей коллекции.';
      v.message.classList.remove('warning');
    }
    syncFromSave(){
      for(const s of Object.values(this.state)){s.previewLivery=this.save.selectedLivery;s.previewEffect=this.save.selectedEffect;}
      this.render();
      if($('tuningModal')?.open){this.tuningPurchase=null;if(this.save.ownedLiveries.includes(this.tuningId))this.renderTuning();else $('tuningModal').close();}
      if(this.activeCaseId&&!this.caseDialog().modal.classList.contains('hidden')&&!this.caseSpinning)this.refreshCaseDialogInventory();
    }
    render(){
      const mode=this.mode,s=this.state[mode],v=this.view(mode),isCars=s.tab==='livery',isCases=mode==='shop'&&s.tab==='case';
      if(!v.tabs)return;
      if(mode==='shop')v.credits.textContent=formatCredits(this.save.credits)+' CR';
      else v.credits.textContent=`COLLECTION ${this.save.ownedLiveries.length + this.save.ownedEffects.length}`;
      v.tabs.querySelectorAll('button').forEach(b=>{const active=b.dataset.tab===s.tab;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
      v.categories.classList.toggle('hidden',!isCars);
      v.categories.querySelectorAll('button').forEach(b=>{const active=b.dataset.category===s.category;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
      if(isCases){this.renderCases(v,s);return;}
      if(v.caseHero)v.caseHero.classList.add('hidden');if(v.preview)v.preview.classList.remove('hidden');if(v.previewCopy)v.previewCopy.textContent='Предпросмотр коллекции. Покупка не меняет активный loadout.';
      this.renderCatalog(v,s,isCars,mode);
    }
    renderCatalog(v,s,isCars,mode){
      const owned=this.save[isCars?'ownedLiveries':'ownedEffects'],selected=this.save[isCars?'selectedLivery':'selectedEffect'];
      let entries=R.getCatalogEntries(this.save,mode,s.tab,s.category);
      this.categoryEmpty=isCars&&entries.length===0;
      const previewKey=isCars?'previewLivery':'previewEffect';
      if(entries.length&&!entries.some(([id])=>id===s[previewKey])){const selectedEntry=entries.find(([id])=>id===selected);s[previewKey]=(selectedEntry||entries[0])[0];}
      if(this.categoryEmpty){
        const cat=R.CAR_CATEGORIES[s.category]||R.CAR_CATEGORIES.all,title=mode==='shop'?'СКОРО':'В ГАРАЖЕ ПОКА НЕТ МАШИН ЭТОЙ КАТЕГОРИИ',copy=mode==='shop'?'Новые автомобили этой категории уже готовятся.':'Найдите и приобретите их в магазине.';
        v.items.innerHTML=`<div class="shop-empty ${cat.className}" role="status">${badgeMarkup(s.category==='all'?'basic':s.category)}<strong>${title}</strong><span>${copy}</span></div>`;
      }else{
        v.items.innerHTML=entries.map(([id,item])=>{
          const isOwned=owned.includes(id),isSelected=selected===id,isPreview=s[previewKey]===id,cat=isCars?categoryOf(item):null,status=isSelected?'ВЫБРАНО':isOwned?'КУПЛЕНО':'ЗАКРЫТО';
          const priceText=mode==='shop'?(item.price?formatCredits(item.price)+' CR':'FREE'):(isSelected?'АКТИВНО':'В КОЛЛЕКЦИИ');
          const shortfall=Math.max(0,(item.price||0)-this.save.credits),shortfallText=mode==='shop'&&!isOwned&&shortfall>0?`<div class="item-shortfall">ЕЩЁ ${formatCredits(shortfall)} CR</div>`:'';
          let button='';if(mode==='shop')button=isOwned?`<button type="button" class="purchase-btn owned" disabled>КУПЛЕНО</button>`:`<button type="button" class="purchase-btn">КУПИТЬ — ${formatCredits(item.price)} CR</button>`;else button=`<button type="button" class="select-btn ${isSelected?'equipped':''}" ${isSelected?'disabled':''}>${isSelected?'✓ АКТИВНО':'ВЫБРАТЬ'}</button>`;
          if(isCars&&!R.carAvailable(id))button='<button type="button" class="select-btn" disabled>ВРЕМЕННО НЕДОСТУПНА</button>';
          if(isCars&&mode==='garage')button+=`<button type="button" class="tuning-gear" data-tune="${id}" aria-label="Настроить ${item.name}">⚙ <span>УЛУЧШЕНИЯ</span></button>`;
          const classes=['shop-item',isSelected?'selected equipped-card':'',isPreview?'previewing':'',isCars?'car-card '+R.CAR_CATEGORIES[cat].className:'effect-card'].filter(Boolean).join(' ');
          const effectStyle=!isCars?` style="--effect-a:${item.rainbow?'#70ff9d':(item.outer||'#61e8ff')};--effect-b:${item.rainbow?'#ff58ce':(item.inner||'#efffff')}"`:'';
          const stateChip=isSelected?'<span class="item-preview-state active">АКТИВНО</span>':isPreview?'<span class="item-preview-state">ПРОСМОТР</span>':'';
          return `<article class="${classes}" data-item="${id}" data-equipped="${isSelected?'true':'false'}" data-previewed="${isPreview?'true':'false'}"${effectStyle}>${isCars?badgeMarkup(cat):''}<button type="button" class="item-preview" aria-label="Предпросмотр ${item.name}" aria-pressed="${isPreview?'true':'false'}">${catalogVisualMarkup(id,item,isCars)}${stateChip}</button><div class="item-title">${item.name}${item.limited?' · LIMITED':''}</div><div class="item-price"><strong>${priceText}</strong><span>${status}</span></div>${isCars?`<div class="car-spec-line">${R.getCarPerformance(id,this.save).maxSpeed} км/ч <span>·</span> РАЗГОН ${R.getCarPerformance(id,this.save).accel} <span>·</span> ТОРМОЗА ${R.getCarPerformance(id,this.save).brakePower}</div>`:""}${shortfallText}${button}</article>`;
        }).join('');
      }
      v.items.querySelectorAll('.catalog-car-thumb').forEach(img=>{
        const visual=img.closest('.catalog-car-visual');
        const mark=()=>visual&&visual.classList.add('asset-error');
        if(img.complete&&!img.naturalWidth)mark();else img.addEventListener('error',mark,{once:true});
      });
      this.cards=Array.from(v.items.querySelectorAll('.shop-item[data-item] canvas.catalog-fallback-canvas')).map(canvas=>{const el=canvas.closest('.shop-item[data-item]'),car=new R.Car();car.x=140;car.y=56;car.speed=280;car.throttleVisual=1;car.setLoadout(el.dataset.item,s.previewEffect,'thumbnail');return {car,canvas};});
      if(isCars)this.scheduleCatalogPreload(entries,mode);
      if(!this.categoryEmpty)this.setPreviewCar(s.previewLivery,s.previewEffect);
      if(this.categoryEmpty){const meta=R.CAR_CATEGORIES[s.category]||R.CAR_CATEGORIES.all;v.previewName.textContent=meta.label;v.previewEffect.textContent=mode==='shop'?'НОВЫЕ МОДЕЛИ ГОТОВЯТСЯ':'ПОПОЛНИТЕ КОЛЛЕКЦИЮ В МАГАЗИНЕ';}
      else {v.previewName.textContent=R.LIVERIES[s.previewLivery].name;v.previewEffect.textContent=R.EFFECTS[s.previewEffect].name+(mode==='garage'?' · '+(s[previewKey]===selected?'АКТИВНО':'ПРЕДПРОСМОТР'):'');}
    }
    renderCases(v,s){
      this.cards=[];this.categoryEmpty=false;v.preview.classList.add('hidden');v.caseHero.classList.remove('hidden');
      const selected=R.CASES[s.previewCase]||R.CASES.all;s.previewCase=selected.id;
      v.caseHero.style.setProperty('--case',selected.accent);v.caseHero.dataset.case=selected.id;
      v.previewName.textContent=selected.name;v.previewEffect.textContent=`${selected.label} · ${formatCredits(selected.price)} CR`;v.previewCopy.textContent=selected.description;
      v.items.innerHTML=R.CASE_ORDER.map(id=>{
        const box=R.CASES[id],count=Math.max(0,Math.floor(Number(this.save.caseInventory?.[id])||0)),shortfall=Math.max(0,box.price-this.save.credits),maxReward=Math.max(...box.rewards.map(x=>x.price));
        return `<article class="shop-item case-card ${id===s.previewCase?'selected':''}" data-case="${id}" style="--case:${box.accent}"><div class="case-card-art"><div class="case-crate"><i></i><b>VA</b><span></span></div><em>${box.label}</em>${count?`<mark>x${count}</mark>`:''}</div><div class="case-card-title"><strong>${box.name}</strong><span>${box.subtitle}</span></div><div class="case-card-stats"><span>${box.rewards.length} НАГРАД</span><span>ДО ${formatCredits(maxReward)} CR</span></div><div class="item-price case-price"><strong>${formatCredits(box.price)} CR</strong><span>${id==='all'?'УЛЬТРА-РЕДКИЙ LUX':'ШАНСЫ ПО ЦЕНЕ'}</span></div>${shortfall?`<div class="item-shortfall">ЕЩЁ ${formatCredits(shortfall)} CR</div>`:''}<button type="button" class="purchase-btn case-buy-btn">КУПИТЬ · 1–10</button>${count?`<button type="button" class="case-owned-open-btn">ОТКРЫТЬ · x${count}</button>`:''}</article>`;
      }).join('');
    }
    buyCase(id){
      this.openCaseDialog(id);
    }
    setCaseQuantity(value){
      this.caseQuantity=Math.max(1,Math.min(10,Math.floor(Number(value)||1)));this.refreshCaseDialogInventory();
    }
    buyCaseBatch(){
      const id=this.activeCaseId,box=R.CASES[id],d=this.caseDialog();if(!box||this.caseSpinning)return;
      const result=R.buyCases?R.buyCases(this.save,id,this.caseQuantity):{status:'invalid'};
      const v=this.view('shop');
      if(result.status==='purchased'){
        v.message.textContent=`${box.name} · КУПЛЕНО x${result.quantity} · ${formatCredits(result.cost)} CR`;v.message.classList.remove('warning');this.onChange();this.render();this.refreshCaseDialogInventory();d.ready.classList.remove('hidden');d.ready.textContent=`КУПЛЕНО x${result.quantity} · МОЖНО ОТКРЫТЬ ОДНИМ НАЖАТИЕМ`;
      }else{
        v.message.textContent=result.status==='insufficient'?`НЕДОСТАТОЧНО CR · НУЖНО ${formatCredits(box.price*this.caseQuantity)} CR`:result.status==='limit'?'ЛИМИТ ИНВЕНТАРЯ КЕЙСОВ':'Кейс недоступен';v.message.classList.add('warning');this.refreshCaseDialogInventory();
      }
    }
    openCaseDialog(id){
      const box=R.CASES[id],d=this.caseDialog();if(!box||!d.modal)return;
      this.activeCaseId=id;this.caseSpinning=false;this.caseSpinToken++;this.caseQuantity=1;d.modal.classList.remove('hidden');d.modal.style.setProperty('--case',box.accent);d.crate.style.setProperty('--case',box.accent);d.crate.dataset.case=id;
      d.title.textContent=box.name;d.subtitle.textContent=box.subtitle;d.price.textContent=`ЦЕНА ${formatCredits(box.price)} CR`;d.rewardCount.textContent=`${box.rewards.length} ПРЕДМЕТОВ`;
      d.rewardList.innerHTML=box.rewards.slice().sort((a,b)=>b.price-a.price).map(reward=>{const rarity=rewardRarity(reward);return `<div class="case-reward-row ${rarity.className}" style="--rarity:${rarity.color}">${rewardVisual(reward)}<div><strong>${reward.name}</strong><span>${rarity.label} · ${formatCredits(reward.price)} CR</span></div><b>${chanceText(reward.chanceBps)}</b></div>`;}).join('');
      d.strip.innerHTML='';d.result.className='case-result hidden';d.result.innerHTML='';d.ready.classList.remove('hidden');d.ready.textContent='НАЖМИТЕ «ОТКРЫТЬ», ЧТОБЫ ЗАПУСТИТЬ РУЛЕТКУ';d.close.disabled=false;this.refreshCaseDialogInventory();
    }
    refreshCaseDialogInventory(){
      if(!this.activeCaseId)return;const d=this.caseDialog(),box=R.CASES[this.activeCaseId],count=Math.max(0,Math.floor(Number(this.save.caseInventory?.[this.activeCaseId])||0)),qty=Math.max(1,Math.min(10,this.caseQuantity)),openQty=Math.min(qty,count),cost=box.price*qty;
      d.credits.textContent=formatCredits(this.save.credits)+' CR';d.owned.textContent='x'+count;d.qtyValue.textContent=String(qty);d.qtyMinus.disabled=this.caseSpinning||qty<=1;d.qtyPlus.disabled=this.caseSpinning||qty>=10;
      d.buyBatch.disabled=this.caseSpinning||this.save.credits<cost||count+qty>999;d.buyBatch.textContent=`КУПИТЬ ×${qty} · ${formatCredits(cost)} CR`;
      d.open.disabled=count<1||this.caseSpinning;d.open.textContent=count>0?(this.caseSpinning?'ОТКРЫВАЕМ…':`ОТКРЫТЬ ×${openQty}${qty>count?' · ДОСТУПНО '+count:''}`):'НЕТ КЕЙСОВ';
    }
    closeCaseDialog(){
      const d=this.caseDialog();if(!d.modal||this.caseSpinning)return;d.modal.classList.add('hidden');this.activeCaseId=null;this.caseSpinToken++;this.render();
    }
    randomReward(box){
      let ticket=Math.floor(Math.random()*10000);for(const reward of box.rewards){if(ticket<reward.chanceBps)return reward;ticket-=reward.chanceBps;}return box.rewards[box.rewards.length-1];
    }
    showcaseReward(box){
      const ranked=box.rewards.slice().sort((a,b)=>b.price-a.price),pool=ranked.slice(0,Math.max(1,Math.ceil(ranked.length*.24)));return pool[Math.floor(Math.random()*pool.length)]||ranked[0];
    }
    buildVisualSequence(box,winningReward,targetIndex,total){
      // Visual-only tension reel. The real rewards are already resolved by R.openCases()
      // before this sequence is built, so these showcase items never affect RNG or odds.
      const sequence=[],showcaseOffsets=new Set([2,5,9,14,20,27,34]);
      for(let i=0;i<total;i++){
        if(i===targetIndex){sequence.push({reward:winningReward,showcase:false});continue;}
        const distance=targetIndex-i,showcase=i<targetIndex&&(showcaseOffsets.has(distance)||(i>8&&distance>3&&Math.random()<.09));
        sequence.push({reward:showcase?this.showcaseReward(box):this.randomReward(box),showcase});
      }
      return sequence;
    }
    spinActiveCase(){
      const id=this.activeCaseId,box=R.CASES[id],d=this.caseDialog();if(!box||this.caseSpinning)return;
      const available=Math.max(0,Math.floor(Number(this.save.caseInventory?.[id])||0)),quantity=Math.min(this.caseQuantity,available,10);if(quantity<1){this.refreshCaseDialogInventory();return;}
      const batch=R.openCases?R.openCases(this.save,id,quantity):{status:'invalid',results:[]};if(batch.status!=='opened'||!batch.results.length){this.refreshCaseDialogInventory();return;}
      const results=batch.results,featured=results.reduce((best,item)=>!best||item.reward.price>best.reward.price?item:best,null);
      this.onChange();this.render();this.caseSpinning=true;this.refreshCaseDialogInventory();d.close.disabled=true;d.result.className='case-result hidden';d.result.innerHTML='';d.ready.classList.remove('hidden');d.ready.textContent=results.length>1?`СИНХРОНИЗАЦИЯ ${results.length} DROPS…`:'СИНХРОНИЗАЦИЯ DROP…';
      d.roulette.classList.add('is-spinning');d.roulette.dataset.batchCount=String(results.length);
      const targetIndex=44,total=51,sequence=this.buildVisualSequence(box,featured.reward,targetIndex,total);
      d.strip.innerHTML=sequence.map(({reward,showcase},index)=>{const rarity=rewardRarity(reward);return `<div class="case-roll-item ${rarity.className}${showcase?' showcase':''}" data-roll-index="${index}" style="--rarity:${rarity.color}">${rewardVisual(reward)}<strong>${reward.name}</strong><span>${rarity.label}</span></div>`;}).join('');
      d.strip.style.transition='none';d.strip.style.transform='translate3d(0,0,0)';void d.strip.offsetWidth;
      const token=++this.caseSpinToken,reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduced?420:4700;
      const finish=()=>{if(token!==this.caseSpinToken||!this.caseSpinning)return;this.caseSpinning=false;d.roulette.classList.remove('is-spinning');const target=d.strip.querySelector(`[data-roll-index="${targetIndex}"]`);if(target)target.classList.add('winner');d.close.disabled=false;this.showCaseResults(results);this.refreshCaseDialogInventory();};
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const target=d.strip.querySelector(`[data-roll-index="${targetIndex}"]`);if(!target){finish();return;}const offset=Math.max(0,target.offsetLeft-(d.viewport.clientWidth-target.offsetWidth)/2);d.ready.textContent=results.length>1?`ОТКРЫВАЕМ ${results.length} КЕЙСОВ ОДНОВРЕМЕННО…`:'ОТКРЫВАЕМ КЕЙС…';d.strip.style.transition=`transform ${duration}ms cubic-bezier(.07,.72,.08,1)`;d.strip.style.transform=`translate3d(${-offset}px,0,0)`;d.strip.addEventListener('transitionend',finish,{once:true});setTimeout(finish,duration+180);
      }));
    }
    showCaseResult(result){
      this.showCaseResults([result]);
    }
    showCaseResults(results){
      const d=this.caseDialog();if(!Array.isArray(results)||!results.length)return;d.ready.classList.add('hidden');d.result.classList.remove('hidden');
      if(results.length===1){
        const result=results[0],reward=result.reward,rarity=rewardRarity(reward),duplicate=result.duplicate;d.result.className='case-result';d.result.style.setProperty('--rarity',rarity.color);
        d.result.innerHTML=`${rewardVisual(reward)}<div class="case-result-copy"><span class="case-result-kicker ${duplicate?'duplicate':'new'}">${duplicate?'ДУБЛИКАТ · КОМПЕНСАЦИЯ':'НОВЫЙ ПРЕДМЕТ'}</span><strong>${reward.name}</strong><small>${rarity.label} · ШАНС ${chanceText(result.chanceBps)} · ЦЕННОСТЬ ${formatCredits(reward.price)} CR</small>${duplicate?`<b>+${formatCredits(result.compensation)} CR</b>`:'<b>ДОБАВЛЕНО В ГАРАЖ</b>'}</div>`;
        this.view('shop').message.textContent=duplicate?`ДУБЛИКАТ · +${formatCredits(result.compensation)} CR`:`ПОЛУЧЕНО · ${reward.name}`;this.view('shop').message.classList.remove('warning');return;
      }
      const totalComp=results.reduce((sum,x)=>sum+(x.compensation||0),0),newCount=results.filter(x=>!x.duplicate).length;d.result.className='case-result batch';
      d.result.innerHTML=`<div class="case-batch-summary"><span>MULTI DROP</span><strong>${results.length} КЕЙСОВ ОТКРЫТО</strong><small>${newCount} НОВЫХ · ${results.length-newCount} ДУБЛИКАТОВ${totalComp?` · +${formatCredits(totalComp)} CR`:''}</small></div><div class="case-result-grid">${results.map((result,index)=>{const reward=result.reward,rarity=rewardRarity(reward);return `<article class="case-result-mini ${result.duplicate?'duplicate':''}" style="--rarity:${rarity.color};--delay:${Math.min(index,9)*55}ms"><span class="case-result-number">${String(index+1).padStart(2,'0')}</span>${rewardVisual(reward)}<div><strong>${reward.name}</strong><small>${rarity.label} · ${chanceText(result.chanceBps)}</small><b>${result.duplicate?`+${formatCredits(result.compensation)} CR`:'NEW'}</b></div></article>`;}).join('')}</div>`;
      this.view('shop').message.textContent=`MULTI DROP · ${results.length} КЕЙСОВ · ${newCount} НОВЫХ${totalComp?` · +${formatCredits(totalComp)} CR`:''}`;this.view('shop').message.classList.remove('warning');
    }
    draw(dt){
      const s=this.state[this.mode];if(this.mode==='shop'&&s.tab==='case')return;
      const v=this.view(),canvas=v.preview;if(!canvas)return;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,560,360);ctx.strokeStyle='rgba(141,255,73,.12)';ctx.lineWidth=1;
      for(let y=45;y<350;y+=38){ctx.beginPath();ctx.moveTo(20,y);ctx.lineTo(540,y);ctx.stroke();}
      ctx.strokeStyle='rgba(141,255,73,.3)';ctx.beginPath();ctx.ellipse(280,190,210,105,0,0,Math.PI*2);ctx.stroke();
      if(!this.categoryEmpty){this.car.effectTime+=dt;this.car.draw(ctx,3.8);}
      for(const item of this.cards){if(!item.canvas)continue;const c=item.canvas.getContext('2d');c.clearRect(0,0,280,112);item.car.effectTime+=dt;item.car.draw(c,1.6);}
    }
  }
  R.Garage=Garage;
})();
