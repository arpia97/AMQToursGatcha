import {soloVersus} from './play-mode-rules.js';
import {songResultsHTML} from './play-round-ui.js';

function finalScores(match,me,escapeName){
  const scores=match.teams,freeForAll=match.format==='lobby-ffa';
  const unit=match.mode==='ngmc-ranked'?'lives':'pts';
  const solo=freeForAll||soloVersus(match.format);
  const metric=(label,value)=>'<div><small>'+label+'</small><strong>'+value+' <span>'+unit+'</span></strong></div>';
  if(!me){
    const html=scores.map((value,team)=>{
      const player=solo?match.players.find(p=>p.team===team):null;
      return metric(player?.name?escapeName(player.name):scores.length===1?'Team':'Team '+(team+1),value);
    }).join('');
    return '<div class="broadcast-final-scores">'+html+'</div>';
  }
  let html=metric(solo?'You':'Your team',scores[me.team]);
  if(freeForAll&&scores.length>1)html+=metric('Highest score',Math.max(...scores));
  else if(scores.length===2)html+=metric(solo?'Opponent':'Opponents',scores[1-me.team]);
  return '<div class="broadcast-final-scores">'+html+'</div>';
}

function ngmcHistory(match,me,esc,animeTitle){
  return '<div class="sa-match-results ngmc-round-history"><div class="sa-result-columns"><span>Anime</span><span>'+(me?'Your guess':'Lobby Score')+'</span><span>Lives</span></div>'+match.history.map(row=>{
    const result=row.results.find(p=>p.id===me?.id),hit=result?.correct.anime;
    const team=me?.team??0,lives=row.lives?row.lives[team]+' – '+row.lives[1-team]:'—';
    const score=me?'<b class="'+(hit?'hit':'miss')+'">'+(hit?'Hit':'Miss')+'</b>':
      '<b>'+row.results.filter(entry=>entry.correct.anime).length+' / '+match.players.length+'</b>';
    return '<details><summary><span><small>'+String(row.index+1).padStart(2,'0')+'</small> '+esc(animeTitle({anime:row.anime}))+'</span>'+
      score+'<b>'+lives+'</b></summary>'+
      '<dl><dt>Song</dt><dd>'+esc(row.song)+'</dd><dt>Artist</dt><dd>'+esc(row.artist)+'</dd>'+
      (me?'<dt>Your answer</dt><dd>'+esc(result?.answers.anime||'No answer')+'</dd>':'')+'</dl></details>';
  }).join('')+'</div>';
}

export function broadcastResults(match,esc,animeTitle,winnerText){
  const finished=match.phase==='finished',me=match.players.find(p=>p.id===match.me);
  const count=match.history.length;
  const summary='<section class="broadcast-final"><div><small>'+count+' '+(count===1?'song':'songs')+' played</small><h2>'+
    esc(finished?winnerText():match.reason||'Match cancelled')+'</h2>'+
    (finished&&match.reason?'<p>'+esc(match.reason)+'</p>':'')+'</div>'+(finished?finalScores(match,me,esc):'')+'</section>';
  const history=count?(match.mode==='ngmc-ranked'?ngmcHistory(match,me,esc,animeTitle):songResultsHTML(match,esc,animeTitle)):'<p>No songs were scored.</p>';
  return summary+'<div class="broadcast-results"><div class="sa-scoreboard"></div><section class="broadcast-history"><h2>Round History</h2>'+history+'</section></div>';
}
