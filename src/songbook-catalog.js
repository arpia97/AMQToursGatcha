import {songTypeKey,audioFilename} from './play-watched-selection.js';
import {randomInt,integer} from './engine.js';
import {SONG_PACK_SIZE} from '../public/song-pack-rules.js';
import {compareSongValues,matchesSong,matchesSongFlags,SONG_FILTER_DEFAULTS} from '../public/song-filters.js';

// Group numbers are valid only within one Play library version. Save the source
// identifiers with each acquisition so reordering groups or changing mirrors is safe.
export class SongbookCatalog {
  constructor(data,metrics={}){
    this.metrics=metrics;
    this.data=data;
    this.version=data.version;
    this.placements=new Map();
    this.groupsByMal=new Map();
    this.malByTitle=new Map();
    for(const row of data.ngmcRows){
      const group=row.amqSongId-1, mal=Number(data.linkedAnime.get(row.annId)?.myanimelist);
      const type=songTypeKey(row.type);
      if(!Number.isSafeInteger(mal)||mal<=0||!type)continue;
      if(!this.groupsByMal.has(mal))this.groupsByMal.set(mal,new Set());
      this.groupsByMal.get(mal).add(group);
      const label=data.animeLabels.get(row.annId)?.trim().toLowerCase();
      if(label){
        if(!this.malByTitle.has(label))this.malByTitle.set(label,new Set());
        this.malByTitle.get(label).add(mal);
      }
      const old=this.placements.get(group);
      if(!old)this.placements.set(group,row);
      else if(Array.isArray(old))old.push(row);
      else this.placements.set(group,[old,row]);
    }
    this.groups=[...this.placements.keys()];
  }
  recording(group){
    const data=this.data,p=data.preferred[group],anime=new Map(),ids=new Set();
    const placement=this.placements.get(group);
    for(const row of Array.isArray(placement)?placement:[placement]){
      const mal=Number(data.linkedAnime.get(row.annId).myanimelist),type=songTypeKey(row.type);
      if(!anime.has(mal))anime.set(mal,{mal,name:data.animeLabels.get(row.annId)||p.titles[0],types:[]});
      const entry=anime.get(mal);
      if(!entry.types.includes(type))entry.types.push(type);
    }
    for(const n of [p.amqId,...(p.quiz?.sourceIds?.amqSongIds||[])])if(n>0)ids.add('amq:'+n);
    for(const n of [...data.groups[group],...(p.quiz?.sourceIds?.annSongIds||[])])if(n>0)ids.add('ann:'+n);
    for(const url of [data.sources[group],...data.alternates[group]])ids.add('audio:'+audioFilename(url));
    return {title:p.quiz?.title||p.sheet?.title||p.amqTitle,artist:p.quiz?.artist||p.sheet?.artist||p.amqArtist,
      ...this.songMetrics(group),anime:[...anime.values()],aliases:[...ids].sort(),audio:data.sources[group]};
  }
  collectionSongs(series){
    return series.map(({key,ids})=>{
      const matches=ids.length?ids:[...(this.malByTitle.get(key)||[])];
      const groups=new Set(matches.flatMap(id=>[...(this.groupsByMal.get(id)||[])]));
      return [key,[...groups].map(group=>{
        const {title,artist,aliases}=this.recording(group);
        return {title,artist,aliases};
      })];
    });
  }
  request({action,count=1,series,index,version,filters=SONG_FILTER_DEFAULTS,page=1,malIds=[],flags=[],wishlist=[]},rand=randomInt){
    if(action==='metrics'){
      if(!this.metricsByAudio){
        this.metricsByAudio=new Map();
        for(const group of this.groups){
          for(const url of [this.data.sources[group],...this.data.alternates[group]]){
            this.metricsByAudio.set(audioFilename(url),group);
          }
        }
      }
      return {metrics:series.map(audio=>{
        const group=this.metricsByAudio.get(audioFilename(audio));
        return group===undefined?{difficulty:null,popularity:null}:this.songMetrics(group);
      })};
    }
    if(action==='collection-series')return {series:this.collectionSongs(series)};
    if(action==='pack'){
      if(!this.groups.length)throw Object.assign(Error('No eligible songs are available.'),{status:503});
      return {songs:Array.from({length:SONG_PACK_SIZE*integer(count,1,100)},()=>this.recording(this.groups[rand(this.groups.length)]))};
    }
    if(action==='redeem'){
      if(version!==this.version||!Number.isSafeInteger(index)||!this.placements.has(index))
        throw Object.assign(Error('The song library changed. Reopen the songbook and choose your song again.'),{status:409});
      return {songs:[this.recording(index)]};
    }
    const offset=(page-1)*20,rows=[],progress=[];
    const preferences=new Map(flags);
    const wished=new Set(wishlist);
    const useFlags=filters.wishlist||filters.favorite||filters.protected||filters.hideProtected||filters.ownership;
    const animeIds=new Set(malIds);
    let total=0;
    for(const index of this.order(filters.order)){
      const placement=this.placements.get(index);
      const relevant=(Array.isArray(placement)?placement:[placement]).filter(row=>
        !malIds.length||animeIds.has(Number(this.data.linkedAnime.get(row.annId).myanimelist)));
      if(!relevant.length)continue;
      const metadata=this.metadata(index);
      const filterSong={...metadata,anime:relevant.map(row=>({name:this.data.animeLabels.get(row.annId)||this.data.preferred[index].titles[0],types:[songTypeKey(row.type)]}))};
      const matched=matchesSong(filterSong,filters);
      if(!matched&&!malIds.length)continue;
      const song=useFlags||malIds.length||total>=offset&&total<offset+20?this.recording(index):null;
      if(malIds.length){
        const anime=song.anime.filter(a=>animeIds.has(a.mal));
        progress.push({aliases:song.aliases,theme:anime.some(a=>a.types.some(type=>type!=='IN'))});
      }
      if(!matched)continue;
      if(useFlags){
        const pref=song.aliases.map(alias=>preferences.get(alias)).filter(value=>value!==undefined);
        if(!matchesSongFlags({owned:!!pref.length,favorite:pref.some(mask=>mask&1),protected:pref.some(mask=>mask&2),
          wishlist:song.aliases.some(alias=>wished.has(alias))},filters))continue;
      }
      if(total>=offset&&rows.length<20)rows.push({...song,index});
      total++;
      if(!malIds.length&&total>offset+20)break;
    }
    return {rows,progress,total,version:this.version};
  }
  metadata(index){
    const p=this.data.preferred[index];
    return {title:p.quiz?.title||p.sheet?.title||p.amqTitle,artist:p.quiz?.artist||p.sheet?.artist||p.amqArtist};
  }
  songMetrics(group){
    const rows=[].concat(this.placements.get(group));
    const ranks=rows.map(r=>this.metrics.anime?.[r.annId]?.[3]).filter(n=>Number.isFinite(n)&&n>0);
    const difficulty=this.data.groups[group].map(id=>this.metrics.songs?.[id]?.[4]??this.data.extras?.get(id)?.difficulty).find(Number.isFinite);
    return {difficulty:difficulty??null,popularity:ranks.length?Math.min(...ranks):null};
  }
  order(field){
    if(!field)return this.groups;
    this.sorted??=new Map();
    if(!this.sorted.has(field)){
      this.sorted.set(field,this.groups.map(index=>{
        const first=[].concat(this.placements.get(index))[0];
        const label=field==='anime'?this.data.animeLabels.get(first.annId)||this.data.preferred[index].titles[0]:
          ['difficulty','popularity'].includes(field)?this.songMetrics(index)[field]:this.metadata(index)[field];
        return {index,label};
      }).sort((a,b)=>compareSongValues(a.label,b.label)||a.index-b.index).map(row=>row.index));
    }
    return this.sorted.get(field);
  }
}
