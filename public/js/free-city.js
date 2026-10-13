/* APEX BAY V43 — premium map visuals + wider Hot Potato access and minigame visibility pass. */
(function(){
  'use strict';
  const W=5000,H=3000,VISUAL_MARGIN=900,TAU=Math.PI*2,roads=[],buildings=[],trees=[],lots=[];
  // V34: every activity venue owns a visible paved surface. No hidden driveable rectangles
  // are allowed: the same rectangles are rendered in roadsLayer() and used by roadAt().
  const activityAreas=Object.freeze({
    crew:{x:1940,y:1240,w:180,h:235},
    // V37: the event pads use visible walls and dedicated IN / OUT lanes. Geometry
    // and visuals share these exact rectangles, so the player never hits an invisible edge.
    // V40: one large Harbor drift complex only. The usable asphalt footprint is
    // ~4.8× the old V39 pad, with two real road-connected lanes on the north side.
    driftHarbor:{x:170,y:1940,w:1000,h:740},
    driftHarborEntry:{x:900,y:1800,w:120,h:200},
    driftHarborExit:{x:1040,y:1800,w:120,h:200},
    meet:{x:1950,y:1390,w:740,h:420},
    airport:{x:2840,y:2510,w:2100,h:320},
    garageApron:{x:2490,y:545,w:360,h:180},
    garageAccess:{x:2615,y:390,w:110,h:180}
  });
  const minigameVenues=Object.freeze([
    // V37: every map minigame follows one APEX Event Hub design language: dark
    // asphalt, visible low walls, neon accents and physically driveable ENTRY / EXIT lanes.
    {id:'football',title:'APEX STADIUM',sub:'MINI FOOTBALL · 3×3 / 5×5',accent:'#68d8ff',orientation:'south',apron:{x:1770,y:195,w:455,h:155},building:{x:1845,y:45,w:300,h:118},access:{x:1825,y:285,w:105,h:135},exit:{x:2015,y:285,w:105,h:135}},
    {id:'checkpoint',title:'CHECKPOINT RUSH',sub:'SPEED · SKILLS · REWARDS',accent:'#7dff91',orientation:'south',apron:{x:3195,y:795,w:405,h:130},building:{x:3250,y:635,w:295,h:122},access:{x:3230,y:860,w:100,h:150},exit:{x:3455,y:860,w:100,h:150}},
    // V43: Hot Potato gets a wider maneuver apron plus 1.45× taller road-connected ENTRY/EXIT openings.
    {id:'hot_potato',title:'HOT POTATO',sub:'BOMB ARENA · PASS IT',accent:'#ff8d66',orientation:'east',apron:{x:550,y:1290,w:390,h:195},building:{x:605,y:1128,w:330,h:138},access:{x:845,y:1288,w:205,h:124},exit:{x:845,y:1380,w:205,h:124}}
  ]);
  const garageVenue=Object.freeze({building:{x:2505,y:748,w:330,h:132},apron:activityAreas.garageApron,access:activityAreas.garageAccess});
  const areas=[...Object.values(activityAreas),...minigameVenues.flatMap(v=>[v.apron,v.access,v.exit])];
  let seed=91723;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function road(points,width=190,curved=false){
    if(curved){
      const out=[];
      for(let i=0;i<points.length-1;i++){
        const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
        for(let j=0;j<18;j++){
          const t=j/18,t2=t*t,t3=t2*t;
          out.push([0,1].map(k=>.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)));
        }
      }
      out.push(points[points.length-1]);points=out;
    }
    roads.push({points,width});
  }
  // V40: the two lower west arterials begin farther east so the enlarged drift
  // park is a dedicated venue rather than asphalt painted across a city road.
  [[1050,430,3990],[220,1010,3990],[220,1590,3990],[1380,2170,3990],[1380,2670,4940]].forEach(([x1,y,x2])=>road([[x1,y],[x2,y]]));
  road([[430,1010],[430,1930]]);
  [1050,1680,2320,3020,3660].forEach((x,i)=>road([[x,i===0||i===4?430:180],[x,i===0?1800:(i<3?2780:2670)]]));
  road([[1050,430],[800,250],[390,270],[220,520],[350,770],[600,830],[770,1010]],164,true);
  // Waterfront road now wraps around the venue instead of cutting through it.
  road([[430,1590],[230,1760],[100,1870],[75,2350],[120,2760],[420,2900],[900,2900],[1180,2810],[1380,2670]],170,true);
  road([[3990,430],[3970,840],[3870,1260],[3990,1590],[3890,1980],[3990,2170]],170,true);
  const segments=roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,half:r.width/2,minX:Math.min(r.points[i][0],b[0]),maxX:Math.max(r.points[i][0],b[0]),minY:Math.min(r.points[i][1],b[1]),maxY:Math.max(r.points[i][1],b[1])})));
  function projection(x,y,s){const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=clamp(((x-s.a[0])*dx+(y-s.a[1])*dy)/(dx*dx+dy*dy||1),0,1);return {x:s.a[0]+dx*t,y:s.a[1]+dy*t};}
  function roadAt(x,y,margin=0){
    if(x<24||y<24||x>W-24||y>H-24)return false;
    for(const a of areas)if(x>a.x-margin&&x<a.x+a.w+margin&&y>a.y-margin&&y<a.y+a.h+margin)return true;
    for(const s of segments){
      const r=s.half+margin;
      if(x<s.minX-r||x>s.maxX+r||y<s.minY-r||y>s.maxY+r)continue;
      const p=projection(x,y,s);if(Math.hypot(x-p.x,y-p.y)<r)return true;
    }
    return false;
  }
  function nearestRoad(x,y){
    if(roadAt(x,y,-25))return {x,y};
    let best=null,d=Infinity;
    for(const s of segments){const p=projection(x,y,s),n=Math.hypot(x-p.x,y-p.y);if(n<d){best=p;d=n;}}
    for(const a of areas){const p={x:clamp(x,a.x+35,a.x+a.w-35),y:clamp(y,a.y+35,a.y+a.h-35)},n=Math.hypot(x-p.x,y-p.y);if(n<d){best=p;d=n;}}
    return best;
  }
  // Closest point in the union of the same road capsules and activity aprons.
  // A small skin keeps strict roadAt() tests inside, including curve endpoints.
  function contactPoint(x,y,margin=20){
    const skin=.12,pad=margin+skin;
    if(roadAt(x,y,-pad))return {x,y};
    let best=null,bestD=Infinity;
    const consider=(px,py)=>{px=clamp(px,24+skin,W-24-skin);py=clamp(py,24+skin,H-24-skin);const d=(x-px)**2+(y-py)**2;if(d<bestD&&roadAt(px,py,-margin)){best={x:px,y:py};bestD=d;}};
    for(const a of areas)consider(clamp(x,a.x+pad,a.x+a.w-pad),clamp(y,a.y+pad,a.y+a.h-pad));
    for(const seg of segments){const p=projection(x,y,seg),dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy),r=Math.max(1,seg.half-pad),k=d>r?r/d:1;consider(p.x+dx*k,p.y+dy*k);}
    return best||nearestRoad(x,y);
  }
  function resolveCarMotion(car,prevX,prevY){
    const dx=car.x-prevX,dy=car.y-prevY,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/4));
    let x=prevX,y=prevY,sx=dx/steps,sy=dy/steps,impact=0;
    if(!roadAt(x,y,-20)){const p=contactPoint(x,y);x=p.x;y=p.y;}
    for(let i=0;i<steps;i++){
      const tx=x+sx,ty=y+sy;
      if(roadAt(tx,ty,-20)){x=tx;y=ty;continue;}
      const p=contactPoint(tx,ty),nx0=p.x-tx,ny0=p.y-ty,d=Math.hypot(nx0,ny0);
      x=p.x;y=p.y;if(d<1e-7)continue;
      const nx=nx0/d,ny=ny0/d,vn=car.vx*nx+car.vy*ny;
      // Only the component entering the wall is affected. Tangential speed survives.
      if(vn<0){impact=Math.max(impact,-vn);const bounce=vn<-35?.12:0;car.vx-=(1+bounce)*vn*nx;car.vy-=(1+bounce)*vn*ny;}
      const inward=sx*nx+sy*ny;if(inward<0){sx-=inward*nx;sy-=inward*ny;}
    }
    car.x=x;car.y=y;car.speed=Math.hypot(car.vx,car.vy);
    if(impact>45)car.markImpact?.(Math.min(.45,impact/1000));
    return impact;
  }
  function district(x,y){
    if(y>2440&&x>2800)return 'АЭРОПОРТ';
    if(x<1000&&y>1880)return 'ПОРТ • DRIFT';
    if(x<1080&&y<1000)return 'ПАНОРАМНЫЙ СЕРПАНТИН';
    if(x>2900&&y<1500)return 'ИНДУСТРИАЛЬНЫЙ ПАРК';
    if(x>2700&&y>1600)return 'СОЛНЕЧНЫЙ КВАРТАЛ';
    if(x>1120&&x<1560&&y>1090&&y<1500)return 'ЦЕНТРАЛЬНЫЙ ПАРК';
    if(x>1800&&x<2850&&y>1150&&y<2050)return 'ЦЕНТР • CAR MEET';
    return 'APEX BAY';
  }
  const park={x:1170,y:1130,w:385,h:340};
  // V41 reference layout: airport terminal apron and parked aircraft live outside the vehicle road union.
  // This keeps the runway approaches fully driveable while aircraft never create a giant invisible rectangle.
  const airportTerminal={x:3100,y:2842,w:1580,h:142};
  const parkedAircraft=[
    {x:3430,y:2930,scale:.72,angle:-Math.PI/2},
    {x:3785,y:2924,scale:1.00,angle:-Math.PI/2},
    {x:4170,y:2932,scale:.74,angle:-Math.PI/2},
    {x:4510,y:2935,scale:.66,angle:-Math.PI/2}
  ];
  function reserved(x,y,pad=0){
    if((x>1920-pad&&x<2140+pad&&y>1030-pad&&y<1450+pad)||(x>1780-pad&&x<2010+pad&&y>540-pad&&y<870+pad)||(x>park.x-pad&&x<park.x+park.w+pad&&y>park.y-pad&&y<park.y+park.h+pad)||(x<1000&&y<940)||(x<1020&&y>1870)||(x>2790&&y>2420))return true;
    const gb=garageVenue.building,ga=garageVenue.apron;if((x>gb.x-pad-24&&x<gb.x+gb.w+pad+24&&y>gb.y-pad-24&&y<gb.y+gb.h+pad+28)||(x>ga.x-pad&&x<ga.x+ga.w+pad&&y>ga.y-pad&&y<ga.y+ga.h+pad))return true;
    return minigameVenues.some(v=>{const b=v.building,a=v.apron;return (x>b.x-pad-24&&x<b.x+b.w+pad+24&&y>b.y-pad-24&&y<b.y+b.h+pad+28)||(x>a.x-pad&&x<a.x+a.w+pad&&y>a.y-pad&&y<a.y+a.h+pad);});
  }
  function rectFree(x,y,w,h,pad=42){
    for(const xx of [x-pad,x+w/2,x+w+pad])for(const yy of [y-pad,y+h/2,y+h+pad])if(reserved(xx,yy)||roadAt(xx,yy))return false;
    for(const s of segments){
      const r=s.half+pad;
      if(s.maxX<x-r||s.minX>x+w+r||s.maxY<y-r||s.minY>y+h+r)continue;
      // Liang–Barsky clipping against a conservative road-radius expansion.
      const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];let lo=0,hi=1,hit=true;
      for(const [p,q] of [[-dx,s.a[0]-x+r],[dx,x+w+r-s.a[0]],[-dy,s.a[1]-y+r],[dy,y+h+r-s.a[1]]]){
        if(!p){if(q<0){hit=false;break;}}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi){hit=false;break;}}
      }
      if(hit)return false;
    }
    return !areas.some(a=>x-pad<a.x+a.w&&x+w+pad>a.x&&y-pad<a.y+a.h&&y+h+pad>a.y);
  }
  // Hand-picked city blocks, with small buildings separated by gardens and courtyards.
  const xs=[40,430,1050,1680,2320,3020,3660,4160],ys=[30,430,1010,1590,2170,2670,2980];
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
    const x=xs[i]+126,y=ys[j]+126,w=xs[i+1]-x-124,h=ys[j+1]-y-124;
    if(w<90||h<80)continue;
    const type=x>3000&&y<1500?'warehouse':x>2780&&y>1600?'house':x>1750&&x<2830&&y>1000&&y<2100?'tower':'residential';
    const cw=type==='warehouse'?180:type==='tower'?140:122,ch=type==='warehouse'?170:128;
    let any=false;
    for(let xx=x;xx+72<x+w;xx+=cw)for(let yy=y;yy+70<y+h;yy+=ch){
      const bw=Math.min(w-(xx-x)-12,cw-32),bh=Math.min(h-(yy-y)-12,ch-40);
      if(bw<56||bh<52||!rectFree(xx,yy,bw,bh))continue;
      buildings.push({x:xx,y:yy,w:bw,h:bh,type,tone:Math.floor(rnd()*4),height:type==='tower'?25:10});any=true;
    }
    if(any)lots.push({x:x-16,y:y-16,w:w+32,h:h+32,type});
  }
  // Separate decorative assets from every drivable surface, including the full drift apron.
  for(let i=0;i<2400;i++){
    const x=45+rnd()*(W-90),y=45+rnd()*(H-90),r=12+rnd()*16;
    if((x>1780-r&&x<2010+r&&y>540-r&&y<870+r)|| (x>1200&&x<1530&&y>1160&&y<1440)||roadAt(x,y,r+28)||(x<1030&&y>1870)||(x>2800&&y>2410))continue;
    if(Math.pow((x-540)/180,2)+Math.pow((y-535)/150,2)<1.4)continue;
    if(buildings.some(b=>x>b.x-r-12&&x<b.x+b.w+r+20&&y>b.y-r-12&&y<b.y+b.h+r+20))continue;
    if(trees.some(t=>Math.hypot(x-t.x,y-t.y)<r+t.r+5))continue;
    trees.push({x,y,r,tone:Math.floor(rnd()*5)});
  }
  for(const b of buildings){
    const x=b.x+b.w+16,y=b.y+b.h-12,r=10;
    if(!roadAt(x,y,25)&&!reserved(x,y)&&!buildings.some(o=>x>o.x-12&&x<o.x+o.w+12&&y>o.y-12&&y<o.y+o.h+12))trees.push({x,y,r,tone:Math.floor(rnd()*4)});
  }
  function fill(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
  function rr(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function path(c,pts,color,width,dash=[]){c.strokeStyle=color;c.lineWidth=width;c.lineJoin=c.lineCap='round';c.setLineDash(dash);c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.setLineDash([]);}
  function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
  function text(c,label,x,y,size=18,color='#f3eee0'){c.fillStyle=color;c.font=`800 ${size}px system-ui`;c.textAlign='center';c.fillText(label,x,y);}
  function hash2(x,y){
    let n=(Math.imul((x|0)+374761393,668265263)^Math.imul((y|0)+1442695041,2246822519))>>>0;
    n=Math.imul(n^(n>>>13),1274126177)>>>0;return (n^(n>>>16))>>>0;
  }
  function visualBuffer(c,v){
    // V42: render scenery beyond the physical 5000×3000 gameplay bounds. The car
    // still uses roadAt()/resolveCarMotion inside W/H, while the camera sees a much
    // larger, natural environment instead of a hard rectangular cut-off.
    const gx0=Math.max(-VISUAL_MARGIN,v.x),gy0=Math.max(-VISUAL_MARGIN,v.y);
    const gx1=Math.min(W+VISUAL_MARGIN,v.x+v.w),gy1=Math.min(H+VISUAL_MARGIN,v.y+v.h);
    if(gx1<=gx0||gy1<=gy0)return;
    const sea=c.createLinearGradient(-VISUAL_MARGIN,-VISUAL_MARGIN,W+VISUAL_MARGIN,H+VISUAL_MARGIN);
    sea.addColorStop(0,'#173f55');sea.addColorStop(.46,'#267a86');sea.addColorStop(1,'#123d5e');
    c.fillStyle=sea;c.fillRect(gx0,gy0,gx1-gx0,gy1-gy0);

    // Forested mainland/cliffs above and to the east; water surrounds the west/south.
    const top=c.createLinearGradient(0,-VISUAL_MARGIN,0,40);top.addColorStop(0,'#173b2b');top.addColorStop(.55,'#2f5d3d');top.addColorStop(1,'#557b4d');
    c.fillStyle=top;c.fillRect(Math.max(gx0,-VISUAL_MARGIN),gy0,Math.min(gx1,W+VISUAL_MARGIN)-Math.max(gx0,-VISUAL_MARGIN),Math.max(0,Math.min(gy1,0)-gy0));
    const east=c.createLinearGradient(W-20,0,W+VISUAL_MARGIN,0);east.addColorStop(0,'#557b4d');east.addColorStop(.35,'#315f3e');east.addColorStop(1,'#173a2b');
    if(gx1>W){c.fillStyle=east;c.fillRect(Math.max(W,gx0),Math.max(0,gy0),gx1-Math.max(W,gx0),Math.max(0,Math.min(H,gy1)-Math.max(0,gy0)));}

    // Deterministic off-map detail: forest crowns/rocks on land and light wavelets on water.
    const step=74,sx=Math.floor(gx0/step)*step,sy=Math.floor(gy0/step)*step;
    for(let y=sy;y<gy1;y+=step)for(let x=sx;x<gx1;x+=step){
      if(x>=0&&x<=W&&y>=0&&y<=H)continue;
      const n=hash2(x,y),jx=(n&31)-15,jy=((n>>>5)&31)-15,px=x+jx,py=y+jy;
      const land=py<0||(px>W&&py>=0&&py<=H);
      if(land){
        const r=12+(n%12);ellipse(c,px+5,py+8,r*1.15,r*.74,'#102c2337');
        ellipse(c,px,py,r,r*.86,(n&1)?'#285438':'#356443');
        ellipse(c,px-r*.22,py-r*.20,r*.60,r*.52,(n&2)?'#5c844f':'#6c9157');
        if(n%5===0){ellipse(c,px+r*.65,py+r*.48,8,6,'#53645a');ellipse(c,px+r*.5,py+r*.35,5,3,'#9ca78b');}
      }else{
        if(n%3===0)path(c,[[px-14,py],[px+14,py]],n&2?'#c8f1e629':'#ffffff1f',1.6);
        if(n%11===0)ellipse(c,px,py,4,3,'#d7eee22b');
      }
    }
    // Shore/surf lines at the visible world edge soften the transition.
    if(gx0<0&&gy1>0&&gy0<H){path(c,[[0,Math.max(0,gy0)],[0,Math.min(H,gy1)]],'#d1ead68f',7);path(c,[[-13,Math.max(0,gy0)],[ -13,Math.min(H,gy1)]],'#ffffff30',3,[22,18]);}
    if(gy1>H&&gx1>0){path(c,[[Math.max(0,gx0),H],[Math.min(W,gx1),H]],'#d1ead68f',7);path(c,[[Math.max(0,gx0),H+13],[Math.min(W,gx1),H+13]],'#ffffff30',3,[24,20]);}
    if(gy0<0&&gx1>0){path(c,[[Math.max(0,gx0),0],[Math.min(W,gx1),0]],'#243f2f9c',10);}
    if(gx1>W&&gy1>0){path(c,[[W,Math.max(0,gy0)],[W,Math.min(H,gy1)]],'#243f2f9c',10);}
  }
  function palm(c,x,y,s=1){
    c.save();c.translate(x,y);c.scale(s,s);
    ellipse(c,7,10,17,10,'#173b2c35');
    path(c,[[0,8],[0,-10]],'#8b6c44',5);
    for(let i=0;i<8;i++){
      const a=i*TAU/8-.25,ex=Math.cos(a)*25,ey=Math.sin(a)*17-13;
      path(c,[[0,-10],[ex*.48,ey*.55],[ex,ey]],i%2?'#2d7548':'#3c8d52',5);
      path(c,[[0,-10],[ex,ey]],'#78a95c55',1.5);
    }
    ellipse(c,0,-10,5,4,'#597b3c');c.restore();
  }
  function airportLamp(c,x,y,on=true){
    ellipse(c,x+2,y+3,4,3,'#13222955');ellipse(c,x,y,2.6,2.6,on?'#9cecff':'#e6d6aa');
  }
  function airplane(c,x,y,scale=1,angle=-Math.PI/2){
    // Clean 90° top-down passenger jet assembled from vector geometry so it stays sharp at zoom.
    c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);
    c.save();c.translate(7,8);c.globalAlpha=.28;c.fillStyle='#102228';
    c.beginPath();c.moveTo(76,0);c.quadraticCurveTo(65,-10,50,-11);c.lineTo(17,-14);c.lineTo(-12,-60);c.lineTo(-29,-60);c.lineTo(-18,-13);c.lineTo(-62,-9);c.lineTo(-78,-27);c.lineTo(-88,-27);c.lineTo(-81,0);c.lineTo(-88,27);c.lineTo(-78,27);c.lineTo(-62,9);c.lineTo(-18,13);c.lineTo(-29,60);c.lineTo(-12,60);c.lineTo(17,14);c.lineTo(50,11);c.quadraticCurveTo(65,10,76,0);c.closePath();c.fill();c.restore();
    const body=c.createLinearGradient(-85,0,80,0);body.addColorStop(0,'#bfc8c9');body.addColorStop(.45,'#f7f8f4');body.addColorStop(1,'#d8e1e1');
    c.fillStyle='#e5ecea';c.beginPath();c.moveTo(77,0);c.quadraticCurveTo(66,-10,49,-11);c.lineTo(18,-13);c.lineTo(-12,-58);c.lineTo(-29,-58);c.lineTo(-18,-12);c.lineTo(-61,-8);c.lineTo(-77,-25);c.lineTo(-88,-25);c.lineTo(-81,0);c.lineTo(-88,25);c.lineTo(-77,25);c.lineTo(-61,8);c.lineTo(-18,12);c.lineTo(-29,58);c.lineTo(-12,58);c.lineTo(18,13);c.lineTo(49,11);c.quadraticCurveTo(66,10,77,0);c.closePath();c.fill();
    c.fillStyle=body;c.beginPath();c.moveTo(83,0);c.quadraticCurveTo(66,-11,42,-10);c.lineTo(-70,-8);c.quadraticCurveTo(-88,0,-70,8);c.lineTo(42,10);c.quadraticCurveTo(66,11,83,0);c.closePath();c.fill();
    c.fillStyle='#246b94';c.fillRect(-56,-7,30,14);c.fillStyle='#174966';c.fillRect(-53,-5,23,10);
    c.fillStyle='#2d6c8d';c.beginPath();c.moveTo(-74,-7);c.lineTo(-88,-20);c.lineTo(-80,-22);c.lineTo(-62,-8);c.closePath();c.fill();
    c.fillStyle='#26383e';ellipse(c,-4,-31,11,8,'#26383e');ellipse(c,-4,31,11,8,'#26383e');ellipse(c,14,-31,9,7,'#394d52');ellipse(c,14,31,9,7,'#394d52');
    for(let xx=-44;xx<44;xx+=11){ellipse(c,xx,-8.3,2,1.4,'#4e7180');ellipse(c,xx,8.3,2,1.4,'#4e7180');}
    c.fillStyle='#85d8ff';ellipse(c,58,-5,4,2.1,'#85d8ff');ellipse(c,58,5,4,2.1,'#85d8ff');
    c.restore();
  }
  function airportTerminalScene(c){
    const t=airportTerminal;
    // Concrete apron intentionally remains non-driveable: it is scenery beyond the runway safety curb.
    rr(c,t.x,t.y,t.w,t.h,14,'#aab0a8');
    for(let x=t.x+14;x<t.x+t.w-12;x+=52)path(c,[[x,t.y+8],[x,t.y+t.h-8]],'#c8cbc164',1);
    rr(c,t.x+80,t.y+26,620,84,10,'#33494e');rr(c,t.x+92,t.y+37,596,61,7,'#516a6d');
    fill(c,t.x+102,t.y+45,576,8,'#7fcce3');text(c,'APEX INTERNATIONAL',t.x+390,t.y+79,18,'#f3f5ec');
    // Compact hangars and service sheds to match the reference without blocking the runway.
    for(let i=0;i<5;i++){
      const hx=t.x+770+i*154,hy=t.y+30;rr(c,hx,hy,126,78,8,'#7f8d8b');rr(c,hx+7,hy+8,112,62,5,'#aeb9b5');
      for(let k=0;k<5;k++)fill(c,hx+12+k*21,hy+12,2,52,'#6f8280');fill(c,hx+18,hy+58,90,5,'#6b9099');
    }
    // Gate lanes, cones, baggage carts and parked passenger aircraft.
    for(let x=t.x+130;x<t.x+t.w-80;x+=115){path(c,[[x,t.y-14],[x,t.y+16]],'#eee8d1',2,[7,6]);}
    for(const [x,y] of [[3250,2827],[3360,2827],[3970,2825],[4295,2828],[4620,2826]]){fill(c,x,y,5,8,'#ffb84c');fill(c,x+1,y,3,3,'#fff2b5');}
    for(const a of parkedAircraft)airplane(c,a.x,a.y,a.scale,a.angle);
    text(c,'АЭРОПОРТ',3890,2864,15,'#f0f1e8');
  }
  function water(c){
    const g=c.createLinearGradient(0,1800,900,H);g.addColorStop(0,'#409ca5');g.addColorStop(1,'#174f70');
    c.fillStyle=g;c.beginPath();c.moveTo(0,1760);c.bezierCurveTo(120,1740,90,2590,280,2790);c.quadraticCurveTo(500,2910,1040,3000);c.lineTo(0,3000);c.closePath();c.fill();
    path(c,[[35,1850],[70,2240],[140,2630],[330,2860],[800,2980]],'#8ccec3',8);
    for(let y=1940;y<3000;y+=42)for(let x=15;x<160+(y-1940)*.2;x+=75)path(c,[[x,y],[x+25,y]],'#ffffff18',2);
    // Bright coastal surf and rocky edge based on the supplied island reference.
    for(let y=1800;y<3000;y+=82){ellipse(c,28+(y%5)*6,y,18,10,'#c7eee04a');ellipse(c,78+(y%7)*5,y+26,9,6,'#f2f4d52d');}
    // Reservoir nestled within the park road.
    ellipse(c,550,550,202,162,'#a9bca1');ellipse(c,540,536,183,146,'#5bafb5');ellipse(c,530,525,164,125,'#438fa1');
    for(let i=0;i<9;i++)path(c,[[435+i%3*24,452+i*18],[535+i%4*21,452+i*18]],'#b8e2d044',2);
    rr(c,645,491,76,15,2,'#bb996b');for(let x=650;x<720;x+=9)fill(c,x,491,2,15,'#806b52');
  }
  function boundaryScenery(c,v){
    // Visual, non-colliding boundary cues: rocks/hedges make the physical limit feel intentional.
    const drawRock=(x,y,n)=>{const r=10+n%9;ellipse(c,x+4,y+5,r*1.15,r*.72,'#17362e2e');ellipse(c,x,y,r,r*.72,n&1?'#66776b':'#7c8675');ellipse(c,x-r*.22,y-r*.20,r*.45,r*.28,'#b3b99a55');};
    const place=(x,y)=>{
      if(x<0||y<0||x>W||y>H||roadAt(x,y,48)||reserved(x,y,34))return;
      // Keep the airport terminal apron visually clean.
      if(y>2810&&x>2800)return;
      const n=hash2(x,y);if(n%3)drawRock(x,y,n);else{ellipse(c,x+4,y+7,18,12,'#1c392f31');ellipse(c,x,y,16,15,n&4?'#315f3e':'#3f7047');ellipse(c,x-4,y-5,8,7,'#7fa45f');}
    };
    const step=62;
    if(v.y<110)for(let x=Math.max(30,Math.floor(v.x/step)*step);x<Math.min(W-30,v.x+v.w);x+=step)place(x,38+(hash2(x,3)%23));
    if(v.x<110)for(let y=Math.max(30,Math.floor(v.y/step)*step);y<Math.min(H-30,v.y+v.h);y+=step)place(38+(hash2(7,y)%20),y);
    if(v.x+v.w>W-110)for(let y=Math.max(30,Math.floor(v.y/step)*step);y<Math.min(H-30,v.y+v.h);y+=step)place(W-40-(hash2(11,y)%22),y);
    if(v.y+v.h>H-110)for(let x=Math.max(30,Math.floor(v.x/step)*step);x<Math.min(2800,v.x+v.w);x+=step)place(x,H-40-(hash2(x,13)%20));
  }
  function ground(c,v){
    // V42 palette: richer botanical greens, cleaner warm concrete and subtle tonal variation.
    fill(c,0,0,W,H,'#72965f');
    const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#315d4738');g.addColorStop(.42,'#d5c77f24');g.addColorStop(.72,'#9fc46b18');g.addColorStop(1,'#2e61712d');c.fillStyle=g;c.fillRect(0,0,W,H);
    // Coordinate-derived grass detail stays deterministic across cached tile boundaries.
    for(let y=Math.max(0,Math.floor(v.y/24)*24);y<Math.min(H,v.y+v.h);y+=24)for(let x=Math.max(0,Math.floor(v.x/27)*27);x<Math.min(W,v.x+v.w);x+=27){
      const n=hash2(x+17,y+31),px=x+n%17,py=y+(n>>>6)%13;
      ellipse(c,px,py,1.5+n%3,1+(n>>>8)%2,(n&1)?'#edf0b51c':'#214f3615');
      if(n%29===0)ellipse(c,px+5,py-3,1.3,1.3,(n&2)?'#f1d88955':'#e8a7c955');
    }
    for(const l of lots){
      const base=l.type==='warehouse'?'#bbb8a5':l.type==='tower'?'#b8beaa':'#a9bd83';
      rr(c,l.x+4,l.y+6,l.w,l.h,13,'#2448381d');rr(c,l.x,l.y,l.w,l.h,12,base);
      path(c,[[l.x+10,l.y+10],[l.x+l.w-10,l.y+10]],'#f0e7c128',2);
    }
    for(const b of buildings){if(b.type==='house'||b.type==='residential'){fill(c,b.x+8,b.y+b.h+6,b.w-16,12,'#d8ceb0');path(c,[[b.x-6,b.y+3],[b.x-6,b.y+b.h+20],[b.x+b.w,b.y+b.h+20]],'#647f4f',3);}}
    rr(c,park.x+5,park.y+8,park.w,park.h,26,'#31553a36');rr(c,park.x,park.y,park.w,park.h,26,'#4e7a4b');rr(c,park.x+12,park.y+12,park.w-24,park.h-24,23,'#91ad69');
    path(c,[[park.x+32,park.y+45],[park.x+park.w-32,park.y+park.h-45]],'#e4d5b4',17);
    path(c,[[park.x+32,park.y+park.h-45],[park.x+park.w-32,park.y+45]],'#e4d5b4',17);
    ellipse(c,1363,1304,72,66,'#203c3531');ellipse(c,1360,1300,70,65,'#d7ccb0');ellipse(c,1360,1300,48,43,'#eee6d0');ellipse(c,1360,1300,37,32,'#55b7c0');ellipse(c,1356,1295,16,13,'#b7ede3');
    water(c);
    boundaryScenery(c,v);
  }
  function roadsLayer(c){
    // All road edges first, then all asphalt: connected junctions never have curbs across them.
    for(const r of roads)path(c,r.points,'#476b50',r.width+41);
    for(const r of roads)path(c,r.points,'#d8d0ba',r.width+27);
    for(const a of areas)rr(c,a.x-14,a.y-14,a.w+28,a.h+28,24,'#d8d0ba');
    for(const r of roads)path(c,r.points,'#424d50',r.width);
    for(const a of areas)rr(c,a.x,a.y,a.w,a.h,12,'#4b575a');
    for(const r of roads){
      path(c,r.points,'#dde0cd',3,[27,24]);
      if(r.points.length===2){
        const [a,b]=r.points,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
        for(const sign of [-1,1])path(c,[[a[0]+nx*(r.width/2-14)*sign,a[1]+ny*(r.width/2-14)*sign],[b[0]+nx*(r.width/2-14)*sign,b[1]+ny*(r.width/2-14)*sign]],'#d2d5bc',2);
      }
    }
    // Fine asphalt grain and repaired seams — sparse enough for iPhone, cached per tile.
    for(const seg of segments){
      const dx=seg.b[0]-seg.a[0],dy=seg.b[1]-seg.a[1],len=Math.hypot(dx,dy);if(len<110)continue;
      const nx=-dy/len,ny=dx/len,ux=dx/len,uy=dy/len;
      for(let d=42;d<len-24;d+=86){
        const n=hash2(seg.a[0]+d,seg.a[1]+d),off=((n%100)/100-.5)*seg.half*1.45;
        const px=seg.a[0]+ux*d+nx*off,py=seg.a[1]+uy*d+ny*off;
        path(c,[[px-ux*5,py-uy*5],[px+ux*(5+n%9),py+uy*(5+n%9)]],n&1?'#e9eee50c':'#18272b18',1.1);
      }
    }
    // Clear markings at junctions and paint crosswalks outside the intersection.
    for(const x of [430,1050,1680,2320,3020,3660])for(const y of [430,1010,1590,2170,2670]){
      if(!roads.some(r=>r.points.length===2&&r.points[0][0]===x&&y>=r.points[0][1]&&y<=r.points[1][1]))continue;
      if(!roads.some(r=>r.points.length===2&&r.points[0][1]===y&&x>=r.points[0][0]&&x<=r.points[1][0]))continue;
      fill(c,x-95,y-95,190,190,'#424d50');
      if(y===2670||areas.some(a=>x>a.x-130&&x<a.x+a.w+130&&y>a.y-130&&y<a.y+a.h+130))continue;
      for(let d=-70;d<80;d+=19){
        fill(c,x+d,y-118,10,25,'#f2edda');fill(c,x+d,y+95,10,25,'#f2edda');fill(c,x-118,y+d,25,10,'#f2edda');fill(c,x+95,y+d,25,10,'#f2edda');
      }
      for(const dx of [-112,112])for(const dy of [-112,112]){fill(c,x+dx,y+dy,5,13,'#344848');fill(c,x+dx+1,y+dy+2,3,3,'#e8ba64');}
    }
    // Large, unobstructed activity aprons.
    for(const a of areas)rr(c,a.x,a.y,a.w,a.h,12,'#4c585b');
    // V40 HARBOR DRIFT MEGAPARK: the only drift zone in Free Roam.
    eventPad(c,activityAreas.driftHarbor,'#c678ff',{title:'HARBOR DRIFT MEGAPARK',sub:'APEX DRIFT ZONE · OPEN LAYOUT',entry:activityAreas.driftHarborEntry,exit:activityAreas.driftHarborExit,orientation:'north'});
    c.save();c.strokeStyle='#26363892';c.lineWidth=7;
    for(let i=0;i<10;i++){c.beginPath();c.ellipse(670+i*2,2310+i*1.2,420-i*22,270-i*14,-.04,.10,TAU-.08);c.stroke();}c.restore();
    c.save();c.strokeStyle='rgba(198,120,255,.34)';c.lineWidth=4;c.setLineDash([20,18]);c.beginPath();c.ellipse(670,2310,330,205,-.04,0,TAU);c.stroke();c.restore();
    text(c,'DRIFT',670,2318,44,'#ead8ff');
    text(c,'ONE ZONE · MAX SPACE',670,2360,12,'#d8b8ff');
    // V44 physical Free Roam garage: a visible road-connected apron and a building
    // outside the driveable union, so there are no hidden collision rectangles.
    const gv=garageVenue,gb=gv.building,ga=gv.apron,gx=ga.x+ga.w/2;
    rr(c,ga.x+8,ga.y+8,ga.w-16,ga.h-16,12,'#3f4b4e');
    for(let x=ga.x+30;x<ga.x+ga.w-20;x+=72)path(c,[[x,ga.y+25],[x,ga.y+118],[x+54,ga.y+118]],'#d7dbc9',2);
    fill(c,gb.x+12,gb.y+13,gb.w,gb.h,'#15272b55');rr(c,gb.x,gb.y,gb.w,gb.h,14,'#263b40');rr(c,gb.x+10,gb.y+10,gb.w-20,gb.h-20,10,'#334f54');
    fill(c,gb.x+18,gb.y+17,gb.w-36,8,'#8dff49');rr(c,gx-82,gb.y+48,164,84,8,'#132429');
    for(let y=gb.y+58;y<gb.y+124;y+=16)path(c,[[gx-70,y],[gx+70,y]],'#62767a',2);
    text(c,'GARAGE',gx,gb.y+40,20,'#f6f8ef');text(c,'CHANGE CAR',gx,gb.y+67,9,'#b8ff8e');
    text(c,'GARAGE',gx,ga.y+55,20,'#eaffdc');text(c,'PARK · ENTER',gx,ga.y+78,9,'#a9ff5a');
    // Meeting plaza, marked parking bays and a clear through road.
    for(const y of [1400,1735])for(let x=1990;x<2680;x+=70){path(c,[[x,y],[x,y+43],[x+54,y+43]],'#e4e1c5',2);}
    building(c,{x:1940,y:1150,w:180,h:75,type:'warehouse',tone:1,height:12});
    fill(c,1940,1150,180,8,'#a9ff5a');text(c,'КЛАНЫ',2030,1185,24,'#cfff9a');text(c,'CREW HQ',2030,1210,12,'#e8ffe0');
    for(let x=1960;x<2110;x+=48)path(c,[[x,1290],[x,1350],[x+36,1350]],'#c2d8bb',2);
    text(c,'APEX MOTOR CLUB',2320,1500,28,'#ede8d2');text(c,'MEET • PARK • DRIVE',2320,1690,14,'#cad3c3');
    // V42 APEX INTERNATIONAL: crisp runway, threshold bars, centerline and edge lights.
    const rw=activityAreas.airport;rr(c,rw.x+10,rw.y+12,rw.w-20,rw.h-24,12,'#3f494c');
    path(c,[[2900,2670],[4890,2670]],'#f0ecdc',4,[42,28]);
    path(c,[[2900,2580],[4890,2580]],'#cfd3c4',2);path(c,[[2900,2760],[4890,2760]],'#cfd3c4',2);
    for(const x of [2920,4780])for(let row=0;row<8;row++)for(let col=0;col<4;col++)fill(c,x+col*13,2550+row*27,9,20,(row+col)%2?'#3e474a':'#f4f0dc');
    text(c,'09',2980,2642,48,'#f2efdf');text(c,'27',4860,2750,48,'#f2efdf');text(c,'START',3210,2550,15,'#d9e9de');text(c,'FINISH',4610,2800,15,'#d9e9de');
    for(let x=2890;x<4920;x+=64){airportLamp(c,x,2525,true);airportLamp(c,x,2814,true);}
    // Painted runway distance markers and taxi arrows.
    for(const x of [3370,3850,4330]){fill(c,x-28,2627,56,4,'#e8e4d2');fill(c,x-28,2709,56,4,'#e8e4d2');}
    for(const x of [3070,4550]){path(c,[[x,2788],[x+38,2788],[x+25,2775]],'#efc94e',4);}
  }
  function building(c,b){
    const {x,y,w,h,type,tone}=b,sl=b.height;
    // V42 layered shadows: stronger depth without expensive live shadowBlur on every frame.
    rr(c,x+sl*.95,y+sl*1.16,w+10,h+9,5,'#102b2830');rr(c,x+sl*.55,y+sl*.78,w+7,h+6,4,'#1b3b343b');
    fill(c,x+3,y+5,w,h,'#ddd4bf');fill(c,x+w-6,y+5,9,h,'#718780');fill(c,x+3,y+h-4,w,10,'#687c75');
    if(type==='house'||type==='residential'){
      const palette=[['#c9684d','#974636'],['#d17a50','#a2523e'],['#718a91','#496b75'],['#d7b57a','#a98556']],p=palette[tone];
      const roof=c.createLinearGradient(x,y,x+w*.35,y+h);roof.addColorStop(0,p[0]);roof.addColorStop(.47,p[0]);roof.addColorStop(.51,p[1]);roof.addColorStop(1,p[1]);c.fillStyle=roof;c.fillRect(x,y,w,h);
      path(c,[[x+1,y+h-1],[x+1,y+1],[x+w-1,y+1]],'#ffe1b88f',2);
      path(c,[[x-3,y+h/2],[x+w+3,y+h/2]],'#f0c79c',3);
      for(let yy=y+7;yy<y+h;yy+=8)path(c,[[x,yy],[x+w,yy]],'#3d2b2428',1);
      for(let xx=x+10;xx<x+w;xx+=17)path(c,[[xx,y],[xx,y+h]],'#ffd6aa1f',1);
      fill(c,x+w-22,y+13,10,14,'#60493f');fill(c,x+w-24,y+10,12,6,'#ead5b7');
      // Skylights / solar panels vary by roof tone and make zoomed-in blocks less repetitive.
      if(tone===2){fill(c,x+12,y+10,30,21,'#214d68');for(let k=0;k<3;k++)fill(c,x+13+k*10,y+11,1,19,'#9bd1dc');path(c,[[x+12,y+20],[x+42,y+20]],'#d3eef0',1);}
      if(tone===0&&w>68){rr(c,x+12,y+11,21,13,2,'#6aa0ab');fill(c,x+14,y+13,17,3,'#bce2df80');}
      fill(c,x+10,y+h+2,18,5,'#274956');fill(c,x+w-28,y+h+2,18,5,'#274956');
    }else{
      fill(c,x,y,w,h,type==='tower'?'#365f6d':'#849597');fill(c,x+5,y+5,w-10,h-10,type==='tower'?['#759aa0','#a5b9b3','#638893','#d4ceb8'][tone]:'#b8c1ba');
      if(type==='warehouse'){
        for(let xx=x+8;xx<x+w-5;xx+=9)fill(c,xx,y+6,2,h-12,'#526f7250');
        for(let yy=y+18;yy<y+h-12;yy+=32){fill(c,x+15,yy,w-30,10,'#619aa7');fill(c,x+15,yy,w-30,2,'#e4f2e8');}
        if(w>95){rr(c,x+w-52,y+10,35,18,3,'#6e7772');for(let k=0;k<3;k++)fill(c,x+w-48+k*10,y+13,6,12,'#9fb1a8');}
      }else{
        fill(c,x+13,y+12,w-26,h-26,'#769493');
        for(let xx=x+8;xx<x+w-6;xx+=15){fill(c,xx,y+1,8,3,'#d7f3f4');fill(c,xx,y+h-4,8,3,'#d7f3f4');}
        // Rooftop HVAC, service hatch and a small cool-glass skylight.
        fill(c,x+18,y+20,22,27,'#476565');fill(c,x+16,y+17,22,27,'#d2d8ca');ellipse(c,x+27,y+29,7,7,'#687f7b');
        fill(c,x+w-40,y+h-40,23,18,'#c4d0c4');path(c,[[x+w-37,y+h-36],[x+w-22,y+h-36]],'#718a83',2);
        if(w>80){rr(c,x+w/2-18,y+11,36,14,3,'#598aa0');fill(c,x+w/2-15,y+13,30,3,'#b8e3e78a');}
      }
    }
  }
  const treeSprites=new Map();
  function tree(c,t){
    const key=t.tone;
    if(!treeSprites.has(key)){
      const spr=document.createElement('canvas');spr.width=spr.height=144;const g=spr.getContext('2d');
      const colors=[
        ['#1f4d35','#78ad5d','#b6ce75'],
        ['#315d35','#9abc62','#d2d57b'],
        ['#485d2c','#b8b75f','#d9ce7c'],
        ['#1b5140','#72a777','#acd08c'],
        ['#676439','#c5b66d','#e1cf8c']
      ][key];
      // Soft baked shadow offset to the south-east.
      ellipse(g,84,94,47,29,'#0b2b2638');ellipse(g,78,88,39,23,'#153a3135');
      path(g,[[70,82],[72,58]],'#755c3f',5);
      const grad=g.createRadialGradient(49,38,5,66,62,49);grad.addColorStop(0,colors[2]);grad.addColorStop(.45,colors[1]);grad.addColorStop(1,colors[0]);
      ellipse(g,64,62,43,39,colors[0]);
      for(let i=0;i<16;i++){const a=i*TAU/16,r=27+(i%4)*3;ellipse(g,64+Math.cos(a)*r,60+Math.sin(a)*r,15+i%5,13+(i*3)%5,grad);}
      ellipse(g,59,56,31,29,grad);
      // Leaf clusters / highlights are deterministic and baked once per tone.
      for(let i=0;i<92;i++){const a=i*2.399,r=Math.sqrt(i/92)*38,x=62+Math.cos(a)*r,y=56+Math.sin(a)*r;ellipse(g,x,y,2+i%3,1.6+i%2,i%4===0?'#eff4b52b':i%3?'#d9e9aa24':'#163c2929');}
      ellipse(g,49,42,10,7,'#f0efad21');ellipse(g,79,49,8,6,'#f0efad18');
      treeSprites.set(key,spr);
    }
    const d=t.r*3.15;c.drawImage(treeSprites.get(key),t.x-d*.45,t.y-d*.43,d,d);
  }
  function eventChevron(c,x,y,angle,color){
    c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=color;c.lineWidth=5;c.lineJoin='round';
    for(const off of [-9,9]){c.beginPath();c.moveTo(-12,off-7);c.lineTo(0,off+4);c.lineTo(12,off-7);c.stroke();}c.restore();
  }
  function eventWall(c,x1,y1,x2,y2,accent){
    path(c,[[x1,y1],[x2,y2]],'#d5d1bf',15);path(c,[[x1,y1],[x2,y2]],'#263638',9);path(c,[[x1,y1],[x2,y2]],accent,2,[18,14]);
  }
  function eventLane(c,lane,accent,label,orientation){
    rr(c,lane.x,lane.y,lane.w,lane.h,8,'#4a5658');
    c.save();c.globalAlpha=.32;rr(c,lane.x+5,lane.y+5,lane.w-10,lane.h-10,6,accent);c.restore();
    const cx=lane.x+lane.w/2,cy=lane.y+lane.h/2;
    if(orientation==='east'){
      path(c,[[lane.x+10,cy],[lane.x+lane.w-10,cy]],'#edf0dc',2,[13,11]);
      eventChevron(c,cx,cy,label==='ENTRY'?Math.PI/2:-Math.PI/2,accent);
      text(c,label,cx,cy+(label==='ENTRY'?-20:28),9,'#f5f7ed');
      text(c,label==='ENTRY'?'ВЪЕЗД':'ВЫЕЗД',cx,cy+(label==='ENTRY'?-8:40),7,accent);
    }else{
      path(c,[[cx,lane.y+8],[cx,lane.y+lane.h-8]],'#edf0dc',2,[13,11]);
      const pointsDown=orientation==='south';
      const entryAngle=pointsDown?0:Math.PI,exitAngle=pointsDown?Math.PI:0;
      eventChevron(c,cx,cy,label==='ENTRY'?entryAngle:exitAngle,accent);
      text(c,label,cx,cy-25,9,'#f5f7ed');text(c,label==='ENTRY'?'ВЪЕЗД':'ВЫЕЗД',cx,cy-13,7,accent);
    }
  }
  function eventPad(c,a,accent,opt){
    const {entry,exit,orientation='south',title='',sub=''}=opt;
    rr(c,a.x,a.y,a.w,a.h,14,'#424f52');rr(c,a.x+8,a.y+8,a.w-16,a.h-16,11,'#566264');
    c.save();c.globalAlpha=.19;rr(c,a.x+16,a.y+16,a.w-32,a.h-32,10,accent);c.restore();
    if(entry)eventLane(c,entry,accent,'ENTRY',orientation==='north'?'north':orientation==='east'?'east':'south');
    if(exit)eventLane(c,exit,accent,'EXIT',orientation==='north'?'north':orientation==='east'?'east':'south');
    // Draw the low physical boundary exactly where the driveable area ends. Gaps line
    // up with the entry / exit rectangles, so there are no fake or invisible blockers.
    const wall=(x1,y1,x2,y2)=>eventWall(c,x1,y1,x2,y2,accent),pad=7;
    if(orientation==='south'||orientation==='north'){
      const edgeY=orientation==='south'?a.y+a.h:a.y;
      const lanes=[entry,exit].filter(Boolean).sort((q,r)=>q.x-r.x);
      const openings=lanes.map(l=>[Math.max(a.x,l.x+pad),Math.min(a.x+a.w,l.x+l.w-pad)]);
      const otherY=orientation==='south'?a.y:a.y+a.h;
      wall(a.x+8,otherY,a.x+a.w-8,otherY);wall(a.x,a.y+8,a.x,a.y+a.h-8);wall(a.x+a.w,a.y+8,a.x+a.w,a.y+a.h-8);
      let cursor=a.x+8;for(const [l,r] of openings){if(l>cursor+8)wall(cursor,edgeY,l,edgeY);cursor=Math.max(cursor,r);}if(cursor<a.x+a.w-8)wall(cursor,edgeY,a.x+a.w-8,edgeY);
    }else{
      const edgeX=a.x+a.w,otherX=a.x;const lanes=[entry,exit].filter(Boolean).sort((q,r)=>q.y-r.y);const openings=lanes.map(l=>[Math.max(a.y,l.y+pad),Math.min(a.y+a.h,l.y+l.h-pad)]);
      wall(otherX,a.y+8,otherX,a.y+a.h-8);wall(a.x+8,a.y,a.x+a.w-8,a.y);wall(a.x+8,a.y+a.h,a.x+a.w-8,a.y+a.h);
      let cursor=a.y+8;for(const [t,b] of openings){if(t>cursor+8)wall(edgeX,cursor,edgeX,t);cursor=Math.max(cursor,b);}if(cursor<a.y+a.h-8)wall(edgeX,cursor,edgeX,a.y+a.h-8);
    }
    // Premium APEX event branding painted on the asphalt.
    const cx=a.x+a.w/2,cy=a.y+a.h/2;ellipse(c,cx,cy,44,44,'#26383a');
    c.save();c.strokeStyle=accent;c.globalAlpha=.82;c.lineWidth=4;c.setLineDash([12,9]);c.beginPath();c.arc(cx,cy,35,0,TAU);c.stroke();c.restore();
    text(c,title,cx,a.y+28,Math.min(17,Math.max(11,a.w/28)),'#f5f7ef');text(c,sub,cx,a.y+46,8,accent);
    // Accent bollards make the wall readable before the car reaches it.
    for(const [x,y] of [[a.x+10,a.y+10],[a.x+a.w-10,a.y+10],[a.x+10,a.y+a.h-10],[a.x+a.w-10,a.y+a.h-10]]){ellipse(c,x,y,5,5,'#172427');ellipse(c,x,y,3,3,accent);}
  }
  function minigameVenue(c,v){
    const b=v.building,a=v.apron,accent=v.accent;
    // One coherent APEX Event Hub style across Football, Checkpoint Rush and Hot Potato.
    eventPad(c,a,accent,{title:v.title,sub:v.sub,entry:v.access,exit:v.exit,orientation:v.orientation});
    // Venue building / event gate. This is visual only and remains outside roadAt().
    fill(c,b.x+10,b.y+14,b.w,b.h,'#26383a55');rr(c,b.x,b.y,b.w,b.h,14,'#223338');rr(c,b.x+7,b.y+7,b.w-14,b.h-14,11,'#334b50');
    fill(c,b.x+12,b.y+12,b.w-24,8,accent);rr(c,b.x+20,b.y+30,b.w-40,50,8,'#142327');
    c.save();c.globalAlpha=.22;rr(c,b.x+26,b.y+36,b.w-52,38,6,accent);c.restore();
    text(c,v.title,b.x+b.w/2,b.y+51,18,'#f7faf4');text(c,v.sub,b.x+b.w/2,b.y+70,8,accent);
    for(const x of [b.x+18,b.x+b.w-18]){fill(c,x-3,b.y+b.h-26,6,28,'#1b2b2f');ellipse(c,x,b.y+b.h-29,5,5,accent);}
    rr(c,b.x+b.w/2-34,b.y+b.h-30,68,30,6,'#111e22');fill(c,b.x+b.w/2-24,b.y+b.h-23,48,4,accent);
  }
  function props(c){
    for(const venue of minigameVenues)minigameVenue(c,venue);
    // Containers are on the quay outside the playable drift apron.
    for(let i=0;i<8;i++){
      const x=292+i*85,y=1852;if(roadAt(x+32,y+20,48))continue;fill(c,x+5,y+6,65,43,'#314b4544');fill(c,x,y,65,43,['#b86c4a','#5b8c93','#c4a461','#798964'][i%4]);
      for(let j=8;j<64;j+=9)fill(c,x+j,y+3,2,37,'#f6e6c72b');
    }
    for(const x of [740]){fill(c,x,1810,12,48,'#d4ab58');path(c,[[x-28,1820],[x+80,1820]],'#d5ac58',10);path(c,[[x+80,1820],[x+80,1840]],'#465957',3);}
    airportTerminalScene(c);
    // Palm-lined waterfront and boulevard accents. All are placed on scenery/sidewalk land, never on the driving centerline.
    for(const [x,y,sc] of [[250,930,1],[330,920,.9],[520,910,.85],[820,910,.9],[1120,900,.82],[1515,915,.78],[2810,900,.8],[2920,900,.82],[3900,930,.9],[4050,970,.8],[1180,1885,.82],[1260,1900,.75],[1335,1890,.82],[2760,2270,.8],[2825,2310,.74],[2700,2360,.76]])if(!roadAt(x,y,35))palm(c,x,y,sc);
    // Rooftop court, cafe parasols and park benches make districts recognizable.
    rr(c,1795,560,190,300,8,'#c8c5a6');rr(c,1807,574,166,269,5,'#608b83');
    c.strokeStyle='#ece5ca';c.lineWidth=3;c.strokeRect(1822,590,136,234);path(c,[[1822,707],[1958,707]],'#ece5ca',3);ellipse(c,1890,707,30,30,'#6e9b89');
    for(const [x,y] of [[1882,1260],[2730,1490],[2728,1570]]){ellipse(c,x+4,y+7,23,21,'#354b3e33');ellipse(c,x,y,22,22,'#ede4ca');path(c,[[x-18,y],[x+18,y]],'#d5a171',5);path(c,[[x,y-18],[x,y+18]],'#d5a171',5);}
    for(const [x,y] of [[1260,1220],[1450,1380],[1260,1390],[1450,1210]]){fill(c,x,y,30,9,'#9b7952');fill(c,x+3,y+8,3,6,'#4b6050');fill(c,x+24,y+8,3,6,'#4b6050');}
    // Compact wayfinding signs sit on sidewalks, clear of the driving line.
    for(const [x,y,label,color] of [[1850,1590,'MEET →','#c0dd8f'],[1050,1870,'↓ PORT','#d3b0e5'],[3020,2380,'↓ AIRPORT','#acd9e7']]){
      const sx=x+115;if(roadAt(sx,y,32))continue;fill(c,sx,y,4,27,'#53665b');rr(c,sx-26,y-16,58,22,3,'#314d49');text(c,label,sx+3,y-1,9,color);
    }
  }
  function colorGrade(c,v){
    // Consistent warm sun / cool ambient grade; low alpha keeps gameplay markings crisp.
    c.save();
    const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#ffe6a812');g.addColorStop(.46,'#ffffff00');g.addColorStop(1,'#2d6f8814');
    c.fillStyle=g;c.fillRect(Math.max(0,v.x),Math.max(0,v.y),Math.max(0,Math.min(W,v.x+v.w)-Math.max(0,v.x)),Math.max(0,Math.min(H,v.y+v.h)-Math.max(0,v.y)));
    const glow=c.createRadialGradient(W*.22,H*.18,0,W*.22,H*.18,W*.58);glow.addColorStop(0,'#fff4c20d');glow.addColorStop(1,'#ffffff00');c.fillStyle=glow;c.fillRect(0,0,W,H);
    c.restore();
  }
  function scene(c,v={x:0,y:0,w:W,h:H}){
    const visible=(x,y,w,h)=>x+w>v.x-60&&x<v.x+v.w+60&&y+h>v.y-60&&y<v.y+v.h+60;
    ground(c,v);roadsLayer(c);for(const b of buildings)if(visible(b.x,b.y,b.w,b.h))building(c,b);props(c);for(const t of trees)if(visible(t.x-t.r,t.y-t.r,t.r*2,t.r*2))tree(c,t);colorGrade(c,v);
  }
  // Bounded LRU: no giant DPR-scaled world bitmap and no per-frame city regeneration.
  const tiles=new Map(),TILE=512;
  let tileLimit=32;
  let overview=null;
  function tile(tx,ty){
    const key=tx+','+ty;
    if(tiles.has(key)){const v=tiles.get(key);tiles.delete(key);tiles.set(key,v);return v;}
    const el=document.createElement('canvas');el.width=el.height=TILE+4;
    const c=el.getContext('2d',{alpha:false}),view={x:tx*TILE-2,y:ty*TILE-2,w:TILE+4,h:TILE+4};
    c.translate(2-tx*TILE,2-ty*TILE);visualBuffer(c,view);
    if(view.x<W&&view.x+view.w>0&&view.y<H&&view.y+view.h>0)scene(c,view);
    tiles.set(key,el);
    if(tiles.size>tileLimit){const oldest=tiles.keys().next().value;const old=tiles.get(oldest);old.width=old.height=1;tiles.delete(oldest);}
    return el;
  }
  function draw(c,view){
    const v=view||{x:0,y:0,w:W,h:H};
    const minX=-VISUAL_MARGIN,maxX=W+VISUAL_MARGIN,minY=-VISUAL_MARGIN,maxY=H+VISUAL_MARGIN;
    // Even beyond the decorative buffer, continue deep water instead of exposing transparent/blank canvas.
    fill(c,v.x,v.y,v.w,v.h,'#153f58');
    const x0=Math.max(Math.floor(minX/TILE),Math.floor(v.x/TILE)),x1=Math.min(Math.floor(maxX/TILE),Math.floor((v.x+v.w)/TILE));
    const y0=Math.max(Math.floor(minY/TILE),Math.floor(v.y/TILE)),y1=Math.min(Math.floor(maxY/TILE),Math.floor((v.y+v.h)/TILE));
    tileLimit=Math.max(32,Math.max(1,(x1-x0+1)*(y1-y0+1))+4);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)c.drawImage(tile(x,y),x*TILE-2,y*TILE-2);
  }
  function drawOverview(c,w,h){
    if(!overview){overview=document.createElement('canvas');overview.width=1500;overview.height=900;const g=overview.getContext('2d',{alpha:false});g.scale(.3,.3);scene(g);}
    c.drawImage(overview,0,0,w,h);
    const labels=[['ОЗЁРНЫЙ ПЕРЕВАЛ',560,165],['APEX STADIUM',1970,150],['ЦЕНТРАЛЬНЫЙ ПАРК',1360,1210],['ИНДУСТРИАЛЬНЫЙ',3340,720],['СОЛНЕЧНЫЙ КВАРТАЛ',3320,1930],['АЭРОПОРТ',3890,2890],['APEX BAY',2060,880]];
    for(const [label,x,y] of labels){
      c.font='800 11px system-ui';const tw=c.measureText(label).width,px=x/W*w,py=y/H*h;
      rr(c,px-tw/2-8,py-12,tw+16,20,5,'#203d38d9');text(c,label,px,py+2,11,'#f0eedb');
    }
  }
  window.ApexCity={width:W,height:H,visualMargin:VISUAL_MARGIN,resolveCarMotion,roadAt,nearestRoad,district,draw,drawOverview,minigameVenues,garageVenue};
})();
