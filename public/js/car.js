(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  const clamp=R.clamp;
  const TAU=Math.PI*2;
  const angleWrap=a=>{while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a;};
  const moveToward=(v,target,amount)=>v<target?Math.min(target,v+amount):Math.max(target,v-amount);
  const DEBUG_COLLIDERS=false;
  const spriteCache=new Map();
  function getSpriteImage(src){
    if(!src||typeof Image==='undefined')return null;
    if(spriteCache.has(src))return spriteCache.get(src);
    const img=new Image();img.decoding='async';img.src=src;spriteCache.set(src,img);return img;
  }

  const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
  function resolveSpriteSize(spriteSpec,imageWidth,imageHeight,preview=false){
    const spec=spriteSpec||{},iw=Number(imageWidth),ih=Number(imageHeight);
    const hasNatural=Number.isFinite(iw)&&iw>0&&Number.isFinite(ih)&&ih>0;
    const sourceRatio=hasNatural?iw/ih:0;
    const visualScale=positive(preview?spec.previewScale:spec.raceScale,1);
    const baseLength=positive(spec.maxVisualLength??spec.visualLength??spec.length,74);
    const ratioWidth=sourceRatio?baseLength/sourceRatio:36.5;
    const baseWidth=positive(spec.maxVisualWidth??spec.visualWidth??spec.width,ratioWidth);
    const maxLength=baseLength*visualScale,maxWidth=baseWidth*visualScale;
    if(spec.preserveAspectRatio&&hasNatural){
      const containScale=Math.min(maxLength/iw,maxWidth/ih);
      return {length:iw*containScale,width:ih*containScale,sourceRatio,maxLength,maxWidth};
    }
    return {length:maxLength,width:maxWidth,sourceRatio,maxLength,maxWidth};
  }
  R.resolveSpriteSize=resolveSpriteSize;
  function resolveSpriteRenderSize(spriteSpec,resolvedSize,preview=false){
    const size=resolvedSize||{};
    const length=positive(size.length,74),width=positive(size.width,36);
    const previewLengthScale=preview?positive(spriteSpec?.previewLengthScale,1):1;
    return {length:length*previewLengthScale,width,previewLengthScale};
  }
  R.resolveSpriteRenderSize=resolveSpriteRenderSize;

  // SAT helper for two car-oriented bounding boxes. The four candidate axes are
  // the local forward/right axes of each car; the smallest overlap is the MTV.
  function getCarOBB(car){
    const fx=Math.cos(car.angle),fy=Math.sin(car.angle),rx=-fy,ry=fx;
    const longitudinal=car.collisionOffsetX||0,lateral=car.collisionOffsetY||0;
    return {
      cx:car.x+fx*longitudinal+rx*lateral,cy:car.y+fy*longitudinal+ry*lateral,
      fx,fy,rx,ry,halfL:car.collisionLength*.5,halfW:car.collisionWidth*.5
    };
  }

  function intersectCarOBBs(a,b){
    const A=getCarOBB(a),B=getCarOBB(b),dx=B.cx-A.cx,dy=B.cy-A.cy;
    const axes=[[A.fx,A.fy],[A.rx,A.ry],[B.fx,B.fy],[B.rx,B.ry]];
    let depth=Infinity,nx=0,ny=0;
    for(const axis of axes){
      let ax=axis[0],ay=axis[1];
      const center=dx*ax+dy*ay;
      const ra=A.halfL*Math.abs(A.fx*ax+A.fy*ay)+A.halfW*Math.abs(A.rx*ax+A.ry*ay);
      const rb=B.halfL*Math.abs(B.fx*ax+B.fy*ay)+B.halfW*Math.abs(B.rx*ax+B.ry*ay);
      const overlap=ra+rb-Math.abs(center);
      if(overlap<=0)return null;
      if(overlap<depth){
        depth=overlap;
        if(center<0){ax=-ax;ay=-ay;}
        nx=ax;ny=ay;
      }
    }
    return {depth,nx,ny,cx:(A.cx+B.cx)*.5,cy:(A.cy+B.cy)*.5};
  }

  function drawWheel(ctx,x,y,front,steer){
    ctx.save();ctx.translate(x,y);if(front)ctx.rotate(steer*.17);
    ctx.fillStyle='#07090b';ctx.fillRect(-8.5,-4.8,17,9.6);
    ctx.fillStyle='#151a1e';ctx.fillRect(-6.5,-3.7,13,7.4);
    ctx.globalAlpha=.32;ctx.fillStyle='#d9e0df';ctx.fillRect(-5.2,-3.15,5.8,1.15);
    ctx.globalAlpha=.5;ctx.fillStyle='#050607';ctx.fillRect(-7.8,2.5,15.6,1.25);
    ctx.globalAlpha=1;ctx.restore();
  }

  class Car{
    constructor(opts={}){
      this.id=opts.id||0;this.name=opts.name||('CAR '+this.id);this.player=!!opts.player;
      this.color=opts.color||'#ff4057';this.accent=opts.accent||'#ffffff';
      this.x=0;this.y=0;this.vx=0;this.vy=0;this.angle=0;this.speed=0;this.yawRate=0;this.gripDisturbance=0;this._surfaceDrag=1;this.surface='asphalt';
      this.maxSpeed=opts.maxSpeed||338;this.baseMaxSpeed=this.maxSpeed;this.accel=opts.accel||174;this.brakePower=opts.brakePower||265;
      this.turnRate=opts.turnRate||2.18;this.radius=18;this.length=62;this.width=31;
      // Collision footprint follows the already-drawn car, including wings/tyres.
      // The drawing spans about x=-34..37 and y=-22..22, whose visual centre is +1.5px.
      this.collisionLength=71;this.collisionWidth=44;this.collisionOffsetX=1.5;this.collisionOffsetY=0;
      this.collisionRadius=Math.hypot(this.collisionLength*.5,this.collisionWidth*.5);
      this.paintOverride=null;
      this.trackIndex=0;this.progress=0;this.prevProgress=0;this.laps=0;this.checkpoint=0;
      this.onRoad=true;this.offroadTime=0;this.trueOffroadTime=0;this.controlledShoulderTime=0;this.collisionThisLap=false;this.offroadThisLap=false;
      this.lastImpact=0;this.steerVisual=0;this.throttleVisual=0;this.brakeVisual=0;
      this.ai=null;this.rank=1;this.finishedLap=false;this.steerInput=0;this.effect='standard';this.effectTime=0;this.livery=null;this.liveryId='apexLime';this.spriteSpec=null;this.spriteImage=null;this.spriteAssetMode='full';this._raceSpriteSize=null;this._previewSpriteSize=null;this.gridPending=false;
    }

    place(track,progress,lane=0){
      const p=track.sampleAtProgress(progress,lane);this.x=p.x;this.y=p.y;this.angle=Math.atan2(p.ty,p.tx);
      this.vx=p.tx*2;this.vy=p.ty*2;this.speed=2;this.progress=((progress%1)+1)%1;this.prevProgress=this.progress;
      this.trackIndex=p.index;this.gridPending=progress<0;this.steerInput=0;this.yawRate=0;this.gripDisturbance=0;this.laps=0;this.checkpoint=0;this.offroadTime=0;this.trueOffroadTime=0;this.controlledShoulderTime=0;this.surface='asphalt';this.onRoad=true;this.collisionThisLap=false;this.offroadThisLap=false;
    }

    _lateralExtent(nx,ny){
      const fx=Math.cos(this.angle),fy=Math.sin(this.angle),rx=-fy,ry=fx;
      return this.collisionLength*.5*Math.abs(fx*nx+fy*ny)+this.collisionWidth*.5*Math.abs(rx*nx+ry*ny);
    }

    _surfaceLateralExtent(nx,ny){
      // Wheel/contact envelope follows the visible tyre/body width closely, while the
      // barrier test below still uses the full orientation-aware OBB projection.
      // Keeping these two envelopes separate allows two-wheel curb use without
      // letting the body intersect a wall.
      const fx=Math.cos(this.angle),fy=Math.sin(this.angle),rx=-fy,ry=fx;
      return 22*Math.abs(fx*nx+fy*ny)+21.5*Math.abs(rx*nx+ry*ny);
    }

    _surfaceType(surfaceOrOnRoad){
      if(typeof surfaceOrOnRoad==='string')return surfaceOrOnRoad;
      if(surfaceOrOnRoad===false)return 'offroad';
      return this.surface||'asphalt';
    }

    steeringAuthority(speed=this.speed,surfaceOrOnRoad=this.surface){
      const surface=this._surfaceType(surfaceOrOnRoad),speedRatio=clamp(speed/Math.max(1,this.maxSpeed),0,1.12);
      const rolling=clamp(speed/54,0,1),highSpeed=1-.17*Math.pow(clamp(speedRatio,0,1),1.45);
      const surfaceFactor=surface==='asphalt'?1:surface==='shoulder'?.94:.58;
      return this.turnRate*(.12+.88*rolling)*highSpeed*surfaceFactor;
    }

    lateralAccelerationLimit(speed=this.speed,surfaceOrOnRoad=this.surface,brake=0){
      const surface=this._surfaceType(surfaceOrOnRoad);
      if(surface==='offroad')return 54/Math.max(1,(this._surfaceDrag||1));
      // Mechanical grip + speed-squared aero load. Shoulder/curb keeps most grip,
      // while true off-road remains deliberately costly for player and AI alike.
      const base=166,downforce=.00205*speed*speed,brakeLoad=1-.20*clamp(brake,0,1);
      const surfaceGrip=surface==='shoulder'?.92:1;
      return (base+downforce)*brakeLoad*surfaceGrip;
    }

    markImpact(strength=.5){
      this.gripDisturbance=Math.max(this.gripDisturbance||0,clamp(strength,0,1));
    }

    update(dt,input,track){
      const requestedSteer=clamp(input.steer||0,-1,1);
      this.steerInput+=(requestedSteer-this.steerInput)*(1-Math.exp(-dt*(this.player?22:26)));
      this.effectTime+=dt;
      this.gripDisturbance=Math.max(0,(this.gripDisturbance||0)-dt*1.9);
      const steer=this.steerInput,throttle=clamp(input.throttle||0,0,1),brake=clamp(input.brake||0,0,1);
      this.steerVisual+=(steer-this.steerVisual)*Math.min(1,dt*12);this.throttleVisual=throttle;this.brakeVisual=brake;

      const nearest=track.nearest(this.x,this.y,this.trackIndex);this.trackIndex=nearest.index;
      const roadHalf=track.roadWidth*.5,surfaceExtent=this._surfaceLateralExtent(nearest.nx,nearest.ny);
      const surfaceInfo=track.surfaceAtOffset?track.surfaceAtOffset(nearest.signed,surfaceExtent):{type:Math.abs(nearest.signed)<roadHalf+4?'asphalt':'offroad'};
      this.surface=surfaceInfo.type;this.onRoad=this.surface!=='offroad';
      this._surfaceDrag=this.surface==='offroad'?(track.theme.drag||1):(this.surface==='shoulder'?1.08:1);
      if(this.surface==='shoulder')this.controlledShoulderTime+=dt;
      else if(this.surface==='offroad'){this.offroadTime+=dt;this.trueOffroadTime+=dt;this.offroadThisLap=true;}

      let mag=Math.hypot(this.vx,this.vy);
      const speedRatio=clamp(mag/Math.max(1,this.maxSpeed),0,1.15);

      // Steering requests yaw, while tyre grip limits the physically achievable yaw.
      // This keeps turn-in sharp at racing speed without allowing the body to rotate
      // far away from the actual velocity vector.
      const authority=this.steeringAuthority(mag,this.surface);
      const requestedYaw=steer*authority;
      const maxGripYaw=this.lateralAccelerationLimit(mag,this.surface,brake)/Math.max(42,mag);
      const targetYaw=clamp(requestedYaw,-maxGripYaw,maxGripYaw);
      const yawResponse=this.surface==='asphalt'?(25-4*clamp(speedRatio,0,1)):(this.surface==='shoulder'?20:11);
      this.yawRate=(this.yawRate||0)+(targetYaw-(this.yawRate||0))*(1-Math.exp(-dt*yawResponse));
      if(Math.abs(steer)<.012)this.yawRate*=Math.exp(-dt*(this.surface==='asphalt'?20:(this.surface==='shoulder'?15:7)));
      this.angle=angleWrap(this.angle+this.yawRate*dt);

      const hx=Math.cos(this.angle),hy=Math.sin(this.angle),rx=-hy,ry=hx;
      let longitudinal=this.vx*hx+this.vy*hy;
      let lateral=this.vx*rx+this.vy*ry;

      // Strong launch with a progressive torque falloff. Grass/runoff cuts traction
      // without changing steering into a hidden assist.
      const forwardRatio=clamp(Math.max(0,longitudinal)/Math.max(1,this.maxSpeed),0,1);
      const torqueCurve=Math.max(.50,1-.50*Math.pow(forwardRatio,1.35));
      const traction=this.surface==='asphalt'?.84:(this.surface==='shoulder'?.76:.24/Math.max(.7,track.theme.drag||1));
      longitudinal+=this.accel*throttle*torqueCurve*traction*dt;

      if(brake>0){
        longitudinal=moveToward(longitudinal,0,this.brakePower*.80*brake*dt);
        lateral=moveToward(lateral,0,this.brakePower*.10*brake*dt);
      }

      const absLong=Math.abs(longitudinal);
      let dragDecel=2.25+.00031*absLong*absLong;
      if(this.surface==='shoulder')dragDecel+=3.8+.00010*mag*mag;
      else if(this.surface==='offroad')dragDecel+=(20+.00078*mag*mag)*(track.theme.drag||1);
      longitudinal=moveToward(longitudinal,0,dragDecel*dt);

      // High-grip tyre relaxation. On clean asphalt normal cornering converges to the
      // car heading very quickly. A collision, barrier strike, heavy trail-braking or
      // grass temporarily lowers that relaxation, so genuine disturbances can still slide.
      const steeringLoad=Math.abs(targetYaw)*Math.max(55,mag)/Math.max(1,this.lateralAccelerationLimit(mag,this.surface,0));
      let gripRate=this.surface==='asphalt'?(18+13*clamp(speedRatio,0,1)):(this.surface==='shoulder'?(12+10*clamp(speedRatio,0,1)):2.25/Math.max(.75,track.theme.drag||1));
      gripRate*=1-.52*(this.gripDisturbance||0);
      if(brake>.55&&Math.abs(steer)>.35)gripRate*=.82;
      lateral*=Math.exp(-Math.max(.8,gripRate)*dt);

      // Scrub represents understeer/tyre load as lost speed rather than visible drift.
      const overload=Math.max(0,steeringLoad-.72);
      const cornerScrub=(this.surface==='asphalt'?7.5:(this.surface==='shoulder'?8.4:4.5))*(steeringLoad*steeringLoad+overload*2.4);
      longitudinal=moveToward(longitudinal,0,cornerScrub*dt);

      this.vx=hx*longitudinal+rx*lateral;
      this.vy=hy*longitudinal+ry*lateral;
      mag=Math.hypot(this.vx,this.vy);

      if(mag>this.maxSpeed){const s=this.maxSpeed/mag;this.vx*=s;this.vy*=s;mag=this.maxSpeed;}

      this.x+=this.vx*dt;this.y+=this.vy*dt;this.speed=mag;

      // Barriers keep the existing SAT-compatible car footprint and low-restitution response.
      const after=track.nearest(this.x,this.y,this.trackIndex);this.trackIndex=after.index;
      const afterExtent=this._lateralExtent(after.nx,after.ny),barrier=roadHalf+(track.barrierMargin||20);
      const centerLimit=track.barrierCenterLimit?track.barrierCenterLimit(afterExtent):Math.max(8,barrier-afterExtent-1.5);
      let impact=0;
      if(Math.abs(after.signed)>centerLimit){
        const side=Math.sign(after.signed)||1,target=centerLimit*side;
        const excess=after.signed-target;
        this.x-=after.nx*excess;this.y-=after.ny*excess;
        const vn=this.vx*after.nx+this.vy*after.ny;
        if(vn*side>0){
          const hit=Math.abs(vn),restitution=.08;
          this.vx-=after.nx*vn*(1+restitution);this.vy-=after.ny*vn*(1+restitution);
          const loss=.94-.30*clamp(hit/180,0,1);
          this.vx*=loss;this.vy*=loss;impact=Math.min(1,hit/125);this.markImpact(.45+impact*.5);
        }
        this.collisionThisLap=true;this.lastImpact=impact;
        this.speed=Math.hypot(this.vx,this.vy);
      } else this.lastImpact=0;

      this._updateRaceProgress(after);
      return {nearest:after,impact};
    }

    _updateRaceProgress(n){
      const p=n.progress;this.prevProgress=this.progress;this.progress=p;
      if(this.checkpoint===0&&p>.22&&p<.46)this.checkpoint=1;
      else if(this.checkpoint===1&&p>.47&&p<.70)this.checkpoint=2;
      else if(this.checkpoint===2&&p>.72&&p<.94)this.checkpoint=3;
      this.finishedLap=false;
      if(this.gridPending&&this.prevProgress>.84&&p<.14)this.gridPending=false;
      const forward=this.vx*n.tx+this.vy*n.ty>15;
      if(this.checkpoint===3&&this.prevProgress>.84&&p<.14&&forward){this.laps++;this.checkpoint=0;this.finishedLap=true;}
    }

    raceMetric(){return this.laps+this.progress-(this.gridPending?1:0);}

    setLoadout(liveryId,effectId,assetMode='full'){
      this.liveryId=Object.prototype.hasOwnProperty.call(R.LIVERIES,liveryId)?liveryId:'apexLime';
      this.livery=R.LIVERIES[this.liveryId]||R.LIVERIES.apexLime;
      this.color=this.livery.primary;this.accent=this.livery.secondary;this.paintOverride=null;
      this.effect=Object.prototype.hasOwnProperty.call(R.EFFECTS,effectId)?effectId:'standard';
      this.spriteSpec=this.livery.sprite||null;this.spriteAssetMode=assetMode;
      const collision=this.livery.collision;
      this.collisionLength=collision?.length||71;this.collisionWidth=collision?.width||44;
      this.collisionOffsetX=collision?.offsetX??1.5;this.collisionOffsetY=collision?.offsetY??0;
      this.collisionRadius=Math.hypot(this.collisionLength*.5,this.collisionWidth*.5);
      const spriteSrc=this.spriteSpec&&(assetMode==='thumbnail'&&this.spriteSpec.thumbnail?this.spriteSpec.thumbnail:this.spriteSpec.src);
      this.spriteImage=getSpriteImage(spriteSrc);this._raceSpriteSize=null;this._previewSpriteSize=null;
    }

    _getSpriteSize(preview=false){
      const image=this.spriteImage;
      if(!(this.spriteSpec&&image&&image.complete&&image.naturalWidth&&image.naturalHeight))return null;
      const cacheKey=preview?'_previewSpriteSize':'_raceSpriteSize',cached=this[cacheKey];
      if(cached&&cached.image===image&&cached.width===image.naturalWidth&&cached.height===image.naturalHeight)return cached.size;
      const size=resolveSpriteSize(this.spriteSpec,image.naturalWidth,image.naturalHeight,preview);
      this[cacheKey]={image,width:image.naturalWidth,height:image.naturalHeight,size};
      return size;
    }

    setPaintOverride(paint=null){
      this.paintOverride=paint&&typeof paint==='object'?{...paint}:null;
    }

    drawExhaust(ctx,resolvedLength=0){
      const effect=R.EFFECTS[this.effect];
      if(!effect||this.effect==='standard'||this.throttleVisual<=.65||this.brakeVisual>.1||this.speed<12)return;
      const t=this.effectTime,flicker=1+.12*Math.sin(t*53)+.08*Math.sin(t*89),length=(18+this.speed*.055)*this.throttleVisual*flicker;
      const preview=this.spriteAssetMode==='thumbnail'||this.spriteAssetMode==='preview';
      const visualScale=this.spriteSpec?(preview?(this.spriteSpec.previewScale||1):(this.spriteSpec.raceScale||1)):1;
      const fallbackLength=this.spriteSpec?(this.spriteSpec.maxVisualLength||this.spriteSpec.visualLength||this.spriteSpec.length||74)*visualScale:0;
      const rearX=this.spriteSpec?-(resolvedLength||fallbackLength)*.47+(this.spriteSpec.exhaustOffsetX||0):-32;
      const rearY=this.spriteSpec?.exhaustOffsetY||0;
      ctx.save();ctx.translate(0,rearY);ctx.globalCompositeOperation='lighter';
      for(let layer=0;layer<3;layer++){
        const len=length*(1-layer*.22),width=6-layer*1.6;
        ctx.globalAlpha=.55+layer*.17;
        ctx.fillStyle=effect.rainbow?`hsl(${(t*135+layer*55)%360},100%,${55+layer*15}%)`:(layer===0?effect.outer:layer===1?effect.inner:'#ffffff');
        ctx.beginPath();ctx.moveTo(rearX,-width);ctx.bezierCurveTo(rearX-10,-width*1.6,rearX-len*.8,-width,rearX-len,Math.sin(t*43+layer)*3);ctx.bezierCurveTo(rearX-len*.65,width*1.2,rearX-8,width*1.5,rearX,width);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }

    draw(ctx,scale=1){
      const livery=this.livery,paint=this.paintOverride||livery;
      const primary=paint?paint.primary:this.color,secondary=paint?paint.secondary:this.accent;
      const stripe=paint?.stripe||secondary,detail=paint?.accent||secondary;
      const speedLoad=clamp(this.speed/330,0,1),lean=this.steerVisual*speedLoad*1.35,brakeDive=this.brakeVisual*speedLoad*.8;

      ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);ctx.scale(scale,scale);

      const spriteReady=this.spriteSpec&&this.spriteImage&&this.spriteImage.complete&&this.spriteImage.naturalWidth&&this.spriteImage.naturalHeight;
      const spritePreview=this.spriteAssetMode==='thumbnail'||this.spriteAssetMode==='preview';
      const spriteSize=spriteReady?this._getSpriteSize(spritePreview):null;
      const renderSpriteSize=resolveSpriteRenderSize(this.spriteSpec,spriteSize,spritePreview);
      const spriteLength=renderSpriteSize.length,spriteWidth=renderSpriteSize.width;

      // Layered shadow follows each car's tuned visual envelope without expensive blur.
      ctx.save();ctx.translate(-1.5-brakeDive,2.2+lean*.55);ctx.fillStyle='#000';ctx.globalAlpha=.075;ctx.beginPath();ctx.ellipse(-1,0,spriteLength*.47,spriteWidth*.48,0,0,TAU);ctx.fill();ctx.globalAlpha=.11;ctx.beginPath();ctx.ellipse(-1,0,spriteLength*.40,spriteWidth*.39,0,0,TAU);ctx.fill();ctx.restore();

      this.drawExhaust(ctx,spriteLength);

      // Catalog cars fit proportionally inside their per-model visual bounds.
      // Physical performance remains unchanged; collision geometry stays independently tuned.
      if(spriteReady){
        const ox=spritePreview?(this.spriteSpec.previewOffsetX??this.spriteSpec.offsetX??0):(this.spriteSpec.raceOffsetX??this.spriteSpec.offsetX??0);
        const oy=spritePreview?(this.spriteSpec.previewOffsetY??this.spriteSpec.offsetY??0):(this.spriteSpec.raceOffsetY??this.spriteSpec.offsetY??0);
        ctx.drawImage(this.spriteImage,ox-spriteLength*.5,oy-spriteWidth*.5,spriteLength,spriteWidth);
        if(DEBUG_COLLIDERS){ctx.strokeStyle='#00ff9c';ctx.lineWidth=1.5;ctx.globalAlpha=.9;ctx.strokeRect(this.collisionOffsetX-this.collisionLength*.5,this.collisionOffsetY-this.collisionWidth*.5,this.collisionLength,this.collisionWidth);ctx.globalAlpha=1;}
        ctx.restore();return;
      }

      // Tyres sit below the body; front pair visually follows steering input.
      drawWheel(ctx,-18,-16.1,false,0);drawWheel(ctx,-18,16.1,false,0);
      drawWheel(ctx,21.5,-15.4,true,this.steerVisual);drawWheel(ctx,21.5,15.4,true,this.steerVisual);

      // Undertray and the inner wheel/body gap.
      ctx.fillStyle='#090d10';ctx.globalAlpha=.96;
      ctx.beginPath();ctx.moveTo(-27,-11.2);ctx.lineTo(-18,-14);ctx.lineTo(14,-12.5);ctx.lineTo(31,-7);ctx.lineTo(34,0);ctx.lineTo(31,7);ctx.lineTo(14,12.5);ctx.lineTo(-18,14);ctx.lineTo(-27,11.2);ctx.closePath();ctx.fill();
      ctx.globalAlpha=.36;ctx.fillStyle='#000';ctx.fillRect(-22,-14.5,43,3);ctx.fillRect(-22,11.5,43,3);ctx.globalAlpha=1;

      // Rear wing, supports and endplates.
      ctx.fillStyle='#11161a';ctx.fillRect(-34,-21.5,4.2,43);ctx.fillRect(-29.8,-18.5,2.5,37);
      ctx.fillStyle=secondary;ctx.fillRect(-31.2,-20.5,6.3,41);
      ctx.globalAlpha=.28;ctx.fillStyle='#fff';ctx.fillRect(-30.3,-19.3,1.2,38.6);ctx.globalAlpha=1;

      // Main lower body volume. Small visual load transfer never affects physics/collision.
      ctx.save();ctx.translate(brakeDive,-lean);
      ctx.fillStyle=primary;ctx.beginPath();ctx.moveTo(-26,-9.6);ctx.lineTo(-16,-12.8);ctx.lineTo(2,-11.2);ctx.lineTo(20,-7.7);ctx.lineTo(32,-4.2);ctx.lineTo(35,0);ctx.lineTo(32,4.2);ctx.lineTo(20,7.7);ctx.lineTo(2,11.2);ctx.lineTo(-16,12.8);ctx.lineTo(-26,9.6);ctx.closePath();ctx.fill();

      // Lower side shading creates a deeper 2.5D body cross-section.
      ctx.globalAlpha=.24;ctx.fillStyle='#000';ctx.beginPath();ctx.moveTo(-24,4);ctx.lineTo(-14,11.4);ctx.lineTo(4,10);ctx.lineTo(27,5.8);ctx.lineTo(32,3.5);ctx.lineTo(25,7.5);ctx.lineTo(1,13);ctx.lineTo(-17,14);ctx.closePath();ctx.fill();ctx.globalAlpha=1;

      // Sidepods: secondary upper face + dark lower face.
      ctx.fillStyle=secondary;ctx.beginPath();ctx.moveTo(-16,-14.2);ctx.lineTo(4,-13.2);ctx.lineTo(13,-7);ctx.lineTo(-11,-6.4);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(-16,14.2);ctx.lineTo(4,13.2);ctx.lineTo(13,7);ctx.lineTo(-11,6.4);ctx.closePath();ctx.fill();
      ctx.globalAlpha=.2;ctx.fillStyle='#000';ctx.beginPath();ctx.moveTo(-13,7);ctx.lineTo(12,7);ctx.lineTo(4,13);ctx.lineTo(-15,14);ctx.closePath();ctx.fill();ctx.globalAlpha=1;

      // Raised central spine and nose.
      ctx.fillStyle=primary;ctx.beginPath();ctx.moveTo(-17,-6.6);ctx.lineTo(4,-7.7);ctx.lineTo(24,-4.4);ctx.lineTo(34,-2.6);ctx.lineTo(37,0);ctx.lineTo(34,2.6);ctx.lineTo(24,4.4);ctx.lineTo(4,7.7);ctx.lineTo(-17,6.6);ctx.closePath();ctx.fill();
      ctx.fillStyle=stripe;ctx.globalAlpha=.92;ctx.beginPath();ctx.moveTo(-19,-1.65);ctx.lineTo(31,-1.15);ctx.lineTo(35,0);ctx.lineTo(31,1.15);ctx.lineTo(-19,1.65);ctx.closePath();ctx.fill();ctx.globalAlpha=1;

      // Nose cap and front wing assembly.
      ctx.fillStyle=detail;ctx.fillRect(25.5,-3.2,8.5,6.4);
      ctx.fillStyle=secondary;ctx.fillRect(29.2,-20.3,5.4,40.6);
      ctx.fillStyle='#11161a';ctx.fillRect(34.6,-18.7,3,37.4);ctx.fillRect(27.5,-18.4,2.2,36.8);
      ctx.globalAlpha=.28;ctx.fillStyle='#fff';ctx.fillRect(30.2,-18.6,1.2,37.2);ctx.globalAlpha=1;

      // Cockpit glass, driver and halo with separate upper highlights.
      ctx.fillStyle='#081116';ctx.beginPath();ctx.ellipse(-3.5,0,10.5,6.8,0,0,TAU);ctx.fill();
      ctx.globalAlpha=.32;ctx.fillStyle='#6db3bf';ctx.beginPath();ctx.ellipse(-1.8,-.7,7.6,4.2,0,Math.PI,TAU);ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle='#f0f4f2';ctx.beginPath();ctx.arc(-4.7,0,3.05,0,TAU);ctx.fill();
      ctx.strokeStyle=detail;ctx.lineWidth=1.45;ctx.beginPath();ctx.arc(-2.2,0,7,-2.38,2.38);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-1.5,-5.4);ctx.lineTo(2.8,0);ctx.lineTo(-1.5,5.4);ctx.stroke();

      // Top-face highlights: cheap flat strokes instead of dynamic gradients/shadowBlur.
      ctx.globalAlpha=.22;ctx.strokeStyle='#fff';ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(-19,-8.1);ctx.quadraticCurveTo(3,-9.2,25,-4.6);ctx.stroke();
      ctx.globalAlpha=.16;ctx.beginPath();ctx.moveTo(-13,-12.2);ctx.lineTo(3,-11.5);ctx.stroke();ctx.globalAlpha=1;
      ctx.restore();

      if(DEBUG_COLLIDERS){
        ctx.strokeStyle='#00ff9c';ctx.lineWidth=1.5;ctx.globalAlpha=.9;
        ctx.strokeRect(this.collisionOffsetX-this.collisionLength*.5,this.collisionOffsetY-this.collisionWidth*.5,this.collisionLength,this.collisionWidth);
        ctx.globalAlpha=1;
      }
      ctx.restore();
    }
  }
  R.Car=Car;R.angleWrap=angleWrap;R.getCarOBB=getCarOBB;R.intersectCarOBBs=intersectCarOBBs;
})();
