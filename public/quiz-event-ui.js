import {quizRarity} from './quiz-rules.js';
import {rarityClass} from './card-display.js';
import {songLoadingBar} from './song-loading.js';

const seconds = 20;
export function createEventQuiz({api, escape:e, sleeve}) {
  let id, event, root, phase, order, position, score, result, audio, timer, deadline, message, generation=0;
  let song='', artist='', picked=[];
  let outcomes=[];
  const button = (action,text,style='secondary') => '<button type="button" class="button '+style+'" data-event="'+action+'">'+text+'</button>';
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
        updateClock(remain);
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
      result=value; outcomes[position]=value; score+=Number(value.songCorrect)+Number(value.artistCorrect); phase='reveal';
    } catch(error) {
      if(version!==generation)return;
      phase='grade-error'; message=error.message;
    }
    draw();
  }
  function start() {
    order=Array.from({length:event.count},(_,i)=>i);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    position=0; score=0; outcomes=[]; round();
  }
  function next() {
    if(++position===order.length){phase='done';draw();} else round();
  }
  const list = (key,values) => '<datalist id="event-'+key+'">'+values.map(s=>'<option value="'+e(s)+'"></option>').join('')+'</datalist>';
  function updateClock(remain) {
    const meter=root?.querySelector('.quiz-countdown-meter');
    if(!meter)return;
    meter.style.setProperty('--quiz-progress',String(remain/seconds));
    meter.setAttribute('aria-valuenow',String(remain));
    meter.classList.toggle('is-urgent',remain<=5);
    meter.querySelector('[role=timer]').textContent=remain+'s';
  }
  function progress() {
    const cells=order.map((_,i)=>{
      const r=outcomes[i];
      const points=r ? Number(r.songCorrect)+Number(r.artistCorrect) : null;
      const current=i===position && points===null && phase!=='done';
      const state=r ? ['incorrect','partial','correct'][points] : current ? 'current' : i<position ? 'skipped' : 'upcoming';
      const label=e('Song '+(i+1)+' · '+(r ? points+'/2 · '+r.title : state));
      return '<li class="quiz-progress-square is-'+state+'" aria-label="'+label+'" title="'+label+'"'+(current?' aria-current="step"':'')+'></li>';
    }).join('');
    return '<section class="quiz-song-progress" aria-label="Song progress"><ol class="quiz-song-progress-track" style="--event-columns:'+Math.min(20,order.length)+'">'+cells+'</ol></section>';
  }
  function revealField(label,correct,answer,submitted) {
    return '<div class="notice quiz-answer-result '+(correct?'event-hit':'event-miss')+'"><strong>'+label+' · '+(correct?'✓ Correct':'× Incorrect')+'</strong>'+
      '<div class="quiz-answer-comparison"><div><span>Your Answer</span><p>'+e(submitted||'No answer')+'</p></div><div><span>Correct Answer</span><p>'+e(answer)+'</p></div></div></div>';
  }
  function draw(){
    if(!root)return;
    if(!event){root.innerHTML='<p class="notice" role="status">'+e(message || 'Opening event…')+'</p>';return;}
    const maxScore=event.count*2;
    const tier='tier-'+rarityClass(quizRarity(Math.floor((score||0)*20/maxScore)));
    const cover=status=>sleeve({category:'event',name:event.name},status);
    if(phase==='lobby'){
      root.innerHTML='<section class="quiz-lobby tier-d">'+cover(' · Song / Artist')+
        '<dl class="quiz-lobby-stats"><div><dt>Songs</dt><dd>'+event.count+'</dd></div><div><dt>Guess Time</dt><dd>'+seconds+'<small>s</small></dd></div>'+
        '<div><dt>Per Song</dt><dd>2 <small>points</small></dd></div></dl><div class="quiz-lobby-actions">'+button('start','Start Quiz →','mint')+'</div></section>';
      return;
    }
    if(phase==='done'){
      const stat=(label,n)=>'<div><dt>'+label+'</dt><dd>'+n+' <small>/ '+event.count+'</small></dd></div>';
      root.innerHTML='<section class="quiz-finish '+tier+'">'+cover(' · Quiz Complete')+'<div class="finish-line"><div><span class="finish-label">Final Score</span>'+
        '<div class="finish-score"><b class="quiz-rarity-ink">'+score+'</b> <small>/ '+maxScore+'</small></div></div><dl>'+
        stat('Song Names',outcomes.filter(r=>r.songCorrect).length)+stat('Artists',outcomes.filter(r=>r.artistCorrect).length)+
        '</dl></div><div class="finish-track">'+progress()+'</div><div class="quiz-lobby-actions">'+button('start','Play Again','mint')+'</div></section>';
      return;
    }
    let body='';
    if(phase==='guess')body='<div class="quiz-countdown-meter" role="progressbar" aria-label="Seconds remaining" aria-valuemin="0" aria-valuemax="'+seconds+'">'+
      '<div class="quiz-countdown-fill" aria-hidden="true"></div><span role="timer"></span></div><form class="event-answer-form">'+
      '<div class="quiz-answer-field"><label for="event-song">Song Name</label><input class="search" id="event-song" name="song" list="event-songs" placeholder="Start typing a song name…" maxlength="600" autocomplete="off" value="'+e(song)+'"></div>'+list('songs',event.titles)+
      '<div class="quiz-answer-field"><label for="event-artist">Artist</label><input class="search" id="event-artist" name="artist" list="event-artists" placeholder="Start typing an artist…" maxlength="600" autocomplete="off" value="'+e(artist)+'"></div>'+list('artists',event.artists)+
      '<div class="event-actions">'+button('add','Add Artist')+picked.map((p,i)=>button('remove-'+i,e(p)+' ×')).join('')+'</div>'+
      '<button class="button mint" type="submit">Submit Answers</button></form>';
    if(phase==='buffering')body='<div class="quiz-audio-loading" role="status">Loading Audio…'+songLoadingBar({label:'Loading Audio'})+'</div>';
    if(phase==='audio-error')body='<p class="notice">Audio could not play.</p>'+button('retry','Retry Audio')+' '+button('skip','Skip Song');
    if(phase==='sending')body='<p role="status">Checking answers…</p>';
    if(phase==='grade-error')body='<p class="form-error">'+e(message)+'</p>'+button('grade','Retry Submission');
    if(phase==='reveal')body=revealField('Song',result.songCorrect,result.title,song)+
      revealField('Artist',result.artistCorrect,result.artist,[...picked,artist].filter(Boolean).join(', '))+
      '<div class="event-next">'+button('next',position===order.length-1?'Finish Quiz':'Next Song →','mint')+'</div>';
    root.innerHTML='<div class="quiz-play-main"><section class="quiz-question"><div class="quiz-question-heading '+tier+'"><h2>Song '+(position+1)+
      ' <small>/ '+event.count+'</small></h2><div class="quiz-score '+tier+'"><span>Score</span><strong>'+score+' <small>/ '+maxScore+
      '</small></strong></div></div>'+body+progress()+'</section></div>';
    if(phase==='guess')updateClock(Math.max(0,Math.ceil((deadline-Date.now())/1000)));
  }
  function mount(holder) {
    if(!holder)return;
    if(!root){
      root=document.createElement('section'); root.className='event-quiz';
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
          draw();
          root.querySelector('[name=artist]')?.focus();
        }
      };
      draw();
    }
    holder.replaceChildren(root);
  }
  return {open,leave,mount, current:()=>id, active:()=>Boolean(event)&&!['lobby','done'].includes(phase)};
}

