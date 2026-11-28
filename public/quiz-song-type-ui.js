const typeNames={OP:'Openings',ED:'Endings',IN:'Inserts'};
const difficultyNames={all:'All songs',easy:'Easy',hard:'Hard'};
const difficultyHints={all:'All playable songs of this type',easy:'Easiest half of rated songs',hard:'Hardest half of rated songs'};

function typeArt(){
  return `<div class="st-art" aria-hidden="true"><i></i><i></i><i></i></div>`;
}

export function songTypeDirectory(quizzes){
  const cards=Object.entries(typeNames).map(([type,name])=>{
    const rows=quizzes.filter(q=>q.type===type).map(q=>{
      const best=q.played?`${q.best} / ${q.songs}`:'Unplayed';
      return `<button type="button" data-quiz-open="${q.id}" ${q.songs?'':'disabled'} title="${difficultyHints[q.difficulty]}">
        <strong>${difficultyNames[q.difficulty]}</strong><small>${q.songs?best:'Unavailable'}</small><b aria-hidden="true">›</b></button>`;
    }).join('');
    return `<section class="st-card st-${type}"><header class="st-cover">${typeArt()}
      <button type="button" class="st-board-open" data-st-board="${type}" aria-label="${name} leaderboard" aria-haspopup="dialog" title="Leaderboard">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M6 3h8v4a4 4 0 0 1-8 0zM6 4H3v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3m-4 2v4m-3 1h6"/></svg><span>Leaderboard</span></button>
      <span aria-hidden="true" class="st-code">${type}</span><h3>${name}</h3></header><div class="st-choices">${rows}</div></section>`;
  }).join('');
  return `<section class="st-directory"><header><h2>Song Type Quizzes</h2><p>Up to 100 songs per run<span> · </span>20 seconds per song</p></header>
    ${quizzes.length?`<div class="song-type-directory">${cards}</div>`:'<p role="status">Loading song types…</p>'}
    <p class="st-reward"><b aria-hidden="true">✦</b> 50 credits per new personal-best point, up to 5,000 per quiz.</p></section>`;
}

export function songTypeDifficulty(q){
  const label=difficultyNames[q.difficulty];
  return `<strong class="st-difficulty st-difficulty-${q.difficulty}" title="${difficultyHints[q.difficulty]}">${label}</strong>`;
}

export function songTypeSleeve(q,status){
  return `<header class="quiz-sleeve st-cover st-sleeve st-${q.type}">${typeArt()}
    <span>Song Type Quiz${status}</span><div class="st-sleeve-title"><h2>${typeNames[q.type]}</h2>${songTypeDifficulty(q)}</div></header>`;
}

export function songTypeProgress(cells,results=[]){
  const rows=[];
  for(let i=0;i<cells.length;i+=20){
    const last=Math.min(i+20,cells.length);
    rows.push(`<div class="st-progress-row">
      <ol start="${i+1}" class="quiz-song-progress-track" aria-label="Songs ${i+1} to ${last}">${cells.slice(i,last).join('')}</ol></div>`);
  }
  const hits=results.filter(x=>x===true).length,misses=results.filter(x=>x===false).length;
  return `<section class="quiz-song-progress song-type-progress" aria-label="Song progress"><header><strong>Song progress</strong><small><i></i>${hits} correct <i></i>${misses} missed</small></header>${rows.join('')}</section>`;
}

export function openSongTypeBoard(type,quizzes,{fetchRanks,renderRanks,signedIn,onClose}){
  const variants=quizzes.filter(q=>q.type===type);
  const dialog=document.createElement('dialog');
  dialog.className='st-board-dialog st-'+type;
  dialog.setAttribute('aria-labelledby','st-board-title');
  dialog.innerHTML=`<header><h2 id="st-board-title">${typeNames[type]} leaderboard</h2>
    <button type="button" data-close aria-label="Close leaderboard">×</button></header>
    <div class="st-board-tools"><div class="tabs" role="tablist" aria-label="Quiz difficulty">
    ${variants.map(q=>`<button class="tab" role="tab" type="button" id="st-tab-${q.difficulty}" aria-controls="st-ranks" data-variant="${q.id}">${difficultyNames[q.difficulty]}</button>`).join('')}</div>
    <label class="check-label"><input type="checkbox" ${signedIn?'':'disabled'}> Friends Only</label></div>
    <section id="st-ranks" role="tabpanel"></section>`;
  document.body.append(dialog);
  const panel=dialog.querySelector('[role=tabpanel]'),tabs=[...dialog.querySelectorAll('[role=tab]')];
  const filter=dialog.querySelector('input');
  const boards=new Map();
  let index=0,version=0;
  async function show(next){
    index=next;
    const request=++version,quiz=variants[index];
    tabs.forEach((tab,i)=>{
      tab.setAttribute('aria-selected',String(i===index));
      tab.classList.toggle('active',i===index);
      tab.tabIndex=i===index?0:-1;
    });
    panel.setAttribute('aria-labelledby',tabs[index].id);
    panel.innerHTML='<p role="status">Loading scores…</p>';
    try{
      const key=quiz.id+' '+filter.checked;
      let entry=boards.get(key);
      if(!entry||Date.now()-entry.at>15000){
        entry={at:Date.now(),request:fetchRanks(quiz.id,filter.checked)};
        boards.set(key,entry);
        entry.request.catch(()=>{if(boards.get(key)===entry)boards.delete(key);});
      }
      const data=await entry.request;
      if(request===version&&dialog.open)panel.innerHTML=renderRanks(data,quiz.songs);
    }catch{
      if(request===version&&dialog.open)panel.innerHTML='<p role="alert">Scores could not be loaded. <button type="button" data-retry>Retry</button></p>';
    }
  }
  dialog.addEventListener('click',event=>{
    const tab=event.target.closest('[role=tab]');
    if(tab)void show(tabs.indexOf(tab));
    else if(event.target.closest('[data-retry]'))void show(index);
    else if(event.target.closest('[data-close]'))dialog.close();
    else if(event.target===dialog){
      const bounds=dialog.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();
    }
  });
  dialog.addEventListener('keydown',event=>{
    if(!tabs.includes(event.target))return;
    const next={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if(next===undefined)return;
    event.preventDefault();tabs[next].focus();void show(next);
  });
  filter.onchange=()=>void show(index);
  dialog.addEventListener('close',()=>{dialog.remove();onClose(dialog);},{once:true});
  dialog.showModal();tabs[0].focus();void show(0);
  return dialog;
}
