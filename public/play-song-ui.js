import {fuzzyAnimeCheckbox,fuzzyAnimeSearch,saveFuzzyAnimeSearch} from './amq-anime-search.js';
import {playPools, poolFormat, poolName} from './play-pool.js';
import {poolToggle} from './play-pool-toggle.js';
import {arenaBallot, arenaBoard, arenaReveal} from './play-arena-ui.js';
import {DUEL_FORMAT, duelRules, animeOnlyMode, soloVersus, queueMode, lobbyGameMode} from './play-mode-rules.js';
import {ARENA_FORMAT, arenaRules} from './play-arena-config.js';
import {activeRankedGame,inactivityBanMessage,leaveWarning,RANKED_LEAVE_COST,songRatingPools} from './ngmc-leave-policy.js';
import {autoReadyHTML,lobbyDirectoryHTML,lobbyDialog,roomLobby,lobbyModeNames,pointsBoard,ballotHTML,updateMatchVoteDialog} from './play-lobby-ui.js';
import {broadcastResults} from './play-match-results.js';
import {matchLeaderboard} from './play-rankings.js';
import {songTeamsHTML,answerSideHTML,versusHTML,readyHTML,recapHTML,songBroadcastLayout,updateRoundDial} from './play-round-ui.js';
import {roundAudio} from './play-round-audio.js';
import {sampleStart} from './play-sample.js';
import {createPlayActivity} from './play-activity.js';
import {answerFieldsHTML,teamAnswerTilesHTML,updateTeamFields,updateArtistChips} from './play-team-ui.js';
import {createSongListDialog} from './play-song-dialog.js';
import {openMatchChat} from './play-match-chat.js';
import {createPlaySoundCues,roundSoundCues} from './play-sound-cues.js';
import {preparationLabel,percentDone} from './play-setup-progress.js';
import {songLoadingBar,updateSongLoadingBar} from './song-loading.js';
import {ngmcTeams,ngmcControls,ngmcProgress,ngmcArena,ngmcTrack,createCounterDialog} from './ngmc-ui.js';
import {createQuizAudioCache} from './quiz-audio-cache.js';
import {createSealedAudioCache,silentPlayAudio} from './play-audio-cache.js';
import {PLAY_AUDIO_PROTOCOL, defaultPlayGuessSeconds} from './play-audio-format.js';
const labels={anime:'Anime',song:'Song Title',artist:'Artist'};
const formats={'1v1':'1v1','3v3':'3v3','1-team':'1-Team'};
const renderedMarkup=new WeakMap();
function updateMarkup(element,html){
  if(renderedMarkup.get(element)===html)return false;
  element.innerHTML=html;
  renderedMarkup.set(element,html);
  return true;
}

export function createSongArtistUI({root,apiBase,getPlayer,escape:esc,animeTitle,prepareTitles=async()=>{},onError,onMatchMode=()=>{},onQueueChange=()=>{},onQueueCounts=()=>{},onCreditReward=()=>{}}) {
  let mode='song-artist',fields=['anime','song','artist'],totalSongs=20;
  const arena=()=>mode===ARENA_FORMAT, duel=()=>mode===DUEL_FORMAT, ranked=()=>mode==='ngmc-ranked', animeOnly=()=>animeOnlyMode(mode),teamFields=()=>!!match?.teamFields;
  const songDialog=createSongListDialog(esc,animeTitle);
  let chat=null, lobbyChat=null, personalRatings=null;
  function closeChat(){chat?.close();chat=null;}
  function closeLobbyChat(){lobbyChat?.close();lobbyChat=null;}
  function syncLobbyChat(ws,status){
    if(status.type!=='lobby'||match){
      closeLobbyChat();return;
    }
    const {code,players}=status;
    if(lobbyChat?.matchId!==code){
      closeLobbyChat();
      lobbyChat=openMatchChat({id:code,players,me:getPlayer()?.id},body=>{
        if(send(queue,{type:'lobby-chat',code,body}))return true;
        error('Reconnecting to lobby chat.');return false;
      },{label:'Lobby chat'});
    }
    if(ws.chatCode!==code){
      ws.chatCode=code;
      ws.pendingLobbyChat=[];
      send(ws,{type:'lobby-chat-history',code});
    }
  }
  let ngmcFormat='ngmc-ranked',dismissedMatch=null,announcedMatch=null;
  let active=false,format='1v1',server='EU',queue=null,room=null,match=null,queueStatus={type:'idle'},worker=null,searchReady=false,searchError='',searchId=0,searchItems=[],searchKind='',selected=-1;
  let audio=new Audio(),cache=createQuizAudioCache(),downloads=null,downloadError='',sources=[],manifestId='',ready=false,preparedIndex=-1,offset=0,clockReady=false,raf=null,heartbeat=null,searchTimer=null,draftTimer=null,queueRetry=null,roomRetry=null,queueDelay=1000,roomDelay=1000;
  let selectedField='anime',draft={anime:'',song:'',artist:''},chosen={},pendingLock=false,volume=30,structure='',loadGeneration=0,connecting=false,unlocking=false,lastLoaded='',progressTimer=null,pendingArtistKey=null;
  let seekIndex=-1,autoReady=false,autoAttempt='',readyReminder='',lobbyDraft=null,lobbyModal=null,lobbies=null;
  const sounds=createPlaySoundCues(()=>volume/100);
  const preferenceKey=()=>'amqtours-play-auto-ready-'+(getPlayer()?.id||'guest');
  function readAutoReady(){try{return localStorage.getItem(preferenceKey())==='1';}catch{return false;}}
  function syncLobbyReady(){
    if(autoReady&&queueStatus.type==='lobby'&&!queueStatus.busy&&queueStatus.players.some(p=>p.id===getPlayer()?.id&&!p.ready))
      send(queue,{type:'lobby-ready',ready:true});
  }
  let manifestRevision=0,downloadStart=0,downloadEnd=0,replacingAudio=false;
  let sealedCache=null, playbackUrl=null, preparingRound=-1, keyRequestedAt=0,clipAckAt=0;
  let draftDirty=false,lastDraft='',lastDraftAt=0;
  const savedField=()=>{try{return ['anime','song','artist'].includes(localStorage.getItem('amqtours-1team-field'))?localStorage.getItem('amqtours-1team-field'):'anime';}catch{return 'anime';}};
  let tabbedThisRound=false;
  function selectField(field){selectedField=field;if(match?.format==='1-team')try{localStorage.setItem('amqtours-1team-field',field);}catch{}}
  function savedServer(){try{const saved=localStorage.getItem('amqtours-quiz-server');if(['EU','NAE','NAW'].includes(saved))server=saved;}catch{}}
  savedServer();
  function savedVolume(){try{const value=localStorage.getItem('amqtours-quiz-volume');if(value!==null&&Number.isFinite(Number(value)))volume=Math.min(100,Math.max(0,Math.round(Number(value))));}catch{}audio.volume=volume/100;}
  savedVolume();audio.preload='auto';
  const volumeHTML=()=>'<label class="quiz-volume-control sa-volume">Volume<input id="sa-volume" type="range" min="0" max="100" step="1" value="'+volume+'" aria-label="Game Volume"><output id="sa-volume-value">'+volume+'%</output></label>';
  const player=()=>match?.players.find(p=>p.id===match.me);
  const send=(socket,value)=>{if(socket?.readyState===1){socket.send(JSON.stringify(['answer','artists','draft'].includes(value.type)?{...value,clientAt:Date.now()}:value));return true;}return false;};
  const counterDialog=createCounterDialog(message=>send(room,message));
  const updateCounterDialog=now=>counterDialog.update(match,player(),now,room?.readyState===1);
  const activity=createPlayActivity(message=>{if(active&&match&&!['finished','cancelled'].includes(match.phase))send(room,message);});
  const error=message=>{onError(Error(message));};
  function socketURL(id){const url=new URL('play-connect',apiBase);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('protocol',String(PLAY_AUDIO_PROTOCOL));if(id)url.searchParams.set('match',id);return url;}
  function startWorker(){
    answerListStatus='Loading answer lists…';
    worker?.terminate();searchReady=false;searchError='';
    worker=new Worker(new URL('./play-answer-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(!active)return;if(data.type==='progress'){
      answerListStatus=data.label;
      const status=root.querySelector('.sa-status');
      if(!match&&!searchReady&&!searchError&&getPlayer()&&queueStatus.type!=='preparing'&&status)status.textContent=answerListStatus;
    }else if(data.type==='ready'){searchReady=true;joinFromOverview();render();}else if(data.type==='error'){searchFailed(data.message);}else if(data.type==='results'&&data.id===searchId){searchItems=data.items;selected=searchItems.length&&!data.standard?0:-1;showSuggestions();}};
    worker.onerror=()=>searchFailed('Answer search could not start. Retry to load it.');
    worker.postMessage({type:'load'});
  }
  function searchFailed(message){
    searchError=message;
    if(overviewJoin){overviewJoin=null;notifyQueue();error(message);}
    render();
  }
  const poolKey=id=>'amqtours-play-pool-'+id;
  function preferredPool(id=mode){
    try{return localStorage.getItem(poolKey(id))==='watched'?'watched':'random';}catch{return 'random';}
  }
  function ratingBucket(format){
    if(['ngmc-ranked','ngmc-3v3','lobby-ngmc',ARENA_FORMAT].includes(format))return 'ngmc-ranked';
    if(format==='lobby-duel')return DUEL_FORMAT;
    return Object.hasOwn(songRatingPools,format)?format:null;
  }
  function ratingHTML(format){
    if(!getPlayer()||!ratingBucket(format))return '';
    return '<span class="play-mode-rating" data-mode-rating></span>';
  }
  function modeTitleHTML(title,format){
    return '<div class="play-mode-title"><h1>'+title+'</h1>'+ratingHTML(format)+'</div>';
  }
  function updateModeRating(){
    const chip=root.querySelector('[data-mode-rating]');
    if(!chip)return;
    const inQueue=waiting()&&mode===queueMode(overviewJoin?.format??queuedFormat);
    const pool=match?.pool||(inQueue?queueStatus.pool:null)||preferredPool();
    const selected=match?.format||(arena()?ARENA_FORMAT:duel()?DUEL_FORMAT:ranked()?ngmcFormat:format);
    const bucket=ratingBucket(selected);
    const value=match?.ratings?.find(p=>p.id===match.me)?.after??player()?.elo??personalRatings?.[poolFormat(bucket,pool)];
    const label=arena()?'NGMC Rating':'Your Rating';
    updateMarkup(chip,'<small>'+poolName(pool)+' · '+label+'</small><strong>'+(Number.isFinite(value)?Math.round(value).toLocaleString('en-US'):'—')+'</strong>');
  }
  let queuedFormat=null,overviewJoin=null,answerListStatus='Loading answer lists…';
  function waiting(){
    return active&&!match&&(!!overviewJoin||!!queuedFormat&&['queued','joining','preparing','matched'].includes(queueStatus.type));
  }
  function notifyQueue(){
    onQueueChange(overviewJoin?{...overviewJoin,type:'joining',connected:true}:waiting()?{
      format:queuedFormat,type:queueStatus.type,connected:queue?.readyState===1,waiting:queueStatus.waiting,
      needed:queueStatus.needed,pool:queueStatus.pool,progress:queueStatus.progress}:null);
  }
  function cancelQueue(){
    if(overviewJoin){overviewJoin=null;notifyQueue();render();return;}
    if(!waiting()||['preparing','matched'].includes(queueStatus.type))return;
    if(!send(queue,{type:'cancel'}))error('Reconnect to leave the queue.');
  }
  function joinQueue(selectedFormat,pool){
    if(!send(queue,{type:'join',mode:queueMode(selectedFormat),format:selectedFormat,pool}))return;
    sounds.play('matching-start');
    queuedFormat=selectedFormat;
    queueStatus={type:'joining',format:selectedFormat,pool};
    notifyQueue();render();
  }
  function joinFromOverview(){
    if(!overviewJoin||!queue?.hasStatus||queue.readyState!==1)return;
    if(queueStatus.type!=='idle'){
      overviewJoin=null;
      if(queueStatus.type==='lobby')error('Leave your lobby before joining a queue.');
      return;
    }
    if(!searchReady)return;
    const request=overviewJoin;
    overviewJoin=null;
    joinQueue(request.format,request.pool);
  }
  function quickJoin(selectedFormat,pool){
    if(!getPlayer()||waiting())return;
    if(match||queueStatus.type==='lobby'){error('Leave your current match or lobby first.');return;}
    const nextMode=queueMode(selectedFormat);
    if(!active)enter(nextMode);
    mode=nextMode;fields=animeOnly()?['anime']:['anime','song','artist'];
    selectQueueFormat(selectedFormat);
    primeAudio();
    overviewJoin={format:selectedFormat,pool};
    notifyQueue();
    if(searchError)startWorker();
    joinFromOverview();render();
  }
  function selectQueueFormat(id){
    if(id?.startsWith('ngmc-'))ngmcFormat=id;
    else if(Object.hasOwn(formats,id))format=id;
  }
  function connectQueue(){
    if(!active||!getPlayer()||queue?.readyState===0||queue?.readyState===1)return;
    connecting=true;render();const ws=queue=new WebSocket(socketURL());ws.lastReply=Date.now();
    ws.onopen=()=>{queueDelay=1000;connecting=false;render();send(ws,{type:'ping',includeRatings:true});};
    ws.onmessage=({data})=>{if(queue!==ws||!active)return;ws.lastReply=Date.now();const msg=JSON.parse(data);
      if(msg.type==='lobby-chat-history'||msg.type==='lobby-chat'){
        if(lobbyChat?.matchId===msg.code){
          if(msg.rows){
            const rows=msg.rows.concat(ws.pendingLobbyChat||[]).sort((a,b)=>a.seq-b.seq);
            ws.pendingLobbyChat=null;
            for(const row of rows)lobbyChat.receive(row,false);
          }else if(ws.pendingLobbyChat){
            ws.pendingLobbyChat.push(msg.row);
            if(ws.pendingLobbyChat.length>80)ws.pendingLobbyChat.shift();
          }else lobbyChat.receive(msg.row);
        }
        return;
      }
      if(msg.type==='ratings'){personalRatings=msg.ratings;updateModeRating();return;}
      if(msg.type==='lobby-password-saved'){lobbyModal?.close();return;}
      if(msg.type==='error'){if(lobbyModal?.open){const alert=lobbyModal.querySelector('[role=alert]');alert.hidden=false;alert.textContent=msg.message;}else error(msg.message);return;}
      if(msg.type==='inactivity-ban'){error(inactivityBanMessage(msg.until));return;}
      if(msg.type==='ranked-departure'){
        const pool=(songRatingPools[msg.format]||'NGMC Ranked')+(msg.pool==='watched'?' Watched':'');
        send(ws,{type:'ping',includeRatings:true});
        error('Lost '+RANKED_LEAVE_COST+' Rating in '+pool+'. '+msg.activeLeaves+' active '+(msg.activeLeaves===1?'leave.':'leaves.')+
          (msg.banUntil?' '+pool+' unlocks '+new Date(msg.banUntil).toLocaleString()+'.':''));
        return;
      }
      if(['preparing','matched'].includes(msg.type)&&msg.match&&msg.match!==announcedMatch&&
        msg.match!==dismissedMatch&&(waiting()||queueStatus.type==='lobby')){
        announcedMatch=msg.match;
        sounds.play('match-found');
      }
      if(msg.counts){lastCounts=msg.counts;onQueueCounts(msg.counts);}
      if(msg.type==='queued'||msg.type==='joining'||msg.type==='preparing'&&msg.format){
        // Some older queue servers report ranked for every pending NGMC lookup.
        if(msg.type==='queued'||!queuedFormat)queuedFormat=msg.format;
        selectQueueFormat(queuedFormat);
      }else if(!['matched','preparing'].includes(msg.type))queuedFormat=null;
      const updatingPreparation=msg.type==='preparing'&&queueStatus.type==='preparing'&&msg.match===queueStatus.match;
      const changed=JSON.stringify(queueStatus)!==JSON.stringify(msg);
      if(msg.code!==queueStatus.code||msg.type!=='lobby')lobbyDraft=null;
      if(msg.lobbies)lobbies=msg.lobbies;
      if(msg.type==='lobby'&&msg.code!==queueStatus.code)lobbyModal?.close();
      queueStatus=msg;
      if(msg.type!=='lobby')ws.chatCode=null;
      syncLobbyChat(ws,msg);
      ws.hasStatus=true;
      joinFromOverview();
      if(msg.type==='lobby'&&lobbyGameMode(msg.format)!==mode){
        mode=lobbyGameMode(msg.format);
        fields=animeOnly()?['anime']:['anime','song','artist'];
        onMatchMode(mode);
      }
      notifyQueue();syncLobbyReady();if(msg.type==='matched'&&msg.match!==dismissedMatch&&(!match||match.id!==msg.match))connectRoom(msg.match);
      if(changed&&updatingPreparation&&!match&&(!waiting()||mode===queueMode(overviewJoin?.format??queuedFormat))){
        const status=root.querySelector('.sa-status');
        if(status)status.textContent=preparationLabel(msg.progress);
      }else if(changed)render();
    };
    ws.onclose=event=>{if(queue!==ws)return;queue=null;lastCounts=null;connecting=false;if(active&&event.code!==4001){queueRetry=setTimeout(connectQueue,queueDelay);queueDelay=Math.min(15000,queueDelay*2);}if(event.code===4001){queuedFormat=null;overviewJoin=null;error('Play was opened in another tab.');}notifyQueue();render();};
  }
  function rankedAtRisk(){
    return active && activeRankedGame(match,Date.now()+offset) && !player()?.left;
  }
  function confirmNavigation(){
    if(!rankedAtRisk())return true;
    if(!confirm(leaveWarning(match.format)))return false;
    send(room,{type:'leave'});
    return true;
  }
  function resetLobbyMatch(){
    closeChat();sounds.stop();
    dismissedMatch=match?.id;const old=room;room=null;old?.close();match=null;ready=false;clearTimeout(raf);clearAudio();songDialog.close();
    send(queue,{type:'ping',includeRatings:true});render();
  }
  function connectRoom(id){
    if(!active||room?.matchId===id&&(room.readyState===0||room.readyState===1))return;
    closeLobbyChat();
    if(chat&&chat.matchId!==id)closeChat();
    room?.close();const ws=room=new WebSocket(socketURL(id));ws.matchId=id;ws.lastState=ws.lastReply=Date.now();
    let bestRtt=Infinity;
    ws.onopen=()=>{clockReady=false;activity.snapshot();roomDelay=1000;send(ws,{type:'ping',sentAt:Date.now()});};
    ws.onmessage=({data})=>{if(room!==ws||!active)return;ws.lastReply=Date.now();const msg=JSON.parse(data);
      if(msg.type==='chat-error'){error(msg.message);return;}
      if(msg.type==='chat-history'&&match?.id===id){
        chat??=openMatchChat(match,body=>{
          if(room?.matchId===id&&send(room,{type:'chat-send',body}))return true;
          error('Reconnecting to match chat.');return false;
        });
        for(const row of msg.rows)chat.receive(row,false);
        return;
      }
      if(msg.type==='chat-message'){chat?.receive(msg.row);return;}
      if(msg.type==='error'){if(replacingAudio){replacingAudio=false;downloadError='Replacement audio is unavailable. Retry the missing downloads.';}pendingArtistKey=null;pendingLock=false;error(msg.message);render();return;}
      if(msg.type==='pong'&&msg.sentAt){
        const received=Date.now(),rtt=received-msg.sentAt;
        if(rtt>=0&&rtt<=bestRtt){bestRtt=rtt;offset=msg.now-(msg.sentAt+received)/2;clockReady=true;}
        return;
      }
      if(msg.type==='playback'){
        if(match?.phase==='guess'&&match.index===msg.index){match.playback=msg.playback;tick();}
        return;
      }
      if(msg.type==='audio-retry'&&msg.revision===manifestRevision){replacingAudio=false;downloadError='Retry the missing audio.';render();return;}
      if(msg.type==='audio-replaced'){
        if(msg.revision<=manifestRevision)return;
        if(msg.revision!==manifestRevision+1||!sources[msg.slot]){ws.close();return;}
        if(match?.playback?.slot===msg.slot){preparedIndex=-1;preparingRound=-1;}
        replacingAudio=false;sealedCache?.discard(sources[msg.slot],server);sources[msg.slot]=msg.ticket;
        manifestRevision=msg.revision;downloads?.abort();downloads=null;lastLoaded='';
        send(room,{type:'loaded',revision:manifestRevision,indices:loaded()});preload();return;
      }
      if(msg.type==='manifest'){
        if(manifestId===msg.id && (msg.downloadStart||0)>downloadStart)downloads?.abort();
        downloadStart=msg.downloadStart||0;
        downloadEnd=msg.downloadEnd??msg.preload??msg.audio.length;
        const changedRevision=manifestRevision!==(msg.revision||0);
        manifestRevision=msg.revision||0;
        mode=msg.mode||'song-artist';onMatchMode(mode);fields=animeOnly()?['anime']:['anime','song','artist'];totalSongs=msg.total||msg.audio.length;
        if(manifestId===msg.id&&sealedCache&&msg.sealed){
          if(changedRevision||sources.some((source,i)=>source!==msg.audio[i])){
            downloads?.abort();downloads=null;replacingAudio=false;
            sources.forEach((source,i)=>{if(source!==msg.audio[i])sealedCache.discard(source,server);});sources=msg.audio;
          }
        }else if(manifestId!==msg.id||changedRevision||sources[0]!==msg.audio[0]){clearAudio();manifestId=msg.id;sources=msg.audio;sealedCache=msg.sealed?createSealedAudioCache(apiBase,mode):null;draft={anime:'',song:'',artist:''};chosen={};ready=false;
          prepareTitles().then(()=>{if(active&&manifestId===msg.id)render();}).catch(()=>{});
        }
        lastLoaded=loaded().join(',');send(room,{type:'loaded',revision:manifestRevision,indices:loaded()});if(ready){send(room,{type:'ready'});if(preparedIndex>=0&&audio.readyState>=3)send(room,{type:'clip-ready',index:preparedIndex,revision:manifestRevision});}preload();return;
      }
      if(msg.type==='state'){
        ws.lastState=Date.now();
        const update=msg.state;
        if(update.historyFrom!==undefined){
          const from=update.historyFrom;
          if(match?.id!==update.id||!Number.isInteger(from)||from<0||from>match.history.length){ws.close();return;}
          update.history=match.history.slice(0,from).concat(update.history);
        }
        if(msg.canCompactHistory)send(ws,{type:'compact-history'});
        const previous=match;match=msg.state;if(queuedFormat){queuedFormat=null;notifyQueue();}if(!previous||previous.id!==match.id)activity.snapshot();if(!clockReady)offset=match.now-Date.now();
        sounds.play(...roundSoundCues(previous,match));
        if(player()?.left)closeChat();
        if(previous?.index!==match.index||previous?.id!==match.id){tabbedThisRound=false;clearTimeout(draftTimer);draftDirty=false;lastDraft='';selectedField=match.myDraft?.field||(match.format==='1-team'?savedField():'anime');const saved=match.myDraft?.answers||player().answers;const arenaTitle=match.arena?.ballot.find(option=>option.owner===match.me)?.answer;draft={anime:arenaTitle||saved?.anime||'',song:saved?.song||'',artist:match.myDraft?.answers?.artist||''};chosen={};pendingArtistKey=null;pendingLock=false;hideSuggestions();}
        if(player().locked||teamFields())pendingLock=false;
        if(pendingArtistKey===JSON.stringify(player().artists||[])){pendingArtistKey=null;if(!teamFields())scheduleDraft();}
        if(match.phase!=='guess'&&!unlocking){audio.pause();songAudio.reset();}
        if(['finished','cancelled'].includes(match.phase)){downloads?.abort();}
        if(match.ratings&&!previous?.ratings)send(queue,{type:'ping',includeRatings:true});
        if(match.creditReward&&(!previous?.creditReward||previous.id!==match.id))onCreditReward(match.me);

        render();tick();
      }
    };
    ws.onclose=event=>{if(room!==ws)return;room=null;pendingLock=false;if(active&&event.code!==4001&&(match?.settlementPending||!['finished','cancelled'].includes(match?.phase))){roomRetry=setTimeout(()=>{if(!room&&id!==dismissedMatch)connectRoom(id);},roomDelay);roomDelay=Math.min(15000,roomDelay*2);}render();};
  }
  let previousHeartbeat=0;
  function checkConnections(){
    const now=Date.now(),resumed=now-previousHeartbeat>45000;
    previousHeartbeat=now;
    for(const ws of [queue,room]){
      if(!ws)continue;
      if(resumed)ws.lastReply=now;
      if(now-ws.lastReply>40000){
        if(ws===queue){queue=null;ws.close();connectQueue();}
        else {room=null;ws.close();if(match?.settlementPending||!['finished','cancelled'].includes(match?.phase))connectRoom(ws.matchId);}
        continue;
      }
      send(ws,{type:'ping',sentAt:now,...(ws===queue&&!personalRatings?{includeRatings:true}:{})});
      if(ws===room&&(!match||match.settlementPending||!['finished','cancelled'].includes(match.phase)&&
        (now+offset>match.until+2000||now-ws.lastState>60000)))send(ws,{type:'sync'});
    }
  }
  function loaded(){
    return sources.flatMap((source,i)=>(sealedCache ? sealedCache.has(source,server) : cache.url(source,server)) ? [i] : []);
  }
  async function preload(){
    if(downloads&&!downloads.signal.aborted)return;
    const controller=downloads=new AbortController(),generation=loadGeneration,media=sealedCache||cache;downloadError='';render();
    const update=()=>{if(progressTimer||generation!==loadGeneration||!active)return;progressTimer=setTimeout(()=>{progressTimer=null;if(generation!==loadGeneration||!active)return;const indices=loaded(),key=indices.join(',');if(key!==lastLoaded&&send(room,{type:'loaded',revision:manifestRevision,indices})){lastLoaded=key;render();}},100);};
    try{
      let incomplete=false;
      let next=downloadStart;
      const download=async(end)=>{
        while(next<end&&!controller.signal.aborted){
          const ticket=sources[next++];
          for(let attempt=0;attempt<3;attempt++){
            if(attempt)await new Promise(resolve=>setTimeout(resolve,500*attempt));
            if(controller.signal.aborted)return;
            try{
              await media.prepare([ticket],server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),onProgress:update});
              update();
              break;
            }catch(error){
              if(controller.signal.aborted)return;
              if(attempt>=1&&error.proof&&send(room,{type:'audio-failed',slot:sources.indexOf(error.ticket),revision:manifestRevision,proof:error.proof})){
                replacingAudio=true;render();incomplete=true;break;
              }
              if(attempt===2)incomplete=true;
            }
          }
        }
      };
      // Reserve available bandwidth for the group everyone needs before fetching ahead.
      await Promise.all([download(downloadEnd),download(downloadEnd)]);
      await Promise.all([download(sources.length),download(sources.length)]);
      if(incomplete&&!controller.signal.aborted){downloadError='Some audio is still unavailable. Retry the missing downloads.';render();}
    }
    finally{if(downloads===controller)downloads=null;}
  }
  const audioIssueKeys=new Set();
  function reportAudioIssue(reason){
    if(!match)return;
    const key=match.index+':'+reason;
    if(audioIssueKeys.has(key))return;
    if(send(room,{type:'audio-issue',index:match.index,reason}))audioIssueKeys.add(key);
  }
  const songAudio=roundAudio(audio,reportAudioIssue,index=>{
    if(match?.phase!=='guess'||match.index!==index||tabbedThisRound||document.querySelector('dialog[open]')||
       document.activeElement?.matches('input,textarea,select,.play-match-chat'))return;
    root.querySelector('#sa-'+(teamFields()?selectedField:'anime'))?.focus({preventScroll:true});
  });
  function playRoundAudio(now,manual=false){
    if(!ready||preparedIndex!==match.index||audio.readyState<1||match.phase!=='guess'||now<match.startsAt||now>=match.until)return;
    const sample=sealedCache?0:sampleStart(audio.duration,match.samplePosition,defaultPlayGuessSeconds(mode));
    songAudio.update(match.index,sample+(now-match.startsAt)/1000,manual);
  }
  function revokePlayback() {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = null;
  }
  function clearAudio() {
    autoAttempt='';loadGeneration++; clearTimeout(progressTimer); progressTimer=null; downloads?.abort(); downloads=null;
    audio.pause(); audio.muted=false; audio.onloadedmetadata=null; audio.onloadeddata=null; audio.onerror=null;
    audio.oncanplay=null;audio.removeAttribute('src'); audio.load();
    revokePlayback(); cache.clear(); sealedCache?.clear(); sealedCache=null;
    songAudio.reset();audioIssueKeys.clear(); sources=[]; preparedIndex=-1; seekIndex=-1; preparingRound=-1; keyRequestedAt=0; unlocking=false;
    manifestId=''; downloadError='';replacingAudio=false;
  }
  function prepareSealedClip(now) {
    if (!ready || unlocking || (!match.preparingClip && now < match.startsAt) || now >= match.until) return;
    const { index, playback } = match;
    if (!playback) {
      if (now - keyRequestedAt >= 400) {
        keyRequestedAt=now;
        send(room,{type:'playback',index});
      }
      return;
    }
    const ticket=sources[playback.slot];
    if(preparedIndex===index){
      if(match.preparingClip&&!player()?.audioReady&&audio.readyState>=3&&now-clipAckAt>=1000){
        clipAckAt=now;send(room,{type:'clip-ready',index,revision:manifestRevision});
      }
      return;
    }
    if(preparingRound===index || !sealedCache.has(ticket,server))return;
    const generation=loadGeneration;
    const current=()=>active&&generation===loadGeneration&&match?.index===index&&sources[playback.slot]===ticket&&(match.preparingClip||match.phase==='guess');
    const cannotPlay=()=>{
      if(!current())return;
      ready=false;preparedIndex=-1;songAudio.reset();reportAudioIssue('decode');
      render();
      error('Could not play the encrypted clip. Tap Ready to retry.');
    };
    preparingRound=index;
    sealedCache.decrypt(ticket,server,playback.key).then(blob=>{
      if(!blob||!current())return;
      revokePlayback();songAudio.reset();
      audio.onloadedmetadata=null;
      audio.oncanplay=()=>{
        if(!current())return;
        clipAckAt=0;tick();
      };
      audio.onerror=cannotPlay;
      playbackUrl=URL.createObjectURL(blob);
      audio.src=playbackUrl;
      preparedIndex=index;
      audio.load();
    }).catch(cannotPlay).finally(()=>{if(generation===loadGeneration&&preparingRound===index)preparingRound=-1;});
  }
  function hideSuggestions(){searchId++;searchItems=[];selected=-1;for(const el of root.querySelectorAll('.sa-suggestions'))el.replaceChildren();for(const el of root.querySelectorAll('[data-sa-field]')){el.setAttribute('aria-expanded','false');el.removeAttribute('aria-activedescendant');}}
  function findSuggestions(field,value){
    hideSuggestions();
    searchKind=field;
    const id=searchId;
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>worker?.postMessage({type:'search',id,kind:field,query:value,fuzzy:fuzzyAnimeSearch()}),70);
  }
  function showSuggestions(){
    const list=root.querySelector('#sa-options-'+searchKind),input=root.querySelector('#sa-'+searchKind);if(!list||document.activeElement!==input)return;
    list.innerHTML=searchItems.map((item,i)=>'<button type="button" role="option" tabindex="-1" id="sa-option-'+i+'" aria-selected="'+(i===selected)+'" data-sa-option="'+i+'">'+esc(item)+'</button>').join('');
    input.setAttribute('aria-expanded',String(!!searchItems.length));if(selected>=0)input.setAttribute('aria-activedescendant','sa-option-'+selected);
    list.classList.toggle('above',input.getBoundingClientRect().bottom>innerHeight-260);
  }
  function choose(i){const item=searchItems[i];if(!item)return;const input=root.querySelector('#sa-'+searchKind);draft[searchKind]=item;chosen[searchKind]=item;input.value=draft[searchKind];hideSuggestions();input.focus({preventScroll:true});scheduleDraft();}
  function currentArtists(){
    const list=[...(player()?.artists||[])],name=String(chosen.artist||draft.artist||'').trim();
    if(name&&!list.some(x=>x.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()))list.push(name);
    return list;
  }
  function saveCurrentDraft(){
    clearTimeout(draftTimer);
    if(!draftDirty||!match||match.phase!=='guess'||player()?.locked||pendingLock||pendingArtistKey!==null||Date.now()+offset<match.startsAt||Date.now()+offset>=match.until)return;
    const field=teamFields()?selectedField:document.activeElement?.dataset.saField||selectedField;
    const payload={type:'draft',index:match.index,field,answers:Object.fromEntries(fields.map(f=>[f,chosen[f]||draft[f]||''])),...(animeOnly()?{}:{artists:currentArtists()})};
    const key=JSON.stringify(payload);if(key===lastDraft){draftDirty=false;return;}
    if(send(room,payload)){lastDraft=key;lastDraftAt=Date.now();draftDirty=false;}
  }
  function scheduleDraft(){if(arena()||match?.format==='lobby-team')return;draftDirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(saveCurrentDraft,Math.max(0,250-(Date.now()-lastDraftAt)));}

  function artistList(list){
    if(!match||match.phase!=='guess'||pendingArtistKey!==null||Date.now()+offset<match.startsAt)return;
    if(teamFields()&&player().field&&player().field!=='artist')return;
    const message=teamFields()?{type:'answer',field:'artist',artists:list}:{type:'artists',artists:list};
    if(send(room,{...message,index:match.index})){clearTimeout(draftTimer);draftDirty=false;lastDraft='';pendingArtistKey=JSON.stringify(list);draft.artist='';delete chosen.artist;root.querySelector('#sa-artist').value='';hideSuggestions();render();}
    else error('Reconnecting… Retry adding the artist once connected.');
  }
  function addArtist(){const name=String(chosen.artist||draft.artist||'').trim();if(!name)return;const list=player()?.artists||[];if(list.some(x=>x.toLowerCase()===name.toLowerCase()))return;artistList([...list,name]);}
  function submit(lock,field){
    if(arena()){
      const answer=(chosen.anime||draft.anime).trim();
      if(!match||match.phase!=='guess'||Date.now()+offset<match.startsAt||Date.now()+offset>=match.until||!answer)return;
      if(send(room,{type:'propose',index:match.index,field:'anime',answer}))hideSuggestions();
      else error('Reconnect to submit your title.');
      return;
    }
    if(match?.format==='lobby-team'){
      field??=document.activeElement?.dataset.saField;
      const answer=chosen[field]||draft[field];
      if(answer&&send(room,{type:'propose',index:match.index,field,answer})){
        delete chosen[field];draft[field]='';root.querySelector('#sa-'+field).value='';hideSuggestions();
      }
      return;
    }
    if(field==='artist'){addArtist();return;}
    if(!match||match.phase!=='guess'||pendingLock||pendingArtistKey!==null||Date.now()+offset<match.startsAt)return;
    if(teamFields()){
      if(!field||!String(chosen[field]||draft[field]||'').trim())return;
      if(send(room,{type:'answer',index:match.index,field,answer:chosen[field]||draft[field]})){clearTimeout(draftTimer);draftDirty=false;lastDraft='';pendingLock=true;hideSuggestions();render();}
      else error('Reconnecting… Retry submitting once connected.');
      return;
    }
    const answers=Object.fromEntries(fields.map(field=>[field,field==='artist'?currentArtists().join(', '):chosen[field]||draft[field]||'']));
    if(send(room,{type:'answer',index:match.index,answers,...(animeOnly()?{}:{artists:currentArtists()}),lock})){clearTimeout(draftTimer);draftDirty=false;lastDraft='';if(lock){pendingLock=true;hideSuggestions();render();}}
    else error('Reconnecting… Your answers are kept. Retry submitting once connected.');
  }
  function teamHTML(){if(ranked())return ngmcTeams(match,esc);return match.lobby&&!duel()?pointsBoard(match,esc):songTeamsHTML(match,esc);}
  function sharedHTML(){if(arena())return '';if(match.format==='lobby-team')return ballotHTML(match,esc);if(ranked())return match.phase==='loading'?'':ngmcControls(match,esc);if(match.lobby||teamFields()||soloVersus(match.format))return '';const me=player();return '<section class="sa-shared"><h3>Team Answers</h3><div class="sa-shared-head"><span>Player</span>'+fields.map(f=>'<span>'+labels[f]+'</span>').join('')+'</div>'+match.players.filter(p=>p.team===me.team).map(p=>'<div class="sa-shared-row"><strong>'+esc(p.name)+'</strong>'+fields.map(f=>'<span>'+esc(p.answers?.[f]||'—')+'</span>').join('')+'</div>').join('')+'</section>';}
  function customSettings(){
    return {pool:root.querySelector('#sa-lobby-pool')?.value||'random',format:root.querySelector('#sa-lobby-format')?.value||queueStatus.format||'lobby-team',
      songs:Number(root.querySelector('#sa-lobby-songs')?.value||(duel()?duelRules.songs:20)),
      seconds:Number(root.querySelector('#sa-lobby-time')?.value??(duel()?duelRules.guessSeconds:30))};
  }
  let lastCounts=null;
  async function refreshGuestCounts(){
    if(!active||getPlayer()||document.hidden)return;
    try{
      const [res,directory]=await Promise.all(['play-queue-counts','play-lobbies'].map(path=>fetch(new URL(path,apiBase))));
      if(!res.ok)return;
      const counts=await res.json();
      const rooms=directory.ok?await directory.json():null;
      if(!active||getPlayer())return;
      if(rooms&&JSON.stringify(rooms)!==JSON.stringify(lobbies)){lobbies=rooms;lastCounts=counts;render();return;}
      lastCounts=counts;
      for(const badge of root.querySelectorAll('[data-queue-format]')){
        const count=counts[badge.dataset.queueFormat]||0;
        badge.textContent=count+' in queue';badge.dataset.waiting=String(count>0);
      }
    }catch{/* Try again on the next visible refresh. */}
  }
  function queueBadge(id,pool){
    const key=poolFormat(id,pool);
    const count=lastCounts?.[key]??0;
    return '<small class="sa-queue-count" data-queue-format="'+key+'" data-waiting="'+(count>0)+'">'+(lastCounts?count+' in queue':'— in queue')+'</small>';
  }
  function lobbyHTML(){
    if(queueStatus.type==='lobby-ended')return '<section class="sa-lobby"><h1>Match Ended</h1>'+endLobbyActions()+'</section>';
    if(queueStatus.type==='lobby')return roomLobby(queueStatus,getPlayer()?.id,esc,autoReady,lobbyDraft);
    const otherQueue=waiting()&&mode!==queueMode(overviewJoin?.format??queuedFormat);
    const pool=waiting()&&!otherQueue?queueStatus.pool||preferredPool():preferredPool();
    const ngmc=ranked(),idle=queueStatus.type==='idle',selectedFormat=arena()?ARENA_FORMAT:duel()?DUEL_FORMAT:ngmc?ngmcFormat:format;
    const choices=arena()?[[ARENA_FORMAT,'2v2 Round Robin']]:duel()?[[DUEL_FORMAT,'Ranked 1v1']]:ngmc?[['ngmc-ranked','4v4 Ranked'],['ngmc-3v3','3v3 Unranked']]:Object.entries(formats);
    const formatButtons=choices.map(([id,name])=>{
      const selected=id===selectedFormat;
      if(arena()||duel())return '<div class="arena-format"><strong>'+name+'</strong>'+queueBadge(id,pool)+'</div>';
      return '<button type="button" data-'+(ngmc?'ngmc':'sa')+'-format="'+id+'" aria-pressed="'+selected+'" '+(idle?'':'disabled')+'><strong>'+name+'</strong>'+
        (!ngmc&&id==='1-team'?'<small>Unranked</small>':'')+queueBadge(id,pool)+'</button>';
    }).join('');
    const queueLabel=(otherQueue?'Queued in Another Mode':overviewJoin||queueStatus.type==='joining'?'Cancel Matchmaking':queueStatus.type==='queued'?'Leave Queue':['preparing','matched'].includes(queueStatus.type)?'Preparing Match…':'Find Match');
    const status=(!getPlayer()?'Sign in above to join a queue.':queueStatus.type==='preparing'&&!otherQueue?preparationLabel(queueStatus.progress):searchError?esc(searchError):!searchReady?esc(answerListStatus):connecting?'Connecting…':otherQueue?'':queueStatus.type==='joining'?'Joining matchmaking…':queueStatus.type==='queued'?'Finding Players · '+queueStatus.waiting+(arena()?' in queue':' / '+queueStatus.needed+' · '+percentDone(queueStatus.waiting,queueStatus.needed)):queueStatus.type==='matched'?'Selecting songs for your match…':'');
    const disabled=otherQueue||!overviewJoin&&(['preparing','matched'].includes(queueStatus.type)||!searchReady||connecting||!getPlayer()||queue?.readyState!==1);
    const modeIcon=duel()?'<span class="arena-emblem duel-emblem"><span><i></i></span><b></b><span><i></i></span></span>':arena()?'<span class="arena-emblem"><span><i></i><i></i></span><b></b><span><i></i><i></i></span></span>':ngmc?'<span class="score-formation">'+ '<i></i>'.repeat(8)+'</span>':'<span class="score-note">♪</span>';
    const title=modeTitleHTML(duel()?'1v1 Ranked':arena()?'2v2 Arena':ngmc?'NGMC Ranked':'Song/Artist',selectedFormat);
    return '<div class="play-lobby-browser '+(duel()?'':ngmc?'ngmc-queue':'song-queue')+'">'+
      '<header class="play-queue-banner"><div><span class="sa-eyebrow">Matchmaking</span>'+title+
      '<p>'+(duel()?duelRules.songs+' songs · '+duelRules.guessSeconds+'s guesses · 1 point per correct anime':arena()?'Two-player teams · '+arenaRules.songsPerFixture+' songs per fixture · '+arenaRules.guessSeconds+'s guesses':ngmc?'35 songs · 20s guesses · 5 lives':'20 songs · 30s guesses · 3 points per song')+'</p></div><div class="play-queue-emblem" aria-hidden="true">'+modeIcon+'</div></header>'+
      '<section class="sa-lobby play-queue-card"><div class="play-queue-heading"><h2>Find Match</h2>'+poolToggle(pool,'data-queue-pool',!idle)+'</div><div class="score-formats" role="group" aria-label="Match format">'+formatButtons+'</div>'+
      '<div class="score-settings"><label>Audio Server<select id="sa-server" '+(idle?'':'disabled')+'>'+
      ['EU','NAE','NAW'].map(s=>'<option '+(s===server?'selected':'')+'>'+s+'</option>').join('')+'</select></label>'+autoReadyHTML(autoReady)+'</div>'+
      '<button class="button mint score-find" type="button" data-sa-action="queue" '+(disabled?'disabled':'')+'>'+queueLabel+'</button>'+
      '<p class="sa-status" role="status">'+status+'</p>'+(searchError?'<button class="button secondary" type="button" data-sa-action="search-retry">Retry Answer Lists</button>':'')+
      '</section>'+lobbyDirectoryHTML(lobbies,mode,idle&&getPlayer()&&queue?.readyState===1,esc)+'</div>';
  }
  function endLobbyActions(){
    const disabled=queueStatus.type==='lobby-ended'?'':' disabled';
    return '<button class="button secondary" data-sa-action="exit-lobby"'+disabled+'>Back to Matchmaking</button> <button class="button mint" data-sa-action="again"'+disabled+'>Return to Lobby</button>';
  }
  function gameHTML(){
    const done=['finished','cancelled'].includes(match.phase);
    const ngmcName=match.format==='lobby-ngmc'?'NGMC Custom':match.format==='ngmc-3v3'?'NGMC Unranked':'NGMC Ranked';
    const teamSize=match.players.length/2;
    const duelLabel=match.lobby?'1v1 Unranked':'1v1 Ranked';
    const modeLabel=duel()?duelLabel:arena()?'2v2 Round Robin':ranked()?(done?ngmcName+' · ':'')+teamSize+'v'+teamSize:(done?'Song/Artist · ':'')+(lobbyModeNames[match.format]||formats[match.format]);
    const resumeAudio=done?'':'<button type="button" class="button mint" data-sa-action="resume-audio" hidden>Resume Audio</button>';
    const abortButton=done?'':'<button type="button" class="button secondary" data-abort-request>Request Abort Vote</button>';
    const takeOver=!done&&ranked()?'<button type="button" class="button secondary" data-sa-action="volunteer" data-ngmc-takeover hidden>Take Over Counting</button>':'';
    const title=done?match.phase==='finished'?'Match Complete':match.aborted?'Match Aborted':'Match Ended'
      :duel()?duelLabel:arena()?'2v2 Arena':ranked()?ngmcName:'Song/Artist';
    const titleRow=modeTitleHTML(title,match.format);
    const heading='<div class="sa-game-heading"><div><span class="sa-eyebrow">'+modeLabel+' · '+poolName(match.pool)+'</span>'+titleRow+'</div><div class="sa-game-actions">'+volumeHTML()+'<div class="sa-match-buttons">'+resumeAudio+takeOver+abortButton+(match.lobby&&!done?'<button class="button secondary" data-return-request>Return to Lobby</button>':'')+'<button type="button" class="button secondary" data-sa-action="songs">Song List</button>'+(done&&match.lobby?endLobbyActions():'<button type="button" class="button secondary" data-sa-action="'+(done?'again':'leave')+'">'+(done?'Back':'Leave Match')+'</button>')+'</div></div></div>';
    const reward='<p class="sa-credit-reward" role="status" hidden></p>';
    if(match.aborted)return heading+'<p role="status">A majority voted to abort. This match does not count toward ratings, records or credits.</p>';
    if(done&&arena())return heading+reward+(match.reason?'<p>'+esc(match.reason)+'</p>':'')+'<div class="sa-scoreboard"></div>';
    if(done)return heading+reward+broadcastResults(match,esc,animeTitle,winnerText);
    const answerForm='<form id="sa-answer-form"><div class="sa-answer-fields">'+answerFieldsHTML(fields,teamFields())+'</div><button type="submit" class="button mint sa-lock">Submit</button>'+
      '<small class="sa-locked-answer" aria-live="polite" hidden></small>'+fuzzyAnimeCheckbox()+'</form>';
    const skipButton=match.skipRequired?'<div class="sa-skip-row"><button class="button secondary" type="button" data-sa-action="skip" aria-pressed="false">Skip Song</button></div>':'';
    if(ranked())return heading+ngmcArena(match,answerForm+skipButton);
    const tiles=teamFields()?'<div class="sa-live-answer-sides '+(match.teams.length>1?'is-versus':'')+'"><section><h3 class="sa-side-heading">Your Team</h3>'+teamAnswerTilesHTML()+'</section>'+(match.teams.length>1?'<section><h3 class="sa-side-heading">Opponents</h3><div class="sa-opponent-answers"></div></section>':'')+'</div>':'';
    return heading+songBroadcastLayout(match,{tiles,answerForm,skipButton});
  }
  function winnerText(){
    if(duel()&&match.players.some(p=>p.left&&p.id!==match.me)&&match.history.length<match.total)return 'You won by forfeit';
    if(duel()&&player().left&&match.history.length<match.total)return 'You forfeited';if(match.format==='lobby-ffa'){const best=Math.max(...match.teams);return match.teams[player().team]===best?(match.teams.filter(v=>v===best).length>1?'Tied for First':'You won'):'You lost';}if(match.teams.length===1)return 'Your team scored '+match.teams[0]+' points.';const mine=match.teams[player().team],other=match.teams[1-player().team];const subject=soloVersus(match.format)?'You':'Your team';return mine===other?'A tie!':subject+(mine>other?' won':' lost');}
  function render(){
    if(!active)return;
    root.classList.toggle('sa-match-layout',!!match);
    if(match)songDialog.update(match);
    if(!match){
      counterDialog.close();
      if(!root.isConnected)return;
      const focused=root.contains(document.activeElement)?document.activeElement.id:null;
      root.innerHTML=lobbyHTML();structure='';updateModeRating();
      if(focused)root.querySelector('#'+CSS.escape(focused))?.focus({preventScroll:true});
      return;
    }
    const next=match.id+':'+match.index+':'+(['finished','cancelled'].includes(match.phase)?match.phase:'play');
    if(next!==structure){root.innerHTML=gameHTML();structure=next;for(const field of fields){const input=root.querySelector('#sa-'+field);if(input)input.value=draft[field]||'';}}
    updateModeRating();
    for(const button of root.querySelectorAll('[data-sa-action="exit-lobby"],[data-sa-action="again"]')){
      if(match.lobby)button.disabled=queueStatus.type!=='lobby-ended';
    }
    const reward=root.querySelector('.sa-credit-reward');
    if(reward&&match.creditReward){
      const {amount,bonus}=match.creditReward;
      reward.hidden=false;
      const text='+'+amount+' credits'+(bonus?' · '+bonus+'-credit win bonus included':'');
      if(reward.textContent!==text)reward.textContent=text;
    }else if(reward){
      reward.hidden=!match.creditsPending;
      if(match.creditsPending)reward.textContent='Saving your credit reward. You can leave this screen.';
    }
    updateMatchVoteDialog(root,match,payload=>send(room,payload));
    updateCounterDialog(Date.now()+offset);
    if(match.aborted)return;
    const abort=root.querySelector('[data-abort-request]');
    if(abort){
      const poll=match.abortPoll;
      abort.disabled=!!(poll||match.returnPoll||player()?.left);
      abort.textContent=poll?'Abort Vote · '+match.players.filter(p=>!p.left&&poll.votes[p.id]===true).length+'/'+poll.required:'Request Abort Vote';
    }
    const scoreboard=root.querySelector('.sa-scoreboard');
    if(arena()){
      const open=scoreboard.querySelector('details')?.open;
      updateMarkup(scoreboard,arenaBoard(match,esc));
      if(open)scoreboard.querySelector('details').open=true;
    }else updateMarkup(scoreboard,match.phase==='finished'?(match.lobby||match.format==='1-team'||match.format==='ngmc-3v3'?pointsBoard(match,esc):matchLeaderboard(match,esc)):teamHTML());
    const progress=ranked()&&root.querySelector('.ngmc-progress');
    if(progress)updateMarkup(progress,ngmcProgress(match,esc,animeTitle));
    const status=root.querySelector('.sa-round-status');if(!status)return;
    const me=player(),indices=loaded();
    const takeOver=root.querySelector('[data-ngmc-takeover]');
    if(takeOver){
      takeOver.hidden=me.left||!match.autoCounting?.[me.team];
      takeOver.disabled=room?.readyState!==1;
    }
    const waitingAudio=['loading','buffering'].includes(match.phase)&&match.audioWindow;
    const start=waitingAudio?waitingAudio.start:downloadStart;
    const end=waitingAudio?waitingAudio.end:sources.length;
    const loadedCount=indices.filter(i=>i>=start&&i<end).length, downloadTotal=end-start;
    const downloadLabel=waitingAudio?'Audio for This Round':'Your Match Audio';
    status.textContent=match.phase==='loading'?'Getting Everyone Ready':match.phase==='buffering'?'Waiting for Audio':match.phase==='counting'?'Counting Guesses':match.phase==='reveal'?'Answers Revealed':'Listen & Answer';
    const activePlayers=match.players.filter(p=>!p.left);
    const loadingNames=activePlayers.filter(p=>!p.audioReady&&(p.ready||p.acceptedReady)).map(p=>p.name);
    const audioReady=activePlayers.filter(p=>p.audioReady).length;
    const audioStatus=['loading','buffering'].includes(match.phase)&&activePlayers.length?'<span>'+audioReady+' / '+activePlayers.length+' players have audio ready · '+percentDone(audioReady,activePlayers.length)+(loadingNames.length?' · Loading: '+esc(loadingNames.join(', ')):'')+'</span>':'';
    const downloadStatus=root.querySelector('.sa-download-status'),downloadBar=downloadStatus.querySelector('.song-loading-bar');
    const meterChanged=updateMarkup(downloadStatus,(loadedCount<downloadTotal||['loading','buffering'].includes(match.phase)?'<div class="sa-download-meter"><div><span>'+downloadLabel+'</span><strong>'+(percentDone(loadedCount,downloadTotal)||'…')+'</strong></div>'+songLoadingBar({label:'Song Download',loaded:loadedCount,total:downloadTotal})+'</div>':'')+audioStatus+(replacingAudio?'<span role="status">Finding replacement audio…</span>':'')+(downloadError&&!replacingAudio?'<span class="incorrect">'+esc(downloadError)+'</span><button type="button" class="button secondary" data-sa-action="retry-download">Retry Download</button>':''));
    if(meterChanged&&downloadBar&&downloadStatus.querySelector('.song-loading-bar')){downloadStatus.querySelector('.song-loading-bar').replaceWith(downloadBar);updateSongLoadingBar(downloadBar,loadedCount,downloadTotal);}
    const shared=root.querySelector('.sa-shared-wrap');
    if(arena()){
      const focusedChoice=shared.contains(document.activeElement)?document.activeElement.dataset.choice:null;
      const canVote=ready&&room?.readyState===1&&!me.left;
      updateMarkup(shared,match.phase==='guess'?arenaBallot(match,esc,canVote):'');
      if(focusedChoice)shared.querySelector('[data-choice="'+CSS.escape(focusedChoice)+'"]')?.focus({preventScroll:true});
    }else updateMarkup(shared,sharedHTML());
    const waiting=['loading','buffering'].includes(match.phase)||!ready;
    const showReady=waiting&&(!ranked()||!ready||match.phase==='loading');
    const readyWrap=root.querySelector('.sa-ready-wrap');readyWrap.hidden=!showReady;
    const readyMarkup=showReady?readyHTML(match,true,ready,esc,autoReadyHTML(autoReady))+(ranked()&&match.phase==='loading'?ngmcControls(match,esc):''):'';
    updateMarkup(readyWrap,readyMarkup);
    const liveSides=root.querySelector('.sa-live-answer-sides');if(liveSides)liveSides.hidden=waiting;
    const form=root.querySelector('#sa-answer-form');form.hidden=waiting||['reveal','counting'].includes(match.phase);
    const unavailable=match.phase!=='guess'||!room||!ready||Date.now()+offset<match.startsAt;
    const disabled=unavailable||pendingLock||pendingArtistKey!==null;
    if(teamFields()){const focused=document.activeElement?.dataset.saField;selectedField=updateTeamFields(root,match,disabled,esc,selectedField,unavailable);if(focused&&focused!==selectedField&&!disabled)root.querySelector('#sa-'+selectedField)?.focus({preventScroll:true});}else for(const el of form.querySelectorAll('input,button'))el.disabled=el.matches('input')?unavailable:disabled;
    updateArtistChips(root,match,disabled,esc);
    form.classList.toggle('sa-field-claims',teamFields());form.querySelector('.sa-lock').hidden=teamFields();
    const lockButton=form.querySelector('.sa-lock');
    lockButton.disabled=match.phase!=='guess'||!ready||pendingLock||pendingArtistKey!==null||room?.readyState!==1||Date.now()+offset<match.startsAt||Date.now()+offset>=match.until;
    lockButton.textContent=pendingLock?'Submitting…':me.locked?'Update Answer':!room?'Reconnecting…':'Submit';
    if(arena()){
      const proposed=match.arena.ballot.some(option=>option.owner===match.me&&option.choice);
      lockButton.textContent=proposed?'Update Title':'Submit Title';
    }
    if(match.format==='lobby-team'){
      lockButton.hidden=true;
      for(const input of form.querySelectorAll('[data-sa-field]')){
        const row=input.closest('.sa-answer-row');
        let action=row.querySelector('[data-propose]');
        if(!action){
          action=row.querySelector('.sa-artist-add')||document.createElement('button');
          action.type='button';action.className='button secondary';action.dataset.propose=input.dataset.saField;
          action.textContent='Submit';row.append(action);
        }
        action.disabled=disabled;
      }
    }
    const lockedAnswer=form.querySelector('.sa-locked-answer');
    const submission=me.locked&&match.phase==='guess'?fields.map(field=>me.answers?.[field]).filter(Boolean).join(' · '):'';
    lockedAnswer.hidden=!submission;
    const elapsed=Number.isFinite(me.lockedElapsedMs)?' · '+(me.lockedElapsedMs/1000).toFixed(3)+'s':'';
    const confirmation=submission?'Locked in · '+submission+elapsed:'';
    if(lockedAnswer.textContent!==confirmation)lockedAnswer.textContent=confirmation;
    const last=match.history.at(-1),revealed=['reveal','counting'].includes(match.phase)&&last?.index===match.index;
    const opponents=root.querySelector('.sa-opponent-answers');if(opponents)updateMarkup(opponents,answerSideHTML(match,revealed?last:null,1-me.team,esc));
    if(ranked()){
      updateMarkup(root.querySelector('.ngmc-track'),ngmcTrack(revealed?last:null,esc,animeTitle));
    }else{
      const recap=revealed?recapHTML(match,esc,animeTitle)+(arena()?arenaReveal(match,last,esc):teamFields()?'':versusHTML(match,last,esc)):'';
      updateMarkup(root.querySelector('.sa-reveal-wrap'),recap);
    }
    const skip=root.querySelector('[data-sa-action=skip]');if(skip){const votes=match.skipVotes||[];skip.parentElement.hidden=match.phase!=='guess'||!ready;skip.disabled=Date.now()+offset<match.startsAt||room?.readyState!==1;skip.setAttribute('aria-pressed',String(votes.includes(match.me)));skip.textContent=(votes.includes(match.me)?'Cancel Skip':'Skip Song')+' · '+votes.length+'/'+match.skipRequired;}
  }
  function setAutoReady(value){
    autoReady=value;try{localStorage.setItem(preferenceKey(),value?'1':'0');}catch{}
    for(const box of root.querySelectorAll('[data-auto-ready]'))box.checked=value;
  }
  function primeAudio(){
    sounds.unlock(ranked());
    if(match)return;
    const url=URL.createObjectURL(silentPlayAudio());audio.src=url;
    audio.play().then(()=>{if(audio.src===url)audio.pause();}).catch(()=>{}).finally(()=>URL.revokeObjectURL(url));
  }
  async function enableMatchAudio(){
      if(unlocking||ready||!match||!sources.length)return;unlocking=true;
      const generation=loadGeneration;
      try{
        if(sealedCache||!cache.url(sources[match.audioIndex??match.index],server)){
          revokePlayback();
          audio.onloadeddata=null;audio.onerror=null;
          playbackUrl=URL.createObjectURL(silentPlayAudio());
          audio.src=playbackUrl;
          preparedIndex=-1;
        }else{
          audio.src=cache.url(sources[match.audioIndex??match.index],server);
          preparedIndex=match.index;
          audio.muted=true;
        }
        await audio.play();
        if(generation!==loadGeneration||!active)return;
        audio.pause();audio.currentTime=0;ready=true;songAudio.reset();
        send(room,{type:'loaded',revision:manifestRevision,indices:loaded()});send(room,{type:'ready'});render();
      }catch(failure){
        if(generation===loadGeneration&&active){
          reportAudioIssue(failure.name==='NotAllowedError'?'blocked':'play-error');
          error('Audio could not start. Tap Ready to enable audio in this browser.');
        }
      }
      finally{if(generation===loadGeneration){audio.muted=false;unlocking=false;}}
  }
  function acceptReady(){
    if(!match||player()?.left)return;
    sounds.unlock(ranked());
    if(match.phase==='loading'&&!player()?.acceptedReady)send(room,{type:'accept-ready'});
    root.querySelector('.sa-ready-reminder')?.remove();
    autoAttempt=match.id;
    void enableMatchAudio();
  }
  function updateReadyCheck(now){
    if(match.phase!=='loading'||player()?.left)return;
    if((autoReady||player()?.acceptedReady)&&autoAttempt!==match.id&&manifestId===match.id){
      acceptReady();return;
    }
    if(player()?.acceptedReady){root.querySelector('.sa-ready-reminder')?.remove();return;}
    if(!match.readyDeadline||now<match.readyDeadline-60000||now>=match.readyDeadline||readyReminder===match.id)return;
    readyReminder=match.id;
    const dialog=document.createElement('dialog');
    dialog.className='lobby-poll sa-ready-reminder';dialog.setAttribute('aria-label','Ready up');
    dialog.innerHTML='<h2>Ready Up</h2><p>Your match is waiting. Confirm within 90 seconds of matchmaking to keep your spot.</p>'+
      (match.format==='ngmc-ranked'||Object.hasOwn(songRatingPools,match.format)?'<p>Timing out costs '+RANKED_LEAVE_COST+' Rating in '+(songRatingPools[match.format]||'NGMC Ranked')+'. Three leaves in 14 days lock this queue for 72 hours.</p>':'')+
      '<button class="button mint" data-sa-action="ready">Ready</button>';
    root.append(dialog);dialog.showModal();
  }
  function tick(){
    clearTimeout(raf);if(!active||!match||['finished','cancelled'].includes(match.phase))return;
    const now=Date.now()+offset;
    updateReadyCheck(now);
    updateCounterDialog(now);
    if(sealedCache&&(match.phase==='guess'||match.preparingClip))prepareSealedClip(now);
    // Earlier matches use direct MP3s through their original playback path.
    if(!sealedCache&&match.phase==='guess'&&preparedIndex!==match.index&&!unlocking){const url=cache.url(sources[match.audioIndex??match.index],server);if(url){preparedIndex=match.index;audio.src=url;audio.onloadedmetadata=()=>{if(match?.phase==='guess')audio.currentTime=sampleStart(audio.duration,match.samplePosition,defaultPlayGuessSeconds(mode));};audio.load();}}
    if(!sealedCache&&match.phase==='guess'&&preparedIndex===match.index&&seekIndex!==match.index&&audio.readyState>=1&&!unlocking){audio.currentTime=sampleStart(audio.duration,match.samplePosition,defaultPlayGuessSeconds(mode));seekIndex=match.index;}
    const counterTimer=root.querySelector('[data-counter-timer]');if(counterTimer)counterTimer.textContent=Math.max(0,Math.ceil((Number(counterTimer.dataset.counterTimer)-now)/1000))+'s';
    updateRoundDial(root.querySelector('.ngmc-dial'),match,now);
    if(match.phase==='guess'&&now>=match.startsAt&&now<match.until){
      if(draftDirty&&now>=match.until-1000)saveCurrentDraft();
      const skip=root.querySelector('[data-sa-action=skip]');if(skip&&ready&&room?.readyState===1)skip.disabled=false;
      const input=root.querySelector('#sa-'+(teamFields()?selectedField:'anime'));
      if(input?.disabled&&!pendingLock&&pendingArtistKey===null&&ready&&room?.readyState===1){render();}
      playRoundAudio(now);
    }else if(!unlocking&&(match.phase!=='guess'||now>=match.until))audio.pause();
    const resume=root.querySelector('[data-sa-action="resume-audio"]');
    if(resume)resume.hidden=match.phase!=='guess'||!songAudio.needsGesture;
    raf=setTimeout(tick,100);
  }
  root.addEventListener('input',event=>{
    if(['sa-lobby-pool','sa-lobby-format','sa-lobby-songs','sa-lobby-time'].includes(event.target.id)){
      lobbyDraft={...customSettings(),songs:root.querySelector('#sa-lobby-songs')?.value??35};
      root.querySelector('[data-lobby-action=settings]').disabled=false;
      root.querySelector('[data-lobby-action=start]').disabled=true;
    }
    if(event.target.id==='sa-volume'){volume=Math.min(100,Math.max(0,Number(event.target.value)||0));audio.volume=volume/100;root.querySelector('#sa-volume-value').textContent=volume+'%';try{localStorage.setItem('amqtours-quiz-volume',String(volume));}catch{}return;}const field=event.target.dataset.saField;if(!field)return;draft[field]=event.target.value;delete chosen[field];findSuggestions(field,draft[field]);scheduleDraft();});
  root.addEventListener('focusin',event=>{
    const field=event.target.dataset.saField;
    if(field&&field!==searchKind){hideSuggestions();searchKind=field;}
    const checkbox=root.querySelector('[data-fuzzy-anime]');
    if(field==='anime'&&checkbox)checkbox.checked=fuzzyAnimeSearch();
  });
  root.addEventListener('keydown',event=>{const field=event.target.dataset.saField;if(!field)return;
    if(searchItems.length&&searchKind===field&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selected=selected<0?(event.key==='ArrowDown'?0:searchItems.length-1):(selected+(event.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;showSuggestions();root.querySelector('#sa-option-'+selected)?.scrollIntoView({block:'nearest'});}
    else if(event.key==='Tab'&&fields.length>1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      tabbedThisRound=true;
      hideSuggestions();
      const choices=fields.filter(f=>!root.querySelector('#sa-'+f)?.disabled);
      let next=choices[choices.indexOf(field)+(event.shiftKey?-1:1)];
      if(!next&&!event.shiftKey&&match?.format==='lobby-team'&&match.players.filter(p=>!p.left).length===1){
        next=choices[0];
      }
      if(!next)return;
      event.preventDefault();
      selectField(next);
      if(teamFields())render();
      root.querySelector('#sa-'+next)?.focus();
      scheduleDraft();
    }
    else if(event.key==='Enter'){event.preventDefault();if(event.repeat||event.isComposing)return;if(searchKind===field&&selected>=0){choose(selected);if(animeOnly()||teamFields()||match.format==='lobby-team'||field==='artist')submit(true,field);}else if(teamFields()||match.format==='lobby-team'||field===fields.at(-1))submit(true,field);else root.querySelector('#sa-'+fields[fields.indexOf(field)+1])?.focus();}
    else if(event.key==='Escape')hideSuggestions();
  });
  root.addEventListener('focusout',event=>{if(event.target.dataset.saField)setTimeout(()=>{if(!root.querySelector('.sa-combobox')?.contains(document.activeElement)&&!document.activeElement?.dataset.saField)hideSuggestions();},120);});
  root.addEventListener('submit',event=>{if(event.target.id!=='sa-answer-form')return;event.preventDefault();submit(true);});
  root.addEventListener('pointerdown',event=>{
    if(event.button===0&&document.activeElement?.matches('[data-sa-field]')&&
       event.target.closest('.sa-lock,[data-sa-submit],[data-propose],[data-sa-option]'))event.preventDefault();
  });
  root.addEventListener('click',async event=>{
    if(!active)return;
    const row=event.target.closest('.sa-answer-row');
    if(row && !event.target.closest('input,button,[role=option]'))row.querySelector('input:enabled')?.focus();
    const button=event.target.closest('button');
    if(!button)return;
    if(playPools.includes(button.dataset.queuePool)){
      try{localStorage.setItem(poolKey(mode),button.dataset.queuePool);}catch{}
      render();root.querySelector('[data-queue-pool="'+button.dataset.queuePool+'"]')?.focus({preventScroll:true});return;
    }
    if(button.dataset.ngmcFormat){ngmcFormat=button.dataset.ngmcFormat;render();return;}
    if(button.dataset.lobbyJoin||['create','join','password'].includes(button.dataset.lobbyAction)){
      const roomInfo=button.dataset.lobbyJoin?lobbies?.find(item=>item.code===button.dataset.lobbyJoin):null;
      if(button.dataset.lobbyJoin&&!roomInfo)return;
      const transmit=payload=>{
        if(['lobby-create','lobby-join'].includes(payload.type))primeAudio();
        if(!send(queue,payload))error('Reconnect to manage lobbies.');
      };
      if(roomInfo&&!roomInfo.locked){transmit({type:'lobby-join',code:roomInfo.code});return;}
      lobbyModal?.close();
      lobbyModal=lobbyDialog(button.dataset.lobbyAction||'join',mode,roomInfo,transmit,preferredPool());
      return;
    }
    if(button.dataset.lobbyAction){
      const action=button.dataset.lobbyAction;
      if(action==='ready'){
        const mine=queueStatus.players.find(p=>p.id===getPlayer()?.id);
        if(mine?.ready&&autoReady)setAutoReady(false);
        if(!mine?.ready)primeAudio();
        send(queue,{type:'lobby-ready',ready:!mine?.ready});return;
      }
      if(action==='start')primeAudio();
      if(action==='settings'){
        for(const input of root.querySelectorAll('input[type=number]'))if(!input.reportValidity())return;
        lobbyDraft=null;
      }
      send(queue,{type:'lobby-'+button.dataset.lobbyAction,...customSettings()});return;
    }
    if(button.hasAttribute('data-abort-request')){
      if(confirm('Vote to abort this match? Your vote counts as yes.'))send(room,{type:'abort-request'});
      return;
    }
    if(button.hasAttribute('data-return-request')){if(confirm('Vote to end this match and return everyone to the lobby?'))send(room,{type:'return-request'});return;}
    if(button.dataset.propose){submit(true,button.dataset.propose);return;}
    if(button.dataset.withdraw){send(room,{type:'withdraw',index:match.index,field:button.dataset.withdraw,choice:button.dataset.choice});return;}
    if(button.dataset.ballot){const field=button.dataset.ballot,choice=button.dataset.choice;send(room,{type:'vote',index:match.index,field,choice:(arena()?match.arena.ballot.some(option=>option.choice===choice&&option.selected):match.myVotes?.[field]===choice)?null:choice});return;}
    if(button.hasAttribute('data-sa-artist-info')){button.setAttribute('aria-expanded',String(button.getAttribute('aria-expanded')!=='true'));return;}
    if(button.dataset.saInputField||button.dataset.saSelect){selectField(button.dataset.saInputField||button.dataset.saSelect);hideSuggestions();render();root.querySelector('#sa-'+selectedField)?.focus({preventScroll:true});scheduleDraft();return;}
    if(button.dataset.saRemoveArtist!==undefined){artistList((player().artists||[]).filter((_,i)=>i!==Number(button.dataset.saRemoveArtist)));return;}
    if(button.dataset.saSubmit){submit(true,button.dataset.saSubmit);return;}
    if(button.dataset.saReact){send(room,{type:'reaction',index:match.index,field:button.dataset.saReact,value:button.dataset.reaction});return;}
    if(button.dataset.saCount){send(room,{type:'count',index:match.index,player:button.dataset.saCount});return;}
    if(button.dataset.saOption!=null){choose(Number(button.dataset.saOption));return;}
    if(button.dataset.saFormat){format=button.dataset.saFormat;render();return;}
    const action=button.dataset.saAction;
    if(action==='resume-audio'){sounds.unlock(ranked());playRoundAudio(Date.now()+offset,true);tick();return;}
    if(action==='skip'){saveCurrentDraft();send(room,{type:'skip',index:match.index,vote:!(match.skipVotes||[]).includes(match.me)});return;}
    if(action==='songs'){songDialog.open(match);return;}
    if(action==='queue'){
      if(waiting())cancelQueue();
      else if(queueStatus.type==='idle'){
        primeAudio();
        joinQueue(arena()?ARENA_FORMAT:duel()?DUEL_FORMAT:ranked()?ngmcFormat:format,preferredPool());
      }
    }
    else if(action==='volunteer'||action==='auto-count')send(room,{type:action});
    else if(action==='search-retry'){startWorker();render();}
    else if(action==='retry-download')preload();
    else if(action==='ready'){
      acceptReady();
    }else if(action==='leave'){if(confirm(rankedAtRisk()?leaveWarning(match.format):'Leave this match? Your teammates can continue.')){if(match?.lobby){send(queue,{type:'lobby-leave'});resetLobbyMatch();return;}if(send(room,{type:'leave'})){resetLobbyMatch();}else error('Reconnect to confirm leaving.');}}
    else if(action==='exit-lobby'||action==='again'&&(match?.lobby||queueStatus.type==='lobby-ended')){
      if(!send(queue,{type:action==='exit-lobby'?'lobby-leave':'lobby-return',match:match?.id||queueStatus.match})){error('Reconnect to choose a lobby action.');return;}
      resetLobbyMatch();
    }
    else if(action==='again'){
      send(room,{type:'leave'});
      queueStatus={type:'idle'};resetLobbyMatch();connectQueue();
    }
  });
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-fuzzy-anime]')){
      saveFuzzyAnimeSearch(event.target.checked);
      const input=root.querySelector('#sa-anime');
      if(input?.value){input.focus({preventScroll:true});findSuggestions('anime',input.value);}
      return;
    }
    if(event.target.hasAttribute('data-auto-ready')){setAutoReady(event.target.checked);if(autoReady){if(!match)primeAudio();syncLobbyReady();if(match?.phase==='loading')acceptReady();}return;}if(event.target.id==='sa-server'){if(!['EU','NAE','NAW'].includes(event.target.value))return;server=event.target.value;try{localStorage.setItem('amqtours-quiz-server',server);}catch{}}});
  function enter(nextMode='song-artist',restoreFormat=null){
      if(active&&waiting()){mode=nextMode;fields=animeOnly()?['anime']:['anime','song','artist'];render();return;}
      lastCounts=null;lobbies=null;autoReady=readAutoReady();savedServer();savedVolume();pendingArtistKey=null;mode=nextMode;fields=animeOnly()?['anime']:['anime','song','artist'];totalSongs=duel()?duelRules.songs:ranked()?35:20;active=true;activity.start();match=null;structure='';clockReady=false;queuedFormat=restoreFormat;selectQueueFormat(restoreFormat);queueStatus=restoreFormat?{type:'joining',format:restoreFormat}:{type:'idle'};notifyQueue();render();if(!getPlayer()){clearInterval(heartbeat);void refreshGuestCounts();heartbeat=setInterval(refreshGuestCounts,30000);return;}if(!worker)startWorker();connectQueue();clearInterval(heartbeat);previousHeartbeat=Date.now();heartbeat=setInterval(checkConnections,20000);
  }
  return {
    enter,quickJoin,render,waiting,cancelQueue,rankedAtRisk,confirmNavigation,
    inMatch:()=>!!match&&!['finished','cancelled'].includes(match.phase),
    leave({preserveQueue=false,cancelQueue=false}={}){
      if(!active)return;
      closeChat();closeLobbyChat();sounds.stop();
      activity.stop();songDialog.close();counterDialog.close();lobbyModal?.close();active=false;personalRatings=null;
      if(cancelQueue)send(queue,{type:'cancel'});
      overviewJoin=null;
      if(!preserveQueue){queuedFormat=null;notifyQueue();}
      queue?.close();room?.close();queue=null;room=null;clearTimeout(queueRetry);clearTimeout(roomRetry);clearTimeout(searchTimer);clearTimeout(draftTimer);clearInterval(heartbeat);clearTimeout(raf);clearAudio();ready=false;worker?.terminate();worker=null;searchReady=false;},
  };
}
