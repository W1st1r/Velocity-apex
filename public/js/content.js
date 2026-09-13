(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  const points=a=>a.map(([x,y])=>({x,y}));
  R.TRACKS={
    apexCircuit:{id:'apexCircuit',name:'APEX CIRCUIT',type:'TECHNICAL',description:'Классический автодром · точность и темп',roadWidth:214,
      points:points([[-1240,55],[-1110,-575],[-585,-850],[55,-815],[670,-890],[1210,-555],[1370,-25],[1155,490],[625,775],[45,705],[-445,790],[-925,565],[-1305,300]]),
      scenery:{grandstands:[[.005,-1,1.25,1],[.43,1,.72,0],[.72,-1,.66,0]],spectators:[[.24,1],[.58,-1]],pitSide:-1},
      theme:{kind:'circuit',ground:'#174e2d',road:'#34383a',curb:'#e94b49',barrier:'#d5d9d6',accent:'#8dff49',surface:'grass',drag:1,dust:'#a8d66f'}},
    neonHarbor:{id:'neonHarbor',name:'NEON HARBOR',type:'STREET / NIGHT',description:'Ночной порт · прямая, шикана, поздний тормоз',targetLength:5400,roadWidth:204,
      points:points([[-620,-505],[150,-520],[610,-485],[755,-305],[765,65],[555,195],[570,365],[205,500],[-250,500],[-405,325],[-650,275],[-790,65],[-765,-295]]),
      scenery:{grandstands:[[.01,1,1.0,1],[.49,-1,.62,0]],spectators:[[.22,-1],[.73,1]],pitSide:1},
      theme:{kind:'neon',ground:'#111c30',road:'#252c3c',curb:'#31cfea',barrier:'#8866ec',accent:'#53dfff',surface:'runoff',drag:.65,dust:'#87a4c3'}},
    desertCanyon:{id:'desertCanyon',name:'DESERT CANYON',type:'HIGH SPEED',description:'Каньон · максимальная скорость и шпилька',targetLength:9600,roadWidth:230,
      points:points([[-1500,-670],[-500,-670],[700,-670],[1570,-590],[1790,-360],[1570,-100],[740,-70],[550,220],[970,530],[590,800],[-110,690],[-750,850],[-1420,650],[-1680,130]]),
      scenery:{grandstands:[[.008,-1,.88,1],[.45,1,.72,0]],spectators:[[.46,1]],pitSide:-1},
      theme:{kind:'desert',ground:'#b77c4b',road:'#353331',curb:'#eb9d56',barrier:'#f1ce9a',accent:'#ffac64',surface:'sand',drag:1.55,dust:'#e9be7e'}},
    alpineRing:{id:'alpineRing',name:'ALPINE RING',type:'MOUNTAIN / EXPERT',description:'Горные S-связки · две шпильки',targetLength:6700,roadWidth:202,
      points:points([[-700,-650],[0,-650],[600,-650],[810,-450],[640,-210],[100,-250],[-120,-60],[220,110],[610,40],[810,270],[580,550],[10,490],[-320,650],[-760,510],[-820,260],[-500,80],[-720,-120],[-970,-260],[-980,-510]]).map(p=>({x:p.x*.9,y:p.y*1.2})),
      scenery:{grandstands:[[.006,1,.82,1],[.56,-1,.58,0]],spectators:[[.31,1],[.76,-1]],pitSide:1},
      theme:{kind:'alpine',ground:'#465e5c',road:'#343d42',curb:'#a6c5d1',barrier:'#eef5f6',accent:'#b5e5ff',surface:'grass',drag:1.1,dust:'#b9cec6'}},
    coastlineGT:{id:'coastlineGT',name:'COASTLINE GT',type:'GRAND TOURING',description:'Морская дуга · быстрые связки и длинный разгон',targetLength:8400,roadWidth:222,
      points:points([[-1205,-650],[-300,-660],[745,-650],[1190,-415],[1440,25],[1255,525],[810,835],[225,900],[-290,735],[-385,410],[-760,390],[-1020,600],[-1360,420],[-1460,85],[-1235,-210]]),
      scenery:{grandstands:[[.006,1,.95,1],[.34,-1,.72,1]],spectators:[[.62,1]],pitSide:1},
      theme:{kind:'coast',ground:'#227b8a',road:'#384144',curb:'#55c3cc',barrier:'#e2e9df',accent:'#5fe4da',surface:'sand',drag:1.25,dust:'#e4d4af'}}
  };
  R.CAR_CATEGORIES={regular:'Обычные',sport:'Спорт',premium:'Премиум'};
  R.LIVERIES={
    apexLime:{name:'APEX LIME',price:0,category:'regular',primary:'#80ff44',secondary:'#f5f5ed',accent:'#183b24',stripe:'#eaffdf'},
    crimsonVelocity:{name:'CRIMSON VELOCITY',price:1400,category:'regular',primary:'#f3274f',secondary:'#20242c',accent:'#ffffff',stripe:'#f6ecec'},
    iceVector:{name:'ICE VECTOR',price:3200,category:'regular',primary:'#36d5ff',secondary:'#f0faff',accent:'#173f75',stripe:'#173f75'},
    auroraPulse:{name:'AURORA PULSE',price:6500,category:'regular',primary:'#9860ff',secondary:'#f34ebc',accent:'#e8ff8a',stripe:'#e8ff8a'},
    'porsche-911':{name:'Porsche 911',price:40000,currency:'CR',category:'premium',premium:true,primary:'#e21724',secondary:'#13191d',accent:'#f4f4f2',stripe:'#ff6b72',
      sprite:{src:'assets/cars/porsche-911.webp',thumbnail:'assets/cars/porsche-911-thumbnail.webp',length:74,width:36.5,preserveAspectRatio:true,
        raceScale:1.25,previewScale:1.23,raceOffsetX:0,raceOffsetY:0,previewOffsetX:0,previewOffsetY:0}}
  };
  R.EFFECTS={standard:{name:'STANDARD',price:0},blueFlame:{name:'BLUE FLAME',price:1100,outer:'#2372ff',inner:'#a9faff'},redFlame:{name:'RED FLAME',price:2500,outer:'#ff2453',inner:'#fff299'},rainbowFlame:{name:'RAINBOW FLAME',price:5200,rainbow:true}};
  R.DIFFICULTY_LABELS={easy:'ЛЕГКО',medium:'СРЕДНЕ',hard:'СЛОЖНО',extreme:'ЭКСТРИМ'};
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const safeNumber=(v,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,v)):fallback;
  R.normalizeSave=function(raw){
    const d=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    const own=(value,catalog,free)=>Array.from(new Set([free,...(Array.isArray(value)?value.filter(id=>typeof id==='string'&&has(catalog,id)):[])]));
    const ownedLiveries=own(d.ownedLiveries,R.LIVERIES,'apexLime'),ownedEffects=own(d.ownedEffects,R.EFFECTS,'standard');
    const controlMode=['arrows','tilt','wheel'].includes(d.controlMode)?d.controlMode:'arrows';
    const tiltSensitivity=['low','medium','high'].includes(d.tiltSensitivity)?d.tiltSensitivity:'medium';
    return {saveVersion:4,bestScore:safeNumber(d.bestScore),bestLap:safeNumber(d.bestLap),maxLaps:Math.floor(safeNumber(d.maxLaps)),muted:!!d.muted,
      botCount:Math.max(1,Math.min(13,Math.round(safeNumber(d.botCount,7)))),raceLaps:[3,5,7,10,15].includes(d.raceLaps)?d.raceLaps:5,
      difficulty:has(R.DIFFICULTY_LABELS,d.difficulty)?d.difficulty:'medium',trackId:has(R.TRACKS,d.trackId)?d.trackId:'apexCircuit',controlMode,tiltSensitivity,
      credits:Math.floor(safeNumber(d.credits,200)),ownedLiveries,ownedEffects,
      selectedLivery:ownedLiveries.includes(d.selectedLivery)?d.selectedLivery:'apexLime',selectedEffect:ownedEffects.includes(d.selectedEffect)?d.selectedEffect:'standard'};
  };
  R.shopAction=function(save,kind,id){
    const catalog=kind==='livery'?R.LIVERIES:kind==='effect'?R.EFFECTS:null;
    if(!catalog||!has(catalog,id))return 'invalid';
    const owned=save[kind==='livery'?'ownedLiveries':'ownedEffects'],selected=kind==='livery'?'selectedLivery':'selectedEffect';
    if(owned.includes(id)){save[selected]=id;return 'selected';}
    if(!Number.isFinite(save.credits)||save.credits<catalog[id].price)return 'insufficient';
    save.credits-=catalog[id].price;owned.push(id);return 'purchased';
  };
  R.raceReward=function(settings={},place=1){
    const cfg=settings&&typeof settings==='object'?settings:{};
    const rawBots=Number(cfg.bots),rawLaps=Number(cfg.laps),rawPlace=Number(place);
    const safeBots=Math.max(1,Math.min(13,Number.isFinite(rawBots)?Math.round(rawBots):7));
    const roundedLaps=Number.isFinite(rawLaps)?Math.round(rawLaps):5;
    const safeLaps=[3,5,7,10,15].includes(roundedLaps)?roundedLaps:5;
    const safePlace=Math.max(1,Math.min(safeBots+1,Number.isFinite(rawPlace)?Math.round(rawPlace):safeBots+1));
    const rankFactor=(safeBots+1-safePlace)/safeBots;
    const difficultyMultiplier={easy:.9,medium:1,hard:1.15,extreme:1.35}[cfg.difficulty]||1;
    const lapReward=safeLaps*30;
    const gridReward=safeBots*4;
    const placementReward=safeLaps*30*rankFactor*(.75+safeBots/20);
    return Math.max(1,Math.round((lapReward+gridReward+placementReward)*difficultyMultiplier));
  };
})();
