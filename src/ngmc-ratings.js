import { TrueSkill, Rating, rate_1vs1 } from 'ts-trueskill';
// elo.py, INDIVIDUAL_PERFORMANCE=False. 20 internal mu = 1,000 displayed Elo.
// Explicitly pass the environment: Python's free rate_1vs1 otherwise uses defaults.
const scale=50, sigma=.25;
const env=new TrueSkill(20,sigma,.125,.0025,.8);
export function ngmcRatings(players,history) {
  const ratings=new Map(players.map(p=>[p.id,p.elo/scale]));
  for(const song of history) {
    const hits=song.results.filter(r=>r.correct.anime).map(r=>r.id);
    if(!hits.length||hits.length===players.length)continue;
    const misses=players.filter(p=>!hits.includes(p.id)).map(p=>p.id),deltas=new Map(players.map(p=>[p.id,0]));
    for(const a of hits)for(const b of misses) {
      const beforeA=new Rating(ratings.get(a),sigma),beforeB=new Rating(ratings.get(b),sigma);
      const [afterA,afterB]=rate_1vs1(beforeA,beforeB,false,.0001,env);
      deltas.set(a,deltas.get(a)+afterA.mu-beforeA.mu);
      deltas.set(b,deltas.get(b)+afterB.mu-beforeB.mu);
    }
    for(const [id,delta] of deltas)ratings.set(id,ratings.get(id)+delta);
  }
  return players.map(p=>({id:p.id,before:p.elo,after:ratings.get(p.id)*scale,delta:ratings.get(p.id)*scale-p.elo,
    correct:history.filter(s=>s.results.find(r=>r.id===p.id)?.correct.anime).length,seen:history.length}));
}
