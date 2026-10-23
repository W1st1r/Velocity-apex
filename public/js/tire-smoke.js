(function(global){
  'use strict';
  const R=global.Racing=global.Racing||{};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  const speedFromKmh=R.worldSpeedFromKmh||((kmh)=>kmh*120/3.6);
  function makeTexture(){
    try{
      if(!global.document?.createElement)return null;
      const canvas=global.document.createElement('canvas');canvas.width=canvas.height=64;
      const ctx=canvas.getContext('2d');if(!ctx?.createRadialGradient)return null;
      const gradient=ctx.createRadialGradient(32,32,1,32,32,32);
      gradient.addColorStop(0,'rgba(221,226,228,.34)');
      gradient.addColorStop(.42,'rgba(215,221,224,.20)');
      gradient.addColorStop(1,'rgba(205,214,218,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);return canvas;
    }catch{return null;}
  }
  function create(options={}){
    const cores=Number(global.navigator?.hardwareConcurrency)||0;
    const requested=Number.isFinite(options.maxParticles)?options.maxParticles:(cores>0&&cores<=4?24:36);
    const maxParticles=Math.round(clamp(requested,12,48)),texture=makeTexture();
    const pool=Array.from({length:maxParticles},()=>({active:false,x:0,y:0,vx:0,vy:0,age:0,life:1,startSize:5,endSize:12,opacity:.3}));
    let cursor=0,emitted=0,states=new WeakMap();
    const minSpeed=speedFromKmh(34),fullSpeed=speedFromKmh(92);
    const stateFor=car=>{let s=states.get(car);if(!s){s={intensity:0,cooldown:.08,driftTime:0};states.set(car,s);}return s;};
    function emit(car,state,side,sustain){
      const p=pool[cursor++%pool.length],hx=Math.cos(car.angle||0),hy=Math.sin(car.angle||0),nx=-hy,ny=hx;
      const rear=Math.max(14,(Number(car.length)||62)*.32),halfWidth=Math.max(8,(Number(car.width)||31)*.42);
      const jitter=(Math.random()-.5)*2.4;
      p.active=true;p.x=car.x-hx*rear+nx*(side*halfWidth+jitter);p.y=car.y-hy*rear+ny*(side*halfWidth+jitter);
      p.vx=-hx*(4+Math.random()*3)-car.vx*.035+nx*side*(1+Math.random()*2);
      p.vy=-hy*(4+Math.random()*3)-car.vy*.035+ny*side*(1+Math.random()*2);
      p.age=0;p.life=.88+state.intensity*.10;p.startSize=4.8+state.intensity*1.4;
      p.endSize=11.5+state.intensity*2.2+sustain*.8;p.opacity=.25+state.intensity*.075+sustain*.025;emitted++;
    }
    function update(cars,dt){
      const step=clamp(Number(dt)||0,0,.05);if(!step)return;
      for(const p of pool)if(p.active){
        p.age+=step;p.x+=p.vx*step;p.y+=p.vy*step;
        const drag=Math.pow(.90,step*60);p.vx*=drag;p.vy*=drag;if(p.age>=p.life)p.active=false;
      }
      for(const car of cars||[]){
        if(!car||!Number.isFinite(car.x)||!Number.isFinite(car.y)||!Number.isFinite(car.angle)||!Number.isFinite(car.vx)||!Number.isFinite(car.vy))continue;
        const speed=Math.hypot(car.vx,car.vy),speedFactor=smooth(minSpeed,fullSpeed,speed);
        let slip=Math.atan2(car.vy,car.vx)-car.angle;
        while(slip>Math.PI)slip-=Math.PI*2;while(slip<-Math.PI)slip+=Math.PI*2;
        const slipFactor=smooth(.22,.52,Math.abs(slip));
        const surfaceFactor=car.onRoad===false||car.surface==='offroad'?0:car.surface==='shoulder'?.68:1;
        const target=slipFactor*speedFactor*surfaceFactor,state=stateFor(car);
        state.intensity+=(target-state.intensity)*(1-Math.exp(-step*(target?6.5:8)));
        if(target>.015){state.driftTime+=step;state.cooldown-=step;}
        else{state.driftTime=0;state.cooldown=0;}
        if(target>.015&&state.intensity>.035&&state.cooldown<=0){
          const sustain=smooth(0,2.4,state.driftTime);emit(car,state,-1,sustain);emit(car,state,1,sustain);
          state.cooldown=.19-.02*sustain-.015*state.intensity;
        }
      }
    }
    function draw(ctx){
      if(!ctx)return;ctx.save();
      for(const p of pool)if(p.active){
        const t=clamp(p.age/p.life,0,1),size=p.startSize+(p.endSize-p.startSize)*t;
        ctx.globalAlpha=p.opacity*(1-t)*(1-t);
        if(texture&&ctx.drawImage)ctx.drawImage(texture,p.x-size,p.y-size,size*2,size*2);
        else{ctx.fillStyle='rgba(215,221,224,.24)';ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);ctx.fill();}
      }
      ctx.restore();
    }
    function clear(){for(const p of pool)p.active=false;states=new WeakMap();cursor=0;emitted=0;}
    return {update,draw,clear,get stats(){let active=0;for(const p of pool)if(p.active)active++;return {active,poolSize:pool.length,emitted};}};
  }
  global.VelocityTireSmoke={create};
})(window);
