const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/js/free-city.js'),'utf8');
const scope={window:{}};vm.createContext(scope);
vm.runInContext(source.replace('window.ApexCity={','window.__geometry={roads,buildings,trees,areas};window.ApexCity={'),scope);
const city=scope.window.ApexCity,{roads,buildings,trees}=scope.window.__geometry;
for(const [x,y] of [[2320,1590],[2020,430],[670,2310],[3130,2635],[3130,2705],[4715,2635],[4715,2705]])assert(city.roadAt(x,y,-20),`activity/spawn blocked: ${x},${y}`);
for(let angle=0;angle<Math.PI*2;angle+=.08)assert(city.roadAt(670+320*Math.cos(angle),2310+320*Math.sin(angle),-20),'V40 harbor drift scoring ring must be drivable');
for(const v of city.minigameVenues){const a=v.apron,b=v.building;assert(city.roadAt(a.x+a.w/2,a.y+a.h/2,-20),`${v.id} parking apron must be driveable`);for(const d of [v.access,v.exit])assert(city.roadAt(d.x+d.w/2,d.y+d.h/2,-20),`${v.id} entry/exit lane must be driveable`);for(let x=b.x+4;x<b.x+b.w-4;x+=20)for(let y=b.y+4;y<b.y+b.h-4;y+=20)assert(!city.roadAt(x,y),`${v.id} building overlaps a driving surface`);}

// V36 requested entrances: sample each lane center from venue to public road using the
// same -20px car skin as resolveCarMotion(). Any failure here recreates an invisible wall.
for(const [label,a,b] of [
  ['harbor IN',[960,1825],[960,1975]],
  ['harbor OUT',[1100,1825],[1100,1975]],
  ['checkpoint IN',[3280,890],[3280,980]],
  ['checkpoint OUT',[3505,890],[3505,980]],
  ['hot potato IN',[885,1374],[1010,1374]],
  ['hot potato OUT',[885,1441],[1010,1441]],
  ['mini football IN',[1877,315],[1877,390]],
  ['mini football OUT',[2067,315],[2067,390]]
])for(let i=0;i<=20;i++){const t=i/20,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;assert(city.roadAt(x,y,-20),`${label} entrance blocked at ${x},${y}`);}
for(const b of buildings)for(let x=b.x;x<=b.x+b.w;x+=8)for(let y=b.y;y<=b.y+b.h;y+=8)assert(!city.roadAt(x,y),`building intrudes on road: ${b.x},${b.y}`);
for(const t of trees)assert(!city.roadAt(t.x,t.y,t.r),'tree canopy intrudes on road');
// Flood-fill actual traversable space, then verify every road endpoint and activity is connected.
const step=30,nx=Math.ceil(city.width/step),ny=Math.ceil(city.height/step),grid=new Uint8Array(nx*ny);
for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(city.roadAt(x*step+15,y*step+15,-20))grid[y*nx+x]=1;
const start=Math.floor(1590/step)*nx+Math.floor(2320/step),q=[start];grid[start]=2;
for(let i=0;i<q.length;i++){const k=q[i],x=k%nx,y=Math.floor(k/nx);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,n=yy*nx+xx;if(xx>=0&&yy>=0&&xx<nx&&yy<ny&&grid[n]===1){grid[n]=2;q.push(n);}}}
for(const r of roads)for(const [x,y] of r.points)assert.equal(grid[Math.floor(y/step)*nx+Math.floor(x/step)],2,`disconnected road ${x},${y}`);
for(let y=0;y<=city.height;y+=125)for(let x=0;x<=city.width;x+=125){const p=city.nearestRoad(x,y);assert(city.roadAt(p.x,p.y,-20),'waypoint must snap to a usable position');}
assert(!city.roadAt(540,536),'lake must not be drivable');
console.log(`free_city_geometry_test: OK (${buildings.length} buildings, ${trees.length} trees; all roads connected, activities clear, waypoints accessible)`);
