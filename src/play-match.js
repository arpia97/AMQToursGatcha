import { DurableObject } from 'cloudflare:workers';
import { quizLibraryRequest } from './quiz-library-actor.js';
import { makeMatch,advanceMatch,matchMove,matchView,fail } from './play-match-rules.js';
import {accept,identity,receive,send,socketError} from './play-sockets.js';
export class PlayMatch extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_state(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');}
  read(){const row=[...this.ctx.storage.sql.exec('SELECT data FROM match_state WHERE id=1')][0];return row?JSON.parse(row.data):null;}
  write(state){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO match_state VALUES(1,?)',JSON.stringify(state));}
  async initialize(id,format,players) {
    if(this.read())return;
    if(!this.initializing)this.initializing=(async()=>{const library=await quizLibraryRequest(this.env,'/play-sample',{mode:format==='ngmc-ranked'?'ngmc-ranked':'song-artist'});if(!library)fail('The song library is unavailable.',503);if(!this.read())this.write(makeMatch(id,format,players,library.songs));await this.schedule();})();
    try{await this.initializing;}finally{this.initializing=null;}
  }
  async schedule(){const s=this.read();if(s)await this.ctx.storage.setAlarm(s.mode==='ngmc-ranked'&&s.phase==='loading'&&s.counterDeadline>Date.now()?Math.min(s.until,s.counterDeadline):s.until);}
  broadcast(){const state=this.read();if(!state)return;for(const ws of this.ctx.getWebSockets()){const who=ws.deserializeAttachment();if(who.expires<=Date.now())ws.close(4003,'Session expired.');else send(ws,{type:'state',state:matchView(state,who.id)});}}
  async finish(state){
    if(!['finished','cancelled'].includes(state.phase))return;
    const ratings=await this.env.PLAY_QUEUE.getByName('play-queues-v1').complete(state.id,state.mode==='ngmc-ranked'?{mode:state.mode,players:state.players,history:state.history}:null);
    if(ratings&&!state.ratings){state.ratings=ratings;this.write(state);this.broadcast();}
  }
  async fetch(request) {
    try {
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const who=identity(request),state=this.read();if(!state)fail('The match is preparing. Reconnect shortly.',503);
      matchView(state,who.id);
      const player=state.players.find(p=>p.id===who.id);player.loaded=[];player.ready=false;player.avatar=who.avatar||null;
      advanceMatch(state);this.write(state);
      const {server,response}=accept(this.ctx,who);
      send(server,{type:'manifest',id:state.id,mode:state.mode||'song-artist',preload:state.mode==='ngmc-ranked'?12:10,audio:state.songs.map(s=>s.audio)});
      send(server,{type:'state',state:matchView(state,who.id)});try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return response;}await this.schedule();return response;
    } catch(error){return Response.json({error:error.status?error.message:'Unable to join match.'},{status:error.status||503});}
  }
  async webSocketMessage(ws,raw) {
    try{const input=receive(ws,raw);if(!input)return;
      if(input.message.type==='ping'){send(ws,{type:'pong',now:Date.now(),sentAt:Number(input.message.sentAt)||0});return;}
      const state=this.read();if(!state)fail('Match expired.',410);
      matchMove(state,input.who.id,input.message);this.write(state);this.broadcast();
      if(input.message.type==='leave'&&state.mode!=='ngmc-ranked')await this.env.PLAY_QUEUE.getByName('play-queues-v1').release(input.who.id,state.id);
      try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}await this.schedule();
    }catch(error){socketError(ws,error);}
  }
  webSocketClose(ws,code,reason){ws.close(code,reason);}
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){const state=this.read();if(!state)return;if(['finished','cancelled'].includes(state.phase)){try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}if(Date.now()<state.until){await this.schedule();return;}for(const ws of this.ctx.getWebSockets())ws.close(1000,'Match expired.');await this.ctx.storage.deleteAll();return;}advanceMatch(state);this.write(state);this.broadcast();try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}await this.schedule();}
}
