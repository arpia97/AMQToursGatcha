import { answerKey, artistMatches } from './play-artists.js';
export const PLAY_FORMATS=Object.freeze({'1v1':{size:2,teams:2},'3v3':{size:6,teams:2},'1-team':{size:3,teams:1}});
export const FIELDS=['anime','song','artist'];
export const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function makeMatch(id,format,players,songs,now=Date.now()) {
  const rules=PLAY_FORMATS[format];
  if(!rules||players.length!==rules.size||new Set(players.map(p=>p.id)).size!==rules.size||songs.length!==20)fail('Invalid match setup.');
  const roster=[...players];
  for(let i=roster.length-1;i>0;i--){const x=new Uint32Array(1);crypto.getRandomValues(x);const j=x[0]%(i+1);[roster[i],roster[j]]=[roster[j],roster[i]];}
  return {id,format,songs,index:0,phase:'loading',until:now+180000,created:now,teams:Array(rules.teams).fill(0),history:[],players:roster.map((p,i)=>({id:p.id,name:p.name,team:i%rules.teams,score:0,loaded:[],ready:false,left:false,answers:{},locked:false}))};
}
export function gradeRound(state,now) {
  if(state.phase!=='guess')return;
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
  const active=state.players.filter(p=>!p.left);
  if(!active.length){state.phase='cancelled';state.reason='All players left the match.';state.until=now+86400000;return;}
  if(state.phase==='loading'||state.phase==='buffering') {
    if(active.every(p=>p.ready&&p.loaded.includes(state.index)&&(state.index>0||Array.from({length:10},(_,i)=>i).every(i=>p.loaded.includes(i))))) {
      state.phase='guess';state.startsAt=now+3000;state.until=state.startsAt+20000;
    } else if(now>=state.until){state.phase='cancelled';state.reason='Not all players could load the audio in time.';state.until=now+86400000;}
  } else if(state.phase==='guess'&&(now>=state.until||(now>=state.startsAt&&active.every(p=>p.locked))))gradeRound(state,now);
  else if(state.phase==='reveal'&&now>=state.until) {
    if(state.index===19){state.phase='finished';state.until=now+86400000;return;}
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
  if(message.type==='loaded') {
    if(!Array.isArray(message.indices)||message.indices.length>20||message.indices.some(i=>!Number.isInteger(i)||i<0||i>=20))fail('Invalid download progress.');
    player.loaded=[...new Set([...player.loaded,...message.indices])];
  } else if(message.type==='ready')player.ready=true;
  else if(message.type==='answer') {
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting answers.',409);
    // Locked answers are immutable and duplicate retries cannot score twice.
    if(player.locked)return;
    for(const field of FIELDS){if(typeof message.answers?.[field]!=='string'||message.answers[field].length>300)fail('Keep each answer within 300 characters.');}
    player.answers=Object.fromEntries(FIELDS.map(field=>[field,message.answers[field].trim()]));
    if(message.lock===true)player.locked=true;
  } else fail('Unknown match action.');
  advanceMatch(state,now);
}
export function matchView(state,id,now=Date.now()) {
  const me=state.players.find(p=>p.id===id);if(!me)fail('You are not in this match.',403);
  return {id:state.id,format:state.format,phase:state.phase,index:state.index,now,startsAt:state.startsAt||null,until:state.until,reason:state.reason,
    teams:state.teams,me:id,history:state.history,
    players:state.players.map(p=>({id:p.id,name:p.name,team:p.team,score:p.score,loaded:p.loaded.length,ready:p.ready,left:p.left,locked:p.locked,...(p.team===me.team?{answers:p.answers}:{})}))};
}
