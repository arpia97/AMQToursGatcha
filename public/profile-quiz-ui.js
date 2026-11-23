import {quizDuration} from './quiz-time.js';
import {quizCategoryLabel} from './quiz-rules.js';
import {playQuizHref} from './play-navigation.js?v=play-quiz-links';
export function profileQuizPanel(data,e,sort={key:"quiz",ascending:true}){
  if(!data)return '<div class="loading">Loading Quiz Records…</div>';
  const metric=(label,value)=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
  const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  const category=q=>quizCategoryLabel(q.category);
  const rows=[...data.firsts].sort((a,b)=>{
    let diff;
    if(sort.key==='time') {
      const av=Number.isSafeInteger(a.durationMs)&&a.durationMs>=0,bv=Number.isSafeInteger(b.durationMs)&&b.durationMs>=0;
      if(av!==bv)return av?-1:1;
      diff=av?a.durationMs-b.durationMs:0;
    } else diff=collator.compare(sort.key==='category'?category(a):a.name,sort.key==='category'?category(b):b.name);
    return (sort.ascending?diff:-diff)||collator.compare(a.name,b.name)||a.id.localeCompare(b.id);
  });
  const header=(key,label)=>'<th scope="col" aria-sort="'+(sort.key===key?(sort.ascending?'ascending':'descending'):'none')+'"><button type="button" class="quiz-song-sort" data-action="profile-quiz-sort" data-sort="'+key+'">'+label+'<span aria-hidden="true">'+(sort.key===key?(sort.ascending?'↑':'↓'):'↕')+'</span></button></th>';
  return `<section class="profile-quiz"><div class="stat-grid profile-quiz-stats">${
    metric('Quizzes Played',data.played)+metric('Max Scores',data.maxScores)+
    metric('Average Score',data.averageScore===null?'—':data.averageScore+'<small> / 20</small>')+
    metric('#1s',data.firstPlaces)+metric('Average Time',data.averageTimeMs===null?'—':quizDuration(data.averageTimeMs))
  }</div>
    <div class="section-head"><h2>Current #1s</h2><span class="subtext">${data.firstPlaces} Quiz${data.firstPlaces===1?'':'zes'}</span></div>
    ${data.firsts.length?`<div class="table-wrap"><table class="profile-quiz-firsts"><thead><tr>${header('quiz','Quiz')}${header('category','Category')}<th>Score</th>${header('time','Time')}</tr></thead><tbody>${rows.map(q=>`<tr><td><a class="text-button" href="${e(playQuizHref(q.id))}">${e(q.name)}</a></td><td>${category(q)}</td><td>${q.score} / 20</td><td>${quizDuration(q.durationMs)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="notice">No #1 quiz records yet.</p>'}</section>`;
}
