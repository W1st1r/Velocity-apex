(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  const points=a=>a.map(([x,y])=>({x,y}));
  // Shared world-space race physics. Keep player and AI on the same baseline.
  R.RACE_PHYSICS=Object.freeze({maxSpeed:510,accel:268,brakePower:368,turnRate:2.40});
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
      theme:{kind:'coast',ground:'#227b8a',road:'#384144',curb:'#55c3cc',barrier:'#e2e9df',accent:'#5fe4da',surface:'sand',drag:1.25,dust:'#e4d4af'}},
    auroraGrandLoop:{id:'auroraGrandLoop',name:'AURORA GRAND LOOP',type:'GRAND TOURING / HIGH SPEED / SCENIC',description:'Сумеречный гранд-тур · длинные прямые, S-секции и жесткие торможения',targetLength:15000,roadWidth:226,
      points:points([[-2050,-610],[-1540,-815],[-790,-900],[80,-920],[900,-875],[1610,-690],[2020,-350],[2160,70],[1980,415],[1595,590],[1270,735],[1550,940],[1110,1110],[405,1125],[-170,1010],[-520,760],[-300,505],[-555,285],[-990,330],[-1370,585],[-1775,785],[-2140,610],[-2310,280],[-2285,-80],[-2180,-380]]),
      scenery:{grandstands:[[.008,-1,1.18,1],[.18,1,.78,1],[.61,-1,.76,1]],spectators:[[.11,1],[.43,-1],[.76,1]],pitSide:-1},
      theme:{kind:'aurora',ground:'#103f43',road:'#30383b',curb:'#80f0df',barrier:'#d7e7e4',accent:'#9bff62',surface:'grass',drag:1.08,dust:'#8dbbb3'}}
  };
  // Drift-only events live in a separate catalog so the existing Solo/Online
  // track lists and their saved settings remain byte-for-byte compatible.
  R.DRIFT_TRACKS={
    sierraFlow:{id:'sierraFlow',name:'SIERRA FLOW',type:'DRIFT / MOUNTAIN',description:'10.4 км · длинные дуги, S-связки и техничные шпильки',targetLength:10400,roadWidth:260,curbWidth:8,barrierMargin:44,cleanDrift:true,
      points:points([[-1810,-420],[-1650,-790],[-1320,-1030],[-930,-1080],[-620,-870],[-365,-570],[-40,-760],[310,-1040],[720,-1090],[1090,-930],[1420,-650],[1640,-315],[1650,55],[1430,330],[1190,470],[1420,735],[1210,1010],[800,1120],[390,1025],[110,790],[-205,1000],[-610,965],[-930,720],[-1240,850],[-1540,650],[-1740,340],[-1570,65],[-1830,-170]]),
      scenery:{grandstands:[[.01,1,.72,1],[.52,-1,.58,0]],spectators:[[.20,-1],[.67,1]],pitSide:1},
      theme:{kind:'alpine',ground:'#344d48',road:'#343b3e',curb:'#c8d9d5',barrier:'#eef5f2',accent:'#8dff49',surface:'grass',drag:1.08,dust:'#aec8bc'}},
    midnightSwitchbacks:{id:'midnightSwitchbacks',name:'MIDNIGHT SWITCHBACKS',type:'DRIFT / NIGHT',description:'11.8 км · скоростные перекладки, затяжные дуги и hairpin-секции',targetLength:11800,roadWidth:254,curbWidth:8,barrierMargin:44,cleanDrift:true,
      points:points([[-1910,-520],[-1530,-835],[-1110,-920],[-760,-760],[-505,-490],[-215,-690],[120,-970],[520,-1030],[900,-870],[1170,-590],[1510,-720],[1770,-455],[1850,-80],[1680,230],[1350,360],[1580,650],[1390,945],[1030,1080],[650,1015],[375,770],[85,1005],[-295,1060],[-640,900],[-825,620],[-1160,790],[-1515,675],[-1760,410],[-1640,120],[-1910,-105],[-1710,-315]]),
      scenery:{grandstands:[[.012,-1,.78,1],[.45,1,.62,0]],spectators:[[.28,1],[.73,-1]],pitSide:-1},
      theme:{kind:'neon',ground:'#101a2b',road:'#252c3a',curb:'#36dff2',barrier:'#8866ec',accent:'#b06cff',surface:'runoff',drag:.68,dust:'#819bb7'}}
  };
  R.CAR_CATEGORY_ORDER=['all','basic','sport','premium','rare','legendary','lux'];
  R.CAR_CATEGORIES={
    all:{id:'all',label:'ВСЕ',className:'rarity-all',color:'#DDE9E2'},
    basic:{id:'basic',label:'BASIC',className:'rarity-basic',color:'#8DFF49'},
    sport:{id:'sport',label:'SPORT',className:'rarity-sport',color:'#FF8A32'},
    premium:{id:'premium',label:'PREMIUM',className:'rarity-premium',color:'#38A8FF'},
    rare:{id:'rare',label:'RARE',className:'rarity-rare',color:'#FF3D52'},
    legendary:{id:'legendary',label:'LEGENDARY',className:'rarity-legendary',color:'#FFD76A'},
    lux:{id:'lux',label:'LUX',className:'rarity-lux',color:'#E97CFF'}
  };
  R.normalizeCarCategory=value=>value==='regular'?'basic':(R.CAR_CATEGORIES[value]&&value!=='all'?value:'basic');
  // Legacy starter liveries remain valid for old velocityApex.v1 saves, but stay out of the new 41-car shop catalog.
  R.LIVERIES={
    apexLime:{name:'APEX LIME',price:0,category:'basic',legacy:true,shopHidden:true,primary:'#80ff44',secondary:'#f5f5ed',accent:'#183b24',stripe:'#eaffdf'},
    crimsonVelocity:{name:'CRIMSON VELOCITY',price:1400,category:'basic',legacy:true,shopHidden:true,primary:'#f3274f',secondary:'#20242c',accent:'#ffffff',stripe:'#f6ecec'},
    iceVector:{name:'ICE VECTOR',price:3200,category:'basic',legacy:true,shopHidden:true,primary:'#36d5ff',secondary:'#f0faff',accent:'#173f75',stripe:'#173f75'},
    auroraPulse:{name:'AURORA PULSE',price:6500,category:'basic',legacy:true,shopHidden:true,primary:'#9860ff',secondary:'#f34ebc',accent:'#e8ff8a',stripe:'#e8ff8a'}
  };
  const REAL_CARS=[
    {id:"vw-golf-gti",name:"Volkswagen Golf GTI",category:"basic",primary:"#42c72e",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#42c72e',sprite:{src:"assets/cars/vw-golf-gti.webp",thumbnail:"assets/cars/vw-golf-gti-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"honda-civic-type-r",name:"Honda Civic Type R",category:"basic",primary:"#f0f2ef",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#f0f2ef',sprite:{src:"assets/cars/honda-civic-type-r.webp",thumbnail:"assets/cars/honda-civic-type-r-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"toyota-gt86",name:"Toyota GT86",category:"basic",primary:"#ff7b00",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#ff7b00',sprite:{src:"assets/cars/toyota-gt86.webp",thumbnail:"assets/cars/toyota-gt86-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"ford-mustang-gt",name:"Ford Mustang GT",category:"basic",primary:"#d81f2e",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d81f2e',sprite:{src:"assets/cars/ford-mustang-gt.webp",thumbnail:"assets/cars/ford-mustang-gt-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"subaru-wrx-sti",name:"Subaru WRX STI",category:"basic",primary:"#0668e8",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#0668e8',sprite:{src:"assets/cars/subaru-wrx-sti.webp",thumbnail:"assets/cars/subaru-wrx-sti-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bmw-330i",name:"BMW 330i",category:"basic",primary:"#34383b",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#34383b',sprite:{src:"assets/cars/bmw-330i.webp",thumbnail:"assets/cars/bmw-330i-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bmw-m5-f90",name:"BMW M5 F90",category:"sport",primary:"#0862c8",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#0862c8',sprite:{src:"assets/cars/bmw-m5-f90.webp",thumbnail:"assets/cars/bmw-m5-f90-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mercedes-cls-63-amg",name:"Mercedes-Benz CLS 63 AMG",category:"sport",primary:"#d8dddf",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d8dddf',sprite:{src:"assets/cars/mercedes-cls-63-amg.webp",thumbnail:"assets/cars/mercedes-cls-63-amg-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bmw-m4-competition",name:"BMW M4 Competition",category:"sport",primary:"#d4df16",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d4df16',sprite:{src:"assets/cars/bmw-m4-competition.webp",thumbnail:"assets/cars/bmw-m4-competition-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mercedes-amg-c63-s",name:"Mercedes-AMG C63 S",category:"sport",primary:"#272b2f",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#272b2f',sprite:{src:"assets/cars/mercedes-amg-c63-s.webp",thumbnail:"assets/cars/mercedes-amg-c63-s-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"audi-rs5",name:"Audi RS5",category:"sport",primary:"#d91d27",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d91d27',sprite:{src:"assets/cars/audi-rs5.webp",thumbnail:"assets/cars/audi-rs5-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"nissan-gtr-r35",name:"Nissan GT-R R35",category:"sport",primary:"#d9dde0",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d9dde0',sprite:{src:"assets/cars/nissan-gtr-r35.webp",thumbnail:"assets/cars/nissan-gtr-r35-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"chevrolet-corvette-c8",name:"Chevrolet Corvette C8",category:"sport",primary:"#f17216",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#f17216',sprite:{src:"assets/cars/chevrolet-corvette-c8.webp",thumbnail:"assets/cars/chevrolet-corvette-c8-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"porsche-911",name:"Porsche 911 Turbo S",category:"premium",primary:"#d8dcdd",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d8dcdd',sprite:{src:"assets/cars/porsche-911.webp",thumbnail:"assets/cars/porsche-911-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mercedes-amg-gt-63-s",name:"Mercedes-AMG GT 63 S",category:"premium",primary:"#087249",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#087249',sprite:{src:"assets/cars/mercedes-amg-gt-63-s.webp",thumbnail:"assets/cars/mercedes-amg-gt-63-s-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bmw-m8-competition",name:"BMW M8 Competition",category:"premium",primary:"#163b7f",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#163b7f',sprite:{src:"assets/cars/bmw-m8-competition.webp",thumbnail:"assets/cars/bmw-m8-competition-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bentley-continental-gt",name:"Bentley Continental GT",category:"premium",primary:"#e6e1d8",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#e6e1d8',sprite:{src:"assets/cars/bentley-continental-gt.webp",thumbnail:"assets/cars/bentley-continental-gt-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"aston-martin-vantage",name:"Aston Martin Vantage",category:"premium",primary:"#0d4b43",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#0d4b43',sprite:{src:"assets/cars/aston-martin-vantage.webp",thumbnail:"assets/cars/aston-martin-vantage-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"maserati-mc20",name:"Maserati MC20",category:"premium",primary:"#0871df",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#0871df',sprite:{src:"assets/cars/maserati-mc20.webp",thumbnail:"assets/cars/maserati-mc20-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"audi-r8",name:"Audi R8",category:"rare",primary:"#5a3527",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#5a3527',brownVisual:true,sprite:{src:"assets/cars/audi-r8.webp",thumbnail:"assets/cars/audi-r8-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"lamborghini-huracan",name:"Lamborghini Huracán",category:"rare",primary:"#4bd51c",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#4bd51c',sprite:{src:"assets/cars/lamborghini-huracan.webp",thumbnail:"assets/cars/lamborghini-huracan-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"ferrari-488-gtb",name:"Ferrari 488 GTB",category:"rare",primary:"#e12525",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#e12525',sprite:{src:"assets/cars/ferrari-488-gtb.webp",thumbnail:"assets/cars/ferrari-488-gtb-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mclaren-720s",name:"McLaren 720S",category:"rare",primary:"#f16c12",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#f16c12',sprite:{src:"assets/cars/mclaren-720s.webp",thumbnail:"assets/cars/mclaren-720s-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"porsche-918-spyder",name:"Porsche 918 Spyder",category:"rare",primary:"#cfd3d4",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#cfd3d4',sprite:{src:"assets/cars/porsche-918-spyder.webp",thumbnail:"assets/cars/porsche-918-spyder-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"lamborghini-aventador",name:"Lamborghini Aventador",category:"rare",primary:"#f2bf10",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#f2bf10',sprite:{src:"assets/cars/lamborghini-aventador.webp",thumbnail:"assets/cars/lamborghini-aventador-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"ford-gt",name:"Ford GT",category:"rare",primary:"#0864af",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#0864af',sprite:{src:"assets/cars/ford-gt.webp",thumbnail:"assets/cars/ford-gt-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bugatti-veyron",name:"Bugatti Veyron",category:"legendary",primary:"#20272b",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#20272b',sprite:{src:"assets/cars/bugatti-veyron.webp",thumbnail:"assets/cars/bugatti-veyron-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"ferrari-enzo",name:"Ferrari Enzo",category:"legendary",primary:"#d91d2b",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d91d2b',sprite:{src:"assets/cars/ferrari-enzo.webp",thumbnail:"assets/cars/ferrari-enzo-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mclaren-p1",name:"McLaren P1",category:"legendary",primary:"#f16c0c",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#f16c0c',sprite:{src:"assets/cars/mclaren-p1.webp",thumbnail:"assets/cars/mclaren-p1-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"lamborghini-sian",name:"Lamborghini Sian",category:"legendary",primary:"#667128",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#667128',sprite:{src:"assets/cars/lamborghini-sian.webp",thumbnail:"assets/cars/lamborghini-sian-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"pagani-huayra",name:"Pagani Huayra",category:"legendary",primary:"#70777c",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#70777c',sprite:{src:"assets/cars/pagani-huayra.webp",thumbnail:"assets/cars/pagani-huayra-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"koenigsegg-agera-rs",name:"Koenigsegg Agera RS",category:"legendary",primary:"#22282b",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#22282b',sprite:{src:"assets/cars/koenigsegg-agera-rs.webp",thumbnail:"assets/cars/koenigsegg-agera-rs-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mercedes-benz-slr-mclaren",name:"Mercedes-Benz SLR McLaren",category:"legendary",primary:"#b9bec1",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#b9bec1',sprite:{src:"assets/cars/mercedes-benz-slr-mclaren.webp",thumbnail:"assets/cars/mercedes-benz-slr-mclaren-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"ferrari-laferrari",name:"Ferrari LaFerrari",category:"lux",primary:"#d8212d",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#d8212d',sprite:{src:"assets/cars/ferrari-laferrari.webp",thumbnail:"assets/cars/ferrari-laferrari-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bugatti-chiron-super-sport",name:"Bugatti Chiron Super Sport",category:"lux",primary:"#1f2224",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#1f2224',sprite:{src:"assets/cars/bugatti-chiron-super-sport.webp",thumbnail:"assets/cars/bugatti-chiron-super-sport-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"bugatti-divo",name:"Bugatti Divo",category:"lux",primary:"#151c20",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#151c20',sprite:{src:"assets/cars/bugatti-divo.webp",thumbnail:"assets/cars/bugatti-divo-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"koenigsegg-jesko",name:"Koenigsegg Jesko",category:"lux",primary:"#e9ece8",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#e9ece8',sprite:{src:"assets/cars/koenigsegg-jesko.webp",thumbnail:"assets/cars/koenigsegg-jesko-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"pagani-huayra-bc",name:"Pagani Huayra BC",category:"lux",primary:"#3a4144",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#3a4144',sprite:{src:"assets/cars/pagani-huayra-bc.webp",thumbnail:"assets/cars/pagani-huayra-bc-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"lamborghini-veneno",name:"Lamborghini Veneno",category:"lux",primary:"#9ca2a3",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#9ca2a3',sprite:{src:"assets/cars/lamborghini-veneno.webp",thumbnail:"assets/cars/lamborghini-veneno-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"mercedes-amg-one",name:"Mercedes-AMG ONE",category:"lux",primary:"#242a2b",secondary:'#141a1e',accent:'#f1f4f4',stripe:'#dce4e6',bodyColor:'#242a2b',sprite:{src:"assets/cars/mercedes-amg-one.webp",thumbnail:"assets/cars/mercedes-amg-one-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"aston-martin-valkyrie-mary",name:"Mary",category:"lux",primary:"#ff3fae",secondary:"#141018",accent:"#ffe3f4",stripe:"#ff9bd3",bodyColor:"#ff3fae",sprite:{src:"assets/cars/aston-martin-valkyrie-mary.webp",thumbnail:"assets/cars/aston-martin-valkyrie-mary-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}}
  ];
  // Economy and geometry are intentionally centralized: values are resolved once when the
  // catalog loads, so the race renderer does no image analysis or per-frame metadata work.
  const CAR_PRICES=Object.freeze({
    "vw-golf-gti":2800,
    "honda-civic-type-r":5200,
    "toyota-gt86":4200,
    "ford-mustang-gt":11800,
    "subaru-wrx-sti":9200,
    "bmw-330i":7500,
    "bmw-m5-f90":28000,
    "mercedes-cls-63-amg":16500,
    "bmw-m4-competition":22000,
    "mercedes-amg-c63-s":24500,
    "audi-rs5":19000,
    "nissan-gtr-r35":36000,
    "chevrolet-corvette-c8":32000,
    "porsche-911":68000,
    "mercedes-amg-gt-63-s":57000,
    "bmw-m8-competition":52000,
    "bentley-continental-gt":47000,
    "aston-martin-vantage":43000,
    "maserati-mc20":62000,
    "audi-r8":78000,
    "lamborghini-huracan":92000,
    "ferrari-488-gtb":86000,
    "mclaren-720s":101000,
    "porsche-918-spyder":132000,
    "lamborghini-aventador":112000,
    "ford-gt":121000,
    "bugatti-veyron":208000,
    "ferrari-enzo":158000,
    "mclaren-p1":196000,
    "lamborghini-sian":184000,
    "pagani-huayra":172000,
    "koenigsegg-agera-rs":222000,
    "mercedes-benz-slr-mclaren":145000,
    "ferrari-laferrari":245000,
    "bugatti-chiron-super-sport":300000,
    "bugatti-divo":275000,
    "koenigsegg-jesko":310000,
    "pagani-huayra-bc":255000,
    "lamborghini-veneno":285000,
    "mercedes-amg-one":265000,
    "aston-martin-valkyrie-mary":280000
  });
  // visualLength/visualWidth are per-car contain bounds. They are maxima, not
  // independent stretch targets: resolveSpriteSize() preserves the source WebP ratio.
  // previewScale sets the overall catalog/garage footprint; previewLengthScale is an
  // optional preview-only longitudinal correction applied afterward, never in race mode.
  // raceScale and collision geometry remain independent and unchanged by preview tuning.
  const geo=(visualLength,visualWidth,raceScale,previewScale,collisionLength,collisionWidth,raceOffsetX=0,raceOffsetY=0,collisionOffsetX=0,collisionOffsetY=0)=>Object.freeze({
    visualLength,visualWidth,raceScale,previewScale,raceOffsetX,raceOffsetY,previewOffsetX:raceOffsetX,previewOffsetY:raceOffsetY,
    collisionLength,collisionWidth,collisionOffsetX,collisionOffsetY
  });
  const PREVIEW_LENGTH_SCALES=Object.freeze({
    "ferrari-laferrari":1.08,
    "bugatti-chiron-super-sport":1.09,
    "bugatti-divo":1.08,
    "koenigsegg-jesko":1.09,
    "pagani-huayra-bc":1.07,
    "lamborghini-veneno":1.08,
    "mclaren-p1":1.05,
    "ferrari-enzo":1.06
  });
  const CAR_GEOMETRY=Object.freeze({
    "vw-golf-gti":geo(59.3,31.2,1.14,1.349,66.2,29.4,0,0,0.0,0.0),
    "honda-civic-type-r":geo(62.2,32.7,1.15,1.286,70.8,30.7,0,0,0.0,0.0),
    "toyota-gt86":geo(61.7,32.4,1.14,1.297,69.2,30.4,0,0,0.0,0.0),
    "ford-mustang-gt":geo(66.6,35.4,1.17,1.201,78.2,33.4,0.4,0,0.3,0.0),
    "subaru-wrx-sti":geo(63.8,33.3,1.15,1.258,72.9,31.2,0,0,0.0,0.0),
    "bmw-330i":geo(64.9,33.2,1.15,1.233,73.9,31.2,0,0,0.0,0.0),
    "bmw-m5-f90":geo(66.9,35.6,1.18,1.196,81.0,33.1,0.3,0,0.22,0.0),
    "mercedes-cls-63-amg":geo(71.8,33.5,1.18,1.079,82.0,33.1,0.5,0,0.38,0.0),
    "bmw-m4-competition":geo(65.1,34.6,1.17,1.229,77.2,32.3,0.2,0,0.15,0.0),
    "mercedes-amg-c63-s":geo(67,34.6,1.17,1.194,78.2,32.8,0.3,0,0.22,0.0),
    "audi-rs5":geo(65.7,34.3,1.16,1.218,76.6,32.0,0.2,0,0.15,0.0),
    "nissan-gtr-r35":geo(66.8,35.2,1.18,1.199,78.9,33.7,0.2,0,0.15,0.0),
    "chevrolet-corvette-c8":geo(66.4,36.1,1.19,1.205,79.6,34.5,0.6,0,0.45,0.0),
    "porsche-911":geo(63.3,34.7,1.18,1.264,74.8,33.1,0,0,0.0,0.0),
    "mercedes-amg-gt-63-s":geo(66.2,37.5,1.21,1.208,85.2,34.5,0.7,0,0.52,0.0),
    "bmw-m8-competition":geo(66.2,37,1.2,1.208,83.4,34.2,0.5,0,0.38,0.0),
    "bentley-continental-gt":geo(69.3,38.6,1.21,1.158,86.2,36.7,0.4,0,0.3,0.0),
    "aston-martin-vantage":geo(65.5,36.7,1.19,1.226,77.5,35.6,0.4,0,0.3,0.0),
    "maserati-mc20":geo(67,36.9,1.2,1.194,80.3,35.9,0.5,0,0.38,0.0),
    "audi-r8":geo(65.3,36.8,1.19,1.225,77.5,35.6,0.4,0,0.3,0.0),
    "lamborghini-huracan":geo(64,37.2,1.2,1.252,78.1,35.5,0.5,0,0.38,0.0),
    "ferrari-488-gtb":geo(66,36.6,1.2,1.212,79.2,35.5,0.6,0,0.45,0.0),
    "mclaren-720s":geo(66.1,36.3,1.2,1.21,79.2,35.3,0.5,0,0.38,0.0),
    "porsche-918-spyder":geo(65.5,37.1,1.21,1.221,80.9,35.6,0.3,0,0.22,0.0),
    "lamborghini-aventador":geo(67.1,38.4,1.22,1.196,83.7,37.0,0.7,0,0.52,0.0),
    "ford-gt":geo(68.3,38.2,1.22,1.171,84.8,37.0,0.8,0,0.6,0.0),
    "bugatti-veyron":geo(70.1,38.5,1.22,1.141,82.7,39.3,0.2,0,0.15,0.0),
    "ferrari-enzo":geo(65.9,40.3,1.22,1.195,83.7,38.2,1.0,0,0.75,0.0),
    "mclaren-p1":geo(64.6,38.2,1.21,1.243,80.9,36.2,0.5,0,0.38,0.0),
    "lamborghini-sian":geo(67.4,40.4,1.23,1.187,86.6,38.5,0.8,0,0.6,0.0),
    "pagani-huayra":geo(67,39.1,1.22,1.194,82.7,38.2,0.5,0,0.38,0.0),
    "koenigsegg-agera-rs":geo(69.5,39.9,1.22,1.151,82.7,40.4,0.3,0,0.22,0.0),
    "mercedes-benz-slr-mclaren":geo(69.6,40.4,1.25,1.149,92.4,38.5,1.6,0,1.2,0.0),
    "ferrari-laferrari":geo(64.8,40.9,1.23,1.174,85.5,37.9,0.8,0,0.6,0.0),
    "bugatti-chiron-super-sport":geo(66.4,42.3,1.24,1.135,86.2,40.5,0.5,0,0.38,0.0),
    "bugatti-divo":geo(67.1,42.3,1.24,1.135,87.3,40.5,0.6,0,0.45,0.0),
    "koenigsegg-jesko":geo(66,42.4,1.24,1.136,87.3,39.9,0.5,0,0.38,0.0),
    "pagani-huayra-bc":geo(65.7,40.9,1.23,1.176,84.4,39.0,0.4,0,0.3,0.0),
    "lamborghini-veneno":geo(67.5,42.4,1.25,1.132,91.3,39.7,1.0,0,0.75,0.0),
    "mercedes-amg-one":geo(64.6,41.9,1.24,1.161,87.3,38.6,0.7,0,0.52,0.0),
    "aston-martin-valkyrie-mary":geo(79.4,34.7,1.23,0.989,86.6,39.0,0.7,0,0.52,0.0)
  });
  for(const car of REAL_CARS){
    const {id,...base}=car,g=CAR_GEOMETRY[id];
    const previewLengthScale=PREVIEW_LENGTH_SCALES[id];
    const sprite=Object.freeze({...base.sprite,visualLength:g.visualLength,visualWidth:g.visualWidth,raceScale:g.raceScale,previewScale:g.previewScale,raceOffsetX:g.raceOffsetX,raceOffsetY:g.raceOffsetY,previewOffsetX:g.previewOffsetX,previewOffsetY:g.previewOffsetY,...(previewLengthScale?{previewLengthScale}:{})});
    const collision=Object.freeze({length:g.collisionLength,width:g.collisionWidth,offsetX:g.collisionOffsetX,offsetY:g.collisionOffsetY});
    R.LIVERIES[id]={...base,price:CAR_PRICES[id],sprite,collision,currency:'CR',realCar:true};
  }
  R.CAR_GEOMETRY=CAR_GEOMETRY;
  R.REAL_CAR_IDS=Object.freeze(REAL_CARS.map(car=>car.id));
  R.EFFECTS={
    standard:{name:'STANDARD',price:0},
    blueFlame:{name:'BLUE TWIN FLAME',price:1100,outer:'#2372ff',inner:'#a9faff',twin:true},
    cyanFlame:{name:'CYAN TWIN FLAME',price:1700,outer:'#00d9ff',inner:'#d9ffff',twin:true},
    greenFlame:{name:'GREEN TWIN FLAME',price:2100,outer:'#45ff72',inner:'#eaffc7',twin:true},
    redFlame:{name:'RED TWIN FLAME',price:2500,outer:'#ff2453',inner:'#fff299',twin:true},
    purpleFlame:{name:'PURPLE TWIN FLAME',price:3200,outer:'#a244ff',inner:'#ffd6ff',twin:true},
    orangeFlame:{name:'ORANGE TWIN FLAME',price:3800,outer:'#ff7a18',inner:'#fff1a6',twin:true},
    rainbowFlame:{name:'RAINBOW / IRIDESCENT',price:5200,rainbow:true,twin:true}
  };
  R.DIFFICULTY_LABELS={easy:'ЛЕГКО',medium:'СРЕДНЕ',hard:'СЛОЖНО',extreme:'ЭКСТРИМ'};
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const safeNumber=(v,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,v)):fallback;
  R.normalizeSave=function(raw){
    const d=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    const own=(value,catalog,free)=>Array.from(new Set([free,...(Array.isArray(value)?value.filter(id=>typeof id==='string'&&has(catalog,id)):[])]));
    const ownedLiveries=own(d.ownedLiveries,R.LIVERIES,'apexLime'),ownedEffects=own(d.ownedEffects,R.EFFECTS,'standard');
    const controlMode=['arrows','tilt','wheel'].includes(d.controlMode)?d.controlMode:'arrows';
    const tiltSensitivity=['low','medium','high'].includes(d.tiltSensitivity)?d.tiltSensitivity:'medium';
    return {saveVersion:5,bestScore:safeNumber(d.bestScore),bestLap:safeNumber(d.bestLap),bestDriftScore:Math.floor(safeNumber(d.bestDriftScore)),maxLaps:Math.floor(safeNumber(d.maxLaps)),muted:!!d.muted,
      botCount:Math.max(1,Math.min(13,Math.round(safeNumber(d.botCount,7)))),raceLaps:[3,5,7,10,15].includes(d.raceLaps)?d.raceLaps:5,
      difficulty:has(R.DIFFICULTY_LABELS,d.difficulty)?d.difficulty:'medium',trackId:has(R.TRACKS,d.trackId)?d.trackId:'apexCircuit',
      driftBotCount:Math.max(1,Math.min(13,Math.round(safeNumber(d.driftBotCount,d.botCount??7)))),driftDifficulty:has(R.DIFFICULTY_LABELS,d.driftDifficulty)?d.driftDifficulty:'medium',driftTrackId:has(R.DRIFT_TRACKS,d.driftTrackId)?d.driftTrackId:'sierraFlow',
      controlMode,tiltSensitivity,credits:Math.floor(safeNumber(d.credits,200)),ownedLiveries,ownedEffects,
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
  R.selectOwned=function(save,kind,id){
    const catalog=kind==='livery'?R.LIVERIES:kind==='effect'?R.EFFECTS:null;
    const ownedKey=kind==='livery'?'ownedLiveries':kind==='effect'?'ownedEffects':null;
    const selectedKey=kind==='livery'?'selectedLivery':kind==='effect'?'selectedEffect':null;
    if(!catalog||!ownedKey||!Object.prototype.hasOwnProperty.call(catalog,id))return 'invalid';
    if(!Array.isArray(save[ownedKey])||!save[ownedKey].includes(id))return 'locked';
    save[selectedKey]=id;return 'selected';
  };
  R.getCatalogEntries=function(save,mode,kind,category='all'){
    const cars=kind==='livery',catalog=cars?R.LIVERIES:kind==='effect'?R.EFFECTS:null;
    if(!catalog)return [];
    const owned=save&&Array.isArray(save[cars?'ownedLiveries':'ownedEffects'])?save[cars?'ownedLiveries':'ownedEffects']:[];
    let entries=Object.entries(catalog);
    if(cars&&mode==='shop')entries=entries.filter(([,item])=>!item.shopHidden);
    if(mode==='garage')entries=entries.filter(([id])=>owned.includes(id));
    if(cars&&category!=='all')entries=entries.filter(([,item])=>R.normalizeCarCategory(item.category)===category);
    return entries;
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
  R.driftReward=function(settings={},place=1,driftScore=0,trackLength=10000){
    const cfg=settings&&typeof settings==='object'?settings:{};
    const rawBots=Number(cfg.bots),rawPlace=Number(place),rawScore=Number(driftScore),rawLength=Number(trackLength);
    const safeBots=Math.max(1,Math.min(13,Number.isFinite(rawBots)?Math.round(rawBots):7));
    const safePlace=Math.max(1,Math.min(safeBots+1,Number.isFinite(rawPlace)?Math.round(rawPlace):safeBots+1));
    const safeScore=Math.max(0,Number.isFinite(rawScore)?rawScore:0),safeLength=Math.max(8000,Math.min(14000,Number.isFinite(rawLength)?rawLength:10000));
    const rankFactor=(safeBots+1-safePlace)/safeBots,lengthFactor=safeLength/10000;
    const difficultyMultiplier={easy:.9,medium:1,hard:1.15,extreme:1.35}[cfg.difficulty]||1;
    // Kept close to the existing race economy: an average medium drift run lands
    // around a normal event payout, while a clean high-score win earns a premium.
    const completionReward=78+48*lengthFactor,gridReward=safeBots*3;
    const placementReward=80*rankFactor*(.75+safeBots/24);
    // Score contribution is deliberately capped: completing the route and racing well
    // matter more than farming a single corner. The runtime scorer also requires
    // forward track progress, so stationary donuts cannot generate this bonus.
    const scoreReward=Math.min(160,safeScore/85);
    return Math.max(1,Math.round((completionReward+gridReward+placementReward+scoreReward)*difficultyMultiplier));
  };
})();
