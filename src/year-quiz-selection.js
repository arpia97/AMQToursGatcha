import {songTypeKey} from './play-watched-selection.js';

const types=['OP','ED','IN'];
const quota=10;
function shuffled(values,random){
  const items=[...values];
  for(let i=items.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
}

// Match the thirty slots to distinct values. An augmenting path can move an
// earlier slot when an insert or a shared recording has fewer alternatives.
function assign(options,key,partial=false){
  const owner=new Map(),picks=[];
  function place(slot,seen){
    for(const item of options[slot]){
      const id=item[key];
      if(seen.has(id))continue;
      seen.add(id);
      if(!owner.has(id)||place(owner.get(id),seen)){
        owner.set(id,slot);picks[slot]=item;return true;
      }
    }
    return false;
  }
  const order=options.map((_,i)=>i).sort((a,b)=>options[a].length-options[b].length);
  for(const slot of order){if(!place(slot,new Set())&&!partial)return null;}
  return picks;
}
export function yearPools(data,meta){
  const pools=new Map();
  for(const row of data.ngmcRows){
    const season=meta.anime[row.annId]?.[1],group=row.amqSongId-1;
    if(!Number.isInteger(season)||!data.sources[group])continue;
    const year=Math.floor(season/4),type=meta.songs[row.annSongId]?.[0]||songTypeKey(row.type);
    if(!types.includes(type))continue;
    if(!pools.has(year))pools.set(year,new Map(types.map(t=>[t,new Map()])));
    const shows=pools.get(year).get(type);
    if(!shows.has(row.annId))shows.set(row.annId,new Set());
    shows.get(row.annId).add(group);
  }
  return pools;
}
function options(pool,random){
  const slots=[];
  for(const type of types){
    const shows=pool.get(type);
    const ordered=shuffled(shows.keys(),random);
    const entries=ordered.flatMap(anime=>shuffled(shows.get(anime),random).map(group=>({anime,group,type})));
    for(let i=0;i<quota;i++)slots.push(entries);
  }
  return slots;
}
export function eligibleYear(pool){
  // Hall's condition. All slots of a type have the same candidate recordings.
  const sets=types.map(type=>new Set([...pool.get(type).values()].flatMap(ids=>[...ids])));
  for(let mask=1;mask<8;mask++){
    const selected=sets.filter((_,i)=>mask&(1<<i));
    if(new Set(selected.flatMap(s=>[...s])).size<quota*selected.length)return false;
  }
  return true;
}
export function drawYear(pool,random=Math.random){
  let best=null,diversity=0;
  for(let attempt=0;attempt<12;attempt++){
    const slots=options(pool,random);
    const shows=assign(slots,'anime',true);
    const byShow=slots.map((items,i)=>shows[i]?items.filter(x=>x.anime===shows[i].anime):items);
    const byShowPicks=assign(byShow,'group');
    if(byShowPicks){
      const count=new Set(byShowPicks.map(s=>s.anime)).size;
      if(count>diversity){best=byShowPicks;diversity=count;}
      // The maximum show matching is an upper bound on distinct shows.
      if(count===shows.filter(Boolean).length)return byShowPicks;
    }
    // Preserve the type quotas and unique recordings even in a sparse year.
    const picks=assign(slots,'group');
    if(!picks)return null;
    const used=new Set();
    for(const [i,pick] of picks.entries()){
      picks[i]=slots[i].find(x=>x.group===pick.group&&!used.has(x.anime))||pick;
      used.add(picks[i].anime);
    }
    if(used.size>diversity){best=picks;diversity=used.size;}
    if(diversity===30)break;
  }
  return best;
}
