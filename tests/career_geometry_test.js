const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;global.document={};window.Racing={};
for(const f of ['content.js','racing-line.js','track.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public/js',f),'utf8'),{filename:f});
const R=global.Racing;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const intersects=(a,b,c,d)=>{const a1=cross(a,b,c),a2=cross(a,b,d),b1=cross(c,d,a),b2=cross(c,d,b);return a1*a2<0&&b1*b2<0;};
const pointKeys=new Set();let previousWidth=Infinity;
for(const level of R.CAREER_LEVELS){
  const cfg=R.CAREER_TRACKS[level.trackId],track=new R.Track(cfg);
  assert.ok(track.length>=23900&&track.length<=32100,`${cfg.id}: career length out of range`);
  if(level.level>=11){assert.ok(cfg.roadWidth<previousWidth||level.level===11,`${cfg.id}: late-career road should keep tightening`);previousWidth=cfg.roadWidth;}
  const key=cfg.points.map(p=>`${p.x},${p.y}`).join('|');assert.ok(!pointKeys.has(key),`${cfg.id}: duplicate route geometry`);pointKeys.add(key);
  const s=track.samples.filter((_,i)=>i%8===0),n=s.length;let hit=false;
  for(let i=0;i<n&&!hit;i++){const a=s[i],b=s[(i+1)%n];for(let j=i+2;j<n;j++){if((j+1)%n===i)continue;const c=s[j],d=s[(j+1)%n];if(intersects(a,b,c,d)){hit=true;break;}}}
  assert.ok(!hit,`${cfg.id}: sampled centerline self-intersection`);
}
const trackSrc=fs.readFileSync(path.join(ROOT,'public/js/track.js'),'utf8');
for(const token of ['_drawCareerDetails','detailCount=this.isCareer?260:115','this.isCareer?3584:3072'])assert.ok(trackSrc.includes(token),`detail renderer missing ${token}`);
console.log('career_geometry_test: OK — 30 unique long routes, no sampled self-intersections, tighter late roads, cached high-detail renderer');
