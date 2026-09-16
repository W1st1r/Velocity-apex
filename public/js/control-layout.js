(function(){
  'use strict';

  const STORAGE_KEY='velocityApex.controlLayout.v1';
  const KEYS=['left','right','wheel','brake','handbrake','gas'];
  const DEFAULT_LAYOUT={
    left:{x:.065,y:.835,scale:1},
    right:{x:.145,y:.835,scale:1},
    wheel:{x:.105,y:.825,scale:1},
    handbrake:{x:.795,y:.855,scale:1},
    brake:{x:.875,y:.835,scale:1},
    gas:{x:.955,y:.81,scale:1}
  };
  const LABELS={left:'СТРЕЛКА ◀',right:'СТРЕЛКА ▶',wheel:'РУЛЬ',brake:'BRAKE',handbrake:'РУЧНИК / HB',gas:'GAS'};
  const $=id=>document.getElementById(id);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  let savedLayout=readLayout();
  let workingLayout=clone(savedLayout?.layout||DEFAULT_LAYOUT);
  let selectedKey='gas';
  let opened=false;
  let changed=false;
  let beforeOpen=null;
  let pointerId=null;
  let dragKey=null;

  function sanitizeLayout(raw){
    const source=raw&&typeof raw==='object'?raw:{};
    const result={};
    for(const key of KEYS){
      const fallback=DEFAULT_LAYOUT[key];
      const item=source[key]&&typeof source[key]==='object'?source[key]:{};
      result[key]={
        x:clamp(Number.isFinite(Number(item.x))?Number(item.x):fallback.x,.025,.975),
        y:clamp(Number.isFinite(Number(item.y))?Number(item.y):fallback.y,.06,.96),
        scale:clamp(Number.isFinite(Number(item.scale))?Number(item.scale):fallback.scale,.60,1.60)
      };
    }
    return result;
  }

  function readLayout(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!parsed||![1,2].includes(parsed.version)||!parsed.layout)return null;
      return {version:2,layout:sanitizeLayout(parsed.layout)};
    }catch(_){return null;}
  }

  function writeLayout(layout){
    const safe=sanitizeLayout(layout);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,layout:safe}));}catch(_){}
    savedLayout={version:2,layout:safe};
    return safe;
  }

  function removeLayout(){
    try{localStorage.removeItem(STORAGE_KEY);}catch(_){}
    savedLayout=null;
  }

  function mapRuntimeControls(){
    const race={
      left:$('leftBtn'),right:$('rightBtn'),wheel:$('steeringWheel'),brake:$('brakeBtn'),handbrake:$('handbrakeBtn'),gas:$('gasBtn')
    };
    const freeRoot=$('freeMobileControls');
    const free={};
    if(freeRoot)for(const key of KEYS)free[key]=freeRoot.querySelector('[data-control="'+key+'"]');
    return {race,free};
  }

  function clearElementStyles(el){
    if(!el)return;
    el.removeAttribute('data-layout-key');
    el.style.removeProperty('--control-x');
    el.style.removeProperty('--control-y');
    el.style.removeProperty('--control-scale');
  }

  function styleElement(el,key,item){
    if(!el)return;
    el.dataset.layoutKey=key;
    el.style.setProperty('--control-x',(item.x*100).toFixed(3)+'vw');
    el.style.setProperty('--control-y',(item.y*100).toFixed(3)+'dvh');
    el.style.setProperty('--control-scale',item.scale.toFixed(3));
  }

  function apply(layout=savedLayout?.layout,force=false){
    const roots=mapRuntimeControls();
    const enabled=!!layout||force;
    const raceRoot=$('controls'),freeRoot=$('freeMobileControls');
    raceRoot?.classList.toggle('control-layout-custom',enabled);
    freeRoot?.classList.toggle('control-layout-custom',enabled);
    if(!enabled){
      for(const key of KEYS){clearElementStyles(roots.race[key]);clearElementStyles(roots.free[key]);}
      return;
    }
    const safe=sanitizeLayout(layout||workingLayout);
    for(const key of KEYS){styleElement(roots.race[key],key,safe[key]);styleElement(roots.free[key],key,safe[key]);}
  }

  function editorNodes(){return Array.from(document.querySelectorAll('#controlLayoutStage [data-layout-control]'));}

  function previewBaseSize(key){
    if(key==='gas')return 78;
    if(key==='wheel')return 98;
    if(key==='handbrake')return 52;
    if(key==='brake')return 60;
    return 66;
  }

  function currentMode(){
    try{const raw=JSON.parse(localStorage.getItem('velocityApex.v1')||'{}');return ['arrows','tilt','wheel'].includes(raw?.controlMode)?raw.controlMode:'arrows';}catch(_){return 'arrows';}
  }

  function activeKeys(){
    const mode=currentMode();if(mode==='wheel')return ['wheel','brake','handbrake','gas'];if(mode==='tilt')return ['brake','handbrake','gas'];return ['left','right','brake','handbrake','gas'];
  }

  function renderEditor(){
    const stage=$('controlLayoutStage');
    if(!stage)return;
    const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),visible=new Set(activeKeys());
    if(!visible.has(selectedKey))selectedKey=visible.has('gas')?'gas':Array.from(visible)[0];
    for(const node of editorNodes()){
      const key=node.dataset.layoutControl,item=workingLayout[key];if(!item)continue;
      node.classList.toggle('hidden',!visible.has(key));
      node.style.left=(item.x*w)+'px';node.style.top=(item.y*h)+'px';
      node.style.setProperty('--editor-scale',item.scale.toFixed(3));
      node.classList.toggle('selected',key===selectedKey);
      node.setAttribute('aria-pressed',key===selectedKey?'true':'false');
    }
    const value=$('controlSizeValue'),range=$('controlSizeRange'),label=$('controlLayoutSelected');
    const item=workingLayout[selectedKey]||DEFAULT_LAYOUT[selectedKey];
    if(value)value.textContent=Math.round(item.scale*100)+'%';
    if(range)range.value=String(Math.round(item.scale*100));
    if(label)label.textContent=LABELS[selectedKey]||selectedKey.toUpperCase();
    const status=$('controlLayoutStatus');
    if(status)status.textContent=changed?'ИЗМЕНЕНИЯ НЕ СОХРАНЕНЫ':'ПЕРЕТАЩИТЕ КНОПКУ В НУЖНОЕ МЕСТО';
  }

  function setSelected(key){
    if(!KEYS.includes(key)||!activeKeys().includes(key))return;
    selectedKey=key;renderEditor();
  }

  function moveKeyToClient(key,clientX,clientY){
    const item=workingLayout[key];if(!item)return;
    const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);
    const approx=(previewBaseSize(key)*item.scale)/2;
    const safeX=Math.max(18,approx+6),safeY=Math.max(18,approx+6);
    item.x=clamp(clientX/w,safeX/w,1-safeX/w);
    item.y=clamp(clientY/h,safeY/h,1-safeY/h);
    changed=true;
    apply(workingLayout,true);
    renderEditor();
  }

  function startDrag(event,node){
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    dragKey=node.dataset.layoutControl;pointerId=event.pointerId;setSelected(dragKey);
    try{node.setPointerCapture(pointerId);}catch(_){}
    moveKeyToClient(dragKey,event.clientX,event.clientY);
  }

  function moveDrag(event){
    if(pointerId===null||event.pointerId!==pointerId||!dragKey)return;
    event.preventDefault();moveKeyToClient(dragKey,event.clientX,event.clientY);
  }

  function endDrag(event){
    if(pointerId===null||event.pointerId!==pointerId)return;
    if(event.cancelable)event.preventDefault();pointerId=null;dragKey=null;
  }

  function bindEditor(){
    const openBtn=$('controlLayoutOpenBtn'),editor=$('controlLayoutEditor'),saveBtn=$('controlLayoutSaveBtn'),cancelBtn=$('controlLayoutCancelBtn'),resetBtn=$('controlLayoutResetBtn');
    if(!openBtn||!editor)return;
    openBtn.addEventListener('click',openEditor);
    saveBtn?.addEventListener('click',saveAndClose);
    cancelBtn?.addEventListener('click',cancelAndClose);
    resetBtn?.addEventListener('click',resetWorking);
    $('controlSizeMinus')?.addEventListener('click',()=>adjustSize(-.05));
    $('controlSizePlus')?.addEventListener('click',()=>adjustSize(.05));
    $('controlSizeRange')?.addEventListener('input',event=>setScale(Number(event.target.value)/100));
    for(const node of editorNodes()){
      node.addEventListener('pointerdown',event=>startDrag(event,node),{passive:false});
      node.addEventListener('pointermove',moveDrag,{passive:false});
      node.addEventListener('pointerup',endDrag,{passive:false});
      node.addEventListener('pointercancel',endDrag,{passive:false});
      node.addEventListener('lostpointercapture',endDrag,{passive:false});
      node.addEventListener('click',event=>{event.preventDefault();setSelected(node.dataset.layoutControl);});
      node.addEventListener('contextmenu',event=>event.preventDefault());
    }
    addEventListener('resize',()=>{if(opened)renderEditor();},{passive:true});
    addEventListener('orientationchange',()=>setTimeout(()=>{if(opened)renderEditor();},120),{passive:true});
  }

  function openEditor(){
    if(opened)return;
    opened=true;changed=false;pointerId=null;dragKey=null;
    beforeOpen=savedLayout?clone(savedLayout.layout):null;
    workingLayout=clone(savedLayout?.layout||DEFAULT_LAYOUT);if(!activeKeys().includes(selectedKey))selectedKey='gas';
    const settings=$('settings'),editor=$('controlLayoutEditor');
    settings?.classList.add('layout-editing');
    editor?.classList.remove('hidden');
    editor?.setAttribute('aria-hidden','false');
    document.body.classList.add('control-layout-editing');
    renderEditor();
  }

  function closeEditor(){
    opened=false;pointerId=null;dragKey=null;
    $('settings')?.classList.remove('layout-editing');
    $('controlLayoutEditor')?.classList.add('hidden');
    $('controlLayoutEditor')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('control-layout-editing');
  }

  function saveAndClose(){
    if(changed){workingLayout=writeLayout(workingLayout);apply(workingLayout);}
    else apply(savedLayout?.layout);
    closeEditor();
  }

  function cancelAndClose(){
    if(beforeOpen){workingLayout=clone(beforeOpen);apply(beforeOpen);}else{workingLayout=clone(DEFAULT_LAYOUT);apply(null);}
    closeEditor();
  }

  function resetWorking(){
    workingLayout=clone(DEFAULT_LAYOUT);changed=true;
    const status=$('controlLayoutStatus');if(status)status.textContent='СТАНДАРТНАЯ РАСКЛАДКА';
    apply(workingLayout,true);renderEditor();
  }

  function setScale(value){
    const item=workingLayout[selectedKey];if(!item)return;
    item.scale=clamp(Number(value)||1,.60,1.60);changed=true;apply(workingLayout,true);renderEditor();
  }
  function adjustSize(delta){const item=workingLayout[selectedKey];if(item)setScale(item.scale+delta);}

  function restoreDefaults(){
    removeLayout();workingLayout=clone(DEFAULT_LAYOUT);apply(null);renderEditor();
  }

  // Reset button intentionally returns to the game's responsive factory layout after save.
  // A second click while already at factory defaults keeps the editor preview useful.
  $('controlLayoutFactoryBtn')?.addEventListener('click',restoreDefaults);

  bindEditor();
  apply(savedLayout?.layout);

  window.VelocityControlLayout={
    open:openEditor,
    apply:()=>apply(savedLayout?.layout),
    reset:()=>{removeLayout();workingLayout=clone(DEFAULT_LAYOUT);apply(null);},
    get:()=>savedLayout?clone(savedLayout.layout):null,
    storageKey:STORAGE_KEY
  };
})();
