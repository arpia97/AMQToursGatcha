import { balanceNgmc,ngmcGuesses,gradeNgmc,eligibleNgmc,finishNgmcCount } from './ngmc-rules.js';
import { answerKey, artistMatches } from './play-artists.js';
export const PLAY_FORMATS=Object.freeze({'ngmc-ranked':{size:8,teams:2},'1v1':{size:2,teams:2},'3v3':{size:6,teams:2},'1-team':{size:3,teams:1}});
export const FIELDS=['anime','song','artist'];
export const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function makeMatch(id,format,players,songs,now=Date.now()) {
  const rules=PLAY_FORMATS[format];
  if(!rules||players.length!==rules.size||new Set(players.map(p=>p.id)).size!==rules.size||songs.length!==(format==='ngmc-ranked'?35:20))fail('Invalid match setup.');
  const ngmc=format==='ngmc-ranked';
  let roster=[...players];
  for(let i=roster.length-1;i>0;i--){const x=new Uint32Array(1);crypto.getRandomValues(x);const j=x[0]%(i+1);[roster[i],roster[j]]=[roster[j],roster[i]];}
  if(ngmc)roster=balanceNgmc(roster);
  return {id,format,mode:ngmc?'ngmc-ranked':'song-artist',...(ngmc?{counters:[null,null],counterDeadline:now+120000}:{}),songs,index:0,phase:'loading',until:now+180000,created:now,teams:Array(rules.teams).fill(ngmc?5:0),history:[],players:roster.map((p,i)=>({id:p.id,name:p.name,avatar:p.avatar||null,team:ngmc?p.team:i%rules.teams,...(ngmc?{elo:p.elo,guessRate:p.guessRate,initialGuesses:p.guessRate===null?3:ngmcGuesses(p.guessRate),guesses:p.guessRate===null?3:ngmcGuesses(p.guessRate)}:{}),score:0,loaded:[],ready:false,left:false,answers:{},locked:false}))};
}
export function gradeRound(state,now) {
  if(state.phase!=='guess')return;
  if(state.mode==='ngmc-ranked'){gradeNgmc(state,now);return;}
  const song=state.songs[state.index],teamHits=state.teams.map(()=>new Set());
  const results=state.players.map(player=>{
    const correct=Object.fromEntries(FIELDS.map(field=>[field,!player.left&&(field==='artist'?song.answers.artist.some(expected=>artistMatches(expected,player.answers.artist,song.artistRules)):song.answers[field].includes(answerKey(player.answers[field]))) ]));
    const earned=Object.values(correct).filter(Boolean).length;
    player.score+=earned;
    for(const field of FIELDS)if(correct[field])teamHits[player.team].add(field);
    return {id:player.id,answers:{...player.answers},correct,earned};
  });
  for(let i=0;i<teamHits.length;i++)state.teams[i]+=teamHits[i].size;
  state.history.push({index:state.index,anime:song.anime,song:song.title,artist:song.artist,results,points:teamHits.map(h=>h.size)});
  state.phase='reveal';state.until=now+5000;
}
export function advanceMatch(state,now=Date.now()) {
  if(['finished','cancelled'].includes(state.phase))return;
  const ngmc=state.mode==='ngmc-ranked';
  const active=state.players.filter(p=>!p.left);
  if(ngmc&&state.history.length&&state.teams.some((_,team)=>!active.some(p=>p.team===team))){if(state.phase==='counting')finishNgmcCount(state,Infinity);for(let team=0;team<2;team++)if(!active.some(p=>p.team===team))state.teams[team]=0;state.phase='finished';state.reason='A team left the match.';state.until=now+86400000;return;}
  if(!active.length){state.phase='cancelled';state.reason='All players left the match.';state.until=now+86400000;return;}
  if(state.phase==='loading'||state.phase==='buffering') {
    if((!ngmc||state.counters.every(Boolean)||now>=state.counterDeadline)&&active.every(p=>p.ready&&p.loaded.includes(state.index)&&(state.index>0||Array.from({length:ngmc?12:10},(_,i)=>i).every(i=>p.loaded.includes(i))))) {
      state.phase='guess';state.startsAt=now+3000;state.until=state.startsAt+(ngmc?20000:30000);
    } else if(now>=state.until){state.phase='cancelled';state.reason='Not all players could load the audio in time.';state.until=now+86400000;}
  } else if(state.phase==='guess'&&(now>=state.until||(now>=state.startsAt&&active.every(p=>p.locked))))gradeRound(state,now);
  else if(state.phase==='counting')finishNgmcCount(state,now);
  else if(state.phase==='reveal'&&now>=state.until) {
    if(state.index===state.songs.length-1||ngmc&&state.teams.includes(0)){state.phase='finished';state.until=now+86400000;return;}
    state.index++;state.phase='buffering';state.until=now+90000;
    for(const p of state.players){p.answers={};p.locked=false;}
    advanceMatch(state,now);
  }
}
export function matchMove(state,id,message,now=Date.now()) {
  const player=state.players.find(p=>p.id===id);if(!player)fail('You are not in this match.',403);
  advanceMatch(state,now);
  if(message.type==='leave'){player.left=true;advanceMatch(state,now);return;}
  if(player.left)fail('You left this match.',409);
  if(message.type==='volunteer'&&state.mode==='ngmc-ranked'){
    if(state.phase!=='loading'||now>=state.counterDeadline)fail('The counter signup period has ended.',409);
    if(state.counters[player.team]&&state.counters[player.team]!==id)fail('Your team already has a counter.',409);
    state.counters[player.team]=id;
  } else if(message.type==='count'&&state.mode==='ngmc-ranked'){
    if(state.phase!=='counting'||message.index!==state.index||state.counters[player.team]!==id)fail('Only your team counter can choose during counting.',403);
    if(state.counts[player.team]!==null)return;
    if(!eligibleNgmc(state,player.team).some(p=>p.id===message.player))fail('Choose a correct teammate with guesses remaining.');
    state.counts[player.team]=message.player;finishNgmcCount(state,now);
  } else if(message.type==='loaded') {
    if(!Array.isArray(message.indices)||message.indices.length>state.songs.length||message.indices.some(i=>!Number.isInteger(i)||i<0||i>=state.songs.length))fail('Invalid download progress.');
    player.loaded=[...new Set([...player.loaded,...message.indices])];
  } else if(message.type==='ready')player.ready=true;
  else if(message.type==='answer') {
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting answers.',409);
    // Locked answers are immutable and duplicate retries cannot score twice.
    if(player.locked)return;
    const fields=state.mode==='ngmc-ranked'?['anime']:FIELDS;
    for(const field of fields){if(typeof message.answers?.[field]!=='string'||message.answers[field].length>300)fail('Keep each answer within 300 characters.');}
    player.answers=Object.fromEntries(fields.map(field=>[field,message.answers[field].trim()]));
    if(message.lock===true)player.locked=true;
  } else fail('Unknown match action.');
  advanceMatch(state,now);
}
export function matchView(state,id,now=Date.now()) {
  const me=state.players.find(p=>p.id===id);if(!me)fail('You are not in this match.',403);
  return {id:state.id,mode:state.mode||'song-artist',total:state.songs.length,preload:state.mode==='ngmc-ranked'?12:10,counters:state.counters,counterDeadline:state.counterDeadline,counts:state.counts,ratings:state.ratings,format:state.format,phase:state.phase,index:state.index,now,startsAt:state.startsAt||null,until:state.until,reason:state.reason,
    teams:state.teams,me:id,history:state.history,
    players:state.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||null,audioReady:p.ready&&p.loaded.includes(state.index)&&(state.index>0||Array.from({length:state.mode==='ngmc-ranked'?12:10},(_,i)=>i).every(i=>p.loaded.includes(i))),team:p.team,score:p.score,elo:p.elo,guessRate:p.guessRate,guesses:p.guesses,initialGuesses:p.initialGuesses,loaded:p.loaded.length,ready:p.ready,left:p.left,locked:p.locked,...((state.mode==='ngmc-ranked'?p.id===me.id:p.team===me.team)?{answers:p.answers}:{})}))};
}
