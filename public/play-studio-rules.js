export const studioMethods=['Random','Weighted','Equal','Force Weighted','Forced Equal','Full Random','Unique rigs only'];
const types=['OP','ED','IN'], categories=['Standard','Instrumental','Chanting','Character'];
export function validateStudio(s){
  if(!s||typeof s!=='object'||typeof s.name!=='string'||!s.name.trim()||s.name.length>55)return 'Enter a lobby name of up to 55 characters.';
  const number=(k,min,max,whole=false)=>Number.isFinite(s[k])&&s[k]>=min&&s[k]<=max&&(!whole||Number.isInteger(s[k]));
  const choices=(v,allowed)=>Array.isArray(v)&&v.length<=allowed.length&&new Set(v).size===v.length&&v.every(x=>allowed.includes(x));
  if(!['Free-for-all','Teams'].includes(s.format)||!number('players',1,8,true)||!number('teamSize',1,8,true))return 'Choose a capacity that fits the teams.';
  if(!number('songs',1,100,true))return 'Choose 1–100 songs.';
  if(!['Random','Watched','Mixed'].includes(s.pool)||!studioMethods.includes(s.watchMethod)||!number('cutoff',2,8,true))return 'Choose a valid song pool.';
  if(!['Ratio','Songs'].includes(s.unit)||!Array.isArray(s.mix)||s.mix.length!==3||s.mix.some(n=>!Number.isFinite(n)||n<0||n>100))return 'Check the mixed allocation.';
  if(s.pool==='Mixed'&&(s.unit==='Songs'&&s.mix.some(n=>!Number.isInteger(n))||Math.abs(s.mix.reduce((a,b)=>a+b,0)-(s.unit==='Songs'?s.songs:100))>1e-6))return 'Mixed allocations must add up to the full pool.';
  if(!['Count','Lives','Speed','Song/Artist'].includes(s.scoring)||!choices(s.guessFields,['anime','song','artist'])||!s.guessFields.length||!number('lives',1,100,true))return 'Check the scoring settings.';
  if(!number('guess',1,120,true)||!number('extra',0,120,true)||!number('sample',0,100)||!['Fixed','Random'].includes(s.speedMode)||!number('speed',0.25,4)||!number('minSpeed',0.25,4)||!number('maxSpeed',s.minSpeed,4))return 'Choose 1–120 seconds, up to 120 extra seconds, and playback between 0.25× and 4×.';
  if(s.guess*(s.speedMode==='Fixed'?s.speed:s.maxSpeed)>120)return 'The audio sample can cover up to 120 seconds at the selected speed.';
  if(s.popFrom!==0||s.popTo!==100)return 'The AMQ export does not supply song popularity.';
  if(['randomSample','dupes','rebroadcast','dubs'].some(k=>typeof s[k]!=='boolean'))return 'Check the song modifiers.';
  if(!choices(s.types,types)||!types.every(t=>choices(s.categories?.[t],categories))||!s.types.some(t=>s.categories[t].length))return 'Select at least one song type and category.';
  if(!choices(s.animeTypes,['TV','Movie','OVA','ONA','Special'])||!s.animeTypes.length)return 'Choose an anime type.';
  for(const [lo,hi,max] of [['difficultyFrom','difficultyTo',100],['popFrom','popTo',100],['scoreFrom','scoreTo',10]])if(!number(lo,0,max)||!number(hi,s[lo],max))return 'Check the filter ranges.';
  if(!number('from',1924*4,9999,true)||!number('to',s.from,new Date().getUTCFullYear()*4+Math.floor(new Date().getUTCMonth()/3),true)||s.top!==''&&!number('top',1,1000000,true))return 'Check vintage and popularity.';
  for(const [key,logic] of [['genres','genreLogic'],['tags','tagLogic']])if(!['AND','OR'].includes(s[logic])||!Array.isArray(s[key])||s[key].length>450||s[key].some(v=>typeof v!=='string'||!v.length||v.length>100))return 'Check genres and tags.';
  if(JSON.stringify(s).length>4200)return 'Choose fewer genre or tag filters to fit the lobby settings.';
  return '';
}
// Assign explicit choices first so an automatic seat can move when someone picks a team.
export function studioTeamAssignments(players, size) {
  const counts=Array(Math.ceil(players.length/size)).fill(0);
  const teams=new Map();
  for(const {id,teamChoice} of players){
    if(Number.isInteger(teamChoice)&&counts[teamChoice]<size){
      teams.set(id,teamChoice);
      counts[teamChoice]++;
    }
  }
  for(const {id} of players){
    if(teams.has(id))continue;
    const team=counts.indexOf(Math.min(...counts));
    teams.set(id,team);
    counts[team]++;
  }
  return teams;
}

export function apportion(total,weights){
  const sum=weights.reduce((a,b)=>a+b,0);
  if(!sum)return weights.map(()=>0);
  const shares=weights.map(v=>total*v/sum),counts=shares.map(Math.floor);
  const order=counts.map((_,i)=>i).sort((a,b)=>(shares[b]-counts[b])-(shares[a]-counts[a]));
  for(const i of order.slice(0,total-counts.reduce((a,b)=>a+b,0)))counts[i]++;
  return counts;
}
export function studioMix(s){return s.pool==='Random'?[0,0,s.songs]:s.pool==='Watched'?[s.songs,0,0]:s.unit==='Songs'?s.mix:apportion(s.songs,s.mix);}

export function studioLobbySettings(s){
  const error=validateStudio(s);
  if(error)throw Object.assign(Error(error),{status:400});
  return {format:'lobby-ffa',studio:s,songs:s.songs,seconds:s.guess+s.extra,pool:s.pool.toLowerCase(),guessFields:s.scoring==='Song/Artist'?s.guessFields:['anime']};
}
