export const playReviewPanel=()=>`<section class="host-panel play-review"><h2>Multiplayer Match Review</h2><p class="form-hint">Highlights are for host review. Focus changes are browser-reported. All timings use server receipt times.</p><div class="play-review-tools"><input type="search" data-review-search placeholder="Search player name, ID or match ID…" aria-label="Search matches"><label><input type="checkbox" data-review-flagged> Flagged matches only</label><button type="button" class="button secondary" data-review-refresh>Refresh</button></div><div data-review-matches></div><div data-review-detail></div><p data-review-error role="status"></p></section>`;
export function mountPlayReview(root,initial,api,esc){
  let index=initial,detail=null,selected='',player='',view='highlights',version=0,searchTimer;
  const time=value=>new Date(value).toLocaleString(undefined,{hour12:false})+'.'+String(value%1000).padStart(3,'0');
  const query=values=>'play-review?'+new URLSearchParams(values);
  async function request(values){const id=++version;root.querySelector('[data-review-error]').textContent='Loading…';try{const result=await api(query(values));if(!root.isConnected||id!==version)return null;root.querySelector('[data-review-error]').textContent='';return result;}catch(error){if(root.isConnected&&id===version)root.querySelector('[data-review-error]').textContent=error.message;return null;}}
  function list(){
    root.querySelector('[data-review-matches]').innerHTML='<div class="table-wrap"><table><thead><tr><th>Started</th><th>Mode</th><th>Players</th><th>Status</th><th>Highlights</th><th></th></tr></thead><tbody>'+index.matches.map(m=>'<tr><td>'+esc(time(m.created))+'</td><td>'+esc(m.format)+'</td><td>'+m.players.map(p=>esc(p.name)).join(' · ')+'</td><td>'+esc(m.status)+'</td><td>'+ (m.flags?'<strong class="review-badge">'+Number(m.flags)+'</strong>':'—') +'</td><td><button class="text-button" type="button" data-review-match="'+esc(m.id)+'">Review</button></td></tr>').join('')+'</tbody></table></div>'+(!index.matches.length?'<p>No matches found.</p>':'')+(index.next?'<button class="button secondary" type="button" data-review-older-matches="'+index.next+'">Older Matches</button>':'');
  }
  function eventText(row){
    const d=row.data;
    if(d.answers)return Object.entries(d.answers).map(([field,value])=>'<div><small>'+esc(field)+': </small>'+esc(value||'—')+(d.correct?' <strong class="'+(d.correct[field]?'correct':'incorrect')+'">'+(d.correct[field]?'Correct':'Incorrect')+'</strong>':'')+'</div>').join('')+'<small>'+(row.kind==='round-result'?'Scored by Server':d.accepted?'Accepted':'Not accepted')+(d.error?' · '+esc(d.error):'')+(Number.isFinite(d.elapsedMs)?' · '+(d.elapsedMs/1000).toFixed(3)+'s after start':'')+'</small>'+(d.flags||[]).map(f=>'<div class="host-warning">Decoy-answer match ('+esc(f.field)+'): '+esc(f.song)+' · '+esc(f.anime)+' · '+esc(f.artist)+'</div>').join('');
    if(row.kind==='propose')return esc(d.field||'')+' · '+esc(d.answer||'—')+'<small>'+(d.accepted?'Accepted':'Not accepted')+'</small>';
    if(row.kind==='activity')return esc(d.event+' · '+d.visibility+' · '+(d.focused?'focused':'unfocused'))+' <small>(client-reported)</small>';
    if(row.kind==='phase')return esc(d.phase)+(d.startsAt?'<small> · Song starts '+esc(time(d.startsAt))+'</small>':'');
    if(row.kind==='ended')return esc(d.reason||d.phase)+' · '+(d.rounds||0)+' songs reported';
    return esc(d.message||d.code||'—');
  }
  function assessment(){
    const a=detail.assessment||{};
    return '<form data-review-assessment class="play-review-tools"><label>Review Status<select name="status">'+['unreviewed','reviewing','resolved'].map(key=>'<option value="'+key+'" '+(a.status===key?'selected':'')+'>'+({unreviewed:'Unreviewed',reviewing:'In review',resolved:'Resolved'}[key])+'</option>').join('')+'</select></label><label>Host Notes<input name="note" maxlength="1000" value="'+esc(a.note||'')+'"></label><button class="button secondary" type="submit">Save Review</button><small>'+(a.at?'Updated '+esc(time(a.at))+' · '+esc(a.by):'')+'</small></form>';
  }
  root.addEventListener('submit',async event=>{
    const form=event.target;if(!form.matches('[data-review-assessment]'))return;
    event.preventDefault();const id=selected,button=form.querySelector('button');button.disabled=true;
    try{
      const saved=await api('play-review',{match:id,...Object.fromEntries(new FormData(form))});
      if(form.isConnected && detail && id===selected){detail.assessment=saved;events();}
    }catch(error){root.querySelector('[data-review-error]').textContent=error.message;}
    finally{button.disabled=false;}
  });
  function highlights(names){
    const h=detail.highlights;
    const seconds=ms=>(ms/1000).toFixed(2)+'s';
    const labels={decoy:'Decoy answer',return:'Correct after refocusing',fast:'Repeated fast correct answers'};
    const rows=h.rows.map(row=>{
      const d=row.data;
      const why=row.kind==='decoy'?'Matched unused song: '+d.decoy+' · '+d.decoyAnime+(d.auto?' · Scored at timeout':''):
        row.kind==='return'?'Left at +'+seconds(d.out-(d.submitAt-d.elapsed))+' · Away '+seconds(d.back-d.out)+' · Submitted '+seconds(d.submitAt-d.back)+' after return':
        'Submitted at +'+seconds(d.elapsed)+' · Correct within 1s on songs '+d.rounds.join(', ');
      return '<tr><td><strong class="review-badge">'+esc(labels[row.kind])+'</strong></td><td>'+esc(names.get(row.player)||row.player)+'</td><td>'+row.round+'</td><td>'+esc(time(d.submitAt??d.at))+'<small>'+esc(d.field)+' · '+esc(d.answer)+'</small></td><td>'+esc(why)+'</td><td><button type="button" class="text-button" data-review-context="'+(d.submitSeq??row.seq)+'" data-player="'+esc(row.player)+'">View log</button></td></tr>';
    }).join('');
    return (h.pending?'<p role="status">Checking retained match events…</p>':'')+
      (rows?'<div class="table-wrap"><table><thead><tr><th>Signal</th><th>Player</th><th>Song</th><th>Answer / Server Time</th><th>Evidence</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':h.pending?'':'<p>No review signals found in the retained events for this selection.</p>')+
      (h.next?'<button type="button" class="button secondary" data-review-offset="'+h.next+'">Older highlights</button>':'');
  }
  function events(){
    const names=new Map(detail.players.map(p=>[p.id,p.name]));
    root.querySelector('[data-review-detail]').innerHTML='<div class="play-review-tools"><div><h3>'+esc(detail.format)+' · Match Review</h3><small>'+esc(detail.id)+'</small></div><label>Player<select data-review-player><option value="">All Players</option>'+detail.players.map(p=>'<option value="'+esc(p.id)+'" '+(player===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><button class="button secondary" type="button" data-review-latest>Refresh</button></div>'+assessment()+'<div class="play-review-tools" aria-label="Review view">'+['highlights','events'].map(v=>'<button class="button secondary" type="button" data-review-view="'+v+'" aria-pressed="'+(v===view)+'">'+(v==='highlights'?'Highlights':'Full log')+'</button>').join('')+'</div>'+(detail.highlights?highlights(names):'<div class="table-wrap"><table><thead><tr><th>Server Time</th><th>Player</th><th>Song / Phase</th><th>Event</th><th>Answer / Activity</th></tr></thead><tbody>'+detail.events.map(row=>'<tr><td>'+esc(time(row.at))+(row.data.clientAt?'<small>Client: '+esc(time(row.data.clientAt))+'</small>':'')+'</td><td>'+esc(names.get(row.player)||row.player||'Server')+'</td><td>'+row.data.round+' · '+esc(row.data.phase)+'</td><td>'+esc(row.kind)+'</td><td>'+eventText(row)+'</td></tr>').join('')+'</tbody></table></div>'+(detail.next?'<button class="button secondary" type="button" data-review-older-events="'+detail.next+'">Older Events</button>':''));
  }
  async function loadEvents(before,offset){
    const params={match:selected,player,view,...(before?{before}:{}),...(offset?{offset}:{})};
    let result;
    do {
      result=await request(params);
      if(!result)return;
      detail=result;
      if(!result.highlights?.pending)break;
      root.querySelector('[data-review-error]').textContent='Checking retained match events…';
    } while(root.isConnected);
    if(root.isConnected){
      const match=index.matches.find(m=>m.id===selected);
      if(match && result.highlights && match.flags!==result.highlights.total){
        match.flags=result.highlights.total;
        list();
      }
      events();
    }
  }
  async function loadMatches(before){const result=await request({flagged:root.querySelector('[data-review-flagged]').checked?'1':'0',search:root.querySelector('[data-review-search]').value,...(before?{before}:{})});if(result){index=result;list();}}
  root.addEventListener('input',e=>{if(!e.target.matches('[data-review-search]'))return;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(root.isConnected)loadMatches();},300);});
  root.addEventListener('change',e=>{if(e.target.matches('[data-review-flagged]'))loadMatches();
    if(e.target.matches('[data-review-player]')){player=e.target.value;loadEvents();}});
  root.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
    if(button.dataset.reviewMatch){detail=null;root.querySelector('[data-review-detail]').replaceChildren();selected=button.dataset.reviewMatch;player='';view='highlights';loadEvents();}
    else if(button.dataset.reviewView){view=button.dataset.reviewView;loadEvents();}
    else if(button.dataset.reviewContext){view='events';player=button.dataset.player;loadEvents(Number(button.dataset.reviewContext)+1);}
    else if(button.dataset.reviewOffset)loadEvents(null,Number(button.dataset.reviewOffset));
    else if(button.hasAttribute('data-review-latest'))loadEvents();
    else if(button.dataset.reviewOlderEvents)loadEvents(button.dataset.reviewOlderEvents);
    else if(button.hasAttribute('data-review-refresh'))loadMatches();
    else if(button.dataset.reviewOlderMatches)loadMatches(button.dataset.reviewOlderMatches);
  });
  list();
}
