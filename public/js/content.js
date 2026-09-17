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

  // Solo career: long time-attack routes. Levels unlock strictly in order.
  R.CAREER_TRACKS={
    career01:{id:'career01',name:'GREEN FRONTIER',type:'CAREER 01 / FLOW',description:'Длинный скоростной маршрут с широкими дугами и понятными точками торможения.',targetLength:32000,roadWidth:222,curbWidth:9,barrierMargin:40,
      points:points([[-2100,-620],[-1650,-900],[-950,-1030],[-200,-1010],[560,-1080],[1280,-920],[1900,-600],[2200,-180],[2150,300],[1840,690],[1320,900],[760,820],[350,580],[-40,740],[-520,980],[-1120,930],[-1660,650],[-1990,260],[-1850,-80],[-2200,-320]]),
      theme:{kind:'circuit',ground:'#174e2d',road:'#34383a',curb:'#e94b49',barrier:'#d5d9d6',accent:'#8dff49',surface:'grass',drag:1,dust:'#a8d66f'}},
    career02:{id:'career02',name:'NEON ARTERY',type:'CAREER 02 / STREET',description:'Ночной скоростной город: длинные прямые, быстрые шиканы и позднее торможение.',targetLength:31000,roadWidth:214,curbWidth:9,barrierMargin:40,
      points:points([[-2200,-700],[-1450,-900],[-650,-860],[180,-980],[930,-900],[1650,-680],[2110,-300],[2240,120],[2050,470],[1500,560],[1180,840],[560,980],[-40,900],[-410,620],[-820,710],[-1320,930],[-1840,720],[-2140,360],[-2050,50],[-2260,-270]]),
      theme:{kind:'neon',ground:'#111c30',road:'#252c3c',curb:'#31cfea',barrier:'#8866ec',accent:'#53dfff',surface:'runoff',drag:.68,dust:'#87a4c3'}},
    career03:{id:'career03',name:'CANYON VELOCITY',type:'CAREER 03 / HIGH SPEED',description:'Каньон с затяжными разгоном, двойной шпилькой и серией быстрых смен направления.',targetLength:30000,roadWidth:208,curbWidth:9,barrierMargin:41,
      points:points([[-2260,-720],[-1500,-940],[-720,-930],[80,-1040],[860,-900],[1550,-720],[2110,-400],[2300,0],[2200,390],[1780,650],[1230,560],[930,290],[570,480],[280,820],[-230,980],[-720,810],[-980,500],[-1380,650],[-1840,780],[-2180,460],[-2070,140],[-2310,-180]]),
      theme:{kind:'desert',ground:'#b77c4b',road:'#353331',curb:'#eb9d56',barrier:'#f1ce9a',accent:'#ffac64',surface:'sand',drag:1.45,dust:'#e9be7e'}},
    career04:{id:'career04',name:'ALPINE SERPENT',type:'CAREER 04 / TECHNICAL',description:'Горный серпантин: плотные S-связки, две шпильки и узкие зоны для ошибки.',targetLength:29000,roadWidth:200,curbWidth:8,barrierMargin:40,
      points:points([[-2050,-720],[-1550,-980],[-960,-920],[-650,-650],[-180,-920],[360,-1050],[930,-880],[1370,-560],[1810,-760],[2190,-430],[2260,-30],[1980,260],[1530,180],[1780,570],[1420,890],[820,1030],[350,790],[-40,1030],[-520,930],[-720,620],[-1150,800],[-1640,700],[-1980,390],[-1830,80],[-2180,-190],[-1840,-430]]),
      theme:{kind:'alpine',ground:'#465e5c',road:'#343d42',curb:'#a6c5d1',barrier:'#eef5f6',accent:'#b5e5ff',surface:'grass',drag:1.08,dust:'#b9cec6'}},
    career05:{id:'career05',name:'COASTAL STORM',type:'CAREER 05 / GRAND TOURING',description:'Береговой марафон: скоростные дуги чередуются с жёсткими торможениями и связками.',targetLength:28000,roadWidth:198,curbWidth:8,barrierMargin:39,
      points:points([[-2250,-620],[-1650,-900],[-930,-1010],[-260,-920],[300,-1120],[940,-970],[1500,-650],[2050,-720],[2320,-310],[2250,90],[1960,420],[1460,350],[1680,720],[1210,1010],[600,960],[190,690],[-220,960],[-780,910],[-1050,600],[-1510,820],[-1980,650],[-2220,300],[-2030,20],[-2340,-230],[-2050,-430]]),
      theme:{kind:'coast',ground:'#227b8a',road:'#384144',curb:'#55c3cc',barrier:'#e2e9df',accent:'#5fe4da',surface:'sand',drag:1.18,dust:'#e4d4af'}},
    career06:{id:'career06',name:'METRO PULSE',type:'CAREER 06 / STREET EXPERT',description:'Техничный мегаполис: короткие разгоны, резкие перекладки и наказание за поздний вход.',targetLength:27000,roadWidth:194,curbWidth:8,barrierMargin:38,
      points:points([[-2180,-680],[-1640,-980],[-1110,-900],[-800,-600],[-330,-900],[180,-1080],[690,-940],[1040,-610],[1510,-860],[2030,-650],[2290,-260],[2180,80],[1810,250],[2090,540],[1680,850],[1130,980],[720,700],[330,950],[-180,1040],[-590,780],[-900,520],[-1260,760],[-1730,830],[-2110,520],[-1940,220],[-2260,-40],[-1970,-330]]),
      theme:{kind:'neon',ground:'#0f1b26',road:'#242b34',curb:'#47dff4',barrier:'#7f62d9',accent:'#b06cff',surface:'runoff',drag:.7,dust:'#819bb7'}},
    career07:{id:'career07',name:'DESERT RAZOR',type:'CAREER 07 / PRECISION',description:'Узкий пустынный маршрут: слепые шпильки, быстрые дуги и почти нет времени на коррекцию.',targetLength:26000,roadWidth:190,curbWidth:8,barrierMargin:37,
      points:points([[-2140,-700],[-1660,-980],[-1220,-810],[-920,-540],[-520,-920],[-40,-1080],[460,-930],[780,-590],[1180,-840],[1660,-920],[2110,-610],[2310,-220],[2150,90],[1760,190],[2090,500],[1780,820],[1260,1010],[850,730],[430,1010],[-80,930],[-370,610],[-820,830],[-1280,900],[-1690,660],[-1950,360],[-1800,80],[-2200,-160],[-1880,-430]]),
      theme:{kind:'desert',ground:'#a86f43',road:'#323231',curb:'#ef9e56',barrier:'#efc78f',accent:'#ff8248',surface:'sand',drag:1.5,dust:'#e9be7e'}},
    career08:{id:'career08',name:'MIDNIGHT CROWN',type:'CAREER 08 / NIGHT ELITE',description:'Ночной экзамен: узкие S-секции, двойные апексы и длинные зоны торможения из максималки.',targetLength:25000,roadWidth:188,curbWidth:8,barrierMargin:36,
      points:points([[-2180,-710],[-1740,-1010],[-1300,-850],[-980,-570],[-620,-900],[-180,-1100],[260,-900],[590,-580],[970,-900],[1410,-1040],[1840,-800],[2220,-480],[2300,-100],[2020,120],[1700,20],[1980,390],[2200,680],[1760,930],[1280,830],[970,570],[650,930],[190,1030],[-220,800],[-540,540],[-910,850],[-1360,960],[-1770,720],[-2050,420],[-1890,120],[-2240,-130],[-1920,-420]]),
      theme:{kind:'neon',ground:'#0c1626',road:'#222936',curb:'#31cfea',barrier:'#835bd9',accent:'#ff4fd1',surface:'runoff',drag:.68,dust:'#7f98b3'}},
    career09:{id:'career09',name:'APEX GAUNTLET',type:'CAREER 09 / MASTER',description:'Мастерская трасса: серии поворотов без отдыха, нестандартные радиусы и узкие выходы.',targetLength:24500,roadWidth:184,curbWidth:7,barrierMargin:35,
      points:points([[-2160,-720],[-1780,-1010],[-1370,-810],[-1080,-520],[-760,-900],[-360,-1120],[60,-900],[390,-560],[720,-920],[1110,-1080],[1500,-830],[1890,-960],[2260,-620],[2340,-260],[2140,20],[1790,-60],[2050,260],[2300,560],[1940,870],[1510,980],[1190,700],[900,970],[500,1070],[150,790],[-180,1030],[-570,860],[-840,560],[-1180,900],[-1580,920],[-1950,650],[-2110,340],[-1900,90],[-2240,-170],[-1900,-430]]),
      theme:{kind:'aurora',ground:'#103f43',road:'#30383b',curb:'#80f0df',barrier:'#d7e7e4',accent:'#9bff62',surface:'grass',drag:1.08,dust:'#8dbbb3'}},
    career10:{id:'career10',name:'BLACK SUMMIT',type:'CAREER 10 / APEX',description:'Финал первой главы: самая узкая и динамичная трасса, где каждая ошибка ломает рекорд.',targetLength:24000,roadWidth:180,curbWidth:7,barrierMargin:34,
      points:points([[-2150,-730],[-1810,-1030],[-1430,-820],[-1160,-500],[-850,-900],[-500,-1140],[-120,-910],[180,-540],[480,-940],[830,-1130],[1180,-850],[1510,-1050],[1900,-890],[2250,-570],[2330,-210],[2100,30],[1770,-100],[1980,220],[2290,470],[2130,770],[1750,1010],[1390,780],[1120,1010],[760,1110],[450,820],[120,1050],[-220,850],[-480,560],[-800,910],[-1160,1010],[-1500,790],[-1800,930],[-2110,650],[-2190,330],[-1940,80],[-2270,-160],[-1910,-430]]),
      theme:{kind:'alpine',ground:'#233b3a',road:'#2f373b',curb:'#9fc6cf',barrier:'#edf4f4',accent:'#ffffff',surface:'grass',drag:1.12,dust:'#a8c0ba'}},
    career11:{id:'career11',name:'RAIN DISTRICT',type:'CAREER 11 / WET STREET',description:'Мокрый городской маршрут: быстрые дуги, отражающие улицы и серия поздних торможений.',targetLength:25000,roadWidth:178,curbWidth:7,barrierMargin:34,detailLevel:3,
      points:points([[2302,-9],[2442,253],[2297,517],[1561,590],[1284,757],[848,847],[452,927],[23,1060],[-549,1103],[-1032,1043],[-1327,810],[-1788,675],[-2068,480],[-2113,230],[-2163,-8],[-1864,-201],[-1705,-385],[-1567,-586],[-1483,-900],[-1136,-1112],[-536,-1098],[-17,-1048],[444,-980],[964,-972],[1198,-732],[1645,-631],[1859,-423],[2184,-234]]),
      theme:{kind:'neon',ground:'#0b1624',road:'#222a36',curb:'#30d9ed',barrier:'#7c5bd7',accent:'#d765ff',surface:'runoff',drag:.68,dust:'#7895b4'}},
    career12:{id:'career12',name:'RED CANYON',type:'CAREER 12 / CANYON PRO',description:'Красный каньон с обманчиво быстрыми входами, длинной связкой и жёсткой шпилькой.',targetLength:24947,roadWidth:176,curbWidth:7,barrierMargin:34,detailLevel:3,
      points:points([[2156,13],[2098,236],[2312,557],[2012,804],[1795,1088],[1403,1285],[736,1190],[203,1035],[-204,1107],[-688,1133],[-1063,999],[-1627,988],[-1922,775],[-2284,564],[-2579,284],[-2549,-5],[-2467,-287],[-1814,-426],[-1575,-629],[-1299,-773],[-1045,-963],[-712,-1225],[-265,-1439],[300,-1503],[682,-1140],[1165,-1083],[1478,-899],[1832,-739],[2036,-495],[2098,-256]]),
      theme:{kind:'desert',ground:'#a76e42',road:'#323130',curb:'#f09b4f',barrier:'#efc589',accent:'#ff6f3d',surface:'sand',drag:1.48,dust:'#e7b979'}},
    career13:{id:'career13',name:'FROSTLINE',type:'CAREER 13 / ALPINE PRO',description:'Холодный горный круг: узкие перекладки, слепые дуги и ритмичная серия S-поворотов.',targetLength:24895,roadWidth:175,curbWidth:7,barrierMargin:33,detailLevel:3,
      points:points([[2375,-2],[2236,198],[2003,369],[1801,559],[1849,868],[1685,1144],[1126,1231],[553,1246],[-3,1081],[-406,969],[-743,808],[-1215,816],[-1724,793],[-2059,641],[-2651,510],[-2486,237],[-2489,2],[-2389,-216],[-2448,-463],[-2014,-610],[-1573,-723],[-1179,-824],[-725,-825],[-437,-1045],[25,-1004],[514,-1261],[1131,-1228],[1530,-1066],[1824,-842],[1919,-594],[2116,-389],[1960,-182]]),
      theme:{kind:'alpine',ground:'#334b49',road:'#30383b',curb:'#a8cad1',barrier:'#eef4f3',accent:'#b7eeff',surface:'grass',drag:1.10,dust:'#aec7c0'}},
    career14:{id:'career14',name:'OCEAN KNIFE',type:'CAREER 14 / COAST PRO',description:'Побережье с быстрыми гребнями, короткими прямыми и резкими сменами направления.',targetLength:24842,roadWidth:174,curbWidth:7,barrierMargin:33,detailLevel:3,
      points:points([[2046,-7],[2064,209],[2170,425],[2142,705],[2180,1057],[1926,1332],[1290,1307],[731,1293],[226,1327],[-232,1257],[-636,1139],[-1046,1110],[-1342,933],[-1599,771],[-2155,694],[-2473,496],[-2789,262],[-2802,-14],[-2998,-275],[-2526,-511],[-2041,-656],[-1616,-776],[-1243,-862],[-1150,-1175],[-627,-1123],[-220,-1386],[216,-1353],[717,-1290],[1193,-1266],[1726,-1177],[2161,-1003],[2225,-704],[2432,-493],[2142,-212]]),
      theme:{kind:'coast',ground:'#196f7d',road:'#354044',curb:'#58c7d0',barrier:'#e3e9df',accent:'#65f2e5',surface:'sand',drag:1.20,dust:'#e4d3ae'}},
    career15:{id:'career15',name:'INDUSTRIAL LOOP',type:'CAREER 15 / STREET MASTER',description:'Индустриальный сектор: стены близко, торможения поздние, а выходы требуют точной траектории.',targetLength:24789,roadWidth:173,curbWidth:7,barrierMargin:33,detailLevel:3,
      points:points([[1995,2],[2156,219],[2146,432],[1953,609],[1765,800],[1575,997],[1143,1087],[809,1174],[429,1243],[-10,1220],[-315,998],[-657,947],[-953,873],[-1180,759],[-1666,766],[-2082,663],[-2423,476],[-2370,223],[-2373,2],[-2184,-196],[-1851,-368],[-1790,-554],[-1621,-732],[-1484,-946],[-940,-894],[-720,-1100],[-383,-1137],[-19,-1188],[387,-1179],[816,-1229],[1226,-1167],[1500,-974],[1807,-836],[1751,-561],[1760,-340],[1814,-176]]),
      theme:{kind:'neon',ground:'#0b1624',road:'#222a36',curb:'#30d9ed',barrier:'#7c5bd7',accent:'#d765ff',surface:'runoff',drag:.68,dust:'#7895b4'}},
    career16:{id:'career16',name:'SOLAR DUNES',type:'CAREER 16 / DESERT MASTER',description:'Пустынный скоростной экзамен с длинными дугами и серией затяжных технических поворотов.',targetLength:24737,roadWidth:172,curbWidth:7,barrierMargin:33,detailLevel:3,
      points:points([[2316,-9],[2235,231],[2000,428],[1489,510],[1440,759],[1212,1060],[729,1149],[166,1210],[-389,1132],[-856,944],[-1079,706],[-1514,646],[-1877,513],[-2088,314],[-2521,126],[-2271,-107],[-2263,-349],[-1908,-519],[-1852,-785],[-1367,-935],[-744,-861],[-341,-917],[120,-866],[617,-1010],[1020,-872],[1691,-907],[2056,-700],[2194,-474],[2341,-221]]),
      theme:{kind:'desert',ground:'#a76e42',road:'#323130',curb:'#f09b4f',barrier:'#efc589',accent:'#ff6f3d',surface:'sand',drag:1.48,dust:'#e7b979'}},
    career17:{id:'career17',name:'GLACIER PASS',type:'CAREER 17 / MOUNTAIN ELITE',description:'Горный перевал с чередованием тесных шпилек и участков на максимальной скорости.',targetLength:24684,roadWidth:171,curbWidth:7,barrierMargin:32,detailLevel:3,
      points:points([[2928,3],[2551,263],[2132,479],[1661,600],[1499,817],[1233,1040],[779,1099],[385,1209],[-140,1250],[-643,1270],[-1042,1117],[-1728,1141],[-2044,920],[-2183,634],[-2243,372],[-2023,95],[-2152,-125],[-2049,-343],[-2236,-632],[-2037,-910],[-1657,-1128],[-1094,-1160],[-591,-1239],[-144,-1364],[329,-1121],[811,-1090],[1139,-944],[1443,-793],[1916,-673],[2439,-530],[2777,-307]]),
      theme:{kind:'alpine',ground:'#334b49',road:'#30383b',curb:'#a8cad1',barrier:'#eef4f3',accent:'#b7eeff',surface:'grass',drag:1.10,dust:'#aec7c0'}},
    career18:{id:'career18',name:'NIGHT GRID',type:'CAREER 18 / NIGHT MASTER',description:'Плотная ночная сетка улиц: короткий разгон, мгновенное торможение и двойные апексы.',targetLength:24632,roadWidth:170,curbWidth:7,barrierMargin:32,detailLevel:3,
      points:points([[2679,-5],[2868,257],[2929,501],[2315,646],[1909,801],[1500,927],[914,855],[520,914],[92,1032],[-366,1113],[-744,966],[-1320,993],[-1786,882],[-2154,748],[-2758,607],[-2810,371],[-2671,104],[-2033,-85],[-2031,-270],[-1752,-384],[-1765,-596],[-1748,-882],[-1499,-1119],[-1055,-1336],[-389,-1124],[134,-1203],[592,-1060],[1056,-1023],[1365,-831],[1771,-729],[1850,-513],[1970,-347],[2465,-202]]),
      theme:{kind:'neon',ground:'#0b1624',road:'#222a36',curb:'#30d9ed',barrier:'#7c5bd7',accent:'#d765ff',surface:'runoff',drag:.68,dust:'#7895b4'}},
    career19:{id:'career19',name:'TEMPEST COAST',type:'CAREER 19 / GT ELITE',description:'Штормовое побережье с быстрыми связками и узкими выходами после длинных торможений.',targetLength:24579,roadWidth:169,curbWidth:7,barrierMargin:32,detailLevel:3,
      points:points([[1900,4],[1928,213],[1920,426],[1797,635],[1851,980],[1682,1258],[1143,1265],[674,1265],[268,1232],[-82,1222],[-410,1087],[-856,1245],[-1215,1103],[-1416,889],[-1757,783],[-1913,542],[-2171,356],[-2309,125],[-2453,-120],[-2304,-401],[-2039,-593],[-1582,-686],[-1334,-838],[-1084,-1015],[-743,-1052],[-488,-1341],[-101,-1426],[328,-1404],[664,-1276],[1016,-1174],[1489,-1114],[1580,-848],[2117,-783],[2105,-466],[1944,-220]]),
      theme:{kind:'coast',ground:'#196f7d',road:'#354044',curb:'#58c7d0',barrier:'#e3e9df',accent:'#65f2e5',surface:'sand',drag:1.20,dust:'#e4d3ae'}},
    career20:{id:'career20',name:'TITAN RING',type:'CAREER 20 / CHAPTER II FINAL',description:'Финал второй главы: быстрый и тесный круг, где темп нельзя терять ни в одной секции.',targetLength:24526,roadWidth:168,curbWidth:7,barrierMargin:32,detailLevel:3,
      points:points([[2254,5],[2063,189],[1711,322],[1523,434],[1617,666],[1732,991],[1436,1167],[1025,1266],[543,1330],[82,1229],[-255,1067],[-631,1065],[-1061,1064],[-1319,905],[-1772,858],[-1735,590],[-1969,444],[-1852,249],[-2231,94],[-2559,-125],[-2532,-335],[-2581,-586],[-2212,-751],[-1824,-902],[-1119,-793],[-924,-925],[-578,-935],[-292,-1100],[85,-1184],[500,-1188],[875,-1138],[1107,-919],[1711,-1004],[1856,-775],[2275,-642],[2399,-445],[2470,-208]]),
      theme:{kind:'aurora',ground:'#0d393c',road:'#2d3639',curb:'#78eadb',barrier:'#d8e8e3',accent:'#9bff62',surface:'grass',drag:1.08,dust:'#86b5aa'}},
    career21:{id:'career21',name:'OBSIDIAN CITY',type:'CAREER 21 / ELITE STREET',description:'Тёмный мегаполис: узкие коридоры, агрессивные S-секции и минимум места для коррекции.',targetLength:24474,roadWidth:167,curbWidth:7,barrierMargin:31,detailLevel:3,
      points:points([[2181,2],[2021,189],[1899,375],[1641,519],[1678,785],[1456,1098],[883,1173],[275,1158],[-260,1031],[-749,956],[-1019,771],[-1475,709],[-1827,578],[-2069,400],[-2414,233],[-2689,0],[-2666,-254],[-2377,-460],[-2059,-641],[-1512,-706],[-1022,-770],[-647,-829],[-210,-965],[283,-1119],[710,-967],[1328,-986],[1832,-856],[2145,-659],[2412,-477],[2402,-215]]),
      theme:{kind:'neon',ground:'#0b1624',road:'#222a36',curb:'#30d9ed',barrier:'#7c5bd7',accent:'#d765ff',surface:'runoff',drag:.68,dust:'#7895b4'}},
    career22:{id:'career22',name:'VORTEX RIDGE',type:'CAREER 22 / RIDGE ELITE',description:'Высотный маршрут с нестабильным ритмом: длинная дуга мгновенно переходит в техничную связку.',targetLength:24421,roadWidth:166,curbWidth:7,barrierMargin:31,detailLevel:3,
      points:points([[2856,9],[2932,291],[2783,574],[2151,704],[1854,924],[1460,1081],[963,1161],[480,1131],[20,1083],[-484,1134],[-765,934],[-1504,1089],[-2065,1005],[-2459,793],[-2824,577],[-2545,234],[-2285,0],[-1837,-175],[-1965,-398],[-1930,-619],[-1707,-850],[-1421,-1073],[-990,-1201],[-541,-1425],[-10,-1309],[598,-1434],[1075,-1243],[1331,-982],[1596,-767],[1808,-595],[2050,-405],[2192,-209]]),
      theme:{kind:'alpine',ground:'#334b49',road:'#30383b',curb:'#a8cad1',barrier:'#eef4f3',accent:'#b7eeff',surface:'grass',drag:1.10,dust:'#aec7c0'}},
    career23:{id:'career23',name:'PHANTOM BAY',type:'CAREER 23 / COAST ELITE',description:'Бухта с быстрыми переходами, длинными апексами и тяжёлыми зонами торможения.',targetLength:24368,roadWidth:165,curbWidth:7,barrierMargin:31,detailLevel:3,
      points:points([[2369,3],[2212,213],[1926,388],[1566,503],[1501,707],[1410,939],[919,955],[553,973],[210,1052],[-204,1073],[-557,1044],[-1121,1159],[-1494,1023],[-1700,791],[-1973,611],[-1850,366],[-1828,180],[-1827,1],[-2066,-209],[-2104,-401],[-1922,-597],[-1733,-816],[-1322,-909],[-1088,-1116],[-559,-1038],[-214,-1163],[226,-1101],[553,-966],[852,-851],[1140,-759],[1529,-719],[1723,-541],[2417,-468],[2485,-233]]),
      theme:{kind:'coast',ground:'#196f7d',road:'#354044',curb:'#58c7d0',barrier:'#e3e9df',accent:'#65f2e5',surface:'sand',drag:1.20,dust:'#e4d3ae'}},
    career24:{id:'career24',name:'IRON SERPENT',type:'CAREER 24 / PRECISION ELITE',description:'Железный серпантин: серия поворотов разного радиуса без полноценной зоны отдыха.',targetLength:24316,roadWidth:164,curbWidth:7,barrierMargin:31,detailLevel:3,
      points:points([[2654,13],[2271,240],[2016,413],[1527,506],[1484,713],[1523,1030],[1101,1112],[815,1265],[439,1385],[0,1398],[-398,1234],[-850,1360],[-1236,1261],[-1566,1061],[-1999,977],[-1821,604],[-1841,387],[-1750,181],[-2079,-11],[-2211,-221],[-2412,-497],[-2371,-795],[-2040,-988],[-1717,-1202],[-1047,-1050],[-782,-1228],[-401,-1228],[-2,-1231],[394,-1247],[782,-1210],[1043,-1044],[1240,-854],[1835,-880],[2038,-680],[2420,-515],[2737,-259]]),
      theme:{kind:'aurora',ground:'#0d393c',road:'#2d3639',curb:'#78eadb',barrier:'#d8e8e3',accent:'#9bff62',surface:'grass',drag:1.08,dust:'#86b5aa'}},
    career25:{id:'career25',name:'ARCTIC EDGE',type:'CAREER 25 / APEX ELITE',description:'Холодная трасса на грани сцепления: узкая дорога и быстрые связки требуют идеальной линии.',targetLength:24263,roadWidth:163,curbWidth:7,barrierMargin:30,detailLevel:3,
      points:points([[2353,2],[2636,230],[2784,479],[2414,628],[2199,836],[1829,977],[1265,950],[854,959],[555,1049],[169,1112],[-167,1017],[-596,1152],[-942,1068],[-1204,914],[-1749,936],[-2045,768],[-2406,620],[-2481,405],[-2865,246],[-2423,-13],[-2320,-185],[-1800,-308],[-1660,-427],[-1693,-638],[-1379,-722],[-1414,-1037],[-1049,-1172],[-637,-1221],[-193,-1277],[210,-1190],[626,-1239],[937,-1045],[1540,-1155],[1659,-874],[1711,-665],[1892,-496],[1972,-331],[1945,-170]]),
      theme:{kind:'alpine',ground:'#334b49',road:'#30383b',curb:'#a8cad1',barrier:'#eef4f3',accent:'#b7eeff',surface:'grass',drag:1.10,dust:'#aec7c0'}},
    career26:{id:'career26',name:'CRIMSON MAZE',type:'CAREER 26 / MASTER+',description:'Красный лабиринт поворотов: ложные апексы, быстрые перекладки и тяжёлые торможения.',targetLength:24211,roadWidth:162,curbWidth:7,barrierMargin:30,detailLevel:3,
      points:points([[2739,-12],[2774,231],[2670,481],[2036,587],[1808,790],[1515,994],[866,949],[345,919],[-122,939],[-574,910],[-925,797],[-1632,866],[-2246,809],[-2573,601],[-2908,376],[-2558,95],[-2373,-90],[-1952,-245],[-2032,-458],[-1865,-660],[-1492,-782],[-1152,-969],[-695,-1070],[-154,-1224],[377,-1083],[961,-1087],[1311,-885],[1525,-662],[1671,-489],[1975,-345],[2389,-208]]),
      theme:{kind:'desert',ground:'#a76e42',road:'#323130',curb:'#f09b4f',barrier:'#efc589',accent:'#ff6f3d',surface:'sand',drag:1.48,dust:'#e7b979'}},
    career27:{id:'career27',name:'STORM CIRCUIT',type:'CAREER 27 / MASTER+',description:'Динамичный штормовой круг: высокие скорости сочетаются с очень короткими зонами реакции.',targetLength:24158,roadWidth:161,curbWidth:7,barrierMargin:30,detailLevel:3,
      points:points([[2605,-13],[2295,238],[2010,453],[1464,538],[1390,777],[1234,987],[886,1079],[528,1235],[110,1219],[-318,1298],[-657,1096],[-1213,1225],[-1582,1065],[-1838,841],[-2113,620],[-1944,320],[-1925,118],[-1689,-84],[-1995,-344],[-2106,-638],[-1883,-867],[-1553,-1032],[-1131,-1124],[-794,-1277],[-269,-1120],[105,-1205],[506,-1215],[868,-1094],[1114,-882],[1486,-811],[1737,-635],[1876,-443],[2659,-288]]),
      theme:{kind:'coast',ground:'#196f7d',road:'#354044',curb:'#58c7d0',barrier:'#e3e9df',accent:'#65f2e5',surface:'sand',drag:1.20,dust:'#e4d3ae'}},
    career28:{id:'career28',name:'VOID RUN',type:'CAREER 28 / NIGHT APEX',description:'Почти безошибочный ночной заезд: плотные стены, сложные S-секции и высокий средний темп.',targetLength:24105,roadWidth:160,curbWidth:7,barrierMargin:30,detailLevel:3,
      points:points([[2534,-8],[2594,238],[2242,396],[1792,520],[1777,740],[1500,907],[1091,963],[728,1045],[265,1016],[-79,1010],[-457,942],[-934,1031],[-1490,1075],[-1947,960],[-2337,800],[-2127,488],[-2179,279],[-1793,75],[-2098,-95],[-2099,-283],[-1975,-446],[-1835,-657],[-1543,-790],[-1427,-1025],[-877,-966],[-529,-1138],[-138,-1267],[332,-1198],[750,-1083],[1035,-935],[1191,-728],[1371,-568],[1815,-522],[2135,-394],[2554,-217]]),
      theme:{kind:'neon',ground:'#0b1624',road:'#222a36',curb:'#30d9ed',barrier:'#7c5bd7',accent:'#d765ff',surface:'runoff',drag:.68,dust:'#7895b4'}},
    career29:{id:'career29',name:'APEX INFERNO',type:'CAREER 29 / FINAL TRIAL',description:'Предфинальный экзамен: длинные скоростные дуги разбиваются резкими техническими секциями.',targetLength:24053,roadWidth:158,curbWidth:6,barrierMargin:30,detailLevel:3,
      points:points([[2023,-11],[2294,212],[2406,470],[2191,651],[2139,957],[1925,1192],[1356,1174],[989,1304],[530,1323],[132,1370],[-307,1215],[-632,1157],[-977,1079],[-1187,890],[-1749,899],[-2031,733],[-2427,589],[-2613,356],[-2870,129],[-2782,-144],[-2451,-357],[-2087,-511],[-1714,-633],[-1633,-866],[-1222,-917],[-1076,-1195],[-735,-1277],[-285,-1317],[105,-1285],[531,-1323],[986,-1357],[1340,-1155],[1971,-1248],[1975,-861],[2024,-626],[1954,-373],[2003,-176]]),
      theme:{kind:'aurora',ground:'#0d393c',road:'#2d3639',curb:'#78eadb',barrier:'#d8e8e3',accent:'#9bff62',surface:'grass',drag:1.08,dust:'#86b5aa'}},
    career30:{id:'career30',name:'FINAL ASCENT',type:'CAREER 30 / APEX ZERO',description:'Финал третьей главы: самая требовательная трасса карьеры — точность, скорость и стабильность без ошибок.',targetLength:24000,roadWidth:156,curbWidth:6,barrierMargin:30,detailLevel:3,
      points:points([[2709,-3],[2622,201],[2542,389],[2113,516],[2137,762],[1815,871],[1279,846],[951,931],[586,985],[278,1026],[-77,1029],[-580,1304],[-1079,1363],[-1610,1268],[-1918,1086],[-1990,825],[-2124,641],[-1954,382],[-2317,274],[-2316,96],[-2492,-101],[-2451,-273],[-2298,-468],[-2299,-663],[-1782,-727],[-1653,-948],[-1473,-1193],[-1035,-1295],[-614,-1359],[-87,-1241],[291,-1166],[542,-905],[877,-886],[1221,-811],[1555,-744],[2116,-739],[2427,-590],[2751,-433],[2501,-196]]),
      theme:{kind:'alpine',ground:'#334b49',road:'#30383b',curb:'#a8cad1',barrier:'#eef4f3',accent:'#b7eeff',surface:'grass',drag:1.10,dust:'#aec7c0'}}
  };
  R.CAREER_LEVELS=Object.freeze([
    {level:1,trackId:'career01',gold:112,silver:123,bronze:138,rewards:{gold:1800,silver:1350,bronze:900}},
    {level:2,trackId:'career02',gold:108,silver:119,bronze:134,rewards:{gold:2200,silver:1650,bronze:1100}},
    {level:3,trackId:'career03',gold:104,silver:115,bronze:130,rewards:{gold:2600,silver:1950,bronze:1300}},
    {level:4,trackId:'career04',gold:100,silver:111,bronze:126,rewards:{gold:3000,silver:2250,bronze:1500}},
    {level:5,trackId:'career05',gold:96,silver:107,bronze:122,rewards:{gold:3400,silver:2550,bronze:1700}},
    {level:6,trackId:'career06',gold:92,silver:103,bronze:118,rewards:{gold:3900,silver:2925,bronze:1950}},
    {level:7,trackId:'career07',gold:88,silver:99,bronze:114,rewards:{gold:4400,silver:3300,bronze:2200}},
    {level:8,trackId:'career08',gold:84,silver:95,bronze:110,rewards:{gold:5000,silver:3750,bronze:2500}},
    {level:9,trackId:'career09',gold:80,silver:91,bronze:106,rewards:{gold:5700,silver:4275,bronze:2850}},
    {level:10,trackId:'career10',gold:76,silver:87,bronze:102,rewards:{gold:6500,silver:4875,bronze:3250}},
    {level:11,trackId:'career11',gold:74,silver:85,bronze:100,rewards:{gold:7200,silver:5400,bronze:3600}},
    {level:12,trackId:'career12',gold:73,silver:84,bronze:99,rewards:{gold:7650,silver:5750,bronze:3825}},
    {level:13,trackId:'career13',gold:72,silver:83,bronze:98,rewards:{gold:8100,silver:6075,bronze:4050}},
    {level:14,trackId:'career14',gold:71,silver:82,bronze:97,rewards:{gold:8550,silver:6400,bronze:4275}},
    {level:15,trackId:'career15',gold:70,silver:81,bronze:96,rewards:{gold:9000,silver:6750,bronze:4500}},
    {level:16,trackId:'career16',gold:69,silver:80,bronze:95,rewards:{gold:9450,silver:7100,bronze:4725}},
    {level:17,trackId:'career17',gold:68,silver:79,bronze:94,rewards:{gold:9900,silver:7425,bronze:4950}},
    {level:18,trackId:'career18',gold:67,silver:78,bronze:93,rewards:{gold:10350,silver:7750,bronze:5175}},
    {level:19,trackId:'career19',gold:66,silver:77,bronze:92,rewards:{gold:10800,silver:8100,bronze:5400}},
    {level:20,trackId:'career20',gold:65,silver:76,bronze:91,rewards:{gold:11250,silver:8450,bronze:5625}},
    {level:21,trackId:'career21',gold:64,silver:75,bronze:90,rewards:{gold:11700,silver:8775,bronze:5850}},
    {level:22,trackId:'career22',gold:63,silver:74,bronze:89,rewards:{gold:12150,silver:9100,bronze:6075}},
    {level:23,trackId:'career23',gold:62,silver:73,bronze:88,rewards:{gold:12600,silver:9450,bronze:6300}},
    {level:24,trackId:'career24',gold:61,silver:72,bronze:87,rewards:{gold:13050,silver:9800,bronze:6525}},
    {level:25,trackId:'career25',gold:60,silver:71,bronze:86,rewards:{gold:13500,silver:10125,bronze:6750}},
    {level:26,trackId:'career26',gold:59,silver:70,bronze:85,rewards:{gold:13950,silver:10450,bronze:6975}},
    {level:27,trackId:'career27',gold:58,silver:69,bronze:84,rewards:{gold:14400,silver:10800,bronze:7200}},
    {level:28,trackId:'career28',gold:57,silver:68,bronze:83,rewards:{gold:14850,silver:11150,bronze:7425}},
    {level:29,trackId:'career29',gold:56,silver:67,bronze:82,rewards:{gold:15300,silver:11475,bronze:7650}},
    {level:30,trackId:'career30',gold:55,silver:66,bronze:81,rewards:{gold:15750,silver:11800,bronze:7875}}
  ].map(Object.freeze));
  R.getCareerLevel=level=>R.CAREER_LEVELS[Math.max(1,Math.min(R.CAREER_LEVELS.length,Math.round(Number(level)||1)))-1];
  R.careerTimeTier=function(level,timeSeconds){const c=R.getCareerLevel(level),t=Number(timeSeconds);if(!Number.isFinite(t)||t<=0)return null;if(t<=c.gold)return'gold';if(t<=c.silver)return'silver';if(t<=c.bronze)return'bronze';return null;};

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
  // Legacy starter liveries remain valid for old velocityApex.v1 saves, but stay out of the new 42-car shop catalog.
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
    {id:"aston-martin-valkyrie-mary",name:"Mary",category:"lux",primary:"#ff3fae",secondary:"#141018",accent:"#ffe3f4",stripe:"#ff9bd3",bodyColor:"#ff3fae",sprite:{src:"assets/cars/aston-martin-valkyrie-mary.webp",thumbnail:"assets/cars/aston-martin-valkyrie-mary-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}},
    {id:"apollo-evo",name:"Apollo EVO",category:"lux",primary:"#ff5a0a",secondary:"#11161a",accent:"#f5f7f6",stripe:"#ffb24a",bodyColor:"#ff5a0a",limited:true,performance:{maxSpeed:558,accel:428,brakePower:560,turnRate:2.52,drift:.94},upgrades:{speed:{step:.028,priceFactor:1.08},acceleration:{step:.064,priceFactor:1.20},brakes:{step:.072,priceFactor:.90}},sprite:{src:"assets/cars/apollo-evo.webp",thumbnail:"assets/cars/apollo-evo-thumbnail.webp",preserveAspectRatio:true,orientation:'nose-right'}}
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
    "aston-martin-valkyrie-mary":280000,
    "apollo-evo":318000
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
    "ferrari-enzo":1.06,
    "apollo-evo":1.06
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
    "aston-martin-valkyrie-mary":geo(79.4,34.7,1.23,0.989,86.6,39.0,0.7,0,0.52,0.0),
    "apollo-evo":geo(67.4,44.3,1.25,1.10,92.0,44.0,0.9,0,0.7,0.0)
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
  const CASE_ORDER=['all','basic','sport','premium','rare','legendary','lux','effects'];
  const CASE_META={
    all:{name:'APEX OMNI',label:'ОБЩИЙ',subtitle:'МАШИНЫ + ЭФФЕКТЫ',accent:'#D9FFF0',description:'Все платные эффекты и 42 автомобиля. Топовые классы выпадают крайне редко.'},
    basic:{name:'BASIC GRID',label:'BASIC',subtitle:'СТАРТОВЫЙ КЛАСС',accent:R.CAR_CATEGORIES.basic.color,description:'Автомобили BASIC. Более дорогие модели имеют меньший шанс.'},
    sport:{name:'SPORT RUSH',label:'SPORT',subtitle:'СПОРТИВНЫЙ КЛАСС',accent:R.CAR_CATEGORIES.sport.color,description:'Только автомобили SPORT с шансами, рассчитанными по стоимости.'},
    premium:{name:'PREMIUM VAULT',label:'PREMIUM',subtitle:'ПРЕМИАЛЬНЫЙ КЛАСС',accent:R.CAR_CATEGORIES.premium.color,description:'Только автомобили PREMIUM.'},
    rare:{name:'REDLINE RARE',label:'RARE',subtitle:'РЕДКИЙ КЛАСС',accent:R.CAR_CATEGORIES.rare.color,description:'Только автомобили RARE.'},
    legendary:{name:'LEGEND VAULT',label:'LEGENDARY',subtitle:'ЛЕГЕНДАРНЫЙ КЛАСС',accent:R.CAR_CATEGORIES.legendary.color,description:'Только автомобили LEGENDARY.'},
    lux:{name:'LUX APEX',label:'LUX',subtitle:'ВЕРШИНА КОЛЛЕКЦИИ',accent:R.CAR_CATEGORIES.lux.color,description:'Только автомобили LUX. Самый дорогой кейс с самым ценным пулом.'},
    effects:{name:'EFFECT LAB',label:'EFFECTS',subtitle:'ВИЗУАЛЬНЫЕ ЭФФЕКТЫ',accent:'#61E8FF',description:'Все платные эффекты выхлопа, включая RAINBOW / IRIDESCENT.'}
  };
  const caseReward=(kind,id,item)=>Object.freeze({kind,id,name:item.name,price:item.price,category:kind==='livery'?R.normalizeCarCategory(item.category):'effect',thumbnail:kind==='livery'&&item.sprite?item.sprite.thumbnail:null,outer:item.outer||null,inner:item.inner||null,rainbow:!!item.rainbow});
  const carCaseRewards=category=>R.REAL_CAR_IDS.map(id=>[id,R.LIVERIES[id]]).filter(([,item])=>R.normalizeCarCategory(item.category)===category).map(([id,item])=>caseReward('livery',id,item));
  const effectCaseRewards=()=>Object.entries(R.EFFECTS).filter(([,item])=>item.price>0).map(([id,item])=>caseReward('effect',id,item));
  const allocateCaseBasisPoints=(rewards,weightFn)=>{
    const weighted=rewards.map((reward,index)=>({index,weight:Math.max(Number.EPSILON,Number(weightFn(reward))||0)})),total=weighted.reduce((sum,x)=>sum+x.weight,0);
    const rows=weighted.map(x=>{const exact=x.weight/total*10000,floor=Math.floor(exact);return {...x,exact,bps:floor,fraction:exact-floor};});
    let remainder=10000-rows.reduce((sum,x)=>sum+x.bps,0);
    [...rows].sort((a,b)=>b.fraction-a.fraction||a.index-b.index).slice(0,remainder).forEach(x=>rows[x.index].bps++);
    return rewards.map((reward,index)=>Object.freeze({...reward,chanceBps:rows[index].bps}));
  };
  const niceRound=value=>{const v=Math.max(1,Number(value)||1),step=v<10000?100:v<100000?500:1000;return Math.max(step,Math.round(v/step)*step);};
  const buildCase=(id,rewards)=>{
    const general=id==='all';
    const minPrice=Math.min(...rewards.map(x=>x.price));
    const weighted=allocateCaseBasisPoints(rewards,reward=>general?Math.pow(2500/(reward.price+2500),1.2):Math.pow((minPrice+(id==='effects'?500:0))/(reward.price+(id==='effects'?500:0)),1.15));
    const expectedValue=weighted.reduce((sum,reward)=>sum+reward.price*(reward.chanceBps/10000),0);
    const maxPrice=Math.max(...weighted.map(x=>x.price)),markup=general?1.32:id==='effects'?1.22:1.18;
    const ceiling=(!general&&id!=='effects')?maxPrice*.93:Infinity;
    const price=niceRound(Math.min(expectedValue*markup,ceiling));
    return Object.freeze({...CASE_META[id],id,price,expectedValue:Math.round(expectedValue),rewards:Object.freeze(weighted)});
  };
  const caseMap={};
  for(const id of CASE_ORDER){
    const rewards=id==='all'?[...R.REAL_CAR_IDS.map(carId=>caseReward('livery',carId,R.LIVERIES[carId])),...effectCaseRewards()]:id==='effects'?effectCaseRewards():carCaseRewards(id);
    caseMap[id]=buildCase(id,rewards);
  }
  R.CASE_ORDER=Object.freeze(CASE_ORDER.slice());
  R.CASES=Object.freeze(caseMap);
  R.getCaseRewards=caseId=>R.CASES[caseId]?R.CASES[caseId].rewards:[];
  R.caseDuplicateCompensation=price=>{const raw=Math.max(0,(Number(price)||0)*.35),step=raw<10000?50:100;return Math.max(step,Math.round(raw/step)*step);};
  R.buyCase=function(save,caseId){
    const box=R.CASES[caseId];if(!box||!save||typeof save!=='object')return 'invalid';
    if(!Number.isFinite(save.credits)||save.credits<box.price)return 'insufficient';
    if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};
    save.credits-=box.price;save.caseInventory[caseId]=Math.max(0,Math.floor(Number(save.caseInventory[caseId])||0))+1;return 'purchased';
  };
  R.buyCases=function(save,caseId,quantity=1){
    const box=R.CASES[caseId],qty=Math.floor(Number(quantity));if(!box||!save||typeof save!=='object'||!Number.isFinite(qty)||qty<1||qty>10)return {status:'invalid',quantity:0,cost:0};
    const cost=box.price*qty;if(!Number.isFinite(save.credits)||save.credits<cost)return {status:'insufficient',quantity:qty,cost};
    if(!save.caseInventory||typeof save.caseInventory!=='object'||Array.isArray(save.caseInventory))save.caseInventory={};
    const owned=Math.max(0,Math.floor(Number(save.caseInventory[caseId])||0));if(owned+qty>999)return {status:'limit',quantity:qty,cost};
    save.credits-=cost;save.caseInventory[caseId]=owned+qty;return {status:'purchased',quantity:qty,cost,remaining:save.caseInventory[caseId]};
  };
  R.openCase=function(save,caseId,rng=Math.random){
    const box=R.CASES[caseId];if(!box||!save||typeof save!=='object')return {status:'invalid'};
    const inventory=save.caseInventory&&typeof save.caseInventory==='object'?save.caseInventory:null,count=inventory?Math.max(0,Math.floor(Number(inventory[caseId])||0)):0;
    if(count<1)return {status:'empty'};
    let roll;try{roll=Number(rng());}catch(e){roll=Math.random();}if(!Number.isFinite(roll))roll=Math.random();roll=Math.max(0,Math.min(.999999999999,roll));
    let ticket=Math.floor(roll*10000),reward=box.rewards[box.rewards.length-1];
    for(const candidate of box.rewards){if(ticket<candidate.chanceBps){reward=candidate;break;}ticket-=candidate.chanceBps;}
    inventory[caseId]=count-1;
    const ownedKey=reward.kind==='livery'?'ownedLiveries':'ownedEffects';
    if(!Array.isArray(save[ownedKey]))save[ownedKey]=[];
    const duplicate=save[ownedKey].includes(reward.id);let compensation=0;
    if(duplicate){compensation=R.caseDuplicateCompensation(reward.price);save.credits=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(Number(save.credits)||0))+compensation);}
    else save[ownedKey].push(reward.id);
    return {status:'opened',caseId,reward,duplicate,compensation,chanceBps:reward.chanceBps,remaining:inventory[caseId]};
  };
  R.openCases=function(save,caseId,quantity=1,rng=Math.random){
    const box=R.CASES[caseId],requested=Math.floor(Number(quantity));if(!box||!save||typeof save!=='object'||!Number.isFinite(requested)||requested<1||requested>10)return {status:'invalid',results:[],opened:0,remaining:0};
    const inventory=save.caseInventory&&typeof save.caseInventory==='object'?save.caseInventory:null,count=inventory?Math.max(0,Math.floor(Number(inventory[caseId])||0)):0,qty=Math.min(requested,count,10);
    if(qty<1)return {status:'empty',results:[],opened:0,remaining:count};
    const results=[];for(let i=0;i<qty;i++){const result=R.openCase(save,caseId,rng);if(result.status!=='opened')break;results.push(result);}
    return {status:results.length?'opened':'empty',results,opened:results.length,remaining:Math.max(0,Math.floor(Number(save.caseInventory?.[caseId])||0))};
  };
  R.DIFFICULTY_LABELS={easy:'ЛЕГКО',medium:'СРЕДНЕ',hard:'СЛОЖНО',extreme:'ЭКСТРИМ'};
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const safeNumber=(v,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,v)):fallback;
  // Per-car tuning: deterministic category/price balance, shared by every mode.
  R.UPGRADE_TYPES=Object.freeze({
    speed:{name:'Трансмиссия',description:'Повышает максимальную скорость',stat:'maxSpeed',step:.03,priceFactor:1},
    acceleration:{name:'Двигатель',description:'Ускоряет набор скорости',stat:'accel',step:.06,priceFactor:1.15},
    brakes:{name:'Тормоза',description:'Сокращает тормозной путь',stat:'brakePower',step:.07,priceFactor:.8}
  });
  R.UPGRADE_MAX_LEVEL=5;
  const tuningBands={basic:[300,335,190,220,310,340],sport:[350,385,230,265,350,380],premium:[400,430,275,310,390,420],rare:[445,475,320,350,430,465],legendary:[490,520,360,390,475,510],lux:[535,555,400,420,520,550]};
  R.CAR_PERFORMANCE=Object.freeze(Object.fromEntries(Object.entries(R.LIVERIES).map(([id,item])=>{
    const category=R.normalizeCarCategory(item.category),band=tuningBands[category]||tuningBands.basic;
    const prices=Object.values(R.LIVERIES).filter(c=>R.normalizeCarCategory(c.category)===category).map(c=>c.price||0);
    const low=Math.min(...prices),high=Math.max(...prices),t=high===low?.5:Math.max(0,Math.min(1,((item.price||0)-low)/(high-low)));
    const mix=(a,b)=>Math.round(a+(b-a)*t),generated={maxSpeed:mix(band[0],band[1]),accel:mix(band[2],band[3]),brakePower:mix(band[4],band[5]),turnRate:2.40,drift:1};
    return [id,Object.freeze({...generated,...(item.performance||{})})];
  })));
  R.getUpgradeLevels=function(save,id){
    const raw=save?.carUpgrades?.[id];
    return Object.fromEntries(Object.keys(R.UPGRADE_TYPES).map(key=>[key,Number.isInteger(raw?.[key])?Math.max(0,Math.min(5,raw[key])):0]));
  };
  R.carAvailable=id=>window.VelocityAccount?.isAdmin||!(R.ownerCars?.[id]?.enabled===false||R.ownerCars?.[id]?.unavailable);
  R.getCarPerformance=function(id,save,personal=true){
    const base={...(R.CAR_PERFORMANCE[id]||R.CAR_PERFORMANCE.apexLime),...(R.ownerCars?.[id]||{})},result={maxSpeed:base.maxSpeed,accel:base.accel,brakePower:base.brakePower,turnRate:base.turnRate,drift:base.drift||1},levels=R.getUpgradeLevels(save,id);
    for(const [key,type] of Object.entries(R.UPGRADE_TYPES)){const tune=R.ownerCars?.[id]?.upgrades?.[key]||R.LIVERIES[id]?.upgrades?.[key]||type;result[type.stat]=Math.round(base[type.stat]*(1+levels[key]*(tune.step??type.step)));}
    if(personal)Object.assign(result,R.ownerTuning?.[id]||{});return result;
  };
  R.applyCarPerformance=function(car,id,save){if(!R.carAvailable(id))id='apexLime';const stats=R.getCarPerformance(id,save,car.player!==false);Object.assign(car,stats);car.baseMaxSpeed=stats.maxSpeed;return stats;};
  R.getUpgradeCost=function(id,key,level){
    if(!has(R.LIVERIES,id)||!has(R.UPGRADE_TYPES,key)||!Number.isInteger(level)||level<0||level>=5)return null;
    const tune=R.ownerCars?.[id]?.upgrades?.[key]||R.LIVERIES[id]?.upgrades?.[key]||R.UPGRADE_TYPES[key];
    return Math.ceil(Math.max(2800,R.LIVERIES[id].basePrice??R.LIVERIES[id].price??0)*[.04,.07,.11,.16,.22][level]*(tune.priceFactor??R.UPGRADE_TYPES[key].priceFactor)/10)*10;
  };
  // expectedLevel prevents double taps or stale purchase buttons buying another level.
  R.buyCarUpgrade=function(save,id,key,expectedLevel){
    if(!has(R.LIVERIES,id)||!has(R.UPGRADE_TYPES,key)||!save?.ownedLiveries?.includes(id))return {status:'invalid'};
    const levels=R.getUpgradeLevels(save,id),level=levels[key];
    if(level>=5)return {status:'max'};
    if(expectedLevel!==level)return {status:'stale'};
    const cost=R.getUpgradeCost(id,key,level);
    if(!Number.isFinite(save.credits)||save.credits<cost)return {status:'insufficient'};
    if(!save.carUpgrades||typeof save.carUpgrades!=='object'||Array.isArray(save.carUpgrades))save.carUpgrades={};
    save.credits-=cost;levels[key]++;save.carUpgrades[id]=levels;
    return {status:'purchased',cost,level:levels[key]};
  };

  R.CAR_COLORS=Object.freeze([
    Object.freeze({id:'stock',name:'ЗАВОДСКОЙ',hex:null,multiplier:0}),
    Object.freeze({id:'obsidian',name:'OBSIDIAN',hex:'#161a1d',multiplier:1.00}),
    Object.freeze({id:'arctic',name:'ARCTIC',hex:'#eef3f4',multiplier:1.00}),
    Object.freeze({id:'apex-lime',name:'APEX LIME',hex:'#8dff49',multiplier:1.08}),
    Object.freeze({id:'velocity-red',name:'VELOCITY RED',hex:'#ff334f',multiplier:1.08}),
    Object.freeze({id:'electric-blue',name:'ELECTRIC BLUE',hex:'#39a9ff',multiplier:1.08}),
    Object.freeze({id:'royal-purple',name:'ROYAL PURPLE',hex:'#9c63ff',multiplier:1.12}),
    Object.freeze({id:'sunset-orange',name:'SUNSET ORANGE',hex:'#ff7a2f',multiplier:1.08}),
    Object.freeze({id:'champagne',name:'CHAMPAGNE',hex:'#d8c7a0',multiplier:1.16}),
    Object.freeze({id:'queen-pink',name:'QUEEN PINK',hex:'#ff4fb8',multiplier:1.16})
  ]);
  R.CAR_COLOR_MAP=Object.freeze(Object.fromEntries(R.CAR_COLORS.map(x=>[x.id,x])));
  R.VINYLS=Object.freeze([
    Object.freeze({id:'none',name:'БЕЗ ВИНИЛА',description:'Чистый кузов',multiplier:0}),
    Object.freeze({id:'racing-stripe',name:'RACING STRIPE',description:'Двойная продольная полоса',multiplier:.018}),
    Object.freeze({id:'apex-cut',name:'APEX CUT',description:'Резкие диагональные акценты',multiplier:.024}),
    Object.freeze({id:'carbon-edge',name:'CARBON EDGE',description:'Тёмные боковые панели',multiplier:.030}),
    Object.freeze({id:'neon-slash',name:'NEON SLASH',description:'Контрастные неоновые штрихи',multiplier:.038}),
    Object.freeze({id:'heritage',name:'HERITAGE',description:'Классическая центральная графика',multiplier:.045}),
    Object.freeze({id:'velocity-wave',name:'VELOCITY WAVE',description:'Динамичная волна по кузову',multiplier:.052})
  ]);
  R.VINYL_MAP=Object.freeze(Object.fromEntries(R.VINYLS.map(x=>[x.id,x])));
  const safeCustomization=(raw,item)=>{
    const colorId=R.CAR_COLOR_MAP[raw?.colorId]?raw.colorId:'stock',vinylId=R.VINYL_MAP[raw?.vinylId]?raw.vinylId:'none';
    const ownedColors=Array.from(new Set(['stock',...(Array.isArray(raw?.ownedColors)?raw.ownedColors.filter(id=>R.CAR_COLOR_MAP[id]):[])]));
    const ownedVinyls=Array.from(new Set(['none',...(Array.isArray(raw?.ownedVinyls)?raw.ownedVinyls.filter(id=>R.VINYL_MAP[id]):[])]));
    return {colorId:ownedColors.includes(colorId)?colorId:'stock',vinylId:ownedVinyls.includes(vinylId)?vinylId:'none',ownedColors,ownedVinyls};
  };
  R.getCarCustomization=function(save,id){return safeCustomization(save?.carCustomizations?.[id],R.LIVERIES[id]);};
  R.getCarStyleByIds=function(colorId='stock',vinylId='none'){
    const color=R.CAR_COLOR_MAP[colorId]||R.CAR_COLOR_MAP.stock,vinyl=R.VINYL_MAP[vinylId]||R.VINYL_MAP.none;
    return {colorId:color.id,color:color.hex,vinylId:vinyl.id,vinyl};
  };
  R.getCarStyle=function(save,id){const c=R.getCarCustomization(save,id);return R.getCarStyleByIds(c.colorId,c.vinylId);};
  R.getPaintCost=function(id,colorId){
    if(!has(R.LIVERIES,id)||!R.CAR_COLOR_MAP[colorId]||colorId==='stock')return 0;
    const price=Math.max(2800,Number(R.LIVERIES[id].basePrice??R.LIVERIES[id].price)||0),mult=R.CAR_COLOR_MAP[colorId].multiplier||1;
    return Math.ceil(Math.max(250,price*.012*mult)/50)*50;
  };
  R.getVinylCost=function(id,vinylId){
    if(!has(R.LIVERIES,id)||!R.VINYL_MAP[vinylId]||vinylId==='none')return 0;
    const price=Math.max(2800,Number(R.LIVERIES[id].basePrice??R.LIVERIES[id].price)||0),mult=R.VINYL_MAP[vinylId].multiplier||.02;
    return Math.ceil(Math.max(450,price*mult)/50)*50;
  };
  R.buyCarStyle=function(save,id,kind,value){
    if(!save?.ownedLiveries?.includes(id)||!has(R.LIVERIES,id))return {status:'invalid'};
    if(!save.carCustomizations||typeof save.carCustomizations!=='object'||Array.isArray(save.carCustomizations))save.carCustomizations={};
    const c=safeCustomization(save.carCustomizations[id],R.LIVERIES[id]);
    const isColor=kind==='color',catalog=isColor?R.CAR_COLOR_MAP:R.VINYL_MAP,ownedKey=isColor?'ownedColors':'ownedVinyls',selectedKey=isColor?'colorId':'vinylId';
    if(!catalog[value])return {status:'invalid'};
    if(c[ownedKey].includes(value)){c[selectedKey]=value;save.carCustomizations[id]=c;return {status:'applied',cost:0};}
    const cost=isColor?R.getPaintCost(id,value):R.getVinylCost(id,value);
    if(!Number.isFinite(save.credits)||save.credits<cost)return {status:'insufficient',cost};
    save.credits-=cost;c[ownedKey].push(value);c[selectedKey]=value;save.carCustomizations[id]=c;return {status:'purchased',cost};
  };
  R.normalizeSave=function(raw){
    const d=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    const own=(value,catalog,free)=>Array.from(new Set([free,...(Array.isArray(value)?value.filter(id=>typeof id==='string'&&has(catalog,id)):[])]));
    const ownedLiveries=own(d.ownedLiveries,R.LIVERIES,'apexLime'),ownedEffects=own(d.ownedEffects,R.EFFECTS,'standard');
    const controlMode=['arrows','tilt','wheel'].includes(d.controlMode)?d.controlMode:'arrows';
    const tiltSensitivity=['low','medium','high'].includes(d.tiltSensitivity)?d.tiltSensitivity:'medium';
    const rawCases=d.caseInventory&&typeof d.caseInventory==='object'&&!Array.isArray(d.caseInventory)?d.caseInventory:{};
    const caseInventory=Object.fromEntries(R.CASE_ORDER.map(id=>[id,Math.max(0,Math.min(999,Math.floor(safeNumber(rawCases[id]))))]));
    return {saveVersion:6,bestScore:safeNumber(d.bestScore),bestLap:safeNumber(d.bestLap),bestDriftScore:Math.floor(safeNumber(d.bestDriftScore)),maxLaps:Math.floor(safeNumber(d.maxLaps)),muted:!!d.muted,
      botCount:Math.max(1,Math.min(13,Math.round(safeNumber(d.botCount,7)))),raceLaps:[3,5,7,10,15].includes(d.raceLaps)?d.raceLaps:5,
      difficulty:has(R.DIFFICULTY_LABELS,d.difficulty)?d.difficulty:'medium',trackId:has(R.TRACKS,d.trackId)?d.trackId:'apexCircuit',
      driftBotCount:Math.max(1,Math.min(13,Math.round(safeNumber(d.driftBotCount,d.botCount??7)))),driftDifficulty:has(R.DIFFICULTY_LABELS,d.driftDifficulty)?d.driftDifficulty:'medium',driftTrackId:has(R.DRIFT_TRACKS,d.driftTrackId)?d.driftTrackId:'sierraFlow',
      careerUnlocked:Math.max(1,Math.min(R.CAREER_LEVELS.length,Math.round(safeNumber(d.careerUnlocked,1)))),careerBestTimes:Object.fromEntries(Object.entries(d.careerBestTimes&&typeof d.careerBestTimes==='object'&&!Array.isArray(d.careerBestTimes)?d.careerBestTimes:{}).filter(([id,v])=>has(R.CAREER_TRACKS,id)&&Number.isFinite(Number(v))&&Number(v)>0).map(([id,v])=>[id,Math.round(Number(v))])),careerCompleted:Array.from(new Set((Array.isArray(d.careerCompleted)?d.careerCompleted:[]).filter(id=>has(R.CAREER_TRACKS,id)))),
      controlMode,tiltSensitivity,credits:Math.floor(safeNumber(d.credits,200)),ownedLiveries,ownedEffects,caseInventory,carUpgrades:Object.fromEntries(ownedLiveries.filter(id=>d.carUpgrades&&has(d.carUpgrades,id)).map(id=>[id,R.getUpgradeLevels(d,id)])),
      carCustomizations:Object.fromEntries(ownedLiveries.map(id=>[id,safeCustomization(d.carCustomizations?.[id],R.LIVERIES[id])])),
      selectedLivery:ownedLiveries.includes(d.selectedLivery)?d.selectedLivery:'apexLime',selectedEffect:ownedEffects.includes(d.selectedEffect)?d.selectedEffect:'standard'};
  };
  R.shopAction=function(save,kind,id){
    const catalog=kind==='livery'?R.LIVERIES:kind==='effect'?R.EFFECTS:null;
    if(!catalog||!has(catalog,id))return 'invalid';
    if(kind==='livery'&&!R.carAvailable(id))return 'unavailable';
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
    if(kind==='livery'&&!R.carAvailable(id))return 'unavailable';save[selectedKey]=id;return 'selected';
  };
  R.getCatalogEntries=function(save,mode,kind,category='all'){
    const cars=kind==='livery',catalog=cars?R.LIVERIES:kind==='effect'?R.EFFECTS:null;
    if(!catalog)return [];
    const owned=save&&Array.isArray(save[cars?'ownedLiveries':'ownedEffects'])?save[cars?'ownedLiveries':'ownedEffects']:[];
    let entries=Object.entries(catalog);
    if(cars&&mode==='shop')entries=entries.filter(([id,item])=>!item.shopHidden&&R.carAvailable(id));
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
  // V13: reprice after deriving performance and case odds from the original catalog.
  const raisePrice=value=>Math.round(Number(value)*1.25);
  for(const item of Object.values(R.LIVERIES)){item.basePrice=item.price;item.price=raisePrice(item.price);}
  for(const item of Object.values(R.EFFECTS))item.price=raisePrice(item.price);
  R.CASES=Object.freeze(Object.fromEntries(Object.entries(R.CASES).map(([id,box])=>[id,Object.freeze({...box,price:raisePrice(box.price),expectedValue:raisePrice(box.expectedValue),rewards:Object.freeze(box.rewards.map(r=>Object.freeze({...r,price:raisePrice(r.price)})))})])));
  for(const key of ['getUpgradeCost','getPaintCost','getVinylCost']){const original=R[key];R[key]=(...args)=>{const value=original(...args);return value==null?value:raisePrice(value);};}
})();
