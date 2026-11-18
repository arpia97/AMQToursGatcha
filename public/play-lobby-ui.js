const names={anime:'Anime Name',song:'Song Title',artist:'Artist'};
export const lobbyModeNames={'lobby-team':'1-Team','lobby-ffa':'Free-for-All','lobby-ngmc':'NGMC Unranked'};
export function lobbyDirectoryHTML(lobbies,ngmc,enabled,esc){
  const rooms=lobbies?.filter(room=>(room.format==='lobby-ngmc')===ngmc),disabled=enabled?'':' disabled';
  return '<aside class="play-lobby-directory"><h2>Lobbies</h2><div class="play-directory-actions"><button class="button mint" data-lobby-action="create"'+disabled+'>Create Lobby</button><button class="button secondary" data-lobby-action="join"'+disabled+'>Join by Code</button></div>'+
    (rooms?.length?rooms.map(room=>'<div class="play-directory-room"><div><strong>'+esc(room.host)+'</strong><small>'+esc(lobbyModeNames[room.format])+' · '+room.players+'/8 · '+(room.locked?'Password required':'Public')+'</small></div><button class="button secondary" data-lobby-join="'+esc(room.code)+'" '+(room.players>=8?'disabled':disabled)+'>'+(room.players>=8?'Full':'Join')+'</button></div>').join(''):'<p class="muted">'+(rooms?'No open lobbies.':'Loading lobbies…')+'</p>')+'</aside>';
}
export function lobbyDialog(action,ngmc,room,send){
  const create=action==='create',edit=action==='password',title=create?'Create Lobby':edit?'Lobby Password':'Join Lobby';
  const dialog=document.createElement('dialog');
  dialog.className='sa-song-dialog play-lobby-dialog';
  dialog.setAttribute('aria-label',title);
  dialog.innerHTML='<form><h2>'+title+'</h2>'+(create&&ngmc?'<p>NGMC Unranked · 3v3 or 4v4</p>':'')+
    (create&&!ngmc?'<label>Format<select name="format"><option value="lobby-team">1-Team</option><option value="lobby-ffa">Free-for-All</option></select></label><label>Songs<input name="songs" type="number" min="1" max="100" placeholder="20"></label>':'')+
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
    if(create)Object.assign(payload,{format:ngmc?'lobby-ngmc':values.get('format'),songs:ngmc?35:Number(values.get('songs')||20),seconds:ngmc?20:30});
    if(action==='join')payload.code=room?.code||values.get('code');
    send(payload);
  };
  document.body.append(dialog);dialog.showModal();return dialog;
}
export const autoReadyHTML=checked=>'<label class="sa-auto-ready"><input type="checkbox" data-auto-ready '+(checked?'checked':'')+'> Auto-ready</label>';
export function roomLobby(lobby,me,esc,autoReady,draft){
  const settings=draft||lobby,mine=lobby.players.find(p=>p.id===me);
  const ngmc=lobby.format==='lobby-ngmc',canStart=!ngmc||[6,8].includes(lobby.players.length);
  const host=lobby.host===me&&!lobby.busy,disabled=host?'':' disabled';
  return '<section class="custom-lobby"><header><div><small>'+(ngmc?'NGMC Unranked':'Song / Artist')+'</small><h1>Custom Lobby</h1></div><span>Lobby Code <strong>'+esc(lobby.code)+'</strong> · '+(lobby.locked?'Password protected':'Public')+'</span></header><div class="custom-lobby-grid"><section><h2>Players <small>'+lobby.players.length+' · 8 max</small></h2>'+
    lobby.players.map(p=>'<div class="lobby-member"><strong>'+esc(p.name)+'</strong><small>'+(p.id===lobby.host?'Host':'')+(p.id===me?' · You':'')+'</small><span class="lobby-ready-status '+(p.ready?'is-ready':'')+'">'+(p.ready?'Ready':'Waiting')+'</span></div>').join('')+
    '</section><section><h2>Match Settings</h2>'+(ngmc?'<p>3v3 with 6 players · 4v4 with 8 players</p><p>35 songs · 20 seconds</p>':'<label>Mode<select id="sa-lobby-format"'+disabled+'>'+Object.entries(lobbyModeNames).filter(([id])=>id!=='lobby-ngmc').map(([id,name])=>'<option value="'+id+'" '+(settings.format===id?'selected':'')+'>'+name+'</option>').join('')+
    '</select></label><div class="lobby-settings"><label>Songs<input type="number" min="1" max="100" id="sa-lobby-songs" placeholder="20" value="'+(settings.songs===20?'':settings.songs)+'"'+disabled+'></label><label>Guess Time (Seconds)<input type="number" min="1" placeholder="Unlimited" id="sa-lobby-time" value="'+(settings.seconds||'')+'"'+disabled+'></label></div>'+(host?'<button class="button secondary" data-lobby-action="settings" '+(draft?'':'disabled')+'>Save Settings</button>':''))+(host?'<button class="button secondary" data-lobby-action="password">Set Password</button>':'')+'</section></div><footer><button class="button secondary" data-lobby-action="leave">Leave Lobby</button>'+
    autoReadyHTML(autoReady)+(!lobby.busy?'<button class="button secondary" data-lobby-action="ready" aria-pressed="'+!!mine?.ready+'">'+(mine?.ready?'✓ Ready':'Ready')+'</button>':'')+
    (host?'<button class="button mint" data-lobby-action="start" '+(!canStart||draft||!lobby.players.every(p=>p.id===me||p.ready)?'disabled':'')+ '>'+ (ngmc&&canStart?'Start '+lobby.players.length/2+'v'+lobby.players.length/2:'Start Match')+'</button>':(lobby.busy?'<span>Match in Progress</span>':'<span>Waiting for Host</span>'))+'</footer></section>';
}
export function pointsBoard(match,esc){
  const players=match.players.slice().sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  const last=match.phase==='reveal'&&match.history.at(-1);
  return '<section class="play-leaderboard"><h2>'+ (match.phase==='finished'?'Match Leaderboard':'Players')+'</h2>'+players.map(p=>'<div class="lobby-member"><strong>'+esc(p.name)+(p.id===match.me?' · You':'')+'</strong>'+(last&&match.format==='lobby-ffa'?'<small>'+Object.values(last.results.find(r=>r.id===p.id)?.answers||{}).map(esc).filter(Boolean).join(' · ')+'</small>':'')+'<span>'+p.score+' pts</span></div>').join('')+'</section>';
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
