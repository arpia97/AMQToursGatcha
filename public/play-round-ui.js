import {DUEL_FORMAT,ONE_TEAM_FORMAT,PLAY_REVEAL_MS,matchGuessFields,ngmcCounterDeadline,oneTeamRules,soloVersus} from './play-mode-rules.js';
import {ARENA_FORMAT} from './play-arena-config.js';
import {percentDone} from './play-setup-progress.js';
import {playPlayerAvatar} from './play-avatar.js';
const fields={anime:'Anime Name',song:'Song Name',artist:'Artist'};
const revealed=(match,row)=>!!row&&(row.index===match.index&&['reveal','counting','finished'].includes(match.phase)||
  !match.me&&['finished','cancelled'].includes(match.phase));
export const scoreBadge=(points,total=3)=>'<b class="sa-round-score" title="This Song" data-score="'+points+'">'+points+'/'+total+'</b>';
export const roundDialHTML='<div class="ngmc-dial" hidden><b class="sa-timer" role="timer"></b><small></small></div>';
const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
export function teamLivesHTML(lives,max=5){
  return '<div class="ngmc-lives" role="img" aria-label="'+lives+' of '+max+' lives remaining">'+
    Array.from({length:max},(_,i)=>'<i class="'+(i<lives?'alive':'lost')+'">'+heart+'</i>').join('')+'</div>';
}
export function songBroadcastLayout(match,{tiles='',answerForm='',skipButton='',resumeAudio=''}={}){
  const arena=match.mode===ARENA_FORMAT,duel=match.mode===DUEL_FORMAT;
  const versus=!arena&&!match.lobby&&match.teams.length===2;
  const survival=match.format===ONE_TEAM_FORMAT;
  const scoreboard='<div class="sa-scoreboard"></div>';
  const ready='<div class="sa-ready-wrap"></div>';
  const download='<div class="sa-download-status'+(survival?' one-team-download':'')+'"></div>';
  return (survival?'':ready)+'<div class="song-broadcast '+(arena?'arena-match':duel?'versus duel-match':versus?'versus':'cooperative')+(survival?' one-team-survival':'')+'">'+
    (arena?'':scoreboard)+
    '<section class="sa-play-panel sa-song-panel"><header class="song-broadcast-header"><div><strong class="sa-round-status"></strong><h2>Song '+(match.index+1)+' <small>/ '+match.total+'</small></h2>'+
    (survival?'<div class="one-team-mobile-lives"></div>':'')+'</div>'+roundDialHTML+'</header>'+
    '<div class="song-broadcast-body">'+(survival?ready:'')+'<div class="sa-reveal-wrap"></div>'+
    (survival?answerForm+skipButton+'<div class="sa-shared-wrap"></div>':download+'<div class="sa-shared-wrap"></div>'+tiles+answerForm+skipButton)+
    '</div></section>'+(arena?scoreboard:'')+'</div>'+(survival?'<div class="one-team-audio-footer">'+download+resumeAudio+'</div>':'');
}
export function updateRoundDial(dial,match,now){
  const guessing=match.phase==='guess',counting=match.phase==='counting';
  dial.hidden=!guessing&&!counting&&match.phase!=='reveal';
  if(dial.hidden)return;
  const duration=guessing?match.until-match.startsAt:counting?8000:PLAY_REVEAL_MS;
  const remaining=Math.max(0,Math.min(duration,match.until-now));
  const seconds=guessing&&match.lobby?.seconds===0?'∞':String(Math.ceil(remaining/1000)).padStart(2,'0');
  const timer=dial.firstElementChild,label=dial.lastElementChild;
  if(timer.textContent!==seconds)timer.textContent=seconds;
  const final=match.index+1===match.total||match.format===ONE_TEAM_FORMAT&&match.teams[0]===0;
  const unit=guessing?'Seconds':counting?'Counting':final?'Results':'Next song';
  if(label.textContent!==unit)label.textContent=unit;
  dial.style.setProperty('--remaining',100*remaining/Math.max(duration,1)+'%');
}
export function animeTitlesHTML(row,esc,animeTitle) {
  const displayed=animeTitle({anime:row.anime});
  const alternatives=row.animeTitles?.filter(title=>title!==displayed) || [];
  if (!alternatives.length) return esc(displayed);
  const details=['Accepted Alternative Titles',...alternatives].join('\n');
  return '<button type="button" class="play-anime-title" data-detail-popup="'+esc(details)+
    '" aria-expanded="false">'+esc(displayed)+'</button>';
}
export function artistCreditsHTML(row,esc){
  const names=row.artistMembers?.length?row.artistMembers:[row.artist];
  return '<span class="sa-artist-info"><button type="button" data-sa-artist-info aria-expanded="false" aria-label="Artist credits for '+esc(row.artist)+'">'+esc(row.artist)+'</button><span class="sa-artist-tooltip" role="tooltip"><small>Artist Credits</small>'+names.map(name=>'<span>'+esc(name)+'</span>').join('')+'</span></span>';
}
export function recapHTML(match,esc,animeTitle){
  const row=match.history.at(-1);
  if(!revealed(match,row))return '';
  const me=match.players.find(p=>p.id===match.me),mine=row.results.find(p=>p.id===match.me);
  const points=me?(match.arena?row.points[me.team]:mine?.earned||0):0;
  const survival=match.format===ONE_TEAM_FORMAT;
  const teamGuess=survival?row.results.find(result=>result.answers.anime)?.answers.anime:null;
  const roundLabel=survival?row.points[0]?'Team Correct':'Team Lost a Life':
    me?(match.teamFields?'Team '+row.points[me.team]+'/3 · ':'')+'+'+points+(points===1?' Point':' Points')+(match.arena?' for Your Pair':''):'';
  return '<section class="sa-answer-key" aria-label="Correct answers"><header><strong>Correct Answers</strong><small'+
    (survival?' class="one-team-round-result" data-correct="'+!!row.points[0]+'"':'')+'>'+
    roundLabel+'</small></header><dl>'+
    '<div><dt>Anime</dt><dd>'+animeTitlesHTML(row,esc,animeTitle)+'</dd></div><div><dt>Song'+(row.songType?' · '+esc(row.songType):'')+'</dt><dd>'+esc(row.song)+'</dd></div>'+
    '<div><dt>Artist</dt><dd>'+artistCreditsHTML(row,esc)+'</dd></div></dl>'+
    (survival?'<p class="one-team-picked"><span>Team Guess</span><strong>'+esc(teamGuess||'No guess submitted')+'</strong></p>':'')+'</section>';
}
export function songTeamsHTML(match,esc){
  const me=match.players.find(p=>p.id===match.me),solo=soloVersus(match.format),last=match.history.at(-1);
  const survival=match.format===ONE_TEAM_FORMAT;
  const submitted=survival?new Set((match.ballot?.anime||[]).map(choice=>choice.owner)):null;
  return '<div class="sa-team-list">'+(me?(match.teams.length===1?[me.team]:[me.team,1-me.team]):match.teams.map((_,i)=>i)).map(team=>{
    const roster=match.players.filter(p=>p.team===team);
    if(match.teams.length===1)roster.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    const title=solo?esc(roster[0].name)+(me?(team===me.team?' <small>You</small>':' <small>Opponent</small>'):''):
      me?(team===me.team?'Your Team':'Opponents'):match.teams.length===1?'Players':'Team '+(team+1);
    const total=survival?teamLivesHTML(match.teams[team],oneTeamRules.lives):'<strong>'+match.teams[team]+'</strong>';
    return '<section class="sa-team sa-song-team '+(team===(me?.team??0)?'allies':'rivals')+(solo?' sa-solo':'')+'"><header><span>'+title+(match.teamFields&&revealed(match,last)?' '+scoreBadge(last.points[team]):'')+'</span>'+total+'</header>'+roster.map(p=>{
      const result=revealed(match,last)?last.results.find(r=>r.id===p.id):null;
      const status=p.left?'Left':['finished','cancelled'].includes(match.phase)?'Match Complete':['loading','buffering'].includes(match.phase)?p.audioReady?'Ready':p.ready?'Loading Audio…':'Not Ready':survival&&p.submittedFields?.length?'Submitted':p.locked?'Submitted'+(Number.isFinite(p.lockedElapsedMs)?' ('+(p.lockedElapsedMs/1000).toFixed(3)+'s)':''):p.submittedFields?.length?'Submitted · '+p.submittedFields.map(f=>fields[f]).join(', '):'Answering…';
      const answer=survival&&result?result.answers.anime?'<small class="one-team-guess" data-correct="'+!!result.correct.anime+'">'+answerMark(result.correct.anime)+esc(result.answers.anime)+'</small>':
        '<small>'+ (p.left?'Left':submitted?.has(p.id)?'Guess not picked':'—') +'</small>':'<small>'+esc(status)+'</small>';
      return '<div class="sa-song-player '+(p.id===me?.id?'self':'')+'">'+playPlayerAvatar(p,esc)+'<div class="sa-song-player-info">'+(solo?'':'<strong>'+esc(p.name)+(p.id===me?.id?' <small>You</small>':'')+'</strong>')+answer+'</div><strong class="sa-player-points">'+(result&&!match.teamFields&&!survival?scoreBadge(result.earned,matchGuessFields(match).length):'')+'<small>'+p.score+(survival?' Correct':' Points')+'</small></strong></div>';
    }).join('')+'</section>';
  }).join('')+'</div>';
}
export function answerMark(correct){
  return '<span class="sa-guess-mark" role="img" aria-label="'+(correct?'Correct':'Incorrect')+'">'+(correct?'✓':'✕')+'</span>';
}
export function answerSideHTML(match,row,team,esc){
  const roster=match.players.filter(p=>p.team===team),solo=soloVersus(match.format);
  const answerFields=matchGuessFields(match).map(field=>[field,fields[field]]);
  return '<div class="sa-answer-summary">'+answerFields.map(([field,label])=>{
    const result=row?.results.find(r=>roster.some(p=>p.id===r.id)&&(solo||Object.hasOwn(r.answers,field)));
    const owner=row?roster.find(p=>p.id===result?.id):roster.find(p=>p.submittedFields?.includes(field));
    const answer=result?.answers[field],correct=!!result?.correct[field];
    const state=row?(correct?'correct':'incorrect'):owner?'pending':'';
    const display=row?answer||'No answer':owner?'Submitted':'Awaiting submission';
    return '<article class="sa-team-answer-tile" data-answer-state="'+state+'"><header><h3>'+label+'</h3><small>'+esc(solo?'':owner?.name||'')+'</small></header><div class="sa-team-answer-value">'+esc(display)+'</div>'+
      (row?answerMark(correct):'')+'</article>';
  }).join('')+'</div>';
}
export function versusHTML(match,row,esc){
  const me=match.players.find(p=>p.id===match.me),solo=soloVersus(match.format);
  const ffa=match.format==='lobby-ffa';
  const teams=!me?match.teams.map((_,i)=>i):ffa?[me.team,...match.players.filter(p=>p.team!==me.team).map(p=>p.team)]:match.teams.length===1?[me.team]:[me.team,1-me.team];
  return '<div class="sa-answer-sides">'+teams.map(team=>'<section><h3 class="sa-side-heading">'+(solo||ffa?team===me?.team?'You':esc(match.players.find(p=>p.team===team).name):me?(team===me.team?'Your Team':'Opponents'):match.teams.length===1?'Team':'Team '+(team+1))+(row?scoreBadge(row.points?.[team]??0,matchGuessFields(match).length):'')+'</h3>'+answerSideHTML(match,row,team,esc)+'</section>').join('')+'</div>';
}
export function songResultsHTML(match,esc,animeTitle){
  if(match.format===ONE_TEAM_FORMAT)return '<div class="sa-match-results single-score">'+match.history.map(row=>
    '<details><summary><span><small>'+String(row.index+1).padStart(2,'0')+'</small> '+esc(animeTitle({anime:row.anime}))+
    '</span><b class="one-team-round-result" data-correct="'+!!row.points[0]+'">'+(row.points[0]?'Correct':'Life lost')+
    ' · '+row.lives[0]+' / '+oneTeamRules.lives+'</b></summary><p class="sa-result-key">'+esc(row.song)+' · '+esc(row.artist)+'</p><ul class="one-team-result-guesses">'+
    (row.results.filter(result=>result.answers.anime).map(result=>'<li><strong>'+esc(match.players.find(p=>p.id===result.id)?.name||'Player')+'</strong><span data-correct="'+!!result.correct.anime+'">'+
      answerMark(result.correct.anime)+esc(result.answers.anime)+'</span></li>').join('')||'<li>No guess submitted</li>')+'</ul></details>').join('')+'</div>';
  const me=match.players.find(p=>p.id===match.me),solo=soloVersus(match.format)||match.format==='lobby-ffa';
  const versus=match.teams.length===2&&match.format!=='lobby-ffa';
  if(!me)return '<div class="sa-match-results single-score">'+match.history.map(row=>
    '<details><summary><span><small>'+String(row.index+1).padStart(2,'0')+'</small> '+esc(animeTitle(row))+
    '</span></summary><p class="sa-result-key">'+esc(row.song)+' · '+esc(row.artist)+'</p>'+versusHTML(match,row,esc)+'</details>'
  ).join('')+'</div>';
  return '<div class="sa-match-results'+(versus?'':' single-score')+'"><div class="sa-result-columns"><span>Anime</span><span>'+(solo?'You':'Your Team')+'</span>'+(versus?'<span>'+(solo?'Opponent':'Opponents')+'</span>':'')+'</div>'+match.history.map(row=>'<details><summary><span><small>'+String(row.index+1).padStart(2,'0')+'</small> '+esc(animeTitle({anime:row.anime}))+'</span>'+scoreBadge(row.points?.[me.team]??0,matchGuessFields(match).length)+(versus?scoreBadge(row.points?.[1-me.team]??0,matchGuessFields(match).length):'')+'</summary><p class="sa-result-key">'+esc(row.song)+' · '+esc(row.artist)+'</p>'+versusHTML(match,row,esc)+'</details>').join('')+'</div>';
}
export function readyHTML(match,canReady,ready,esc,autoReadyControl=''){
  const active=match.players.filter(p=>!p.left),count=active.filter(p=>p.acceptedReady||p.ready).length;
  return '<section class="sa-ready-panel"><span class="sa-eyebrow">'+count+' / '+active.length+' Players Ready'+(active.length?' · '+percentDone(count,active.length):'')+'</span><h2>'+(ready?(count===active.length?(active.every(p=>p.audioReady)&&match.counters?.some((id,team)=>!id&&!match.autoCounting?.[team])&&match.now<ngmcCounterDeadline(match)?'Choosing Counters':'Preparing Audio'):'Waiting for Everyone'):'Ready to Play?')+'</h2><button type="button" class="button mint sa-ready-button" data-sa-action="ready" '+(!canReady||ready?'disabled':'')+'>'+(ready?'✓ Ready':canReady?'Ready · Enable Audio':'Preparing Audio…')+'</button><p>'+esc(active.filter(p=>!p.acceptedReady&&!p.ready).map(p=>p.name).join(' · ')||'Everyone Is Ready')+'</p>'+autoReadyControl+'</section>';
}
