(function(){
  'use strict';
  const R=window.Racing,clamp=R.clamp,angleWrap=R.angleWrap;
  const PROFILES={
    easy:{aggression:.50,precision:.84,errorChance:.032,errorSize:18,lineUse:.88,pace:.62,gripUsage:.58,brakeUsage:.58,accelUsage:.60,reaction:.82,brakeMargin:11,laneRate:1.65,followGap:102,recoverySpeed:118,edgeUse:.68,trafficSkill:.56,driverVariance:.035,brakeConfidence:.61,curbAggression:.01,apexPreference:.08,consistency:.80},
    medium:{aggression:.68,precision:.93,errorChance:.012,errorSize:10,lineUse:.97,pace:.79,gripUsage:.77,brakeUsage:.75,accelUsage:.82,reaction:.96,brakeMargin:6.5,laneRate:2.10,followGap:88,recoverySpeed:136,edgeUse:.86,trafficSkill:.76,driverVariance:.018,brakeConfidence:.76,curbAggression:.07,apexPreference:.32,consistency:.91},
    hard:{aggression:.84,precision:.978,errorChance:.003,errorSize:5,lineUse:.992,pace:.92,gripUsage:.89,brakeUsage:.88,accelUsage:.91,reaction:1.03,brakeMargin:3.8,laneRate:2.45,followGap:81,recoverySpeed:148,edgeUse:.96,trafficSkill:.90,driverVariance:.010,brakeConfidence:.88,curbAggression:.58,apexPreference:.66,consistency:.97},
    extreme:{aggression:.965,precision:.998,errorChance:.00035,errorSize:1.5,lineUse:1,pace:1,gripUsage:.997,brakeUsage:.992,accelUsage:.998,reaction:1.10,brakeMargin:1.2,laneRate:2.85,followGap:75,recoverySpeed:163,edgeUse:1,trafficSkill:.988,driverVariance:.003,brakeConfidence:.985,curbAggression:.96,apexPreference:.94,consistency:.995}
  };

  const laneOf=(car,track)=>{const p=track.samples[car.trackIndex];return (car.x-p.x)*p.nx+(car.y-p.y)*p.ny;};
  const forwardSpeed=(car,track)=>{const p=track.samples[car.trackIndex];return car.vx*p.tx+car.vy*p.ty;};

  class AIController{
    constructor(car,index,difficulty='medium'){
      this.car=car;this.index=index;this.difficulty=PROFILES[difficulty]?difficulty:'medium';this.lineName=this.difficulty;
      Object.assign(this,PROFILES[this.difficulty]);
      const variance=1+(Math.random()-.5)*2*this.driverVariance;
      this.pace=clamp(this.pace*variance,.72,1);this.aggression=clamp(this.aggression+(Math.random()-.5)*this.driverVariance,.35,1);
      this.brakeConfidence=clamp(this.brakeConfidence+(Math.random()-.5)*this.driverVariance,.55,1);
      this.curbAggression=clamp(this.curbAggression+(Math.random()-.5)*this.driverVariance*2,0,1);
      this.preference=(index%3-1)*(this.difficulty==='extreme'?1.2:this.difficulty==='hard'?2.0:3.5);
      this.lane=this.preference;this.targetLane=this.lane;this.mistake=0;this.mistakeTimer=4+Math.random()*5;this.overtakeSide=index%2?1:-1;
      this.output={steer:0,throttle:0,brake:0};this.raceTime=0;this.launchDelay=this.difficulty==='extreme'?.01:(this.difficulty==='hard'?.04:(this.difficulty==='medium'?.10:.20));this.speedProfile=null;this.profileTrack=null;this.debugAim=null;this.debugTrail=[];this._nearby=[];this._sequence={strongest:0,first:0,signChanges:0,firstSharpDistance:0};
    }

    _profile(track){
      if(this.profileTrack!==track||!this.speedProfile){
        this.lineName=track.racingLines&&track.racingLines[this.difficulty]?this.difficulty:'extreme';
        this.speedProfile=track.getSpeedProfile(this.car,{difficulty:this.lineName,gripUsage:this.gripUsage,brakeUsage:this.brakeUsage,accelUsage:this.accelUsage,pace:this.pace});
        this.profileTrack=track;
      }
      return this.speedProfile;
    }

    _futureSequence(track,index,distance){
      const n=track.samples.length,step=Math.max(1,Math.round(22/track.spacing)),count=Math.max(1,Math.round(distance/(step*track.spacing)));
      let strongest=0,first=0,lastSign=0,signChanges=0,firstSharpDistance=distance;
      for(let q=1;q<=count;q++){
        const k=track.samples[(index+q*step)%n].curvature,mag=Math.abs(k),sign=mag>.00028?(Math.sign(k)||1):0;
        if(mag>Math.abs(strongest))strongest=k;
        if(!first&&mag>.00042){first=k;firstSharpDistance=q*step*track.spacing;}
        if(sign){if(lastSign&&sign!==lastSign)signChanges++;lastSign=sign;}
      }
      const out=this._sequence;out.strongest=strongest;out.first=first;out.signChanges=signChanges;out.firstSharpDistance=firstSharpDistance;return out;
    }

    _trafficChoice(track,cars,baseLane,lateral,speed){
      const c=this.car,plannedLimit=track.lineLimits?.[this.lineName]?.max??(track.roadWidth*.5-27);
      const asphalt=track.asphaltCenterLimit??plannedLimit,physicalSafe=track.maxDriveableCenter?track.maxDriveableCenter(28):(track.roadWidth*.5-20);
      // Traffic deliberately keeps more reserve than a clean qualifying lap.  The
      // final envelope is tightened again after nearby density is known so a
      // three-wide pack cannot use both curb edges at the same time.
      const baseLimit=Math.min(plannedLimit,asphalt+(this.difficulty==='extreme'?1.5:.5),physicalSafe-1.5);
      const trafficEdge=clamp(.88+.12*this.trafficSkill,.88,1),horizon=125+speed*.72,metric=c.raceMetric(),cForward=Math.max(0,forwardSpeed(c,track));
      let lead=null,leadGap=Infinity,leadLane=0,alongside=null,alongGap=Infinity,alongLane=0;const nearby=this._nearby;nearby.length=0;
      for(const o of cars){
        if(o===c||o.raceFinished)continue;
        const gap=(o.raceMetric()-metric)*track.length;if(gap<-105||gap>horizon+170)continue;
        const ol=laneOf(o,track),ov=Math.max(0,forwardSpeed(o,track));nearby.push(o);
        const predicted=gap+(ov-cForward)*.70;
        if(gap>0&&gap<horizon&&(Math.abs(ol-lateral)<66||Math.abs(ol-baseLane)<56)&&predicted<leadGap){lead=o;leadGap=Math.max(0,predicted);leadLane=ol;}
        if(Math.abs(gap)<78&&Math.abs(ol-lateral)<78&&Math.abs(gap)<alongGap){alongside=o;alongGap=Math.abs(gap);alongLane=ol;}
      }
      const crowdReserve=nearby.length>=6?18:nearby.length>=4?13:nearby.length>=2?7:0;
      const limit=Math.max(track.roadWidth*.24,Math.min(baseLimit,asphalt-crowdReserve));
      const freeLane=clamp(baseLane,-limit*trafficEdge,limit*trafficEdge);
      if(!lead&&!alongside)return {lane:freeLane,lead:null,leadGap:Infinity,leadLane:0,passing:false,sideBySide:false,sideCar:null,density:nearby.length};
      if(alongside){
        const safeSep=nearby.length>=4?66:70,delta=lateral-alongLane;let side=Math.abs(delta)>3?Math.sign(delta):(c.id<alongside.id?-1:1),hold=alongLane+side*safeSep;
        if(Math.abs(hold)>limit*trafficEdge){side=-side;hold=alongLane+side*safeSep;}hold=clamp(hold,-limit*trafficEdge,limit*trafficEdge);
        const gap=(alongside.raceMetric()-metric)*track.length;
        return {lane:hold,lead:gap>0?alongside:lead,leadGap:gap>0?gap:leadGap,leadLane:gap>0?alongLane:leadLane,passing:true,sideBySide:true,sideCar:alongside,density:nearby.length};
      }
      const next=this._futureSequence(track,c.trackIndex,260),turnSide=Math.sign(next.strongest)||0,turnSeverity=clamp(Math.abs(next.strongest)*240,0,1);
      const passWidth=70+6*this.aggression,candidates=[baseLane,leadLane-passWidth,leadLane+passWidth];
      if(turnSide){candidates.push(turnSide*limit*this.edgeUse*.72);candidates.push(-turnSide*limit*this.edgeUse*.82);}
      let best=baseLane,bestScore=-Infinity;
      for(let lane of candidates){
        lane=clamp(lane,-limit*trafficEdge,limit*trafficEdge);
        const edgeRoom=limit-Math.abs(lane);let score=54-Math.abs(lane-baseLane)*(.22+(1-this.trafficSkill)*.18)+edgeRoom*.055;
        const moveCost=Math.abs(lane-lateral);score-=moveCost*(.10+(1-this.reaction)*.18);score-=Math.abs(lane-baseLane)*turnSeverity*(.22+.12*(1-this.trafficSkill));
        if(turnSide&&leadGap<112)score+=(Math.sign(lane)===turnSide?3.6:0)*this.aggression;if(Math.sign(lane-leadLane)===this.overtakeSide)score+=2.5;
        let minClear=260,danger=0,crossingDanger=0;const sweepLo=Math.min(lateral,lane)-28,sweepHi=Math.max(lateral,lane)+28;
        for(const o of nearby){
          const gap=(o.raceMetric()-metric)*track.length,ol=laneOf(o,track),ov=Math.max(0,forwardSpeed(o,track));
          for(const t of [.2,.45,.75,1.05,1.35]){const futureGap=gap+(ov-cForward)*t,latSep=Math.abs(lane-ol);if(latSep<58){minClear=Math.min(minClear,Math.abs(futureGap));if(futureGap>-48&&futureGap<82)danger++;}if(ol>sweepLo&&ol<sweepHi&&futureGap>-52&&futureGap<80)crossingDanger++;}
        }
        score+=Math.min(90,minClear)*.36-danger*(62+38*this.trafficSkill)-crossingDanger*(80+48*this.trafficSkill);if(Math.abs(lane-leadLane)<60)score-=105;
        if(score>bestScore){bestScore=score;best=lane;}
      }
      const passTurnLimit=.40+.20*this.trafficSkill,passing=Math.abs(best-leadLane)>64&&leadGap<horizon*.95&&(turnSeverity<passTurnLimit||leadGap<48*this.aggression);
      if(passing)this.overtakeSide=Math.sign(best-leadLane)||this.overtakeSide;
      return {lane:best,lead,leadGap,leadLane,passing,sideBySide:false,sideCar:null,density:nearby.length};
    }

    _futureBrakeDemand(track,profile,index,speed){
      const seg=track.lineSegmentLengths?.[this.lineName],n=track.samples.length,maxDistance=clamp(120+speed*.48,140,285),step=Math.max(1,Math.round(18/track.spacing));
      let dist=0,best=0;
      for(let q=step;dist<maxDistance;q+=step){
        const prev=(index+q-step)%n,i=(index+q)%n;
        if(seg){for(let k=0;k<step;k++)dist+=seg[(prev+k)%n];}
        else dist+=step*track.spacing;
        const target=profile[i];if(target>=speed-2)continue;
        const req=(speed*speed-target*target)/(2*Math.max(18,dist));if(req>best)best=req;
      }
      return best;
    }

    think(dt,track,cars){
      const c=this.car,n=track.samples.length,out=this.output,speed=c.speed,profile=this._profile(track),line=track.getRacingLine?track.getRacingLine(this.lineName):track.racingLineOffset;this.raceTime+=dt;
      this.mistakeTimer-=dt;
      if(this.mistakeTimer<=0){this.mistakeTimer=4+Math.random()*6;if(Math.random()<this.errorChance)this.mistake=(Math.random()-.5)*2*this.errorSize;}
      this.mistake*=Math.exp(-dt*(1.0+this.consistency));

      const local=track.samples[c.trackIndex],lateral=(c.x-local.x)*local.nx+(c.y-local.y)*local.ny;
      const horizon=clamp(250+speed*.90,250,600),seq=this._futureSequence(track,c.trackIndex,horizon),curveFactor=clamp(Math.abs(seq.strongest)*205,0,1);
      let look=58+speed*.20-curveFactor*(11+speed*.016);
      if(seq.signChanges>0)look+=8+Math.min(12,seq.signChanges*4); // hold a calmer target through fast S transitions
      if(seq.firstSharpDistance<95)look-=8*curveFactor;
      look=clamp(look,48,145);
      const aimHit=track.indexAtDistance?track.indexAtDistance(c.trackIndex,look,this.lineName):{index:(c.trackIndex+Math.max(2,Math.round(look/track.spacing)))%n};
      const aimIndex=aimHit.index,baseLine=line[aimIndex]*this.lineUse+this.preference*(1-curveFactor*.80);

      const traffic=this._trafficChoice(track,cars,baseLine,lateral,speed);this.targetLane=traffic.lane;
      if(c.surface==='offroad')this.targetLane=0;
      const plannedLimit=track.lineLimits?.[this.lineName]?.max??(track.roadWidth*.5-28),targetEdge=(traffic.lead||traffic.sideBySide)?Math.max(this.edgeUse,.88+.12*this.trafficSkill):this.edgeUse;
      this.targetLane=clamp(this.targetLane,-plannedLimit*targetEdge,plannedLimit*targetEdge);
      const trafficRate=traffic.sideBySide?.68:(traffic.lead?.82:1),laneResponse=(this.laneRate+.55*this.aggression)*this.reaction*trafficRate*(c.surface==='offroad'?1.32:1);
      this.lane+=(this.targetLane-this.lane)*(1-Math.exp(-dt*laneResponse));

      const steerLook=c.surface==='offroad'?46:look,laneAim=c.surface==='offroad'?this.lane*.20:this.lane;
      const aim=track.lookaheadPoint?track.lookaheadPoint(c.trackIndex,steerLook,laneAim+this.mistake,this.lineName):track.sampleAtProgress(((c.trackIndex+Math.round(steerLook/track.spacing))%n)/n,laneAim+this.mistake);
      this.debugAim=aim;if(R.AI_DEBUG){this.debugTrail.push({x:c.x,y:c.y});if(this.debugTrail.length>240)this.debugTrail.shift();}
      const tx=aim.x-c.x,ty=aim.y-c.y,distance=Math.max(24,Math.hypot(tx,ty)),diff=angleWrap(Math.atan2(ty,tx)-c.angle);
      const velocityAngle=speed>10?Math.atan2(c.vy,c.vx):c.angle,slip=angleWrap(velocityAngle-c.angle);
      let desiredYaw=2*Math.max(46,speed)*Math.sin(diff)/distance-slip*(.43+.20*this.precision);
      if(c.surface==='offroad')desiredYaw+=clamp(-lateral/(track.roadWidth*.30),-1,1)*.32;
      out.steer=clamp(desiredYaw/Math.max(.12,c.steeringAuthority(speed,c.surface)),-1,1);

      let desired=profile[c.trackIndex],sampleStep=Math.max(1,Math.round(18/track.spacing));
      for(let k=1;k<=3;k++)desired=Math.min(desired,profile[(c.trackIndex+k*sampleStep)%n]+k*(2.2+1.2*this.brakeConfidence));
      if(c.surface==='offroad')desired=Math.min(desired,this.recoverySpeed);

      const lineCurv=track.getLineCurvature?track.getLineCurvature(this.lineName):track.lineCurvature;
      const cornerSeverity=clamp(Math.max(Math.abs(lineCurv[c.trackIndex]||0),Math.abs(seq.strongest))*235,0,1),idealHere=line[c.trackIndex]*this.lineUse;
      const lineDelta=Math.abs(this.lane-idealHere),linePenalty=cornerSeverity*clamp(lineDelta/(track.roadWidth*.32),0,1);
      desired*=1-linePenalty*(.20+.06*(1-this.trafficSkill));
      if(traffic.sideBySide&&traffic.sideCar){desired*=1-cornerSeverity*.085;if(cornerSeverity>.24)desired=Math.min(desired,traffic.sideCar.speed+8+10*(1-cornerSeverity));}
      if((traffic.density||0)>=3&&cornerSeverity>.24)desired*=1-.055*Math.min(4,traffic.density-2)*cornerSeverity;

      const metric=c.raceMetric(),brakeAvail=Math.max(40,c.brakePower*.80*this.brakeUsage);
      for(const o of cars){
        if(o===c||o.raceFinished)continue;const gap=(o.raceMetric()-metric)*track.length;if(gap<=0||gap>185)continue;
        const ol=laneOf(o,track),sep=Math.min(Math.abs(lateral-ol),Math.abs(this.lane-ol)),closing=Math.max(0,forwardSpeed(c,track)-forwardSpeed(o,track));if(sep>62||closing<3)continue;
        const room=Math.max(0,gap-(46+closing*.17));desired=Math.min(desired,Math.sqrt(Math.max(0,o.speed*o.speed+2*brakeAvail*room)));if(gap/Math.max(1,closing)<.72&&sep<54)desired=Math.min(desired,o.speed*.96);
      }
      if(traffic.lead){
        const closing=Math.max(0,speed-traffic.lead.speed),laneSeparation=Math.abs(lateral-traffic.leadLane);
        if(!traffic.passing||laneSeparation<68){const safe=this.followGap+closing*.24+cornerSeverity*16,room=Math.max(0,traffic.leadGap-safe);desired=Math.min(desired,Math.sqrt(Math.max(0,traffic.lead.speed*traffic.lead.speed+2*brakeAvail*room)));if(traffic.leadGap<safe*.67)desired=Math.min(desired,Math.max(34,traffic.lead.speed-(safe*.67-traffic.leadGap)*1.10));}
      }
      if(Math.abs(diff)>1.08)desired=Math.min(desired,76+34*this.pace);

      const over=speed-desired,localBrake=over>this.brakeMargin?clamp((over-this.brakeMargin)/21+.10,0,1):0;
      const futureDecel=this._futureBrakeDemand(track,profile,c.trackIndex,speed),trigger=this.difficulty==='extreme'?.98:(this.difficulty==='hard'?.92:(.58+.30*this.brakeConfidence)),futureRatio=futureDecel/Math.max(1,brakeAvail);
      let targetBrake=Math.max(localBrake,futureRatio>trigger?clamp((futureRatio-trigger)/Math.max(.08,1-trigger)+.08,0,1):0);
      // Trail off the brake as yaw builds and the speed profile starts rising again.
      const nextSpeed=profile[(c.trackIndex+sampleStep)%n];if(targetBrake>0&&nextSpeed>desired+7&&Math.abs(out.steer)>.18)targetBrake*=.72;
      if(c.surface==='shoulder')targetBrake=Math.max(targetBrake,over>1?clamp(over/26,0,.55):0);
      const brakeRate=targetBrake>out.brake?11:19;out.brake+=(targetBrake-out.brake)*(1-Math.exp(-dt*brakeRate));if(out.brake<.012)out.brake=0;

      let targetThrottle=0;if(out.brake<.045){
        const error=desired-speed,ratio=clamp(speed/Math.max(1,c.maxSpeed),0,1),torque=Math.max(.50,1-.50*Math.pow(ratio,1.35));
        const drag=2.25+.00031*speed*speed+(c.surface==='shoulder'?(3.8+.00010*speed*speed):0),traction=c.surface==='asphalt'?.84:(c.surface==='shoulder'?.76:.24/Math.max(.7,track.theme.drag||1));
        const hold=drag/Math.max(1,c.accel*torque*traction),authority=.72+.28*this.accelUsage;
        targetThrottle=clamp(hold+authority*(.20+error/18)+(traffic.passing?.06:0),0,1);if(error>10)targetThrottle=1;if(error<-4.5)targetThrottle=0;
        if(nextSpeed>desired+6&&error>-7&&c.surface!=='offroad')targetThrottle=Math.max(targetThrottle,.72+.26*this.aggression);
        if(this.difficulty==='extreme'&&error>-6&&c.surface!=='offroad')targetThrottle=1;
      }
      if(this.raceTime<this.launchDelay&&speed<18)targetThrottle=0;
      const throttleRate=targetThrottle>out.throttle?10:18;out.throttle+=(targetThrottle-out.throttle)*(1-Math.exp(-dt*throttleRate));if(out.brake>.07)out.throttle*=Math.exp(-dt*28);
      return out;
    }
  }
  R.AIController=AIController;R.AI_PROFILES=PROFILES;
})();
