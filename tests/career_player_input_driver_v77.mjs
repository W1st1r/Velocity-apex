const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const wrapAngle=value=>{
  while(value>Math.PI)value-=Math.PI*2;
  while(value<-Math.PI)value+=Math.PI*2;
  return value;
};

// Deterministic test pilot for Career's real player physics. This deliberately
// uses the same bounded control tuple accepted by the public race input API; it
// does not call AIController or mutate race/session state.
export function createCareerPlayerInputDriver(session,{speedCap=540}={}){
  if(session?.config?.mode!=='career'||!session.track||!session.player)throw new Error('CAREER_SESSION_REQUIRED');
  if(!Number.isFinite(speedCap)||speedCap<300||speedCap>session.player.maxSpeed)throw new Error('INVALID_TEST_SPEED_CAP');
  const track=session.track,car=session.player;
  const speedProfile=track.getSpeedProfile(car,{difficulty:'extreme'});
  const racingLine=track.getRacingLine('extreme');
  return function nextPlayerControls(){
    const nearest=track.nearest(car.x,car.y,car.trackIndex),index=nearest.index;
    const speed=Math.hypot(car.vx,car.vy),look=clamp(90+speed*.24,90,260);
    const aim=track.lookaheadPoint(index,look,racingLine[index],'extreme');
    const targetAngle=Math.atan2(aim.y-car.y,aim.x-car.x);
    const headingError=wrapAngle(targetAngle-car.angle);
    const velocityAngle=speed>8?Math.atan2(car.vy,car.vx):car.angle;
    const slip=wrapAngle(velocityAngle-car.angle);
    const distance=Math.max(24,Math.hypot(aim.x-car.x,aim.y-car.y));
    const desiredYaw=2*Math.max(46,speed)*Math.sin(headingError)/distance-slip*.48;
    const steer=clamp(desiredYaw/Math.max(.12,car.steeringAuthority(speed,car.surface)),-1,1);

    let targetSpeed=Math.min(speedCap,speedProfile[index]);
    for(let step=1;step<=12;step++){
      const future=(index+step*4)%track.samples.length;
      targetSpeed=Math.min(targetSpeed,Math.min(speedCap,speedProfile[future])+step*3.5);
    }
    let throttle=0,brake=0;
    if(speed<targetSpeed-15)throttle=1;
    else if(speed>targetSpeed+12)brake=clamp((speed-targetSpeed)/110,.12,.85);
    else throttle=.25;
    return [steer,throttle,brake,0];
  };
}
