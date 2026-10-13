/* Velocity Apex Race Control V66: preserved handlers and live local car preview. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const menu=$('menu'),moreBtn=$('menuMoreBtn'),panel=$('menuMorePanel');
  if(!menu||!moreBtn||!panel)return;
  const setOpen=open=>{
    panel.classList.toggle('hidden',!open);
    panel.setAttribute('aria-hidden',open?'false':'true');
    moreBtn.setAttribute('aria-expanded',open?'true':'false');
    moreBtn.classList.toggle('active',open);
  };
  $('menuRailPlay')?.addEventListener('click',()=>{$('playBtn')?.click();});
  moreBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setOpen(panel.classList.contains('hidden'));});
  $('menuMoreClose')?.addEventListener('click',e=>{e.stopPropagation();setOpen(false);});
  for(const id of ['promoBtn','supportBtn','staffAdminBtn','crewBtn']) $(id)?.addEventListener('click',()=>setOpen(false));
  document.addEventListener('click',e=>{if(!panel.classList.contains('hidden')&&!panel.contains(e.target)&&!moreBtn.contains(e.target))setOpen(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
  window.VelocityMainMenu={openMore:()=>setOpen(true),closeMore:()=>setOpen(false)};

  const carImage=$('raceMenuCarImage'),carHolder=carImage?.parentElement,carName=$('raceMenuCarName');
  let selected='',lastLoaded='',lastProfile=0;
  const safeAsset=url=>{
    if(typeof url!=='string'||!url)return '/assets/cars/apex-lime-menu.svg';
    if(!/^assets\/cars\/[a-zA-Z0-9._-]+\.(?:webp|png|svg)$/.test(url))return '/assets/cars/apex-lime-menu.svg';
    return '/'+url;
  };
  carImage?.addEventListener('error',()=>carHolder?.classList.add('is-fallback'));
  carImage?.addEventListener('load',()=>carHolder?.classList.remove('is-fallback'));
  function refreshCar(){
    if(menu.classList.contains('hidden'))return;
    let save={};try{save=JSON.parse(localStorage.getItem('velocityApex.v1')||'{}');}catch{}
    const id=String(save.selectedLivery||'apexLime'),r=window.Racing,meta=r?.LIVERIES?.[id];
    if(!meta&&!r)return;
    const src=safeAsset(meta?.sprite?.src||'assets/cars/apex-lime-menu.svg');
    if(id!==selected||src!==lastLoaded){
      selected=id;lastLoaded=src;
      if(carImage)carImage.src=src;
      if(carName)carName.textContent=meta?.name||'APEX LIME';
    }
  }
  async function refreshAccount(){
    if(menu.classList.contains('hidden')||Date.now()-lastProfile<25000)return;
    lastProfile=Date.now();
    try{
      const res=await fetch('/api/upgrade/profile',{credentials:'same-origin',cache:'no-store'});
      if(!res.ok)return;
      const d=await res.json();if(d.profile&&$('raceAccountLevel'))$('raceAccountLevel').textContent=String(d.profile.level);
    }catch{}
  }
  const refresh=()=>{refreshCar();refreshAccount();};
  // V66: no 1.4-second polling while the full-screen menu is closed.
  // Refresh immediately when returning from another section, and periodically only while visible.
  const menuVisibilityObserver=new MutationObserver(()=>{
    if(!menu.classList.contains('hidden'))refresh();
  });
  menuVisibilityObserver.observe(menu,{attributes:true,attributeFilter:['class']});
  setInterval(()=>{if(!menu.classList.contains('hidden'))refresh();},12000);
  addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  document.addEventListener('velocity-account-updated',refresh);
  refresh();
})();
