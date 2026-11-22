import { PLAY_REVEAL_MS } from "../public/play-mode-rules.js";
import { titleMatches } from "./play-artists.js";
export function ngmcGuesses(rate) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw Error('A valid guess rate is required.');
  return rate >= 40 ? 5 : rate >= 28 ? 4 : rate >= 19 ? 3 : rate >= 8 ? 2 : 1;
}
// Keep the first player on one side to skip mirrored partitions.
export function balanceNgmc(players) {
  if (![6,8].includes(players.length) || players.some(p=>!Number.isFinite(p.elo))) throw Error('A full rated roster is required.');
  const total=players.reduce((n,p)=>n+p.elo,0);
  let best, gap=Infinity;
  for(let mask=1;mask<(1<<players.length);mask+=2){
    const team=players.filter((_,i)=>mask&(1<<i));
    if(team.length!==players.length/2)continue;
    const difference=Math.abs(total-2*team.reduce((n,p)=>n+p.elo,0));
    if(difference<gap){gap=difference;best=mask;}
  }
  return players.map((p,i)=>({...p,team:best&(1<<i)?0:1}));
}

export function eligibleNgmc(state, team) {
  const result=state.history.at(-1);
  return state.players.filter(p=>p.team===team&&!p.left&&p.guesses>0&&result.results.find(r=>r.id===p.id)?.correct.anime)
    .sort((a,b)=>a.elo-b.elo||a.id.localeCompare(b.id));
}
export function gradeNgmc(state,now) {
  const song=state.songs[state.index];
  const results=state.players.map(p=>{
    const hit=!p.left&&titleMatches(song.answers.anime,p.answers.anime);
    p.score+=Number(hit);
    return {id:p.id,answers:{...p.answers},correct:{anime:hit},earned:Number(hit),autoSubmitted:!!p.autoSubmitted};
  });
  state.history.push({index:state.index,anime:song.anime,animeTitles:song.animeTitles,song:song.title,songType:song.songType,artist:song.artist,artistMembers:song.artistMembers||[song.artist],results});
  state.counts=[null,null];state.phase='counting';state.until=now+8000;
  const candidates=[eligibleNgmc(state,0),eligibleNgmc(state,1)];
  for(let team=0;team<2;team++) {
    const opponent=1-team;
    const takesFinalLife=state.teams[opponent]===1&&candidates[opponent].length===0;
    const counter=state.players.find(p=>p.id===state.counters[team]);
    if(takesFinalLife||!counter||counter.left||candidates[team].length<2)state.counts[team]=candidates[team][0]?.id||'';
  }
  finishNgmcCount(state,now);
}
export function finishNgmcCount(state,now) {
  if(state.phase!=='counting')return;
  for(let team=0;team<2;team++)if(state.counts[team]===null&&now>=state.until)state.counts[team]=eligibleNgmc(state,team)[0]?.id||'';
  if(state.counts.some(p=>p===null))return;
  const row=state.history.at(-1);row.spent=[...state.counts];row.reset=[];
  state.counts.forEach(id=>{if(id)state.players.find(p=>p.id===id).guesses--;});
  if(!!state.counts[0]!==!!state.counts[1])state.teams[state.counts[0]?1:0]--;
  for(let team=0;team<2;team++)if(state.players.filter(p=>p.team===team).every(p=>p.guesses===0)) {
    for(const p of state.players.filter(p=>p.team===team))p.guesses=p.initialGuesses;
    row.reset.push(team);
  }
  row.lives=[...state.teams];state.phase='reveal';state.until=now+PLAY_REVEAL_MS;
}
