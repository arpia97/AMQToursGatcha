import {DUEL_FORMAT, duelRules} from '../public/play-mode-rules.js';
import {ARENA_FORMAT} from '../public/play-arena-config.js';
import {arenaSongCount} from './play-arena.js';
import {ReviewHighlights} from './play-review-highlights.js';
import {matchCreditPlan} from './play-rewards.js';
import {matchRecords,archivedRecords} from './play-records.js';
import { DurableObject } from 'cloudflare:workers';
import { quizLibraryRequest } from './quiz-library-actor.js';
import { makeMatch,advanceMatch,matchMove,matchView,fail } from './play-match-rules.js';
import {accept,identity,receive,send,socketError,closeSocket} from './play-sockets.js';
import {MatchReview,decoyHits,prepareAudioPool,audioManifest,loadedRounds,playbackView} from './play-integrity.js';
import {sealPlayAudio,verifiedClipFailure} from './play-media.js';
import {activeRankedGame,RECONNECT_MS} from '../public/ngmc-leave-policy.js';
import {ngmcRatings} from './ngmc-ratings.js';
import {PLAY_AUDIO_PROTOCOL} from '../public/play-audio-format.js';
export class PlayMatch extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_state(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');this.reviewLog=new MatchReview(ctx.storage);this.highlights=new ReviewHighlights(ctx.storage);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS reported_leaves(player TEXT PRIMARY KEY)');}
  read(){const row=[...this.ctx.storage.sql.exec('SELECT data FROM match_state WHERE id=1')][0];return row?JSON.parse(row.data):null;}
  write(state){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO match_state VALUES(1,?)',JSON.stringify(state));}
  async initialize(id,format,players,lobby=null,pool=lobby?.pool||'random') {
    if(this.read())return;
    if(!this.initializing)this.initializing=(async()=>{
      let watched=null;
      if(pool==='watched'){
        watched=await this.env.GAME.getByName('amqtours-economy-v1').watchedAnimeLists(players.map(p=>p.id));
        if(!watched.some(list=>list.ids.length))return {setupError:'Import a MAL or AniList list in Play Settings before playing Watched.'};
      }
      const sampleMode=format==='lobby-ngmc'||format.startsWith('ngmc-')?'ngmc-ranked':
        format===ARENA_FORMAT?ARENA_FORMAT:'song-artist';
      let library;
      try{
        library=await quizLibraryRequest(this.env,'/play-sample',{mode:sampleMode,count:format===ARENA_FORMAT?arenaSongCount(players.length):format===DUEL_FORMAT?duelRules.songs:lobby?.songs,watched});
      }catch(error){
        if(watched && (error.status===422 || error.message==='Not enough playable NGMC songs.'))return {setupError:error.status===422?error.message:'Too few playable NGMC songs on the Watched lists.'};
        throw error;
      }
      if(!library)fail('The song library is unavailable.',503);if(!this.read()){
      const state=makeMatch(id,format,players,library.songs,Date.now(),lobby);
      state.pool=pool;
      prepareAudioPool(state,library.decoys,true);
      await sealPlayAudio(state,this.env.HOST_TOKEN);
      if(watched)this.ctx.storage.sql.exec('INSERT OR REPLACE INTO match_state(id,data) VALUES(2,?)',JSON.stringify(watched));
      this.reviewLog.initialize(state);this.reviewLog.add(state,'','created');this.write(state);
    }await this.schedule();})();
    try{return await this.initializing;}finally{this.initializing=null;}
  }
  pendingRankedLeaves(state){
    if(!state.players.some(p=>p.rankedLeftAt!=null))return [];
    const sent=new Set([...this.ctx.storage.sql.exec('SELECT player FROM reported_leaves')].map(r=>r.player));
    return state.players.filter(p=>p.rankedLeftAt!=null&&!sent.has(p.id));
  }
  async reportRankedLeaves(state){
    for(const p of this.pendingRankedLeaves(state)){
      const queue=this.env.PLAY_QUEUE.getByName('play-queues-v1');
      if(state.format==='ngmc-ranked')await queue.recordRankedLeave(state.id,p.id,p.rankedLeftAt,state.pool);
      else await queue.recordSongReadyLeave(state.id,state.format,p.id,p.name,p.rankedLeftAt,state.pool);
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO reported_leaves VALUES(?)',p.id);
    }
  }
  async reportInactivityBans(state){
    // Match state retains the deadline. Queue writes are safe to repeat after a restart or a lost response.
    const reported=this.reportedInactivity??=new Set();
    const bans=state.players.filter(p=>p.inactivityBanUntil&&!reported.has(p.id));
    if(!bans.length)return;
    await this.env.PLAY_QUEUE.getByName('play-queues-v1').recordInactivityBans(
      bans.map(({id,inactivityBanUntil})=>({player:id,until:inactivityBanUntil})),
    );
    for(const {id} of bans)reported.add(id);
  }
  async schedule(){
    const state = this.read(), now = Date.now();
    if (!state) return;
    let next = this.pendingRankedLeaves(state).length?Math.min(now+1000,state.until):state.until;
    if(state.phase==='loading'&&state.readyDeadline&&state.players.some(p=>!p.left&&!p.acceptedReady&&!p.ready))next=Math.min(next,state.readyDeadline);
    if (state.mode === 'ngmc-ranked' && state.phase === 'loading' && state.counterDeadline > now)
      next = Math.min(next, state.counterDeadline);
    if (state.audioSealed && state.phase === 'guess' && state.startsAt > now)
      next = Math.min(next,state.startsAt);
    if(state.arena||activeRankedGame(state,now))for(const p of state.players){
      if(!p.left&&p.disconnectedAt!=null)next=Math.min(next,p.disconnectedAt+RECONNECT_MS);
    }
    if (['finished','cancelled'].includes(state.phase) && !this.ctx.storage.sql.exec('SELECT 1 FROM review_meta WHERE id=4').toArray().length)
      next=Math.min(next,now+2000);
    await this.ctx.storage.setAlarm(Math.min(next,now+86400000));
  }
  broadcast(){const state=this.read();if(!state)return;for(const ws of this.ctx.getWebSockets()){const who=ws.deserializeAttachment();if(who.expires<=Date.now())ws.close(4003,'Session expired.');else send(ws,{type:'state',state:matchView(state,who.id)});}}
  async finish(state){
    if(state.players.some(p=>p.inactivityBanUntil&&!this.reportedInactivity?.has(p.id)))
      await this.reportInactivityBans(state);
    if(!['finished','cancelled'].includes(state.phase))return;
    if(state.rankingsSettled)return;
    if(!state.reviewFinished){state.recordSongRating=true;this.reviewLog.add(state,'','ended',{reason:state.reason||'',rounds:state.history.length});state.reviewFinished=true;this.write(state);}
    const result={
      mode:state.mode,format:state.format,pool:state.pool||state.lobby?.pool,records:matchRecords(state),
      players:state.players.map(({id,name,elo,rankedLeftAt})=>({id,name,elo,rankedLeftAt})),
      history:state.history.map(round=>({results:round.results.map(({id,earned})=>({id,earned}))}))
    };
    const legacy=state.mode!=='ngmc-ranked'&&!state.recordSongRating;
    const ratings=await this.env.PLAY_QUEUE.getByName('play-queues-v1').complete(state.id,legacy?null:result,state.phase);
    if(ratings)state.ratings=ratings;
    // Previously completed unranked rooms can reopen in any order.
    if(legacy&&state.phase==='finished')state.ratings=ngmcRatings(result.players.map(p=>({...p,elo:1000})),result.history);
    const creditPlan=matchCreditPlan(state);
    if(creditPlan?.length){
      const completedRounds=state.arena?.rounds.filter(round=>round.every(fixture=>fixture.complete)).length;
      state.creditRewards=await this.env.GAME.getByName('amqtours-economy-v1')
        .awardPlayMatchCredits(state.id,state.format,creditPlan,completedRounds);
    }
    state.rankingsSettled=true;
    this.write(state);
    this.broadcast();
  }
  async depart(id){
    const state=this.read();
    if(!state?.lobby||['finished','cancelled'].includes(state.phase))return;
    const player=state.players.find(p=>p.id===id);
    if(!player||player.left)return;
    matchMove(state,id,{type:'leave'});this.write(state);this.broadcast();
    await this.schedule();await this.finish(state);
  }
  async fetch(request) {
    try {
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const who=identity(request),state=this.read();if(!state)fail('The match is preparing. Reconnect shortly.',503);
      matchView(state,who.id);
      const player=state.players.find(p=>p.id===who.id);
      const reconnectAt=Date.now();if(player.disconnectedAt!=null&&(!state.arena&&!activeRankedGame(state,reconnectAt)||reconnectAt-player.disconnectedAt<RECONNECT_MS))delete player.disconnectedAt;
      player.loaded=[];player.ready=false;player.avatar=who.avatar||null;
      const supported = state.audioSealed ? [PLAY_AUDIO_PROTOCOL] : state.samplePositions ? [3, PLAY_AUDIO_PROTOCOL] : [2, 3, PLAY_AUDIO_PROTOCOL];
      if((state.audioPool || state.samplePositions) && !supported.includes(who.protocol))fail('Refresh Play to load the updated match player.',409);
      const historyLength=state.history.length;advanceMatch(state);if(state.history.length>historyLength)this.reviewLog.round(state);this.write(state);
      const {server,response}=accept(this.ctx,who);
      this.reviewLog.initialize(state);this.reviewLog.add(state,who.id,'connected');
      // A long custom match may outlive the original download tickets. Renew only
    // this connection's manifest, retaining the keys for already buffered audio.
    const mediaState=state.lobby&&state.audioSealed&&Date.now()-state.created>=2*3600000
      ? {...state,audioPool:state.audioPool.map(entry=>({...entry}))} : state;
    if(mediaState!==state)await sealPlayAudio(mediaState,this.env.HOST_TOKEN,Date.now());
    send(server,audioManifest(mediaState));
      send(server,{type:'state',state:matchView(state,who.id)});try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return response;}await this.schedule();return response;
    } catch(error){return Response.json({error:error.status?error.message:'Unable to join match.'},{status:error.status||503});}
  }
  async repairAudio(id, message) {
    // Serialize repairs so two failed slots cannot draw the same replacement.
    while(this.audioRepair)await this.audioRepair.catch(()=>{});
    const state=this.read(),slot=message.slot;
    if(!Number.isInteger(slot)||!state?.audioSealed||!state.players.some(p=>p.id===id&&!p.left))return;
    const entry=state.audioPool[slot];
    const replaceable=s=>!['finished','cancelled'].includes(s.phase)&&(entry.round!==s.index||['loading','buffering'].includes(s.phase));
    if(!entry||(state.audioRevision||0)!==(message.revision||0)||!replaceable(state))return;
    const repair=(async()=>{
      if(!await verifiedClipFailure(this.env.HOST_TOKEN,entry.key,message.proof))return;
      if((entry.replacements||0)>=4)fail('Several replacement recordings are unavailable. Retry audio shortly.',503);
      const exclude=[...state.audioPool.map(e=>e.audio),...(state.failedAudio||[])];
      const snapshot=this.ctx.storage.sql.exec('SELECT data FROM match_state WHERE id=2').toArray()[0];
      const watched=snapshot?JSON.parse(snapshot.data):null;
      const excludeAnime=watched&&entry.round!==null?state.songs.filter((_,index)=>index!==entry.round).map(song=>song.annId).filter(Boolean):[];
      const library=await quizLibraryRequest(this.env,'/play-sample',{mode:state.mode,count:1,exclude,watched,excludeAnime});
      const song=library?.songs[0];
      if(!song)fail('No replacement audio is available yet.',503);
      const next={round:entry.round,audio:song.audio,replacements:(entry.replacements||0)+1};
      await sealPlayAudio({mode:state.mode,audioPool:[next],samplePositions:state.samplePositions},this.env.HOST_TOKEN,Date.now());
      // Timers, departures, answers and load acknowledgments can advance during I/O.
      const live=this.read();
      if(!live||live.audioPool[slot]?.key!==entry.key||!replaceable(live))return;
      if(entry.round===null){
        const i=live.decoys.findIndex(s=>s.audio===entry.audio);
        if(i>=0)live.decoys[i]=song;
      }else if(entry.round>=live.index)live.songs[entry.round]=song; // Past rounds keep their original answers and scores.
      (live.failedAudio??=[]).push(entry.audio);
      live.audioPool[slot]=next;
      live.audioRevision=(live.audioRevision||0)+1;
      for(const p of live.players)p.loaded=p.loaded.filter(index=>index!==slot);
      if(['loading','buffering'].includes(live.phase))live.until=Math.max(live.until,Date.now()+60000);
      this.write(live);
      for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment().expires>Date.now())send(ws,{type:'audio-replaced',slot,ticket:next.ticket,revision:live.audioRevision});
      this.broadcast();await this.schedule();return true;
    })();
    this.audioRepair=repair;
    try{return await repair;}finally{if(this.audioRepair===repair)this.audioRepair=null;}
  }
  async webSocketMessage(ws,raw) {
    try{const input=receive(ws,raw);if(!input)return;
      if(input.message.type==='ping'){send(ws,{type:'pong',now:Date.now(),sentAt:Number(input.message.sentAt)||0});return;}
      const state=this.read();if(!state)fail('Match expired.',410);
      if(input.message.type==='audio-failed'){
        if(!await this.repairAudio(input.who.id,input.message))send(ws,{type:'audio-retry',revision:input.message.revision});
        return;
      }
      if(input.message.type==='loaded'&&(input.message.revision??0)!==(state.audioRevision||0)){
        if(input.message.revision===undefined)send(ws,{type:'error',message:'Reload Play to receive the replacement song.'});
        return;
      }
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
      if(['propose','vote','withdraw','return-vote','return-request'].includes(message.type)){
        const proposal=message.type==='propose'&&!failure;
        this.reviewLog.add({...state,index:before.index,phase:before.phase},input.who.id,message.type,{
          field:message.field,answer:message.answer,choice:message.choice,yes:message.yes,accepted:!failure,
          ...(proposal?{elapsedMs:at-before.startsAt,flags:decoyHits(state,{[message.field]:message.answer})}:{})
        },at);
      }
      if(message.type==='unlock')this.reviewLog.add(state,input.who.id,'unlock',{accepted:!failure,requestedRound:message.index,error:failure?.message||null},at);
      if(failure)throw failure;
      if(state.history.length>before.historyLength)this.reviewLog.round(state,at);
      if(message.type==='skip')this.reviewLog.add(state,input.who.id,'skip-vote',{vote:message.vote});
      if(message.type==='leave')this.reviewLog.add(state,input.who.id,'left');
      if(before.phase!==state.phase||before.index!==state.index)this.reviewLog.add(state,'','phase',{startsAt:state.startsAt,until:state.until});
      this.write(state);if(message.type==='draft'&&before.phase===state.phase){send(ws,{type:'draft-saved',index:state.index});return;}this.broadcast();
      if(input.message.type==='leave'){
        // Record the queue lock before releasing a departed player's match slot.
        try{await this.reportInactivityBans(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}
      }
      if(input.message.type==='leave'&&['ngmc-ranked',DUEL_FORMAT].includes(state.format)){
        const departed=state.players.find(p=>p.id===input.who.id);
        if(departed.rankedLeftAt!=null){await this.schedule();await this.reportRankedLeaves(state);}
        else if(departed.left)await this.env.PLAY_QUEUE.getByName('play-queues-v1').release(departed.id,state.id);
      }
      else if(input.message.type==='leave')await this.env.PLAY_QUEUE.getByName('play-queues-v1').release(input.who.id,state.id);
      try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}await this.schedule();
    }catch(error){socketError(ws,error);}
  }
  historicalRecords(format,ratings){
    const state=this.read();
    return state?.phase==='finished'?matchRecords(state):archivedRecords(this.ctx.storage.sql,format,ratings);
  }
  async indexHighlights(match){
    const pending=this.highlights.advance();
    const count=this.highlights.count();
    if(!pending && count){
      const published=this.ctx.storage.sql.exec('SELECT data FROM review_meta WHERE id=5').toArray()[0];
      if(Number(published?.data)!==count){
        await this.env.PLAY_QUEUE.getByName('play-queues-v1').indexHighlights(match,count);
        this.ctx.storage.sql.exec('INSERT OR REPLACE INTO review_meta VALUES(5,?,0)',String(count));
      }
    }
    return pending;
  }
  async review(options){
    const detail=this.reviewLog.page(options);
    if(detail)detail.assessment=this.ctx.storage.sql.exec("SELECT data FROM review_meta WHERE id=2").toArray().map(r=>JSON.parse(r.data))[0]||null;
    if(detail && options.view==='highlights'){
      const pending=await this.indexHighlights(detail.id);
      detail.highlights={pending,total:this.highlights.count(),...this.highlights.list(options.player,options.offset)};
    }
    return detail;
  }
  saveReview(value){
    if(!this.ctx.storage.sql.exec("SELECT 1 FROM review_meta WHERE id=1").toArray().length)fail("Match review unavailable.",404);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO review_meta VALUES(2,?,0)",JSON.stringify(value));
    return value;
  }
  async webSocketClose(ws,code,reason){
    const state=this.read(),id=ws.deserializeAttachment()?.id,now=Date.now();
    if(state&&!['finished','cancelled'].includes(state.phase)){
      this.reviewLog.add(state,id,'disconnected',{code});
      const p=state.players.find(p=>p.id===id);
      if(p&&!p.left&&(!state.lobby||state.arena)&&!this.ctx.getWebSockets(id).some(other=>other!==ws&&other.readyState===1)){
        p.disconnectedAt??=now;this.write(state);await this.schedule();
      }
    }
    closeSocket(ws,code,reason);
  }
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){
    const state=this.read();
    // Old review-expiry alarms may still fire after deployment. Preserve the audit.
    if(!state)return;
    if(this.pendingRankedLeaves(state).length){
      try{await this.reportRankedLeaves(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}
      return this.schedule();
    }
    if(['finished','cancelled'].includes(state.phase)){
      try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}
      if(!this.ctx.storage.sql.exec('SELECT 1 FROM review_meta WHERE id=4').toArray().length){
        if(await this.indexHighlights(state.id)){await this.ctx.storage.setAlarm(Date.now()+1000);return;}
        this.ctx.storage.sql.exec("INSERT OR REPLACE INTO review_meta VALUES(4,'true',0)");
      }
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
