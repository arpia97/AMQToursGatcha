import {timelineHTML,showTimelineAnswer} from './play-review-timeline.js?v=player-flags';

export const playReviewPanel=(page=false)=>`<section class="host-panel play-review">
  <div data-review-browser><h2>${page?'Match Review':'Multiplayer Match Review'}</h2>
  <div class="play-review-tools review-list-tools"><input type="search" data-review-search placeholder="Search player name, ID or match ID…" aria-label="Search matches">
  <label><input type="checkbox" data-review-flagged> Flagged matches only</label>
  <button type="button" class="button secondary" data-review-refresh>Refresh</button></div>
  <div data-review-matches></div></div>
  ${page?'<button type="button" data-review-back class="text-button" hidden>← All matches</button>':''}
  <div data-review-detail></div><p data-review-error role="status"></p>
  <p class="form-hint">Focus changes are browser-reported. Times use server receipt. Flags are for host review.</p></section>`;

export function mountPlayReview(root,initial,api,esc,formatName=value=>value){
  const browser=root.querySelector('[data-review-browser]'),back=root.querySelector('[data-review-back]');
  let index=initial,detail=null,selected='',player='',view='highlights',version=0,searchTimer,round;
  const time=value=>new Date(value).toLocaleString(undefined,{hour12:false})+'.'+String(value%1000).padStart(3,'0');
  const query=values=>'play-review?'+new URLSearchParams(values);
  async function request(values){const id=++version;root.querySelector('[data-review-error]').textContent='Loading…';try{const result=await api(query(values));if(!root.isConnected||id!==version)return null;root.querySelector('[data-review-error]').textContent='';return result;}catch(error){if(root.isConnected&&id===version)root.querySelector('[data-review-error]').textContent=error.message;return null;}}
  function signalCount(kind,count){
    const value=count==null?'—':Number(count);
    return '<strong class="review-count'+(count>0?' review-'+kind:'')+'">'+value+'</strong>';
  }
  function list(){
    const signals=[['refocus','Refocus'],['decoy','Link Match'],['fast','Fast Answers']];
    const rows=index.matches.map(m=>{
      const date=new Date(m.created);
      const counts=signals.map(([kind,label])=>'<td class="review-metric">'+(back?'<span>'+label+'</span>':'')+signalCount(kind,m.counts?.[kind]??(m.flags?null:0))+'</td>').join('');
      return '<tr><td class="review-mode"><strong>'+esc(formatName(m.format))+'</strong><small>'+esc(m.status)+'</small></td>'+
        '<td class="review-date">'+esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))+
        '<small>'+esc(date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))+'</small></td>'+
        '<td class="review-roster">'+m.players.map(p=>esc(p.name)).join(' · ')+'</td>'+counts+
        '<td class="review-open"><button class="text-button" type="button" data-review-match="'+esc(m.id)+'">Review</button></td></tr>';
    }).join('');
    root.querySelector('[data-review-matches]').innerHTML=(!rows?'<p>No matches found.</p>':
      '<div class="table-wrap"><table class="review-match-index"><thead><tr><th>Match</th><th>Started</th><th>Players</th>'+
      signals.map(([,label])=>'<th>'+label+'</th>').join('')+'<th aria-label="Actions"></th></tr></thead><tbody>'+rows+'</tbody></table></div>')+
      (index.next?'<button class="button secondary" type="button" data-review-older-matches="'+index.next+'">Older Matches</button>':'');

  }
  function trackText(track){
    return [track.song,track.artist,track.anime].filter(Boolean).map(esc).join(' · ');
  }
  function decoyEvidence(decoy,played,round){
    const assigned=decoy.assignedRound;
    const timing=Number.isInteger(assigned)
      ? '<small>Assigned to Song '+assigned+(assigned===round?' · Submitted on assigned song':'')+'</small>'
      : '';
    return '<div><strong>Decoy</strong> · '+trackText(decoy)+'</div><div><strong>Played</strong> · '+
      (played?trackText(played):'Unavailable in retained history')+'</div>'+timing;
  }
  function eventText(row){
    const d=row.data;
    const decoys=(d.flags||[]).map(flag=>'<div class="host-warning">'+decoyEvidence(flag,flag.played,d.round)+'</div>').join('');
    if(d.answers)return Object.entries(d.answers).map(([field,value])=>'<div><small>'+esc(field)+': </small>'+esc(value||'—')+(d.correct?' <strong class="'+(d.correct[field]?'correct':'incorrect')+'">'+(d.correct[field]?'Correct':'Incorrect')+'</strong>':'')+'</div>').join('')+'<small>'+(row.kind==='round-result'?'Scored by Server':d.accepted?'Accepted':'Not accepted')+(d.error?' · '+esc(d.error):'')+(Number.isFinite(d.elapsedMs)?' · '+(d.elapsedMs/1000).toFixed(3)+'s after start':'')+'</small>'+decoys;
    if(row.kind==='propose')return esc(d.field||'')+' · '+esc(d.answer||'—')+'<small>'+(d.accepted?'Accepted':'Not accepted')+'</small>'+decoys;
    if(row.kind==='activity')return esc(d.event+' · '+d.visibility+' · '+(d.focused?'focused':'unfocused'))+' <small>(client-reported)</small>';
    if(row.kind==='audio-issue')return esc(({blocked:'Browser blocked playback','play-error':'Playback failed',paused:'Playback paused',stalled:'Playback stopped advancing',decode:'Clip could not be decoded'})[d.reason]||'Audio issue')+' <small>(client-reported)</small>';
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
    const labels={decoy:'Link Match · Decoy hit',return:'Refocus',fast:'Repeated fast correct answers'};
    const rows=h.rows.map(row=>{
      const d=row.data;
      const why=row.kind==='decoy'
        ? decoyEvidence({song:d.decoy,anime:d.decoyAnime,artist:d.decoyArtist,assignedRound:d.assignedRound},d.played,row.round)+(d.auto?'<small>Scored at timeout</small>':'')
        : esc(row.kind==='return'
          ? 'Left at +'+seconds(d.out-(d.submitAt-d.elapsed))+' · Away '+seconds(d.back-d.out)+' · Submitted '+seconds(d.submitAt-d.back)+' after return'
          : 'Submitted at +'+seconds(d.elapsed)+' · Correct within 1s on songs '+d.rounds.join(', '));
      return '<tr><td><strong class="review-signal review-'+(row.kind==='return'?'refocus':row.kind)+'">'+esc(labels[row.kind])+'</strong></td><td>'+esc(names.get(row.player)||row.player)+'</td><td>'+row.round+'</td><td>'+esc(time(d.submitAt??d.at))+'<small>'+esc(d.field)+' · '+esc(d.answer)+'</small></td><td>'+why+'</td><td><button type="button" class="text-button" data-review-context="'+(d.submitSeq??row.seq)+'" data-player="'+esc(row.player)+'">View log</button></td></tr>';
    }).join('');
    const summary=h.counts?'<div class="review-signal-summary"><span>Refocus '+signalCount('refocus',h.counts.refocus)+'</span><span>Link Match '+signalCount('decoy',h.counts.decoy)+'</span><span>Fast Answers '+signalCount('fast',h.counts.fast)+'</span></div>':'';
    return summary+(h.pending?'<p role="status">Checking retained match events…</p>':'')+
      (rows?'<div class="table-wrap"><table><thead><tr><th>Signal</th><th>Player</th><th>Song</th><th>Answer / Server Time</th><th>Evidence</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':h.pending?'':'<p>No review signals found in the retained events for this selection.</p>')+
      (h.next?'<button type="button" class="button secondary" data-review-offset="'+h.next+'">Older highlights</button>':'');
  }
  function events(){
    const names=new Map(detail.players.map(p=>[p.id,p.name]));
    const scroll = root.querySelector('.review-timeline-songs')?.scrollLeft ?? 0;
    const restoreSongFocus = document.activeElement?.matches('[data-review-round]') && root.contains(document.activeElement);
    root.querySelector('[data-review-detail]').innerHTML='<div class="play-review-tools"><div><h3>'+esc(formatName(detail.format))+' · Match Review</h3><small>'+esc(detail.id)+'</small></div><label>Player<select data-review-player><option value="">All Players</option>'+detail.players.map(p=>'<option value="'+esc(p.id)+'" '+(player===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><button class="button secondary" type="button" data-review-latest>Refresh</button></div>'+(back?'':assessment())+'<div class="play-review-tools" aria-label="Review view">'+['highlights','timeline','events'].map(v=>'<button class="button secondary" type="button" data-review-view="'+v+'" aria-pressed="'+(v===view)+'">'+({highlights:'Highlights',timeline:'Timeline',events:'Full log'}[v])+'</button>').join('')+'</div>'+(detail.highlights?highlights(names):view==='timeline'?timelineHTML(detail.timeline,names,esc):'<div class="table-wrap"><table><thead><tr><th>Server Time</th><th>Player</th><th>Song / Phase</th><th>Event</th><th>Answer / Activity</th></tr></thead><tbody>'+detail.events.map(row=>'<tr><td>'+esc(time(row.at))+(row.data.clientAt?'<small>Client: '+esc(time(row.data.clientAt))+'</small>':'')+'</td><td>'+esc(names.get(row.player)||row.player||'Server')+'</td><td>'+row.data.round+' · '+esc(row.data.phase)+'</td><td>'+esc(row.kind)+'</td><td>'+eventText(row)+'</td></tr>').join('')+'</tbody></table></div>'+(detail.next?'<button class="button secondary" type="button" data-review-older-events="'+detail.next+'">Older Events</button>':''));
    if(back)root.querySelector('[data-review-detail]').insertAdjacentHTML('beforeend',assessment());
    const songs = root.querySelector('.review-timeline-songs');
    const selectedSong = songs?.querySelector('[aria-pressed="true"]');
    if (selectedSong) {
      songs.scrollLeft = scroll;
      if (selectedSong.offsetLeft < songs.scrollLeft) songs.scrollLeft = selectedSong.offsetLeft;
      const right = selectedSong.offsetLeft + selectedSong.offsetWidth;
      if (right > songs.scrollLeft + songs.clientWidth) songs.scrollLeft = right - songs.clientWidth;
      if (restoreSongFocus) selectedSong.focus({preventScroll:true});
    }
  }
  async function loadEvents(before,offset){
    const params={match:selected,player,view,...(view==='timeline'&&round?{round}:{}),...(before?{before}:{}),...(offset?{offset}:{})};
    let result;
    do {
      result=await request(params);
      if(!result)return;
      detail=result;
      if(!result.highlights?.pending && !result.timeline?.pending)break;
      root.querySelector('[data-review-error]').textContent='Checking retained match events…';
    } while(root.isConnected);
    if(root.isConnected){
      const match=index?.matches.find(m=>m.id===selected);
      if(match && result.highlights && !player){
        match.counts=result.highlights.counts;
        match.flags=result.highlights.total;
        list();
      }
      events();
    }
  }
  async function loadMatches(before){const result=await request({flagged:root.querySelector('[data-review-flagged]').checked?'1':'0',search:root.querySelector('[data-review-search]').value,...(before?{before}:{})});if(result){index=result;list();}}
  root.addEventListener('input',e=>{if(!e.target.matches('[data-review-search]'))return;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(root.isConnected)loadMatches();},300);});
  root.addEventListener('change',e=>{if(e.target.matches('[data-review-flagged]'))loadMatches();
    if(e.target.matches('[data-review-player]')){player=e.target.value;loadEvents();}
  });
  root.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-review-back')){
      ++version;const previous=selected;selected='';detail=null;
      root.querySelector('[data-review-detail]').replaceChildren();
      root.querySelector('[data-review-error]').textContent='';
      back.hidden=true;browser.hidden=false;
      browser.querySelector('[data-review-match="'+CSS.escape(previous)+'"]')?.focus();
      return;
    }
    if(button.dataset.reviewMatch){clearTimeout(searchTimer);if(back){browser.hidden=true;back.hidden=false;back.focus();}detail=null;root.querySelector('[data-review-detail]').replaceChildren();selected=button.dataset.reviewMatch;player='';round=undefined;view='highlights';loadEvents();}
    else if(button.dataset.reviewView){view=button.dataset.reviewView;loadEvents();}
    else if(button.dataset.reviewContext){view='events';player=button.dataset.player;loadEvents(Number(button.dataset.reviewContext)+1);}
    else if(button.dataset.reviewRound && button.getAttribute('aria-pressed') !== 'true'){
      round=button.dataset.reviewRound;
      loadEvents();
    }
    else if(button.dataset.reviewTrack !== undefined){
      const names=new Map(detail.players.map(p=>[p.id,p.name]));
      showTimelineAnswer(root.querySelector('[data-review-marker-detail]'),detail.timeline,names,button.dataset);
    }
    else if(button.dataset.reviewOffset)loadEvents(null,Number(button.dataset.reviewOffset));
    else if(button.hasAttribute('data-review-latest'))loadEvents();
    else if(button.dataset.reviewOlderEvents)loadEvents(button.dataset.reviewOlderEvents);
    else if(button.hasAttribute('data-review-refresh'))loadMatches();
    else if(button.dataset.reviewOlderMatches)loadMatches(button.dataset.reviewOlderMatches);
  });
  if(initial)list();else void loadMatches();
}
