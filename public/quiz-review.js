const titleKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
export const reviewSortKeys=['title','artist','anime'];
export function quizReviewWarnings(songs,existing=[]){
  const groups=new Map(),broken=[],pending=[],audio=new Set();
  const add=(song,index,old=false)=>{if(song.skipped||song.audio&&audio.has(song.audio))return;if(song.audio)audio.add(song.audio);const key=titleKey(song.title);if(key){const group=groups.get(key)||{title:song.title,rows:[]};group.rows.push({index,existing:old});groups.set(key,group);}if(!old){if(!song.link)pending.push(index);else if(!song.link.working)broken.push(index);}};
  songs.forEach((s,i)=>add(s,s.reviewIndex??i));existing.forEach((s,i)=>add(s,s.reviewIndex??i,true));
  return {duplicates:[...groups.values()].filter(g=>g.rows.length>1),broken,pending};
}
export function sortQuizReview(entries,sort={}){
  if(!reviewSortKeys.includes(sort.key))return [...entries].sort((a,b)=>a.index-b.index);
  return [...entries].sort((a,b)=>{const av=String(a[sort.key]||'').replace(/\s+/gu,' ').trim(),bv=String(b[sort.key]||'').replace(/\s+/gu,' ').trim();
    return (!av||!bv?Number(!av)-Number(!bv):collator.compare(av,bv)*(sort.ascending===false?-1:1))||a.index-b.index;});
}
export function reviewSortHeader(key,label,sort={}){
  const active=sort.key===key,direction=active?(sort.ascending===false?'descending':'ascending'):'none';
  return `<th aria-sort="${direction}"><button type="button" class="quiz-song-sort" data-quiz-review-sort="${key}">${label}<span aria-hidden="true">${active?(sort.ascending===false?'↓':'↑'):'↕'}</span></button></th>`;
}
export function quizAutomodHTML(songs,e,{existing=[],links=true,pool=false}={}){
  const issues=quizReviewWarnings(songs,existing),bad=links&&issues.broken.length;
  const rowLabel=r=>(r.existing?'Existing Pool #':'#')+(r.index+1);
  return `<div class="quiz-automod ${bad||issues.duplicates.length?'has-warnings':''}" role="status"><strong>${links?'Quiz Automod':'Song Title Check'}</strong>${
    bad?`<p class="form-error">${bad} broken or unverified link${bad===1?'':'s'}. ${pool?'Remove these songs or import working replacements':'Replace or skip these songs before saving'}: ${issues.broken.map(i=>'#'+(i+1)).join(', ')}.</p>`:
    links?`<p>${issues.pending.length?`${issues.pending.length} audio link${issues.pending.length===1?'':'s'} awaiting verification.`:'All included audio links passed their checks.'}</p>`:''
  }${issues.duplicates.length?`<p class="quiz-duplicate-warning">${issues.duplicates.length} duplicate song title${issues.duplicates.length===1?'':'s'} — review before saving.</p><ul>${issues.duplicates.map(g=>`<li><strong>${e(g.title)}</strong> · ${g.rows.map(rowLabel).join(', ')}</li>`).join('')}</ul><p class="form-hint">Different songs can share a title. This warning does not block saving.</p>`:'<p>No duplicate song titles found.</p>'}</div>`;
}
