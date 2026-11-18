const names={anime:'Anime Name',song:'Song Title',artist:'Artist'};
export const lobbyModeNames={'lobby-team':'1-Team','lobby-ffa':'Free-for-All'};
export function lobbyEntry(disabled){
  return '<div class="custom-entry"><label>Songs<input type="number" min="1" max="100" id="sa-create-songs" placeholder="20"></label><button class="button secondary" data-lobby-action="create" '+disabled+'>Create Lobby</button><label>Lobby Code<input id="sa-lobby-code" maxlength="8" autocomplete="off"></label><button class="button secondary" data-lobby-action="join" '+disabled+'>Join Lobby</button></div>';
}
export const autoReadyHTML=checked=>'<label class="sa-auto-ready"><input type="checkbox" data-auto-ready '+(checked?'checked':'')+'> Auto-ready</label>';
export function roomLobby(lobby,me,esc,autoReady,draft){
  const settings=draft||lobby,mine=lobby.players.find(p=>p.id===me);
  const host=lobby.host===me&&!lobby.busy,disabled=host?'':' disabled';
  return '<section class="custom-lobby"><header><div><small>Song / Artist</small><h1>Custom Lobby</h1></div><span>Lobby Code <strong>'+esc(lobby.code)+'</strong></span></header><div class="custom-lobby-grid"><section><h2>Players <small>'+lobby.players.length+' / 8</small></h2>'+
    lobby.players.map(p=>'<div class="lobby-member"><strong>'+esc(p.name)+'</strong><small>'+(p.id===lobby.host?'Host':'')+(p.id===me?' · You':'')+'</small><span class="lobby-ready-status '+(p.ready?'is-ready':'')+'">'+(p.ready?'Ready':'Waiting')+'</span></div>').join('')+
    '</section><section><h2>Match Settings</h2><label>Mode<select id="sa-lobby-format"'+disabled+'>'+Object.entries(lobbyModeNames).map(([id,name])=>'<option value="'+id+'" '+(settings.format===id?'selected':'')+'>'+name+'</option>').join('')+
    '</select></label><div class="lobby-settings"><label>Songs<input type="number" min="1" max="100" id="sa-lobby-songs" placeholder="20" value="'+(settings.songs===20?'':settings.songs)+'"'+disabled+'></label><label>Guess Time (Seconds)<input type="number" min="1" placeholder="Unlimited" id="sa-lobby-time" value="'+(settings.seconds||'')+'"'+disabled+'></label></div>'+(host?'<button class="button secondary" data-lobby-action="settings" '+(draft?'':'disabled')+'>Save Settings</button>':'')+'</section></div><footer><button class="button secondary" data-lobby-action="leave">Leave Lobby</button>'+
    autoReadyHTML(autoReady)+(!lobby.busy?'<button class="button secondary" data-lobby-action="ready" aria-pressed="'+!!mine?.ready+'">'+(mine?.ready?'✓ Ready':'Ready')+'</button>':'')+
    (host?'<button class="button mint" data-lobby-action="start" '+(draft||!lobby.players.every(p=>p.ready)?'disabled':'')+'>Start Match</button>':(lobby.busy?'<span>Match in Progress</span>':'<span>Waiting for Host</span>'))+'</footer></section>';
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
    return '<section><h3>'+label+'</h3>'+options.map(o=>'<button class="button secondary" data-ballot="'+field+'" data-choice="'+esc(o.id)+'" aria-pressed="'+(match.myVotes?.[field]===o.id)+'">'+esc(o.answer)+' <small>'+esc(match.players.find(p=>p.id===o.owner)?.name)+' · '+match.voteCounts[o.id]+'</small></button>').join('')+
      '<button class="button secondary" data-ballot="'+field+'" data-choice="" aria-pressed="'+(match.myVotes?.[field]===null)+'">Abstain</button></section>';
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
