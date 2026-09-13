(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  class AudioSystem{
    constructor(){
      this.ctx=null;this.master=null;this.engineOsc=null;this.engineOsc2=null;this.engineGain=null;this.muted=false;this.ready=false;
    }
    init(){
      if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();return;}
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ctx=new AC();this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.18;this.master.connect(this.ctx.destination);
      this.engineGain=this.ctx.createGain();this.engineGain.gain.value=0;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
      this.engineOsc=this.ctx.createOscillator();this.engineOsc.type='sawtooth';
      this.engineOsc2=this.ctx.createOscillator();this.engineOsc2.type='square';
      const g2=this.ctx.createGain();g2.gain.value=.12;
      this.engineOsc.connect(this.engineGain);this.engineOsc2.connect(g2);g2.connect(this.engineGain);this.engineGain.connect(filter);filter.connect(this.master);
      this.engineOsc.start();this.engineOsc2.start();this.ready=true;
    }
    setMuted(v){this.muted=!!v;if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.muted?0:.18,this.ctx.currentTime,.03);}
    updateEngine(speed,throttle,active){
      if(!this.ready||!this.ctx)return;const t=this.ctx.currentTime;
      const freq=55+Math.min(1,speed/400)*215+throttle*28;
      this.engineOsc.frequency.setTargetAtTime(freq,t,.03);this.engineOsc2.frequency.setTargetAtTime(freq*.5,t,.04);
      this.engineGain.gain.setTargetAtTime(active?(.07+Math.min(1,speed/400)*.09):0,t,.05);
    }
    tone(freq=440,dur=.08,type='sine',gain=.12,slide=0){
      if(!this.ready||this.muted||!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),t+dur);
      g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);
    }
    countdown(n){this.tone(n===0?760:430,n===0?.18:.08,n===0?'sawtooth':'sine',n===0?.18:.13,n===0?320:0);}
    collision(power=.5){this.tone(95,.12,'square',.07+.06*power,-45);this.tone(170,.07,'sawtooth',.04,80);}
    lap(best=false){this.tone(best?620:520,.11,'sine',.13,220);setTimeout(()=>this.tone(best?880:700,.13,'sine',.11,180),90);}
    overtake(){this.tone(720,.06,'square',.08,130);}
    grass(){this.tone(85,.035,'sawtooth',.025,18);}
  }
  R.AudioSystem=AudioSystem;
})();
