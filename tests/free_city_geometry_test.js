const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/js/free-city.js'),'utf8');
const scope={window:{}};vm.createContext(scope);
vm.runInContext(source.replace('window.ApexCity={','window.__geometry={roads,buildings,trees,areas};window.ApexCity={'),scope);
const city=scope.window.ApexCity,{roads,buildings,trees}=scope.window.__geometry;
for(const [x,y] of [[2320,1590],[2020,430],[620,2290],[3130,2635],[3130,2705],[3925,2635],[3925,2705]])assert(city.roadAt(x,y,-20),`activity/spawn blocked: ${x},${y}`);
for(let angle=0;angle<Math.PI*2;angle+=.08)assert(city.roadAt(620+310*Math.cos(angle),2290+310*Math.sin(angle),-20),'full drift ring must be drivable');
for(const b of buildings)for(let x=b.x;x<=b.x+b.w;x+=8)for(let y=b.y;y<=b.y+b.h;y+=8)assert(!city.roadAt(x,y),`building intrudes on road: ${b.x},${b.y}`);
for(const t of trees)assert(!city.roadAt(t.x,t.y,t.r),'tree canopy intrudes on road');
// Flood-fill actual traversable space, then verify every road endpoint and activity is connected.
const step=30,nx=140,ny=100,grid=new Uint8Array(nx*ny);
for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(city.roadAt(x*step+15,y*step+15,-20))grid[y*nx+x]=1;
const start=Math.floor(1590/step)*nx+Math.floor(2320/step),q=[start];grid[start]=2;
for(let i=0;i<q.length;i++){const k=q[i],x=k%nx,y=Math.floor(k/nx);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,n=yy*nx+xx;if(xx>=0&&yy>=0&&xx<nx&&yy<ny&&grid[n]===1){grid[n]=2;q.push(n);}}}
for(const r of roads)for(const [x,y] of r.points)assert.equal(grid[Math.floor(y/step)*nx+Math.floor(x/step)],2,`disconnected road ${x},${y}`);
for(let y=0;y<=3000;y+=125)for(let x=0;x<=4200;x+=125){const p=city.nearestRoad(x,y);assert(city.roadAt(p.x,p.y,-20),'waypoint must snap to a usable position');}
assert(!city.roadAt(540,536),'lake must not be drivable');
console.log(`free_city_geometry_test: OK (${buildings.length} buildings, ${trees.length} trees; all roads connected, activities clear, waypoints accessible)`);
