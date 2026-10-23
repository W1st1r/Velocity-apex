import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element{
 constructor(){this.handlers={};this.dataset={};this.style={setProperty(){}};}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
 setAttribute(){} setPointerCapture(){}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
 emit(type,props={}){for(const fn of this.handlers[type]||[])fn({pointerType:'touch',pointerId:1,button:0,cancelable:true,preventDefault(){},...props});}
}
const elements=Object.fromEntries(['controls','leftBtn','rightBtn','gasBtn','brakeBtn','handbrakeBtn','steeringWheel'].map(id=>[id,new Element()]));
const context={window:{PointerEvent:class{},Racing:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}},document:{getElementById:id=>elements[id]},screen:{orientation:{angle:90,addEventListener(){}}},addEventListener(){},removeEventListener(){}};
vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/controls.js','utf8'),context);
const c=new context.window.Racing.InputController();c.setActive(true);c.setDriftMode(true);
elements.leftBtn.emit('pointerdown',{pointerId:11});elements.gasBtn.emit('pointerdown',{pointerId:12});elements.handbrakeBtn.emit('pointerdown',{pointerId:13});c.update(.2);
assert(c.getControl().steer<-.9);assert.equal(c.getControl().throttle,1);assert.equal(c.getControl().handbrake,1);
elements.gasBtn.emit('pointerup',{pointerId:12});assert.equal(c.getControl().throttle,0);assert.equal(c.getControl().handbrake,1);assert(c.left);
elements.brakeBtn.emit('pointerdown',{pointerId:14});assert.equal(c.getControl().brake,1);assert(c.left);
elements.leftBtn.emit('pointercancel',{pointerId:11});assert(!c.left);assert(c.brake&&c.handbrake);
elements.handbrakeBtn.emit('lostpointercapture',{pointerId:13});assert(!c.handbrake);
c._applyMode('wheel');elements.steeringWheel.emit('pointerdown',{pointerId:21,clientX:100,clientY:50});elements.steeringWheel.emit('pointermove',{pointerId:21,clientX:50,clientY:100});c.update(.3);assert(c.getControl().steer>.8);
elements.steeringWheel.emit('pointercancel',{pointerId:21});c.update(.5);assert(Math.abs(c.getControl().steer)<.01);
c._applyMode('tilt');c.tiltReady=true;c._onOrientation({beta:0,gamma:0});for(let n=0;n<15;n++)c._onOrientation({beta:20,gamma:0});c.update(.5);assert(c.getControl().steer>.5);
c.setActive(false);assert.equal(c.getControl().throttle,0);assert.equal(c.getControl().brake,0);assert.equal(c.getControl().handbrake,0);assert.equal(c.getControl().steer,0);
console.log('controls multitouch PASS: gas+steering+HB, brake+steering, independent release/cancel, wheel, synthetic landscape tilt and reset');
