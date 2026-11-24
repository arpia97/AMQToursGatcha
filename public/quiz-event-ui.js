import {songProgressTrigger} from './detail-popover.js';
import {createEventAnswers} from './quiz-event-answers.js';
import {autolockControl} from './amq-anime-search.js?v=event-autolock';
import {quizRarity} from './quiz-rules.js';
import {rarityClass} from './card-display.js';
import {songLoadingBar} from './song-loading.js';

const seconds = 20;
export function createEventQuiz({api, escape:e, sleeve, volumeControl, getVolume}) {
  let id, event, root, phase, order, position, score, result, audio, timer, deadline, message, generation=0;
  let submitted;
  const answers=createEventAnswers({root:()=>root,escape:e,submit:()=>void grade(),onState:()=>{if(phase==='lobby')draw();}});
  let outcomes=[];
  const button = (action,text,style='secondary') => '<button type="button" class="button '+style+'" data-event="'+action+'">'+text+'</button>';
  function halt() {
    clearInterval(timer);
    if (audio) { audio.onplaying=audio.onerror=audio.onended=null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio=null; }
  }
  function leave() {
    ++generation; halt(); answers.close(); id=null; event=null; root=null; phase='idle'; message='';
  }
  async function open(key) {
    leave();
    id=key;
    const version=generation;
    phase='loading';
    try {
      const data=await api('quiz-event',{id,action:'info'});
      if(version!==generation)return;
      event=data; phase='lobby'; answers.load(event);
    } catch(error) {
      if(version!==generation)return;
      phase='error'; message=error.message;
    }
    draw();
  }
  function round() {
    halt(); ++generation; answers.reset(); submitted=null; message=''; phase='buffering'; result=null;
    const player=new Audio();
    audio=player; player.volume=getVolume()/100; player.preload='auto';
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
      root?.querySelector('#sa-song')?.focus({preventScroll:true});
      timer=setInterval(()=>{
        const remain=Math.max(0,Math.ceil((deadline-Date.now())/1000));
        updateClock(remain);
        if(remain===0)void grade(true);
      },150);
    };
    // The event source may be unavailable to a player's local DNS resolver.
    const url=new URL('./api/quiz-event-audio',import.meta.url);
    url.search=new URLSearchParams({event:id,v:event.revision,song:order[position]});
    player.src=url.href; draw(); player.play().catch(failed);
  }
  async function grade(timeout=false) {
    if(!['guess','grade-error'].includes(phase))return;
    const version=generation;
    halt(); phase='sending'; draw();
    try {
      const snapshot=submitted??await answers.answers(timeout);
      if(version!==generation)return;
      submitted=snapshot;
      const value=await api('quiz-event',{id,revision:event.revision,index:order[position],action:'answer',
        ...submitted});
      if(version!==generation)return;
      result=value; outcomes[position]={...value,submitted}; score+=Number(value.songCorrect)+Number(value.artistCorrect); phase='reveal';
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
      if(r){
        const answer='Song: '+(r.submitted.song||'No answer')+'\nArtist: '+(r.submitted.artists.join(', ')||'No answer');
        const trigger=songProgressTrigger('event-'+id,i,{
          title:r.title,artist:r.artist,answer,result:points+'/2 points',correct:points===2,partial:points===1
        },e);
        return '<li class="quiz-progress-square is-'+state+'">'+trigger+'</li>';
      }
      const label=e('Song '+(i+1)+' · '+state);
      return '<li class="quiz-progress-square is-'+state+'" aria-label="'+label+'" title="'+label+'"'+(current?' aria-current="step"':'')+'></li>';
    }).join('');
    return '<section class="quiz-song-progress" aria-label="Song progress"><ol class="quiz-song-progress-track">'+cells+'</ol></section>';
  }
  function revealField(label,correct,answer,guess) {
    return '<div><small>'+label+'</small><strong>'+e(answer)+'</strong><span class="'+(correct?'correct':'incorrect')+'">'+
      '<b aria-label="'+(correct?'Correct':'Incorrect')+'">'+(correct?'✓':'×')+'</b> '+e(guess||'No answer')+'</span></div>';
  }
  function draw(){
    if(!root)return;
    if(!event){root.innerHTML='<p class="notice" role="status">'+e(message || 'Opening event…')+'</p>';return;}
    const maxScore=event.count*2;
    const tier='tier-'+rarityClass(quizRarity(Math.floor((score||0)*20/maxScore)));
    const controls='<div class="quiz-audio-footer">'+volumeControl()+'</div>';
    const cover=status=>{
      const holiday=/^(Christmas)\s+(.+)$/i.exec(event.name);
      if(!holiday)return sleeve({category:'event',name:event.name},status);
      return '<header class="quiz-sleeve winter-sleeve"><span class="winter-caption">'+
        (phase==='done'?'Quiz Complete':'Event Quiz')+'</span><h2><em>'+e(holiday[1])+'</em> <span>'+e(holiday[2])+'</span></h2></header>';
    };
    if(phase==='lobby'){
      const start=answers.ready()?button('start','Start Quiz →','mint'):answers.error()
        ? '<span role="alert">'+e(answers.error())+'</span> '+button('reload','Retry Answer Lists')
        : '<span role="status">Loading Play answer lists…</span>';
      root.innerHTML='<section class="quiz-lobby tier-d">'+cover(' · Song / Artist')+
        '<dl class="quiz-lobby-stats"><div><dt>Songs</dt><dd>'+event.count+'</dd></div><div><dt>Guess Time</dt><dd>'+seconds+'<small>s</small></dd></div>'+
        '<div><dt>Per Song</dt><dd>2 <small>points</small></dd></div></dl><div class="quiz-lobby-actions">'+start+'</div>'+controls+'</section>';
      return;
    }
    if(phase==='done'){
      const stat=(label,n)=>'<div><dt>'+label+'</dt><dd>'+n+' <small>/ '+event.count+'</small></dd></div>';
      root.innerHTML='<section class="quiz-finish '+tier+'">'+cover(' · Quiz Complete')+'<div class="finish-line"><div><span class="finish-label">Final Score</span>'+
        '<div class="finish-score"><b class="quiz-rarity-ink">'+score+'</b> <small>/ '+maxScore+'</small></div></div><dl>'+
        stat('Song Names',outcomes.filter(r=>r.songCorrect).length)+stat('Artists',outcomes.filter(r=>r.artistCorrect).length)+
        '</dl></div><div class="finish-track">'+progress()+'</div><div class="quiz-lobby-actions">'+button('start','Play Again','mint')+'</div>'+controls+'</section>';
      return;
    }
    let body='';
    if(phase==='guess')body='<div class="quiz-countdown-meter" role="progressbar" aria-label="Seconds remaining" aria-valuemin="0" aria-valuemax="'+seconds+'">'+
      '<div class="quiz-countdown-fill" aria-hidden="true"></div><span role="timer"></span></div><form class="event-answer-form">'+
      '<div class="sa-answer-fields">'+answers.fieldsHTML()+'</div><button class="button mint" type="submit">Submit Answers</button>'+
      '<div class="answer-search-controls">'+autolockControl()+'<button type="button" class="text-button" data-event="skip-answer">Skip Song</button></div></form>';
    if(phase==='buffering')body='<div class="quiz-audio-loading" role="status">Loading Audio…'+songLoadingBar({label:'Loading Audio'})+'</div>';
    if(phase==='audio-error')body='<p class="notice">Audio could not play.</p>'+button('retry','Retry Audio')+' '+button('skip','Skip Song');
    if(phase==='sending')body='<p role="status">Checking answers…</p>';
    if(phase==='grade-error')body='<p class="form-error">'+e(message)+'</p>'+button('grade','Retry Submission');
    if(phase==='reveal')body='<div class="sa-reveal event-reveal" aria-label="Correct answers and your guesses">'+revealField('Song',result.songCorrect,result.title,submitted.song)+
      revealField('Artist',result.artistCorrect,result.artist,submitted.artists.join(', '))+
      '</div><div class="event-next">'+button('next',position===order.length-1?'Finish Quiz':'Next Song →','mint')+'</div>';
    root.innerHTML='<section class="sa-play-panel sa-song-panel"><header class="event-round-header">'+
      '<h2>Song <b>'+(position+1)+'</b> <small>of '+event.count+'</small></h2>'+
      '<span class="event-round-score">Score <b>'+score+'</b></span></header>'+
      '<div class="song-broadcast-body quiz-question">'+body+progress()+'</div>'+controls+'</section>';
    if(phase==='guess')updateClock(Math.max(0,Math.ceil((deadline-Date.now())/1000)));
  }
  function mount(holder) {
    if(!holder)return;
    if(!root){
      root=document.createElement('section'); root.className='event-quiz song-broadcast';
      answers.bind(root);
      root.onsubmit=ev=>{ev.preventDefault();void grade();};
      root.onclick=ev=>{
        const action=ev.target.closest('[data-event]')?.dataset.event;
        if(!action)return;
        if(action==='start')start();
        if(action==='next'||action==='skip')next();
        if(action==='retry')round();
        if(action==='grade')void grade();
        if(action==='skip-answer'&&phase==='guess'){submitted={song:'',artists:[]};void grade();}
        if(action==='reload'){answers.load(event);draw();}
      };
      draw();
    }
    holder.replaceChildren(root);
  }
  function key(ev){
    if(phase!=='reveal'||ev.key!=='Enter'||ev.repeat||ev.isComposing||ev.defaultPrevented||
       ev.altKey||ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.target?.closest?.('button,a,input,select,textarea,[contenteditable=true]'))return;
    ev.preventDefault();next();
  }
  return {open,leave,mount,key,setVolume(value){if(audio)audio.volume=value/100;}, current:()=>id, active:()=>Boolean(event)&&!['lobby','done'].includes(phase)};
}

