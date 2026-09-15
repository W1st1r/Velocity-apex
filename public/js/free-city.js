/* APEX BAY — deterministic, canvas-native world. Roads and collision share geometry. */
(function(){
  'use strict';
  const W=4200,H=3000,TAU=Math.PI*2,roads=[],buildings=[],trees=[],lots=[];
  const areas=[{x:250,y:1930,w:730,h:700},{x:1950,y:1370,w:740,h:440},{x:2840,y:2510,w:1300,h:320}];
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
  [430,1010,1590,2170,2670].forEach((y,i)=>road([[i===0?1050:i===3?430:i===4?1050:220,y],[i===4?4140:3990,y]]));
  road([[430,1010],[430,1930]]);
  [1050,1680,2320,3020,3660].forEach((x,i)=>road([[x,i===0||i===4?430:180],[x,i<3?2780:2670]]));
  road([[1050,430],[800,250],[390,270],[220,520],[350,770],[600,830],[770,1010]],164,true);
  road([[430,1590],[230,1760],[150,2010],[190,2390],[430,2670],[760,2790],[1050,2670]],170,true);
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
  function reserved(x,y,pad=0){return (x>1750-pad&&x<1970+pad&&y>540-pad&&y<860+pad)||(x>park.x-pad&&x<park.x+park.w+pad&&y>park.y-pad&&y<park.y+park.h+pad)||(x<1000&&y<940)||(x<1020&&y>1870)||(x>2790&&y>2420);}
  function rectFree(x,y,w,h,pad=20){
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
    if((x>1750-r&&x<1970+r&&y>540-r&&y<860+r)|| (x>1200&&x<1530&&y>1160&&y<1440)||roadAt(x,y,r+28)||(x<1030&&y>1870)||(x>2800&&y>2410))continue;
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
  function water(c){
    const g=c.createLinearGradient(0,1800,900,H);g.addColorStop(0,'#409ca5');g.addColorStop(1,'#174f70');
    c.fillStyle=g;c.beginPath();c.moveTo(0,1760);c.bezierCurveTo(120,1740,90,2590,280,2790);c.quadraticCurveTo(500,2910,1040,3000);c.lineTo(0,3000);c.closePath();c.fill();
    path(c,[[35,1850],[70,2240],[140,2630],[330,2860],[800,2980]],'#8ccec3',8);
    for(let y=1940;y<3000;y+=42)for(let x=15;x<160+(y-1940)*.2;x+=75)path(c,[[x,y],[x+25,y]],'#ffffff18',2);
    // Reservoir nestled within the park road.
    ellipse(c,550,550,202,162,'#a9bca1');ellipse(c,540,536,183,146,'#5bafb5');ellipse(c,530,525,164,125,'#438fa1');
    for(let i=0;i<9;i++)path(c,[[435+i%3*24,452+i*18],[535+i%4*21,452+i*18]],'#b8e2d044',2);
    rr(c,645,491,76,15,2,'#bb996b');for(let x=650;x<720;x+=9)fill(c,x,491,2,15,'#806b52');
  }
  function ground(c,v){
    fill(c,0,0,W,H,'#8bab73');
    const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#496f572b');g.addColorStop(.5,'#d3cc9433');g.addColorStop(1,'#d9cb8622');c.fillStyle=g;c.fillRect(0,0,W,H);
    // Coordinate-derived grass flecks stay identical across tile boundaries.
    for(let y=Math.max(0,Math.floor(v.y/26)*26);y<Math.min(H,v.y+v.h);y+=26)for(let x=Math.max(0,Math.floor(v.x/29)*29);x<Math.min(W,v.x+v.w);x+=29){const n=(Math.imul(x+17,73856093)^Math.imul(y+31,19349663))>>>0;fill(c,x+n%17,y+(n>>>6)%13,2+n%4,2,n%2?'#e7edb315':'#385e4010');}
    for(const l of lots){rr(c,l.x,l.y,l.w,l.h,12,l.type==='warehouse'?'#b9b6a1':l.type==='tower'?'#b7bca9':'#a7b77e');}
    for(const b of buildings){if(b.type==='house'||b.type==='residential'){fill(c,b.x+8,b.y+b.h+6,b.w-16,12,'#d0c7a4');path(c,[[b.x-6,b.y+3],[b.x-6,b.y+b.h+20],[b.x+b.w,b.y+b.h+20]],'#79935d',3);}}
    rr(c,park.x,park.y,park.w,park.h,26,'#597e54');rr(c,park.x+12,park.y+12,park.w-24,park.h-24,23,'#8ca765');
    path(c,[[park.x+32,park.y+45],[park.x+park.w-32,park.y+park.h-45]],'#dccdad',17);
    path(c,[[park.x+32,park.y+park.h-45],[park.x+park.w-32,park.y+45]],'#dccdad',17);
    ellipse(c,1360,1300,70,65,'#d3c8a7');ellipse(c,1360,1300,48,43,'#e5dfc8');ellipse(c,1360,1300,37,32,'#62b5bc');ellipse(c,1356,1295,16,13,'#a7e1d7');
    water(c);
  }
  function roadsLayer(c){
    // All road edges first, then all asphalt: connected junctions never have curbs across them.
    for(const r of roads)path(c,r.points,'#52755a',r.width+39);
    for(const r of roads)path(c,r.points,'#d0cbb6',r.width+26);
    for(const a of areas)rr(c,a.x-13,a.y-13,a.w+26,a.h+26,24,'#d0cbb6');
    for(const r of roads)path(c,r.points,'#505b5d',r.width);
    for(const a of areas)rr(c,a.x,a.y,a.w,a.h,12,'#566163');
    for(const r of roads){
      path(c,r.points,'#dde0cd',3,[27,24]);
      if(r.points.length===2){
        const [a,b]=r.points,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
        for(const sign of [-1,1])path(c,[[a[0]+nx*(r.width/2-14)*sign,a[1]+ny*(r.width/2-14)*sign],[b[0]+nx*(r.width/2-14)*sign,b[1]+ny*(r.width/2-14)*sign]],'#d2d5bc',2);
      }
    }
    // Clear markings at junctions and paint crosswalks outside the intersection.
    for(const x of [430,1050,1680,2320,3020,3660])for(const y of [430,1010,1590,2170,2670]){
      if(!roads.some(r=>r.points.length===2&&r.points[0][0]===x&&y>=r.points[0][1]&&y<=r.points[1][1]))continue;
      if(!roads.some(r=>r.points.length===2&&r.points[0][1]===y&&x>=r.points[0][0]&&x<=r.points[1][0]))continue;
      fill(c,x-95,y-95,190,190,'#505b5d');
      if(y===2670||areas.some(a=>x>a.x-130&&x<a.x+a.w+130&&y>a.y-130&&y<a.y+a.h+130))continue;
      for(let d=-70;d<80;d+=19){
        fill(c,x+d,y-118,10,25,'#e5dfc8');fill(c,x+d,y+95,10,25,'#e5dfc8');fill(c,x-118,y+d,25,10,'#e5dfc8');fill(c,x+95,y+d,25,10,'#e5dfc8');
      }
      for(const dx of [-112,112])for(const dy of [-112,112]){fill(c,x+dx,y+dy,5,13,'#344848');fill(c,x+dx+1,y+dy+2,3,3,'#e8ba64');}
    }
    // Large, unobstructed activity aprons.
    for(const a of areas)rr(c,a.x,a.y,a.w,a.h,12,'#596365');
    // Tire arcs are visual only: the whole port apron remains drivable.
    c.save();c.strokeStyle='#29393a45';c.lineWidth=6;
    for(let i=0;i<7;i++){c.beginPath();c.ellipse(590+i*6,2290+i*3,145+i*10,110+i*9,-.3,.3,TAU-.45);c.stroke();}c.restore();
    for(let y=1960;y<2550;y+=38){fill(c,266,y,8,21,'#e7d3a5');fill(c,956,y,8,21,'#e7d3a5');}
    text(c,'HARBOR / 03',615,2010,27,'#dfddc68c');text(c,'DRIFT DOCK',620,2510,32,'#dfddc6b0');
    // Meeting plaza, marked parking bays and a clear through road.
    for(const y of [1400,1735])for(let x=1990;x<2680;x+=70){path(c,[[x,y],[x,y+43],[x+54,y+43]],'#e4e1c5',2);}
    text(c,'APEX MOTOR CLUB',2320,1500,28,'#ede8d2');text(c,'MEET • PARK • DRIVE',2320,1690,14,'#cad3c3');
    // Airport start / finish and two unobstructed lanes retain multiplayer coordinates.
    path(c,[[2900,2670],[4100,2670]],'#e3dfc4',4,[42,28]);
    for(const x of [3130,3920])for(let row=0;row<10;row++)for(let col=0;col<2;col++)fill(c,x+col*12,2545+row*25,12,25,(row+col)%2?'#434c50':'#f1ecda');
    text(c,'09',2980,2642,48);text(c,'27',4060,2750,48);text(c,'START',3210,2550,15);text(c,'FINISH',3820,2800,15);
    for(let x=2890;x<4120;x+=80){ellipse(c,x,2525,3,3,'#8ed4db');ellipse(c,x,2814,3,3,'#8ed4db');}
  }
  function building(c,b){
    const {x,y,w,h,type,tone}=b,sl=b.height;
    // Directional extrusion and shadows give genuine roofs a readable top-down volume.
    rr(c,x+sl*.7,y+sl,w+7,h+5,3,'#29443c38');fill(c,x+3,y+5,w,h,'#e0d6be');fill(c,x+w-6,y+5,9,h,'#82938c');fill(c,x+3,y+h-4,w,10,'#708079');
    if(type==='house'||type==='residential'){
      const palette=[['#bb654b','#944c3d'],['#c77750','#a25841'],['#74878a','#526b72'],['#d2b27e','#ad8d63']],p=palette[tone];
      const roof=c.createLinearGradient(x,y,x+w*.25,y+h);roof.addColorStop(0,p[0]);roof.addColorStop(.48,p[0]);roof.addColorStop(.5,p[1]);roof.addColorStop(1,p[1]);c.fillStyle=roof;c.fillRect(x,y,w,h);
      path(c,[[x,y+h],[x,y],[x+w,y]],'#f9d7aa80',2);
      path(c,[[x-3,y+h/2],[x+w+3,y+h/2]],'#e3c099',3);
      c.strokeStyle='#402e241d';c.lineWidth=1;
      for(let yy=y+7;yy<y+h;yy+=8)path(c,[[x,yy],[x+w,yy]],'#402e242b',1);
      for(let xx=x+10;xx<x+w;xx+=17)path(c,[[xx,y],[xx,y+h]],'#f9d2a524',1);
      fill(c,x+w-22,y+13,10,14,'#694f41');fill(c,x+w-24,y+10,12,6,'#e0c9ac');
      if(tone===2){fill(c,x+12,y+10,30,21,'#305570');for(let k=0;k<3;k++)fill(c,x+13+k*10,y+11,1,19,'#9ab6bd');}
      fill(c,x+10,y+h+2,18,5,'#314e59');fill(c,x+w-28,y+h+2,18,5,'#314e59');
    }else{
      fill(c,x,y,w,h,type==='tower'?'#426974':'#89989a');fill(c,x+5,y+5,w-10,h-10,type==='tower'?['#77989b','#a3b3ad','#658592','#d0ccb6'][tone]:'#b5bcb4');
      if(type==='warehouse'){
        for(let xx=x+8;xx<x+w-5;xx+=9)fill(c,xx,y+6,2,h-12,'#6c82834d');
        for(let yy=y+18;yy<y+h-12;yy+=32){fill(c,x+15,yy,w-30,10,'#6e9fa8');fill(c,x+15,yy,w-30,2,'#d1e5db');}
      }else{
        fill(c,x+13,y+12,w-26,h-26,'#7d9693');
        for(let xx=x+8;xx<x+w-6;xx+=15){fill(c,xx,y+1,8,3,'#d0edf0');fill(c,xx,y+h-4,8,3,'#d0edf0');}
        fill(c,x+18,y+20,22,27,'#526b6b');fill(c,x+16,y+17,22,27,'#c9cec0');ellipse(c,x+27,y+29,7,7,'#6f8381');
        fill(c,x+w-40,y+h-40,23,18,'#b9c5bb');path(c,[[x+w-37,y+h-36],[x+w-22,y+h-36]],'#7b908a',2);
      }
    }
  }
  const treeSprites=new Map();
  function tree(c,t){
    const key=t.tone;
    if(!treeSprites.has(key)){
      const spr=document.createElement('canvas');spr.width=spr.height=112;const g=spr.getContext('2d');
      const colors=[['#2e573b','#77a059'],['#3e673c','#97ae63'],['#566a37','#b4b16a'],['#275948','#6d9c71'],['#7b7644','#c6ba7b']][key];
      ellipse(g,65,72,37,29,'#1e3c3540');
      const grad=g.createRadialGradient(41,35,3,54,52,39);grad.addColorStop(0,colors[1]);grad.addColorStop(1,colors[0]);
      ellipse(g,52,50,35,33,colors[0]);
      for(let i=0;i<12;i++){const a=i*TAU/12,r=22+(i%3)*3;ellipse(g,52+Math.cos(a)*r,50+Math.sin(a)*r,13+i%4,12+i%5,grad);}
      ellipse(g,48,46,26,25,grad);
      for(let i=0;i<65;i++){const a=i*2.399,r=Math.sqrt(i/65)*31,x=50+Math.cos(a)*r,y=47+Math.sin(a)*r;ellipse(g,x,y,2+i%3,1.5+i%2,i%3?'#d9e6b522':'#213e2926');}
      treeSprites.set(key,spr);
    }
    const d=t.r*3;c.drawImage(treeSprites.get(key),t.x-d*.465,t.y-d*.45,d,d);
  }
  function props(c){
    // Containers are on the quay outside the playable drift apron.
    for(let i=0;i<8;i++){
      const x=292+i*85,y=1852;if(roadAt(x+32,y+20,48))continue;fill(c,x+5,y+6,65,43,'#314b4544');fill(c,x,y,65,43,['#b86c4a','#5b8c93','#c4a461','#798964'][i%4]);
      for(let j=8;j<64;j+=9)fill(c,x+j,y+3,2,37,'#f6e6c72b');
    }
    for(const x of [740]){fill(c,x,1810,12,48,'#d4ab58');path(c,[[x-28,1820],[x+80,1820]],'#d5ac58',10);path(c,[[x+80,1820],[x+80,1840]],'#465957',3);}
    for(let i=0;i<5;i++)building(c,{x:2860+i*246,y:2870,w:195,h:87,type:'warehouse',tone:1,height:12});
    // Rooftop court, cafe parasols and park benches make districts recognizable.
    rr(c,1768,560,190,300,8,'#c8c5a6');rr(c,1780,574,166,269,5,'#608b83');
    c.strokeStyle='#ece5ca';c.lineWidth=3;c.strokeRect(1795,590,136,234);path(c,[[1795,707],[1931,707]],'#ece5ca',3);ellipse(c,1863,707,30,30,'#6e9b89');
    for(const [x,y] of [[1940,1260],[2730,1490],[2728,1570]]){ellipse(c,x+4,y+7,23,21,'#354b3e33');ellipse(c,x,y,22,22,'#ede4ca');path(c,[[x-18,y],[x+18,y]],'#d5a171',5);path(c,[[x,y-18],[x,y+18]],'#d5a171',5);}
    for(const [x,y] of [[1260,1220],[1450,1380],[1260,1390],[1450,1210]]){fill(c,x,y,30,9,'#9b7952');fill(c,x+3,y+8,3,6,'#4b6050');fill(c,x+24,y+8,3,6,'#4b6050');}
    // Compact wayfinding signs sit on sidewalks, clear of the driving line.
    for(const [x,y,label,color] of [[1850,1590,'MEET →','#c0dd8f'],[1050,1870,'↓ PORT','#d3b0e5'],[3020,2380,'↓ AIRPORT','#acd9e7']]){
      const sx=x+115;if(roadAt(sx,y,32))continue;fill(c,sx,y,4,27,'#53665b');rr(c,sx-26,y-16,58,22,3,'#314d49');text(c,label,sx+3,y-1,9,color);
    }
  }
  function scene(c,v={x:0,y:0,w:W,h:H}){
    const visible=(x,y,w,h)=>x+w>v.x-60&&x<v.x+v.w+60&&y+h>v.y-60&&y<v.y+v.h+60;
    ground(c,v);roadsLayer(c);for(const b of buildings)if(visible(b.x,b.y,b.w,b.h))building(c,b);props(c);for(const t of trees)if(visible(t.x-t.r,t.y-t.r,t.r*2,t.r*2))tree(c,t);
  }
  // Bounded LRU: no giant DPR-scaled world bitmap and no per-frame city regeneration.
  const tiles=new Map(),TILE=512;
  let tileLimit=32;
  let overview=null;
  function tile(tx,ty){
    const key=tx+','+ty;
    if(tiles.has(key)){const v=tiles.get(key);tiles.delete(key);tiles.set(key,v);return v;}
    const el=document.createElement('canvas');el.width=el.height=TILE+4;
    const c=el.getContext('2d',{alpha:false});c.translate(2-tx*TILE,2-ty*TILE);scene(c,{x:tx*TILE-2,y:ty*TILE-2,w:TILE+4,h:TILE+4});tiles.set(key,el);
    if(tiles.size>tileLimit){const oldest=tiles.keys().next().value;const old=tiles.get(oldest);old.width=old.height=1;tiles.delete(oldest);}
    return el;
  }
  function draw(c,view){
    const v=view||{x:0,y:0,w:W,h:H};
    fill(c,v.x,v.y,v.w,v.h,'#345e61');
    const x0=Math.max(0,Math.floor(v.x/TILE)),x1=Math.min(Math.ceil(W/TILE)-1,Math.floor((v.x+v.w)/TILE));
    const y0=Math.max(0,Math.floor(v.y/TILE)),y1=Math.min(Math.ceil(H/TILE)-1,Math.floor((v.y+v.h)/TILE));
    tileLimit=Math.max(32,(x1-x0+1)*(y1-y0+1)+2);
    c.save();c.beginPath();c.rect(0,0,W,H);c.clip();
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)c.drawImage(tile(x,y),x*TILE-2,y*TILE-2);
    c.restore();
  }
  function drawOverview(c,w,h){
    if(!overview){overview=document.createElement('canvas');overview.width=1260;overview.height=900;const g=overview.getContext('2d',{alpha:false});g.scale(.3,.3);scene(g);}
    c.drawImage(overview,0,0,w,h);
    const labels=[['ОЗЁРНЫЙ ПЕРЕВАЛ',560,165],['ЦЕНТРАЛЬНЫЙ ПАРК',1360,1210],['ИНДУСТРИАЛЬНЫЙ',3340,720],['СОЛНЕЧНЫЙ КВАРТАЛ',3320,1930],['АЭРОПОРТ',3460,2910],['APEX BAY',2060,880]];
    for(const [label,x,y] of labels){
      c.font='800 11px system-ui';const tw=c.measureText(label).width,px=x/W*w,py=y/H*h;
      rr(c,px-tw/2-8,py-12,tw+16,20,5,'#203d38d9');text(c,label,px,py+2,11,'#f0eedb');
    }
  }
  window.ApexCity={width:W,height:H,resolveCarMotion,roadAt,nearestRoad,district,draw,drawOverview};
})();
