import { TrueSkill, calcDrawMargin } from 'ts-trueskill';

// Ranked 4v4. Each of the seven comparisons uses the match's starting
// ratings. Sparse evidence gets less weight than eight differing answers.
export function balancedNgmcRatings(players,history){
  if(players.length!==8||new Set(players.map(p=>p.id)).size!==8||players.some(p=>!Number.isFinite(p.elo)))
    throw Error('Balanced requires eight distinct players with starting ratings.');
  const hits=history.map(({results})=>{
    const answers=new Map(results.map(r=>[r.id,r.earned??Number(!!r.correct?.anime)]));
    const row=players.map(p=>answers.get(p.id));
    if(results.length!==8||row.some(n=>n!==0&&n!==1))throw Error('Incomplete ranked song results.');
    return row;
  });
  const deltas=players.map(()=>0);
  for(let i=0;i<players.length;i++){
    for(let j=i+1;j<players.length;j++){
      let wins=0,losses=0;
      for(const song of hits){
        if(song[i]>song[j])wins++;
        if(song[i]<song[j])losses++;
      }
      const expected=1/(1+10**((players[j].elo-players[i].elo)/400));
      const change=(48/7)*(wins-(wins+losses)*expected)/Math.max(8,wins+losses);
      deltas[i]+=change;deltas[j]-=change;
    }
  }
  return players.map(({id,elo},i)=>({id,before:elo,after:elo+deltas[i],delta:deltas[i],
    correct:hits.reduce((sum,row)=>sum+row[i],0),seen:hits.length}));
}
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
