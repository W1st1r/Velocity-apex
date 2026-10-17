import {RaceSession,RACE_RUNTIME_VERSION,MAX_BATCH_FRAMES} from './race-session-v77.mjs';
const KEY='velocityApex.race.session.v77';
export class AuthoritativeRaceClient {
  constructor(data,request){this.request=request;this.raceId=data.raceId;this.config=data.config;this.carSave=data.carSave;this.seed=data.seed;this.sequence=data.sequence;this.engine=new RaceSession(data.config,data.carSave,data.seed,data.state);this.queue=[];this.sending=null;this.lastError=null;this.retryAt=0;}
  step(input){if(this.queue.length>=600||this.engine.result)return false;this.engine.step(input);this.queue.push(input.slice());if(this.queue.length>=MAX_BATCH_FRAMES)this.flush().catch(()=>{});return true;}
  async flush(force=false){
    if(this.sending){await this.sending;if(force&&this.queue.length)return this.flush(true);return;}
    if(!this.queue.length||!force&&(this.queue.length<MAX_BATCH_FRAMES||Date.now()<this.retryAt))return;
    const packet=this.queue.slice(0,MAX_BATCH_FRAMES),sequence=this.sequence;
    this.sending=(async()=>{
      try{
        const response=await this.request('input',{raceId:this.raceId,runtimeVersion:RACE_RUNTIME_VERSION,sequence,inputs:packet});
        if(response.sequence!==sequence+1||!response.state)throw Error('INVALID_RACE_ACK');
        this.queue.splice(0,packet.length);if(response.state.result)this.queue.length=0;this.sequence=response.sequence;
        this.engine=new RaceSession(this.config,this.carSave,this.seed,response.state);for(const ctl of this.queue)this.engine.step(ctl);
        this.lastError=null;this.retryAt=0;
      }catch(e){this.lastError=e;this.retryAt=Date.now()+2000;throw e;}
    })();
    try{await this.sending;}finally{this.sending=null;}
    if(this.queue.length&&(force||this.queue.length>=MAX_BATCH_FRAMES))return this.flush(force);
  }
  async finish(){await this.flush(true);const result=await this.request('finish',{raceId:this.raceId});try{sessionStorage.removeItem(KEY);}catch{}return result;}
  async cancel(){await this.request('cancel',{raceId:this.raceId});try{sessionStorage.removeItem(KEY);}catch{}}
}
export async function startAuthoritativeRace(config,request,{fresh=false}={}){
  let pending=null;try{pending=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{}
  if(pending?.raceId){
    try{
      const prior=await request('resume',{raceId:pending.raceId});
      if(prior.state?.result&&prior.status==='active')await request('finish',{raceId:pending.raceId});
      else if(!fresh&&prior.status==='active'&&prior.runtimeVersion===RACE_RUNTIME_VERSION&&Object.entries(config).every(([k,v])=>prior.config[k]===v))return new AuthoritativeRaceClient(prior,request);
      else if(prior.status==='active')await request('cancel',{raceId:pending.raceId});
    }catch(e){if(!['RACE_NOT_FOUND','RACE_CLOSED','RACE_EXPIRED'].includes(e.code))throw e;}
  }
  let requestId=pending?.requestId;
  if(!requestId||pending?.raceId||JSON.stringify(pending.config)!==JSON.stringify(config))requestId=crypto.randomUUID();
  try{sessionStorage.setItem(KEY,JSON.stringify({requestId,config}));}catch{}
  const data=await request('start',{requestId,config,runtimeVersion:RACE_RUNTIME_VERSION});
  try{sessionStorage.setItem(KEY,JSON.stringify({requestId,config,raceId:data.raceId}));}catch{}
  return new AuthoritativeRaceClient(data,request);
}
