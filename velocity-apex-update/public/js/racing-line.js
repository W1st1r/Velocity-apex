(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  if(typeof R.AI_DEBUG!=='boolean')R.AI_DEBUG=false;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const PHYS=R.RACE_PHYSICS||{maxSpeed:510,accel:268,brakePower:368,turnRate:2.40};
  const smoothstep=t=>t*t*(3-2*t);
  const PLAN_CACHE=new Map();

  const MODE_CONFIG={
    easy:{edge:.72,shoulder:0,risk:1.35,passes:1,styles:['conservative','normal']},
    medium:{edge:.91,shoulder:.05,risk:.86,passes:1,styles:['conservative','normal','late','maxRadius']},
    hard:{edge:.99,shoulder:.55,risk:.40,passes:2,styles:['normal','late','maxRadius','attack','curbCut','sStraighten','sacrifice']},
    extreme:{edge:1,shoulder:.96,risk:.18,passes:2,styles:['normal','late','early','maxRadius','attack','curbCut','sStraighten','sacrifice']}
  };

  const STYLE={
    conservative:{outside:.72,inside:.69,exit:.66,shoulder:0,shift:2,setup:108,strength:.20},
    normal:{outside:.94,inside:.90,exit:.88,shoulder:0,shift:7,setup:98,strength:.32},
    late:{outside:.98,inside:.91,exit:.94,shoulder:.08,shift:25,setup:112,strength:.36},
    early:{outside:.91,inside:.88,exit:.80,shoulder:.04,shift:-18,setup:88,strength:.30},
    maxRadius:{outside:1,inside:.98,exit:.97,shoulder:.16,shift:8,setup:112,strength:.44},
    attack:{outside:.98,inside:1,exit:.93,shoulder:.48,shift:5,setup:88,strength:.48},
    curbCut:{outside:.99,inside:1,exit:.95,shoulder:.92,shift:6,setup:80,strength:.58},
    sStraighten:{outside:1,inside:1,exit:.98,shoulder:.72,shift:2,setup:62,linear:true,sOnly:true,strength:.54},
    sacrifice:{outside:1,inside:.98,exit:1,shoulder:.55,shift:12,setup:74,sacrifice:true,linkedOnly:true,strength:.50}
  };

  class Planner{
    constructor(track){
      this.track=track;this.s=track.samples;this.n=this.s.length;this.spacing=track.spacing;
      this.roadHalf=track.roadWidth*.5;this.carHalfWidth=22; // 44-unit OBB width / 2
      this.curbWidth=clamp(track.curbWidth||10,6,12);
      this.asphaltLimit=Math.max(24,this.roadHalf-this.carHalfWidth-1.5);
      this.shoulderLimit=this.asphaltLimit+this.curbWidth;
      this.smoothCurvature=this._smoothedCurvature();
      this.apices=this._findApices();
      this.sectors=this._groupApices();
    }

    _smoothedCurvature(){
      const out=Array(this.n).fill(0),radius=Math.max(2,Math.round(46/this.spacing));
      for(let i=0;i<this.n;i++){
        let sum=0,w=0;
        for(let k=-radius;k<=radius;k++){
          const ww=1-Math.abs(k)/(radius+1),c=this.s[(i+k+this.n)%this.n].curvature;
          sum+=c*ww;w+=ww;
        }
        out[i]=sum/Math.max(1e-9,w);
      }
      return out;
    }

    _forwardDistance(a,b){
      let d=(b-a+this.n)%this.n;return d*this.spacing;
    }

    _findApices(){
      const candidates=[],window=Math.max(2,Math.round(42/this.spacing));
      for(let i=0;i<this.n;i++){
        const mag=Math.abs(this.smoothCurvature[i]);if(mag<.00030)continue;
        let peak=true;
        for(let k=1;k<=window;k++){
          if(Math.abs(this.smoothCurvature[(i+k)%this.n])>mag*1.015||Math.abs(this.smoothCurvature[(i-k+this.n)%this.n])>mag*1.015){peak=false;break;}
        }
        if(peak)candidates.push({i,mag,sign:Math.sign(this.smoothCurvature[i])||1});
      }
      candidates.sort((a,b)=>b.mag-a.mag);
      const kept=[];
      for(const c of candidates){
        const tooClose=kept.some(p=>{
          const d=Math.min(this._forwardDistance(p.i,c.i),this._forwardDistance(c.i,p.i));
          return d<64&&p.sign===c.sign;
        });
        if(!tooClose)kept.push(c);
      }
      kept.sort((a,b)=>a.i-b.i);
      for(const a of kept){
        a.severity=clamp((a.mag-.00028)/.0034,.12,1);
        let straight=0,seenExit=false;
        for(let q=1;q<=Math.round(520/this.spacing);q++){
          const c=Math.abs(this.smoothCurvature[(a.i+q)%this.n]);
          if(c<.00034){seenExit=true;straight+=this.spacing;}
          else if(seenExit&&c>.00060)break;
        }
        a.exitStraight=straight;
      }
      return kept;
    }

    _groupApices(){
      const a=this.apices;if(!a.length)return [];
      const groups=[];let current=[a[0]];
      for(let i=1;i<a.length;i++){
        const prev=a[i-1],next=a[i],gap=this._forwardDistance(prev.i,next.i);
        const span=this._forwardDistance(current[0].i,next.i);
        // Treat a combination as one sector, but do not let a long chain of bends
        // collapse into one huge optimisation problem. Three to four apexes is long
        // enough to reason about sacrifice/positioning while keeping local candidates
        // smooth and independently scoreable.
        const linked=(gap<390||(gap<505&&prev.sign!==next.sign&&Math.max(prev.severity,next.severity)>.30))&&current.length<4&&span<900;
        if(linked)current.push(next);else{groups.push(current);current=[next];}
      }
      groups.push(current);
      // Merge a wrap-around linked group so start/finish does not become an artificial sector boundary.
      if(groups.length>1){
        const first=groups[0][0],lastGroup=groups[groups.length-1],last=lastGroup[lastGroup.length-1],gap=this._forwardDistance(last.i,first.i);
        if(gap<360&&last.sign!==first.sign){groups[0]=lastGroup.concat(groups[0].map(x=>({...x,i:x.i+this.n})));groups.pop();}
      }
      return groups.map((g,id)=>{
        const normalized=g.map((x,j)=>({...x,u:j===0?x.i:(x.i<g[0].i?x.i+this.n:x.i)}));
        for(let j=1;j<normalized.length;j++)while(normalized[j].u<=normalized[j-1].u)normalized[j].u+=this.n;
        const signChanges=normalized.slice(1).reduce((v,x,j)=>v+(x.sign!==normalized[j].sign?1:0),0);
        const first=normalized[0],last=normalized[normalized.length-1];
        const span=(last.u-first.u)*this.spacing;
        const nextApex=this.apices.find(x=>x.i>(last.i%this.n))||this.apices[0];
        const nextGap=nextApex?this._forwardDistance(last.i%this.n,nextApex.i):540;
        return {id,apices:normalized,signChanges,linked:normalized.length>1,span,exitStraight:Math.max(last.exitStraight,nextGap-150),firstIndex:first.i%this.n,lastIndex:last.i%this.n};
      });
    }

    _limits(mode){
      const cfg=MODE_CONFIG[mode],asphalt=this.asphaltLimit*cfg.edge;
      return {asphalt,max:Math.min(this.shoulderLimit,asphalt+this.curbWidth*cfg.shoulder),shoulder:cfg.shoulder};
    }

    _safeOffset(index,value,limits){
      let out=clamp(value,-limits.max,limits.max);
      const k=this.smoothCurvature[((index%this.n)+this.n)%this.n];
      // A normal-offset curve becomes singular as k * offset approaches 1.  The
      // old planner never reached that region because it stayed near the road
      // centre; a full-width optimiser must enforce it explicitly.  Outside
      // offsets increase radius and do not need this restriction.
      if(k*out>0){
        const insideCap=Math.max(14,Math.min(limits.max,.45/Math.max(.0001,Math.abs(k))));
        if(Math.abs(out)>insideCap)out=Math.sign(out)*insideCap;
      }
      return out;
    }

    _candidate(base,sector,styleName,mode){
      const st=STYLE[styleName],cfg=MODE_CONFIG[mode];
      if(!st)return null;
      if(st.sOnly&&sector.signChanges<1)return null;
      if(st.linkedOnly&&!sector.linked)return null;
      const limits=this._limits(mode),first=sector.apices[0],last=sector.apices[sector.apices.length-1];
      const pre=Math.min(560,Math.max(450,470+first.severity*75)),post=Math.min(550,Math.max(440,465+last.severity*75));
      const start=first.u-pre/this.spacing,end=last.u+post/this.spacing;
      const anchors=[];
      const add=(u,v,type='guide')=>{
        if(!Number.isFinite(u)||!Number.isFinite(v))return;
        if(type!=='boundary'){
          const bi=((Math.round(u)%this.n)+this.n)%this.n;
          v=lerp(base[bi],v,st.strength??1);
        }
        anchors.push({u,v:clamp(v,-limits.max,limits.max),type});
      };
      const startIdx=((Math.round(start)%this.n)+this.n)%this.n,endIdx=((Math.round(end)%this.n)+this.n)%this.n;
      add(start,base[startIdx],'boundary');
      const approach=Math.min(pre-82,355+first.severity*55);
      add(first.u-approach/this.spacing,-first.sign*limits.asphalt*st.outside,'setup');
      for(let j=0;j<sector.apices.length;j++){
        const ap=sector.apices[j],next=sector.apices[j+1];
        let shoulder=st.shoulder*cfg.shoulder*ap.severity;
        if(styleName==='curbCut'&&ap.severity<.25)shoulder*=.45;
        let inside=limits.asphalt*st.inside+this.curbWidth*shoulder;
        if(st.sacrifice&&j<sector.apices.length-1){
          const nextWeight=next?next.severity+.18*clamp(next.exitStraight/300,0,1):0;
          if(nextWeight>ap.severity*.72)inside*=.70;
        }
        let shift=st.shift;
        if(ap.exitStraight>220)shift+=10*clamp(ap.exitStraight/420,0,1); // late apex before a useful straight
        if(st.sacrifice&&j===0&&sector.signChanges)shift+=10;
        add(ap.u+shift/this.spacing,ap.sign*inside,'apex');
      }
      const exitValue=-last.sign*limits.asphalt*st.exit,exitDistance=Math.min(post-82,350+last.severity*60);
      add(last.u+exitDistance/this.spacing,exitValue,'exit');
      add(end,base[endIdx],'boundary');
      anchors.sort((a,b)=>a.u-b.u);
      // Remove anchors that collapse onto each other after setup distances are clipped.
      const clean=[];
      for(const a of anchors){if(clean.length&&a.u-clean[clean.length-1].u<.9){if(a.type==='apex')clean[clean.length-1]=a;}else clean.push(a);}
      if(clean.length<2)return null;
      const out=base.slice(),blend=Math.max(2,Math.round(42/this.spacing));
      let ai=0;
      for(let u=Math.floor(start)-blend;u<=Math.ceil(end)+blend;u++){
        const idx=((u%this.n)+this.n)%this.n;
        if(u<start){const t=clamp((u-(start-blend))/blend,0,1);out[idx]=this._safeOffset(idx,lerp(base[idx],clean[0].v,smoothstep(t)),limits);continue;}
        if(u>end){const t=clamp((u-end)/blend,0,1);out[idx]=this._safeOffset(idx,lerp(clean[clean.length-1].v,base[idx],smoothstep(t)),limits);continue;}
        while(ai<clean.length-2&&u>clean[ai+1].u)ai++;
        const A=clean[ai],B=clean[Math.min(clean.length-1,ai+1)],t=clamp((u-A.u)/Math.max(.001,B.u-A.u),0,1);
        const tt=st.linear&&A.type!=='boundary'&&B.type!=='boundary'?t:smoothstep(t);
        out[idx]=this._safeOffset(idx,lerp(A.v,B.v,tt),limits);
      }
      return out;
    }

    _geometry(offsets){
      const points=Array(this.n),seg=Array(this.n),curv=Array(this.n),recommended=Array(this.n);
      for(let i=0;i<this.n;i++){
        const p=this.s[i],o=offsets[i];points[i]={x:p.x+p.nx*o,y:p.y+p.ny*o};
      }
      for(let i=0;i<this.n;i++){
        const a=points[i],b=points[(i+1)%this.n];seg[i]=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
      }
      for(let i=0;i<this.n;i++){
        const p0=points[(i-2+this.n)%this.n],p1=points[i],p2=points[(i+2)%this.n];
        const ax=p1.x-p0.x,ay=p1.y-p0.y,bx=p2.x-p1.x,by=p2.y-p1.y;
        const al=Math.hypot(ax,ay)||1,bl=Math.hypot(bx,by)||1;
        const cross=(ax/al)*(by/bl)-(ay/al)*(bx/bl),dot=clamp((ax/al)*(bx/bl)+(ay/al)*(by/bl),-1,1);
        curv[i]=Math.atan2(cross,dot)/Math.max(1,(al+bl)*.5);
        const penetration=Math.max(0,Math.abs(offsets[i])-this.asphaltLimit);
        const shoulder=penetration>0;
        const grip=shoulder?(.955-.035*clamp(penetration/this.curbWidth,0,1)):1;
        const base=166*grip,aero=.00205*grip,k=Math.abs(curv[i]);
        recommended[i]=k<=aero?PHYS.maxSpeed:Math.min(PHYS.maxSpeed,Math.sqrt(base/Math.max(.00010,k-aero)));
      }
      return {points,segmentLength:seg,curvature:curv,recommendedSpeed:recommended};
    }

    _evaluate(offsets,mode,wantGeometry=false){
      const cfg=MODE_CONFIG[mode],limits=this._limits(mode);
      let invalid=0,shoulderUse=0,risk=0,smoothCost=0;
      for(let i=0;i<this.n;i++){
        const a=Math.abs(offsets[i]);
        if(a>limits.max+.2)invalid+=a-limits.max;
        const pen=Math.max(0,a-this.asphaltLimit);if(pen>0)shoulderUse+=pen/this.curbWidth;
        const edgeStart=mode==='extreme'?.92:mode==='hard'?.88:.80,edge=clamp((a-limits.asphalt*edgeStart)/Math.max(1,limits.max-limits.asphalt*edgeStart),0,1);risk+=edge*edge*edge*edge;
        const prev=offsets[(i-1+this.n)%this.n],next=offsets[(i+1)%this.n];smoothCost+=Math.abs(next-2*offsets[i]+prev);
      }
      if(invalid>0)return {score:1e6+invalid*100};
      const g=this._geometry(offsets),util={easy:{grip:.72,brake:.70,accel:.78},medium:{grip:.79,brake:.77,accel:.83},hard:{grip:.94,brake:.93,accel:.96},extreme:{grip:.997,brake:.992,accel:.998}}[mode];
      const speed=g.recommendedSpeed.map(v=>v*Math.sqrt(util.grip)),brake=PHYS.brakePower*.80*util.brake,accel=PHYS.accel*.84*util.accel;
      for(let pass=0;pass<6;pass++){
        for(let i=this.n-1;i>=0;i--){const next=(i+1)%this.n;speed[i]=Math.min(speed[i],Math.sqrt(speed[next]*speed[next]+2*brake*g.segmentLength[i]));}
        for(let i=0;i<this.n;i++){const prev=(i-1+this.n)%this.n;speed[i]=Math.min(speed[i],Math.sqrt(speed[prev]*speed[prev]+2*accel*g.segmentLength[prev]));}
      }
      let time=0;
      for(let i=0;i<this.n;i++)time+=g.segmentLength[i]/Math.max(36,(speed[i]+speed[(i+1)%this.n])*.5);
      const surfacePenalty=shoulderUse*this.spacing*(mode==='extreme'?.00010:mode==='hard'?.00018:.00040);
      const riskPenalty=risk*this.spacing*cfg.risk*.000075;
      const smoothPenalty=smoothCost*.000018;
      const score=time+surfacePenalty+riskPenalty+smoothPenalty;
      return wantGeometry?{score,time,surfacePenalty,riskPenalty,speed,...g}:{score,time};
    }

    _relax(offsets,mode){
      const limits=this._limits(mode),passes=mode==='easy'?3:2;
      let out=offsets.slice();
      for(let pass=0;pass<passes;pass++){
        const prev=out.slice();
        for(let i=0;i<this.n;i++){
          const avg=(prev[(i-1+this.n)%this.n]+prev[(i+1)%this.n])*.5;
          out[i]=this._safeOffset(i,lerp(prev[i],avg,.10),limits);
        }
      }
      return out;
    }

    _seedLine(mode){
      if(mode==='hard'||mode==='extreme')return this._dpSeed(mode);
      return this._seedLineLegacy(mode);
    }


    _dpSeed(mode){
      // Coarse second-order dynamic program over lateral states.  It is run once
      // when the track is constructed, never in the physics loop.  A transition
      // is scored from the actual three-point path geometry so path length and
      // curvature compete directly instead of prescribing outside/inside points.
      const limits=this._limits(mode),stride=3;
      const nodeCount=Math.max(28,Math.round(this.n/stride));
      let start=0,bestStraight=Infinity;
      const straightRadius=Math.max(2,Math.round(80/this.spacing));
      for(let i=0;i<this.n;i+=2){
        let sum=0;
        for(let q=-straightRadius;q<=straightRadius;q+=2)sum+=Math.abs(this.smoothCurvature[(i+q+this.n)%this.n]);
        if(sum<bestStraight){bestStraight=sum;start=i;}
      }
      const nodeIndex=Array(nodeCount);
      for(let k=0;k<nodeCount;k++)nodeIndex[k]=(start+Math.round(k*this.n/nodeCount))%this.n;
      const stateCount=(mode==='hard'||mode==='extreme')?13:9,mid=(stateCount-1)>>1;
      const stateOffset=Array(stateCount);
      for(let j=0;j<stateCount;j++)stateOffset[j]=lerp(-limits.max,limits.max,j/(stateCount-1));
      const px=Array(nodeCount),py=Array(nodeCount),allowed=Array(nodeCount);
      for(let k=0;k<nodeCount;k++){
        const p=this.s[nodeIndex[k]];px[k]=new Float64Array(stateCount);py[k]=new Float64Array(stateCount);allowed[k]=new Uint8Array(stateCount);
        for(let j=0;j<stateCount;j++){const o=stateOffset[j];allowed[k][j]=Math.abs(this._safeOffset(nodeIndex[k],o,limits)-o)<.01?1:0;px[k][j]=p.x+p.nx*o;py[k][j]=p.y+p.ny*o;}
      }
      const pairCount=stateCount*stateCount,INF=1e30;
      const backs=Array(nodeCount);
      const surfaceCost=o=>{
        const pen=Math.max(0,Math.abs(o)-this.asphaltLimit),edgeStart=mode==='extreme'?.93:mode==='hard'?.89:.84;
        const edge=clamp((Math.abs(o)-limits.asphalt*edgeStart)/Math.max(1,limits.max-limits.asphalt*edgeStart),0,1);
        return pen*(mode==='extreme'?.000055:mode==='hard'?.00016:.00075)+edge*edge*edge*(mode==='extreme'?.00028:mode==='hard'?.00075:.0045);
      };
      const localCost=(ka,kb,kc,sa,sb,sc)=>{
        const ax=px[kb][sb]-px[ka][sa],ay=py[kb][sb]-py[ka][sa],bx=px[kc][sc]-px[kb][sb],by=py[kc][sc]-py[kb][sb];
        const al=Math.hypot(ax,ay)||1,bl=Math.hypot(bx,by)||1,cross=(ax*by-ay*bx)/(al*bl),dot=clamp((ax*bx+ay*by)/(al*bl),-1,1);
        const curvature=Math.abs(Math.atan2(cross,dot))/Math.max(1,(al+bl)*.5);
        const pen=Math.max(0,Math.abs(stateOffset[sb])-this.asphaltLimit),grip=pen>0?(.955-.035*clamp(pen/this.curbWidth,0,1)):1;
        const aero=.00205*grip,k=Math.max(.00010,curvature-aero),v=curvature<=aero?PHYS.maxSpeed:Math.min(PHYS.maxSpeed,Math.sqrt(166*grip/k));
        const time=al/Math.max(72,v);
        const d1=stateOffset[sc]-stateOffset[sb],d0=stateOffset[sb]-stateOffset[sa],second=Math.abs(d1-d0);
        // The penalties are deliberately small compared with travel time: they
        // suppress zig-zag/chatter but do not erase a genuine minimum-time apex.
        return time+surfaceCost(stateOffset[sb])+second*.00045+Math.max(0,Math.abs(d1)-17)*.0022;
      };
      let dp=new Float64Array(pairCount);dp.fill(INF);
      // The longest/straightest part of the lap is the seam.  Centering one node
      // there makes the cyclic DP deterministic without constraining corner lines.
      for(let b=0;b<stateCount;b++){
        if(!allowed[0][mid]||!allowed[1][b])continue;
        const d=Math.abs(stateOffset[b]-stateOffset[mid]);
        if(d<=24)dp[mid*stateCount+b]=d*.00018+surfaceCost(stateOffset[b]);
      }
      for(let k=2;k<nodeCount;k++){
        const next=new Float64Array(pairCount);next.fill(INF);const back=new Int16Array(pairCount);back.fill(-1);
        for(let b=0;b<stateCount;b++)for(let c=0;c<stateCount;c++){
          if(!allowed[k-1][b]||!allowed[k][c]||Math.abs(stateOffset[c]-stateOffset[b])>18)continue;
          const ni=b*stateCount+c;
          let best=INF,bestA=-1;
          for(let a=0;a<stateCount;a++){
            const old=dp[a*stateCount+b];if(old>=INF*.5)continue;
            const cost=old+localCost(k-2,k-1,k,a,b,c);
            if(cost<best){best=cost;bestA=a;}
          }
          next[ni]=best;back[ni]=bestA;
        }
        dp=next;backs[k]=back;
      }
      let endPair=-1,endCost=INF;
      for(let a=0;a<stateCount;a++)for(let b=0;b<stateCount;b++){
        if(!allowed[nodeCount-2][a]||!allowed[nodeCount-1][b])continue;
        const base=dp[a*stateCount+b];if(base>=INF*.5)continue;
        const close=localCost(nodeCount-2,nodeCount-1,0,a,b,mid);
        // A direct first-node transition penalty prevents a lateral discontinuity
        // at the cyclic seam; the final full-lap evaluator scores the seam exactly.
        const seam=Math.abs(stateOffset[b]-stateOffset[mid])*.00035;
        if(base+close+seam<endCost){endCost=base+close+seam;endPair=a*stateCount+b;}
      }
      if(endPair<0)return this._seedLineLegacy(mode);
      const states=new Int16Array(nodeCount);states[0]=mid;states[nodeCount-2]=Math.floor(endPair/stateCount);states[nodeCount-1]=endPair%stateCount;
      for(let k=nodeCount-1;k>=2;k--){
        const pair=states[k-1]*stateCount+states[k],a=backs[k]?.[pair];
        if(a==null||a<0)break;states[k-2]=a;
      }
      states[0]=mid;
      const out=Array(this.n).fill(0);
      for(let k=0;k<nodeCount;k++){
        const i0=nodeIndex[k],i1=nodeIndex[(k+1)%nodeCount],o0=stateOffset[states[k]],o1=stateOffset[states[(k+1)%nodeCount]];
        let steps=(i1-i0+this.n)%this.n;if(steps===0)steps=this.n;
        for(let q=0;q<steps;q++){const t=q/steps,tt=smoothstep(t);const idx=(i0+q)%this.n;out[idx]=this._safeOffset(idx,lerp(o0,o1,tt),limits);}
      }
      // One light pass removes quantisation from the lateral grid without washing
      // out the DP-selected apex locations.
      for(let pass=0;pass<6;pass++){
        const prev=out.slice();for(let i=0;i<this.n;i++)out[i]=this._safeOffset(i,prev[i]*.72+(prev[(i-1+this.n)%this.n]+prev[(i+1)%this.n])*.14,limits);
      }
      return out;
    }

    _seedLineLegacy(mode){
      const n=this.n,spacing=this.spacing,raw=Array(n).fill(0),weight=Array(n).fill(0);
      const signedDistance=(from,to)=>{let d=(from-to)*spacing,lap=this.track.length;if(d>lap*.5)d-=lap;else if(d<-lap*.5)d+=lap;return d;};
      const baseEnvelope=Math.max(20,this.roadHalf-30),scale={easy:.72,medium:.90,hard:1.00,extreme:1.07}[mode]||1;
      for(const apex of this.apices){
        const severity=clamp((apex.mag-.00035)/.0042,.20,1),reach=310;
        for(let k=-Math.ceil(reach/spacing);k<=Math.ceil(reach/spacing);k++){
          const i=(apex.i+k+n)%n,d=signedDistance(i,apex.i);
          const apexLobe=1.12*Math.exp(-(d*d)/(2*54*54));
          const approach=-.88*Math.exp(-((d+165)*(d+165))/(2*92*92));
          const exit=-.64*Math.exp(-((d-148)*(d-148))/(2*96*96));
          const shape=apexLobe+approach+exit,w=Math.exp(-(d*d)/(2*205*205));
          raw[i]+=apex.sign*shape*severity*w;weight[i]+=Math.abs(shape)*severity*w;
        }
      }
      const limit=this._limits(mode).max,out=Array(n).fill(0);
      for(let i=0;i<n;i++){
        const normalized=weight[i]>1e-6?raw[i]/Math.max(.72,weight[i]):0;
        out[i]=this._safeOffset(i,normalized*baseEnvelope*1.32*scale,this._limits(mode));
      }
      // Seed smoothing is intentionally lighter than the previous 96-pass line; the
      // candidate stage below is responsible for preserving useful local apex movement.
      const passes=mode==='easy'?72:64;
      for(let pass=0;pass<passes;pass++){
        const prev=out.slice();
        for(let i=0;i<n;i++)out[i]=this._safeOffset(i,prev[i]*.58+(prev[(i-1+n)%n]+prev[(i+1)%n])*.21,this._limits(mode));
      }
      return out;
    }

    _buildMode(mode){
      const cfg=MODE_CONFIG[mode];let offsets=this._seedLine(mode),choices=[];
      let baseEval=this._evaluate(offsets,mode);
      for(let pass=0;pass<cfg.passes;pass++){
        choices=[];
        for(const sector of this.sectors){
          let best=offsets,bestEval=baseEval,bestStyle='keep';
          for(const style of cfg.styles){
            const candidate=this._candidate(offsets,sector,style,mode);if(!candidate)continue;
            const ev=this._evaluate(candidate,mode);
            if(ev.score<bestEval.score-.00005){best=candidate;bestEval=ev;bestStyle=style;}
          }
          const gain=baseEval.score-bestEval.score;offsets=best;baseEval=bestEval;
          choices.push({sectorId:sector.id,style:bestStyle,gain:+gain.toFixed(4),signChanges:sector.signChanges,apexCount:sector.apices.length,exitStraight:+sector.exitStraight.toFixed(1)});
        }
      }
      offsets=this._relax(offsets,mode);
      const final=this._evaluate(offsets,mode,true);
      return {offsets,choices,geometry:final,limits:this._limits(mode)};
    }

    build(){
      const modes={};for(const mode of ['easy','medium','hard','extreme'])modes[mode]=this._buildMode(mode);
      const serialApices=this.apices.map(a=>({index:a.i,sign:a.sign,severity:+a.severity.toFixed(3),exitStraight:+a.exitStraight.toFixed(1)}));
      const serialSectors=this.sectors.map(s=>({id:s.id,firstIndex:s.firstIndex,lastIndex:s.lastIndex,apexCount:s.apices.length,signChanges:s.signChanges,exitStraight:+s.exitStraight.toFixed(1),span:+s.span.toFixed(1),apices:s.apices.map(a=>({index:a.i%this.n,sign:a.sign,severity:+a.severity.toFixed(3)}))}));
      return {modes,apices:serialApices,sectors:serialSectors,asphaltLimit:this.asphaltLimit,shoulderLimit:this.shoulderLimit,curbWidth:this.curbWidth};
    }
  }

  R.RacingLinePlanner={
    build(track){
      const signature=[track.id,track.samples.length,track.roadWidth,Math.round(track.length),track.curbWidth||10].join(':');
      if(PLAN_CACHE.has(signature))return PLAN_CACHE.get(signature);
      const plan=new Planner(track).build();PLAN_CACHE.set(signature,plan);return plan;
    },
    clearCache(){PLAN_CACHE.clear();},
    MODE_CONFIG
  };
})();
