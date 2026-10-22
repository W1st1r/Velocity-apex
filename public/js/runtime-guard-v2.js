(function(){
  'use strict';
  const root=document.getElementById('runtimeFailure');
  const retryButton=document.getElementById('runtimeFailureRetry');
  const backButton=document.getElementById('runtimeFailureBack');
  const transition=document.getElementById('apexSpeedTransition');
  if(!root||!retryButton||!backButton)return;
  let actions=null;
  function close(){root.classList.add('hidden');root.setAttribute('aria-hidden','true');actions=null;}
  async function run(action){
    const callback=actions?.[action];if(!callback)return;
    retryButton.disabled=true;backButton.disabled=true;
    try{await callback();close();}
    catch{root.classList.remove('hidden');root.setAttribute('aria-hidden','false');}
    finally{retryButton.disabled=false;backButton.disabled=false;}
  }
  retryButton.addEventListener('click',()=>run('retry'));
  backButton.addEventListener('click',()=>run('back'));
  window.VelocityRuntimeGuard=Object.freeze({
    show({retry,back}={}){actions={retry,back};root.classList.remove('hidden');root.setAttribute('aria-hidden','false');try{retryButton.focus({preventScroll:true});}catch{}},
    close
  });
  let transitionTimer=0,transitionGeneration=0;
  window.VelocitySpeedTransition=Object.freeze({play(){
    if(!transition||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const generation=++transitionGeneration;clearTimeout(transitionTimer);transition.classList.remove('hidden');transition.classList.remove('running');void transition.offsetWidth;transition.classList.add('running');
    transitionTimer=setTimeout(()=>{if(generation!==transitionGeneration)return;transition.classList.remove('running');transition.classList.add('hidden');},300);
  }});
})();
