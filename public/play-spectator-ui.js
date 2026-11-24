import {potatoTeams} from './hot-potato-ui.js';
import {openMatchChat} from './play-match-chat.js';
import {poolName} from './play-pool.js';
import {createSongListDialog} from './play-song-dialog.js';
import {songBroadcastLayout,songTeamsHTML,recapHTML,teamLivesHTML,updateRoundDial,versusHTML} from './play-round-ui.js?v=stable-round-layout';
import {ngmcArena,ngmcTeams,ngmcTrack,ngmcProgress} from './ngmc-ui.js?v=guesses-above-input';
import {pointsBoard} from './play-lobby-ui.js?v=compact-team-guesses';
import {broadcastResults} from './play-match-results.js';
import {arenaBoard} from './play-arena-ui.js';
import {createSealedAudioCache,silentPlayAudio} from './play-audio-cache.js';
import {roundAudio} from './play-round-audio.js';
import {liveProgressText,liveScoreHTML} from './play-live-score.js';
import {ONE_TEAM_FORMAT,oneTeamRules} from './play-mode-rules.js';

const phases={loading:'Getting Everyone Ready',buffering:'Waiting for Audio',guess:'Listen & Answer',
  counting:'Counting Guesses',reveal:'Answers Revealed',finished:'Match Complete',cancelled:'Match Ended'};
const ended=phase=>phase==='finished'||phase==='cancelled';

export function watchPlayMatch({root,api,apiBase,title,id,viewer,esc,animeTitle,onLeave,onJoinLobby,onActivity=()=>{}}){
  root.innerHTML='<section class="sa-match-layout"><div class="sa-game-heading"><div><span class="sa-eyebrow" data-watch-pool>Spectating</span>'+
    '<div class="play-mode-title"><h1>'+esc(title)+'</h1></div></div><div class="sa-game-actions">'+
    '<label class="quiz-volume-control sa-volume">Volume<input id="watch-volume" type="range" min="0" max="100" step="1" aria-label="Match volume"><output></output></label>'+
    '<div class="sa-match-buttons">'+
    '<button type="button" class="button secondary" data-watch-action="songs">Song List</button>'+
    '<button type="button" class="button mint" data-watch-action="rematch" hidden>Join Rematch Lobby</button>'+
    '<button type="button" class="button secondary" data-watch-action="leave">Leave Spectating</button></div></div></div>'+
    '<div class="watch-board"></div><p class="sa-status watch-status" role="status">Connecting to match…</p><button type="button" class="button mint" data-watch-action="audio">Enable Audio</button></section>'+
    '<dialog class="lobby-poll play-rematch-dialog" aria-labelledby="watch-rematch-title">'+
    '<h2 id="watch-rematch-title">Join the rematch lobby?</h2>'+
    '<div class="play-rematch-votes"><button type="button" class="button secondary" data-watch-action="decline-rematch">No</button>'+
    '<button type="button" class="button mint" data-watch-action="rematch">Yes</button></div></dialog>';
  const board=root.querySelector('.watch-board'),status=root.querySelector('.watch-status');
  const enable=root.querySelector('[data-watch-action="audio"]');
  const join=root.querySelector('[data-watch-action="rematch"]');
  const rematchPrompt=root.querySelector('.play-rematch-dialog');
  let rematchPrompted=false;
  const slider=root.querySelector('#watch-volume'),volumeLabel=slider.nextElementSibling;
  const controller=new AbortController(),songList=createSongListDialog(esc,animeTitle);
  const path='play-watch?match='+encodeURIComponent(id),url=new URL(path,apiBase);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';

  let socket,state,chat,offset=0,reconnect,attempts=0,layout,history=new Map();
  let active=false;
  function setActive(value){
    if(active===value)return;
    active=value;
    onActivity();
  }
  let request,clip,source,loadingAudio=false,loadingFailed=false,wantsAudio=false;
  const values=new Map();
  const audio=new Audio();
  const player=roundAudio(audio,()=>{enable.textContent='Enable Audio';enable.hidden=false;},()=>{enable.hidden=true;});
  function updateVolume(value){
    const volume=Math.min(100,Math.max(0,Number(value)||0));
    slider.value=volume;volumeLabel.textContent=volume+'%';audio.volume=volume/100;
  }
  let server='EU';
  try{
    const stored=localStorage.getItem('amqtours-quiz-server');
    if(['EU','NAE','NAW'].includes(stored))server=stored;
    updateVolume(localStorage.getItem('amqtours-quiz-volume')??30);
  }catch{updateVolume(30);}

  function setMarkup(selector,html){
    const node=board.querySelector(selector);
    if(node&&values.get(node)!==html){values.set(node,html);node.innerHTML=html;}
  }
  function tick(){
    if(!state)return;
    const now=Date.now()+offset;
    const invite=state.rematch?.joinUntil>now&&socket?.readyState===1;
    join.hidden=!invite;
    if(invite&&!rematchPrompted){
      rematchPrompted=true;
      rematchPrompt.showModal();
    }else if(!invite&&rematchPrompt.open)rematchPrompt.close();
    const dial=board.querySelector('.ngmc-dial');
    if(dial)updateRoundDial(dial,state,now);
    if(clip&&now>=state.until){audio.pause();return;}
    if(!clip||!source||audio.readyState<1||now<state.startsAt)return;
    const position=(now-state.startsAt)/1000;
    if(!Number.isFinite(audio.duration)||position<audio.duration)player.update(state.index,position);
  }
  const interval=setInterval(tick,120);

  function clearAudio(){
    request?.abort();request=null;
    audio.pause();audio.removeAttribute('src');audio.load();
    if(source)URL.revokeObjectURL(source);
    source=null;clip=null;loadingAudio=false;loadingFailed=false;player.reset();
  }
  function audioNotice(){
    const label=loadingFailed?'Retry Audio':loadingAudio?'Loading Audio…':'Enable Audio';
    enable.textContent=label;
    enable.disabled=loadingAudio;
    enable.hidden=(state&&!state.teams)||ended(state?.phase)||(wantsAudio&&!loadingAudio&&!loadingFailed&&!player.needsGesture);
  }
  async function loadClip(current){
    clearAudio();
    if(!current){audioNotice();return;}
    clip=current;loadingAudio=true;audioNotice();
    const download=request=new AbortController();
    try{
      const cache=createSealedAudioCache(apiBase,state.mode);
      await cache.prepare([clip.ticket],server,{
        signal:AbortSignal.any([download.signal,AbortSignal.timeout(12_000)]),onProgress:()=>{},
      });
      const blob=await cache.decrypt(current.ticket,server,current.key);
      if(download.signal.aborted)return;
      source=URL.createObjectURL(blob);audio.src=source;audio.load();
      loadingAudio=false;audioNotice();tick();
    }catch{
      if(download.signal.aborted)return;
      loadingAudio=false;loadingFailed=true;audioNotice();
    }
  }
  audio.addEventListener('loadedmetadata',tick,{signal:controller.signal});
  async function enableAudio(){
    wantsAudio=true;
    if(source&&state?.phase==='guess'){
      if(state.index!==undefined)player.update(state.index,Math.max(0,(Date.now()+offset-state.startsAt)/1000),true);
      return;
    }
    const silent=URL.createObjectURL(silentPlayAudio());
    try{
      audio.src=silent;await audio.play();
      if(audio.src===silent)audio.pause();
    }catch{wantsAudio=false;}
    finally{URL.revokeObjectURL(silent);audioNotice();}
  }
  root.addEventListener('input',event=>{
    if(event.target!==slider)return;
    updateVolume(slider.value);
    try{localStorage.setItem('amqtours-quiz-volume',slider.value);}catch{}
  },{signal:controller.signal});
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-watch-action]')?.dataset.watchAction;
    if(action==='leave')onLeave();
    if(action==='decline-rematch')rematchPrompt.close();
    if(action==='rematch'&&!join.disabled&&!join.hidden&&socket?.readyState===1){
      join.disabled=true;
      rematchPrompt.close();
      socket.send(JSON.stringify({type:'rematch-join'}));
    }
    if(action==='songs'&&state)songList.open(state);
    if(action==='audio'){
      if(loadingFailed&&clip)void loadClip(clip);
      else void enableAudio();
    }
    const credits=event.target.closest('[data-sa-artist-info]');
    if(credits)credits.setAttribute('aria-expanded',String(credits.getAttribute('aria-expanded')!=='true'));
  },{signal:controller.signal});

  function winnerLabel(){
    if(state.potatoes&&state.teams.length===1)return state.teams[0]?'Team survived':'Team ran out of lives';
    if(state.format===ONE_TEAM_FORMAT)return state.teams[0]?'Team survived':'Team ran out of lives';
    if(state.teams.length===1)return 'Team score · '+state.teams[0]+' points';
    const high=Math.max(...state.teams),leaders=state.teams.flatMap((score,team)=>score===high?[team]:[]);
    const remaining=state.players.filter(p=>!p.left);
    if(state.reason&&remaining.length===1)return remaining[0].name+' won by forfeit';
    if(leaders.length>1)return 'Draw';
    const members=state.players.filter(player=>player.team===leaders[0]);
    return (members.length===1?members[0].name:'Team '+(leaders[0]+1))+' won';
  }
  function render(){
    const ngmc=state.mode==='ngmc-ranked',finished=ended(state.phase);
    root.querySelector('[data-watch-pool]').textContent='Spectating · '+poolName(state.pool);
    root.querySelector('h1').textContent=finished?(state.aborted?'Match Aborted':phases[state.phase]):title;
    slider.parentElement.hidden=!state.teams;
    // Rooms already in play can keep the earlier score-only protocol until they close.
    if(!state.teams){
      if(layout!=='summary'){
        values.clear();
        board.innerHTML='<section class="sa-play-panel"><header class="ngmc-strip"><span></span><strong class="sa-round-status"></strong></header>'+
          '<div class="ngmc-track"></div><div class="watch-scores"></div></section><div class="sa-scoreboard"></div>';
        layout='summary';
      }
      setMarkup('.ngmc-strip>span',esc(liveProgressText(state)));
      setMarkup('.sa-round-status',esc(phases[state.phase]||'Live'));
      setMarkup('.watch-scores',liveScoreHTML(state,esc));
      setMarkup('.ngmc-track',state.reveal?ngmcTrack(state.history.at(-1),esc,animeTitle):'');
      setMarkup('.sa-scoreboard',pointsBoard(state,esc));
      showStatus(state.reason||'This match started on an earlier version. Live scores and chat are available. Match audio is unavailable.');
      songList.update(state);audioNotice();
      return;
    }
    const next=finished?state.phase:ngmc?'ngmc':'song';
    if(layout!==next){
      values.clear();
      board.innerHTML=finished?(state.arena?'<div class="sa-scoreboard"></div>':
        broadcastResults(state,esc,animeTitle,()=>winnerLabel())):
        ngmc?ngmcArena(state,''):songBroadcastLayout(state);
      layout=next;
    }
    const songHeading=board.querySelector('.song-broadcast-header h2');
    if(songHeading)setMarkup('.song-broadcast-header h2','Song '+state.song+' <small>/ '+state.total+'</small>');
    const strip=board.querySelector('.ngmc-strip>span');
    if(strip)strip.textContent='Song '+state.song+' / '+state.total;
    status.textContent=finished?state.reason||'':state.phase==='loading'||state.phase==='buffering'
      ? 'Waiting for '+(state.players.filter(p=>!p.left&&!p.audioReady).map(p=>p.name).join(', ')||'the next song') : '';
    status.hidden=!status.textContent;

    const phaseNode=board.querySelector('.sa-round-status');
    if(phaseNode)phaseNode.textContent=phases[state.phase]||'Live';
    if(state.format===ONE_TEAM_FORMAT)setMarkup('.one-team-mobile-lives',teamLivesHTML(state.teams[0],oneTeamRules.lives));
    const latest=state.history.at(-1);
    const revealed=latest&&(finished||latest.index===state.index&&['reveal','counting'].includes(state.phase))?latest:null;
    setMarkup('.sa-scoreboard',state.arena?arenaBoard(state,esc):
      finished||state.lobby&&['lobby-team','lobby-ffa'].includes(state.format)?pointsBoard(state,esc):
      state.potatoes?potatoTeams(state,esc):ngmc?ngmcTeams(state,esc):songTeamsHTML(state,esc));
    if(ngmc){
      setMarkup('.ngmc-track',ngmcTrack(revealed,esc,animeTitle));
      setMarkup('.ngmc-progress',ngmcProgress(state,esc,animeTitle));
    }else{
      setMarkup('.sa-reveal-wrap',revealed?recapHTML(state,esc,animeTitle)+(state.potatoes||state.format===ONE_TEAM_FORMAT?'':versusHTML(state,revealed,esc)):'');
    }
    songList.update(state);audioNotice();tick();
  }

  function showStatus(text){
    status.hidden=false;status.textContent=text;
  }
  async function checkAvailability(){
    try{await api(path,undefined,undefined,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});}
    catch(error){
      if(controller.signal.aborted)return;
      if([401,403,404].includes(error.status)){showStatus(error.message);return;}
    }
    if(!controller.signal.aborted)connect();
  }
  function connect(){
    socket=new WebSocket(url);
    socket.onmessage=event=>{
      let message;
      try{message=JSON.parse(event.data);}catch{return;}
      if(controller.signal.aborted)return;
      if(message.type==='chat-history'&&state){
        chat??=openMatchChat({id,players:state.players,me:viewer},body=>{
          if(socket.readyState!==1){showStatus('Reconnecting to match chat…');return false;}
          socket.send(JSON.stringify({type:'chat-send',body}));return true;
        },{showSelfName:true});
        for(const row of message.rows)chat.receive(row,false);
        return;
      }
      if(message.type==='chat-message'){chat?.receive(message.row);return;}
      if(message.type==='chat-error'||message.type==='error'){join.disabled=false;showStatus(message.message);return;}
      if(message.type==='rematch-joined'){onJoinLobby(state?.mode);return;}
      if(message.type!=='spectator'||message.state?.id!==id)return;
      attempts=0;offset=message.now-Date.now();state=message.state;
      setActive(!ended(state.phase));
      if(state.teams){
        if(!state.compact)history.clear();
        for(const row of state.history||[])history.set(row.index,row);
      }else if(state.reveal){
        const {song,title,...row}=state.reveal;
        history.set(song-1,{...row,index:song-1,song:title});
      }
      state.history=[...history.values()];
      if(clip?.ticket!==message.clip?.ticket)void loadClip(message.clip);
      render();
    };
    socket.onclose=event=>{
      if(controller.signal.aborted)return;
      setActive(false);
      join.disabled=true;
      clearAudio();
      if(ended(state?.phase)){showStatus('Match Complete · Chat disconnected');return;}
      if(event.code===4001){showStatus('Spectator view opened in another tab.');return;}
      showStatus('Reconnecting to '+title+'…');
      reconnect=setTimeout(checkAvailability,Math.min(10_000,1_000*2**attempts++));
    };
  }
  connect();
  void enableAudio();
  return {active:()=>active,close(){
    controller.abort();clearTimeout(reconnect);clearInterval(interval);
    socket?.close();chat?.close();songList.close();clearAudio();root.replaceChildren();
  },refresh(){if(state)render();}};
}
