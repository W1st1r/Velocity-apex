(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const root=$('friends'),list=$('friendsList'),message=$('friendsMessage'),count=$('friendsCount'),menuStatus=$('friendsMenuStatus');
  const requestSection=$('friendRequestsSection'),requestList=$('friendRequestsList'),requestCount=$('friendRequestsCount');
  const outgoingSection=$('friendOutgoingSection'),outgoingList=$('friendOutgoingList'),outgoingCount=$('friendOutgoingCount');
  if(!root)return;

  let friends=[],incomingRequests=[],outgoingRequests=[],busy=false;

  async function api(path,opts={}){
    const r=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json',...(opts.headers||{})},...opts});
    let d={};try{d=await r.json();}catch{}
    if(!r.ok){const e=new Error(d.error||'SERVER_ERROR');e.code=d.error||'SERVER_ERROR';e.data=d;throw e;}
    return d;
  }

  const statusText=f=>f.online?'ОНЛАЙН':(f.lastSeenAt?('БЫЛ(А) '+new Date(f.lastSeenAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})):'ОФЛАЙН');
  const initials=f=>(f.displayName||f.username||'VA').slice(0,2).toUpperCase();

  function clearMessage(){message.textContent='';message.className='account-message';}
  function setMessage(text,bad=false){message.textContent=text;message.className='account-message'+(bad?' bad':'');}

  function requestRow(r,kind){
    const row=document.createElement('div');row.className='friend-row friend-request-row';
    const avatar=document.createElement('span');avatar.className='friend-avatar';avatar.textContent=initials(r);
    const copy=document.createElement('div');copy.className='friend-copy';
    const n=document.createElement('strong');n.textContent=r.displayName||r.username;
    const u=document.createElement('small');u.textContent='@'+r.username;
    copy.append(n,u);
    const state=document.createElement('span');state.className='friend-request-state';state.textContent=kind==='incoming'?'ХОЧЕТ ДОБАВИТЬ В ДРУЗЬЯ':'ОЖИДАЕТ ОТВЕТА';
    const actions=document.createElement('div');actions.className='friend-request-actions';
    if(kind==='incoming'){
      const accept=document.createElement('button');accept.type='button';accept.className='friend-request-accept';accept.textContent='ПРИНЯТЬ';accept.addEventListener('click',()=>respond(r.requestId,'accept'));
      const decline=document.createElement('button');decline.type='button';decline.className='friend-request-decline';decline.textContent='ОТКЛОНИТЬ';decline.addEventListener('click',()=>respond(r.requestId,'decline'));
      actions.append(accept,decline);
    }else{
      const cancel=document.createElement('button');cancel.type='button';cancel.className='friend-request-decline';cancel.textContent='ОТМЕНИТЬ';cancel.addEventListener('click',()=>respond(r.requestId,'cancel'));
      actions.append(cancel);
    }
    row.append(avatar,copy,state,actions);return row;
  }

  function render(){
    list.replaceChildren();requestList?.replaceChildren();outgoingList?.replaceChildren();
    const online=friends.filter(f=>f.online).length;
    count.textContent=`${friends.length} друзей · ${online} онлайн`;
    menuStatus.textContent=incomingRequests.length?`${incomingRequests.length} ЗАЯВ.`:(online?`${online} ОНЛАЙН`:String(friends.length||'—'));

    if(requestSection){requestSection.classList.toggle('hidden',!incomingRequests.length);requestCount.textContent=String(incomingRequests.length);for(const r of incomingRequests)requestList.appendChild(requestRow(r,'incoming'));}
    if(outgoingSection){outgoingSection.classList.toggle('hidden',!outgoingRequests.length);outgoingCount.textContent=String(outgoingRequests.length);for(const r of outgoingRequests)outgoingList.appendChild(requestRow(r,'outgoing'));}

    if(!friends.length){
      const e=document.createElement('div');e.className='friends-empty';e.innerHTML='<strong>СПИСОК ПОКА ПУСТ</strong><span>Найдите игрока по @username и отправьте приглашение.</span>';list.appendChild(e);return;
    }
    for(const f of [...friends].sort((a,b)=>Number(b.online)-Number(a.online)||a.username.localeCompare(b.username))){
      const row=document.createElement('div');row.className='friend-row';
      const avatar=document.createElement('span');avatar.className='friend-avatar';avatar.textContent=initials(f);
      const copy=document.createElement('div');copy.className='friend-copy';
      const n=document.createElement('strong');n.textContent=f.displayName;
      const u=document.createElement('small');u.textContent='@'+f.username;copy.append(n,u);
      const s=document.createElement('span');s.className='friend-status '+(f.online?'online':'offline');s.textContent=statusText(f);
      const remove=document.createElement('button');remove.type='button';remove.className='friend-remove';remove.textContent='УДАЛИТЬ';remove.addEventListener('click',()=>removeFriend(f.username));
      row.append(avatar,copy,s,remove);list.appendChild(row);
    }
  }

  async function load(silent=false){
    try{
      const d=await api('/api/friends');
      friends=d.friends||[];incomingRequests=d.incomingRequests||[];outgoingRequests=d.outgoingRequests||[];
      render();if(!silent)clearMessage();
    }catch(e){
      if(!silent)setMessage(e.code==='AUTH_REQUIRED'?'Войдите в аккаунт, чтобы использовать друзей.':'Не удалось загрузить друзей.',true);
    }
  }

  async function invite(){
    if(busy)return;
    const input=$('friendUsername'),username=input.value.trim().replace(/^@/,'').toLowerCase();
    if(!username){setMessage('Введите ник игрока.',true);return;}
    busy=true;$('friendAddBtn').disabled=true;
    try{
      await api('/api/friends/request',{method:'POST',body:JSON.stringify({username})});
      input.value='';setMessage(`Приглашение отправлено @${username}.`);await load(true);
    }catch(e){
      const map={USER_NOT_FOUND:'Игрок не найден.',ALREADY_FRIENDS:'Этот игрок уже у вас в друзьях.',CANNOT_ADD_SELF:'Нельзя отправить приглашение самому себе.',REQUEST_ALREADY_SENT:'Приглашение уже отправлено.',REQUEST_ALREADY_RECEIVED:'Этот игрок уже отправил вам заявку. Примите или отклоните её ниже.',AUTH_REQUIRED:'Нужен вход в аккаунт.',INVALID_USERNAME:'Проверьте ник игрока.'};
      setMessage(map[e.code]||'Не удалось отправить приглашение.',true);
      if(e.code==='REQUEST_ALREADY_RECEIVED')await load(true);
    }finally{busy=false;$('friendAddBtn').disabled=false;}
  }

  async function respond(requestId,action){
    if(busy)return;busy=true;
    try{
      await api(`/api/friends/${action}`,{method:'POST',body:JSON.stringify({requestId})});
      setMessage(action==='accept'?'Заявка принята. Игрок добавлен в друзья.':action==='decline'?'Заявка отклонена.':'Приглашение отменено.');
      await load(true);
    }catch(e){setMessage(e.code==='REQUEST_NOT_FOUND'?'Заявка уже недоступна.':'Не удалось выполнить действие.',true);await load(true);}
    finally{busy=false;}
  }

  async function removeFriend(username){
    try{await api('/api/friends/remove',{method:'POST',body:JSON.stringify({username})});friends=friends.filter(f=>f.username!==username);render();setMessage(`@${username} удалён из друзей.`);}
    catch{setMessage('Не удалось удалить друга.',true);}
  }

  function open(){root.classList.remove('hidden');root.setAttribute('aria-hidden','false');$('menu')?.classList.add('hidden');load();}
  function close(){root.classList.add('hidden');root.setAttribute('aria-hidden','true');$('menu')?.classList.remove('hidden');}

  $('friendsBtn')?.addEventListener('click',open);
  $('friendsCloseBtn')?.addEventListener('click',close);
  $('friendAddBtn')?.addEventListener('click',invite);
  $('friendUsername')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();invite();}});
  root.addEventListener('click',e=>{if(e.target===root)close();});

  async function presence(){try{await api('/api/friends/presence',{method:'POST',body:'{}'});await load(true);}catch{}}
  setInterval(presence,45000);
  setTimeout(()=>{load(true);presence();},1500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)presence();});

  window.VelocityFriends={open,close,load,get list(){return friends;},get requests(){return incomingRequests;}};
})();
