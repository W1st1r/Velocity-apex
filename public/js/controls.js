(function(){
  'use strict';
  const R=window.Racing,clamp=R.clamp;
  const MODES={arrows:'СТРЕЛКИ',tilt:'НАКЛОН',wheel:'РУЛЬ'};
  const SENSITIVITY={low:32,medium:24,high:17};
  const wrap=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};

  class InputController{
    constructor(opts={}){
      this.mode=Object.prototype.hasOwnProperty.call(MODES,opts.mode)?opts.mode:'arrows';
      this.tiltSensitivity=Object.prototype.hasOwnProperty.call(SENSITIVITY,opts.tiltSensitivity)?opts.tiltSensitivity:'medium';
      this.onModeChange=typeof opts.onModeChange==='function'?opts.onModeChange:()=>{};
      this.onSensitivityChange=typeof opts.onSensitivityChange==='function'?opts.onSensitivityChange:()=>{};
      this.onNotice=typeof opts.onNotice==='function'?opts.onNotice:()=>{};
      this.active=false;this.left=false;this.right=false;this.gas=false;this.brake=false;
      this.steer=0;this.wheelTarget=0;this.tiltValue=0;this.tiltNeutral=null;this.tiltReady=false;this.tiltListening=false;
      this.wheelPointer=null;this.wheelStartAngle=0;this.wheelStartValue=0;
      this.controls=document.getElementById('controls');this.leftBtn=document.getElementById('leftBtn');this.rightBtn=document.getElementById('rightBtn');
      this.gasBtn=document.getElementById('gasBtn');this.brakeBtn=document.getElementById('brakeBtn');this.wheel=document.getElementById('steeringWheel');
      this._orientationHandler=e=>this._onOrientation(e);this._orientationChange=()=>{this.tiltNeutral=null;this.tiltValue=0;};
      this._hardenSteeringButton(this.leftBtn);this._hardenSteeringButton(this.rightBtn);
      this._bindHold(this.leftBtn,'left',()=>this.mode==='arrows');this._bindHold(this.rightBtn,'right',()=>this.mode==='arrows');
      this._bindHold(this.gasBtn,'gas');this._bindHold(this.brakeBtn,'brake');this._bindWheel();
      addEventListener('orientationchange',this._orientationChange,{passive:true});
      if(screen.orientation&&screen.orientation.addEventListener)screen.orientation.addEventListener('change',this._orientationChange);
      this.syncUI();
    }

    _hardenSteeringButton(el){
      if(!el)return;
      el.draggable=false;
      const suppress=e=>{if(e.cancelable)e.preventDefault();};
      // iOS Safari can still start selection/callout on very fast repeated taps even
      // with user-select:none. Suppress only browser gestures on the steering buttons;
      // pointer/touch state remains independent, so steering + GAS/BRAKE stays multitouch.
      for(const type of ['selectstart','dragstart','contextmenu','dblclick','gesturestart'])el.addEventListener(type,suppress,{passive:false});
      el.addEventListener('touchstart',suppress,{passive:false});
      el.addEventListener('touchmove',suppress,{passive:false});
      el.addEventListener('touchend',suppress,{passive:false});
    }

    _bindHold(el,key,allowed=()=>true){
      if(!el)return;
      let pointer=null,touchActive=false;
      const on=event=>{if(!this.active||!allowed())return;if(event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();pointer=event.pointerId;this[key]=true;try{el.setPointerCapture(event.pointerId);}catch(_){}};
      const off=event=>{if(pointer!==null&&event.pointerId!==undefined&&pointer!==event.pointerId)return;pointer=null;this[key]=false;if(event.cancelable)event.preventDefault();};
      if(window.PointerEvent){el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('lostpointercapture',off);}else{
        el.addEventListener('touchstart',event=>{if(!this.active||!allowed())return;touchActive=true;this[key]=true;event.preventDefault();},{passive:false});
        const touchOff=event=>{if(!touchActive)return;touchActive=false;this[key]=false;event.preventDefault();};el.addEventListener('touchend',touchOff,{passive:false});el.addEventListener('touchcancel',touchOff,{passive:false});
      }
    }

    _bindWheel(){
      const el=this.wheel;if(!el)return;
      const angleFor=e=>{const r=el.getBoundingClientRect(),x=e.clientX-(r.left+r.width*.5),y=e.clientY-(r.top+r.height*.5);return Math.atan2(y,x);};
      const start=e=>{if(!this.active||this.mode!=='wheel'||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();this.wheelPointer=e.pointerId;this.wheelStartAngle=angleFor(e);this.wheelStartValue=this.wheelTarget;try{el.setPointerCapture(e.pointerId);}catch(_){}};
      const move=e=>{if(this.wheelPointer!==e.pointerId)return;e.preventDefault();const delta=wrap(angleFor(e)-this.wheelStartAngle);this.wheelTarget=clamp(this.wheelStartValue+delta/(Math.PI*.52),-1,1);this._renderWheel();};
      const end=e=>{if(this.wheelPointer!==e.pointerId)return;if(e.cancelable)e.preventDefault();this.wheelPointer=null;this.wheelTarget=0;this._renderWheel();};
      if(window.PointerEvent){el.addEventListener('pointerdown',start);el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);}else{
        let touchId=null,startAngle=0,startValue=0;
        const point=t=>({clientX:t.clientX,clientY:t.clientY});
        el.addEventListener('touchstart',e=>{if(!this.active||this.mode!=='wheel'||touchId!==null)return;const t=e.changedTouches[0];touchId=t.identifier;startAngle=angleFor(point(t));startValue=this.wheelTarget;e.preventDefault();},{passive:false});
        el.addEventListener('touchmove',e=>{for(const t of e.changedTouches)if(t.identifier===touchId){this.wheelTarget=clamp(startValue+wrap(angleFor(point(t))-startAngle)/(Math.PI*.52),-1,1);this._renderWheel();e.preventDefault();break;}},{passive:false});
        const finish=e=>{for(const t of e.changedTouches)if(t.identifier===touchId){touchId=null;this.wheelTarget=0;this._renderWheel();e.preventDefault();break;}};el.addEventListener('touchend',finish,{passive:false});el.addEventListener('touchcancel',finish,{passive:false});
      }
    }

    _renderWheel(){
      if(!this.wheel)return;const angle=this.wheelTarget*94;this.wheel.style.setProperty('--wheel-angle',angle.toFixed(1)+'deg');this.wheel.setAttribute('aria-valuenow',String(Math.round(this.wheelTarget*100)));
    }

    _screenAngle(){
      const a=screen.orientation&&Number.isFinite(screen.orientation.angle)?screen.orientation.angle:(Number.isFinite(window.orientation)?window.orientation:0);
      return ((a%360)+360)%360;
    }

    _onOrientation(e){
      if(this.mode!=='tilt'||!this.tiltReady)return;
      const beta=Number.isFinite(e.beta)?e.beta:0,gamma=Number.isFinite(e.gamma)?e.gamma:0,angle=this._screenAngle();
      let raw=angle===90?beta:angle===270?-beta:angle===180?-gamma:gamma;
      if(!Number.isFinite(raw))return;
      if(this.tiltNeutral===null){this.tiltNeutral=raw;this.tiltValue=0;return;}
      let delta=raw-this.tiltNeutral;const dead=2.2;if(Math.abs(delta)<=dead)delta=0;else delta-=Math.sign(delta)*dead;
      const target=clamp(delta/SENSITIVITY[this.tiltSensitivity],-1,1);
      this.tiltValue+=(target-this.tiltValue)*.19;if(Math.abs(this.tiltValue)<.008)this.tiltValue=0;
    }

    _startTiltListener(){
      if(this.tiltListening)return;addEventListener('deviceorientation',this._orientationHandler,true);this.tiltListening=true;this.tiltNeutral=null;this.tiltValue=0;
    }

    _stopTiltListener(){
      if(this.tiltListening){removeEventListener('deviceorientation',this._orientationHandler,true);this.tiltListening=false;}this.tiltReady=false;this.tiltNeutral=null;this.tiltValue=0;
    }

    async _enableTilt(requestPermission){
      if(!('DeviceOrientationEvent' in window)){this.onNotice('Наклон недоступен на этом устройстве. Включены СТРЕЛКИ.','bad');return false;}
      const request=window.DeviceOrientationEvent&&window.DeviceOrientationEvent.requestPermission;
      if(typeof request==='function'){
        if(!requestPermission)return null;
        try{const result=await request.call(window.DeviceOrientationEvent);if(result!=='granted'){this.onNotice('Доступ к датчикам отклонён. Включены СТРЕЛКИ.','bad');return false;}}
        catch(_){this.onNotice('Не удалось получить доступ к датчикам. Включены СТРЕЛКИ.','bad');return false;}
      }
      this.tiltReady=true;this._startTiltListener();return true;
    }

    async setMode(mode,{requestPermission=false}={}){
      if(!Object.prototype.hasOwnProperty.call(MODES,mode))mode='arrows';
      if(mode==='tilt'){
        const ready=await this._enableTilt(requestPermission);
        if(ready===false){this._applyMode('arrows');return false;}
      }else this._stopTiltListener();
      this._applyMode(mode);return true;
    }

    _applyMode(mode){
      this.left=this.right=false;this.wheelPointer=null;this.wheelTarget=0;this.steer=0;this._renderWheel();this.mode=mode;this.syncUI();this.onModeChange(mode);
    }

    async prepareForRace(){
      if(this.mode!=='tilt')return true;
      if(this.tiltReady)return true;
      const ready=await this._enableTilt(true);
      if(ready===false){this._applyMode('arrows');return false;}
      return true;
    }

    setSensitivity(value){
      if(!Object.prototype.hasOwnProperty.call(SENSITIVITY,value))value='medium';this.tiltSensitivity=value;this.tiltNeutral=null;this.tiltValue=0;this.onSensitivityChange(value);
    }

    syncUI(){
      if(this.controls)this.controls.dataset.mode=this.mode;
      if(this.wheel)this.wheel.setAttribute('aria-hidden',this.mode==='wheel'?'false':'true');
    }

    setActive(active){this.active=!!active;if(!this.active)this.reset();}
    reset(){this.left=this.right=this.gas=this.brake=false;this.wheelPointer=null;this.wheelTarget=0;this.tiltValue=0;this.steer=0;this._renderWheel();}
    update(dt){
      let target=0;if(this.active){if(this.mode==='arrows')target=(this.right?1:0)-(this.left?1:0);else if(this.mode==='wheel')target=this.wheelTarget;else if(this.mode==='tilt')target=this.tiltValue;}
      const rate=this.mode==='tilt'?11:this.mode==='wheel'?18:26;this.steer+=(target-this.steer)*(1-Math.exp(-Math.max(0,dt)*rate));if(Math.abs(this.steer)<.002&&target===0)this.steer=0;
    }
    getControl(){return {steer:clamp(this.steer,-1,1),throttle:this.active&&this.gas?1:0,brake:this.active&&this.brake?1:0};}
  }

  R.CONTROL_MODES=MODES;R.TILT_SENSITIVITY_LABELS={low:'НИЗКАЯ',medium:'СРЕДНЯЯ',high:'ВЫСОКАЯ'};R.InputController=InputController;
})();
