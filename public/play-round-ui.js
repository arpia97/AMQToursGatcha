import {DUEL_FORMAT, soloVersus} from './play-mode-rules.js';
import {avatarCropStyle} from './avatar-crop.js';
const fields={anime:'Anime Name',song:'Song Name',artist:'Artist'};
const revealed=(match,row)=>row?.index===match.index&&['reveal','counting','finished'].includes(match.phase);
export const scoreBadge=(points,total=3)=>'<b class="sa-round-score" title="This Song" data-score="'+points+'">'+points+'/'+total+'</b>';
export const roundDialHTML='<div class="ngmc-dial" hidden><b class="sa-timer" role="timer"></b><small></small></div>';
export function updateRoundDial(dial,match,now){
  const guessing=match.phase==='guess',counting=match.phase==='counting';
  dial.hidden=!guessing&&!counting&&match.phase!=='reveal';
  if(dial.hidden)return;
  const duration=guessing?match.until-match.startsAt:counting?8000:5000;
  const remaining=Math.max(0,Math.min(duration,match.until-now));
  const seconds=guessing&&match.lobby?.seconds===0?'∞':String(Math.ceil(remaining/1000)).padStart(2,'0');
  const timer=dial.firstElementChild,label=dial.lastElementChild;
  if(timer.textContent!==seconds)timer.textContent=seconds;
  const unit=guessing?'Seconds':counting?'Counting':match.index+1===match.total?'Results':'Next song';
  if(label.textContent!==unit)label.textContent=unit;
  dial.style.setProperty('--remaining',100*remaining/Math.max(duration,1)+'%');
}
export function artistCreditsHTML(row,esc){
  const names=row.artistMembers?.length?row.artistMembers:[row.artist];
  return '<span class="sa-artist-info"><button type="button" data-sa-artist-info aria-expanded="false" aria-label="Artist credits for '+esc(row.artist)+'">'+esc(row.artist)+'</button><span class="sa-artist-tooltip" role="tooltip"><small>Artist Credits</small>'+names.map(name=>'<span>'+esc(name)+'</span>').join('')+'</span></span>';
}
export function recapHTML(match,esc,animeTitle){
  const row=match.history.at(-1);
  if(!revealed(match,row))return '';
  const me=match.players.find(p=>p.id===match.me),mine=row.results.find(p=>p.id===match.me);
  const points=match.arena?row.points[me.team]:mine?.earned||0;
  return '<section class="sa-answer-key" aria-label="Correct answers"><header><strong>Correct Answers</strong><small>'+
    (match.teamFields?'Team '+row.points[me.team]+'/3 · ':'')+'+'+points+(points===1?' Point':' Points')+(match.arena?' for Your Pair':'')+'</small></header><dl>'+
    '<div><dt>Anime</dt><dd>'+esc(animeTitle({anime:row.anime}))+'</dd></div><div><dt>Song</dt><dd>'+esc(row.song)+'</dd></div>'+
    '<div><dt>Artist</dt><dd>'+artistCreditsHTML(row,esc)+'</dd></div></dl></section>';
}
export function songTeamsHTML(match,esc){
  const me=match.players.find(p=>p.id===match.me),solo=soloVersus(match.format),last=match.history.at(-1);
  return '<div class="sa-team-list">'+(match.teams.length===1?[me.team]:[me.team,1-me.team]).map(team=>{
    const roster=match.players.filter(p=>p.team===team);
    const title=solo?esc(roster[0].name)+(team===me.team?' <small>You</small>':' <small>Opponent</small>'):team===me.team?'Your Team':'Opponents';
    return '<section class="sa-team sa-song-team '+(team===me.team?'allies':'rivals')+(solo?' sa-solo':'')+'"><header><span>'+title+(match.teamFields&&revealed(match,last)?' '+scoreBadge(last.points[team]):'')+'</span><strong>'+match.teams[team]+'</strong></header>'+roster.map(p=>{
      const result=revealed(match,last)?last.results.find(r=>r.id===p.id):null;
      const status=p.left?'Left':['finished','cancelled'].includes(match.phase)?'Match Complete':['loading','buffering'].includes(match.phase)?p.audioReady?'Ready':p.ready?'Loading Audio…':'Not Ready':p.locked?'Submitted'+(Number.isFinite(p.lockedElapsedMs)?' ('+(p.lockedElapsedMs/1000).toFixed(3)+'s)':''):p.submittedFields?.length?'Submitted · '+p.submittedFields.map(f=>fields[f]).join(', '):'Answering…';
      return '<div class="sa-song-player '+(p.id===me.id?'self':'')+'"><span class="ngmc-avatar avatar-crop" style="'+avatarCropStyle(p.avatar?.crop)+'">'+(p.avatar?.image?'<img src="'+esc(p.avatar.image)+'" alt="" loading="lazy" decoding="async">':esc(p.name.slice(0,2).toUpperCase()))+'</span><div class="sa-song-player-info">'+(solo?'':'<strong>'+esc(p.name)+(p.id===me.id?' <small>You</small>':'')+'</strong>')+'<small>'+esc(status)+'</small></div><strong class="sa-player-points">'+(result&&!match.teamFields?scoreBadge(result.earned,match.format===DUEL_FORMAT?1:3):'')+'<small>'+p.score+' Points'+'</small></strong></div>';
    }).join('')+'</section>';
  }).join('')+'</div>';
}
export function answerMark(correct){
  return '<span class="sa-guess-mark" role="img" aria-label="'+(correct?'Correct':'Incorrect')+'">'+(correct?'✓':'✕')+'</span>';
}
export function answerSideHTML(match,row,team,esc,animeTitle){
  const roster=match.players.filter(p=>p.team===team),solo=soloVersus(match.format);
  const answerFields=match.format===DUEL_FORMAT?[[ 'anime',fields.anime ]]:Object.entries(fields);
  return '<div class="sa-answer-summary">'+answerFields.map(([field,label])=>{
    const result=row?.results.find(r=>roster.some(p=>p.id===r.id)&&(solo||Object.hasOwn(r.answers,field)));
    const owner=row?roster.find(p=>p.id===result?.id):roster.find(p=>p.submittedFields?.includes(field));
    const answer=result?.answers[field],correct=!!result?.correct[field];
    const state=row?(correct?'correct':'incorrect'):owner?'pending':'';
    const display=row?(answer?(field==='anime'?animeTitle({anime:answer}):answer):'No answer'):owner?'Submitted':'Awaiting submission';
    return '<article class="sa-team-answer-tile" data-answer-state="'+state+'"><header><h3>'+label+'</h3><small>'+esc(solo?'':owner?.name||'')+'</small></header><div class="sa-team-answer-value">'+esc(display)+'</div>'+
      (row?answerMark(correct):'')+'</article>';
  }).join('')+'</div>';
}
export function versusHTML(match,row,esc,animeTitle){
  const me=match.players.find(p=>p.id===match.me),solo=soloVersus(match.format);
  const ffa=match.format==='lobby-ffa';
  const teams=ffa?[me.team,...match.players.filter(p=>p.team!==me.team).map(p=>p.team)]:match.teams.length===1?[me.team]:[me.team,1-me.team];
  return '<div class="sa-answer-sides">'+teams.map(team=>'<section><h3 class="sa-side-heading">'+(solo||ffa?team===me.team?'You':esc(match.players.find(p=>p.team===team).name):team===me.team?'Your Team':'Opponents')+(row?scoreBadge(row.points?.[team]??0,match.format===DUEL_FORMAT?1:3):'')+'</h3>'+answerSideHTML(match,row,team,esc,animeTitle)+'</section>').join('')+'</div>';
}
export function songResultsHTML(match,esc,animeTitle){
  const me=match.players.find(p=>p.id===match.me),solo=soloVersus(match.format)||match.format==='lobby-ffa';
  const versus=match.teams.length===2&&match.format!=='lobby-ffa';
  return '<div class="sa-match-results'+(versus?'':' single-score')+'"><div class="sa-result-columns"><span>Anime</span><span>'+(solo?'You':'Your Team')+'</span>'+(versus?'<span>'+(solo?'Opponent':'Opponents')+'</span>':'')+'</div>'+match.history.map(row=>'<details><summary><span><small>'+String(row.index+1).padStart(2,'0')+'</small> '+esc(animeTitle({anime:row.anime}))+'</span>'+scoreBadge(row.points?.[me.team]??0,match.format===DUEL_FORMAT?1:3)+(versus?scoreBadge(row.points?.[1-me.team]??0,match.format===DUEL_FORMAT?1:3):'')+'</summary><p class="sa-result-key">'+esc(row.song)+' · '+esc(row.artist)+'</p>'+versusHTML(match,row,esc,animeTitle)+'</details>').join('')+'</div>';
}
export function readyHTML(match,canReady,ready,esc,autoReadyControl=''){
  const active=match.players.filter(p=>!p.left),count=active.filter(p=>p.acceptedReady||p.ready).length;
  return '<section class="sa-ready-panel"><span class="sa-eyebrow">'+count+' / '+active.length+' Players Ready</span><h2>'+(ready?(count===active.length?(active.every(p=>p.audioReady)&&match.counters?.some(id=>!id)&&match.now<match.counterDeadline?'Choosing Counters':'Preparing Audio'):'Waiting for Everyone'):'Ready to Play?')+'</h2><button type="button" class="button mint sa-ready-button" data-sa-action="ready" '+(!canReady||ready?'disabled':'')+'>'+(ready?'✓ Ready':canReady?'Ready · Enable Audio':'Preparing Audio…')+'</button><p>'+esc(active.filter(p=>!p.acceptedReady&&!p.ready).map(p=>p.name).join(' · ')||'Everyone Is Ready')+'</p>'+autoReadyControl+'</section>';
}
