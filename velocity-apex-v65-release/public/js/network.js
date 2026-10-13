(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  const TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const angleLerp=(a,b,t)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return a+d*t;};
  class SnapshotBuffer{
    constructor(){this.items=[];this.last=null;this.lastArrival=0;this.cadenceMs=52;this.jitterMs=0;this.transitMs=36;this.lossRate=0;this.playbackDelayMs=96;this.teleport=false;}
    push(state,serverTime,arrivalTime=Date.now()){
      if(!state||!Number.isFinite(serverTime))return;
      const item={...state,serverTime,_arrival:arrivalTime};if(this.last&&Number.isFinite(item.seq)&&Number.isFinite(this.last.seq)&&item.seq<=this.last.seq)return;
      const jumped=!!this.last&&Number.isFinite(item.x)&&Number.isFinite(item.y)&&Number.isFinite(this.last.x)&&Number.isFinite(this.last.y)&&Math.hypot(item.x-this.last.x,item.y-this.last.y)>720;
      if(jumped){this.items.length=0;this.teleport=true;}
      if(this.last&&!jumped){
        const sourceGap=serverTime-this.last.serverTime,arrivalGap=arrivalTime-this.lastArrival;
        if(sourceGap>0&&sourceGap<1200){this.cadenceMs=lerp(this.cadenceMs,sourceGap,.16);if(arrivalGap>0&&arrivalGap<1800)this.jitterMs=lerp(this.jitterMs,Math.min(300,Math.abs(arrivalGap-sourceGap)),.2);}
        const seqGap=Number.isFinite(item.seq)&&Number.isFinite(this.last.seq)?item.seq-this.last.seq:1,lossSample=sourceGap<180&&seqGap>1?clamp((seqGap-1)/seqGap,0,1):0;this.lossRate=lerp(this.lossRate,lossSample,lossSample ? .22 : .04);
      }
      const transit=arrivalTime-serverTime;if(transit>=0&&transit<2000)this.transitMs=lerp(this.transitMs,transit,.12);
      this.last=item;this.lastArrival=arrivalTime;this.items.push(item);if(this.items.length>32)this.items.splice(0,this.items.length-32);
      const desired=this.delay();this.playbackDelayMs=lerp(this.playbackDelayMs,desired,desired>this.playbackDelayMs?.32:.08);
    }
    delay(){return clamp(Math.max(82,this.transitMs+this.cadenceMs*.6+this.jitterMs*2.1)+this.lossRate*85,82,260);}
    sample(targetTime){
      const a=this.items;if(!a.length)return null;
      while(a.length>3&&a[1].serverTime<targetTime-900)a.shift();
      let before=null,after=null;for(const s of a){if(s.serverTime<=targetTime)before=s;if(s.serverTime>=targetTime){after=s;break;}}
      if(before&&after&&after!==before){const t=clamp((targetTime-before.serverTime)/Math.max(1,after.serverTime-before.serverTime),0,1);return SnapshotBuffer.mix(before,after,t);}
      if(!before&&after)return {...after,_extrapolated:false};
      const latest=a[a.length-1],age=Math.max(0,targetTime-latest.serverTime);return age>0?SnapshotBuffer.project(latest,age):{...latest,_extrapolated:false};
    }
    static mix(a,b,t){
      const out={...b},span=Math.max(.001,(b.serverTime-a.serverTime)/1000),dx=(Number(b.x)||0)-(Number(a.x)||0),dy=(Number(b.y)||0)-(Number(a.y)||0),distance=Math.hypot(dx,dy),maxTangent=Math.max(90,distance/span*2.25);
      let avx=Number(a.vx)||0,avy=Number(a.vy)||0,bvx=Number(b.vx)||0,bvy=Number(b.vy)||0;const al=Math.hypot(avx,avy),bl=Math.hypot(bvx,bvy);if(al>maxTangent){avx*=maxTangent/al;avy*=maxTangent/al;}if(bl>maxTangent){bvx*=maxTangent/bl;bvy*=maxTangent/bl;}
      const t2=t*t,t3=t2*t,h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2,margin=Math.max(18,distance*.28);
      const hx=h00*a.x+h10*avx*span+h01*b.x+h11*bvx*span,hy=h00*a.y+h10*avy*span+h01*b.y+h11*bvy*span;
      out.x=clamp(hx,Math.min(a.x,b.x)-margin,Math.max(a.x,b.x)+margin);out.y=clamp(hy,Math.min(a.y,b.y)-margin,Math.max(a.y,b.y)+margin);
      for(const k of ['vx','vy','speed','yawRate','progress','steer','throttle','brake'])if(Number.isFinite(a[k])&&Number.isFinite(b[k]))out[k]=lerp(a[k],b[k],t);
      out.angle=angleLerp(a.angle,b.angle,t);out.laps=t<.5?a.laps:b.laps;out.checkpoint=t<.5?a.checkpoint:b.checkpoint;out._extrapolated=false;return out;
    }
    static project(latest,ageMs){
      const holdMs=220,decayMs=720,extra=Math.max(0,ageMs-holdMs),travelMs=Math.min(ageMs,holdMs)+decayMs*(1-Math.exp(-extra/decayMs)),decay=extra?Math.exp(-extra/decayMs):1,t=travelMs/1000,w=clamp(Number(latest.yawRate)||0,-5,5),vx=Number(latest.vx)||0,vy=Number(latest.vy)||0;
      let dx=vx*t,dy=vy*t,rvx=vx,rvy=vy;if(Math.abs(w)>.015){const q=w*t,s=Math.sin(q),c=Math.cos(q);dx=(vx*s-vy*(1-c))/w;dy=(vx*(1-c)+vy*s)/w;rvx=vx*c-vy*s;rvy=vx*s+vy*c;}
      return {...latest,x:(Number(latest.x)||0)+dx,y:(Number(latest.y)||0)+dy,vx:rvx*decay,vy:rvy*decay,speed:(Number(latest.speed)||Math.hypot(vx,vy))*decay,angle:(Number(latest.angle)||0)+w*t,_extrapolated:true,_staleMs:ageMs};
    }
  }
  class NetworkClient extends EventTarget{
    constructor(){super();this.ws=null;this.session=null;this.room=null;this.status='disconnected';this.manual=false;this.backoff=600;this.reconnectSince=0;this.reconnectTimer=0;this.pingTimer=0;this.offset=0;this.rtt=0;this.buffers=new Map();this.lastSnapshotAt=0;this.seq=0;}
    setStatus(status,detail=''){if(this.status===status&& !detail)return;this.status=status;this.dispatchEvent(new CustomEvent('status',{detail:{status,detail}}));}
    async request(path,body,timeout=8000){
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);try{
        const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});let data={};try{data=await res.json();}catch{}
        if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';throw e;}return data;
      }catch(e){if(e.name==='AbortError'){e.code='TIMEOUT';}throw e;}finally{clearTimeout(timer);}
    }
    async create(name,settings,loadout){this.manual=false;this.setStatus('connecting');try{const data=await this.request('/api/rooms/create',{name,settings,loadout});this.session={kind:'room',code:data.code,playerId:data.playerId,token:data.sessionToken,name};this.room=data.room;this.connect();return data;}catch(e){this.setStatus('disconnected');throw e;}}
    async join(code,name,loadout){this.manual=false;this.setStatus('connecting');const clean=String(code||'').toUpperCase().replace(/\s+/g,'');try{const data=await this.request(`/api/rooms/${encodeURIComponent(clean)}/join`,{name,loadout});this.session={kind:'room',code:data.code,playerId:data.playerId,token:data.sessionToken,name};this.room=data.room;this.connect();return data;}catch(e){this.setStatus('disconnected');throw e;}}
    async joinMediaRace(code,name,loadout,spectator=false){this.manual=false;this.setStatus('connecting');const clean=String(code||'').toUpperCase().replace(/\s+/g,'');try{const data=await this.request(`/api/media/events/${encodeURIComponent(clean)}/join`,{name,loadout,spectator:!!spectator});this.session={kind:'media-race',code:data.code||clean,playerId:data.playerId,token:data.sessionToken,name,spectator:!!spectator};this.room=data.room;this.connect();return data;}catch(e){this.setStatus('disconnected');throw e;}}
    connect(){
      if(!this.session)return;clearTimeout(this.reconnectTimer);if(this.ws)try{this.ws.close();}catch{}
      const proto=location.protocol==='https:'?'wss:':'ws:',base=this.session.kind==='media-race'?`/api/media/events/${this.session.code}/ws`:`/api/rooms/${this.session.code}/ws`,u=`${proto}//${location.host}${base}?playerId=${encodeURIComponent(this.session.playerId)}&token=${encodeURIComponent(this.session.token)}`;
      this.setStatus(this.backoff>600?'reconnecting':'connecting');const ws=this.ws=new WebSocket(u);
      ws.onopen=()=>{if(ws!==this.ws)return;this.backoff=600;this.reconnectSince=0;this.setStatus('connected');this.startPing();};
      ws.onmessage=e=>this.onMessage(e.data);
      ws.onclose=e=>{if(ws!==this.ws)return;this.stopPing();this.ws=null;if(this.manual){this.setStatus('disconnected');return;}if(!this.reconnectSince)this.reconnectSince=Date.now();if(Date.now()-this.reconnectSince>30000){this.setStatus('disconnected',e.reason||'');return;}this.setStatus('reconnecting',e.reason||'');this.reconnectTimer=setTimeout(()=>this.connect(),this.backoff);this.backoff=Math.min(8000,Math.round(this.backoff*1.7));};
      ws.onerror=()=>{if(ws===this.ws)this.setStatus('reconnecting');};
    }
    startPing(){this.stopPing();this.ping();this.pingTimer=setInterval(()=>this.ping(),5000);}
    stopPing(){clearInterval(this.pingTimer);this.pingTimer=0;}
    ping(){this.send({type:'ping',v:1,clientTime:Date.now()});}
    onMessage(raw){
      let m;try{m=JSON.parse(raw);}catch{return;}if(!m||typeof m.type!=='string')return;
      if(m.type==='pong'&&Number.isFinite(m.clientTime)&&Number.isFinite(m.serverTime)){const recv=Date.now(),rtt=recv-m.clientTime,estimate=m.serverTime+rtt*.5;this.offset=this.offset*.7+(estimate-recv)*.3;this.rtt=this.rtt?this.rtt*.78+rtt*.22:rtt;}
      if((m.type==='hello'||m.type==='room_state'||m.type==='race_finish'||m.type==='race_cancelled')&&m.room)this.room=m.room;
      if(m.type==='hello'&&Number.isFinite(m.serverTime))this.offset=m.serverTime-Date.now();
      if(m.type==='player_state'&&m.playerId!==this.session?.playerId){let b=this.buffers.get(m.playerId);if(!b){b=new SnapshotBuffer();this.buffers.set(m.playerId,b);}b.push(m.state,m.serverTime||this.serverNow(),this.serverNow());}
      this.dispatchEvent(new CustomEvent('message',{detail:m}));
    }
    serverNow(){return Date.now()+this.offset;}
    send(obj){if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;try{this.ws.send(JSON.stringify(obj));return true;}catch{return false;}}
    sendState(raceId,state){const t=performance.now(),queued=this.ws?.bufferedAmount||0,every=queued>1024?90:48;if(t-this.lastSnapshotAt<every||!this.ws||this.ws.readyState!==WebSocket.OPEN||queued>4096)return false;this.lastSnapshotAt=t;return this.send({type:'player_state',v:1,raceId,state:{...state,seq:++this.seq,clientTime:Date.now()}});}
    finishRace(raceId,state){if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;const finalState={...state,seq:++this.seq,clientTime:Date.now(),finished:true};return this.send({type:'race_finish',v:1,raceId,state:finalState});}
    sample(playerId){const b=this.buffers.get(playerId);return b?.sample(this.serverNow()-b.playbackDelayMs)||null;}
    leave(){this.manual=true;this.reconnectSince=0;this.send({type:'leave',v:1});this.stopPing();clearTimeout(this.reconnectTimer);if(this.ws)try{this.ws.close(1000,'leave');}catch{}this.ws=null;this.session=null;this.room=null;this.buffers.clear();this.setStatus('disconnected');}
  }
  R.SnapshotBuffer=SnapshotBuffer;R.NetworkClient=NetworkClient;R.shortestAngleLerp=angleLerp;
})();
