(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // Rendering only: never inserted into race cars, collision lists or reward processing.
  class GhostReplay{
    constructor(frames){
      if(!Array.isArray(frames)||frames.length<2||frames.length>1800)throw Error('GHOST_INVALID');
      let previous=-1,progress=-Infinity;
      this.frames=frames.map(f=>{
        if(!Array.isArray(f)||f.length!==7||!f.every(Number.isFinite)||!Number.isSafeInteger(f[0])||f[0]<0||f[0]<=previous||Math.abs(f[1])>20000||Math.abs(f[2])>20000||Math.abs(f[3])>Math.PI+.01||f[4]<(f[0]===0?-.1:0)||f[4]>1||!Number.isSafeInteger(f[5])||f[5]<0||f[5]>20||!Number.isSafeInteger(f[6])||f[6]<0)throw Error('GHOST_INVALID');
        previous=f[0];progress=Math.max(progress,f[5]+f[4]);
        return {frame:f[0],x:f[1],y:f[2],angle:f[3],progress};
      });
      if(this.frames[0].frame!==0)throw Error('GHOST_INVALID');
      this.duration=this.frames[this.frames.length-1].frame/60;
    }
    _sample(value,key){
      const frames=this.frames,last=frames.length-1;
      if(!Number.isFinite(value))return null;
      if(value<=frames[0][key])return {...frames[0]};
      if(value>=frames[last][key])return {...frames[last]};
      let lo=0,hi=last;
      while(lo<hi){const m=(lo+hi)>>1;if(frames[m][key]<value)lo=m+1;else hi=m;}
      const b=frames[lo],a=frames[lo-1],span=b[key]-a[key],t=span>0?clamp((value-a[key])/span,0,1):0;
      return {frame:a.frame+(b.frame-a.frame)*t,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:wrap(a.angle+wrap(b.angle-a.angle)*t),progress:a.progress+(b.progress-a.progress)*t};
    }
    atTime(seconds){return this._sample(Math.max(0,seconds)*60,'frame');}
    // Timing comparison only. Player progress must never select a rendering pose.
    atProgress(progress){return this._sample(progress,'progress');}
  }
  R.GhostReplay=GhostReplay;
})();
