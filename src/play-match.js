import { DurableObject } from 'cloudflare:workers';
import { quizLibraryRequest } from './quiz-library-actor.js';
import { makeMatch,advanceMatch,matchMove,matchView,fail } from './play-match-rules.js';
import {accept,identity,receive,send,socketError,closeSocket} from './play-sockets.js';
import {MatchReview,prepareAudioPool,audioManifest,loadedRounds,playbackView} from './play-integrity.js';
import {sealPlayAudio} from './play-media.js';
import {PLAY_AUDIO_PROTOCOL} from '../public/play-audio-format.js';
export class PlayMatch extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_state(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');this.reviewLog=new MatchReview(ctx.storage);}
  read(){const row=[...this.ctx.storage.sql.exec('SELECT data FROM match_state WHERE id=1')][0];return row?JSON.parse(row.data):null;}
  write(state){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO match_state VALUES(1,?)',JSON.stringify(state));}
  async initialize(id,format,players) {
    if(this.read())return;
    if(!this.initializing)this.initializing=(async()=>{const library=await quizLibraryRequest(this.env,'/play-sample',{mode:format==='ngmc-ranked'?'ngmc-ranked':'song-artist'});if(!library)fail('The song library is unavailable.',503);if(!this.read()){
      const state=makeMatch(id,format,players,library.songs);
      prepareAudioPool(state,library.decoys,true);
      await sealPlayAudio(state,this.env.HOST_TOKEN);
      this.reviewLog.initialize(state);this.reviewLog.add(state,'','created');this.write(state);
    }await this.schedule();})();
    try{await this.initializing;}finally{this.initializing=null;}
  }
  async schedule(){
    const state = this.read(), now = Date.now();
    if (!state) return;
    let next = state.until;
    if (state.mode === 'ngmc-ranked' && state.phase === 'loading' && state.counterDeadline > now)
      next = Math.min(next, state.counterDeadline);
    if (state.audioSealed && state.phase === 'guess' && state.startsAt > now)
      next = Math.min(next,state.startsAt);
    await this.ctx.storage.setAlarm(next);
  }
  broadcast(){const state=this.read();if(!state)return;for(const ws of this.ctx.getWebSockets()){const who=ws.deserializeAttachment();if(who.expires<=Date.now())ws.close(4003,'Session expired.');else send(ws,{type:'state',state:matchView(state,who.id)});}}
  async finish(state){
    if(!['finished','cancelled'].includes(state.phase))return;
    if(!state.reviewFinished){this.reviewLog.add(state,'','ended',{reason:state.reason||'',rounds:state.history.length});state.reviewFinished=true;this.write(state);}
    const ratings=await this.env.PLAY_QUEUE.getByName('play-queues-v1').complete(state.id,state.mode==='ngmc-ranked'?{mode:state.mode,players:state.players,history:state.history}:null,state.phase);
    if(ratings&&!state.ratings){state.ratings=ratings;this.write(state);this.broadcast();}
  }
  async fetch(request) {
    try {
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const who=identity(request),state=this.read();if(!state)fail('The match is preparing. Reconnect shortly.',503);
      matchView(state,who.id);
      const player=state.players.find(p=>p.id===who.id);player.loaded=[];player.ready=false;player.avatar=who.avatar||null;
      const supported = state.audioSealed ? [PLAY_AUDIO_PROTOCOL] : state.samplePositions ? [3, PLAY_AUDIO_PROTOCOL] : [2, 3, PLAY_AUDIO_PROTOCOL];
      if((state.audioPool || state.samplePositions) && !supported.includes(who.protocol))fail('Refresh Play to load the updated match player.',409);
      const historyLength=state.history.length;advanceMatch(state);if(state.history.length>historyLength)this.reviewLog.round(state);this.write(state);
      const {server,response}=accept(this.ctx,who);
      this.reviewLog.initialize(state);this.reviewLog.add(state,who.id,'connected');
      send(server,audioManifest(state));
      send(server,{type:'state',state:matchView(state,who.id)});try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return response;}await this.schedule();return response;
    } catch(error){return Response.json({error:error.status?error.message:'Unable to join match.'},{status:error.status||503});}
  }
  async webSocketMessage(ws,raw) {
    try{const input=receive(ws,raw);if(!input)return;
      if(input.message.type==='ping'){send(ws,{type:'pong',now:Date.now(),sentAt:Number(input.message.sentAt)||0});return;}
      const state=this.read();if(!state)fail('Match expired.',410);
      if (input.message.type === 'playback') {
        const player = state.players.find(p => p.id === input.who.id);
        if (state.audioSealed && player && input.message.index === state.index) {
          const { playback } = playbackView(state, player, Date.now());
          if (playback) send(ws, { type: 'playback', index: state.index, playback });
        }
        return;
      }
      if(input.message.type==='activity'){
        this.reviewLog.activity(state,input.who.id,input.message);return;
      }
      const before={index:state.index,phase:state.phase,startsAt:state.startsAt,historyLength:state.history.length,locked:state.players.find(p=>p.id===input.who.id)?.locked,field:state.players.find(p=>p.id===input.who.id)?.field},at=Date.now();
      let message=input.message;
      if(message.type==='loaded'){const indices=loadedRounds(state,message.indices);if(!indices)fail('Invalid download progress.');message={...message,indices};}
      let failure;
      try{matchMove(state,input.who.id,message,at);}catch(error){failure=error;}
      this.reviewLog.submission(state,input.who.id,input.message,before,failure,at);
      if(message.type==='unlock')this.reviewLog.add(state,input.who.id,'unlock',{accepted:!failure,requestedRound:message.index,error:failure?.message||null},at);
      if(failure)throw failure;
      if(state.history.length>before.historyLength)this.reviewLog.round(state,at);
      if(message.type==='skip')this.reviewLog.add(state,input.who.id,'skip-vote',{vote:message.vote});
      if(message.type==='leave')this.reviewLog.add(state,input.who.id,'left');
      if(before.phase!==state.phase||before.index!==state.index)this.reviewLog.add(state,'','phase',{startsAt:state.startsAt,until:state.until});
      this.write(state);if(message.type==='draft'&&before.phase===state.phase){send(ws,{type:'draft-saved',index:state.index});return;}this.broadcast();
      if(input.message.type==='leave'&&state.mode!=='ngmc-ranked')await this.env.PLAY_QUEUE.getByName('play-queues-v1').release(input.who.id,state.id);
      try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}await this.schedule();
    }catch(error){socketError(ws,error);}
  }
  review(options){return this.reviewLog.page(options);}
  webSocketClose(ws,code,reason){const state=this.read();if(state&&!['finished','cancelled'].includes(state.phase))this.reviewLog.add(state,ws.deserializeAttachment()?.id,'disconnected',{code});closeSocket(ws,code,reason);}
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){
    const state=this.read();
    // Old review-expiry alarms may still fire after deployment. Preserve the audit.
    if(!state)return;
    if(['finished','cancelled'].includes(state.phase)){
      try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}
      if(Date.now()<state.until){await this.schedule();return;}
      for(const ws of this.ctx.getWebSockets())ws.close(1000,'Match expired.');
      this.ctx.storage.sql.exec('DELETE FROM match_state');
      return;
    }
    const phase=state.phase,index=state.index,historyLength=state.history.length;advanceMatch(state);
    if(state.history.length>historyLength)this.reviewLog.round(state);
    if(phase!==state.phase||index!==state.index)this.reviewLog.add(state,'','phase',{startsAt:state.startsAt,until:state.until});
    this.write(state);this.broadcast();try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}await this.schedule();
  }
}
