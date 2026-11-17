import { ngmcSongPool } from './ngmc-selection.js';
import { libraryJSON } from './quiz-library.js';
import { answerKey, artistKey } from './play-artists.js';
export class PlayLibrary {
  constructor(core) { this.core=core; }
  async load() {
    const manifest=await this.core.active();
    if(this.version!==manifest.version){this.version=manifest.version;this.loading=null;}
    return this.loading ||= this.build(manifest).catch(error=>{this.loading=null;throw error;});
  }
  async build(manifest) {
    const artist=await libraryJSON(await this.core.assets.fetch(new Request('https://quiz-assets.invalid/play-artists.json')),16000000);
    const anime=new Set(),songs=new Set(),artists=new Set(artist.names),playable=new Map(),withAudio=new Set(),ngmcRows=[];
    for(const bucket of manifest.shards) {
      const rows=await this.core.shard(manifest,bucket);
      for(const row of Object.values(rows)) {
        for(const title of row.titles||[])anime.add(title);
        if(row.title)songs.add(row.title);
        if(row.artist)artists.add(row.artist);
        if(!row.title||!row.artist||!row.titles?.length)continue;
        if(row.audio&&row.titles?.length)ngmcRows.push({annId:row.annId,annSongId:row.annSongId,amqSongId:row.amqSongId,audio:row.audio,type:row.type});
        const key=String(row.amqSongId||row.audio||'ann:'+row.annSongId);
        if(!playable.has(key))playable.set(key,[]);
        playable.get(key).push(row.annSongId);
        if(row.audio)withAudio.add(key);
      }
    }
    // Names are independent lists. No per-song answer mapping goes to clients.
    for(const song of Object.values(artist.songs))if(song.title)songs.add(song.title);
    return {version:manifest.version,artist,ngmcRows,catalog:{version:manifest.version,anime:[...anime].sort(),artist:[...artists].sort(),song:[...songs].sort()},groups:[...playable.entries()].filter(([key])=>withAudio.has(key)).map(([,ids])=>ids)};
  }
  async catalog() { return (await this.load()).catalog; }
  async sample(mode='song-artist') {
    const data=await this.load();
    if(data.groups.length<20)throw Object.assign(Error('At least 20 playable songs are required.'),{status:503});
    const selected=new Set(), random=new Uint32Array(1);
    if(mode==='ngmc-ranked'){
      const groupById=new Map(data.groups.flatMap((ids,index)=>ids.map(id=>[id,index])));
      for(const row of ngmcSongPool(data.ngmcRows))selected.add(groupById.get(row.annSongId));
    }
    while(mode!=='ngmc-ranked'&&selected.size<20) {crypto.getRandomValues(random);const limit=Math.floor(4294967296/data.groups.length)*data.groups.length;if(random[0]<limit)selected.add(random[0]%data.groups.length);}
    const ids=[...selected].flatMap(index=>data.groups[index]);
    const result=await this.core.lookup({annSongIds:ids});
    const byId=new Map(result.songs.map(song=>[song.annSongId,song]));
    const songs=[...selected].map(index=>{
      const variants=data.groups[index].map(id=>byId.get(id)).filter(Boolean),song=variants.find(s=>s.audio), amq=data.artist.songs[song.amqSongId];
      const artists=[...new Set([amq?.artist,...variants.map(s=>s.artist)].filter(Boolean))];
      return {audio:song.audio,anime:song.titles[0],title:amq?.title||song.title,artist:amq?.artist||song.artist,
        answers:{anime:[...new Set(variants.flatMap(s=>s.titles).map(answerKey))],song:[...new Set([amq?.title,...variants.map(s=>s.title)].filter(Boolean).map(answerKey))],artist:artists},
        artistRules:Object.fromEntries(artists.map(name=>[artistKey(name),data.artist.rules[artistKey(name)]]).filter(([,rule])=>rule))};
    });
    return {version:data.version,songs};
  }
}
