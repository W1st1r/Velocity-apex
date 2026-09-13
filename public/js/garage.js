(function(){
  'use strict';
  const R=window.Racing,$=id=>document.getElementById(id);
  const formatCredits=value=>Math.max(0,Math.floor(Number(value)||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  class Garage{
    constructor(save,onChange){
      this.save=save;this.onChange=onChange;this.tab='livery';this.category='regular';this.previewLivery=save.selectedLivery;this.previewEffect=save.selectedEffect;this.categoryEmpty=false;
      this.car=new R.Car();this.car.x=280;this.car.y=175;this.car.angle=-.20;this.car.speed=260;this.car.throttleVisual=1;this.cards=[];
      $('shopTabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.tab=b.dataset.tab;this.render();}));
      $('carCategoryTabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.category=b.dataset.category;this.render();}));
      $('shopItems').addEventListener('click',e=>{
        const card=e.target.closest('[data-item]');if(!card)return;
        const id=card.dataset.item;
        if(this.tab==='livery')this.previewLivery=id;else this.previewEffect=id;
        if(e.target.closest('.purchase-btn')){
          const result=R.shopAction(this.save,this.tab,id);
          $('shopMessage').textContent=result==='insufficient'?'НЕДОСТАТОЧНО CR':result==='purchased'?'КУПЛЕНО · нажмите ВЫБРАТЬ, чтобы установить':result==='selected'?'ВЫБРАНО · готово к следующему заезду':'Предмет недоступен';
          $('shopMessage').classList.toggle('warning',result==='insufficient');
          if(result==='purchased'||result==='selected')this.onChange();
        }
        this.render();
      });
    }
    open(){
      this.previewLivery=this.save.selectedLivery;this.previewEffect=this.save.selectedEffect;
      const selected=R.LIVERIES[this.save.selectedLivery];this.category=selected?.category||'regular';this.tab='livery';
      this.render();$('shopMessage').textContent='Кредиты начисляются за завершённые гонки.';$('shopMessage').classList.remove('warning');
    }
    render(){
      const isCars=this.tab==='livery',catalog=isCars?R.LIVERIES:R.EFFECTS,owned=this.save[isCars?'ownedLiveries':'ownedEffects'],selected=this.save[isCars?'selectedLivery':'selectedEffect'];
      $('shopCredits').textContent=formatCredits(this.save.credits)+' CR';
      $('shopTabs').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===this.tab);b.setAttribute('aria-pressed',String(b.dataset.tab===this.tab));});
      $('carCategoryTabs').classList.toggle('hidden',!isCars);
      $('carCategoryTabs').querySelectorAll('button').forEach(b=>{const active=b.dataset.category===this.category;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});

      let entries=Object.entries(catalog);
      if(isCars)entries=entries.filter(([,item])=>(item.category||'regular')===this.category);
      this.categoryEmpty=isCars&&entries.length===0;
      if(isCars&&entries.length&&!entries.some(([id])=>id===this.previewLivery)){
        const selectedEntry=entries.find(([id])=>id===selected);this.previewLivery=(selectedEntry||entries[0])[0];
      }
      if(this.categoryEmpty){
        $('shopItems').innerHTML='<div class="shop-empty" role="status"><strong>СКОРО</strong><span>Скоро здесь появятся новые автомобили</span></div>';
      }else{
        $('shopItems').innerHTML=entries.map(([id,item])=>{
          const isOwned=owned.includes(id),isSelected=selected===id,shortfall=Math.max(0,item.price-this.save.credits);
          const status=isSelected?'ВЫБРАНО':isOwned?'КУПЛЕНО':'ЗАКРЫТО';
          const priceText=item.price?formatCredits(item.price)+' CR':'FREE';
          const shortfallText=!isOwned&&shortfall>0?`<div class="item-shortfall">ЕЩЁ ${formatCredits(shortfall)} CR</div>`:'';
          const buttonText=isSelected?'ВЫБРАНО':isOwned?'ВЫБРАТЬ':'КУПИТЬ — '+formatCredits(item.price)+' CR';
          const premium=item.premium?'<span class="premium-badge">PREMIUM</span>':'';
          return `<article class="shop-item ${isSelected?'selected':''} ${item.premium?'premium':''}" data-item="${id}">${premium}<button type="button" class="item-preview" aria-label="Предпросмотр ${item.name}"><canvas width="280" height="112"></canvas></button><div class="item-title">${item.name}</div><div class="item-price"><strong>${priceText}</strong><span>${status}</span></div>${shortfallText}<button type="button" class="purchase-btn ${isSelected?'equipped':''}" ${isSelected?'disabled':''}>${buttonText}</button></article>`;
        }).join('');
      }
      this.cards=Array.from($('shopItems').querySelectorAll('.shop-item')).map(el=>{const car=new R.Car();car.x=155;car.y=56;car.speed=280;car.throttleVisual=1;car.setLoadout(isCars?el.dataset.item:this.previewLivery,isCars?this.previewEffect:el.dataset.item,'thumbnail');return {car,canvas:el.querySelector('canvas')};});
      if(!this.categoryEmpty)this.car.setLoadout(this.previewLivery,this.previewEffect,'preview');
      if(this.categoryEmpty){
        $('previewName').textContent=(R.CAR_CATEGORIES&&R.CAR_CATEGORIES[this.category]||this.category).toUpperCase();$('previewEffect').textContent='НОВЫЕ МОДЕЛИ ГОТОВЯТСЯ';
      }else{
        $('previewName').textContent=R.LIVERIES[this.previewLivery].name;$('previewEffect').textContent=R.EFFECTS[this.previewEffect].name;
      }
    }
    draw(dt){
      const canvas=$('garagePreview'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,560,360);
      ctx.strokeStyle='rgba(141,255,73,.12)';ctx.lineWidth=1;
      for(let y=45;y<350;y+=38){ctx.beginPath();ctx.moveTo(20,y);ctx.lineTo(540,y);ctx.stroke();}
      ctx.strokeStyle='rgba(141,255,73,.3)';ctx.beginPath();ctx.ellipse(280,190,210,105,0,0,Math.PI*2);ctx.stroke();
      if(!this.categoryEmpty){this.car.effectTime+=dt;this.car.draw(ctx,3.8);}
      for(const item of this.cards){const c=item.canvas.getContext('2d');c.clearRect(0,0,280,112);item.car.effectTime+=dt;item.car.draw(c,2.1);}
    }
  }
  R.Garage=Garage;
})();
