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
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const sql=ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS match_state(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');
    this.reviewLog=new MatchReview(ctx.storage);this.highlights=new ReviewHighlights(ctx.storage);
    sql.exec('CREATE TABLE IF NOT EXISTS reported_leaves(player TEXT PRIMARY KEY)');
    sql.exec('CREATE TABLE IF NOT EXISTS room_chat(seq INTEGER PRIMARY KEY, player TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL)');
  }
  chatHistory(){
    return this.ctx.storage.sql.exec('SELECT * FROM room_chat ORDER BY seq').toArray();
  }
  chatMessage(ws,state,who,body){
    const member=state.players.find(p=>p.id===who.id&&!p.left);
    const message=typeof body==='string'?body.trim():'';
    if(!member||!message||message.length>220){send(ws,{type:'chat-error',message:'Message could not be sent.'});return;}
    const sql=this.ctx.storage.sql,now=Date.now();
    if(sql.exec('SELECT COUNT(*) AS n FROM room_chat WHERE player=? AND at>?',who.id,now-2000).one().n>=4){
      send(ws,{type:'chat-error',message:'Give the chat a moment before sending again.'});return;
    }
    const row=sql.exec('INSERT INTO room_chat(player,body,at) VALUES(?,?,?) RETURNING *',who.id,message,now).one();
    sql.exec('DELETE FROM room_chat WHERE seq<=?',row.seq-80);
    for(const socket of this.ctx.getWebSockets()){
      const recipient=socket.deserializeAttachment();
      if(recipient?.expires>now&&state.players.some(p=>p.id===recipient.id&&!p.left))send(socket,{type:'chat-message',row});
    }
  }
  read(){const row=[...this.ctx.storage.sql.exec('SELECT data FROM match_state WHERE id=1')][0];return row?JSON.parse(row.data):null;}
  write(state){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO match_state VALUES(1,?)',JSON.stringify(state));}
  async initialize(id,format,players,lobby=null,pool=lobby?.pool||'random',deadline=Date.now()+180000) {
    if(this.read()){await this.schedule();return;}
    if(this.initializing)return this.initializing;
    const expired={setupError:'Song selection timed out. Please start matchmaking or your lobby again.'};
    if(deadline<=Date.now())return expired;
    let timer;
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve(expired),deadline-Date.now());});
    this.initializing=Promise.race([this.buildOpening(id,format,players,lobby,pool),timeout]).then(async opening=>{
      if(opening.setupError)return opening;
      if(Date.now()>=deadline)return expired;
      const {state,watched}=opening;
      if(watched)this.ctx.storage.sql.exec('INSERT OR REPLACE INTO match_state(id,data) VALUES(2,?)',JSON.stringify(watched));
      this.reviewLog.initialize(state);this.reviewLog.add(state,'','created');this.write(state);
      await this.schedule();
    }).finally(()=>{clearTimeout(timer);this.initializing=null;});
    return this.initializing;
  }
  async buildOpening(id,format,players,lobby,pool){
    let watched=null;
    if(pool==='watched'){
      watched=await this.env.GAME.getByName('amqtours-economy-v1').watchedAnimeLists(players.map(p=>p.id));
      if(!watched.some(list=>list.ids.length))return {setupError:'Import a MAL or AniList list in Play Settings before playing Watched.'};
    }
    const sampleMode=format==='lobby-ngmc'||format.startsWith('ngmc-')?'ngmc-ranked':
      format===ARENA_FORMAT?ARENA_FORMAT:'song-artist';
    let library;
    try{
      library=await quizLibraryRequest(this.env,'/play-sample',{matchId:id,mode:sampleMode,count:format===ARENA_FORMAT?arenaSongCount(players.length):format===DUEL_FORMAT?duelRules.songs:lobby?.songs,watched});
    }catch(error){
      if(watched && (error.status===422 || error.message==='Not enough playable NGMC songs.'))return {setupError:error.status===422?error.message:'Too few playable NGMC songs on the Watched lists.'};
      throw error;
    }
    if(!library)fail('The song library is unavailable.',503);
    const state=makeMatch(id,format,players,library.songs,Date.now(),lobby);
    state.pool=pool;state.syncPlayback=true;
    prepareAudioPool(state,library.decoys,true);
    await sealPlayAudio(state,this.env.HOST_TOKEN);
    return {state,watched};
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
    if (['finished','cancelled'].includes(state.phase) && (!state.rankingsSettled || !this.ctx.storage.sql.exec('SELECT 1 FROM review_meta WHERE id=4').toArray().length))
      next=Math.min(next,now+2000);
    await this.ctx.storage.setAlarm(Math.min(next,now+86400000));
  }
  broadcast(state=this.read()){
    if(!state)return;
    const now=Date.now();
    for(const ws of this.ctx.getWebSockets()){
      const who=ws.deserializeAttachment();
      if(who.expires<=now)ws.close(4003,'Session expired.');
      else send(ws,{type:'state',state:matchView(state,who.id,now,who.compactHistory)});
    }
  }
  async finish(state){
    if(!['finished','cancelled'].includes(state.phase))return;
    if(this.finishing)return this.finishing;
    state=this.read();
    if(!state||state.rankingsSettled)return;
    this.finishing=this.finishSteps(state).finally(()=>{this.finishing=null;});
    return this.finishing;
  }
  async finishSteps(state){
    if(!state.reviewFinished){state.recordSongRating=true;this.reviewLog.add(state,'','ended',{reason:state.reason||'',rounds:state.history.length});state.reviewFinished=true;this.write(state);}
    await this.ctx.storage.setAlarm(Date.now()+5000);
    const checkpoint=(step,values)=>{
      const live=this.read();
      Object.assign(live,values,{[step]:true});
      live.rankingsSettled=!!(live.ratingsDone&&live.creditsDone);
      this.write(live);
      this.broadcast(live);
    };
    const jobs=[];
    if(!state.ratingsDone)jobs.push(this.finishRatings(state).then(values=>checkpoint('ratingsDone',values)));
    if(!state.creditsDone)jobs.push(this.finishCredits(state).then(values=>checkpoint('creditsDone',values)));
    const results=await Promise.allSettled(jobs);
    const failure=results.find(result=>result.status==='rejected');
    if(failure){
      console.error('Play match settlement will retry',state.id,failure.reason?.name);
      throw failure.reason;
    }
  }
  async finishRatings(state){
    if(state.aborted){
      await this.env.PLAY_QUEUE.getByName('play-queues-v1').complete(state.id,null,'cancelled');
      return {};
    }
    const participation=state.completed&&!state.lobby
      ? state.players.filter(p=>!p.left&&p.rankedLeftAt==null&&typeof p.answeredMatch==='boolean')
        .map(({id,answeredMatch})=>({id,answered:answeredMatch}))
      : [];
    const result={
      mode:state.mode,format:state.format,pool:state.pool||state.lobby?.pool,records:matchRecords(state),participation,
      players:state.players.map(({id,name,elo,rankedLeftAt})=>({id,name,elo,rankedLeftAt})),
      history:state.history.map(round=>({results:round.results.map(({id,earned})=>({id,earned}))}))
    };
    const legacy=state.mode!=='ngmc-ranked'&&!state.recordSongRating;
    let ratings=await this.env.PLAY_QUEUE.getByName('play-queues-v1').complete(state.id,legacy?null:result,state.phase);
    // Previously completed unranked rooms can reopen in any order.
    if(legacy&&state.phase==='finished')ratings=ngmcRatings(result.players.map(p=>({...p,elo:1000})),result.history);
    return ratings?{ratings}:{};
  }
  async finishCredits(state){
    const creditPlan=matchCreditPlan(state);
    if(creditPlan?.length){
      const completedRounds=state.arena?.rounds.filter(round=>round.every(fixture=>fixture.complete)).length;
      const creditRewards=await this.env.GAME.getByName('amqtours-economy-v1')
        .awardPlayOutcomeCredits(state.id,state.format,creditPlan,completedRounds);
      return {creditRewards};
    }
    return {};
  }
  async depart(id){
    const state=this.read();
    if(!state?.lobby||['finished','cancelled'].includes(state.phase))return;
    const player=state.players.find(p=>p.id===id);
    if(!player||player.left)return;
    matchMove(state,id,{type:'leave'});this.write(state);this.broadcast(state);
    await this.schedule();await this.finish(state);
  }
  async fetch(request) {
    try {
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const who=identity(request),state=this.read();if(!state)fail('The match is preparing. Reconnect shortly.',503);
      const player=state.players.find(p=>p.id===who.id);
      if(!player)fail('You are not in this match.',403);
      if(!['finished','cancelled'].includes(state.phase)){
        const reconnectAt=Date.now();if(player.disconnectedAt!=null&&(!state.arena&&!activeRankedGame(state,reconnectAt)||reconnectAt-player.disconnectedAt<RECONNECT_MS))delete player.disconnectedAt;
        delete player.clipReadyIndex;player.loaded=[];player.ready=false;player.avatar=who.avatar||null;
      }
      const supported = state.syncPlayback ? [PLAY_AUDIO_PROTOCOL] : state.audioSealed ? [4,PLAY_AUDIO_PROTOCOL] : state.samplePositions ? [3,4,PLAY_AUDIO_PROTOCOL] : [2,3,4,PLAY_AUDIO_PROTOCOL];
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
      send(server,{type:'state',canCompactHistory:true,state:matchView(state,who.id)});
      if(!player.left)send(server,{type:'chat-history',rows:this.chatHistory()});
      await this.schedule();
      return response;
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
      if(entry.round===live.index){
        delete live.preparingClip;
        for(const p of live.players)delete p.clipReadyIndex;
      }
      live.audioPool[slot]=next;
      live.audioRevision=(live.audioRevision||0)+1;
      for(const p of live.players)p.loaded=p.loaded.filter(index=>index!==slot);
      if(['loading','buffering'].includes(live.phase))live.until=Math.max(live.until,Date.now()+60000);
      this.write(live);
      for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment().expires>Date.now())send(ws,{type:'audio-replaced',slot,ticket:next.ticket,revision:live.audioRevision});
      this.broadcast(live);await this.schedule();return true;
    })();
    this.audioRepair=repair;
    try{return await repair;}finally{if(this.audioRepair===repair)this.audioRepair=null;}
  }
  async webSocketMessage(ws,raw) {
    try{const input=receive(ws,raw);if(!input)return;
      if(input.message.type==='ping'){send(ws,{type:'pong',now:Date.now(),sentAt:Number(input.message.sentAt)||0});return;}
      if(input.message.type==='compact-history'){ws.serializeAttachment({...input.who,compactHistory:true});return;}
      const state=this.read();if(!state)fail('Match expired.',410);
      if(input.message.type==='chat-send'){this.chatMessage(ws,state,input.who,input.message.body);return;}
      if(input.message.type==='sync'){
        const now=Date.now();
        send(ws,{type:'state',state:matchView(state,input.who.id,now)});
        if(state.until<=now||(['finished','cancelled'].includes(state.phase)&&!state.rankingsSettled)){
          const alarm=await this.ctx.storage.getAlarm();
          if(alarm===null||alarm>now+5000)await this.ctx.storage.setAlarm(now+1);
        }
        return;
      }
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
      if(input.message.type==='audio-issue'){
        const {reason,index}=input.message,who=input.who;
        if(index!==state.index||['finished','cancelled'].includes(state.phase)||
           !['blocked','play-error','paused','stalled','decode'].includes(reason)||
           !state.players.some(p=>p.id===who.id&&!p.left))return;
        const seen=who.audioIssueRound===index?who.audioIssues||[]:[];
        if(!seen.includes(reason)){
          ws.serializeAttachment({...who,audioIssueRound:index,audioIssues:[...seen,reason]});
          this.reviewLog.add(state,who.id,'audio-issue',{reason});
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
      if(['propose','vote','withdraw','return-vote','return-request','abort-request','abort-vote'].includes(message.type)){
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
      this.write(state);if(message.type==='draft'&&before.phase===state.phase){send(ws,{type:'draft-saved',index:state.index});return;}this.broadcast(state);
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
  syncRatingRepair(id,starts,ratings){
    const state=this.read();
    if(!state||state.id!==id||state.format!=='ngmc-ranked')return;
    for(const p of state.players){
      const start=starts.find(s=>s.id===p.id);
      if(!Number.isFinite(start?.elo))throw Error('Repair roster mismatch.');
      p.elo=start.elo;
    }
    if(ratings)state.ratings=ratings;
    this.write(state);this.broadcast(state);
  }
  async review(options){
    if(options.view==='settlement'){
      const state=this.read();
      const meta=this.reviewLog.page({view:'highlights'});
      if(!meta)return null;
      const history=state?.history.map(row=>row.results.map(r=>[r.id,r.earned??Number(!!r.correct?.anime)]));
      const ended=this.ctx.storage.sql.exec("SELECT at FROM review_events WHERE kind='ended' ORDER BY seq LIMIT 1").toArray()[0]?.at;
      return {...meta,ended,pool:state?.pool,phase:state?.phase,completed:state?.completed,eligible:state?matchCreditPlan(state):undefined,
        startRatings:state?.players.map(p=>({id:p.id,elo:p.elo})),history:history??this.ctx.storage.sql.exec(
          "SELECT player,json_extract(data,'$.round') AS round,COALESCE(json_extract(data,'$.earned'),json_extract(data,'$.correct.anime')) AS earned FROM review_events WHERE kind='round-result' ORDER BY seq"
        ).toArray().reduce((rounds,r)=>{(rounds[r.round-1]??=[]).push([r.player,r.earned]);return rounds;},[])};
    }
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
      if(p&&!p.left&&!this.ctx.getWebSockets(id).some(other=>other!==ws&&other.readyState===1)){
        if(state.syncPlayback){p.ready=false;delete p.clipReadyIndex;}
        if(!state.lobby||state.arena)p.disconnectedAt??=now;
        this.write(state);await this.schedule();
      }
    }
    closeSocket(ws,code,reason);
  }
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){
    let state=this.read();
    // Old review-expiry alarms may still fire after deployment. Preserve the audit.
    if(!state)return;
    await this.ctx.storage.setAlarm(Date.now()+30000);
    state=this.read();
    if(!state)return;
    if(this.pendingRankedLeaves(state).length){
      try{await this.reportRankedLeaves(state);}catch{console.error('Play leave report will retry',state.id);}
      state=this.read();
    }
    if(['finished','cancelled'].includes(state.phase)){
      try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}
      if(!this.ctx.storage.sql.exec('SELECT 1 FROM review_meta WHERE id=4').toArray().length){
        if(await this.indexHighlights(state.id)){await this.ctx.storage.setAlarm(Date.now()+1000);return;}
        this.ctx.storage.sql.exec("INSERT OR REPLACE INTO review_meta VALUES(4,'true',0)");
      }
      if(this.pendingRankedLeaves(state).length){await this.ctx.storage.setAlarm(Date.now()+5000);return;}
      if(Date.now()<state.until){await this.schedule();return;}
      for(const ws of this.ctx.getWebSockets())ws.close(1000,'Match expired.');
      this.ctx.storage.sql.exec('DELETE FROM match_state');
      this.ctx.storage.sql.exec('DELETE FROM room_chat');
      return;
    }
    const phase=state.phase,index=state.index,historyLength=state.history.length;advanceMatch(state);
    if(state.history.length>historyLength)this.reviewLog.round(state);
    if(phase!==state.phase||index!==state.index)this.reviewLog.add(state,'','phase',{startsAt:state.startsAt,until:state.until});
    this.write(state);this.broadcast(state);try{await this.finish(state);}catch{await this.ctx.storage.setAlarm(Date.now()+5000);return;}await this.schedule();
  }
}
