import {songTeamsHTML,answerSideHTML,versusHTML,songResultsHTML,readyHTML} from './play-round-ui.js';
import {createPlayActivity} from './play-activity.js';
import {answerFieldsHTML,teamAnswerTilesHTML,updateTeamFields,updateArtistChips} from './play-team-ui.js';
import {createSongListDialog} from './play-song-dialog.js';
import {songLoadingBar,updateSongLoadingBar} from './song-loading.js';
import {ngmcTeams,ngmcControls,ngmcProgress} from './ngmc-ui.js';
import {createQuizAudioCache} from './quiz-audio-cache.js';
const labels={anime:'Anime',song:'Song Title',artist:'Artist'};
const formats={'1v1':'1v1','3v3':'3v3','1-team':'1-Team'};
export function createSongArtistUI({root,apiBase,getPlayer,escape:esc,animeTitle,onError,onMatchMode=()=>{}}) {
  let mode='song-artist',fields=['anime','song','artist'],firstSongs=10,totalSongs=20;
  const ranked=()=>mode==='ngmc-ranked',teamFields=()=>!!match?.teamFields;
  const songDialog=createSongListDialog(esc,animeTitle);
  let active=false,format='1v1',server='EU',queue=null,room=null,match=null,queueStatus={type:'idle'},worker=null,searchReady=false,searchError='',searchId=0,searchItems=[],searchKind='',selected=-1;
  let audio=new Audio(),cache=createQuizAudioCache(),downloads=null,downloadError='',sources=[],manifestId='',ready=false,playingIndex=-1,preparedIndex=-1,offset=0,clockReady=false,raf=null,heartbeat=null,searchTimer=null,draftTimer=null,queueRetry=null,roomRetry=null,queueDelay=1000,roomDelay=1000;
  let selectedField='anime',draft={anime:'',song:'',artist:''},chosen={},pendingLock=false,pendingUnlock=false,volume=30,structure='',loadGeneration=0,connecting=false,unlocking=false,lastLoaded='',progressTimer=null,pendingArtistKey=null;
  function savedServer(){try{const saved=localStorage.getItem('amqtours-quiz-server');if(['EU','NAE','NAW'].includes(saved))server=saved;}catch{}}
  savedServer();
  function savedVolume(){try{const value=localStorage.getItem('amqtours-quiz-volume');if(value!==null&&Number.isFinite(Number(value)))volume=Math.min(100,Math.max(0,Math.round(Number(value))));}catch{}audio.volume=volume/100;}
  savedVolume();audio.preload='auto';
  const volumeHTML=()=>'<label class="quiz-volume-control sa-volume">Volume<input id="sa-volume" type="range" min="0" max="100" step="1" value="'+volume+'" aria-label="Game Volume"><output id="sa-volume-value">'+volume+'%</output></label>';
  const player=()=>match?.players.find(p=>p.id===match.me);
  const send=(socket,value)=>{if(socket?.readyState===1){socket.send(JSON.stringify(['answer','artists'].includes(value.type)?{...value,clientAt:Date.now()}:value));return true;}return false;};
  const activity=createPlayActivity(message=>{if(active&&match&&!['finished','cancelled'].includes(match.phase))send(room,message);});
  const error=message=>{onError(Error(message));};
  function socketURL(id){const url=new URL('play-connect',apiBase);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('protocol','2');if(id)url.searchParams.set('match',id);return url;}
  function startWorker(){
    worker?.terminate();searchReady=false;searchError='';
    worker=new Worker(new URL('./play-answer-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(!active)return;if(data.type==='ready'){searchReady=true;render();}else if(data.type==='error'){searchError=data.message;render();}else if(data.type==='results'&&data.id===searchId){searchItems=data.items;selected=searchItems.length?0:-1;showSuggestions();}};
    worker.onerror=()=>{searchError='Answer search could not start. Retry to load it.';render();};worker.postMessage({type:'load'});
  }
  function connectQueue(){
    if(!active||!getPlayer()||queue?.readyState===0||queue?.readyState===1)return;
    connecting=true;render();const ws=queue=new WebSocket(socketURL());
    ws.onopen=()=>{queueDelay=1000;connecting=false;render();};
    ws.onmessage=({data})=>{if(queue!==ws||!active)return;const msg=JSON.parse(data);
      if(msg.type==='error'){error(msg.message);return;}
      const changed=JSON.stringify(queueStatus)!==JSON.stringify(msg);queueStatus=msg;if(msg.type==='matched'&&(!match||match.id!==msg.match))connectRoom(msg.match);if(changed)render();
    };
    ws.onclose=event=>{if(queue!==ws)return;queue=null;connecting=false;if(active&&event.code!==4001){queueRetry=setTimeout(connectQueue,queueDelay);queueDelay=Math.min(15000,queueDelay*2);}if(event.code===4001)error('Play was opened in another tab.');render();};
  }
  function connectRoom(id){
    if(!active||room?.matchId===id&&(room.readyState===0||room.readyState===1))return;
    room?.close();const ws=room=new WebSocket(socketURL(id));ws.matchId=id;
    ws.onopen=()=>{activity.snapshot();roomDelay=1000;send(ws,{type:'ping',sentAt:Date.now()});};
    ws.onmessage=({data})=>{if(room!==ws||!active)return;const msg=JSON.parse(data);
      if(msg.type==='error'){pendingArtistKey=null;pendingLock=false;pendingUnlock=false;error(msg.message);render();return;}
      if(msg.type==='pong'&&msg.sentAt){offset=msg.now-(msg.sentAt+Date.now())/2;clockReady=true;return;}
      if(msg.type==='manifest'){
        mode=msg.mode||'song-artist';onMatchMode(mode);fields=ranked()?['anime']:['anime','song','artist'];firstSongs=msg.preload||10;totalSongs=msg.total||msg.audio.length;
        if(manifestId!==msg.id){clearAudio();manifestId=msg.id;sources=msg.audio;draft={anime:'',song:'',artist:''};chosen={};ready=false;}
        lastLoaded=loaded().join(',');send(room,{type:'loaded',indices:loaded()});if(ready)send(room,{type:'ready'});preload();return;
      }
      if(msg.type==='state'){
        const previous=match;match=msg.state;if(!previous||previous.id!==match.id)activity.snapshot();if(!clockReady)offset=match.now-Date.now();
        if(previous?.index!==match.index||previous?.id!==match.id){selectedField='anime';draft={...player().answers,anime:player().answers?.anime||'',song:player().answers?.song||'',artist:player().answers?.artist||''};chosen={};pendingArtistKey=null;pendingLock=false;hideSuggestions();}
        if(player().locked||teamFields())pendingLock=false;
        if(!player().locked&&!player().field||match.phase!=='guess')pendingUnlock=false;
        if(pendingArtistKey===JSON.stringify(player().artists||[]))pendingArtistKey=null;
        if(match.phase!=='guess'&&!unlocking)audio.pause();
        if(['finished','cancelled'].includes(match.phase)){downloads?.abort();}
        render();tick();
      }
    };
    ws.onclose=event=>{if(room!==ws)return;room=null;pendingLock=false;pendingUnlock=false;if(active&&event.code!==4001&&match?.phase!=='finished'&&match?.phase!=='cancelled'){roomRetry=setTimeout(()=>connectRoom(id),roomDelay);roomDelay=Math.min(15000,roomDelay*2);}render();};
  }
  function loaded(){return sources.flatMap((source,i)=>cache.url(source,server)?[i]:[]);}
  async function preload(){
    if(downloads&&!downloads.signal.aborted)return;
    const controller=downloads=new AbortController(),generation=loadGeneration;downloadError='';render();
    const update=()=>{if(progressTimer||generation!==loadGeneration||!active)return;progressTimer=setTimeout(()=>{progressTimer=null;if(generation!==loadGeneration||!active)return;const indices=loaded(),key=indices.join(',');if(key!==lastLoaded&&send(room,{type:'loaded',indices})){lastLoaded=key;render();}},100);};
    try{
      await cache.prepare(sources.slice(0,firstSongs),server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]),onProgress:update});
      update();
      for(let i=firstSongs;i<sources.length;i+=2){await cache.prepare(sources.slice(i,i+2),server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]),onProgress:update});update();}
    }catch(err){if(!controller.signal.aborted&&generation===loadGeneration){downloadError='Audio download interrupted. Retry or choose another server before queuing again.';render();}}
    finally{if(downloads===controller)downloads=null;}
  }
  function clearAudio(){loadGeneration++;clearTimeout(progressTimer);progressTimer=null;downloads?.abort();downloads=null;audio.pause();audio.removeAttribute('src');audio.load();cache.clear();sources=[];playingIndex=-1;preparedIndex=-1;manifestId='';downloadError='';}
  function hideSuggestions(){searchId++;searchItems=[];selected=-1;for(const el of root.querySelectorAll('.sa-suggestions'))el.replaceChildren();for(const el of root.querySelectorAll('[data-sa-field]')){el.setAttribute('aria-expanded','false');el.removeAttribute('aria-activedescendant');}}
  function showSuggestions(){
    const list=root.querySelector('#sa-options-'+searchKind),input=root.querySelector('#sa-'+searchKind);if(!list||document.activeElement!==input)return;
    list.innerHTML=searchItems.map((item,i)=>'<button type="button" role="option" tabindex="-1" id="sa-option-'+i+'" aria-selected="'+(i===selected)+'" data-sa-option="'+i+'">'+esc(searchKind==='anime'?animeTitle({anime:item}):item)+'</button>').join('');
    input.setAttribute('aria-expanded',String(!!searchItems.length));if(selected>=0)input.setAttribute('aria-activedescendant','sa-option-'+selected);
    list.classList.toggle('above',input.getBoundingClientRect().bottom>innerHeight-260);
  }
  function choose(i){const item=searchItems[i];if(!item)return;const input=root.querySelector('#sa-'+searchKind);draft[searchKind]=searchKind==='anime'?animeTitle({anime:item}):item;chosen[searchKind]=item;input.value=draft[searchKind];hideSuggestions();input.focus({preventScroll:true});scheduleDraft();}
  function scheduleDraft(){if(teamFields())return;clearTimeout(draftTimer);draftTimer=setTimeout(()=>submit(false),300);}
  function artistList(list){
    if(!match||match.phase!=='guess'||pendingUnlock||player()?.locked||pendingArtistKey!==null||Date.now()+offset<match.startsAt)return;
    if(teamFields()&&player().field&&player().field!=='artist')return;
    const message=teamFields()?{type:'answer',field:'artist',artists:list}:{type:'artists',artists:list};
    if(send(room,{...message,index:match.index})){pendingArtistKey=JSON.stringify(list);draft.artist='';delete chosen.artist;root.querySelector('#sa-artist').value='';hideSuggestions();render();}
    else error('Reconnecting… Retry adding the artist once connected.');
  }
  function addArtist(){const name=String(chosen.artist||draft.artist||'').trim();if(!name)return;const list=player()?.artists||[];if(list.some(x=>x.toLowerCase()===name.toLowerCase()))return;artistList([...list,name]);}
  function cancelSubmit(){
    if(!match||match.phase!=='guess'||pendingLock||pendingUnlock||pendingArtistKey!==null||Date.now()+offset>=match.until)return;
    clearTimeout(draftTimer);
    if(send(room,{type:'unlock',index:match.index})){pendingUnlock=true;hideSuggestions();render();}
    else error('Reconnecting… Retry cancelling once connected.');
  }
  function submit(lock,field){
    if(lock&&!teamFields()&&player()?.locked){cancelSubmit();return;}
    if(pendingUnlock)return;
    if(field==='artist'){addArtist();return;}
    if(!match||match.phase!=='guess'||player()?.locked||pendingLock||pendingArtistKey!==null||Date.now()+offset<match.startsAt)return;
    if(teamFields()){
      if(!field||!String(chosen[field]||draft[field]||'').trim())return;
      if(send(room,{type:'answer',index:match.index,field,answer:chosen[field]||draft[field]})){pendingLock=true;hideSuggestions();render();}
      else error('Reconnecting… Retry submitting once connected.');
      return;
    }
    const answers=Object.fromEntries(fields.map(field=>[field,field==='artist'?(player().artists||[]).join(', '):chosen[field]||draft[field]||'']));
    if(send(room,{type:'answer',index:match.index,answers,lock})){if(lock){pendingLock=true;hideSuggestions();render();}}
    else error('Reconnecting… Your answers are kept. Retry locking once connected.');
  }
  function teamHTML(){return ranked()?ngmcTeams(match,esc):songTeamsHTML(match,esc);}
  function sharedHTML(){if(teamFields()||match.format==='1v1')return '';if(ranked())return ngmcControls(match,esc);const me=player();return '<section class="sa-shared"><h3>Team Answers</h3><div class="sa-shared-head"><span>Player</span>'+fields.map(f=>'<span>'+labels[f]+'</span>').join('')+'</div>'+match.players.filter(p=>p.team===me.team).map(p=>'<div class="sa-shared-row"><strong>'+esc(p.name)+'</strong>'+fields.map(f=>'<span>'+esc(p.answers?.[f]||'—')+'</span>').join('')+'</div>').join('')+'</section>';}
  function recapHTML(){const row=match.history.at(-1);if(!row)return '';const mine=row.results.find(p=>p.id===match.me);return '<section class="sa-reveal"><span class="sa-eyebrow">Song '+(row.index+1)+' · +'+mine.earned+(ranked()?' Correct':match.format==='1v1'?' Points':' Contributions')+'</span>'+fields.map(field=>'<div class="'+(mine.correct[field]?'correct':'incorrect')+'"><small>'+labels[field]+'</small><strong>'+esc(field==='anime'?animeTitle({anime:row.anime}):row[field])+'</strong><span>'+esc(mine.answers[field]||'No answer')+'</span></div>').join('')+'</section>';}
  function lobbyHTML(){return '<section class="sa-lobby"><span class="sa-eyebrow">Matchmaking</span><h1>'+(ranked()?'NGMC Ranked':'Song / Artist')+'</h1>'+(ranked()?'':'<div class="sa-formats" role="group" aria-label="Match Format">'+Object.entries(formats).map(([id,name])=>'<button type="button" data-sa-format="'+id+'" class="'+(format===id?'selected':'')+'" '+(queueStatus.type!=='idle'?'disabled':'')+'><strong>'+name+'</strong><small>'+(id==='1v1'?'Head to Head':id==='3v3'?'Two Teams of Three':'Three Players · One Team')+'</small></button>').join('')+'</div>')+'<div class="sa-rules">'+(ranked()?'<span><strong>4v4</strong> Ranked</span><span><strong>5</strong> Lives</span><span><strong>35</strong> Songs</span>':'<span><strong>20</strong> Random Songs</span><span><strong>3</strong> Points per Song</span>')+'<span><strong>'+(ranked()?'20s':'30s')+'</strong> to Answer</span></div><div class="sa-queue-controls"><label>Audio Server<select id="sa-server" '+(queueStatus.type!=='idle'?'disabled':'')+'>'+['EU','NAE','NAW'].map(s=>'<option '+(s===server?'selected':'')+'>'+s+'</option>').join('')+'</select></label><button class="button mint" type="button" data-sa-action="queue" '+(!searchReady||connecting||!getPlayer()||queue?.readyState!==1?'disabled':'')+'>'+(queueStatus.type==='joining'?'Cancel Matchmaking':queueStatus.type==='queued'?'Leave Queue':queueStatus.type==='matched'?'Preparing Match…':'Find Match')+'</button></div><p class="sa-status" role="status">'+(!getPlayer()?'Sign in above to join a queue.':searchError?esc(searchError):!searchReady?'Loading answer lists…':connecting?'Connecting…':queueStatus.type==='joining'?'Loading Your NGMC Rating…':queueStatus.type==='queued'?'Finding Players · '+queueStatus.waiting+' / '+queueStatus.needed:queueStatus.type==='matched'?'Selecting songs for your match…':'')+'</p><p class="form-hint">Match activity and submitted answers are recorded for host review for 30 days.</p>'+(searchError?'<button class="button secondary" type="button" data-sa-action="search-retry">Retry Answer Lists</button>':'')+'</section>';}
  function gameHTML(){
    const done=['finished','cancelled'].includes(match.phase);
    const heading='<div class="sa-game-heading"><div><span class="sa-eyebrow">'+(ranked()?'NGMC Ranked · 4v4':'Song / Artist · '+formats[match.format])+'</span><h1>'+(done?match.phase==='finished'?'Match Complete':'Match Ended':'Song '+(match.index+1)+' <small>/ '+totalSongs+'</small>')+'</h1></div><div class="sa-game-actions">'+volumeHTML()+'<button type="button" class="button secondary" data-sa-action="songs">Song List</button><button type="button" class="button secondary" data-sa-action="'+(done?'again':'leave')+'">'+(done?'Play Again':'Leave Match')+'</button></div></div>';
    if(done)return heading+'<div class="sa-scoreboard"></div><p class="sa-match-outcome">'+esc(match.reason||winnerText())+'</p>'+(ranked()?'<div class="sa-results">'+match.history.map(row=>'<div><span>'+(row.index+1)+'</span><strong>'+esc(row.song)+'</strong><span>'+esc(row.artist)+'</span><b>'+row.results.find(p=>p.id===match.me).earned+'/1</b></div>').join('')+'</div>':songResultsHTML(match,esc,animeTitle));
    const tiles=teamFields()?'<div class="sa-live-answer-sides '+(match.teams.length>1?'is-versus':'')+'"><section><h3 class="sa-side-heading">Your Team</h3>'+teamAnswerTilesHTML()+'</section>'+(match.teams.length>1?'<section><h3 class="sa-side-heading">Opponents</h3><div class="sa-opponent-answers"></div></section>':'')+'</div>':'';
    return heading+'<div class="sa-ready-wrap"></div><div class="sa-scoreboard"></div><div class="sa-play-panel '+(ranked()?'ngmc-panel':'sa-song-panel')+'"><div class="sa-round-status"></div><div class="sa-timer" role="timer" aria-label="Time remaining"></div><div class="ngmc-time-track" role="progressbar" aria-label="Guess Time Remaining" aria-valuemin="0" aria-valuemax="'+(ranked()?20:30)+'"><span></span></div><div class="sa-download-status"></div><div class="sa-shared-wrap"></div>'+tiles+'<form id="sa-answer-form"><div class="sa-answer-fields">'+answerFieldsHTML(fields,teamFields())+'</div><button type="submit" class="button mint sa-lock">Submit</button></form><div class="sa-reveal-wrap"></div>'+(ranked()?ngmcProgress(match):'')+'</div>';
  }
  function winnerText(){if(match.teams.length===1)return 'Your team scored '+match.teams[0]+' / 60.';const mine=match.teams[player().team],other=match.teams[1-player().team];const subject=match.format==='1v1'?'You':'Your team';return mine===other?'A tie!':subject+(mine>other?' won':' lost');}
  function render(){
    if(!active)return;
    if(match)songDialog.update(match);
    if(!match){root.innerHTML=lobbyHTML();structure='';return;}
    const next=match.id+':'+match.index+':'+(['finished','cancelled'].includes(match.phase)?match.phase:'play');
    if(next!==structure){root.innerHTML=gameHTML();structure=next;for(const field of fields){const input=root.querySelector('#sa-'+field);if(input)input.value=draft[field]||'';}}
    root.querySelector('.sa-scoreboard').innerHTML=teamHTML();
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
    const readyMarkup=waiting?readyHTML(match,loadedCount>=firstSongs,ready,esc):'';
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
    const last=match.history.at(-1),revealed=['reveal','counting'].includes(match.phase)&&last?.index===match.index;
    const opponents=root.querySelector('.sa-opponent-answers');if(opponents)opponents.innerHTML=answerSideHTML(match,revealed?last:null,1-me.team,esc,animeTitle);
    root.querySelector('.sa-reveal-wrap').innerHTML=revealed?(ranked()||teamFields()?recapHTML():versusHTML(match,last,esc,animeTitle)+recapHTML()):'';
  }
  function tick(){
    clearTimeout(raf);if(!active||!match||['finished','cancelled'].includes(match.phase))return;
    const now=Date.now()+offset,timer=root.querySelector('.sa-timer');
    // Decode the next cached MP3 during the shared countdown, not at its end.
    if(match.phase==='guess'&&preparedIndex!==match.index&&!unlocking){const url=cache.url(sources[match.audioIndex??match.index],server);if(url){preparedIndex=match.index;audio.src=url;audio.load();}}
    const counterTimer=root.querySelector('[data-counter-timer]');if(counterTimer)counterTimer.textContent=Math.max(0,Math.ceil((match.counterDeadline-now)/1000))+'s';
    const timeTrack=root.querySelector('.ngmc-time-track');if(timeTrack){const remaining=match.phase==='guess'?Math.max(0,Math.min(ranked()?20:30,(match.until-Math.max(now,match.startsAt))/1000)):0;timeTrack.hidden=match.phase!=='guess';timeTrack.style.setProperty('--ngmc-time',String(remaining/(ranked()?20:30)));timeTrack.setAttribute('aria-valuenow',remaining.toFixed(1));timeTrack.classList.toggle('is-urgent',remaining<=5);}
    if(timer){const ms=match.phase==='guess'&&now<match.startsAt?match.startsAt-now:match.until-now;const value=['guess','reveal','counting'].includes(match.phase)?Math.max(0,Math.ceil(ms/1000))+'s':'';if(timer.textContent!==value)timer.textContent=value;}
    if(match.phase==='guess'&&now>=match.startsAt&&now<match.until){
      const input=root.querySelector('#sa-'+(teamFields()?selectedField:'anime'));
      if(input?.disabled&&!player().locked&&(!teamFields()||!player().field||player().field==='artist')&&!pendingLock&&!pendingUnlock&&pendingArtistKey===null&&ready&&room?.readyState===1){render();if(!document.querySelector('dialog[open]'))input.focus({preventScroll:true});}
      if(ready&&playingIndex!==match.index&&preparedIndex===match.index){playingIndex=match.index;audio.currentTime=Math.max(0,(now-match.startsAt)/1000);audio.play().catch(()=>{playingIndex=-1;ready=false;render();error('Tap Ready · Enable Audio to allow playback.');});}
    }else if(!unlocking&&(match.phase!=='guess'||now>=match.until))audio.pause();
    raf=setTimeout(tick,100);
  }
  root.addEventListener('input',event=>{if(event.target.id==='sa-volume'){volume=Math.min(100,Math.max(0,Number(event.target.value)||0));audio.volume=volume/100;root.querySelector('#sa-volume-value').textContent=volume+'%';try{localStorage.setItem('amqtours-quiz-volume',String(volume));}catch{}return;}const field=event.target.dataset.saField;if(!field)return;draft[field]=event.target.value;delete chosen[field];searchKind=field;searchItems=[];selected=-1;const id=++searchId;clearTimeout(searchTimer);searchTimer=setTimeout(()=>worker?.postMessage({type:'search',id,kind:field,query:draft[field]}),70);scheduleDraft();});
  root.addEventListener('focusin',event=>{const field=event.target.dataset.saField;if(field&&field!==searchKind){hideSuggestions();searchKind=field;}});
  root.addEventListener('keydown',event=>{const field=event.target.dataset.saField;if(!field)return;
    if(searchItems.length&&searchKind===field&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;showSuggestions();root.querySelector('#sa-option-'+selected)?.scrollIntoView({block:'nearest'});}
    else if(event.key==='Enter'){event.preventDefault();if(event.repeat||event.isComposing)return;if(searchKind===field&&searchItems.length){choose(Math.max(0,selected));if(ranked()||teamFields()||field==='artist')submit(true,field);}else if(teamFields()||field===fields.at(-1))submit(true,field);else root.querySelector('#sa-'+fields[fields.indexOf(field)+1])?.focus();}
    else if(event.key==='Escape')hideSuggestions();
  });
  root.addEventListener('focusout',event=>{if(event.target.dataset.saField)setTimeout(()=>{if(!root.querySelector('.sa-combobox')?.contains(document.activeElement)&&!document.activeElement?.dataset.saField)hideSuggestions();},120);});
  root.addEventListener('submit',event=>{if(event.target.id!=='sa-answer-form')return;event.preventDefault();submit(true);});
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!active||!button)return;
    if(button.dataset.saInputField){selectedField=button.dataset.saInputField;hideSuggestions();render();root.querySelector('#sa-'+selectedField)?.focus({preventScroll:true});return;}
    if(button.dataset.saRemoveArtist!==undefined){artistList((player().artists||[]).filter((_,i)=>i!==Number(button.dataset.saRemoveArtist)));return;}
    if(button.dataset.saAddArtist!==undefined){addArtist();return;}
    if(button.dataset.saSubmit){if(teamFields()&&player()?.field===button.dataset.saSubmit)cancelSubmit();else submit(true,button.dataset.saSubmit);return;}
    if(button.dataset.saReact){send(room,{type:'reaction',index:match.index,field:button.dataset.saReact,value:button.dataset.reaction});return;}
    if(button.dataset.saCount){send(room,{type:'count',index:match.index,player:button.dataset.saCount});return;}
    if(button.dataset.saOption!=null){choose(Number(button.dataset.saOption));return;}
    if(button.dataset.saFormat){format=button.dataset.saFormat;render();return;}
    const action=button.dataset.saAction;
    if(action==='songs'){songDialog.open(match);return;}
    if(action==='queue'){if(['queued','joining'].includes(queueStatus.type))send(queue,{type:'cancel'});else if(queueStatus.type==='idle'){if(send(queue,{type:'join',mode,format:ranked()?'ngmc-ranked':format})){queueStatus={type:'joining'};render();}}}
    else if(action==='volunteer')send(room,{type:'volunteer'});
    else if(action==='search-retry'){startWorker();render();}
    else if(action==='retry-download')preload();
    else if(action==='ready'){
      if(unlocking)return;unlocking=true;
      try{audio.src=cache.url(sources[match.audioIndex??match.index],server);preparedIndex=match.index;audio.muted=true;await audio.play();audio.pause();audio.currentTime=0;ready=true;playingIndex=-1;send(room,{type:'loaded',indices:loaded()});send(room,{type:'ready'});render();}catch{error('Audio could not start. Please retry or check your browser’s autoplay setting.');}finally{audio.muted=false;unlocking=false;}
    }else if(action==='leave'){if(confirm('Leave this match? Your teammates can continue.')){send(room,{type:'leave'});room?.close();room=null;match=null;clearAudio();queue?.close();queue=null;queueStatus={type:'idle'};render();}}
    else if(action==='again'){room?.close();room=null;match=null;clearAudio();queueStatus={type:'idle'};connectQueue();render();}
  });
  root.addEventListener('change',event=>{if(event.target.id==='sa-server'){if(!['EU','NAE','NAW'].includes(event.target.value))return;server=event.target.value;try{localStorage.setItem('amqtours-quiz-server',server);}catch{}}});
  return {
    enter(nextMode='song-artist'){savedServer();savedVolume();pendingUnlock=false;pendingArtistKey=null;mode=nextMode;fields=ranked()?['anime']:['anime','song','artist'];firstSongs=ranked()?12:10;totalSongs=ranked()?35:20;active=true;activity.start();match=null;structure='';clockReady=false;queueStatus={type:'idle'};render();if(!worker)startWorker();connectQueue();clearInterval(heartbeat);heartbeat=setInterval(()=>{send(queue,{type:'ping'});send(room,{type:'ping',sentAt:Date.now()});},20000);},
    render,
    leave(){activity.stop();songDialog.close();active=false;send(queue,{type:'cancel'});queue?.close();room?.close();queue=null;room=null;clearTimeout(queueRetry);clearTimeout(roomRetry);clearTimeout(searchTimer);clearTimeout(draftTimer);clearInterval(heartbeat);clearTimeout(raf);clearAudio();ready=false;worker?.terminate();worker=null;searchReady=false;},
  };
}
