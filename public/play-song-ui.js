import {activeRankedGame,leaveWarning,RANKED_LEAVE_COST,songRatingPools} from './ngmc-leave-policy.js';
import {autoReadyHTML,lobbyEntry,roomLobby,lobbyModeNames,pointsBoard,ballotHTML,updateReturnDialog} from './play-lobby-ui.js';
import {matchLeaderboard} from './play-rankings.js';
import {songTeamsHTML,answerSideHTML,versusHTML,songResultsHTML,readyHTML,recapHTML} from './play-round-ui.js';
import {sampleStart} from './play-sample.js';
import {createPlayActivity} from './play-activity.js';
import {answerFieldsHTML,teamAnswerTilesHTML,updateTeamFields,updateArtistChips} from './play-team-ui.js';
import {createSongListDialog} from './play-song-dialog.js';
import {songLoadingBar,updateSongLoadingBar} from './song-loading.js';
import {ngmcTeams,ngmcControls,ngmcProgress} from './ngmc-ui.js';
import {createQuizAudioCache} from './quiz-audio-cache.js';
import {createSealedAudioCache,silentPlayAudio} from './play-audio-cache.js';
import {PLAY_AUDIO_PROTOCOL} from './play-audio-format.js';
const labels={anime:'Anime',song:'Song Title',artist:'Artist'};
const formats={'1v1':'1v1','3v3':'3v3','1-team':'1-Team'};
export function createSongArtistUI({root,apiBase,getPlayer,escape:esc,animeTitle,prepareTitles=async()=>{},onError,onMatchMode=()=>{},onQueueChange=()=>{}}) {
  let mode='song-artist',fields=['anime','song','artist'],firstSongs=10,totalSongs=20;
  const ranked=()=>mode==='ngmc-ranked',teamFields=()=>!!match?.teamFields;
  const songDialog=createSongListDialog(esc,animeTitle);
  let ngmcFormat='ngmc-ranked',dismissedMatch=null;
  let active=false,format='1v1',server='EU',queue=null,room=null,match=null,queueStatus={type:'idle'},worker=null,searchReady=false,searchError='',searchId=0,searchItems=[],searchKind='',selected=-1;
  let audio=new Audio(),cache=createQuizAudioCache(),downloads=null,downloadError='',sources=[],manifestId='',ready=false,playingIndex=-1,preparedIndex=-1,offset=0,clockReady=false,raf=null,heartbeat=null,searchTimer=null,draftTimer=null,queueRetry=null,roomRetry=null,queueDelay=1000,roomDelay=1000;
  let selectedField='anime',draft={anime:'',song:'',artist:''},chosen={},pendingLock=false,pendingUnlock=false,volume=30,structure='',loadGeneration=0,connecting=false,unlocking=false,lastLoaded='',progressTimer=null,pendingArtistKey=null;
  let seekIndex=-1,autoReady=false,autoAttempt='',readyReminder='',lobbyDraft=null,createSongs='',lobbyCode='';
  const preferenceKey=()=>'amqtours-play-auto-ready-'+(getPlayer()?.id||'guest');
  function readAutoReady(){try{return localStorage.getItem(preferenceKey())==='1';}catch{return false;}}
  function syncLobbyReady(){
    if(autoReady&&queueStatus.type==='lobby'&&!queueStatus.busy&&queueStatus.players.some(p=>p.id===getPlayer()?.id&&!p.ready))
      send(queue,{type:'lobby-ready',ready:true});
  }
  let sealedCache=null, playbackUrl=null, preparingRound=-1, keyRequestedAt=0;
  let draftDirty=false,lastDraft='',lastDraftAt=0;
  const savedField=()=>{try{return ['anime','song','artist'].includes(localStorage.getItem('amqtours-1team-field'))?localStorage.getItem('amqtours-1team-field'):'anime';}catch{return 'anime';}};
  function selectField(field){selectedField=field;if(match?.format==='1-team')try{localStorage.setItem('amqtours-1team-field',field);}catch{}}
  function savedServer(){try{const saved=localStorage.getItem('amqtours-quiz-server');if(['EU','NAE','NAW'].includes(saved))server=saved;}catch{}}
  savedServer();
  function savedVolume(){try{const value=localStorage.getItem('amqtours-quiz-volume');if(value!==null&&Number.isFinite(Number(value)))volume=Math.min(100,Math.max(0,Math.round(Number(value))));}catch{}audio.volume=volume/100;}
  savedVolume();audio.preload='auto';
  const volumeHTML=()=>'<label class="quiz-volume-control sa-volume">Volume<input id="sa-volume" type="range" min="0" max="100" step="1" value="'+volume+'" aria-label="Game Volume"><output id="sa-volume-value">'+volume+'%</output></label>';
  const player=()=>match?.players.find(p=>p.id===match.me);
  const send=(socket,value)=>{if(socket?.readyState===1){socket.send(JSON.stringify(['answer','artists','draft'].includes(value.type)?{...value,clientAt:Date.now()}:value));return true;}return false;};
  const activity=createPlayActivity(message=>{if(active&&match&&!['finished','cancelled'].includes(match.phase))send(room,message);});
  const error=message=>{onError(Error(message));};
  function socketURL(id){const url=new URL('play-connect',apiBase);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('protocol',String(PLAY_AUDIO_PROTOCOL));if(id)url.searchParams.set('match',id);return url;}
  function startWorker(){
    worker?.terminate();searchReady=false;searchError='';
    worker=new Worker(new URL('./play-answer-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(!active)return;if(data.type==='ready'){searchReady=true;render();}else if(data.type==='error'){searchError=data.message;render();}else if(data.type==='results'&&data.id===searchId){searchItems=data.items;selected=searchItems.length?0:-1;showSuggestions();}};
    worker.onerror=()=>{searchError='Answer search could not start. Retry to load it.';render();};worker.postMessage({type:'load'});
  }
  let queuedFormat=null;
  function waiting(){
    return active&&!!queuedFormat&&!match&&['queued','joining','matched'].includes(queueStatus.type);
  }
  function notifyQueue(){
    onQueueChange(waiting()?{format:queuedFormat,type:queueStatus.type,connected:queue?.readyState===1,
      waiting:queueStatus.waiting,needed:queueStatus.needed}:null);
  }
  function cancelQueue(){
    if(!waiting()||queueStatus.type==='matched')return;
    if(!send(queue,{type:'cancel'}))error('Reconnect to leave the queue.');
  }
  function selectQueueFormat(id){
    if(id?.startsWith('ngmc-'))ngmcFormat=id;
    else if(Object.hasOwn(formats,id))format=id;
  }
  function connectQueue(){
    if(!active||!getPlayer()||queue?.readyState===0||queue?.readyState===1)return;
    connecting=true;render();const ws=queue=new WebSocket(socketURL());
    ws.onopen=()=>{queueDelay=1000;connecting=false;render();};
    ws.onmessage=({data})=>{if(queue!==ws||!active)return;const msg=JSON.parse(data);
      if(msg.type==='error'){error(msg.message);return;}
      if(msg.type==='ranked-departure'){
        const pool=songRatingPools[msg.format]||'NGMC Ranked';
        error('Lost '+RANKED_LEAVE_COST+' Rating in '+pool+'. '+msg.activeLeaves+' active '+(msg.activeLeaves===1?'leave.':'leaves.')+
          (msg.banUntil?' '+pool+' unlocks '+new Date(msg.banUntil).toLocaleString()+'.':''));
        return;
      }
      if(msg.counts)lastCounts=msg.counts;
      if(msg.type==='queued'||msg.type==='joining'){
        // Some older queue servers report ranked for every pending NGMC lookup.
        if(msg.type==='queued'||!queuedFormat)queuedFormat=msg.format;
        selectQueueFormat(queuedFormat);
      }else if(msg.type!=='matched')queuedFormat=null;
      const changed=JSON.stringify(queueStatus)!==JSON.stringify(msg);
      if(msg.code!==queueStatus.code||msg.type!=='lobby')lobbyDraft=null;
      if(msg.type==='lobby'&&msg.code!==queueStatus.code){createSongs='';lobbyCode='';}
      queueStatus=msg;notifyQueue();syncLobbyReady();if(msg.type==='matched'&&msg.match!==dismissedMatch&&(!match||match.id!==msg.match))connectRoom(msg.match);if(changed)render();
    };
    ws.onclose=event=>{if(queue!==ws)return;queue=null;lastCounts=null;connecting=false;if(active&&event.code!==4001){queueRetry=setTimeout(connectQueue,queueDelay);queueDelay=Math.min(15000,queueDelay*2);}if(event.code===4001){queuedFormat=null;error('Play was opened in another tab.');}notifyQueue();render();};
  }
  function rankedAtRisk(){
    return active && activeRankedGame(match,Date.now()+offset) && !player()?.left;
  }
  function confirmNavigation(){
    if(!rankedAtRisk())return true;
    if(!confirm(leaveWarning))return false;
    send(room,{type:'leave'});
    return true;
  }
  function resetLobbyMatch(){
    dismissedMatch=match?.id;const old=room;room=null;old?.close();match=null;ready=false;clearTimeout(raf);clearAudio();songDialog.close();
    send(queue,{type:'ping'});render();
  }
  function connectRoom(id){
    if(!active||room?.matchId===id&&(room.readyState===0||room.readyState===1))return;
    room?.close();const ws=room=new WebSocket(socketURL(id));ws.matchId=id;
    ws.onopen=()=>{activity.snapshot();roomDelay=1000;send(ws,{type:'ping',sentAt:Date.now()});};
    ws.onmessage=({data})=>{if(room!==ws||!active)return;const msg=JSON.parse(data);
      if(msg.type==='error'){pendingArtistKey=null;pendingLock=false;pendingUnlock=false;error(msg.message);render();return;}
      if(msg.type==='pong'&&msg.sentAt){offset=msg.now-(msg.sentAt+Date.now())/2;clockReady=true;return;}
      if(msg.type==='playback'){
        if(match?.phase==='guess'&&match.index===msg.index){match.playback=msg.playback;tick();}
        return;
      }
      if(msg.type==='manifest'){
        mode=msg.mode||'song-artist';onMatchMode(mode);fields=ranked()?['anime']:['anime','song','artist'];firstSongs=msg.preload||10;totalSongs=msg.total||msg.audio.length;
        if(manifestId!==msg.id||downloadError&&sources[0]!==msg.audio[0]){clearAudio();manifestId=msg.id;sources=msg.audio;sealedCache=msg.sealed?createSealedAudioCache(apiBase,mode):null;draft={anime:'',song:'',artist:''};chosen={};ready=false;
          prepareTitles().then(()=>{if(active&&manifestId===msg.id)render();}).catch(()=>{});
        }
        lastLoaded=loaded().join(',');send(room,{type:'loaded',indices:loaded()});if(ready)send(room,{type:'ready'});preload();return;
      }
      if(msg.type==='state'){
        const previous=match;match=msg.state;if(queuedFormat){queuedFormat=null;notifyQueue();}if(!previous||previous.id!==match.id)activity.snapshot();if(!clockReady)offset=match.now-Date.now();
        if(previous?.index!==match.index||previous?.id!==match.id){clearTimeout(draftTimer);draftDirty=false;lastDraft='';selectedField=match.myDraft?.field||(match.format==='1-team'?savedField():'anime');const saved=match.myDraft?.answers||player().answers;draft={anime:saved?.anime||'',song:saved?.song||'',artist:match.myDraft?.answers?.artist||''};chosen={};pendingArtistKey=null;pendingLock=false;hideSuggestions();}
        if(player().locked||teamFields())pendingLock=false;
        if(!player().locked&&!player().field||match.phase!=='guess')pendingUnlock=false;
        if(pendingArtistKey===JSON.stringify(player().artists||[])){pendingArtistKey=null;if(!teamFields())scheduleDraft();}
        if(match.phase!=='guess'&&!unlocking)audio.pause();
        if(['finished','cancelled'].includes(match.phase)){downloads?.abort();}

        render();tick();
      }
    };
    ws.onclose=event=>{if(room!==ws)return;room=null;pendingLock=false;pendingUnlock=false;if(active&&event.code!==4001&&match?.phase!=='finished'&&match?.phase!=='cancelled'){roomRetry=setTimeout(()=>connectRoom(id),roomDelay);roomDelay=Math.min(15000,roomDelay*2);}render();};
  }
  function loaded(){
    return sources.flatMap((source,i)=>(sealedCache ? sealedCache.has(source,server) : cache.url(source,server)) ? [i] : []);
  }
  async function preload(){
    if(downloads&&!downloads.signal.aborted)return;
    const controller=downloads=new AbortController(),generation=loadGeneration,media=sealedCache||cache;downloadError='';render();
    const update=()=>{if(progressTimer||generation!==loadGeneration||!active)return;progressTimer=setTimeout(()=>{progressTimer=null;if(generation!==loadGeneration||!active)return;const indices=loaded(),key=indices.join(',');if(key!==lastLoaded&&send(room,{type:'loaded',indices})){lastLoaded=key;render();}},100);};
    try{
      await media.prepare(sources.slice(0,firstSongs),server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]),onProgress:update});
      update();
      for(let i=firstSongs;i<sources.length;i+=2){await media.prepare(sources.slice(i,i+2),server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]),onProgress:update});update();}
    }catch(err){if(!controller.signal.aborted&&generation===loadGeneration){downloadError='Audio download interrupted. Retry or choose another server before queuing again.';render();}}
    finally{if(downloads===controller)downloads=null;}
  }
  function revokePlayback() {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = null;
  }
  function clearAudio() {
    autoAttempt='';loadGeneration++; clearTimeout(progressTimer); progressTimer=null; downloads?.abort(); downloads=null;
    audio.pause(); audio.muted=false; audio.onloadedmetadata=null; audio.onloadeddata=null; audio.onerror=null;
    audio.removeAttribute('src'); audio.load();
    revokePlayback(); cache.clear(); sealedCache?.clear(); sealedCache=null;
    sources=[]; playingIndex=-1; preparedIndex=-1; seekIndex=-1; preparingRound=-1; keyRequestedAt=0; unlocking=false;
    manifestId=''; downloadError='';
  }
  function prepareSealedClip(now) {
    if (!ready || unlocking || now < match.startsAt || now >= match.until) return;
    const { index, playback } = match;
    if (!playback) {
      if (now - keyRequestedAt >= 400) {
        keyRequestedAt=now;
        send(room,{type:'playback',index});
      }
      return;
    }
    const ticket=sources[playback.slot];
    if(preparedIndex===index || preparingRound===index || !sealedCache.has(ticket,server))return;
    const generation=loadGeneration;
    const current=()=>active&&generation===loadGeneration&&match?.index===index&&match.phase==='guess';
    const cannotPlay=()=>{
      if(!current())return;
      ready=false;
      render();
      error('Could not play the encrypted clip. Tap Ready to retry.');
    };
    preparingRound=index;
    sealedCache.decrypt(ticket,server,playback.key).then(blob=>{
      if(!blob||!current())return;
      revokePlayback();
      audio.onloadedmetadata=null;
      audio.onloadeddata=()=>{if(current())tick();};
      audio.onerror=cannotPlay;
      playbackUrl=URL.createObjectURL(blob);
      audio.src=playbackUrl;
      preparedIndex=index;
      audio.load();
    }).catch(cannotPlay).finally(()=>{if(generation===loadGeneration&&preparingRound===index)preparingRound=-1;});
  }
  function hideSuggestions(){searchId++;searchItems=[];selected=-1;for(const el of root.querySelectorAll('.sa-suggestions'))el.replaceChildren();for(const el of root.querySelectorAll('[data-sa-field]')){el.setAttribute('aria-expanded','false');el.removeAttribute('aria-activedescendant');}}
  function showSuggestions(){
    const list=root.querySelector('#sa-options-'+searchKind),input=root.querySelector('#sa-'+searchKind);if(!list||document.activeElement!==input)return;
    list.innerHTML=searchItems.map((item,i)=>'<button type="button" role="option" tabindex="-1" id="sa-option-'+i+'" aria-selected="'+(i===selected)+'" data-sa-option="'+i+'">'+esc(searchKind==='anime'?animeTitle({anime:item}):item)+'</button>').join('');
    input.setAttribute('aria-expanded',String(!!searchItems.length));if(selected>=0)input.setAttribute('aria-activedescendant','sa-option-'+selected);
    list.classList.toggle('above',input.getBoundingClientRect().bottom>innerHeight-260);
  }
  function choose(i){const item=searchItems[i];if(!item)return;const input=root.querySelector('#sa-'+searchKind);draft[searchKind]=searchKind==='anime'?animeTitle({anime:item}):item;chosen[searchKind]=item;input.value=draft[searchKind];hideSuggestions();input.focus({preventScroll:true});scheduleDraft();}
  function currentArtists(){
    const list=[...(player()?.artists||[])],name=String(chosen.artist||draft.artist||'').trim();
    if(name&&!list.some(x=>x.normalize('NFKC').toLowerCase()===name.normalize('NFKC').toLowerCase()))list.push(name);
    return list;
  }
  function saveCurrentDraft(){
    clearTimeout(draftTimer);
    if(!draftDirty||!match||match.phase!=='guess'||player()?.locked||pendingLock||pendingUnlock||pendingArtistKey!==null||Date.now()+offset<match.startsAt||Date.now()+offset>=match.until)return;
    const field=teamFields()?selectedField:document.activeElement?.dataset.saField||selectedField;
    const payload={type:'draft',index:match.index,field,answers:Object.fromEntries(fields.map(f=>[f,chosen[f]||draft[f]||''])),...(ranked()?{}:{artists:currentArtists()})};
    const key=JSON.stringify(payload);if(key===lastDraft){draftDirty=false;return;}
    if(send(room,payload)){lastDraft=key;lastDraftAt=Date.now();draftDirty=false;}
  }
  function scheduleDraft(){if(match?.format==='lobby-team')return;draftDirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(saveCurrentDraft,Math.max(0,250-(Date.now()-lastDraftAt)));}

  function artistList(list){
    if(!match||match.phase!=='guess'||pendingUnlock||player()?.locked||pendingArtistKey!==null||Date.now()+offset<match.startsAt)return;
    if(teamFields()&&player().field&&player().field!=='artist')return;
    const message=teamFields()?{type:'answer',field:'artist',artists:list}:{type:'artists',artists:list};
    if(send(room,{...message,index:match.index})){clearTimeout(draftTimer);draftDirty=false;lastDraft='';pendingArtistKey=JSON.stringify(list);draft.artist='';delete chosen.artist;root.querySelector('#sa-artist').value='';hideSuggestions();render();}
    else error('Reconnecting… Retry adding the artist once connected.');
  }
  function addArtist(){const name=String(chosen.artist||draft.artist||'').trim();if(!name)return;const list=player()?.artists||[];if(list.some(x=>x.toLowerCase()===name.toLowerCase()))return;artistList([...list,name]);}
  function cancelSubmit(){
    if(!match||match.phase!=='guess'||pendingLock||pendingUnlock||pendingArtistKey!==null||Date.now()+offset>=match.until)return;
    clearTimeout(draftTimer);draftDirty=false;lastDraft='';
    if(send(room,{type:'unlock',index:match.index})){pendingUnlock=true;hideSuggestions();render();}
    else error('Reconnecting… Retry cancelling once connected.');
  }
  function submit(lock,field){
    if(match?.format==='lobby-team'){
      field??=document.activeElement?.dataset.saField;
      const answer=chosen[field]||draft[field];
      if(answer&&send(room,{type:'propose',index:match.index,field,answer})){
        delete chosen[field];draft[field]='';root.querySelector('#sa-'+field).value='';hideSuggestions();
      }
      return;
    }
    if(lock&&!teamFields()&&player()?.locked){cancelSubmit();return;}
    if(pendingUnlock)return;
    if(field==='artist'){addArtist();return;}
    if(!match||match.phase!=='guess'||player()?.locked||pendingLock||pendingArtistKey!==null||Date.now()+offset<match.startsAt)return;
    if(teamFields()){
      if(!field||!String(chosen[field]||draft[field]||'').trim())return;
      if(send(room,{type:'answer',index:match.index,field,answer:chosen[field]||draft[field]})){clearTimeout(draftTimer);draftDirty=false;lastDraft='';pendingLock=true;hideSuggestions();render();}
      else error('Reconnecting… Retry submitting once connected.');
      return;
    }
    const answers=Object.fromEntries(fields.map(field=>[field,field==='artist'?currentArtists().join(', '):chosen[field]||draft[field]||'']));
    if(send(room,{type:'answer',index:match.index,answers,...(ranked()?{}:{artists:currentArtists()}),lock})){clearTimeout(draftTimer);draftDirty=false;lastDraft='';if(lock){pendingLock=true;hideSuggestions();render();}}
    else error('Reconnecting… Your answers are kept. Retry locking once connected.');
  }
  function teamHTML(){if(match.lobby)return pointsBoard(match,esc);return ranked()?ngmcTeams(match,esc):songTeamsHTML(match,esc);}
  function sharedHTML(){if(match.format==='lobby-team')return ballotHTML(match,esc);if(match.lobby)return '';if(teamFields()||match.format==='1v1')return '';if(ranked())return match.phase==='loading'?'':ngmcControls(match,esc);const me=player();return '<section class="sa-shared"><h3>Team Answers</h3><div class="sa-shared-head"><span>Player</span>'+fields.map(f=>'<span>'+labels[f]+'</span>').join('')+'</div>'+match.players.filter(p=>p.team===me.team).map(p=>'<div class="sa-shared-row"><strong>'+esc(p.name)+'</strong>'+fields.map(f=>'<span>'+esc(p.answers?.[f]||'—')+'</span>').join('')+'</div>').join('')+'</section>';}
  function customSettings(){
    return {format:root.querySelector('#sa-lobby-format')?.value||'lobby-team',
      songs:Number((root.querySelector('#sa-lobby-songs')||root.querySelector('#sa-create-songs'))?.value||20),
      seconds:Number(root.querySelector('#sa-lobby-time')?.value??30)};
  }
  let lastCounts=null;
  async function refreshGuestCounts(){
    if(!active||getPlayer()||document.hidden)return;
    try{
      const res=await fetch(new URL('play-queue-counts',apiBase));
      if(!res.ok)return;
      const counts=await res.json();
      if(!active||getPlayer())return;
      lastCounts=counts;
      for(const badge of root.querySelectorAll('[data-queue-format]')){
        const count=counts[badge.dataset.queueFormat]||0;
        badge.textContent=count+' in queue';badge.dataset.waiting=String(count>0);
      }
    }catch{/* Try again on the next visible refresh. */}
  }
  function queueBadge(id){
    const count=lastCounts?.[id]??0;
    return '<small class="sa-queue-count" data-queue-format="'+id+'" data-waiting="'+(count>0)+'">'+(lastCounts?count+' in queue':'— in queue')+'</small>';
  }
  function lobbyHTML(){
    if(queueStatus.type==='lobby-ended')return '<section class="sa-lobby"><h1>Match Ended</h1>'+endLobbyActions()+'</section>';
    if(queueStatus.type==='lobby')return roomLobby(queueStatus,getPlayer()?.id,esc,autoReady,lobbyDraft);
    const otherQueue=waiting()&&ranked()!==queuedFormat.startsWith('ngmc-');
    return '<section class="sa-lobby"><span class="sa-eyebrow">Matchmaking</span><h1>'+(ranked()?'NGMC Ranked':'Song / Artist')+'</h1>'+(ranked()?'<div class="sa-formats">'+[['ngmc-ranked','4v4 Ranked'],['ngmc-3v3','3v3 Unranked']].map(([id,name])=>'<button type="button" data-ngmc-format="'+id+'" class="'+(id===ngmcFormat?'selected':'')+'" '+(queueStatus.type==='idle'?'':'disabled')+'><strong>'+name+'</strong>'+queueBadge(id)+'</button>').join('')+'</div>':'<div class="sa-formats" role="group" aria-label="Match Format">'+Object.entries(formats).map(([id,name])=>'<button type="button" data-sa-format="'+id+'" class="'+(format===id?'selected':'')+'" '+(queueStatus.type!=='idle'?'disabled':'')+'><strong>'+name+'</strong><small>'+(id==='1v1'?'Head to Head':id==='3v3'?'Two Teams of Three':'Three Players · One Team')+'</small>'+queueBadge(id)+'</button>').join('')+'</div>')+'<div class="sa-rules">'+(ranked()?'<span><strong>'+ (ngmcFormat==='ngmc-3v3'?'3v3</strong> Unranked':'4v4</strong> Ranked')+'</span><span><strong>5</strong> Lives</span><span><strong>35</strong> Songs</span>':'<span><strong>20</strong> Random Songs</span><span><strong>3</strong> Points per Song</span>')+'<span><strong>'+(ranked()?'20s':'30s')+'</strong> to Answer</span></div><div class="sa-queue-controls"><label>Audio Server<select id="sa-server" '+(queueStatus.type!=='idle'?'disabled':'')+'>'+['EU','NAE','NAW'].map(s=>'<option '+(s===server?'selected':'')+'>'+s+'</option>').join('')+'</select></label><button class="button mint" type="button" data-sa-action="queue" '+(otherQueue||!searchReady||connecting||!getPlayer()||queue?.readyState!==1?'disabled':'')+'>'+(otherQueue?'Queued in Another Mode':queueStatus.type==='joining'?'Cancel Matchmaking':queueStatus.type==='queued'?'Leave Queue':queueStatus.type==='matched'?'Preparing Match…':'Find Match')+'</button>'+autoReadyHTML(autoReady)+'</div><p class="sa-status" role="status">'+(!getPlayer()?'Sign in above to join a queue.':searchError?esc(searchError):!searchReady?'Loading answer lists…':connecting?'Connecting…':otherQueue?'':queueStatus.type==='joining'?'Joining matchmaking…':queueStatus.type==='queued'?'Finding Players · '+queueStatus.waiting+' / '+queueStatus.needed:queueStatus.type==='matched'?'Selecting songs for your match…':'')+'</p>'+(searchError?'<button class="button secondary" type="button" data-sa-action="search-retry">Retry Answer Lists</button>':'')+(!ranked()&&queueStatus.type==='idle'?lobbyEntry(!getPlayer()||queue?.readyState!==1?'disabled':''):'')+'</section>';}
  function endLobbyActions(){
    const disabled=queueStatus.type==='lobby-ended'?'':' disabled';
    return '<button class="button secondary" data-sa-action="exit-lobby"'+disabled+'>Leave Lobby</button> <button class="button mint" data-sa-action="again"'+disabled+'>Return to Lobby</button>';
  }
  function gameHTML(){
    const done=['finished','cancelled'].includes(match.phase);
    const heading='<div class="sa-game-heading"><div><span class="sa-eyebrow">'+(ranked()?(match.format==='ngmc-3v3'?'NGMC Unranked · 3v3':'NGMC Ranked · 4v4'):'Song / Artist · '+(lobbyModeNames[match.format]||formats[match.format]))+'</span><h1>'+(done?match.phase==='finished'?'Match Complete':'Match Ended':'Song '+(match.index+1)+' <small>/ '+totalSongs+'</small>')+'</h1></div><div class="sa-game-actions">'+volumeHTML()+(match.lobby&&!done?'<button class="button secondary" data-return-request>Return to Lobby</button>':'')+'<button type="button" class="button secondary" data-sa-action="songs">Song List</button>'+(done&&match.lobby?endLobbyActions():'<button type="button" class="button secondary" data-sa-action="'+(done?'again':'leave')+'">'+(done?(match.lobby?'Return to Lobby':'Play Again'):'Leave Match')+'</button>')+'</div></div>';
    if(done)return heading+'<div class="sa-scoreboard"></div><p class="sa-match-outcome">'+esc(match.reason||winnerText())+'</p>'+(ranked()?'<div class="sa-results">'+match.history.map(row=>'<div><span>'+(row.index+1)+'</span><strong>'+esc(row.song)+'</strong><span>'+esc(row.artist)+'</span><b>'+row.results.find(p=>p.id===match.me).earned+'/1</b></div>').join('')+'</div>':match.lobby?'':songResultsHTML(match,esc,animeTitle));
    const tiles=teamFields()?'<div class="sa-live-answer-sides '+(match.teams.length>1?'is-versus':'')+'"><section><h3 class="sa-side-heading">Your Team</h3>'+teamAnswerTilesHTML()+'</section>'+(match.teams.length>1?'<section><h3 class="sa-side-heading">Opponents</h3><div class="sa-opponent-answers"></div></section>':'')+'</div>':'';
    return heading+'<div class="sa-ready-wrap"></div><div class="sa-scoreboard"></div><div class="sa-play-panel '+(ranked()?'ngmc-panel':'sa-song-panel')+'"><div class="sa-round-status"></div><div class="sa-timer" role="timer" aria-label="Time remaining"></div><div class="ngmc-time-track" role="progressbar" aria-label="Guess Time Remaining" aria-valuemin="0" aria-valuemax="'+(ranked()?20:30)+'"><span></span></div><div class="sa-download-status"></div><div class="sa-shared-wrap"></div>'+tiles+'<form id="sa-answer-form"><div class="sa-answer-fields">'+answerFieldsHTML(fields,teamFields())+'</div><button type="submit" class="button mint sa-lock">Submit</button></form><div class="sa-reveal-wrap"></div>'+(match.format==='1-team'?'<div class="sa-skip-row"><button class="button secondary" type="button" data-sa-action="skip" aria-pressed="false">Skip Song · 0/2</button></div>':'')+(ranked()?ngmcProgress(match):'')+'</div>';
  }
  function winnerText(){if(match.format==='lobby-ffa'){const best=Math.max(...match.teams);return match.teams[player().team]===best?(match.teams.filter(v=>v===best).length>1?'Tied for First':'You won'):'You lost';}if(match.teams.length===1)return 'Your team scored '+match.teams[0]+' points.';const mine=match.teams[player().team],other=match.teams[1-player().team];const subject=match.format==='1v1'?'You':'Your team';return mine===other?'A tie!':subject+(mine>other?' won':' lost');}
  function render(){
    if(!active)return;
    if(match)songDialog.update(match);
    if(!match){
      if(!root.isConnected)return;
      const focused=root.contains(document.activeElement)?document.activeElement.id:null;
      root.innerHTML=lobbyHTML();structure='';
      const code=root.querySelector('#sa-lobby-code'),songs=root.querySelector('#sa-create-songs');
      if(code)code.value=lobbyCode;
      if(songs)songs.value=createSongs;
      if(focused)root.querySelector('#'+CSS.escape(focused))?.focus({preventScroll:true});
      return;
    }
    const next=match.id+':'+match.index+':'+(['finished','cancelled'].includes(match.phase)?match.phase:'play');
    if(next!==structure){root.innerHTML=gameHTML();structure=next;for(const field of fields){const input=root.querySelector('#sa-'+field);if(input)input.value=draft[field]||'';}}
    for(const button of root.querySelectorAll('[data-sa-action="exit-lobby"],[data-sa-action="again"]')){
      if(match.lobby)button.disabled=queueStatus.type!=='lobby-ended';
    }
    updateReturnDialog(root,match,payload=>send(room,payload));
    root.querySelector('.sa-scoreboard').innerHTML=match.phase==='finished'?(match.lobby||match.format==='ngmc-3v3'?pointsBoard(match,esc):matchLeaderboard(match,esc)):teamHTML();
    if(ranked()&&root.querySelector('.ngmc-progress'))root.querySelector('.ngmc-progress').outerHTML=ngmcProgress(match);
    const status=root.querySelector('.sa-round-status');if(!status)return;
    const me=player(),loadedCount=loaded().length;
    status.textContent=match.phase==='loading'?'Getting Everyone Ready':match.phase==='buffering'?'Waiting for Audio':match.phase==='counting'?'Counting Guesses':match.phase==='reveal'?'Answers Revealed':'Listen & Answer';
    const downloadStatus=root.querySelector('.sa-download-status'),downloadBar=downloadStatus.querySelector('.song-loading-bar');
    downloadStatus.innerHTML=(ranked()?(['loading','buffering'].includes(match.phase)?'<span>Waiting Until Everyone Is Ready</span>'+songLoadingBar({label:'Waiting for Audio'}):''):loadedCount<sources.length||['loading','buffering'].includes(match.phase)?'<div class="sa-download-meter"><div><span>'+'Loading Audio</span><strong>'+Math.round(100*loadedCount/sources.length)+'%</strong></div>'+songLoadingBar({label:'Song Download',loaded:loadedCount,total:sources.length})+'</div>':'')+(downloadError?'<span class="incorrect">'+esc(downloadError)+'</span><button type="button" class="button secondary" data-sa-action="retry-download">Retry Download</button>':'');
    if(downloadBar&&downloadStatus.querySelector('.song-loading-bar')){downloadStatus.querySelector('.song-loading-bar').replaceWith(downloadBar);updateSongLoadingBar(downloadBar,ranked()?null:loadedCount,ranked()?null:sources.length);}
    root.querySelector('.sa-shared-wrap').innerHTML=sharedHTML();
    const waiting=['loading','buffering'].includes(match.phase)||!ready;
    const readyWrap=root.querySelector('.sa-ready-wrap');readyWrap.hidden=!waiting;
    const readyMarkup=waiting?readyHTML(match,true,ready,esc)+autoReadyHTML(autoReady)+(ranked()&&match.phase==='loading'?ngmcControls(match,esc):''):'';
    if(readyWrap.innerHTML!==readyMarkup)readyWrap.innerHTML=readyMarkup;
    const liveSides=root.querySelector('.sa-live-answer-sides');if(liveSides)liveSides.hidden=waiting;
    const form=root.querySelector('#sa-answer-form');form.hidden=waiting||['reveal','counting'].includes(match.phase);
    const disabled=match.phase!=='guess'||me.locked||pendingLock||pendingUnlock||pendingArtistKey!==null||!room||!ready||Date.now()+offset<match.startsAt;
    if(teamFields()){const focused=document.activeElement?.dataset.saField;selectedField=updateTeamFields(root,match,disabled,esc,selectedField,animeTitle);if(focused&&focused!==selectedField&&!disabled)root.querySelector('#sa-'+selectedField)?.focus({preventScroll:true});}else for(const el of form.querySelectorAll('input,button'))el.disabled=disabled;
    updateArtistChips(root,match,disabled,esc);
    form.classList.toggle('sa-field-claims',teamFields());form.querySelector('.sa-lock').hidden=teamFields();
    const lockButton=form.querySelector('.sa-lock');
    lockButton.disabled=match.phase!=='guess'||!ready||pendingLock||pendingUnlock||pendingArtistKey!==null||room?.readyState!==1||Date.now()+offset<match.startsAt||Date.now()+offset>=match.until;
    lockButton.textContent=pendingUnlock?'Cancelling…':me.locked?'Locked · Cancel Submission':pendingLock?'Submitting…':!room?'Reconnecting…':'Submit';
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
    const last=match.history.at(-1),revealed=['reveal','counting'].includes(match.phase)&&last?.index===match.index;
    const opponents=root.querySelector('.sa-opponent-answers');if(opponents)opponents.innerHTML=answerSideHTML(match,revealed?last:null,1-me.team,esc,animeTitle);
    const recap=root.querySelector('.sa-reveal-wrap'),html=revealed?(ranked()||teamFields()||match.lobby?recapHTML(match,esc,animeTitle):versusHTML(match,last,esc,animeTitle)+recapHTML(match,esc,animeTitle)):'';
    if(recap.innerHTML!==html)recap.innerHTML=html;
    const skip=root.querySelector('[data-sa-action=skip]');if(skip){const votes=match.skipVotes||[];skip.disabled=match.phase!=='guess'||Date.now()+offset<match.startsAt||!ready;skip.setAttribute('aria-pressed',String(votes.includes(match.me)));skip.textContent=(votes.includes(match.me)?'Cancel Skip':'Skip Song')+' · '+votes.length+'/2';}
  }
  function setAutoReady(value){
    autoReady=value;try{localStorage.setItem(preferenceKey(),value?'1':'0');}catch{}
    for(const box of root.querySelectorAll('[data-auto-ready]'))box.checked=value;
  }
  function primeAudio(){
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
        audio.pause();audio.currentTime=0;ready=true;playingIndex=-1;
        send(room,{type:'loaded',indices:loaded()});send(room,{type:'ready'});render();
      }catch{if(generation===loadGeneration&&active)error('Audio could not start. Please retry or check your browser’s autoplay setting.');}
      finally{if(generation===loadGeneration){audio.muted=false;unlocking=false;}}
  }
  function acceptReady(){
    if(!match||player()?.left)return;
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
    const now=Date.now()+offset,timer=root.querySelector('.sa-timer');
    updateReadyCheck(now);
    if(sealedCache&&match.phase==='guess')prepareSealedClip(now);
    // Earlier matches use direct MP3s through their original playback path.
    if(!sealedCache&&match.phase==='guess'&&preparedIndex!==match.index&&!unlocking){const url=cache.url(sources[match.audioIndex??match.index],server);if(url){preparedIndex=match.index;audio.src=url;audio.onloadedmetadata=()=>{if(match?.phase==='guess')audio.currentTime=sampleStart(audio.duration,match.samplePosition,ranked()?20:30);};audio.load();}}
    if(!sealedCache&&match.phase==='guess'&&preparedIndex===match.index&&seekIndex!==match.index&&audio.readyState>=1&&!unlocking){audio.currentTime=sampleStart(audio.duration,match.samplePosition,ranked()?20:30);seekIndex=match.index;}
    const counterTimer=root.querySelector('[data-counter-timer]');if(counterTimer)counterTimer.textContent=Math.max(0,Math.ceil((match.counterDeadline-now)/1000))+'s';
    const duration=match.lobby?.seconds??(ranked()?20:30);const timeTrack=root.querySelector('.ngmc-time-track');if(timeTrack){const remaining=match.phase==='guess'?Math.max(0,Math.min(duration,(match.until-Math.max(now,match.startsAt))/1000)):0;timeTrack.hidden=match.phase!=='guess'||duration===0;timeTrack.setAttribute('aria-valuemax',duration);timeTrack.style.setProperty('--ngmc-time',String(remaining/(duration||1)));timeTrack.setAttribute('aria-valuenow',remaining.toFixed(1));timeTrack.classList.toggle('is-urgent',remaining<=5);}
    if(timer){const ms=match.phase==='guess'&&now<match.startsAt?match.startsAt-now:match.until-now;const value=duration===0&&match.phase==='guess'&&now>=match.startsAt?'∞':['guess','reveal','counting'].includes(match.phase)?Math.max(0,Math.ceil(ms/1000))+'s':'';if(timer.textContent!==value)timer.textContent=value;}
    if(match.phase==='guess'&&now>=match.startsAt&&now<match.until){
      if(draftDirty&&now>=match.until-1000)saveCurrentDraft();
      const skip=root.querySelector('[data-sa-action=skip]');if(skip&&ready)skip.disabled=false;
      const input=root.querySelector('#sa-'+(teamFields()?selectedField:'anime'));
      if(input?.disabled&&!player().locked&&(!teamFields()||!player().field||player().field==='artist')&&!pendingLock&&!pendingUnlock&&pendingArtistKey===null&&ready&&room?.readyState===1){render();if(!document.querySelector('dialog[open]'))input.focus({preventScroll:true});}
      if(ready&&playingIndex!==match.index&&preparedIndex===match.index&&audio.readyState>=1){playingIndex=match.index;audio.currentTime=Math.min(Math.max(0,audio.duration-.05),(sealedCache?0:sampleStart(audio.duration,match.samplePosition,ranked()?20:30))+Math.max(0,(now-match.startsAt)/1000));audio.play().catch(()=>{playingIndex=-1;ready=false;render();error('Tap Ready · Enable Audio to allow playback.');});}
    }else if(!unlocking&&(match.phase!=='guess'||now>=match.until))audio.pause();
    raf=setTimeout(tick,100);
  }
  root.addEventListener('input',event=>{
    if(event.target.id==='sa-create-songs')createSongs=event.target.value;
    if(event.target.id==='sa-lobby-code')lobbyCode=event.target.value;
    if(['sa-lobby-format','sa-lobby-songs','sa-lobby-time'].includes(event.target.id)){
      lobbyDraft={...customSettings(),songs:root.querySelector('#sa-lobby-songs').value};
      root.querySelector('[data-lobby-action=settings]').disabled=false;
      root.querySelector('[data-lobby-action=start]').disabled=true;
    }
    if(event.target.id==='sa-volume'){volume=Math.min(100,Math.max(0,Number(event.target.value)||0));audio.volume=volume/100;root.querySelector('#sa-volume-value').textContent=volume+'%';try{localStorage.setItem('amqtours-quiz-volume',String(volume));}catch{}return;}const field=event.target.dataset.saField;if(!field)return;draft[field]=event.target.value;delete chosen[field];searchKind=field;searchItems=[];selected=-1;const id=++searchId;clearTimeout(searchTimer);searchTimer=setTimeout(()=>worker?.postMessage({type:'search',id,kind:field,query:draft[field]}),70);scheduleDraft();});
  root.addEventListener('focusin',event=>{const field=event.target.dataset.saField;if(field&&field!==searchKind){hideSuggestions();searchKind=field;}});
  root.addEventListener('keydown',event=>{const field=event.target.dataset.saField;if(!field)return;
    if(searchItems.length&&searchKind===field&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;showSuggestions();root.querySelector('#sa-option-'+selected)?.scrollIntoView({block:'nearest'});}
    else if(event.key==='Tab'&&fields.length>1){const choices=fields.filter(f=>!teamFields()||!root.querySelector('[data-sa-input-field="'+f+'"]')?.disabled);if(choices.length>1){event.preventDefault();const next=choices[(choices.indexOf(field)+(event.shiftKey?-1:1)+choices.length)%choices.length];selectField(next);hideSuggestions();render();root.querySelector('#sa-'+next)?.focus({preventScroll:true});scheduleDraft();}}
    else if(event.key==='Enter'){event.preventDefault();if(event.repeat||event.isComposing)return;if(searchKind===field&&searchItems.length){choose(Math.max(0,selected));if(ranked()||teamFields()||match.format==='lobby-team'||field==='artist')submit(true,field);}else if(teamFields()||match.format==='lobby-team'||field===fields.at(-1))submit(true,field);else root.querySelector('#sa-'+fields[fields.indexOf(field)+1])?.focus();}
    else if(event.key==='Escape')hideSuggestions();
  });
  root.addEventListener('focusout',event=>{if(event.target.dataset.saField)setTimeout(()=>{if(!root.querySelector('.sa-combobox')?.contains(document.activeElement)&&!document.activeElement?.dataset.saField)hideSuggestions();},120);});
  root.addEventListener('submit',event=>{if(event.target.id!=='sa-answer-form')return;event.preventDefault();submit(true);});
  root.addEventListener('click',async event=>{
    if(!active)return;
    const row=event.target.closest('.sa-answer-row');
    if(row && !event.target.closest('input,button,[role=option]'))row.querySelector('input:enabled')?.focus();
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.ngmcFormat){ngmcFormat=button.dataset.ngmcFormat;render();return;}
    if(button.dataset.lobbyAction){
      const action=button.dataset.lobbyAction;
      if(action==='ready'){
        const mine=queueStatus.players.find(p=>p.id===getPlayer()?.id);
        if(mine?.ready&&autoReady)setAutoReady(false);
        if(!mine?.ready)primeAudio();
        send(queue,{type:'lobby-ready',ready:!mine?.ready});return;
      }
      if(action==='create'||action==='join'||action==='start')primeAudio();
      if(action==='settings'||action==='create'){
        for(const input of root.querySelectorAll('input[type=number]'))if(!input.reportValidity())return;
        lobbyDraft=null;
      }
      send(queue,{type:'lobby-'+button.dataset.lobbyAction,...customSettings(),code:root.querySelector('#sa-lobby-code')?.value});return;
    }
    if(button.hasAttribute('data-return-request')){if(confirm('Vote to end this match and return everyone to the lobby?'))send(room,{type:'return-request'});return;}
    if(button.dataset.propose){submit(true,button.dataset.propose);return;}
    if(button.dataset.ballot){send(room,{type:'vote',index:match.index,field:button.dataset.ballot,choice:button.dataset.choice||null});return;}
    if(button.hasAttribute('data-sa-artist-info')){button.setAttribute('aria-expanded',String(button.getAttribute('aria-expanded')!=='true'));return;}
    if(button.dataset.saInputField||button.dataset.saSelect){selectField(button.dataset.saInputField||button.dataset.saSelect);hideSuggestions();render();root.querySelector('#sa-'+selectedField)?.focus({preventScroll:true});scheduleDraft();return;}
    if(button.dataset.saRemoveArtist!==undefined){artistList((player().artists||[]).filter((_,i)=>i!==Number(button.dataset.saRemoveArtist)));return;}
    if(button.dataset.saAddArtist!==undefined){addArtist();return;}
    if(button.dataset.saSubmit){if(teamFields()&&player()?.field===button.dataset.saSubmit)cancelSubmit();else submit(true,button.dataset.saSubmit);return;}
    if(button.dataset.saReact){send(room,{type:'reaction',index:match.index,field:button.dataset.saReact,value:button.dataset.reaction});return;}
    if(button.dataset.saCount){send(room,{type:'count',index:match.index,player:button.dataset.saCount});return;}
    if(button.dataset.saOption!=null){choose(Number(button.dataset.saOption));return;}
    if(button.dataset.saFormat){format=button.dataset.saFormat;render();return;}
    const action=button.dataset.saAction;
    if(action==='skip'){saveCurrentDraft();send(room,{type:'skip',index:match.index,vote:!(match.skipVotes||[]).includes(match.me)});return;}
    if(action==='songs'){songDialog.open(match);return;}
    if(action==='queue'){if(queueStatus.type==='idle')primeAudio();if(['queued','joining'].includes(queueStatus.type))send(queue,{type:'cancel'});else if(queueStatus.type==='idle'){const selectedFormat=ranked()?ngmcFormat:format;if(send(queue,{type:'join',mode,format:selectedFormat})){queuedFormat=selectedFormat;queueStatus={type:'joining',format:selectedFormat};notifyQueue();render();}}}
    else if(action==='volunteer')send(room,{type:'volunteer'});
    else if(action==='search-retry'){startWorker();render();}
    else if(action==='retry-download')preload();
    else if(action==='ready'){
      acceptReady();
    }else if(action==='leave'){if(confirm(rankedAtRisk()?leaveWarning:'Leave this match? Your teammates can continue.')){if(match?.lobby){send(queue,{type:'lobby-leave'});resetLobbyMatch();return;}if(send(room,{type:'leave'})){resetLobbyMatch();}else error('Reconnect to confirm leaving.');}}
    else if(action==='exit-lobby'||action==='again'&&(match?.lobby||queueStatus.type==='lobby-ended')){
      if(!send(queue,{type:action==='exit-lobby'?'lobby-leave':'lobby-return',match:match?.id||queueStatus.match})){error('Reconnect to choose a lobby action.');return;}
      resetLobbyMatch();
    }
    else if(action==='again'){room?.close();room=null;match=null;clearAudio();queueStatus={type:'idle'};connectQueue();render();}
  });
  root.addEventListener('change',event=>{if(event.target.hasAttribute('data-auto-ready')){setAutoReady(event.target.checked);if(autoReady){if(!match)primeAudio();syncLobbyReady();if(match?.phase==='loading')acceptReady();}return;}if(event.target.id==='sa-server'){if(!['EU','NAE','NAW'].includes(event.target.value))return;server=event.target.value;try{localStorage.setItem('amqtours-quiz-server',server);}catch{}}});
  return {
    enter(nextMode='song-artist',restoreFormat=null){
      if(active&&waiting()){mode=nextMode;fields=ranked()?['anime']:['anime','song','artist'];render();return;}
      lastCounts=null;autoReady=readAutoReady();savedServer();savedVolume();pendingUnlock=false;pendingArtistKey=null;mode=nextMode;fields=ranked()?['anime']:['anime','song','artist'];firstSongs=ranked()?12:10;totalSongs=ranked()?35:20;active=true;activity.start();match=null;structure='';clockReady=false;queuedFormat=restoreFormat;selectQueueFormat(restoreFormat);queueStatus=restoreFormat?{type:'joining',format:restoreFormat}:{type:'idle'};notifyQueue();render();if(!getPlayer()){clearInterval(heartbeat);void refreshGuestCounts();heartbeat=setInterval(refreshGuestCounts,30000);return;}if(!worker)startWorker();connectQueue();clearInterval(heartbeat);heartbeat=setInterval(()=>{send(queue,{type:'ping'});send(room,{type:'ping',sentAt:Date.now()});},20000);},
    render,waiting,cancelQueue,rankedAtRisk,confirmNavigation,
    leave({preserveQueue=false,cancelQueue=false}={}){
      if(!active)return;
      activity.stop();songDialog.close();active=false;
      if(cancelQueue)send(queue,{type:'cancel'});
      if(!preserveQueue){queuedFormat=null;notifyQueue();}
      queue?.close();room?.close();queue=null;room=null;clearTimeout(queueRetry);clearTimeout(roomRetry);clearTimeout(searchTimer);clearTimeout(draftTimer);clearInterval(heartbeat);clearTimeout(raf);clearAudio();ready=false;worker?.terminate();worker=null;searchReady=false;},
  };
}
