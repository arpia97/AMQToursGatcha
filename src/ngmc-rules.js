import { answerKey } from "./play-artists.js";
export function ngmcGuesses(rate) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw Error('A valid guess rate is required.');
  return rate >= 40 ? 5 : rate >= 28 ? 4 : rate >= 19 ? 3 : rate >= 8 ? 2 : 1;
}
// Enumerate all 35 distinct 4v4 partitions; minimize the team Elo-total gap.
export function balanceNgmc(players) {
  if (players.length !== 8 || players.some(p => !Number.isFinite(p.elo))) throw Error('Eight rated players are required.');
  const total = players.reduce((sum,p) => sum + p.elo, 0);
  let best, gap = Infinity;
  for (let a = 1; a < 6; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 8; c++) {
    const indices = [0,a,b,c], difference = Math.abs(total - 2 * indices.reduce((sum,i) => sum + players[i].elo, 0));
    if (difference < gap) { gap = difference; best = new Set(indices); }
  }
  return players.map((player,i) => ({...player,team:best.has(i) ? 0 : 1}));
}

export function eligibleNgmc(state, team) {
  const result=state.history.at(-1);
  return state.players.filter(p=>p.team===team&&!p.left&&p.guesses>0&&result.results.find(r=>r.id===p.id)?.correct.anime)
    .sort((a,b)=>a.elo-b.elo||a.id.localeCompare(b.id));
}
export function gradeNgmc(state,now) {
  const song=state.songs[state.index];
  const results=state.players.map(p=>{
    const hit=!p.left&&song.answers.anime.includes(answerKey(p.answers.anime));
    p.score+=Number(hit);
    return {id:p.id,answers:{...p.answers},correct:{anime:hit},earned:Number(hit)};
  });
  state.history.push({index:state.index,anime:song.anime,song:song.title,artist:song.artist,results});
  state.counts=[null,null];state.phase='counting';state.until=now+8000;
  for(let team=0;team<2;team++) {
    const candidates=eligibleNgmc(state,team),counter=state.players.find(p=>p.id===state.counters[team]);
    if(!counter||counter.left||candidates.length<2)state.counts[team]=candidates[0]?.id||'';
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
  row.lives=[...state.teams];state.phase='reveal';state.until=now+5000;
}
