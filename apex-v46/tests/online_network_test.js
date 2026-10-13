const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
global.window=global;window.Racing={};
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../public/js/network.js'),'utf8'),{filename:'network.js'});
const {SnapshotBuffer}=Racing;
const base={x:0,y:0,vx:100,vy:0,speed:100,yawRate:0,progress:.2,laps:0,checkpoint:0,steer:0,throttle:1,brake:0};
const b=new SnapshotBuffer();
b.push({...base,seq:1,angle:Math.PI-.05},1000);b.push({...base,seq:2,x:10,angle:-Math.PI+.05},1100);
const mid=b.sample(1050);assert.ok(Math.abs(Math.abs(mid.angle)-Math.PI)<.02,'client interpolation must use shortest angle across ±π');assert.ok(mid.x>4&&mid.x<6);
const ex=b.sample(1200);assert.ok(ex.x>19&&ex.x<21,'bounded extrapolation should use velocity');
const frozen=b.sample(1300);assert.equal(frozen.x,10,'extrapolation must stop after the 140ms cap');
// A very large correction clears old history instead of tweening through the world.
b.push({...base,seq:3,x:900,angle:0},1400);assert.equal(b.items.length,1);assert.equal(b.sample(1300).x,900);
console.log('online_network_test: OK (angle wrap + bounded extrapolation + large-error snap)');
