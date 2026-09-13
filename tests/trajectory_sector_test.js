/* Velocity Apex trajectory/sector validation. Run: node tests/trajectory_sector_test.js */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');global.window=global;window.Racing={};
for(const file of ['public/js/content.js','public/js/racing-line.js','public/js/track.js','public/js/car.js','public/js/ai.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file});
const R=global.Racing;
const tracks=Object.values(R.TRACKS).map(cfg=>new R.Track(cfg));
const fail=(msg)=>{throw new Error(msg);};
const assert=(cond,msg)=>{if(!cond)fail(msg);};
const wrap=(i,n)=>(i%n+n)%n;
function point(track,index,line){const n=track.samples.length,i=wrap(index,n),p=track.samples[i],o=line?line[i]:0;return{x:p.x+p.nx*o,y:p.y+p.ny*o};}
function intervalPoints(track,start,end,line){const n=track.samples.length,out=[];let i=wrap(start,n),target=wrap(end,n);for(let guard=0;guard<n;guard++){out.push(point(track,i,line));if(i===target)break;i=(i+1)%n;}return out;}
function pathStats(track,start,end,line){const pts=intervalPoints(track,start,end,line);let length=0,totalTurn=0;for(let i=1;i<pts.length;i++)length+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);for(let i=1;i<pts.length-1;i++){const ax=pts[i].x-pts[i-1].x,ay=pts[i].y-pts[i-1].y,bx=pts[i+1].x-pts[i].x,by=pts[i+1].y-pts[i].y;totalTurn+=Math.abs(Math.atan2(ax*by-ay*bx,ax*bx+ay*by));}const chord=Math.hypot(pts.at(-1).x-pts[0].x,pts.at(-1).y-pts[0].y);return{length,totalTurn,straightness:chord/Math.max(1,length)};}
function transitionCandidates(firstSign,secondSign){const out=[];for(const track of tracks){const line=track.racingLines.extreme,n=track.samples.length,pad=Math.max(3,Math.round(80/track.spacing));for(let i=1;i<track.apexes.length;i++){const a=track.apexes[i-1],b=track.apexes[i];if(a.sign!==firstSign||b.sign!==secondSign||Math.min(a.severity,b.severity)<.6)continue;const gap=((b.index-a.index+n)%n)*track.spacing;if(gap>520)continue;const center=pathStats(track,a.index-pad,b.index+pad,null),race=pathStats(track,a.index-pad,b.index+pad,line);out.push({track:track.id,a:a.index,b:b.index,gap:+gap.toFixed(1),center: center.straightness,race:race.straightness,improvement:race.straightness-center.straightness});}}return out;}

// 1) Fast single corner: find a meaningful non-hairpin where the optimal line shortens
// the local route without producing a jagged lateral sequence.
let fast=null;for(const track of tracks){const line=track.racingLines.extreme,n=track.samples.length,pad=Math.max(3,Math.round(96/track.spacing));for(const sec of track.sectors){if(sec.apexCount!==1)continue;const a=sec.apices[0];if(a.severity<.35||a.severity>.92)continue;const center=pathStats(track,a.index-pad,a.index+pad,null),race=pathStats(track,a.index-pad,a.index+pad,line);const gain=(center.length-race.length)/center.length;if(!fast||gain>fast.gain)fast={track:track.id,index:a.index,gain,centerLength:center.length,raceLength:race.length,offset:Math.abs(line[a.index])};}}
assert(fast&&fast.gain>.05,'Fast-corner sector did not gain enough path efficiency');
assert(fast.offset>25,'Fast-corner line did not use meaningful lateral width');

// 2) Hairpin: the slowest severe apex must have a real braking phase and a strong
// acceleration recovery after the apex, rather than braking on corner exit.
let hairpin=null;for(const track of tracks){const p=track.planningSpeeds.extreme,n=track.samples.length,step=Math.max(2,Math.round(120/track.spacing));for(const a of track.apexes){if(a.severity<.9)continue;const rec={track:track.id,index:a.index,apex:p[a.index],pre:p[wrap(a.index-step,n)],post:p[(a.index+step)%n]};if(!hairpin||rec.apex<hairpin.apex)hairpin=rec;}}
assert(hairpin&&hairpin.apex<100,'No genuine slow hairpin was detected');
assert(hairpin.pre>hairpin.apex+80,'Hairpin profile lacks a real pre-apex braking drop');
assert(hairpin.post>hairpin.apex+80,'Hairpin profile does not accelerate decisively after apex');

// 3/4) Left-right and right-left S transitions: at least one representative of each
// direction must be measurably straighter on the optimized line than on centerline.
const lr=transitionCandidates(1,-1).sort((a,b)=>b.improvement-a.improvement)[0];
const rl=transitionCandidates(-1,1).sort((a,b)=>b.improvement-a.improvement)[0];
assert(lr&&lr.improvement>.02,'Left-right S is not being straightened enough');
assert(rl&&rl.improvement>.02,'Right-left S is not being straightened enough');

// 5) Three-corner linked section: use the best detected 3+ apex alternating group
// and require a substantial chord/path improvement over simply following road shape.
let triple=null;for(const track of tracks){const line=track.racingLines.extreme,n=track.samples.length,pad=Math.max(3,Math.round(90/track.spacing));for(const sec of track.sectors){if(sec.apexCount<3||sec.signChanges<2)continue;const center=pathStats(track,sec.firstIndex-pad,sec.lastIndex+pad,null),race=pathStats(track,sec.firstIndex-pad,sec.lastIndex+pad,line),imp=race.straightness-center.straightness;if(!triple||imp>triple.improvement)triple={track:track.id,sector:sec.id,improvement:imp,center:center.straightness,race:race.straightness};}}
assert(triple&&triple.improvement>.03,'Three-corner linked section is not being straightened');

// 6) Corner -> long straight: after a slow final apex in a sector with a long exit,
// the propagated plan must open speed aggressively over the next ~360 world units.
let longExit=null;for(const track of tracks){const p=track.planningSpeeds.extreme,n=track.samples.length,step=Math.max(2,Math.round(180/track.spacing));for(const sec of track.sectors){if(sec.exitStraight<700)continue;const i=sec.lastIndex,apex=p[i],post=p[(i+2*step)%n],gain=post-apex;if(apex>280)continue;if(!longExit||gain>longExit.gain)longExit={track:track.id,sector:sec.id,exitStraight:sec.exitStraight,apex,post,gain};}}
assert(longExit&&longExit.gain>80,'Corner-to-long-straight profile does not prioritize exit acceleration');

// The precomputed line must remain smooth and retain OBB clearance to the barrier.
// Actual controlled shoulder contact is integration-tested with the real Car/AI
// dynamics in standalone_race_test.js because tyre contact also depends on yaw.
const smooth=[];for(const track of tracks){const line=track.racingLines.extreme;let maxStep=0,maxOffset=0;for(let i=0;i<line.length;i++){maxOffset=Math.max(maxOffset,Math.abs(line[i]));maxStep=Math.max(maxStep,Math.abs(line[(i+1)%line.length]-line[i]));}const barrierCenter=track.barrierCenterLimit(22);assert(maxOffset<barrierCenter-3,`${track.id}: optimal line lacks OBB barrier clearance`);assert(maxStep<8,`${track.id}: racing line has excessive adjacent lateral step`);assert(track.shoulderCenterLimit>track.asphaltCenterLimit,`${track.id}: no driveable shoulder corridor`);smooth.push({track:track.id,maxOffset:+maxOffset.toFixed(1),maxAdjacentStep:+maxStep.toFixed(2)});}

const result={fastTurn:{...fast,gain:+fast.gain.toFixed(3)},hairpin:{...hairpin,apex:+hairpin.apex.toFixed(1),pre:+hairpin.pre.toFixed(1),post:+hairpin.post.toFixed(1)},leftRightS:{...lr,improvement:+lr.improvement.toFixed(3)},rightLeftS:{...rl,improvement:+rl.improvement.toFixed(3)},tripleSection:{...triple,improvement:+triple.improvement.toFixed(3)},cornerToLongStraight:{...longExit,apex:+longExit.apex.toFixed(1),post:+longExit.post.toFixed(1),gain:+longExit.gain.toFixed(1)},smooth};
console.log(JSON.stringify(result,null,2));
