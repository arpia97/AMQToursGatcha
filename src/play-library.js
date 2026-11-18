import {playAudioSource,playableMirror} from './play-media.js';
import { ngmcSongPool } from './ngmc-selection.js';
import { libraryJSON } from './quiz-library.js';
import { titleKey, artistKey } from './play-artists.js';
export class PlayLibrary {
  constructor(core,fetcher=(...args)=>globalThis.fetch(...args)) { this.core=core;this.fetcher=fetcher;this.audioChecks=new Map(); }
  async load() {
    const manifest=await this.core.active();
    if(this.version!==manifest.version){this.version=manifest.version;this.loading=null;}
    return this.loading ||= this.build(manifest).catch(error=>{this.loading=null;throw error;});
  }
  async build(manifest) {
    const artist=await libraryJSON(await this.core.assets.fetch(new Request('https://quiz-assets.invalid/play-artists.json')),16000000);
    const anime=new Set(),songs=new Set(),artists=new Set(artist.names),playable=new Map(),withAudio=new Map(),ngmcRows=[];
    for(const bucket of manifest.shards) {
      const rows=await this.core.shard(manifest,bucket);
      for(const row of Object.values(rows)) {
        for(const title of row.titles||[])anime.add(title);
        if(row.title)songs.add(row.title);
        if(row.artist)artists.add(row.artist);
        if(!row.title||!row.artist||!row.titles?.length)continue;
        if(playAudioSource(row.audio)&&row.titles?.length)ngmcRows.push({annId:row.annId,annSongId:row.annSongId,amqSongId:row.amqSongId,audio:row.audio,type:row.type});
        const key=String(row.amqSongId||row.audio||'ann:'+row.annSongId);
        if(!playable.has(key))playable.set(key,[]);
        playable.get(key).push(row.annSongId);
        if(!withAudio.has(key)&&playAudioSource(row.audio))withAudio.set(key,row.audio);
      }
    }
    // Names are independent lists. No per-song answer mapping goes to clients.
    for(const song of Object.values(artist.songs))if(song.title)songs.add(song.title);
    const available=[...playable.entries()].filter(([key])=>withAudio.has(key));
    return {version:manifest.version,artist,ngmcRows,sources:available.map(([key])=>withAudio.get(key)),catalog:{version:manifest.version,anime:[...anime].sort(),artist:[...artists].sort(),song:[...songs].sort()},groups:available.map(([,ids])=>ids)};
  }
  async catalog() { return (await this.load()).catalog; }
  async verifiedSource(source){
    const cached=this.audioChecks.get(source);
    if(cached&&cached.expires>Date.now())return cached.url;
    const url=await playableMirror(source,this.fetcher);
    this.audioChecks.set(source,{url,expires:Date.now()+(url?3600000:60000)});
    if(this.audioChecks.size>4000)this.audioChecks.delete(this.audioChecks.keys().next().value);
    return url;
  }
  async sample(mode='song-artist',count=20,exclude=null) {
    const data=await this.load();
    if(!Number.isInteger(count)||count<1||count>100)throw Error('Invalid song count.');
    if(data.groups.length<count)throw Object.assign(Error('The song pool is too small for this match.'),{status:503});
    const selected=new Set(),verifiedAudio=new Map(),random=new Uint32Array(1);
    const ranked=mode==='ngmc-ranked',target=exclude?1:ranked?35:count;
    const filename=url=>url.slice(url.lastIndexOf('/')+1);
    const excludedPaths=new Set((exclude||[]).map(filename));
    const excluded=new Set(),available=[];
    for(let i=0;i<data.groups.length;i++){
      if(exclude&&excludedPaths.has(filename(data.sources[i])))excluded.add(i);
      else available.push(i);
    }
    const groupById=ranked?new Map(data.groups.flatMap((ids,index)=>ids.map(id=>[id,index]))):null;
    const tried=new Set(),pool=ranked?[]:[...available];
    const draw=()=>{
      crypto.getRandomValues(random);
      const i=Math.floor(random[0]/4294967296*pool.length),group=pool[i];
      pool[i]=pool[pool.length-1];pool.pop();return {group,source:data.sources[group]};
    };
    while(selected.size<target&&tried.size<target+32){
      const needed=target-selected.size;
      const candidates=ranked?ngmcSongPool(data.ngmcRows.filter(r=>!excluded.has(groupById.get(r.annSongId))&&!tried.has(groupById.get(r.annSongId))),needed)
        .map(row=>({group:groupById.get(row.annSongId),source:row.audio})):
        Array.from({length:Math.min(pool.length,needed)},draw);
      if(!candidates.length)break;
      for(let i=0;i<candidates.length;i+=4){
        await Promise.all(candidates.slice(i,i+4).map(async({group,source})=>{
          tried.add(group);const url=await this.verifiedSource(source);
          if(url)verifiedAudio.set(group,url);
        }));
      }
      for(const {group} of candidates)if(verifiedAudio.has(group))selected.add(group);
    }
    if(selected.size!==target)throw Object.assign(Error('Not enough playable MP3s. Please try again shortly.'),{status:503});
    // Small, real, unused audio sample for host integrity review. Never part of
    // the scored song list. Check these links even in Song/Artist mode.
    const extras=exclude?[]:available.filter(i=>!tried.has(i));
    // Partial shuffle: only twelve draws, not tens of thousands of RNG calls.
    for(let i=0;i<Math.min(12,extras.length);i++){crypto.getRandomValues(random);const j=i+random[0]%(extras.length-i);[extras[i],extras[j]]=[extras[j],extras[i]];}
    const candidates=extras.slice(0,12);
    const ids=[...selected,...candidates].flatMap(index=>data.groups[index]);
    const result=await this.core.lookup({annSongIds:ids});
    const byId=new Map(result.songs.map(song=>[song.annSongId,song]));
    const buildSong=index=>{
      const variants=data.groups[index].map(id=>byId.get(id)).filter(Boolean),song=variants.find(s=>playAudioSource(s.audio)), amq=data.artist.songs[song.amqSongId];
      const artists=[...new Set([amq?.artist,...variants.map(s=>s.artist)].filter(Boolean))];
      return {audio:verifiedAudio.get(index)||song.audio,anime:song.titles[0],title:amq?.title||song.title,artist:amq?.artist||song.artist,
        artistMembers:data.artist.rules[artistKey(amq?.artist||song.artist)]?.composition||[amq?.artist||song.artist],
        answers:{anime:[...new Set(variants.flatMap(s=>s.titles).map(titleKey))],song:[...new Set([amq?.title,...variants.map(s=>s.title)].filter(Boolean).map(titleKey))],artist:artists},
        artistRules:Object.fromEntries(artists.map(name=>[artistKey(name),data.artist.rules[artistKey(name)]]).filter(([,rule])=>rule))};
    };
    const songs=[...selected].map(buildSong),decoys=[];
    const used=new Set(songs.map(s=>s.audio));
    for(let i=0;i<candidates.length&&decoys.length<3;i+=3){
      const batch=candidates.slice(i,i+3).map(buildSong).filter(s=>!used.has(s.audio));
      const urls=await Promise.all(batch.map(s=>this.verifiedSource(s.audio)));
      batch.forEach((s,j)=>{if(urls[j]&&!used.has(urls[j])&&decoys.length<3){s.audio=urls[j];decoys.push(s);used.add(s.audio);}});
    }
    return {version:data.version,songs,decoys};
  }
}
