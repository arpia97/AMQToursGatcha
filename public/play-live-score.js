export function liveProgressText(match){
  return 'Song '+match.song+' / '+match.total+(match.rounds>1?' · Round '+match.round+' / '+match.rounds:'');
}

export function liveScoreHTML(match,esc){
  return match.scores.map(group=>'<div class="play-live-score-row">'+group.map(side=>
    '<span><span>'+esc(side.label)+'</span><strong>'+esc(side.value)+'</strong></span>'
  ).join('')+'</div>').join('');
}
