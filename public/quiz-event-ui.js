const seconds = 20;
export function createEventQuiz({api, escape:e}) {
  let id, event, root, phase, order, position, score, result, audio, timer, deadline, message, generation=0;
  let song='', artist='', picked=[];
  const button = (action,text) => '<button type="button" class="button secondary" data-event="'+action+'">'+text+'</button>';
  function halt() {
    clearInterval(timer);
    if (audio) { audio.onplaying=audio.onerror=audio.onended=null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio=null; }
  }
  function leave() {
    ++generation; halt(); id=null; event=null; root=null; phase='idle'; message='';
  }
  async function open(key) {
    leave();
    id=key;
    const version=generation;
    phase='loading';
    try {
      const data=await api('quiz-event',{id,action:'info'});
      if(version!==generation)return;
      event=data; phase='lobby';
    } catch(error) {
      if(version!==generation)return;
      phase='error'; message=error.message;
    }
    draw();
  }
  function round() {
    halt(); ++generation; song=''; artist=''; picked=[]; message=''; phase='buffering'; result=null;
    const player=new Audio();
    audio=player; player.preload='auto';
    const version=generation;
    const failed=()=>{
      if(version!==generation||audio!==player)return;
      halt(); phase='audio-error'; draw();
    };
    player.onerror=failed;
    timer=setTimeout(failed,20000);
    player.onplaying=()=>{
      if(version!==generation || phase!=='buffering')return;
      clearTimeout(timer);
      phase='guess'; deadline=Date.now()+seconds*1000; draw();
      root?.querySelector('[name=song]')?.focus({preventScroll:true});
      timer=setInterval(()=>{
        const remain=Math.max(0,Math.ceil((deadline-Date.now())/1000));
        const clock=root?.querySelector('[data-clock]');
        if(clock)clock.textContent=remain+'s';
        if(remain===0)void grade();
      },150);
    };
    // The event source may be unavailable to a player's local DNS resolver.
    const url=new URL('./api/quiz-event-audio',import.meta.url);
    url.search=new URLSearchParams({event:id,v:event.revision,song:order[position]});
    player.src=url.href; draw(); player.play().catch(failed);
  }
  async function grade() {
    if(!['guess','grade-error'].includes(phase))return;
    const version=generation;
    halt(); phase='sending'; draw();
    try {
      const value=await api('quiz-event',{id,revision:event.revision,index:order[position],action:'answer',
        song:song.trim(),artists:[...picked,...(artist.trim()?[artist.trim()]:[])]});
      if(version!==generation)return;
      result=value; score+=Number(value.songCorrect)+Number(value.artistCorrect); phase='reveal';
    } catch(error) {
      if(version!==generation)return;
      phase='grade-error'; message=error.message;
    }
    draw();
  }
  function start() {
    order=Array.from({length:event.count},(_,i)=>i);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    position=0; score=0; round();
  }
  function next() {
    if(++position===order.length){phase='done';draw();} else round();
  }
  const list = (key,values) => '<datalist id="event-'+key+'">'+values.map(s=>'<option value="'+e(s)+'"></option>').join('')+'</datalist>';
  function draw(){
    if(!root)return;
    let body='';
    if(!event)body='<p role="status">'+e(message || 'Opening event…')+'</p>';
    else if(phase==='lobby')body='<p>'+event.count+' songs · '+seconds+'s per song · 1 point each for song and artist</p>'+button('start','Start Quiz');
    else if(phase==='done')body='<h2>Quiz Complete</h2><p>Final Score <strong>'+score+' / '+(event.count*2)+'</strong></p>'+button('start','Play Again');
    else {
      body='<p class="eyebrow">Song '+(position+1)+' / '+order.length+' · '+score+' points</p>';
      if(phase==='guess')body+='<form class="event-answer-form"><strong data-clock>'+seconds+'s</strong>'+
        '<label>Song Name<input name="song" list="event-songs" maxlength="600" autocomplete="off" value="'+e(song)+'"></label>'+list('songs',event.titles)+
        '<label>Artist<input name="artist" list="event-artists" maxlength="600" autocomplete="off" value="'+e(artist)+'"></label>'+list('artists',event.artists)+
        '<div class="event-actions">'+button('add','Add Artist')+picked.map((p,i)=>button('remove-'+i,e(p)+' ×')).join('')+'</div>'+
        '<button class="button mint" type="submit">Submit Answers</button></form>';
      if(phase==='buffering')body+='<p role="status">Loading Audio…</p>';
      if(phase==='audio-error')body+='<p>Audio could not play.</p>'+button('retry','Retry Audio')+' '+button('skip','Skip Song');
      if(phase==='sending')body+='<p role="status">Checking answers…</p>';
      if(phase==='grade-error')body+='<p>'+e(message)+'</p>'+button('grade','Retry Submission');
      if(phase==='reveal')body+='<p>Song · '+(result.songCorrect?'✓':'×')+' <strong>'+e(result.title)+'</strong></p>'+
        '<p>Artist · '+(result.artistCorrect?'✓':'×')+' <strong>'+e(result.artist)+'</strong></p>'+button('next',position===order.length-1?'Finish Quiz':'Next Song');
    }
    root.innerHTML=(event?'<h2>'+e(event.name)+'</h2>':'')+body;
  }
  function mount(holder) {
    if(!holder)return;
    if(!root){
      root=document.createElement('section'); root.className='panel event-quiz';
      root.oninput=({target})=>{if(target.name==='song')song=target.value; if(target.name==='artist')artist=target.value;};
      root.onsubmit=ev=>{ev.preventDefault();void grade();};
      root.onclick=ev=>{
        const action=ev.target.closest('[data-event]')?.dataset.event;
        if(!action)return;
        if(action==='start')start();
        if(action==='next'||action==='skip')next();
        if(action==='retry')round();
        if(action==='grade')void grade();
        if(action==='add'||action.startsWith('remove-')){
          if(action==='add'&&artist.trim()&&!picked.includes(artist.trim()))picked.push(artist.trim());
          if(action==='add')artist='';else picked.splice(Number(action.slice(7)),1);
          draw(); const clock=root.querySelector('[data-clock]');
          if(clock)clock.textContent=Math.max(0,Math.ceil((deadline-Date.now())/1000))+'s';
          root.querySelector('[name=artist]')?.focus();
        }
      };
      draw();
    }
    holder.replaceChildren(root);
  }
  return {open,leave,mount, current:()=>id, active:()=>Boolean(event)&&!['lobby','done'].includes(phase)};
}

