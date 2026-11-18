import {quizDuration} from './quiz-time.js';
const formats = {
  "ngmc-ranked": "NGMC Ranked", "1v1": "Song/Artist 1v1", "3v3": "Song/Artist 3v3",
  quiz: "Quiz"
};

function table(headers, rows,sort,dir) {
  return '<div class="play-table-wrap"><table class="play-rank-table"><thead><tr>' +
    headers.map(label => {
      if(!Array.isArray(label))return '<th scope="col">'+label+'</th>';
      const [key,title,hint]=label,active=key===sort;
      return '<th scope="col"'+(active?' aria-sort="'+(dir==='asc'?'ascending':'descending')+'"':'')+'><button class="play-sort" data-rank-sort="'+key+'"'+(hint?' title="'+hint+'"':'')+'>'+title+' <span aria-hidden="true">'+(active?(dir==='asc'?'↑':'↓'):'↕')+'</span></button></th>';
    }).join('') +
    '</tr></thead><tbody>' + rows.map(cells => '<tr>' +
      cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

export function matchLeaderboard(match, esc) {
  if (!match.history.length) return '<p>No songs scored.</p>';
  if (!match.ratings?.length) return '<p role="status">Calculating match ratings…</p>';
  const rows = match.ratings.map(result => ({
    ...result, name: match.players.find(p => p.id === result.id)?.name || result.id,
    performance: Number((result.delta / Math.max(1,result.seen)).toFixed(2))
  })).sort((a,b) => b.performance-a.performance || b.correct-a.correct || a.name.localeCompare(b.name));
  const best = rows[0];
  const me=match.players.find(p=>p.id===match.me);
  const sides=match.teams.length>1;
  const teamLabel=match.format==='1v1'?'Opponent':'Opponents';
  const isMvp = row => row.performance === best.performance && row.correct === best.correct && row.correct > 0;
  const signed = n => (n>0?'+':'')+n.toFixed(2);
  return '<section class="play-leaderboard"><h2>Match Leaderboard</h2>' +
    table(['Player',...(sides?['Side']:[]),'Points','Performance','Rating'], rows.map(row => [
      esc(row.name)+(isMvp(row)?' <b class="play-mvp">MVP</b>':''),
      ...(sides?[match.players.find(p=>p.id===row.id).team===me.team?(match.format==='1v1'?'You':'Your Team'):teamLabel]:[]),
      row.correct, signed(row.performance), Math.round(row.after)
    ])) + '<small>Performance is the rating change per song.</small></section>';
}

export function rankingsHTML(format,page,data,esc,sort='rank',dir='asc') {
  const quiz = format === 'quiz';
  const select = '<label>Mode<select id="play-ranking-format">' + Object.entries(formats).map(([id,name]) =>
    '<option value="'+id+'" '+(id===format?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';
  const versus=['1v1','3v3','ngmc-ranked'].includes(format);
  function recordCell(row){
    if(!row.record)return '<span title="No recorded match outcomes">—</span>';
    const count=row.record.reduce((sum,n)=>sum+n,0);
    return '<span title="'+count+' of '+row.matches+' matches with a recorded outcome">'+row.record.join('–')+'</span>';
  }
  const columns = [['rank','Rank'],['name','Player'],...(quiz?[]:[['rating','Rating']]),['accuracy',quiz?'Best-score accuracy':'Guess Rate'],
    ['matches',quiz?'Quizzes Played':'Matches'],...(versus?[['record','W-L-T','Wins, then fewer losses, then ties']]:[]),['points','Points'],
    ...(quiz?[['time','Average Time','Average duration of timed personal bests on published quizzes']]:[])];
  const rows = data.rows.map((row,i) => [row.rank??page*50+i+1, esc(row.name), ...(quiz?[]:[Math.round(row.rating)]),
    row.seen?(100*row.correct/row.seen).toFixed(1)+'%':'—',row.matches,...(versus?[recordCell(row)]:[]),row.correct,
    ...(quiz?[row.avgTimeMs==null?'—':quizDuration(Math.round(row.avgTimeMs))]:[])]);
  return '<section class="play-leaderboard"><h1>Rankings</h1>'+select+(rows.length?table(columns,rows,sort,dir):'<p>No ranked results yet.</p>')+
    (page||data.more?'<div class="play-ranking-pages"><button class="button secondary" data-rank-page="'+(page-1)+'" '+(!page?'disabled':'')+'>Previous</button>'+
    '<button class="button secondary" data-rank-page="'+(page+1)+'" '+(!data.more?'disabled':'')+'>Next</button></div>':'')+'</section>';
}
