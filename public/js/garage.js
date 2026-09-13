(function(){
  'use strict';
  const R=window.Racing,$=id=>document.getElementById(id);
  const formatCredits=value=>Math.max(0,Math.floor(Number(value)||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  const categoryOf=item=>R.normalizeCarCategory(item&&item.category);
  const badgeMarkup=id=>{
    const meta=R.CAR_CATEGORIES[id]||R.CAR_CATEGORIES.basic;
    return `<span class="rarity-badge ${meta.className}" data-rarity="${id}"><span class="rarity-icon" aria-hidden="true"><i></i></span><b>${meta.label}</b></span>`;
  };

  class Garage{
    constructor(save,onChange){
      this.save=save;this.onChange=onChange;this.mode='shop';this.cards=[];this.categoryEmpty=false;
      this.state={
        shop:{tab:'livery',category:'all',previewLivery:save.selectedLivery,previewEffect:save.selectedEffect},
        garage:{tab:'livery',category:'all',previewLivery:save.selectedLivery,previewEffect:save.selectedEffect}
      };
      this.car=new R.Car();this.car.x=280;this.car.y=190;this.car.angle=-.20;this.car.speed=260;this.car.throttleVisual=1;
      this.bindView('shop');this.bindView('garage');
    }
    view(mode=this.mode){
      const prefix=mode==='shop'?'shop':'garage';
      return {
        tabs:$(prefix+'Tabs'),categories:$(prefix+'CategoryTabs'),items:$(prefix+'Items'),message:$(prefix+'Message'),
        preview:$(prefix+'Preview'),previewName:$(prefix+'PreviewName'),previewEffect:$(prefix+'PreviewEffect'),
        credits:mode==='shop'?$('shopCredits'):$('garageCollection')
      };
    }
    bindView(mode){
      const v=this.view(mode);if(!v.tabs||!v.categories||!v.items)return;
      v.tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.mode=mode;this.state[mode].tab=b.dataset.tab;this.render();}));
      v.categories.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.mode=mode;this.state[mode].category=b.dataset.category;this.render();}));
      v.items.addEventListener('click',e=>this.handleItemsClick(mode,e));
    }
    handleItemsClick(mode,e){
      const card=e.target.closest('[data-item]');if(!card)return;
      this.mode=mode;const s=this.state[mode],id=card.dataset.item;
      if(s.tab==='livery')s.previewLivery=id;else s.previewEffect=id;
      const action=e.target.closest('.purchase-btn,.select-btn');
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
    open(mode='shop'){
      this.mode=mode;const s=this.state[mode];
      s.previewLivery=this.save.selectedLivery;s.previewEffect=this.save.selectedEffect;s.tab='livery';s.category='all';
      this.render();const v=this.view(mode);
      v.message.textContent=mode==='shop'?'Кредиты начисляются за завершённые гонки.':'Выберите машину и эффект из своей коллекции.';
      v.message.classList.remove('warning');
    }
    syncFromSave(){
      for(const s of Object.values(this.state)){s.previewLivery=this.save.selectedLivery;s.previewEffect=this.save.selectedEffect;}
      this.render();
    }
    render(){
      const mode=this.mode,s=this.state[mode],v=this.view(mode),isCars=s.tab==='livery';
      if(!v.tabs)return;
      const catalog=isCars?R.LIVERIES:R.EFFECTS,owned=this.save[isCars?'ownedLiveries':'ownedEffects'],selected=this.save[isCars?'selectedLivery':'selectedEffect'];
      if(mode==='shop')v.credits.textContent=formatCredits(this.save.credits)+' CR';
      else v.credits.textContent=`COLLECTION ${this.save.ownedLiveries.length + this.save.ownedEffects.length}`;
      v.tabs.querySelectorAll('button').forEach(b=>{const active=b.dataset.tab===s.tab;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
      v.categories.classList.toggle('hidden',!isCars);
      v.categories.querySelectorAll('button').forEach(b=>{const active=b.dataset.category===s.category;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});

      let entries=R.getCatalogEntries(this.save,mode,s.tab,s.category);
      this.categoryEmpty=isCars&&entries.length===0;
      const previewKey=isCars?'previewLivery':'previewEffect';
      if(entries.length&&!entries.some(([id])=>id===s[previewKey])){
        const selectedEntry=entries.find(([id])=>id===selected);s[previewKey]=(selectedEntry||entries[0])[0];
      }

      if(this.categoryEmpty){
        const cat=R.CAR_CATEGORIES[s.category]||R.CAR_CATEGORIES.all;
        const title=mode==='shop'?'СКОРО':'В ГАРАЖЕ ПОКА НЕТ МАШИН ЭТОЙ КАТЕГОРИИ';
        const copy=mode==='shop'?'Новые автомобили этой категории уже готовятся.':'Найдите и приобретите их в магазине.';
        v.items.innerHTML=`<div class="shop-empty ${cat.className}" role="status">${badgeMarkup(s.category==='all'?'basic':s.category)}<strong>${title}</strong><span>${copy}</span></div>`;
      }else{
        v.items.innerHTML=entries.map(([id,item])=>{
          const isOwned=owned.includes(id),isSelected=selected===id,cat=isCars?categoryOf(item):null;
          const status=isSelected?'ВЫБРАНО':isOwned?'КУПЛЕНО':'ЗАКРЫТО';
          const priceText=mode==='shop'?(item.price?formatCredits(item.price)+' CR':'FREE'):(isSelected?'АКТИВНО':'В КОЛЛЕКЦИИ');
          const shortfall=Math.max(0,(item.price||0)-this.save.credits);
          const shortfallText=mode==='shop'&&!isOwned&&shortfall>0?`<div class="item-shortfall">ЕЩЁ ${formatCredits(shortfall)} CR</div>`:'';
          let button='';
          if(mode==='shop')button=isOwned?`<button type="button" class="purchase-btn owned" disabled>КУПЛЕНО</button>`:`<button type="button" class="purchase-btn">КУПИТЬ — ${formatCredits(item.price)} CR</button>`;
          else button=`<button type="button" class="select-btn ${isSelected?'equipped':''}" ${isSelected?'disabled':''}>${isSelected?'ВЫБРАНО':'ВЫБРАТЬ'}</button>`;
          return `<article class="shop-item ${isSelected?'selected':''} ${isCars?'car-card '+R.CAR_CATEGORIES[cat].className:''}" data-item="${id}">${isCars?badgeMarkup(cat):''}<button type="button" class="item-preview" aria-label="Предпросмотр ${item.name}"><canvas width="280" height="112"></canvas></button><div class="item-title">${item.name}</div><div class="item-price"><strong>${priceText}</strong><span>${status}</span></div>${shortfallText}${button}</article>`;
        }).join('');
      }
      this.cards=Array.from(v.items.querySelectorAll('.shop-item')).map(el=>{const car=new R.Car();car.x=140;car.y=56;car.speed=280;car.throttleVisual=1;car.setLoadout(isCars?el.dataset.item:s.previewLivery,isCars?s.previewEffect:el.dataset.item,'thumbnail');return {car,canvas:el.querySelector('canvas')};});
      if(!this.categoryEmpty)this.car.setLoadout(s.previewLivery,s.previewEffect,'preview');
      if(this.categoryEmpty){
        const meta=R.CAR_CATEGORIES[s.category]||R.CAR_CATEGORIES.all;v.previewName.textContent=meta.label;v.previewEffect.textContent=mode==='shop'?'НОВЫЕ МОДЕЛИ ГОТОВЯТСЯ':'ПОПОЛНИТЕ КОЛЛЕКЦИЮ В МАГАЗИНЕ';
      }else{
        v.previewName.textContent=R.LIVERIES[s.previewLivery].name;v.previewEffect.textContent=R.EFFECTS[s.previewEffect].name;
      }
    }
    draw(dt){
      const v=this.view(),canvas=v.preview;if(!canvas)return;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,560,360);
      ctx.strokeStyle='rgba(141,255,73,.12)';ctx.lineWidth=1;
      for(let y=45;y<350;y+=38){ctx.beginPath();ctx.moveTo(20,y);ctx.lineTo(540,y);ctx.stroke();}
      ctx.strokeStyle='rgba(141,255,73,.3)';ctx.beginPath();ctx.ellipse(280,190,210,105,0,0,Math.PI*2);ctx.stroke();
      if(!this.categoryEmpty){this.car.effectTime+=dt;this.car.draw(ctx,3.8);}
      for(const item of this.cards){const c=item.canvas.getContext('2d');c.clearRect(0,0,280,112);item.car.effectTime+=dt;item.car.draw(c,1.6);}
    }
  }
  R.Garage=Garage;
})();
