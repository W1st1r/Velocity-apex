const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const scope={window:{}};vm.createContext(scope);vm.runInContext(fs.readFileSync(__dirname+'/../public/js/free-city.js','utf8'),scope);const city=scope.window.ApexCity;
function move(x,y,vx,vy,dt){const c={x:x+vx*dt,y:y+vy*dt,vx,vy};city.resolveCarMotion(c,x,y);assert(city.roadAt(c.x,c.y,-20));return c;}
// Horizontal road upper edge: preserve lateral travel rather than multiplying both axes.
let c=move(1300,1520,420,-90,.12);assert(c.vx>410);assert(c.vy>=0);assert(c.x>1345);
c=move(1300,1520,0,-400,.15);assert(c.vy>0&&c.vy<=49);assert(c.speed<=49);
// Sustained throttle into a wall must not stop the tangential component or pin position.
c={x:1300,y:1520,vx:300,vy:0};const initial=c.x;for(let n=0;n<100;n++){c=move(c.x,c.y,300,-35,1/120);}assert(c.x>initial+240);
// Large frame at maximum tuned speed cannot tunnel across a non-road block.
c=move(1300,1590,0,-638,.5);assert(c.y>1510&&c.vy>0);
// Driving away from contact must be immediately possible.
const oldY=c.y;c=move(c.x,c.y,0,200,.05);assert(c.y>oldY+9);
// Activity apron corner and curved road edges, every heading and several frame sizes.
for(const [x,y] of [[620,2290],[3130,2705],[2320,1590],[220,520],[430,2670]])for(let a=0;a<Math.PI*2;a+=.17)for(const dt of [1/120,1/30,.2]){const c=move(x,y,638*Math.cos(a),638*Math.sin(a),dt);assert(c.speed<=638.001);}
// Repair an invalid saved/spawn position, without retaining penetration.
c=move(1300,1250,0,0,1/60);assert(city.roadAt(c.x,c.y,-20));
console.log('free_collision_test: OK — glancing/head-on impacts, repeated contact, escape, swept motion, corners/curves, invalid spawn');
