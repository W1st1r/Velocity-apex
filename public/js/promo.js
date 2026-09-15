(function(){
  'use strict';
  const $=id=>document.getElementById(id),R=window.Racing||{};
  const btn=$('promoBtn'),screen=$('promo'),closeBtn=$('promoCloseBtn'),form=$('promoForm'),input=$('promoCode'),submit=$('promoRedeemBtn'),message=$('promoMessage'),menu=$('menu');
  if(!btn||!screen||!form)return;
  const errors={AUTH_REQUIRED:'Сессия истекла. Войдите в аккаунт снова.',PROMO_INVALID:'Проверьте формат промокода.',PROMO_NOT_FOUND:'Такого промокода нет.',PROMO_DISABLED:'Промокод сейчас отключён.',PROMO_NOT_STARTED:'Промокод ещё не начал действовать.',PROMO_EXPIRED:'Срок действия промокода истёк.',PROMO_ALREADY_USED:'Вы уже активировали этот промокод.',PROMO_LIMIT_REACHED:'Лимит активаций этого промокода исчерпан.',SAVE_CONFLICT:'Профиль обновился на другом устройстве. Повторите активацию.',SERVER_ERROR:'Ошибка сервера. Повторите попытку.'};
  function setMessage(text,bad=false){message.textContent=text;message.classList.toggle('bad',bad);message.classList.toggle('good',!bad&&!!text);}
  function open(){if(!window.VelocityAccount?.authenticated){setMessage('Сначала войдите в аккаунт.',true);return;}menu?.classList.add('hidden');screen.classList.remove('hidden');screen.setAttribute('aria-hidden','false');setMessage('Один промокод можно активировать на аккаунте только один раз.');setTimeout(()=>input.focus(),40);}
  function close(){screen.classList.add('hidden');screen.setAttribute('aria-hidden','true');menu?.classList.remove('hidden');}
  async function api(path,options={}){const res=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},...options});let data={};try{data=await res.json();}catch{}if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';throw e;}return data;}
  function rewardText(reward={}){
    const parts=[];if(reward.credits)parts.push(Number(reward.credits).toLocaleString('ru-RU')+' CR');
    for(const id of reward.cars||[])parts.push('машина '+(R.LIVERIES?.[id]?.name||id));
    for(const id of reward.effects||[])parts.push('эффект '+(R.EFFECTS?.[id]?.name||id));
    for(const [id,qty] of Object.entries(reward.cases||{}))parts.push((R.CASES?.[id]?.name||id)+' ×'+qty);
    return parts.join(' · ')||'награда';
  }
  async function redeem(e){
    e.preventDefault();const code=String(input.value||'').trim().toUpperCase().replace(/\s+/g,'');input.value=code;if(!code){setMessage('Введите промокод.',true);return;}
    submit.disabled=true;setMessage('ПРОВЕРЯЕМ ПРОМОКОД…');
    try{const data=await api('/api/promocodes/redeem',{method:'POST',body:JSON.stringify({code})});await window.VelocityAccount?.refreshCloud?.();setMessage('ПОЛУЧЕНО: '+rewardText(data.reward),false);input.value='';}
    catch(err){setMessage(errors[err.code]||'Не удалось активировать промокод.',true);}
    finally{submit.disabled=false;}
  }
  input.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32);});
  btn.addEventListener('click',open);closeBtn.addEventListener('click',close);form.addEventListener('submit',redeem);screen.addEventListener('click',e=>{if(e.target===screen)close();});addEventListener('keydown',e=>{if(e.key==='Escape'&&!screen.classList.contains('hidden'))close();});
  window.VelocityPromo={open,close};
})();
