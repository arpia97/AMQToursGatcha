import {rigCount} from './play-rig-count.js';
import {DUEL_FORMAT, soloVersus} from './play-mode-rules.js';
import {playPlayerAvatar} from './play-avatar.js';
import {poolToggle} from './play-pool-toggle.js';
import {quizDuration} from './quiz-time.js';
const formats = {
  [DUEL_FORMAT]: "1v1 Ranked", "ngmc-ranked": "NGMC Ranked", "1v1": "Song/Artist 1v1", "3v3": "Song/Artist 3v3",
  quiz: "Quiz"
};

function table(headers, rows,sort,dir,ownIndex=-1) {
  return '<div class="play-table-wrap"'+(sort?' role="region" aria-label="Sortable player rankings" tabindex="0"':'')+'><table class="play-rank-table"><thead><tr>' +
    headers.map(label => {
      if(!Array.isArray(label))return '<th scope="col">'+label+'</th>';
      const [key,title,hint]=label,active=key===sort;
      return '<th scope="col"'+(active?' aria-sort="'+(dir==='asc'?'ascending':'descending')+'"':'')+'><button class="play-sort" data-rank-sort="'+key+'"'+(hint?' title="'+hint+'"':'')+'>'+title+' <span aria-hidden="true">'+(active?(dir==='asc'?'↑':'↓'):'↕')+'</span></button></th>';
    }).join('') +
    '</tr></thead><tbody>' + rows.map((cells,i) => (i===ownIndex?'<tr class="ranking-own-row">':'<tr>') +
      cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

export function matchLeaderboard(match, esc) {
  const duel=match.format===DUEL_FORMAT;
  if (!duel&&!match.history.length) return '<p>No songs scored.</p>';
  if (!match.ratings?.length) return '<p role="status">'+(match.ratingsPending===false?'No rating change for this match.':'Saving match ratings. You can return to matchmaking.')+'</p>';
  const rows = match.ratings.map(result => {
    const player = match.players.find(p => p.id === result.id) ?? {name:result.id};
    const performance = Number((result.delta / Math.max(1,result.seen)).toFixed(2));
    return {...result, player, performance};
  }).sort((a,b) => b.performance-a.performance || b.correct-a.correct || a.player.name.localeCompare(b.player.name));
  const showRigs=match.players.some(p=>p.rigs!=null);
  const best = rows[0];
  const me=match.players.find(p=>p.id===match.me);
  const sides=match.teams.length>1;
  const teamLabel=soloVersus(match.format)?'Opponent':'Opponents';
  const isMvp = row => !duel&&row.performance === best.performance && row.correct === best.correct && row.correct > 0;
  const signed = n => (n>0?'+':'')+n.toFixed(2);
  return '<section class="play-leaderboard"><h2>Match Leaderboard</h2>' +
    table(['Player',...(sides?['Side']:[]),'Points',...(showRigs?['Rigs']:[]),duel?'Rating Change':'Performance','Rating'], rows.map(row => [
      '<span class="play-player-identity">'+playPlayerAvatar(row.player,esc)+esc(row.player.name)+(isMvp(row)?'<b class="play-mvp">MVP</b>':'')+'</span>',
      ...(sides?[row.player.team===me.team?(soloVersus(match.format)?'You':'Your Team'):teamLabel]:[]),
      row.correct, ...(showRigs?[rigCount(row.player)]:[]), signed(duel?row.delta:row.performance), Math.round(row.after)
    ])) + (duel?'':'<small>Performance is the rating change per song.</small>')+'</section>';
}

export function rankingPanel(root,format,pool='random',friendsOnly=false) {
  let panel=root.querySelector('#ranking-results');
  if(!panel){
    const tabs=Object.entries(formats).map(([id,name])=>
      '<button type="button" role="tab" id="ranking-tab-'+id+'" data-rank-format="'+id+'" aria-controls="ranking-results">'+name+'</button>'
    ).join('');
    root.innerHTML='<section class="ranking-board"><header class="ranking-masthead"><h1>Player Rankings</h1><div class="ranking-mode-tabs" role="tablist" aria-label="Ranking mode">'+tabs+'</div><div class="ranking-filters"><label class="ranking-friends-filter"><input id="ranking-friends-only" type="checkbox">Friends Only</label><div class="ranking-song-pool">'+poolToggle(pool,'data-rank-pool')+'</div></div></header><div id="ranking-results" role="tabpanel" tabindex="0"></div></section>';
    panel=root.querySelector('#ranking-results');
  }
  for(const tab of root.querySelectorAll('[data-rank-format]')){
    const selected=tab.dataset.rankFormat===format;
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex=selected?0:-1;
  }
  root.querySelector('#ranking-friends-only').checked=friendsOnly;
  root.querySelector('.ranking-song-pool').hidden=format==='quiz';
  for(const button of root.querySelectorAll('[data-rank-pool]'))
    button.setAttribute('aria-pressed',String(button.dataset.rankPool===pool));
  panel.setAttribute('aria-labelledby','ranking-tab-'+format);
  return panel;
}

export function rankingResultsHTML(format,page,data,esc,sort,dir,profileHref,friendsOnly=false,viewer=null) {
  const quiz = format === 'quiz';
  const versus=[DUEL_FORMAT,'1v1','3v3','ngmc-ranked'].includes(format);
  function recordCell(row){
    if(!row.record)return '<span title="No recorded match outcomes">—</span>';
    const count=row.record.reduce((sum,n)=>sum+n,0);
    return '<span class="ranking-record" title="'+count+' of '+row.matches+' matches with a recorded outcome">'+row.record.map((n,i)=>'<span>'+n+'</span>').join('–')+'</span>';
  }
  const columns = [['rank','Rank'],['name','Player'],...(quiz?[]:[['rating','Rating']]),['accuracy',quiz?'Best-score accuracy':'Guess Rate'],
    ['matches',quiz?'Quizzes Played':'Matches'],...(versus?[['record','W-L-T','Wins, then fewer losses, then ties']]:[]),
    ['points',quiz?'Cumulative Points':'Points',quiz?'Sum of personal bests across published quizzes':null],
    ...(quiz?[['time','Average Time','Average duration of timed personal bests on published quizzes']]:[])];
  const ownIndex=viewer ? data.rows.findIndex(row=>row.id===viewer.id) : -1;
  const own=viewer ? (data.own ?? data.rows[ownIndex]) : null;
  const accuracy=row=>row.seen?(100*row.correct/row.seen).toFixed(1)+'%':'—';
  function pinnedStanding(){
    if(!viewer)return '';
    const stats=own ? [
      ...(quiz?[]:[['Rating',Math.round(own.rating).toLocaleString('en-US')]]),
      [quiz?'Accuracy':'Guess Rate',accuracy(own)],
      [quiz?'Quizzes Played':'Matches',own.matches],
      ...(quiz?[['Points',own.correct],['Average Time',own.avgTimeMs==null?'—':quizDuration(Math.round(own.avgTimeMs))]]:
        [['W-L-T',own.record?.join('–')??'—'],['Points',own.correct]])
    ] : [];
    return '<section class="ranking-own-summary" aria-label="Your standing"><div><small>Your Rank</small><strong>'+
      (own?'#'+own.rank:'Unranked')+'</strong><a href="'+esc(profileHref(viewer.id))+'">'+esc(own?.name??viewer.name)+'</a></div>'+
      (stats.length?'<dl>'+stats.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>':'')+'</section>';
  }
  const rows = data.rows.map((row,i) => {
    const rank = row.rank ?? page*50+i+1;
    const name = esc(row.name);
    const player = row.id != null
      ? '<a class="ranking-player-profile" href="'+esc(profileHref(row.id))+'">'+name+'</a>'
      : name;
    return [
      '<span class="ranking-position" data-place="'+rank+'">'+rank+'</span>',
      '<strong>'+player+'</strong>'+(i===ownIndex?' <small class="ranking-you">You</small>':''), ...(quiz?[]:[Math.round(row.rating).toLocaleString("en-US")]),
      accuracy(row), row.matches,
      ...(versus?[recordCell(row)]:[]), row.correct,
      ...(quiz?[row.avgTimeMs==null?'—':quizDuration(Math.round(row.avgTimeMs))]:[])
    ];
  });
  const navigation = page || data.more
    ? '<div class="play-ranking-pages"><button class="button secondary" data-rank-page="'+(page-1)+'" '+(!page?'disabled':'')+'>Previous</button>'+
      '<button class="button secondary" data-rank-page="'+(page+1)+'" '+(!data.more?'disabled':'')+'>Next</button></div>'
    : '';
  return pinnedStanding()+(rows.length?table(columns,rows,sort,dir,ownIndex):'<p class="ranking-empty">'+(friendsOnly?'No ranked results for you or your friends yet.':'No ranked results yet for '+formats[format]+'.')+'</p>')+
    (rows.length||navigation?'<footer><small>Page '+(page+1)+'</small>'+navigation+'</footer>':'');
}
