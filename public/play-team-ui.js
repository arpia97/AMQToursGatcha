const labels={anime:'Anime',song:'Song Name',artist:'Artist Name'};
export function answerFieldsHTML(fields,team){
  return fields.map(field=>'<div class="sa-answer-row"><label for="sa-'+field+'">'+labels[field]+(team?'<small data-sa-owner="'+field+'">Unclaimed</small>':'')+'</label><div class="sa-combobox"><input id="sa-'+field+'" data-sa-field="'+field+'" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sa-options-'+field+'" autocomplete="off" maxlength="300" placeholder="Type '+labels[field].toLowerCase()+'…"><div id="sa-options-'+field+'" class="sa-suggestions" role="listbox"></div>'+(field==='artist'?'<div class="sa-artist-list"></div>':'')+'</div>'+(team?'<button type="button" class="button mint" data-sa-submit="'+field+'">Submit</button><div class="sa-reactions" data-sa-reactions="'+field+'"></div>':field==='artist'?'<button type="button" class="button secondary sa-artist-add" data-sa-submit="artist">Add Artist</button>':'')+'</div>').join('');
}
export function updateTeamFields(root,match,disabled,esc){
  const me=match.players.find(p=>p.id===match.me),team=match.players.filter(p=>p.team===me.team);
  for(const field of ['anime','song','artist']){
    const owner=team.find(p=>p.field===field),input=root.querySelector('#sa-'+field),button=root.querySelector('[data-sa-submit="'+field+'"]');
    const unavailable=!!(me.field&&me.field!==field||owner&&owner.id!==me.id);
    input.disabled=button.disabled=disabled||unavailable;
    root.querySelector('[data-sa-owner="'+field+'"]').textContent=owner?owner.name+(owner.id===me.id?' · You':''):'Unclaimed';
    if(owner&&owner.id!==me.id)input.value=field==='artist'?'':owner.answers?.[field]||'';
    const last=match.history.at(-1),result=last?.index===match.index&&['reveal','finished'].includes(match.phase)?last.results.find(p=>p.id===owner?.id):null;
    input.closest('.sa-answer-row').dataset.answerState=owner?(result?result.correct[field]?'correct':'incorrect':'pending'):'';
    button.textContent=field==='artist'?'Add Artist':owner?.id===me.id?'Update':'Submit';
    const reactions=root.querySelector('[data-sa-reactions="'+field+'"]');
    reactions.hidden=match.format!=='1-team';
    if(match.format==='1-team')reactions.innerHTML=['O','X','△','?'].map(value=>{
      const voters=team.filter(p=>p.reactions?.[field]===value);
      return '<button type="button" data-sa-react="'+field+'" data-reaction="'+value+'" aria-label="React '+value+' to '+labels[field]+'" aria-pressed="'+(me.reactions?.[field]===value)+'" title="'+esc(voters.map(p=>p.name).join(', ')||'React '+value)+'" '+(!owner||owner.id===me.id||!['guess','reveal'].includes(match.phase)?'disabled':'')+'>'+value+(voters.length?'<small>'+voters.length+'</small>':'')+'</button>';
    }).join('');
  }
}

export function updateArtistChips(root,match,disabled,esc){
  const box=root.querySelector('.sa-artist-list');if(!box)return;
  const me=match.players.find(p=>p.id===match.me),owner=match.teamFields?match.players.find(p=>p.team===me.team&&p.field==='artist'):me;
  const list=owner?.artists||[],last=match.history.at(-1),result=last?.index===match.index&&['reveal','finished'].includes(match.phase)?last.results.find(p=>p.id===owner?.id):null;
  box.dataset.answerState=result?result.correct.artist?'correct':'incorrect':'pending';
  box.innerHTML=list.map((name,i)=>'<span class="sa-artist-chip">'+esc(name)+(owner.id===me.id&&!disabled?'<button type="button" data-sa-remove-artist="'+i+'" aria-label="Remove '+esc(name)+'">×</button>':'')+'</span>').join('');
}
