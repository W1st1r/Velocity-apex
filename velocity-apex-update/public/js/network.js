(function(){
  'use strict';
  const R=window.Racing=window.Racing||{};
  const TAU=Math.PI*2;
  const lerp=(a,b,t)=>a+(b-a)*t;
  const angleLerp=(a,b,t)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return a+d*t;};
  class SnapshotBuffer{
    constructor(){this.items=[];this.last=null;}
    push(state,serverTime){
      if(!state||!Number.isFinite(serverTime))return;
      const item={...state,serverTime};if(this.last&&item.seq<=this.last.seq)return;
      if(this.last&&Number.isFinite(item.x)&&Number.isFinite(item.y)&&Number.isFinite(this.last.x)&&Number.isFinite(this.last.y)&&Math.hypot(item.x-this.last.x,item.y-this.last.y)>720)this.items.length=0;
      this.last=item;this.items.push(item);if(this.items.length>16)this.items.splice(0,this.items.length-16);
    }
    sample(targetTime){
      const a=this.items;if(!a.length)return null;
      while(a.length>2&&a[1].serverTime<targetTime-250)a.shift();
      let before=null,after=null;for(const s of a){if(s.serverTime<=targetTime)before=s;if(s.serverTime>=targetTime){after=s;break;}}
      if(before&&after&&after!==before){const t=Math.max(0,Math.min(1,(targetTime-before.serverTime)/Math.max(1,after.serverTime-before.serverTime)));return SnapshotBuffer.mix(before,after,t);}
      const latest=a[a.length-1],age=targetTime-latest.serverTime;
      if(age>0&&age<=140){const dt=age/1000;return {...latest,x:latest.x+latest.vx*dt,y:latest.y+latest.vy*dt,angle:latest.angle+(latest.yawRate||0)*dt};}
      return latest;
    }
    static mix(a,b,t){
      const out={...b};for(const k of ['x','y','vx','vy','speed','yawRate','progress','steer','throttle','brake'])if(Number.isFinite(a[k])&&Number.isFinite(b[k]))out[k]=lerp(a[k],b[k],t);
      out.angle=angleLerp(a.angle,b.angle,t);out.laps=t<.5?a.laps:b.laps;out.checkpoint=t<.5?a.checkpoint:b.checkpoint;return out;
    }
  }
  class NetworkClient extends EventTarget{
    constructor(){super();this.ws=null;this.session=null;this.room=null;this.status='disconnected';this.manual=false;this.backoff=600;this.reconnectSince=0;this.reconnectTimer=0;this.pingTimer=0;this.offset=0;this.buffers=new Map();this.lastSnapshotAt=0;this.seq=0;}
    setStatus(status,detail=''){if(this.status===status&& !detail)return;this.status=status;this.dispatchEvent(new CustomEvent('status',{detail:{status,detail}}));}
    async request(path,body,timeout=8000){
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);try{
        const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});let data={};try{data=await res.json();}catch{}
        if(!res.ok){const e=new Error(data.error||'SERVER_ERROR');e.code=data.error||'SERVER_ERROR';throw e;}return data;
      }catch(e){if(e.name==='AbortError'){e.code='TIMEOUT';}throw e;}finally{clearTimeout(timer);}
    }
    async create(name,settings,loadout){this.manual=false;this.setStatus('connecting');try{const data=await this.request('/api/rooms/create',{name,settings,loadout});this.session={code:data.code,playerId:data.playerId,token:data.sessionToken,name};this.room=data.room;this.connect();return data;}catch(e){this.setStatus('disconnected');throw e;}}
    async join(code,name,loadout){this.manual=false;this.setStatus('connecting');const clean=String(code||'').toUpperCase().replace(/\s+/g,'');try{const data=await this.request(`/api/rooms/${encodeURIComponent(clean)}/join`,{name,loadout});this.session={code:data.code,playerId:data.playerId,token:data.sessionToken,name};this.room=data.room;this.connect();return data;}catch(e){this.setStatus('disconnected');throw e;}}
    connect(){
      if(!this.session)return;clearTimeout(this.reconnectTimer);if(this.ws)try{this.ws.close();}catch{}
      const proto=location.protocol==='https:'?'wss:':'ws:',u=`${proto}//${location.host}/api/rooms/${this.session.code}/ws?playerId=${encodeURIComponent(this.session.playerId)}&token=${encodeURIComponent(this.session.token)}`;
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
      if(m.type==='pong'&&Number.isFinite(m.clientTime)&&Number.isFinite(m.serverTime)){const recv=Date.now(),rtt=recv-m.clientTime,estimate=m.serverTime+rtt*.5;this.offset=this.offset*.7+(estimate-recv)*.3;}
      if((m.type==='hello'||m.type==='room_state'||m.type==='race_finish'||m.type==='race_cancelled')&&m.room)this.room=m.room;
      if(m.type==='hello'&&Number.isFinite(m.serverTime))this.offset=m.serverTime-Date.now();
      if(m.type==='player_state'&&m.playerId!==this.session?.playerId){let b=this.buffers.get(m.playerId);if(!b){b=new SnapshotBuffer();this.buffers.set(m.playerId,b);}b.push(m.state,m.serverTime||Date.now());}
      this.dispatchEvent(new CustomEvent('message',{detail:m}));
    }
    serverNow(){return Date.now()+this.offset;}
    send(obj){if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;try{this.ws.send(JSON.stringify(obj));return true;}catch{return false;}}
    sendState(raceId,state){const t=performance.now();if(t-this.lastSnapshotAt<52||!this.ws||this.ws.readyState!==WebSocket.OPEN||this.ws.bufferedAmount>32768)return false;this.lastSnapshotAt=t;return this.send({type:'player_state',v:1,raceId,state:{...state,seq:++this.seq,clientTime:Date.now()}});}
    finishRace(raceId,state){if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;const finalState={...state,seq:++this.seq,clientTime:Date.now(),finished:true};return this.send({type:'race_finish',v:1,raceId,state:finalState});}
    sample(playerId){return this.buffers.get(playerId)?.sample(this.serverNow()-100)||null;}
    leave(){this.manual=true;this.reconnectSince=0;this.send({type:'leave',v:1});this.stopPing();clearTimeout(this.reconnectTimer);if(this.ws)try{this.ws.close(1000,'leave');}catch{}this.ws=null;this.session=null;this.room=null;this.buffers.clear();this.setStatus('disconnected');}
  }
  R.SnapshotBuffer=SnapshotBuffer;R.NetworkClient=NetworkClient;R.shortestAngleLerp=angleLerp;
})();
