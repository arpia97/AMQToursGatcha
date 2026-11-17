const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const num=n=>Math.round(n).toLocaleString('en-US');
export function ngmcTeams(match,esc) {
  const me=match.players.find(p=>p.id===match.me),last=match.history.at(-1);
  return '<div class="sa-team-list ngmc-teams">'+[me.team,1-me.team].map(team=>{
    const players=match.players.filter(p=>p.team===team).sort((a,b)=>b.elo-a.elo||a.id.localeCompare(b.id));
    return '<section class="sa-team ngmc-team '+(team===me.team?'allies':'rivals')+'"><header><div><span>'+ (team===me.team?'Your Team':'Opponents')+'</span><small>'+num(players.reduce((n,p)=>n+p.elo,0)/4)+' Avg Elo</small></div><div class="ngmc-lives" aria-label="'+match.teams[team]+' lives remaining">'+Array.from({length:5},(_,i)=>'<i class="'+(i<match.teams[team]?'alive':'lost')+'">'+heart+'</i>').join('')+'</div></header>'+players.map(p=>{
      const hit=last?.index===match.index&&last.results.find(r=>r.id===p.id)?.correct.anime;
      const rating=match.ratings?.find(r=>r.id===p.id);
      return '<div class="ngmc-player '+(p.id===me.id?'self':'')+'"><span class="ngmc-player-mark '+(hit?'hit':'')+'">'+(hit?'✓':p.locked?'•':'')+'</span><div class="ngmc-player-name"><strong>'+esc(p.name)+'</strong><small>'+num(rating?.after??p.elo)+' Elo'+(p.id===me.id?' · You':'')+(match.counters[team]===p.id?' · Counter':'')+(rating?' · <b class="'+(rating.delta>=0?'gain':'loss')+'">'+(rating.delta>=0?'+':'')+rating.delta.toFixed(1)+'</b>':'')+'</small></div><div class="ngmc-guesses" aria-label="'+p.guesses+' of '+p.initialGuesses+' guesses remaining">'+Array.from({length:p.initialGuesses},(_,i)=>'<i class="'+(i<p.guesses?'available':'spent')+'"></i>').join('')+'</div><span class="ngmc-player-state">'+(p.left?'Left':['loading','buffering'].includes(match.phase)?p.ready?'Ready':p.loaded+'/35':hit?'Correct':p.locked?'Locked':'Listening')+'</span></div>';
    }).join('')+'</section>';
  }).join('')+'</div>';
}
export function ngmcControls(match,esc) {
  const me=match.players.find(p=>p.id===match.me),counter=match.players.find(p=>p.id===match.counters[me.team]);
  let html='<div class="ngmc-counter"><span>Team Counter <strong>'+esc(counter?.name||'Automatic')+'</strong></span>';
  if(match.phase==='loading'&&!counter&&match.now<match.counterDeadline)html+='<button type="button" class="button secondary" data-sa-action="volunteer">Volunteer to Count</button><small>Automatic in <b data-counter-timer></b></small>';
  html+='</div>';
  if(match.phase==='counting'){
    const row=match.history.at(-1),eligible=match.players.filter(p=>p.team===me.team&&!p.left&&p.guesses>0&&row.results.find(r=>r.id===p.id)?.correct.anime);
    html+='<div class="ngmc-count-options"><strong>'+(counter?.id===me.id&&match.counts[me.team]===null?'Choose Whose Guess to Use':'Counting Guesses')+'</strong>';
    if(counter?.id===me.id&&match.counts[me.team]===null)html+=eligible.map(p=>'<button class="button secondary" type="button" data-sa-count="'+esc(p.id)+'">'+esc(p.name)+' <small>'+p.guesses+' → '+(p.guesses-1)+'</small></button>').join('');
    html+='<small>Automatic fallback: lowest Elo first</small></div>';
  }
  if(match.phase==='reveal'){
    const row=match.history.at(-1),mine=!!row.spent?.[me.team],other=!!row.spent?.[1-me.team];
    html+='<div class="ngmc-round-outcome '+(mine&&!other?'gain':other&&!mine?'loss':'')+'">'+(mine&&other?'Both Teams Countered':mine?'Opponent Loses a Life':other?'Your Team Loses a Life':'No Lives Lost')+(row.reset?.length?'<small>'+row.reset.map(t=>t===me.team?'Your team’s guesses refilled':'Opponents’ guesses refilled').join(' · ')+'</small>':'')+'</div>';
  }
  return html;
}
export function ngmcProgress(match) {
  const me=match.players.find(p=>p.id===match.me);
  return '<div class="ngmc-progress" aria-label="Song progress">'+Array.from({length:35},(_,i)=>{const row=match.history.find(r=>r.index===i);return '<i class="'+(row?row.results.find(r=>r.id===me.id)?.correct.anime?'hit':'miss':i===match.index?'current':'')+'" title="Song '+(i+1)+'"></i>';}).join('')+'</div>';
}
