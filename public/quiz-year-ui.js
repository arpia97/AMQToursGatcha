const decadeOf=year=>Math.floor(year/10)*10;
const bestPoints=played=>played.reduce((sum,q)=>sum+q.best,0);
function decadeScore(years,decade){
  const played=years.filter(q=>q.played);
  const count=decade===2020?10:played.length;
  return count?Math.round(100*bestPoints(played)/(30*count)):null;
}
export function yearDirectory(quizzes,decade){
  const available=new Map(quizzes.map(q=>[q.year,q]));
  const groups=new Map();
  const latest=decadeOf(new Date().getUTCFullYear());
  for(let d=latest;d>=1920;d-=10){
    const years=[];
    for(let y=d+9;y>=Math.max(1924,d);y--)years.push(available.get(y)??{year:y,inactive:true});
    groups.set(d,years);
  }
  const active=groups.has(decade)?decade:Math.max(...groups.keys());
  const years=groups.get(active),played=years.filter(q=>q.played);
  const percent=decadeScore(years,active);
  const label=value=>value===null?'—':value+'%';
  const buttons=[...groups].sort(([a],[b])=>b-a).map(([d,list])=>{
    const percent=decadeScore(list,d);
    return `<button type="button" class="year-decade" aria-pressed="${d===active}" data-year-decade="${d}" title="${percent===null?'No completed years':percent+(d===2020?'% decade completion':'% average personal best')}">
      <strong>${d}s</strong><span>${label(percent)}</span></button>`;
  }).join('');
  const rows=years.map(q=>{
    if(q.inactive)return `<button type="button" class="year-card" disabled aria-label="${q.year}, inactive">
      <strong>${q.year}</strong><span></span><span class="year-best">Inactive</span></button>`;
    return `<button type="button" class="year-card" data-quiz-open="${q.id}" aria-label="${q.year}, ${q.played?'personal best '+q.best+' out of 30':'unplayed'}">
      <strong>${q.year}</strong><progress class="year-track" aria-hidden="true" max="30" value="${q.best||0}"></progress>
      <span class="year-best">${q.played?`<b>${q.best}</b> / 30`:'Unplayed'}</span><span class="year-arrow" aria-hidden="true">›</span></button>`;
  }).join('');
  return `<section class="year-directory"><header><h2>Year Quizzes</h2><p>10 openings · 10 endings · 10 inserts</p></header>
    <div class="year-decades" role="group" aria-label="Choose a decade">${buttons}</div>
    <div class="year-breakdown"><section class="year-summary"><h3>${active}s</h3>
      <div class="year-stat"><b>${label(percent)}</b><span>${active===2020?'Decade completion':'Average personal best'}</span></div>
      <div class="year-chart" aria-label="Personal best by year">${[...years].sort((a,b)=>a.year-b.year).map(q=>{
        const info=q.inactive?'Inactive':q.played?`${q.best} / 30`:'Unplayed';
        return `<span title="${q.year} · ${info}" class="${q.inactive?'inactive':''}" aria-label="${q.year}, ${info}"><i><s style="height:${100*(q.best||0)/30}%"></s></i><small>${String(q.year).slice(-2)}</small></span>`;
      }).join('')}</div>
      <dl>${active===2020?`<div><dt>Score</dt><dd>${bestPoints(played)} / 300</dd></div>`:''}<div><dt>Years played</dt><dd>${played.length} / ${years.length}</dd></div><div><dt>Perfect scores</dt><dd>${played.filter(q=>q.best===30).length}</dd></div></dl>
    </section><section class="year-grid" aria-label="${active}s quizzes"><div class="year-list-head"><h3>Choose a year</h3><span>Personal best</span></div>${rows}</section></div></section>`;
}
export function yearProgress(types,cells){
  return '<section class="quiz-song-progress year-progress" aria-label="Song progress">'+['OP','ED','IN'].map(type=>
    `<div><b>${type}</b><ol class="quiz-song-progress-track" aria-label="${type} results">${cells.filter((_,i)=>types[i]===type).join('')}</ol></div>`).join('')+'</section>';
}
