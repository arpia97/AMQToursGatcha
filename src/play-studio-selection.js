import {apportion,studioMix} from '../public/play-studio-rules.js';
import {watchedWeights,weightedAnimeOrder,watchedRecordings,audioFilename} from './play-watched-selection.js';
const unavailable=message=>Object.assign(Error(message),{status:422});
const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
const range=(n,lo,hi,fullLo,fullHi)=>lo===fullLo&&hi===fullHi||Number.isFinite(n)&&n>=lo&&n<=hi;
const taxonomy=(values,filters,logic)=>logic==='AND'?filters.every(v=>values.includes(v)):!filters.length||filters.some(v=>values.includes(v));
export function eligibleOccurrence(s,song,anime){
  if(!song||!anime)return false;
  const [type,category,rebroadcast,dub,difficulty,popularity]=song;
  const [format,season,score,rank,genres,tags]=anime;
  return s.types.includes(type)&&(category?s.categories[type].includes(category):s.categories[type].length===4)&&
    (!rebroadcast||s.rebroadcast)&&(!dub||s.dubs)&&range(difficulty,s.difficultyFrom,s.difficultyTo,0,100)&&range(popularity,s.popFrom,s.popTo,0,100)&&
    (format?s.animeTypes.includes(format):s.animeTypes.length===5)&&
    (season!=null?season>=s.from&&season<=s.to:s.from===1924*4&&s.to>=new Date().getUTCFullYear()*4+Math.floor(new Date().getUTCMonth()/3))&&
    range(score,s.scoreFrom,s.scoreTo,0,10)&&(!s.top||rank!=null&&rank<=s.top)&&taxonomy(genres,s.genres,s.genreLogic)&&taxonomy(tags,s.tags,s.tagLogic);
}
export async function selectStudio(data,meta,s,lists,verify,{exclude=[],excludeAnime=[],replacement}={}){
  const excluded=new Set(exclude.map(audioFilename)),usedAnime=new Set(s.dupes?[]:excludeAnime);
  const eligible=new Map();
  const byId=new Map(data.ngmcRows.map(row=>[row.annSongId,row]));
  for(let group=0;group<data.groups.length;group++){
    const source=data.sources[group];
    if(excluded.has(audioFilename(source)))continue;
    for(const id of data.groups[group]){
      const extra=data.extras.get(id),anime=data.occurrenceAnime.get(id);
      if(!anime||usedAnime.has(anime))continue;
      const raw=meta.songs[extra?.sourceIds?.annSongIds?.[0]??extra?.annSongId??id];
      const type=extra?.type||byId.get(id)?.type||data.preferred[group]?.sheet?.type||'';
      const kind=/^(OP|Opening)/i.test(type)?'OP':/^(ED|Ending)/i.test(type)?'ED':/^(IN|Insert)/i.test(type)?'IN':null;
      if(!eligibleOccurrence(s,raw??[kind,null,false,false,extra?.difficulty,null],meta.anime[anime]??[null,null,null,null,[],[]]))continue;
      if(!eligible.has(anime))eligible.set(anime,new Map());
      eligible.get(anime).set(group,{group,source});
    }
  }
  const participants=(lists||[]).map(list=>({id:list.player,size:new Set(list.ids).size,anime:watchedWeights([list],data.linkedAnime)}));
  const watched=watchedWeights(lists||[],data.linkedAnime),owners=new Map();
  for(const p of participants)for(const anime of p.anime.keys()){
    if(!owners.has(anime))owners.set(anime,[]);
    owners.get(anime).push(p);
  }
  const [watchCount,unwatched,random]=studioMix(s);
  const batches=[];
  if(replacement)batches.push({...replacement,count:1});
  else{
    if(watchCount&&['Forced Equal','Force Weighted'].includes(s.watchMethod)){
      const ps=shuffle([...participants]);
      if(!ps.length||s.watchMethod==='Forced Equal'&&(watchCount%ps.length||ps.some(p=>!p.size)))throw unavailable('Forced Equal needs a Watched list for everyone and a Watched song count divisible by the player count.');
      const quotas=apportion(watchCount,ps.map(p=>s.watchMethod==='Forced Equal'?1:p.size));
      if(quotas.reduce((a,b)=>a+b,0)!==watchCount)throw unavailable('No imported Watched lists.');
      ps.forEach((p,i)=>{if(quotas[i])batches.push({kind:'watched',owner:p.id,count:quotas[i]});});
      batches.sort((a,b)=>participants.find(p=>p.id===a.owner).anime.size-participants.find(p=>p.id===b.owner).anime.size);
    }else if(watchCount)batches.push({kind:'watched',count:watchCount});
    if(unwatched)batches.push({kind:'unwatched',count:unwatched});
    if(random)batches.push({kind:'random',count:random});
  }
  const result=[];
  for(const {kind,owner,count} of batches){
    const weights=new Map(),options=new Map();
    for(const [anime,groupMap] of eligible){
      if(usedAnime.has(anime))continue;
      const people=owners.get(anime)||[];
      if(kind==='unwatched'&&people.length||kind==='watched'&&(!people.length||owner&&!people.some(p=>p.id===owner)||s.watchMethod==='Unique rigs only'&&people.length>=s.cutoff))continue;
      let weight=1;
      if(kind==='watched'&&!owner){
        if(s.watchMethod==='Random')weight=watched.get(anime);
        if(s.watchMethod==='Weighted')weight=people.length;
        if(s.watchMethod==='Equal')weight=people.reduce((sum,p)=>sum+1/p.size,0);
      }
      const entries=[...groupMap.values()].filter(v=>!excluded.has(audioFilename(v.source)));
      if(!entries.length)continue;
      // When duplicates are enabled each recording is a distinct draw within its anime.
      if(s.dupes)for(const item of entries){const key=anime+':'+item.group;weights.set(key,weight/entries.length);options.set(key,[item]);}
      else{weights.set(anime,weight);options.set(anime,entries);}
    }
    const picks=await watchedRecordings(weightedAnimeOrder(weights),options,count,async(g,url)=>{
      const verified=await verify(g,url);return verified&&!excluded.has(audioFilename(verified))?verified:null;
    },n=>Math.floor(Math.random()*n),audioFilename);
    if(picks.length<count)throw unavailable('Only '+picks.length+' of '+count+' '+kind+' songs fit these filters'+(owner?' for an assigned player':'')+'. Change the filters or song count.');
    for(const pick of picks){
      const anime=Number(String(pick.anime).split(':')[0]);if(!s.dupes)usedAnime.add(anime);
      excluded.add(audioFilename(pick.url));excluded.add(audioFilename(data.sources[pick.group]));
      result.push({...pick,anime,bucket:{kind,...(owner?{owner}:{})}});
    }
  }
  return shuffle(result);
}
