import { TrueSkill, calcDrawMargin } from 'ts-trueskill';
// elo.py, INDIVIDUAL_PERFORMANCE=False. 20 internal mu = 1,000 displayed Elo.
// Explicitly pass the environment: Python's free rate_1vs1 otherwise uses defaults.
const scale=50, sigma=.25;
const env=new TrueSkill(20,sigma,.125,.0025,.8);
const variance=sigma**2+env.tau**2;
const spread=Math.sqrt(2*(variance+env.beta**2));
const margin=calcDrawMargin(env.drawProbability,2,env);
// Each pair starts with fixed uncertainty. Only its posterior mean is carried
// forward, so computing the posterior variance can be skipped entirely.
function winnerGain(winner,loser){
  const x=(winner-loser-margin)/spread;
  let ratio;
  if(x < -8){
    // Laplace's continued fraction for the inverse Mills ratio in the far tail.
    let tail=0;
    for(let k=16;k>=1;k--)tail=k/(-x+tail);
    ratio=-x+tail;
  }else ratio=env.guassian.pdf(x)/env.guassian.cdf(x);
  return variance/spread*ratio;
}
export function ngmcRatings(players,history) {
  const ratings=new Map(players.map(p=>[p.id,p.elo/scale]));
  for(const song of history) {
    const points=new Map(song.results.map(r=>[r.id,r.earned ?? Number(!!r.correct?.anime)]));
    const deltas=new Map(players.map(p=>[p.id,0]));
    for(const [a,left] of points)for(const [b,right] of points) {
      if(left<=right)continue;
      const gain=winnerGain(ratings.get(a),ratings.get(b));
      deltas.set(a,deltas.get(a)+gain);
      deltas.set(b,deltas.get(b)-gain);
    }
    for(const [id,delta] of deltas)ratings.set(id,ratings.get(id)+delta);
  }
  return players.map(p=>({id:p.id,before:p.elo,after:ratings.get(p.id)*scale,delta:ratings.get(p.id)*scale-p.elo,
    correct:history.reduce((sum,s)=>{const row=s.results.find(r=>r.id===p.id);return sum+(row?.earned ?? Number(!!row?.correct?.anime));},0),seen:history.length}));
}
