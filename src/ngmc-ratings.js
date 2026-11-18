import { TrueSkill, Rating, rate_1vs1 } from 'ts-trueskill';
// elo.py, INDIVIDUAL_PERFORMANCE=False. 20 internal mu = 1,000 displayed Elo.
// Explicitly pass the environment: Python's free rate_1vs1 otherwise uses defaults.
const scale=50, sigma=.25;
const env=new TrueSkill(20,sigma,.125,.0025,.8);
export function ngmcRatings(players,history) {
  const ratings=new Map(players.map(p=>[p.id,p.elo/scale]));
  for(const song of history) {
    const points=new Map(song.results.map(r=>[r.id,r.earned ?? Number(!!r.correct?.anime)]));
    const deltas=new Map(players.map(p=>[p.id,0]));
    for(const [a,left] of points)for(const [b,right] of points) {
      if(left<=right)continue;
      const beforeA=new Rating(ratings.get(a),sigma),beforeB=new Rating(ratings.get(b),sigma);
      const [afterA,afterB]=rate_1vs1(beforeA,beforeB,false,.0001,env);
      deltas.set(a,deltas.get(a)+afterA.mu-beforeA.mu);
      deltas.set(b,deltas.get(b)+afterB.mu-beforeB.mu);
    }
    for(const [id,delta] of deltas)ratings.set(id,ratings.get(id)+delta);
  }
  return players.map(p=>({id:p.id,before:p.elo,after:ratings.get(p.id)*scale,delta:ratings.get(p.id)*scale-p.elo,
    correct:history.reduce((sum,s)=>{const row=s.results.find(r=>r.id===p.id);return sum+(row?.earned ?? Number(!!row?.correct?.anime));},0),seen:history.length}));
}
