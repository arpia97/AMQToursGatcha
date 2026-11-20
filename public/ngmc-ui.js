import {comparePlayTier as byTier} from './play-mode-rules.js';
import {playPlayerAvatar} from './play-avatar.js';
import {songProgressTrigger} from './detail-popover.js';
import {artistCreditsHTML,roundDialHTML} from './play-round-ui.js';
const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const num=n=>Math.round(n).toLocaleString('en-US');
const counterIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2"/></svg>';
export function createCounterDialog(send) {
  let dialog, timer, progress, actions, shownMatch;

  function close() {
    dialog?.close();
    dialog?.remove();
    dialog = timer = progress = actions = null;
  }

  function open() {
    dialog = document.createElement('dialog');
    dialog.className = 'ngmc-counter-dialog';
    dialog.setAttribute('aria-labelledby','ngmc-counter-title');
    dialog.setAttribute('aria-describedby','ngmc-counter-description');
    dialog.innerHTML = `
      <header class="ngmc-counter-dialog-header">
        <span class="ngmc-counter-dialog-team"><span class="ngmc-counter-dialog-icon">${counterIcon}</span>Your Team</span>
        <button type="button" class="ngmc-counter-dialog-close" aria-label="Dismiss counter selection">×</button>
      </header>
      <div class="ngmc-counter-dialog-intro">
        <h2 id="ngmc-counter-title" tabindex="-1">Choose a Counter</h2>
        <p id="ngmc-counter-description">The counter chooses which teammate spends a guess after each song.</p>
      </div>
      <div class="ngmc-counter-dialog-time">
        <p>Time to volunteer <strong></strong></p>
        <progress max="20" value="20" aria-label="Volunteer time remaining"></progress>
      </div>
      <div class="ngmc-counter-dialog-actions">
        <button type="button" class="button mint" data-counter-action="volunteer">Be Counter</button>
        <button type="button" class="button secondary" data-counter-action="auto-count">Use Auto-Count</button>
      </div>
      <p class="ngmc-counter-dialog-note">A teammate can take over from Auto-Count at any time.</p>`;
    timer = dialog.querySelector('.ngmc-counter-dialog-time strong');
    progress = dialog.querySelector('progress');
    actions = dialog.querySelectorAll('[data-counter-action]');
    dialog.querySelector('.ngmc-counter-dialog-close').onclick = close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    for (const button of actions)
      button.onclick = ()=>{if(send({type:button.dataset.counterAction}))close();};
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('h2').focus({preventScroll:true});
  }

  function update(match, me, now, connected) {
    if (match?.mode !== 'ngmc-ranked' || match.phase !== 'loading' || !me || me.left ||
        match.counters[me.team] || match.autoCounting?.[me.team] || !(now < match.counterDeadline)) {
      if (dialog) close();
      return;
    }
    if (!dialog) {
      if (shownMatch === match.id || !connected || document.querySelector('dialog[open]')) return;
      shownMatch = match.id;
      open();
    }
    const seconds = Math.ceil((match.counterDeadline-now)/1000);
    if (progress.value !== seconds || !timer.textContent) {
      timer.textContent = seconds+'s';
      progress.value = seconds;
    }
    for (const button of actions) button.disabled = !connected;
  }

  return {update,close};
}

export function ngmcArena(match,form){
  return '<div class="ngmc-arena"><div class="sa-scoreboard"></div>'+
    '<section class="sa-play-panel ngmc-panel"><header class="ngmc-strip"><span>Song '+(match.index+1)+' / '+match.total+'</span><strong class="sa-round-status"></strong></header>'+
    '<div class="ngmc-on-air"><div class="ngmc-track"></div>'+roundDialHTML+'</div>'+
    '<div class="ngmc-console-body"><div class="ngmc-action-area"><div class="ngmc-input-wrap">'+form+'</div>'+
    '<div class="sa-ready-wrap"></div><div class="sa-shared-wrap"></div></div>'+
    '<div class="ngmc-progress" aria-label="Song progress"></div></div></section></div>'+
    '<div class="sa-download-status ngmc-download"></div>';
}
export function ngmcTrack(row,esc,animeTitle){
  const title=row?esc(animeTitle({anime:row.anime})):'Unrevealed';
  const name=row?esc(row.song):'—';
  return '<small>Anime</small><h2 title="'+title+'">'+title+'</h2>'+
    '<div class="ngmc-track-credits"><span><small>Song</small><span class="ngmc-song-name" title="'+name+'">'+name+'</span></span>'+
    '<span><small>Artist</small>'+(row?artistCreditsHTML(row,esc):'—')+'</span></div>';
}
export function ngmcTeams(match,esc) {
  const me=match.players.find(p=>p.id===match.me),last=match.history.at(-1);
  const revealed=last?.index===match.index&&['counting','reveal','finished'].includes(match.phase);
  const left=me?.team??0;
  return '<div class="sa-team-list ngmc-teams">'+[left,1-left].map(team=>{
    const players=match.players.filter(p=>p.team===team).sort(byTier);
    return '<section class="sa-team ngmc-team '+(team===left?'allies':'rivals')+'"><header><div><span>'+(me?(team===left?'Your Team':'Opponents'):'Team '+(team+1))+'</span><small>'+num(players.reduce((n,p)=>n+p.elo,0)/players.length)+' Avg Rating'+(match.autoCounting?.[team]?' · Auto-Count':'')+'</small></div><div class="ngmc-lives" aria-label="'+match.teams[team]+' lives remaining">'+Array.from({length:5},(_,i)=>'<i class="'+(i<match.teams[team]?'alive':'lost')+'">'+heart+'</i>').join('')+'</div></header>'+players.map(p=>{
      const result=revealed?last.results.find(r=>r.id===p.id):null,rating=match.ratings?.find(r=>r.id===p.id);
      const answer=result?(result.answers.anime||'No Answer'):p.left?'Left':['loading','buffering'].includes(match.phase)?p.audioReady?'Ready':'Loading Audio…':p.locked?'Submitted'+(Number.isFinite(p.lockedElapsedMs)?' ('+(p.lockedElapsedMs/1000).toFixed(3)+'s)':''):'Listening…';
      const badge=match.counters?.[team]===p.id?'<span class="ngmc-counter-badge" title="Team Counter" aria-label="Team Counter">'+counterIcon+'</span>':'';
      return '<div class="ngmc-player '+(p.id===me?.id?'self':'')+'">'+playPlayerAvatar(p,esc)+'<div class="ngmc-player-name"><strong title="'+esc(p.name)+'">'+esc(p.name)+badge+'</strong><small>'+num(rating?.after??p.elo)+' Rating · '+p.score+' pts'+(p.id===me?.id?' · You':'')+(rating?' · <b class="'+(rating.delta>=0?'gain':'loss')+'">'+(rating.delta>=0?'+':'')+rating.delta.toFixed(1)+'</b>':'')+'</small></div><div class="ngmc-guesses" aria-label="'+p.guesses+' of '+p.initialGuesses+' guesses remaining">'+Array.from({length:p.initialGuesses},(_,i)=>'<i class="'+(i<p.guesses?'available':'spent')+'"></i>').join('')+'</div><span class="ngmc-player-answer '+(result?result.correct.anime?'gain':'loss':'')+'" title="'+esc(answer)+'">'+(result?(result.correct.anime?'✓ ':'✕ '):'')+esc(answer)+'</span></div>';
    }).join('')+'</section>';
  }).join('')+'</div>';
}
export function ngmcControls(match,esc) {
  const me=match.players.find(p=>p.id===match.me),counter=match.players.find(p=>p.id===match.counters[me.team]);
  let html='';
  const autoCountAt=match.autoCountAt??match.counterDeadline;
  if(match.phase==='loading'&&match.counters.some((id,team)=>!id&&!match.autoCounting?.[team])&&match.now<autoCountAt){
    const signupOpen=match.now<match.counterDeadline;
    let action='<strong>Waiting for Opponent Counter</strong>';
    if(!counter&&!match.autoCounting?.[me.team]){
      action=signupOpen?'<button type="button" class="button secondary" data-sa-action="volunteer" title="Choose which teammate spends a guess">Be Counter</button>':'<strong>Counter Signup Closed</strong>';
      action+='<button type="button" class="button secondary" data-sa-action="auto-count" title="Use automatic counting until a teammate takes over">Auto-Count</button>';
    }
    const deadline=signupOpen?match.counterDeadline:autoCountAt;
    html+='<div class="ngmc-counter">'+action+'<small>'+(signupOpen?'Signup closes in ':'Automatic counting in ')+'<b data-counter-timer="'+deadline+'"></b></small></div>';
  }
  if(match.phase==='counting'){
    const row=match.history.at(-1);
    const eligible=match.players
      .filter(p=>p.team===me.team&&!p.left&&p.guesses>0&&row.results.find(r=>r.id===p.id)?.correct.anime)
      .sort(byTier);
    html+='<div class="ngmc-count-options"><strong>'+(counter?.id===me.id&&match.counts[me.team]===null?'Spend a Guess':'Counting Guesses')+'</strong>';
    if(counter?.id===me.id&&match.counts[me.team]===null)html+=eligible.map(p=>'<button class="button secondary" type="button" data-sa-count="'+esc(p.id)+'">'+esc(p.name)+' <small>'+p.guesses+'</small></button>').join('');
    html+='</div>';
  }
  if(match.phase==='reveal'){
    const row=match.history.at(-1),mine=!!row.spent?.[me.team],other=!!row.spent?.[1-me.team];
    html+='<div class="ngmc-round-outcome '+(mine&&!other?'gain':other&&!mine?'loss':'')+'">'+(mine&&other?'Both Teams Countered':mine?'Opponent Loses a Life':other?'Your Team Loses a Life':'No Lives Lost')+'<span class="ngmc-life-score">'+match.teams[me.team]+' – '+match.teams[1-me.team]+' lives</span>'+(row.reset?.length?'<small>'+row.reset.map(t=>t===me.team?'Your team’s guesses refilled':'Opponents’ guesses refilled').join(' · ')+'</small>':'')+'</div>';
  }
  return html;
}
export function ngmcProgress(match,esc,animeTitle) {
  const revealed=new Map(match.history.map(row=>[row.index,row]));
  return Array.from({length:match.total},(_,index)=>{
    const row=revealed.get(index);
    const own=row?.results.find(result=>result.id===match.me);
    if(!own){
      if(row&&!match.me)return '<i class="hit" title="'+esc(animeTitle(row))+'"></i>';
      return '<i class="'+(index===match.index?'current':'')+'" title="Song '+(index+1)+'"></i>';
    }
    const correct=!!own.correct.anime;
    return '<i class="'+(correct?'hit':'miss')+'">'+songProgressTrigger(match.id,index,{
      title:row.song, artist:row.artist, anime:animeTitle(row), answer:own.answers.anime,
      result:correct?'Correct':'Incorrect', correct,
    },esc)+'</i>';
  }).join('');
}
