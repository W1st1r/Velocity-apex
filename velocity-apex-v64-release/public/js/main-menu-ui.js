(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const moreBtn=$('menuMoreBtn');
  const panel=$('menuMorePanel');
  const closeBtn=$('menuMoreClose');
  if(!moreBtn||!panel)return;

  const isOpen=()=>!panel.classList.contains('hidden');
  function setOpen(open){
    panel.classList.toggle('hidden',!open);
    panel.setAttribute('aria-hidden',open?'false':'true');
    moreBtn.setAttribute('aria-expanded',open?'true':'false');
    moreBtn.classList.toggle('active',open);
  }
  function close(){setOpen(false);}
  function toggle(){setOpen(!isOpen());}

  moreBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle();});
  closeBtn?.addEventListener('click',e=>{e.preventDefault();close();});
  for(const id of ['promoBtn','supportBtn','staffAdminBtn']){
    $(id)?.addEventListener('click',close);
  }
  document.addEventListener('click',e=>{
    if(isOpen()&&!panel.contains(e.target)&&!moreBtn.contains(e.target))close();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen())close();});

  window.VelocityMainMenu={openMore:()=>setOpen(true),closeMore:close};
})();
