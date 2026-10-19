(function(){
  'use strict';
  const q=new URLSearchParams(location.search),mode=q.get('mode'),token=location.hash.slice(1);
  const form=document.getElementById('form'),title=document.getElementById('title'),intro=document.getElementById('intro'),message=document.getElementById('message');
  const clearToken=()=>history.replaceState(null,'',location.pathname+location.search);
  const show=(text,error=false)=>{message.textContent=text;message.classList.toggle('error',error);};
  async function post(path,body){let r;try{r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}catch{throw new Error('NETWORK');}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'NETWORK');return d;}
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)){show('Ссылка отсутствует или недействительна. Запросите новую инструкцию.',true);}
  else if(mode==='verify'){
    title.textContent='ПОДТВЕРЖДЕНИЕ EMAIL';intro.textContent='Проверяем одноразовую ссылку…';
    post('/api/auth/email/verify',{token}).then(()=>{clearToken();show('Email подтверждён. Теперь вы можете использовать его для восстановления пароля.');}).catch(e=>{if(e.message==='NETWORK'){show('Нет подключения. Проверьте интернет и обновите эту страницу, чтобы повторить подтверждение.',true);return;}clearToken();show(e.message==='RATE_LIMITED'?'Слишком много попыток. Повторите позже.':'Ссылка истекла, уже использована или адрес уже привязан к другому аккаунту. Войдите в игру и запросите новое письмо.',true);});
  }else if(mode==='reset'){
    title.textContent='ВОССТАНОВЛЕНИЕ ДОСТУПА';intro.textContent='Установите новый пароль. После смены все активные сессии будут завершены.';form.hidden=false;
    form.addEventListener('submit',async e=>{e.preventDefault();const p=document.getElementById('password').value,c=document.getElementById('confirm').value,button=document.getElementById('submit');if(p!==c){show('Пароли не совпадают.',true);return;}button.disabled=true;try{await post('/api/auth/password/reset',{token,password:p});clearToken();form.hidden=true;show('Пароль изменён. Все активные сессии завершены. Вернитесь в игру и войдите с новым паролем.');}catch(err){if(err.message==='NETWORK'){show('Нет подключения. Пароль не изменён. Проверьте интернет и повторите попытку.',true);}else{clearToken();show(err.message==='INVALID_PASSWORD'?'Пароль должен содержать 8–128 символов.':'Ссылка недействительна, истекла или уже использована. Запросите восстановление заново.',true);}}finally{button.disabled=false;}});
  }else show('Тип ссылки неизвестен. Вернитесь в игру и запросите инструкцию заново.',true);
})();
