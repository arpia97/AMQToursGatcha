import {SONG_TYPE_QUIZZES,SONG_TYPE_LENGTH} from '../public/quiz-rules.js';
import {songTypeKey} from './play-watched-selection.js';

const typeBits={OP:1,ED:2,IN:4};

export function songTypePools(data,metadata){
  const rows=new Map(data.ngmcRows.map(row=>[row.annSongId,row]));
  const recordings=[];
  for(const [group,ids] of data.groups.entries()){
    let types=0;
    const rates=new Map(),animeIds=new Set();
    for(const id of ids){
      const extra=data.extras.get(id),row=rows.get(id);
      const sourceId=extra?.sourceIds?.annSongIds?.[0]??extra?.annSongId??id;
      const meta=metadata.songs[sourceId];
      const type=meta?.[0]||songTypeKey(row?.type||extra?.type);
      if(!Object.hasOwn(typeBits,type)||meta?.[3])continue;
      types|=typeBits[type];
      const anime=data.occurrenceAnime?.get(id)??row?.annId;
      if(anime>0)animeIds.add(anime);
      const rate=meta?.[4]??row?.difficulty??extra?.difficulty;
      if(Number.isFinite(rate)&&rate>=0&&rate<=100)rates.set(sourceId,rate);
    }
    const title=data.preferred?.[group]?.titles?.[0]?.normalize('NFKC').trim().toLowerCase();
    if(types)recordings.push({group,types,shows:[...animeIds,...(title?[title]:[])],rate:rates.size?[...rates.values()].reduce((a,b)=>a+b,0)/rates.size:null});
  }
  // AMQ difficulty measures the percentage of correct guesses. Split the whole
  // ranked catalogue once, then filter each half by its eligible song types.
  const ranked=recordings.filter(r=>r.rate!==null).sort((a,b)=>a.rate-b.rate||a.group-b.group);
  const mid=Math.ceil(ranked.length/2);
  const halves={hard:ranked.slice(0,mid),easy:ranked.slice(mid),all:recordings};
  return new Map(SONG_TYPE_QUIZZES.map(q=>[q.id,halves[q.difficulty].filter(r=>r.types&typeBits[q.type])]));
}

export function drawSongType(pool,random=Math.random){
  const count=Math.min(pool.length,SONG_TYPE_LENGTH), selected=[], deferred=[];
  const seenShows=new Set(), swaps=new Map();
  // Sample a random permutation lazily. Large catalogues generally need only
  // about 100 visits. A sparse pool can reuse a show after scanning every option.
  for(let i=0;i<pool.length && selected.length<count;i++){
    const j=i+Math.floor(random()*(pool.length-i));
    const candidate=pool[swaps.get(j)??j];
    swaps.set(j,swaps.get(i)??i);
    swaps.delete(i);
    if(candidate.shows.some(show=>seenShows.has(show)))deferred.push(candidate);
    else{
      selected.push(candidate.group);
      for(const show of candidate.shows)seenShows.add(show);
    }
  }
  for(const candidate of deferred){
    if(selected.length===count)break;
    selected.push(candidate.group);
  }
  return selected;
}
