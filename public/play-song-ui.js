import {createQuizAudioCache} from './quiz-audio-cache.js';
const fields=['anime','song','artist'],labels={anime:'Anime',song:'Song Title',artist:'Artist'};
const formats={'1v1':'1v1','3v3':'3v3','1-team':'1-Team'};
export function createSongArtistUI({root,apiBase,getPlayer,escape:esc,animeTitle,onError}) {
  let active=false,format='1v1',server='EU',queue=null,room=null,match=null,queueStatus={type:'idle'},worker=null,searchReady=false,searchError='',searchId=0,searchItems=[],searchKind='',selected=-1;
  let audio=new Audio(),cache=createQuizAudioCache(),downloads=null,downloadError='',sources=[],manifestId='',ready=false,playingIndex=-1,preparedIndex=-1,offset=0,clockReady=false,raf=null,heartbeat=null,searchTimer=null,draftTimer=null,queueRetry=null,roomRetry=null,queueDelay=1000,roomDelay=1000;
  let draft={anime:'',song:'',artist:''},chosen={},pendingLock=false,structure='',loadGeneration=0,connecting=false,unlocking=false;
  audio.preload='auto';audio.volume=.7;
  const player=()=>match?.players.find(p=>p.id===match.me);
  const send=(socket,value)=>{if(socket?.readyState===1){socket.send(JSON.stringify(value));return true;}return false;};
  const error=message=>{onError(Error(message));};
  function socketURL(id){const url=new URL('play-connect',apiBase);url.protocol=url.protocol==='https:'?'wss:':'ws:';if(id)url.searchParams.set('match',id);return url;}
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
    ws.onclose=event=>{if(queue!==ws)return;queue=null;connecting=false;if(active&&event.code!==4001){queueRetry=setTimeout(connectQueue,queueDelay);queueDelay=Math.min(15000,queueDelay*2);}if(event.code===4001)error('Song/Artist was opened in another tab.');render();};
  }
  function connectRoom(id){
    if(!active||room?.matchId===id&&(room.readyState===0||room.readyState===1))return;
    room?.close();const ws=room=new WebSocket(socketURL(id));ws.matchId=id;
    ws.onopen=()=>{roomDelay=1000;send(ws,{type:'ping',sentAt:Date.now()});};
    ws.onmessage=({data})=>{if(room!==ws||!active)return;const msg=JSON.parse(data);
      if(msg.type==='error'){pendingLock=false;error(msg.message);render();return;}
      if(msg.type==='pong'&&msg.sentAt){offset=msg.now-(msg.sentAt+Date.now())/2;clockReady=true;return;}
      if(msg.type==='manifest'){
        if(manifestId!==msg.id){clearAudio();manifestId=msg.id;sources=msg.audio;draft={anime:'',song:'',artist:''};chosen={};ready=false;}
        send(room,{type:'loaded',indices:loaded()});if(ready)send(room,{type:'ready'});preload();return;
      }
      if(msg.type==='state'){
        const previous=match;match=msg.state;if(!clockReady)offset=match.now-Date.now();
        if(previous?.index!==match.index||previous?.id!==match.id){draft={...player().answers,anime:player().answers.anime||'',song:player().answers.song||'',artist:player().answers.artist||''};chosen={};pendingLock=false;hideSuggestions();}
        if(player().locked)pendingLock=false;
        if(match.phase!=='guess'&&!unlocking)audio.pause();
        if(['finished','cancelled'].includes(match.phase)){downloads?.abort();}
        render();tick();
      }
    };
    ws.onclose=event=>{if(room!==ws)return;room=null;pendingLock=false;if(active&&event.code!==4001&&match?.phase!=='finished'&&match?.phase!=='cancelled'){roomRetry=setTimeout(()=>connectRoom(id),roomDelay);roomDelay=Math.min(15000,roomDelay*2);}render();};
  }
  function loaded(){return sources.flatMap((source,i)=>cache.url(source,server)?[i]:[]);}
  async function preload(){
    if(downloads&&!downloads.signal.aborted)return;
    const controller=downloads=new AbortController(),generation=loadGeneration;downloadError='';render();
    const update=()=>{if(generation!==loadGeneration||!active)return;send(room,{type:'loaded',indices:loaded()});if(ready)send(room,{type:'ready'});render();};
    try{
      await cache.prepare(sources.slice(0,10),server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]),onProgress:update});
      update();
      for(let i=10;i<20;i+=2){await cache.prepare(sources.slice(i,i+2),server,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]),onProgress:update});update();}
    }catch(err){if(!controller.signal.aborted&&generation===loadGeneration){downloadError='Audio download interrupted. Retry or choose another server before queuing again.';render();}}
    finally{if(downloads===controller)downloads=null;}
  }
  function clearAudio(){loadGeneration++;downloads?.abort();downloads=null;audio.pause();audio.removeAttribute('src');audio.load();cache.clear();sources=[];playingIndex=-1;preparedIndex=-1;manifestId='';downloadError='';}
  function hideSuggestions(){searchId++;searchItems=[];selected=-1;for(const el of root.querySelectorAll('.sa-suggestions'))el.replaceChildren();for(const el of root.querySelectorAll('[data-sa-field]')){el.setAttribute('aria-expanded','false');el.removeAttribute('aria-activedescendant');}}
  function showSuggestions(){
    const list=root.querySelector('#sa-options-'+searchKind),input=root.querySelector('#sa-'+searchKind);if(!list||document.activeElement!==input)return;
    list.innerHTML=searchItems.map((item,i)=>'<button type="button" role="option" tabindex="-1" id="sa-option-'+i+'" aria-selected="'+(i===selected)+'" data-sa-option="'+i+'">'+esc(searchKind==='anime'?animeTitle({anime:item}):item)+'</button>').join('');
    input.setAttribute('aria-expanded',String(!!searchItems.length));if(selected>=0)input.setAttribute('aria-activedescendant','sa-option-'+selected);
    list.classList.toggle('above',input.getBoundingClientRect().bottom>innerHeight-260);
  }
  function choose(i){const item=searchItems[i];if(!item)return;const input=root.querySelector('#sa-'+searchKind);draft[searchKind]=searchKind==='anime'?animeTitle({anime:item}):item;chosen[searchKind]=item;input.value=draft[searchKind];hideSuggestions();input.focus({preventScroll:true});scheduleDraft();}
  function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>submit(false),300);}
  function submit(lock){
    if(!match||match.phase!=='guess'||player()?.locked||pendingLock||Date.now()+offset<match.startsAt)return;
    const answers=Object.fromEntries(fields.map(field=>[field,chosen[field]||draft[field]||'']));
    if(send(room,{type:'answer',index:match.index,answers,lock})){if(lock){pendingLock=true;hideSuggestions();render();}}
    else error('Reconnecting… Your answers are kept. Retry locking once connected.');
  }
  function teamHTML(){const me=player();return '<div class="sa-team-list">'+match.teams.map((score,i)=>'<section class="sa-team"><header><span>'+(match.teams.length===1?'Your Team':i===me.team?'Your Team':'Opponents')+'</span><strong>'+score+'<small> / 60</small></strong></header>'+match.players.filter(p=>p.team===i).map(p=>'<div class="sa-player"><span>'+esc(p.name)+(p.id===me.id?' <small>You</small>':'')+'</span><strong>'+p.score+' <small>contributions</small></strong><small>'+(p.left?'Left':match.phase==='loading'?p.loaded+'/20 downloaded · '+(p.ready?'Ready':'Not Ready'):p.locked?'Locked':'')+'</small></div>').join('')+'</section>').join('')+'</div>';}
  function sharedHTML(){const me=player();return '<section class="sa-shared"><h3>Team Answers</h3><div class="sa-shared-head"><span>Player</span>'+fields.map(f=>'<span>'+labels[f]+'</span>').join('')+'</div>'+match.players.filter(p=>p.team===me.team).map(p=>'<div class="sa-shared-row"><strong>'+esc(p.name)+'</strong>'+fields.map(f=>'<span>'+esc(p.answers?.[f]||'—')+'</span>').join('')+'</div>').join('')+'</section>';}
  function recapHTML(){const row=match.history.at(-1);if(!row)return '';const mine=row.results.find(p=>p.id===match.me);return '<section class="sa-reveal"><span class="sa-eyebrow">Song '+(row.index+1)+' · +'+mine.earned+' Contributions</span>'+fields.map(field=>'<div class="'+(mine.correct[field]?'correct':'incorrect')+'"><small>'+labels[field]+'</small><strong>'+esc(field==='anime'?animeTitle({anime:row.anime}):row[field])+'</strong><span>'+esc(mine.answers[field]||'No answer')+'</span></div>').join('')+'</section>';}
  function lobbyHTML(){return '<section class="sa-lobby"><span class="sa-eyebrow">Matchmaking</span><h1>Song / Artist</h1><div class="sa-formats" role="group" aria-label="Match Format">'+Object.entries(formats).map(([id,name])=>'<button type="button" data-sa-format="'+id+'" class="'+(format===id?'selected':'')+'" '+(queueStatus.type!=='idle'?'disabled':'')+'><strong>'+name+'</strong><small>'+(id==='1v1'?'Head to Head':id==='3v3'?'Two Teams of Three':'Three Players · One Team')+'</small></button>').join('')+'</div><div class="sa-rules"><span><strong>20</strong> Random Songs</span><span><strong>3</strong> Points per Song</span><span><strong>30s</strong> to Answer</span></div><div class="sa-queue-controls"><label>Audio Server<select id="sa-server" '+(queueStatus.type!=='idle'?'disabled':'')+'>'+['EU','NAE','NAW'].map(s=>'<option '+(s===server?'selected':'')+'>'+s+'</option>').join('')+'</select></label><button class="button mint" type="button" data-sa-action="queue" '+(!searchReady||connecting||!getPlayer()||queue?.readyState!==1?'disabled':'')+'>'+(queueStatus.type==='queued'?'Leave Queue':queueStatus.type==='matched'?'Preparing Match…':'Find Match')+'</button></div><p class="sa-status" role="status">'+(!getPlayer()?'Sign in above to join a queue.':searchError?esc(searchError):!searchReady?'Loading answer lists…':connecting?'Connecting…':queueStatus.type==='queued'?'Finding Players · '+queueStatus.waiting+' / '+queueStatus.needed:queueStatus.type==='matched'?'Selecting songs for your match…':'')+'</p>'+(searchError?'<button class="button secondary" type="button" data-sa-action="search-retry">Retry Answer Lists</button>':'')+'</section>';}
  function gameHTML(){const me=player(),done=['finished','cancelled'].includes(match.phase);return '<div class="sa-game-heading"><div><span class="sa-eyebrow">Song / Artist · '+formats[match.format]+'</span><h1>'+(done?match.phase==='finished'?'Match Complete':'Match Ended':'Song '+(match.index+1)+' <small>/ 20</small>')+'</h1></div><button type="button" class="button secondary" data-sa-action="'+(done?'again':'leave')+'">'+(done?'Play Again':'Leave Match')+'</button></div><div class="sa-scoreboard"></div>'+(done?'<p>'+esc(match.reason||winnerText())+'</p><div class="sa-results">'+match.history.map(row=>{const mine=row.results.find(p=>p.id===match.me);return '<div><span>'+(row.index+1)+'</span><strong>'+esc(row.song)+'</strong><span>'+esc(row.artist)+'</span><b>'+mine.earned+'/3</b></div>';}).join('')+'</div>':'<div class="sa-play-panel"><div class="sa-round-status"></div><div class="sa-timer" role="timer" aria-label="Time remaining"></div><div class="sa-download-status"></div><div class="sa-shared-wrap"></div><form id="sa-answer-form"><div class="sa-answer-fields">'+fields.map(field=>'<label>'+labels[field]+'<div class="sa-combobox"><input id="sa-'+field+'" data-sa-field="'+field+'" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sa-options-'+field+'" autocomplete="off" maxlength="300" placeholder="Type '+labels[field].toLowerCase()+'…"><div id="sa-options-'+field+'" class="sa-suggestions" role="listbox"></div></div></label>').join('')+'</div><button type="submit" class="button mint sa-lock">Lock Answers</button></form><div class="sa-reveal-wrap"></div></div>');}
  function winnerText(){if(match.teams.length===1)return 'Your team scored '+match.teams[0]+' / 60.';const mine=match.teams[player().team],other=match.teams[1-player().team];return mine===other?'A tie!':mine>other?'Your team wins!':'The other team wins.';}
  function render(){
    if(!active)return;
    if(!match){root.innerHTML=lobbyHTML();structure='';return;}
    const next=match.id+':'+match.index+':'+(['finished','cancelled'].includes(match.phase)?match.phase:'play');
    if(next!==structure){root.innerHTML=gameHTML();structure=next;for(const field of fields){const input=root.querySelector('#sa-'+field);if(input)input.value=draft[field]||'';}}
    root.querySelector('.sa-scoreboard').innerHTML=teamHTML();
    const status=root.querySelector('.sa-round-status');if(!status)return;
    const me=player(),loadedCount=loaded().length;
    status.textContent=match.phase==='loading'?'Getting Everyone Ready':match.phase==='buffering'?'Waiting for Audio':match.phase==='reveal'?'Answers Revealed':'Listen & Answer';
    root.querySelector('.sa-download-status').innerHTML='<span>'+loadedCount+'/20 Songs Downloaded</span>'+(downloadError?'<span class="incorrect">'+esc(downloadError)+'</span><button type="button" class="button secondary" data-sa-action="retry-download">Retry Download</button>':'')+(!ready&&loadedCount>=10?'<button type="button" class="button mint" data-sa-action="ready">Ready · Enable Audio</button>':'')+(ready&&!me.ready?'<small>Waiting for ready confirmation…</small>':'');
    root.querySelector('.sa-shared-wrap').innerHTML=sharedHTML();
    const form=root.querySelector('#sa-answer-form');form.hidden=match.phase==='reveal';
    const disabled=match.phase!=='guess'||me.locked||pendingLock||!room||Date.now()+offset<match.startsAt;
    for(const el of form.querySelectorAll('input,button'))el.disabled=disabled;
    form.querySelector('.sa-lock').textContent=me.locked?'Answers Locked':pendingLock?'Locking…':!room?'Reconnecting…':'Lock Answers';
    root.querySelector('.sa-reveal-wrap').innerHTML=match.phase==='reveal'?recapHTML():'';
  }
  function tick(){
    clearTimeout(raf);if(!active||!match||['finished','cancelled'].includes(match.phase))return;
    const now=Date.now()+offset,timer=root.querySelector('.sa-timer');
    // Decode the next cached MP3 during the shared countdown, not at its end.
    if(match.phase==='guess'&&preparedIndex!==match.index&&!unlocking){const url=cache.url(sources[match.index],server);if(url){preparedIndex=match.index;audio.src=url;audio.load();}}
    if(timer){const ms=match.phase==='guess'&&now<match.startsAt?match.startsAt-now:match.until-now;const value=['guess','reveal'].includes(match.phase)?Math.max(0,Math.ceil(ms/1000))+'s':'';if(timer.textContent!==value)timer.textContent=value;}
    if(match.phase==='guess'&&now>=match.startsAt&&now<match.until){
      const input=root.querySelector('#sa-anime');
      if(input?.disabled&&!player().locked&&!pendingLock&&room?.readyState===1){render();if(!document.querySelector('dialog[open]'))input.focus({preventScroll:true});}
      if(ready&&playingIndex!==match.index&&preparedIndex===match.index){playingIndex=match.index;audio.currentTime=Math.max(0,(now-match.startsAt)/1000);audio.play().catch(()=>{playingIndex=-1;ready=false;render();error('Tap Ready · Enable Audio to allow playback.');});}
    }else if(!unlocking&&(match.phase!=='guess'||now>=match.until))audio.pause();
    raf=setTimeout(tick,100);
  }
  root.addEventListener('input',event=>{const field=event.target.dataset.saField;if(!field)return;draft[field]=event.target.value;delete chosen[field];searchKind=field;searchItems=[];selected=-1;const id=++searchId;clearTimeout(searchTimer);searchTimer=setTimeout(()=>worker?.postMessage({type:'search',id,kind:field,query:draft[field]}),70);scheduleDraft();});
  root.addEventListener('focusin',event=>{const field=event.target.dataset.saField;if(field&&field!==searchKind){hideSuggestions();searchKind=field;}});
  root.addEventListener('keydown',event=>{const field=event.target.dataset.saField;if(!field)return;
    if(searchItems.length&&searchKind===field&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;showSuggestions();root.querySelector('#sa-option-'+selected)?.scrollIntoView({block:'nearest'});}
    else if(event.key==='Enter'){event.preventDefault();if(searchKind===field&&searchItems.length)choose(Math.max(0,selected));else if(field==='artist')submit(true);else root.querySelector('#sa-'+fields[fields.indexOf(field)+1])?.focus();}
    else if(event.key==='Escape')hideSuggestions();
  });
  root.addEventListener('focusout',event=>{if(event.target.dataset.saField)setTimeout(()=>{if(!root.querySelector('.sa-combobox')?.contains(document.activeElement)&&!document.activeElement?.dataset.saField)hideSuggestions();},120);});
  root.addEventListener('submit',event=>{if(event.target.id!=='sa-answer-form')return;event.preventDefault();submit(true);});
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.saOption!=null){choose(Number(button.dataset.saOption));return;}
    if(button.dataset.saFormat){format=button.dataset.saFormat;render();return;}
    const action=button.dataset.saAction;
    if(action==='queue'){if(queueStatus.type==='queued')send(queue,{type:'cancel'});else if(queueStatus.type==='idle')send(queue,{type:'join',mode:'song-artist',format});}
    else if(action==='search-retry'){startWorker();render();}
    else if(action==='retry-download')preload();
    else if(action==='ready'){
      if(unlocking)return;unlocking=true;
      try{audio.src=cache.url(sources[match.index],server);preparedIndex=match.index;audio.muted=true;await audio.play();audio.pause();audio.currentTime=0;ready=true;playingIndex=-1;send(room,{type:'loaded',indices:loaded()});send(room,{type:'ready'});render();}catch{error('Audio could not start. Please retry or check your browser’s autoplay setting.');}finally{audio.muted=false;unlocking=false;}
    }else if(action==='leave'){if(confirm('Leave this match? Your teammates can continue.')){send(room,{type:'leave'});room?.close();room=null;match=null;clearAudio();queue?.close();queue=null;queueStatus={type:'idle'};render();}}
    else if(action==='again'){room?.close();room=null;match=null;clearAudio();queueStatus={type:'idle'};connectQueue();render();}
  });
  root.addEventListener('change',event=>{if(event.target.id==='sa-server'){server=event.target.value;}});
  return {
    enter(){active=true;match=null;structure='';clockReady=false;queueStatus={type:'idle'};render();if(!worker)startWorker();connectQueue();clearInterval(heartbeat);heartbeat=setInterval(()=>{send(queue,{type:'ping'});send(room,{type:'ping',sentAt:Date.now()});},20000);},
    render,
    leave(){active=false;send(queue,{type:'cancel'});queue?.close();room?.close();queue=null;room=null;clearTimeout(queueRetry);clearTimeout(roomRetry);clearTimeout(searchTimer);clearTimeout(draftTimer);clearInterval(heartbeat);clearTimeout(raf);clearAudio();ready=false;worker?.terminate();worker=null;searchReady=false;},
  };
}
