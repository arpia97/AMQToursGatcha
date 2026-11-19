import {ARENA_FORMAT, ARENA_LOBBY_FORMAT, arenaRules, arenaPlayerCounts} from './play-arena-config.js';
import {DUEL_FORMAT, DUEL_LOBBY_FORMAT, duelRules, lobbyCapacity, lobbyGameMode} from './play-mode-rules.js';
import {poolName} from './play-pool.js';
import {playPlayerAvatar} from './play-avatar.js';
const names={anime:'Anime Name',song:'Song Title',artist:'Artist'};
export const lobbyModeNames={'lobby-team':'1-Team','lobby-ffa':'Free-for-All','lobby-ngmc':'NGMC Unranked',[ARENA_LOBBY_FORMAT]:'2v2 Arena',[DUEL_LOBBY_FORMAT]:'1v1 Unranked'};
function poolPicker(value='random',disabled=false,id=''){
  return '<label>Song Pool<select name="pool" '+(id?'id="'+id+'" ':'')+(disabled?'disabled':'')+'><option value="random">Random</option><option value="watched" '+(value==='watched'?'selected':'')+'>Watched</option></select></label>';
}
export function lobbyDirectoryHTML(lobbies,mode,enabled,esc){
  const rooms=lobbies?.filter(room=>lobbyGameMode(room.format)===mode),disabled=enabled?'':' disabled';
  return '<aside class="play-lobby-directory"><header class="play-directory-header"><h2>Lobbies</h2><div class="play-directory-actions"><button class="button mint" data-lobby-action="create"'+disabled+'>Create Lobby</button><button class="button secondary" data-lobby-action="join"'+disabled+'>Join by Code</button></div></header>'+
    (rooms?.length?rooms.map(room=>'<div class="play-directory-room"><div><strong>'+esc(room.host)+'</strong><span class="lobby-pool-label" data-song-pool="'+(room.pool==='watched'?'watched':'random')+'">'+poolName(room.pool)+'</span><small>'+esc(lobbyModeNames[room.format])+' · '+room.players+'/'+lobbyCapacity(room.format)+' · '+(room.locked?'Password required':'Public')+'</small></div><button class="button secondary" data-lobby-join="'+esc(room.code)+'" '+(room.players>=lobbyCapacity(room.format)?'disabled':disabled)+'>'+(room.players>=lobbyCapacity(room.format)?'Full':'Join')+'</button></div>').join(''):'<p class="muted">'+(rooms?'No open lobbies.':'Loading lobbies…')+'</p>')+'</aside>';
}
export function lobbyDialog(action,mode,room,send,pool='random'){
  const ngmc=mode==='ngmc-ranked',arena=mode===ARENA_FORMAT,duel=mode===DUEL_FORMAT;
  const create=action==='create',edit=action==='password',title=create?'Create Lobby':edit?'Lobby Password':'Join Lobby';
  const dialog=document.createElement('dialog');
  dialog.className='sa-song-dialog play-lobby-dialog';
  dialog.setAttribute('aria-label',title);
  dialog.innerHTML='<form><h2>'+title+'</h2>'+(create&&ngmc?'<p>NGMC Unranked · 3v3 or 4v4</p>':'')+
    (create&&arena?'<p>2v2 Arena · 4, 8, 12 or 16 players</p>':'')+
    (create&&duel?'<p>1v1 Unranked</p>':'')+
    (create&&!ngmc&&!arena&&!duel?'<label>Format<select name="format"><option value="lobby-team">1-Team</option><option value="lobby-ffa">Free-for-All</option></select></label><label>Songs<input name="songs" type="number" min="1" max="100" placeholder="20"></label>':'')+
    (create?poolPicker(pool):'')+
    (action==='join'&&!room?'<label>Lobby Code<input name="code" required maxlength="8" autocomplete="off"></label>':'')+
    '<label>'+((create||edit||!room)?'Password (optional)':'Lobby Password')+'<input type="password" name="password" maxlength="128" autocomplete="'+(create||edit?'new-password':'off')+'" '+(room&&action==='join'?'required':'')+'></label>'+
    (edit?'<small>Leave blank to make this lobby public.</small>':'')+
    '<p role="alert" hidden></p><footer><button type="button" class="button secondary">Cancel</button><button class="button mint">'+(edit?'Save':title)+'</button></footer></form>';
  dialog.querySelector('button[type=button]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.querySelector('form').reset();dialog.remove();},{once:true});
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    const payload={type:'lobby-'+action,password:values.get('password')};
    if(create)Object.assign(payload,{pool:values.get('pool'),format:duel?DUEL_LOBBY_FORMAT:arena?ARENA_LOBBY_FORMAT:ngmc?'lobby-ngmc':values.get('format'),songs:ngmc?35:Number(values.get('songs')||20),seconds:ngmc?20:30});
    if(action==='join')payload.code=room?.code||values.get('code');
    send(payload);
  };
  document.body.append(dialog);dialog.showModal();return dialog;
}
export const autoReadyHTML=checked=>'<label class="sa-auto-ready"><input type="checkbox" data-auto-ready '+(checked?'checked':'')+'> Auto-ready</label>';
function lobbySettings(lobby, settings, host, draft, esc) {
  const pool=poolPicker(settings.pool,!host,'sa-lobby-pool');
  const save=host?'<button class="button secondary" data-lobby-action="settings" '+(draft?'':'disabled')+'>Save Settings</button>':'';
  if(lobby.format===DUEL_LOBBY_FORMAT){
    return '<dl class="room-rules"><div><dt>Players</dt><dd>2</dd></div><div><dt>Songs</dt><dd>'+duelRules.songs+'</dd></div><div><dt>Guess Time</dt><dd>'+duelRules.guessSeconds+' seconds</dd></div></dl>'+pool+save;
  }
  if (lobby.format === ARENA_LOBBY_FORMAT) {
    return '<dl class="room-rules"><div><dt>Players</dt><dd>4, 8, 12 or 16</dd></div><div><dt>Songs per Fixture</dt><dd>'+arenaRules.songsPerFixture+'</dd></div><div><dt>Guess Time</dt><dd>'+arenaRules.guessSeconds+' seconds</dd></div></dl>'+pool+save;
  }
  if (lobby.format === 'lobby-ngmc') {
    return '<dl class="room-rules"><div><dt>Teams</dt><dd>3v3 or 4v4</dd></div><div><dt>Songs</dt><dd>35</dd></div><div><dt>Guess Time</dt><dd>20 seconds</dd></div></dl>'+pool+save;
  }
  const disabled = host ? '' : ' disabled';
  const options = ['lobby-team','lobby-ffa'].map(id =>
    '<option value="'+id+'" '+(settings.format===id?'selected':'')+'>'+lobbyModeNames[id]+'</option>'
  ).join('');
  return pool+'<label>Mode<select id="sa-lobby-format"'+disabled+'>'+options+'</select></label>'+
    '<div class="lobby-settings"><label>Songs<input type="number" min="1" max="100" id="sa-lobby-songs" placeholder="20" value="'+esc(settings.songs===20?'':settings.songs)+'"'+disabled+'></label>'+
    '<label>Guess Time (Seconds)<input type="number" min="1" id="sa-lobby-time" placeholder="Unlimited" value="'+esc(settings.seconds||'')+'"'+disabled+'></label></div>'+
    save;
}

function watchedPoolStatus(lobby, host, short) {
  if(lobby.pool!=='watched')return '';
  const pool=lobby.watchedPool;
  const count=pool?.eligible;
  const status=Number.isInteger(count)
    ? count.toLocaleString()+' eligible anime'+(lobby.songs?' · '+lobby.songs+' needed':'')
    : pool?.unavailable?'Couldn’t check the Watched pool.':'Checking the Watched pool…';
  const warning=host&&short
    ? '<small>Add more watched entries or switch to Random.'+(lobbyGameMode(lobby.format)==='song-artist'?' You can also choose fewer songs.':'')+'</small>'
    : '';
  return '<div class="room-watched-pool" data-short="'+short+'" role="status"><strong>'+status+'</strong>'+warning+'</div>';
}

export function roomLobby(lobby, me, esc, autoReady, draft) {
  const mine = lobby.players.find(p=>p.id===me);
  const ngmc = lobby.format==='lobby-ngmc';
  const arena = lobby.format===ARENA_LOBBY_FORMAT;
  const duel = lobby.format===DUEL_LOBBY_FORMAT;
  const canStart = duel ? lobby.players.length===2 : arena ? arenaPlayerCounts.includes(lobby.players.length) : !ngmc || [6,8].includes(lobby.players.length);
  const host = lobby.host===me && !lobby.busy;
  const ready = lobby.players.filter(p=>p.ready).length;
  const players = lobby.players.map(p=>{
    const role = [p.id===lobby.host?'Host':'',p.id===me?'You':''].filter(Boolean).join(' · ');
    return '<li class="room-player"><span class="play-player-identity">'+playPlayerAvatar(p,esc)+'<span class="room-player-name"><strong>'+esc(p.name)+'</strong>'+(role?'<small>'+role+'</small>':'')+'</span></span>'+
      '<span class="lobby-ready-status '+(p.ready?'is-ready':'')+'">'+(p.ready?'Ready':'Waiting')+'</span></li>';
  }).join('');
  const shortPool = lobby.pool==='watched' && Number.isInteger(lobby.watchedPool?.eligible) &&
    lobby.watchedPool.eligible<lobby.songs;
  const checkingPool = lobby.pool==='watched' && lobby.watchedPool===null;
  const startDisabled = !canStart || checkingPool || shortPool || draft || lobby.players.some(p=>p.id!==me&&!p.ready);
  const startLabel = ngmc && canStart ? 'Start '+lobby.players.length/2+'v'+lobby.players.length/2 : 'Start Match';
  return '<section class="broadcast-room '+(ngmc?'ngmc-room':'song-room')+'">'+
    '<header class="room-masthead"><div><small>'+(ngmc||arena||duel?lobbyModeNames[lobby.format]:'Song / Artist · '+lobbyModeNames[lobby.format])+'</small><h1>Custom Lobby</h1></div>'+
    '<div class="room-code"><small>Lobby Code</small><strong>'+esc(lobby.code)+'</strong><span>'+(lobby.locked?'Password protected':'Public')+'</span></div></header>'+
    '<div class="room-columns"><section class="room-panel"><header><h2>Players</h2><span>'+lobby.players.length+' / '+lobbyCapacity(lobby.format)+' seats</span></header>'+
    '<ul class="room-roster">'+players+'</ul><div class="room-readiness"><meter min="0" max="'+lobby.players.length+'" value="'+ready+'" aria-label="Players ready"></meter><span>'+ready+' / '+lobby.players.length+' ready</span></div></section>'+
    '<section class="room-panel"><header><h2>Match Settings</h2></header><div class="room-options">'+lobbySettings(lobby,draft||lobby,host,draft,esc)+watchedPoolStatus(lobby,host,shortPool)+
    (host?'<button class="text-button" data-lobby-action="password">Set Password</button>':'')+'</div></section></div>'+
    '<footer class="room-controls"><button class="button secondary" data-lobby-action="leave">Leave Lobby</button><div>'+autoReadyHTML(autoReady)+
    (!lobby.busy?'<button class="button secondary" data-lobby-action="ready" aria-pressed="'+!!mine?.ready+'">'+(mine?.ready?'✓ Ready':'Ready')+'</button>':'')+
    (host?'<button class="button mint" data-lobby-action="start" '+(startDisabled?'disabled':'')+'>'+startLabel+'</button>':'<span>'+(lobby.busy?'Match in Progress':'Waiting for Host')+'</span>')+'</div></footer></section>';
}
export function pointsBoard(match,esc){
  const players=match.players.slice().sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  return '<section class="play-leaderboard"><h2>'+ (match.phase==='finished'?'Match Leaderboard':'Players')+'</h2>'+players.map(p=>'<div class="lobby-member"><span class="play-player-identity">'+playPlayerAvatar(p,esc)+'<strong>'+esc(p.name)+(p.id===match.me?' · You':'')+'</strong></span><span>'+p.score+' pts</span></div>').join('')+'</section>';
}
export function ballotHTML(match,esc){
  if(match.phase!=='guess')return '';
  return '<div class="lobby-ballot">'+Object.entries(names).map(([field,label])=>{
    const options=match.ballot?.[field]||[];
    return '<section><h3>'+label+'</h3>'+options.map(o=>{
      const selected=match.myVotes?.[field]===o.id;
      const remove=o.owner===match.me?'<button type="button" class="ballot-withdraw" data-withdraw="'+field+'" data-choice="'+esc(o.id)+'" aria-label="Withdraw guess: '+esc(o.answer)+'" title="Withdraw your guess">×</button>':'';
      return '<div class="ballot-option"><button type="button" class="button secondary" data-ballot="'+field+'" data-choice="'+esc(o.id)+'" aria-pressed="'+selected+'">'+esc(o.answer)+' <small>'+esc(match.players.find(p=>p.id===o.owner)?.name)+' · '+match.voteCounts[o.id]+'</small></button>'+remove+'</div>';
    }).join('')+(options.length?'':'<small class="muted">No guesses yet</small>')+'</section>';
  }).join('')+'</div>';
}
export function updateReturnDialog(root,match,send){
  let dialog=root.querySelector('dialog.lobby-poll');
  const poll=match?.returnPoll;
  if(!poll||Object.hasOwn(poll.votes,match.me)){dialog?.remove();return;}
  if(dialog?.dataset.poll===poll.id)return;
  dialog?.remove();dialog=document.createElement('dialog');dialog.className='lobby-poll';
  dialog.dataset.poll=poll.id;dialog.setAttribute('aria-label','Return to lobby vote');
  dialog.innerHTML='<h2>Return to Lobby?</h2><p>A majority vote ends this match.</p><button class="button mint" data-yes>Return to Lobby</button> <button class="button secondary">Keep Playing</button>';
  const vote=yes=>send({type:'return-vote',poll:poll.id,yes});
  dialog.addEventListener('click',e=>{const button=e.target.closest('button');if(button)vote(button.hasAttribute('data-yes'));});
  dialog.addEventListener('cancel',e=>{e.preventDefault();vote(false);});
  root.append(dialog);dialog.showModal();
}
