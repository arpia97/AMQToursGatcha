const labels={anime:'Anime Name',song:'Song Name',artist:'Artist'};
export function answerFieldsHTML(fields,team){
  if(team)return '<div class="sa-personal-heading"><strong>Your Answer <kbd title="Tab: next category · Shift+Tab: previous category">Tab ↹</kbd></strong><div class="sa-input-categories" role="group" aria-label="Answer category">'+fields.map(field=>'<button type="button" data-sa-input-field="'+field+'" aria-pressed="false">'+labels[field]+'</button>').join('')+'</div></div><div class="sa-personal-fields">'+fields.map(field=>'<div class="sa-input-row" data-sa-input-row="'+field+'" hidden><label for="sa-'+field+'" class="sr-only">'+labels[field]+'</label><div class="sa-combobox"><input id="sa-'+field+'" data-sa-field="'+field+'" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sa-options-'+field+'" autocomplete="off" maxlength="300" placeholder="Type '+labels[field].toLowerCase()+'…"><div id="sa-options-'+field+'" class="sa-suggestions" role="listbox"></div></div>'+'<button type="button" class="button mint" data-sa-submit="'+field+'">Submit</button></div>').join('')+'</div>';
  return (fields.length>1?'<small class="sa-tab-hint"><kbd>Tab ↹</kbd> Switch Answer</small>':'')+fields.map(field=>'<div class="sa-answer-row"><label for="sa-'+field+'">'+labels[field]+'</label><div class="sa-combobox"><input id="sa-'+field+'" data-sa-field="'+field+'" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sa-options-'+field+'" autocomplete="off" maxlength="300" placeholder="Type '+labels[field].toLowerCase()+'…"><div id="sa-options-'+field+'" class="sa-suggestions" role="listbox"></div>'+(field==='artist'?'<div class="sa-artist-list"></div>':'')+'</div>'+(field==='artist'?'<button type="button" class="button secondary sa-artist-add" data-sa-submit="artist">Add Artist</button>':'')+'</div>').join('');
}
export function teamAnswerTilesHTML(){
  return '<section class="sa-team-answer-tiles" aria-label="Team answers">'+Object.entries(labels).map(([field,label])=>'<article class="sa-team-answer-tile" data-sa-tile="'+field+'"><header><h3><button type="button" class="sa-tile-select" data-sa-select="'+field+'">'+label+'</button></h3><small data-sa-owner="'+field+'">Unclaimed</small></header><div class="sa-team-answer-value" data-sa-value="'+field+'" aria-live="polite">Awaiting answer</div>'+(field==='artist'?'<div class="sa-artist-list"></div>':'')+'<div class="sa-reactions" data-sa-reactions="'+field+'"></div></article>').join('')+'</section>';
}
export function updateTeamFields(root,match,disabled,esc,selected='anime',animeTitle=s=>s.anime){
  const me=match.players.find(p=>p.id===match.me),team=match.players.filter(p=>p.team===me.team);
  const available=field=>!team.some(p=>p.field===field&&p.id!==me.id);
  selected=me.field||(['anime','song','artist'].includes(selected)&&available(selected)?selected:['anime','song','artist'].find(available)||'anime');
  for(const field of ['anime','song','artist']){
    const owner=team.find(p=>p.field===field),input=root.querySelector('#sa-'+field),button=root.querySelector('[data-sa-submit="'+field+'"]');
    const unavailable=!!(me.field&&me.field!==field||owner&&owner.id!==me.id);
    button.disabled=disabled||unavailable;input.disabled=disabled||unavailable;
    root.querySelector('[data-sa-owner="'+field+'"]').textContent=owner?owner.name+(owner.id===me.id?' · You':'')+(match.phase==='guess'?' · Submitted':''):'Unclaimed';
    const row=root.querySelector('[data-sa-input-row="'+field+'"]'),choice=root.querySelector('[data-sa-input-field="'+field+'"]');
    row.hidden=selected!==field;choice.disabled=unavailable;choice.setAttribute('aria-pressed',String(selected===field));
    const tile=root.querySelector('[data-sa-tile="'+field+'"]');
    const selector=tile.querySelector('.sa-tile-select');
    selector.disabled=disabled||unavailable;
    selector.setAttribute('aria-pressed',String(selected===field&&!disabled));
    tile.classList.toggle('sa-active-tile',selected===field&&!disabled);
    const value=root.querySelector('[data-sa-value="'+field+'"]');
    const answer=owner?.answers?.[field];
    value.textContent=answer?(field==='anime'?animeTitle({anime:answer}):answer):owner?'No answer submitted':'Awaiting answer';
    value.hidden=field==='artist'&&!!owner?.artists?.length;
    value.classList.toggle('is-empty',!answer);
    const last=match.history.at(-1),result=last?.index===match.index&&['reveal','finished'].includes(match.phase)?last.results.find(p=>p.id===owner?.id):null;
    root.querySelector('[data-sa-tile="'+field+'"]').dataset.answerState=owner?(result?result.correct[field]?'correct':'incorrect':'pending'):'';
    button.textContent=owner?.id===me.id?(field==='artist'?'Add Artist':'Update Answer'):'Submit';
    const reactions=root.querySelector('[data-sa-reactions="'+field+'"]');
    reactions.hidden=match.format!=='1-team';
    if(match.format==='1-team'){
      const html=['O','X','△','?'].map(value=>{
      const voters=team.filter(p=>p.reactions?.[field]===value);
      return '<span class="sa-reaction"><button type="button" data-sa-react="'+field+'" data-reaction="'+value+'" aria-label="React '+value+' to '+labels[field]+'" aria-pressed="'+(me.reactions?.[field]===value)+'" title="'+esc(voters.map(p=>p.name).join(', ')||'React '+value)+'" '+(!owner||owner.id===me.id||!['guess','reveal'].includes(match.phase)?'disabled':'')+'>'+value+'</button><small aria-label="'+voters.length+' reactions">'+voters.length+'</small></span>';
      }).join('');
      if(reactions.innerHTML!==html)reactions.innerHTML=html;
    }
  }
  return selected;
}

export function updateArtistChips(root,match,disabled,esc){
  const box=root.querySelector('.sa-artist-list');if(!box)return;
  const me=match.players.find(p=>p.id===match.me),owner=match.teamFields?match.players.find(p=>p.team===me.team&&p.field==='artist'):me;
  const list=owner?.artists||[],last=match.history.at(-1),result=last?.index===match.index&&['reveal','finished'].includes(match.phase)?last.results.find(p=>p.id===owner?.id):null;
  box.dataset.answerState=result?result.correct.artist?'correct':'incorrect':'pending';
  const html=list.map((name,i)=>'<span class="sa-artist-chip">'+esc(name)+(owner.id===me.id&&!disabled?'<button type="button" data-sa-remove-artist="'+i+'" aria-label="Remove '+esc(name)+'">×</button>':'')+'</span>').join('');
  if(box.innerHTML!==html)box.innerHTML=html;
}
