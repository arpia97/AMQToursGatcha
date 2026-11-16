import {quizDuration} from './quiz-time.js';
export function profileQuizPanel(data,e){
  if(!data)return '<div class="loading">Loading Quiz Records…</div>';
  const metric=(label,value)=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
  return `<section class="profile-quiz"><div class="stat-grid profile-quiz-stats">${
    metric('Quizzes Played',data.played)+metric('Max Scores',data.maxScores)+
    metric('Average Score',data.averageScore===null?'—':data.averageScore+'<small> / 20</small>')+
    metric('#1s',data.firstPlaces)+metric('Average Time',data.averageTimeMs===null?'—':quizDuration(data.averageTimeMs))
  }</div><p class="form-hint">One personal-best score per published quiz. Average time uses ${data.timedQuizzes} timed record${data.timedQuizzes===1?'':'s'}.</p>
    <div class="section-head"><h2>Current #1s</h2><span class="subtext">${data.firstPlaces} Quiz${data.firstPlaces===1?'':'zes'}</span></div>
    ${data.firsts.length?`<div class="table-wrap"><table class="profile-quiz-firsts"><thead><tr><th>Quiz</th><th>Category</th><th>Score</th><th>Time</th></tr></thead><tbody>${data.firsts.map(q=>`<tr><td><button type="button" class="text-button" data-action="quiz-notice-open" data-quiz="${e(q.id)}">${e(q.name)}</button></td><td>${q.category==='composers'?'Composers':'Singers'}</td><td>${q.score} / 20</td><td>${quizDuration(q.durationMs)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="notice">No #1 quiz records yet.</p>'}</section>`;
}
