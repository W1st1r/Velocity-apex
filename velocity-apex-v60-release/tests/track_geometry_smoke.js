/* Velocity Apex track geometry smoke test. Run: node tests/track_geometry_smoke.js */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
for(const file of ['public/js/content.js','public/js/racing-line.js','public/js/track.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file});
const R=global.Racing,fail=m=>{throw new Error(m);};
const finite=v=>Number.isFinite(v),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a,b,c,d){const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);return ab1*ab2<0&&cd1*cd2<0;}
const report=[];
for(const cfg of Object.values(R.TRACKS)){
  const t=new R.Track(cfg),s=t.samples,n=s.length;if(!finite(t.length)||t.length<=0)fail(cfg.id+': invalid length');
  let maxUnitError=0,maxCurvJump=0,minSeg=Infinity,selfIntersections=0;
  for(let i=0;i<n;i++){
    const p=s[i],q=s[(i+1)%n];for(const k of ['x','y','tx','ty','nx','ny','curvature'])if(!finite(p[k]))fail(`${cfg.id}: non-finite ${k} at ${i}`);
    maxUnitError=Math.max(maxUnitError,Math.abs(Math.hypot(p.tx,p.ty)-1));minSeg=Math.min(minSeg,Math.hypot(q.x-p.x,q.y-p.y));
    maxCurvJump=Math.max(maxCurvJump,Math.abs(p.curvature-s[(i+1)%n].curvature));
  }
  if(maxUnitError>.01)fail(`${cfg.id}: tangent normalization error ${maxUnitError}`);if(minSeg<1)fail(`${cfg.id}: tiny local segment ${minSeg}`);
  const step=4;for(let i=0;i<n;i+=step){const a=s[i],b=s[(i+step)%n];for(let j=i+step*2;j<n;j+=step){if(i===0&&j>=n-step*2)continue;const c=s[j],d=s[(j+step)%n];if(intersects(a,b,c,d))selfIntersections++;}}
  if(selfIntersections)fail(`${cfg.id}: centerline self-intersections ${selfIntersections}`);
  report.push({track:cfg.id,length:+t.length.toFixed(1),samples:n,minSegment:+minSeg.toFixed(2),maxTangentUnitError:+maxUnitError.toFixed(6),maxCurvatureJump:+maxCurvJump.toFixed(6),selfIntersections});
}
const aurora=report.find(x=>x.track==='auroraGrandLoop'),desert=report.find(x=>x.track==='desertCanyon');if(!aurora)fail('auroraGrandLoop missing');if(aurora.length<14000||aurora.length>16000)fail('auroraGrandLoop must be 14–16 km');if(!desert||aurora.length<=desert.length*1.4)fail('auroraGrandLoop must be substantially longer than Desert Canyon');
console.log(JSON.stringify(report,null,2));
