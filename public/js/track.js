(function () {
  'use strict';
  const R = window.Racing = window.Racing || {};

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  class Track {
    constructor(config=R.TRACKS.apexCircuit) {
      this.config=config;this.id=config.id;this.theme=config.theme;this.roadWidth=config.roadWidth;
      this.curbWidth=clamp(config.curbWidth??10,6,12);this.driveableMargin=this.curbWidth;this.barrierMargin=clamp(config.barrierMargin??38,30,44);
      this.points=config.points;this.samples=[];this.length=0;this._cache=null;
      this._build();
    }

    _catmull(p0,p1,p2,p3,t) {
      // Centripetal Catmull-Rom (alpha=.5) is much less prone to loops/overshoot
      // when control points are unevenly spaced, while retaining C1-smooth closure.
      const step=(a,b)=>Math.sqrt(Math.max(1e-8,Math.hypot(b.x-a.x,b.y-a.y)));
      const t0=0,t1=t0+step(p0,p1),t2=t1+step(p1,p2),t3=t2+step(p2,p3),u=lerp(t1,t2,t);
      const mix=(a,b,ta,tb,q)=>{const d=tb-ta;if(d<1e-8)return{x:a.x,y:a.y};const f=(q-ta)/d;return{x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f)};};
      const a1=mix(p0,p1,t0,t1,u),a2=mix(p1,p2,t1,t2,u),a3=mix(p2,p3,t2,t3,u);
      const b1=mix(a1,a2,t0,t2,u),b2=mix(a2,a3,t1,t3,u);
      return mix(b1,b2,t1,t2,u);
    }

    _build() {
      // Sample the complete closed spline, then resample by arc length. Never truncate
      // its last segment: unequal control point spacing must not bias race progress.
      const raw=[],n=this.points.length;
      for(let i=0;i<n;i++)for(let k=0;k<80;k++)raw.push(this._catmull(this.points[(i+n-1)%n],this.points[i],this.points[(i+1)%n],this.points[(i+2)%n],k/80));
      raw.push({...raw[0]});
      let length=0;const cumulative=[0];
      for(let i=1;i<raw.length;i++){length+=Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y);cumulative.push(length);}
      const scale=this.config.targetLength?this.config.targetLength/length:1;
      this.length=length*scale;this.sampleCount=Math.ceil(this.length/12);this.spacing=this.length/this.sampleCount;
      let j=0;
      for(let i=0;i<this.sampleCount;i++){
        const d=i*length/this.sampleCount;while(cumulative[j+1]<d)j++;
        const t=(d-cumulative[j])/(cumulative[j+1]-cumulative[j]);
        this.samples.push({x:lerp(raw[j].x,raw[j+1].x,t)*scale,y:lerp(raw[j].y,raw[j+1].y,t)*scale,cum:i*this.spacing,seg:this.spacing});
      }
      const a=this.samples,m=a.length;
      for(let i=0;i<m;i++){
        const prev=a[(i+m-1)%m],next=a[(i+1)%m],dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy);
        Object.assign(a[i],{tx:dx/l,ty:dy/l,nx:-dy/l,ny:dx/l});
      }
      this.recommendedSpeed=[];this.racingLineOffset=[];this.lineCurvature=[];this._speedProfileCache=new Map();
      for(let i=0;i<m;i++){
        const prev=a[(i+m-2)%m],next=a[(i+2)%m];
        const signed=Math.atan2(prev.tx*next.ty-prev.ty*next.tx,clamp(prev.tx*next.tx+prev.ty*next.ty,-1,1))/(4*this.spacing);
        a[i].curvature=signed;a[i].curve=Math.abs(signed)*8*this.spacing;
      }
      this._buildRacingLine();
      this.bounds={minX:Math.min(...a.map(p=>p.x))-440,minY:Math.min(...a.map(p=>p.y))-440,maxX:Math.max(...a.map(p=>p.x))+440,maxY:Math.max(...a.map(p=>p.y))+440};
    }


    _buildRacingLine() {
      if(!R.RacingLinePlanner)throw new Error('RacingLinePlanner must be loaded before Track');
      const plan=R.RacingLinePlanner.build(this);
      this.racingLinePlan=plan;this.racingLines={};this.lineCurvatures={};this.recommendedSpeeds={};this.planningSpeeds={};this.linePoints={};this.lineSegmentLengths={};this.lineLimits={};
      for(const mode of ['easy','medium','hard','extreme']){
        const m=plan.modes[mode];
        this.racingLines[mode]=m.offsets;this.lineCurvatures[mode]=m.geometry.curvature;this.recommendedSpeeds[mode]=m.geometry.recommendedSpeed;this.planningSpeeds[mode]=m.geometry.speed;
        this.linePoints[mode]=m.geometry.points;this.lineSegmentLengths[mode]=m.geometry.segmentLength;this.lineLimits[mode]=m.limits;
      }
      // Backward-compatible aliases point at the physically fastest precomputed line.
      this.racingLineOffset=this.racingLines.extreme;this.lineCurvature=this.lineCurvatures.extreme;this.recommendedSpeed=this.recommendedSpeeds.extreme;
      this.apexes=plan.apices;this.sectors=plan.sectors;this.asphaltCenterLimit=plan.asphaltLimit;this.shoulderCenterLimit=plan.shoulderLimit;
      this.racingLineMeta={};for(const mode of ['easy','medium','hard','extreme'])this.racingLineMeta[mode]={choices:plan.modes[mode].choices,estimatedLap:plan.modes[mode].geometry.time,limits:plan.modes[mode].limits};
    }

    getRacingLine(mode='extreme') { return this.racingLines[mode]||this.racingLines.extreme; }

    getLineCurvature(mode='extreme') { return this.lineCurvatures[mode]||this.lineCurvatures.extreme; }

    maxDriveableCenter(lateralExtent=22) { return Math.max(18,this.roadWidth*.5+this.curbWidth-lateralExtent); }

    barrierCenterLimit(lateralExtent=22) { return Math.max(18,this.roadWidth*.5+this.barrierMargin-lateralExtent-1.5); }

    surfaceAtOffset(signed,lateralExtent=22) {
      const contactEdge=Math.abs(signed)+Math.max(0,lateralExtent),roadHalf=this.roadWidth*.5,curbInside=5.5;
      const penetration=contactEdge-roadHalf;
      // The rendered curb is centred on the asphalt edge and therefore starts a few
      // units inside the nominal road width. Tyres can use that narrow band without
      // being classified as grass; the zone beyond it remains deliberately small.
      if(contactEdge<=roadHalf-curbInside)return {type:'asphalt',penetration:Math.max(0,penetration),driveable:true};
      if(contactEdge<=roadHalf+this.curbWidth)return {type:'shoulder',penetration,driveable:true};
      return {type:'offroad',penetration,driveable:false};
    }

    indexAtDistance(index,distance,mode='extreme') {
      const seg=this.lineSegmentLengths[mode]||this.lineSegmentLengths.extreme,n=this.samples.length;
      let i=((index%n)+n)%n,remain=Math.max(0,distance),guard=0;
      while(remain>seg[i]&&guard++<n){remain-=seg[i];i=(i+1)%n;}
      return {index:i,next:(i+1)%n,t:clamp(remain/Math.max(1,seg[i]),0,1)};
    }

    lookaheadPoint(index,distance,lane,mode='extreme') {
      const hit=this.indexAtDistance(index,distance,mode),a=this.samples[hit.index],b=this.samples[hit.next],t=hit.t;
      let tx=lerp(a.tx,b.tx,t),ty=lerp(a.ty,b.ty,t),tl=Math.hypot(tx,ty)||1;tx/=tl;ty/=tl;
      const nx=-ty,ny=tx;
      return {x:lerp(a.x,b.x,t)+nx*lane,y:lerp(a.y,b.y,t)+ny*lane,tx,ty,nx,ny,index:hit.index,t};
    }

    getSpeedProfile(car,opts={}) {
      const grip=clamp(opts.gripUsage??.94,.58,1),brakeUse=clamp(opts.brakeUsage??.92,.55,1),accelUse=clamp(opts.accelUsage??.94,.55,1);
      const pace=clamp(opts.pace??1,.62,1),mode=this.racingLines[opts.difficulty]?opts.difficulty:(opts.line||'extreme');
      const key=[mode,Math.round(car.maxSpeed),Math.round(car.accel),Math.round(car.brakePower),grip.toFixed(3),brakeUse.toFixed(3),accelUse.toFixed(3),pace.toFixed(3)].join(':');
      const cached=this._speedProfileCache.get(key);if(cached)return cached;
      const n=this.samples.length,profile=Array(n),cap=car.maxSpeed*pace,recommended=this.recommendedSpeeds[mode]||this.recommendedSpeeds.extreme,seg=this.lineSegmentLengths[mode]||this.lineSegmentLengths.extreme;
      const gripSpeed=Math.sqrt(grip);
      for(let i=0;i<n;i++)profile[i]=Math.min(cap,recommended[i]*gripSpeed);
      const brakeDrag=2.25+.00031*Math.pow(car.maxSpeed*(mode==='extreme'?.95:mode==='hard'?.74:.60),2),brake=Math.max(40,car.brakePower*.80*brakeUse+brakeDrag),accel=Math.max(30,car.accel*.84*accelUse);
      // Closed-loop propagation couples local lateral limits to braking and acceleration.
      for(let pass=0;pass<6;pass++){
        for(let i=n-1;i>=0;i--){const next=(i+1)%n;profile[i]=Math.min(profile[i],Math.sqrt(profile[next]*profile[next]+2*brake*seg[i]));}
        for(let i=0;i<n;i++){const prev=(i-1+n)%n;profile[i]=Math.min(profile[i],Math.sqrt(profile[prev]*profile[prev]+2*accel*seg[prev]));}
      }
      this._speedProfileCache.set(key,profile);return profile;
    }

    sampleAtProgress(p, lane=0) {
      p=((p%1)+1)%1;
      const f=p*this.samples.length;
      const i=Math.floor(f)%this.samples.length, j=(i+1)%this.samples.length, t=f-i;
      const a=this.samples[i], b=this.samples[j];
      let tx=lerp(a.tx,b.tx,t), ty=lerp(a.ty,b.ty,t);
      const tl=Math.hypot(tx,ty)||1; tx/=tl; ty/=tl;
      const nx=-ty, ny=tx;
      return {x:lerp(a.x,b.x,t)+nx*lane,y:lerp(a.y,b.y,t)+ny*lane,tx,ty,nx,ny,index:i,curve:lerp(a.curve,b.curve,t)};
    }

    nearest(x,y,hint) {
      const n=this.samples.length;
      let bestI=0, bestD=Infinity;
      if(Number.isFinite(hint)) {
        const h=((hint%n)+n)%n;
        for(let o=-26;o<=26;o++) {
          const i=(h+o+n)%n, p=this.samples[i], dx=x-p.x,dy=y-p.y,d=dx*dx+dy*dy;
          if(d<bestD){bestD=d;bestI=i;}
        }
        if(bestD>260*260) return this.nearest(x,y,undefined);
      } else {
        for(let i=0;i<n;i++) {
          const p=this.samples[i], dx=x-p.x,dy=y-p.y,d=dx*dx+dy*dy;
          if(d<bestD){bestD=d;bestI=i;}
        }
      }
      const p=this.samples[bestI], dx=x-p.x,dy=y-p.y;
      return {
        index:bestI,
        progress:bestI/n,
        distance:Math.sqrt(bestD),
        signed:dx*p.nx+dy*p.ny,
        tx:p.tx,ty:p.ty,nx:p.nx,ny:p.ny,
        x:p.x,y:p.y,
        curve:p.curve
      };
    }

    _path(ctx, offset=0) {
      const s=this.samples;
      ctx.beginPath();
      const p0=s[0]; ctx.moveTo(p0.x+p0.nx*offset,p0.y+p0.ny*offset);
      for(let i=1;i<s.length;i++){const p=s[i];ctx.lineTo(p.x+p.nx*offset,p.y+p.ny*offset);} ctx.closePath();
    }

    draw(ctx) {
      // A single bounded static texture per active track keeps mobile frame cost low.
      if(!this._cache){
        const b=this.bounds,w=b.maxX-b.minX,h=b.maxY-b.minY;
        this.cacheScale=Math.min(.85,3072/w,2304/h);
        const c=document.createElement('canvas');c.width=Math.ceil(w*this.cacheScale);c.height=Math.ceil(h*this.cacheScale);
        const cx=c.getContext('2d');cx.scale(this.cacheScale,this.cacheScale);cx.translate(-b.minX,-b.minY);this._drawStatic(cx);this._cache=c;
      }
      const b=this.bounds;ctx.fillStyle=this.theme.ground;ctx.fillRect(b.minX-8000,b.minY-8000,16000,16000);
      ctx.drawImage(this._cache,b.minX,b.minY,this._cache.width/this.cacheScale,this._cache.height/this.cacheScale);
    }

    drawDebug(ctx,cars=[]) {
      if(!R.AI_DEBUG)return;
      const n=this.samples.length,path=(offset,width,stroke,dash=[])=>{ctx.save();ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash);this._path(ctx,offset);ctx.stroke();ctx.restore();};
      path(0,1.6,'rgba(255,255,255,.45)',[12,10]);
      const road=this.roadWidth*.5,drive=road+this.curbWidth;
      // Nominal asphalt edge (cyan) and the narrow driveable curb/shoulder edge (amber).
      path(-road,1.0,'rgba(80,220,255,.50)',[7,7]);path(road,1.0,'rgba(80,220,255,.50)',[7,7]);
      path(-drive,1.3,'rgba(255,196,70,.62)');path(drive,1.3,'rgba(255,196,70,.62)');
      const line=this.racingLines.extreme;ctx.save();ctx.strokeStyle='rgba(70,255,150,.9)';ctx.lineWidth=2.4;ctx.beginPath();
      for(let i=0;i<n;i++){const p=this.samples[i],x=p.x+p.nx*line[i],y=p.y+p.ny*line[i];if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();ctx.restore();
      ctx.save();ctx.fillStyle='rgba(255,90,90,.9)';for(const a of this.apexes){const p=this.samples[a.index],o=line[a.index];ctx.beginPath();ctx.arc(p.x+p.nx*o,p.y+p.ny*o,4+5*a.severity,0,Math.PI*2);ctx.fill();}ctx.restore();
      // Braking zones are derived from the planner's backward-propagated speed profile.
      const ps=this.planningSpeeds.extreme,rec=this.recommendedSpeeds.extreme;ctx.save();ctx.strokeStyle='rgba(255,80,55,.72)';ctx.lineWidth=5;ctx.beginPath();let drawing=false;
      for(let i=0;i<n;i++){const p=this.samples[i],o=line[i],braking=ps&&rec&&ps[i]<rec[i]-7&&ps[(i+1)%n]<ps[i]+1.5;if(braking){const x=p.x+p.nx*o,y=p.y+p.ny*o;if(!drawing){ctx.moveTo(x,y);drawing=true;}else ctx.lineTo(x,y);}else drawing=false;}ctx.stroke();ctx.restore();
      // Linked S groups are purple; orange squares mark curvature-sign transitions.
      ctx.save();ctx.strokeStyle='rgba(180,110,255,.75)';ctx.lineWidth=4;for(const sec of this.sectors)if(sec.signChanges){ctx.beginPath();let i=sec.firstIndex,guard=0;while(guard++<n){const p=this.samples[i],o=line[i];if(guard===1)ctx.moveTo(p.x+p.nx*o,p.y+p.ny*o);else ctx.lineTo(p.x+p.nx*o,p.y+p.ny*o);if(i===sec.lastIndex)break;i=(i+1)%n;}ctx.stroke();}ctx.restore();
      ctx.save();ctx.fillStyle='rgba(255,160,45,.92)';for(const sec of this.sectors){for(let k=1;k<sec.apices.length;k++){const a=sec.apices[k-1],b=sec.apices[k];if(a.sign===b.sign)continue;const gap=(b.index-a.index+n)%n,idx=(a.index+Math.round(gap*.5))%n,p=this.samples[idx],o=line[idx];ctx.fillRect(p.x+p.nx*o-4,p.y+p.ny*o-4,8,8);}}ctx.restore();
      for(const c of cars){if(!c.ai)continue;const ai=c.ai;if(ai.debugAim){ctx.save();ctx.strokeStyle='rgba(80,210,255,.85)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(ai.debugAim.x,ai.debugAim.y);ctx.stroke();ctx.fillStyle='rgba(80,210,255,.9)';ctx.beginPath();ctx.arc(ai.debugAim.x,ai.debugAim.y,4,0,Math.PI*2);ctx.fill();ctx.restore();}if(ai.debugTrail&&ai.debugTrail.length>1){ctx.save();ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=1.2;ctx.beginPath();ai.debugTrail.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();}}
    }

    release(){if(this._cache){this._cache.width=this._cache.height=1;this._cache=null;}}

    _sampleIndex(progress) {
      const n=this.samples.length;
      return ((Math.round((((progress%1)+1)%1)*n)%n)+n)%n;
    }

    _scenerySpot(progress,side=1,extra=90,clearance=28) {
      const p=this.samples[this._sampleIndex(progress)],off=this.roadWidth*.5+this.barrierMargin+extra;
      const x=p.x+p.nx*off*side,y=p.y+p.ny*off*side;
      if(this.nearest(x,y).distance<this.roadWidth*.5+this.barrierMargin+clearance)return null;
      return {p,x,y,angle:Math.atan2(p.ty,p.tx),side};
    }

    _drawGrandstand(ctx,progress,side=1,scale=1,roof=true) {
      const depth=58*scale,spot=this._scenerySpot(progress,side,86+depth*.62,depth*.48);if(!spot)return;
      const width=170*scale;ctx.save();ctx.translate(spot.x,spot.y);ctx.rotate(spot.angle);
      ctx.globalAlpha=.2;ctx.fillStyle='#030608';ctx.fillRect(-width*.52,-depth*.38,width*1.04,depth*1.18);ctx.globalAlpha=1;
      ctx.fillStyle=this.theme.kind==='neon'?'#17283a':'#30383a';ctx.fillRect(-width*.5,-depth*.5,width,depth);
      for(let r=0;r<5;r++){
        const y=-depth*.38+r*depth*.17;ctx.fillStyle=r&1?(this.theme.kind==='neon'?'#34536c':'#bfc8c2'):'#697473';ctx.fillRect(-width*.45,y,width*.9,depth*.095);
        ctx.globalAlpha=.62;for(let k=-width*.4;k<width*.42;k+=11*scale){ctx.fillStyle=((k/(11*scale)+r)&1)?this.theme.accent:'#e7eee8';ctx.fillRect(k,y+2,3*scale,2.3*scale);}ctx.globalAlpha=1;
      }
      ctx.strokeStyle='#d6ddda';ctx.globalAlpha=.45;ctx.lineWidth=2;ctx.strokeRect(-width*.5,-depth*.5,width,depth);ctx.globalAlpha=1;
      if(roof){ctx.fillStyle=this.theme.kind==='neon'?'#0c1725':'#182124';ctx.fillRect(-width*.55,-depth*.66,width*1.1,depth*.18);ctx.fillStyle=this.theme.accent;ctx.globalAlpha=.5;ctx.fillRect(-width*.5,-depth*.64,width,2.5*scale);ctx.globalAlpha=1;}
      ctx.restore();
    }

    _drawSpectatorZone(ctx,progress,side=1) {
      const spot=this._scenerySpot(progress,side,82,25);if(!spot)return;ctx.save();ctx.translate(spot.x,spot.y);ctx.rotate(spot.angle);
      ctx.fillStyle='rgba(8,12,13,.35)';ctx.fillRect(-50,-24,100,48);ctx.strokeStyle='rgba(235,245,240,.42)';ctx.lineWidth=2;ctx.strokeRect(-50,-24,100,48);
      for(let y=-14;y<=14;y+=9)for(let x=-41;x<=41;x+=10){ctx.fillStyle=((x+y)&2)?this.theme.accent:'#d9dfdc';ctx.globalAlpha=.55;ctx.fillRect(x,y,3,3);}ctx.globalAlpha=1;
      ctx.restore();
    }

    _drawPitBuilding(ctx) {
      const kind=this.theme.kind;if(kind!=='circuit'&&kind!=='neon'&&kind!=='aurora')return;
      const side=this.config.scenery?.pitSide||1,spot=this._scenerySpot(.055,side,118,42);if(!spot)return;
      const width=kind==='circuit'?250:(kind==='aurora'?285:205),depth=kind==='aurora'?64:58;ctx.save();ctx.translate(spot.x,spot.y);ctx.rotate(spot.angle);
      ctx.fillStyle='rgba(0,0,0,.24)';ctx.fillRect(-width*.52,-depth*.4,width*1.04,depth*1.2);
      ctx.fillStyle=kind==='neon'?'#132238':kind==='aurora'?'#172427':'#d5dad5';ctx.fillRect(-width*.5,-depth*.5,width,depth);
      ctx.fillStyle=kind==='neon'?'#223d5a':kind==='aurora'?'#26383c':'#2d3637';ctx.fillRect(-width*.5,-depth*.5,width,13);
      for(let x=-width*.43;x<width*.45;x+=30){ctx.fillStyle=kind==='neon'?'#63dff5':kind==='aurora'?'#a7fff0':'#1e2728';ctx.globalAlpha=.72;ctx.fillRect(x,-7,17,17);}ctx.globalAlpha=1;
      ctx.fillStyle=this.theme.accent;ctx.globalAlpha=.65;ctx.fillRect(-width*.46,18,width*.92,4);ctx.globalAlpha=1;
      ctx.restore();
    }

    _drawServiceRoad(ctx) {
      const side=this.config.scenery?.pitSide||1,n=this.samples.length,offset=this.roadWidth*.5+this.barrierMargin+62;
      ctx.save();ctx.strokeStyle=this.theme.kind==='coast'?'#d8e0d9':this.theme.kind==='desert'?'#9a6d4e':this.theme.kind==='aurora'?'#506a6b':'#687477';ctx.lineWidth=this.theme.kind==='coast'?20:(this.theme.kind==='aurora'?16:18);ctx.globalAlpha=.42;ctx.lineCap='round';ctx.beginPath();let drawing=false;
      for(let q=-20;q<=50;q++){
        const i=(q+n)%n,p=this.samples[i],x=p.x+p.nx*offset*side,y=p.y+p.ny*offset*side,clear=this.nearest(x,y).distance>this.roadWidth*.5+this.barrierMargin+20;
        if(!clear){drawing=false;continue;}if(!drawing){ctx.moveTo(x,y);drawing=true;}else ctx.lineTo(x,y);
      }
      ctx.stroke();ctx.restore();
    }

    _drawCircuitScenery(ctx) {
      const tree=(progress,side)=>{const s=this._scenerySpot(progress,side,115,34);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#092a18';ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2d7543';ctx.beginPath();ctx.arc(-5,-6,15,0,Math.PI*2);ctx.fill();ctx.restore();};
      [.14,.2,.31,.56,.67,.84,.9].forEach((p,i)=>tree(p,i&1?1:-1));
      [.18,.39,.63,.82].forEach((p,i)=>{const s=this._scenerySpot(p,i&1?-1:1,56,16);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);ctx.fillStyle='#20292a';ctx.fillRect(-28,-9,56,18);ctx.fillStyle=i&1?'#f2f3ed':this.theme.accent;ctx.globalAlpha=.72;ctx.fillRect(-23,-4,46,8);ctx.restore();ctx.globalAlpha=1;});
    }

    _drawNeonScenery(ctx) {
      const b=this.bounds;ctx.save();ctx.fillStyle='#0b2437';ctx.globalAlpha=.72;ctx.fillRect(b.minX,b.minY,(b.maxX-b.minX)*.31,b.maxY-b.minY);ctx.strokeStyle='#34718a';ctx.globalAlpha=.25;ctx.lineWidth=2;for(let y=b.minY+20;y<b.maxY;y+=35){ctx.beginPath();ctx.moveTo(b.minX,y);ctx.lineTo(b.minX+(b.maxX-b.minX)*.31,y+8);ctx.stroke();}ctx.restore();
      [.17,.29,.58,.78,.9].forEach((progress,i)=>{const s=this._scenerySpot(progress,i&1?1:-1,105,36);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);for(let r=0;r<2;r++)for(let c=0;c<3;c++){ctx.fillStyle=(c+r+i)%3===0?'#285a78':(c+r+i)%3===1?'#633e78':'#754632';ctx.fillRect(-48+c*33,-28+r*27,29,23);ctx.strokeStyle='rgba(255,255,255,.15)';ctx.strokeRect(-48+c*33,-28+r*27,29,23);}ctx.restore();});
      [.36,.7].forEach((progress,i)=>{const s=this._scenerySpot(progress,i?1:-1,145,48);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);ctx.strokeStyle='#526a7e';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-35,38);ctx.lineTo(-35,-58);ctx.lineTo(42,-58);ctx.lineTo(58,-24);ctx.stroke();ctx.strokeStyle=this.theme.accent;ctx.globalAlpha=.55;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(42,-58);ctx.lineTo(10,8);ctx.stroke();ctx.restore();});
    }

    _drawDesertScenery(ctx) {
      const b=this.bounds;ctx.save();ctx.globalAlpha=.22;for(let i=0;i<7;i++){const x=b.minX+90+i*(b.maxX-b.minX-180)/6,y=b.minY+70+(i%3)*55;ctx.fillStyle=i&1?'#6f3f30':'#8f5439';ctx.beginPath();ctx.moveTo(x-90,y+55);ctx.lineTo(x-60,y-5);ctx.lineTo(x-20,y-35);ctx.lineTo(x+35,y-20);ctx.lineTo(x+85,y+55);ctx.closePath();ctx.fill();}ctx.restore();
      [.13,.27,.4,.59,.72,.86].forEach((progress,i)=>{const s=this._scenerySpot(progress,i&1?1:-1,110+(i%2)*28,42);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(i*.7);ctx.fillStyle=i&1?'#744431':'#89553a';ctx.beginPath();ctx.moveTo(-36,24);ctx.lineTo(-27,-13);ctx.lineTo(3,-34);ctx.lineTo(37,-7);ctx.lineTo(28,27);ctx.closePath();ctx.fill();ctx.strokeStyle='#d59b67';ctx.globalAlpha=.35;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-24,1);ctx.lineTo(22,-9);ctx.stroke();ctx.restore();});
    }

    _drawAlpineScenery(ctx) {
      const b=this.bounds;ctx.save();ctx.globalAlpha=.28;for(let i=0;i<8;i++){const x=b.minX+i*(b.maxX-b.minX)/7,y=b.minY+165+(i%2)*45,h=130+(i%3)*35;ctx.fillStyle='#233d43';ctx.beginPath();ctx.moveTo(x-120,y);ctx.lineTo(x,y-h);ctx.lineTo(x+125,y);ctx.closePath();ctx.fill();ctx.fillStyle='#e7f0ef';ctx.beginPath();ctx.moveTo(x-28,y-h+32);ctx.lineTo(x,y-h);ctx.lineTo(x+34,y-h+38);ctx.lineTo(x+10,y-h+28);ctx.closePath();ctx.fill();}ctx.restore();
      [.1,.19,.28,.39,.5,.64,.74,.86,.93].forEach((progress,i)=>{const s=this._scenerySpot(progress,i&1?1:-1,104+(i%3)*15,30);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#173c35';for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(0,-34+k*10);ctx.lineTo(-18-k*3,13+k*8);ctx.lineTo(18+k*3,13+k*8);ctx.closePath();ctx.fill();}ctx.fillStyle='#4f4438';ctx.fillRect(-3,18,6,14);ctx.restore();});
    }

    _drawCoastScenery(ctx) {
      const b=this.bounds;ctx.save();ctx.fillStyle='#d7c59b';ctx.globalAlpha=.78;ctx.fillRect(b.minX,b.maxY-(b.maxY-b.minY)*.2,b.maxX-b.minX,(b.maxY-b.minY)*.2);ctx.restore();
      [.16,.38,.57,.76,.9].forEach((progress,i)=>{const s=this._scenerySpot(progress,i&1?1:-1,115,35);if(!s)return;ctx.save();ctx.translate(s.x,s.y);ctx.strokeStyle='#725942';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(0,-12);ctx.stroke();ctx.strokeStyle='#47776a';ctx.lineWidth=4;for(let k=0;k<5;k++){const a=k*Math.PI*2/5;ctx.beginPath();ctx.moveTo(0,-11);ctx.quadraticCurveTo(Math.cos(a)*11,Math.sin(a)*11-14,Math.cos(a)*28,Math.sin(a)*25-12);ctx.stroke();}ctx.restore();});
      for(let i=0;i<5;i++){const x=b.minX+75+i*78,y=b.minY+85+(i%2)*58;if(this.nearest(x,y).distance<this.roadWidth*.75)continue;ctx.save();ctx.translate(x,y);ctx.strokeStyle='#e8efed';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,17);ctx.lineTo(0,-16);ctx.stroke();ctx.fillStyle='#f7f7f0';ctx.beginPath();ctx.moveTo(2,-14);ctx.lineTo(23,8);ctx.lineTo(2,7);ctx.closePath();ctx.fill();ctx.restore();}
    }


    _drawAuroraScenery(ctx) {
      const b=this.bounds,w=b.maxX-b.minX,h=b.maxY-b.minY;
      // Cold shoreline / water mass. It is baked into the static cache, so the richer
      // scene has no per-frame gradient or blur cost on Safari.
      ctx.save();
      const water=ctx.createLinearGradient(b.minX,b.minY,b.maxX,b.maxY);water.addColorStop(0,'#0a343d');water.addColorStop(1,'#0d5660');
      ctx.fillStyle=water;ctx.globalAlpha=.88;ctx.beginPath();ctx.moveTo(b.minX+w*.58,b.minY);ctx.lineTo(b.maxX,b.minY);ctx.lineTo(b.maxX,b.maxY);ctx.lineTo(b.minX+w*.70,b.maxY);ctx.quadraticCurveTo(b.minX+w*.62,b.minY+h*.72,b.minX+w*.69,b.minY+h*.50);ctx.quadraticCurveTo(b.minX+w*.76,b.minY+h*.26,b.minX+w*.58,b.minY);ctx.fill();
      ctx.globalAlpha=.25;ctx.strokeStyle='#8de7e0';ctx.lineWidth=2;for(let i=0;i<18;i++){const y=b.minY+38+i*h/18;ctx.beginPath();ctx.moveTo(b.minX+w*.70,y);ctx.quadraticCurveTo(b.minX+w*.84,y+18,b.maxX-25,y-8);ctx.stroke();}ctx.restore();

      // Forest belts: compact top-down crowns with tiny trunks, intentionally sparse.
      const forest=[.08,.14,.22,.31,.48,.55,.69,.82,.90,.96];
      for(let i=0;i<forest.length;i++){
        const progress=forest[i],side=i%3===0?1:-1,spot=this._scenerySpot(progress,side,115+(i%3)*24,30);if(!spot)continue;
        ctx.save();ctx.translate(spot.x,spot.y);ctx.rotate(spot.angle*.08);
        for(let k=0;k<5;k++){const ox=(k-2)*19+(i%2)*5,oy=((k*17+i*11)%43)-21,r=12+(k%3)*4;ctx.fillStyle=k&1?'#123f39':'#0b312f';ctx.beginPath();ctx.arc(ox,oy,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.35;ctx.fillStyle='#64a986';ctx.beginPath();ctx.arc(ox-3,oy-4,r*.55,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}ctx.restore();
      }

      // Granite / retaining-rock zones near the tighter back section.
      [.52,.58,.64,.72,.79].forEach((progress,i)=>{const spot=this._scenerySpot(progress,i&1?1:-1,145+(i%2)*24,40);if(!spot)return;ctx.save();ctx.translate(spot.x,spot.y);ctx.rotate(i*.47);for(let k=0;k<4;k++){const x=(k-1.5)*23,y=((k*19+i*13)%31)-15;ctx.fillStyle=k&1?'#4a5f60':'#344a4c';ctx.beginPath();ctx.moveTo(x-16,y+9);ctx.lineTo(x-9,y-13);ctx.lineTo(x+7,y-18);ctx.lineTo(x+17,y+3);ctx.lineTo(x+9,y+14);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(211,235,230,.13)';ctx.lineWidth=1.3;ctx.stroke();}ctx.restore();});

      // Service / paddock pads around pit/start with parked support vehicles.
      const pad=this._scenerySpot(.035,this.config.scenery?.pitSide||-1,190,55);if(pad){ctx.save();ctx.translate(pad.x,pad.y);ctx.rotate(pad.angle);ctx.fillStyle='#1b292c';ctx.fillRect(-175,-62,350,124);ctx.strokeStyle='rgba(191,224,218,.22)';ctx.lineWidth=2;ctx.strokeRect(-175,-62,350,124);for(let x=-145;x<=135;x+=40){ctx.strokeStyle='rgba(221,240,236,.12)';ctx.beginPath();ctx.moveTo(x,-52);ctx.lineTo(x,-10);ctx.stroke();}for(let i=0;i<6;i++){const x=-137+i*48,y=23+(i%2)*16;ctx.fillStyle=i%3===0?'#9bff62':i%3===1?'#c6d4d2':'#4fb4c8';ctx.fillRect(x,y,23,10);ctx.fillStyle='#0b1113';ctx.fillRect(x+4,y+2,7,6);}ctx.restore();}

      // Modern illuminated marshal / signal boards along the high-speed sections.
      [.17,.28,.40,.86].forEach((progress,i)=>{const spot=this._scenerySpot(progress,i&1?1:-1,62,16);if(!spot)return;ctx.save();ctx.translate(spot.x,spot.y);ctx.rotate(spot.angle);ctx.fillStyle='#111b1d';ctx.fillRect(-34,-8,68,16);ctx.strokeStyle='rgba(229,244,241,.35)';ctx.strokeRect(-34,-8,68,16);for(let k=0;k<5;k++){ctx.fillStyle=k===i%5?this.theme.accent:'#4d7778';ctx.globalAlpha=k===i%5?.9:.42;ctx.fillRect(-27+k*12,-3,7,6);}ctx.globalAlpha=1;ctx.restore();});
    }

    _drawThemeScenery(ctx) {
      const fn={circuit:'_drawCircuitScenery',neon:'_drawNeonScenery',desert:'_drawDesertScenery',alpine:'_drawAlpineScenery',coast:'_drawCoastScenery',aurora:'_drawAuroraScenery'}[this.theme.kind];
      if(fn)this[fn](ctx);
      this._drawServiceRoad(ctx);this._drawPitBuilding(ctx);
      const s=this.config.scenery||{};(s.grandstands||[]).forEach(g=>this._drawGrandstand(ctx,g[0],g[1],g[2],!!g[3]));(s.spectators||[]).forEach(z=>this._drawSpectatorZone(ctx,z[0],z[1]));
    }

    _drawRacingRubber(ctx) {
      const line=this.racingLineOffset,n=this.samples.length;if(!line||!line.length)return;ctx.save();ctx.beginPath();for(let i=0;i<n;i++){const p=this.samples[i],o=line[i]*.62,x=p.x+p.nx*o,y=p.y+p.ny*o;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.strokeStyle='#070909';ctx.globalAlpha=.12;ctx.lineWidth=24;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.globalAlpha=.09;ctx.strokeStyle='#bac0bd';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    }

    _drawBarriers(ctx) {
      const pos=this.roadWidth*.5+this.barrierMargin;ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
      for(const side of [-1,1]){ctx.globalAlpha=.25;ctx.strokeStyle='#050708';ctx.lineWidth=14;this._path(ctx,pos*side);ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle=this.theme.barrier;ctx.lineWidth=8;this._path(ctx,pos*side);ctx.stroke();}
      ctx.restore();
      ctx.save();for(const side of [-1,1])for(let i=0;i<this.samples.length;i+=10){const p=this.samples[i],q=this.samples[(i+7)%this.samples.length],x1=p.x+p.nx*pos*side,y1=p.y+p.ny*pos*side,x2=q.x+q.nx*pos*side,y2=q.y+q.ny*pos*side;ctx.strokeStyle=(i/10)%5<1?this.theme.accent:this.theme.barrier;ctx.globalAlpha=(i/10)%5<1?.7:.78;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}ctx.restore();
    }

    _drawStartFinish(ctx) {
      const st=this.samples[0],w=this.roadWidth*.48,rows=8,cols=2;ctx.save();ctx.translate(st.x,st.y);ctx.rotate(Math.atan2(st.ty,st.tx));
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){ctx.fillStyle=((r+c)&1)?'#151719':'#f7f7f3';ctx.fillRect(-5+c*10,-w+r*(w*2/rows),10,w*2/rows+1);}ctx.restore();
      ctx.save();ctx.strokeStyle='rgba(242,246,241,.5)';ctx.lineWidth=1.5;for(let q=4;q<28;q+=6){const p=this.samples[(this.samples.length-q)%this.samples.length];for(const lane of [-.27,.27]){const x=p.x+p.nx*this.roadWidth*lane,y=p.y+p.ny*this.roadWidth*lane;ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(p.ty,p.tx));ctx.strokeRect(-16,-11,32,22);ctx.restore();}}ctx.restore();
      ctx.save();ctx.translate(st.x,st.y);ctx.rotate(Math.atan2(st.ty,st.tx));const edge=this.roadWidth*.5+24;ctx.fillStyle='#20282a';ctx.fillRect(-7,-edge-10,14,20);ctx.fillRect(-7,edge-10,14,20);ctx.globalAlpha=.52;ctx.fillStyle=this.theme.accent;ctx.fillRect(-3,-edge+5,6,edge*2-10);ctx.globalAlpha=1;for(let y=-34;y<=34;y+=17){ctx.fillStyle=y===0?'#ffdb55':'#e94f58';ctx.beginPath();ctx.arc(0,y,4,0,Math.PI*2);ctx.fill();}ctx.restore();
    }

    _drawPitLane(ctx) {
      if(this.theme.kind!=='circuit'&&this.theme.kind!=='neon'&&this.theme.kind!=='aurora')return;const side=this.config.scenery?.pitSide||1,n=this.samples.length,off=(this.roadWidth*.5+this.curbWidth+17)*side;
      ctx.save();ctx.strokeStyle=this.theme.kind==='neon'?'#4a596f':this.theme.kind==='aurora'?'#46585b':'#626a69';ctx.lineWidth=34;ctx.lineCap='round';ctx.beginPath();for(let q=-8;q<=48;q++){const p=this.samples[(q+n)%n],x=p.x+p.nx*off,y=p.y+p.ny*off;if(q===-8)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.strokeStyle='#f1f2ea';ctx.lineWidth=2;ctx.setLineDash([12,9]);ctx.stroke();ctx.setLineDash([]);const wall=(this.roadWidth*.5+this.curbWidth+2)*side;ctx.strokeStyle=this.theme.kind==='neon'?'#83d9ea':this.theme.kind==='aurora'?'#9bffdf':'#e5e8e4';ctx.globalAlpha=.8;ctx.lineWidth=4;ctx.beginPath();for(let q=-5;q<=42;q++){const p=this.samples[(q+n)%n],x=p.x+p.nx*wall,y=p.y+p.ny*wall;if(q===-5)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.restore();
    }

    _drawGroundDetails(ctx) {
      const b=this.bounds,kind=this.theme.kind;
      let seed=2166136261;
      for(let i=0;i<kind.length;i++)seed=Math.imul(seed^kind.charCodeAt(i),16777619)>>>0;
      const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      ctx.save();
      for(let i=0;i<115;i++){
        const x=lerp(b.minX,b.maxX,rand()),y=lerp(b.minY,b.maxY,rand());
        if(this.nearest(x,y).distance<this.roadWidth*.78)continue;
        const a=.035+rand()*.055,size=4+rand()*15;ctx.globalAlpha=a;
        if(kind==='desert'){
          ctx.strokeStyle=rand()>.5?'#ffe0ac':'#6f432e';ctx.lineWidth=1+rand()*2;ctx.beginPath();ctx.ellipse(x,y,size*2.2,size*.55,rand()*Math.PI,0,Math.PI*2);ctx.stroke();
        }else if(kind==='alpine'){
          ctx.fillStyle=rand()>.42?'#dbe7e5':'#183b35';ctx.beginPath();ctx.moveTo(x,y-size*1.7);ctx.lineTo(x-size*.8,y+size);ctx.lineTo(x+size*.8,y+size);ctx.closePath();ctx.fill();
        }else if(kind==='coast'){
          ctx.strokeStyle=rand()>.5?'#bfe9df':'#0f5965';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(x,y,size*1.6,.15,2.7);ctx.stroke();
        }else if(kind==='aurora'){
          ctx.fillStyle=rand()>.58?'#7ba79a':'#173d39';ctx.beginPath();ctx.arc(x,y,size*(.25+rand()*.35),0,Math.PI*2);ctx.fill();
        }else if(kind==='neon'){
          ctx.fillStyle=rand()>.55?'#2f8fa0':'#7550aa';ctx.fillRect(x-size*.5,y-size*.5,1.5+rand()*3,1.5+rand()*3);
        }else{
          ctx.fillStyle=rand()>.5?'#9fd47e':'#092f1c';ctx.beginPath();ctx.ellipse(x,y,size*1.4,size*.45,rand()*Math.PI,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.restore();
    }

    _drawAsphaltDetails(ctx) {
      const s=this.samples,n=s.length;
      ctx.save();ctx.lineCap='round';
      // Fine deterministic aggregate: points live on the road, so no clipping path is needed.
      for(let i=0;i<n;i+=4){
        const p=s[i],phase=Math.sin(i*12.9898)*43758.5453,unit=phase-Math.floor(phase),offset=(unit-.5)*this.roadWidth*.68;
        const x=p.x+p.nx*offset,y=p.y+p.ny*offset,len=3+(i%5);ctx.globalAlpha=.07+(i%3)*.015;ctx.strokeStyle=(i&4)?'#d7dcda':'#080a0b';ctx.lineWidth=.7+(i%2)*.45;
        ctx.beginPath();ctx.moveTo(x-p.tx*len,y-p.ty*len);ctx.lineTo(x+p.tx*len,y+p.ty*len);ctx.stroke();
      }
      // Baked braking/skid traces in the most loaded corners.
      ctx.strokeStyle='#070809';ctx.lineWidth=2.1;ctx.globalAlpha=.15;
      for(let i=0;i<n;i+=6){
        const p=s[i];if(p.curve<.34)continue;
        const q=s[(i+5)%n],line=this.racingLineOffset[i]*.7;
        for(let tyre=-1;tyre<=1;tyre+=2){
          const off=line+tyre*13;ctx.beginPath();ctx.moveTo(p.x+p.nx*off-p.tx*9,p.y+p.ny*off-p.ty*9);ctx.lineTo(q.x+q.nx*off+q.tx*8,q.y+q.ny*off+q.ty*8);ctx.stroke();
        }
      }
      ctx.restore();
    }

    _drawAuroraRoadMarkings(ctx) {
      if(this.theme.kind!=='aurora')return;
      const n=this.samples.length;ctx.save();ctx.lineCap='round';
      // Subtle center guidance on the longest high-speed sectors.
      ctx.strokeStyle='rgba(214,241,235,.28)';ctx.lineWidth=2;ctx.setLineDash([18,20]);ctx.beginPath();let active=false;
      for(let i=0;i<n;i++){const p=this.samples[i],progress=i/n,on=(progress>.055&&progress<.30)||(progress>.78&&progress<.97);if(on){if(!active){ctx.moveTo(p.x,p.y);active=true;}else ctx.lineTo(p.x,p.y);}else active=false;}ctx.stroke();ctx.setLineDash([]);
      // Braking boards for the hard-stop zones.
      for(const progress of [.31,.51,.74]){const p=this.samples[this._sampleIndex(progress)];for(const side of [-1,1]){const off=(this.roadWidth*.5+34)*side,x=p.x+p.nx*off,y=p.y+p.ny*off;ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(p.ty,p.tx));ctx.fillStyle='#ecf4f0';ctx.fillRect(-7,-11,14,22);ctx.fillStyle='#162226';ctx.font='900 7px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(progress<.4?'150':progress<.7?'100':'75',0,0);ctx.restore();}}
      ctx.restore();
    }

    _drawStatic(ctx) {
      const b=this.bounds,kind=this.theme.kind;ctx.fillStyle=this.theme.ground;ctx.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
      ctx.save();
      if(kind==='circuit'){
        ctx.globalAlpha=.1;ctx.strokeStyle='#b7e69c';ctx.lineWidth=18;for(let y=b.minY;y<b.maxY;y+=90){ctx.beginPath();ctx.moveTo(b.minX,y);ctx.lineTo(b.maxX,y+260);ctx.stroke();}
      }else if(kind==='neon'){
        ctx.strokeStyle='#26354e';ctx.lineWidth=3;for(let x=b.minX;x<b.maxX;x+=190)for(let y=b.minY;y<b.maxY;y+=165){ctx.fillStyle='#142237';ctx.fillRect(x+12,y+12,156,132);ctx.strokeRect(x+12,y+12,156,132);}
      }else if(kind==='desert'){
        ctx.globalAlpha=.14;ctx.strokeStyle='#6b4130';ctx.lineWidth=7;for(let i=0;i<16;i++){const x=b.minX+((i*937)%(b.maxX-b.minX)),y=b.minY+((i*541)%(b.maxY-b.minY));for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(x,y,100+k*40,50+k*28,i*.7,0,Math.PI*2);ctx.stroke();}}
      }else if(kind==='alpine'){
        ctx.globalAlpha=.13;ctx.strokeStyle='#bfd1cd';ctx.lineWidth=6;for(let i=0;i<15;i++){const x=b.minX+((i*887)%(b.maxX-b.minX)),y=b.minY+((i*491)%(b.maxY-b.minY));ctx.beginPath();ctx.ellipse(x,y,88,42,i*.5,0,Math.PI*2);ctx.stroke();}
      }else if(kind==='coast'){
        ctx.strokeStyle='#79dde1';ctx.globalAlpha=.2;ctx.lineWidth=2;for(let y=b.minY;y<b.maxY;y+=92){ctx.beginPath();for(let x=b.minX;x<b.maxX;x+=40){const yy=y+Math.sin(x*.006+y)*10;if(x===b.minX)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();}
      }else if(kind==='aurora'){
        ctx.globalAlpha=.14;ctx.strokeStyle='#7ed7c2';ctx.lineWidth=2;for(let y=b.minY+30;y<b.maxY;y+=120){ctx.beginPath();for(let x=b.minX;x<b.maxX;x+=55){const yy=y+Math.sin(x*.004+y*.008)*18;if(x===b.minX)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();}
      }
      ctx.restore();
      // Drift layouts intentionally keep the road surround clean: no triangular trees,
      // service-road stubs or pit geometry can visually protrude into long slides.
      if(!this.config.cleanDrift){this._drawGroundDetails(ctx);this._drawThemeScenery(ctx);}

      // Theme-specific runoff sits between the curb and collision-aligned barriers.
      const runoff={circuit:'#71806f',neon:'#38475a',desert:'#c28b59',alpine:'#697a76',coast:'#d5bf92',aurora:'#365557'}[kind]||'#666';
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';this._path(ctx);ctx.strokeStyle=runoff;ctx.globalAlpha=kind==='desert'||kind==='coast'?.78:.58;ctx.lineWidth=this.roadWidth+this.barrierMargin*1.55;ctx.stroke();
      if(kind==='circuit'||kind==='neon'||kind==='aurora'){this._path(ctx);ctx.strokeStyle=kind==='neon'?'#536174':kind==='aurora'?'#294548':'#596260';ctx.globalAlpha=.62;ctx.lineWidth=this.roadWidth+this.curbWidth*2+25;ctx.stroke();}ctx.restore();

      this._drawBarriers(ctx);
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';this._path(ctx);ctx.lineWidth=this.roadWidth+8;ctx.strokeStyle='#202528';ctx.stroke();this._path(ctx);ctx.lineWidth=this.roadWidth;ctx.strokeStyle=this.theme.road;ctx.stroke();this._path(ctx);ctx.lineWidth=this.roadWidth-10;ctx.strokeStyle=kind==='neon'?'#293142':kind==='coast'?'#3b4649':kind==='aurora'?'#343f42':'#373b3c';ctx.globalAlpha=.54;ctx.stroke();ctx.restore();
      this._drawRacingRubber(ctx);this._drawAsphaltDetails(ctx);

      // Curbs follow the resampled centerline with a constant physical width.
      const edge=this.roadWidth*.505;ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle='#060708';ctx.lineWidth=this.curbWidth+5;ctx.lineCap='round';this._path(ctx,-edge);ctx.stroke();this._path(ctx,edge);ctx.stroke();ctx.restore();
      ctx.save();ctx.lineCap='butt';for(let side=-1;side<=1;side+=2)for(let i=0;i<this.samples.length;i+=4){const p=this.samples[i],q=this.samples[(i+4)%this.samples.length];ctx.beginPath();ctx.moveTo(p.x+p.nx*edge*side,p.y+p.ny*edge*side);ctx.lineTo(q.x+q.nx*edge*side,q.y+q.ny*edge*side);ctx.strokeStyle=((i/4)&1)?'#f4f4f0':this.theme.curb;ctx.lineWidth=this.curbWidth;ctx.stroke();ctx.globalAlpha=.25;ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;}ctx.restore();

      this._drawAuroraRoadMarkings(ctx);if(!this.config.cleanDrift)this._drawPitLane(ctx);this._drawStartFinish(ctx);
    }
  }

  R.Track=Track;
  R.clamp=clamp;
  R.lerp=lerp;
})();
