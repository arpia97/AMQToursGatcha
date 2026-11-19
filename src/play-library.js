import {ARENA_FORMAT, arenaRules} from '../public/play-arena-config.js';
import {arenaSongCount} from './play-arena.js';
import {playAudioSource,playableMirror} from './play-media.js';
import {watchedWeights, weightedAnimeOrder, watchedRecordings, watchedCandidates, recordingGroupIndex, audioFilename, checkAudioCandidates} from './play-watched-selection.js';
import { ngmcSongPool } from './ngmc-selection.js';
import { libraryJSON, libraryShards } from './quiz-library.js';
import { titleKey, artistKey } from './play-artists.js';
import {loadMasterSongAnswers,bestMasterRecord,indexQuizRecordings,sheetRecording} from './master-song-answers.js';
export class PlayLibrary {
  constructor(core,fetcher=(...args)=>globalThis.fetch(...args),quizSource=()=>null,sheetSource=()=>loadMasterSongAnswers(core.assets)) {
    this.sheetSource=sheetSource;
    this.core=core;this.fetcher=fetcher;this.audioChecks=new Map();this.quizSource=quizSource;
    this.quizzes=indexQuizRecordings([]);this.quizVersion='';this.nextCheck=0;
  }
  async refreshQuizzes() {
    const update=await this.quizSource(this.quizRevision);
    if(update){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(update.version));
      this.quizVersion=Array.from(new Uint8Array(digest).slice(0,8),b=>b.toString(16).padStart(2,'0')).join('');
      this.quizzes=indexQuizRecordings(update.rows);this.quizRevision=update.version;
    }
    this.nextCheck=Date.now()+60000;
  }
  async load(progress) {
    if(Date.now()>=this.nextCheck){
      this.refreshing??=this.refreshQuizzes().finally(()=>{this.refreshing=null;});
      await this.refreshing;
    }
    const manifest=await this.core.active();
    const master=await this.sheetSource();
    const version=manifest.version+'+'+this.quizVersion+'+'+master.version;
    if(this.version!==version){this.version=version;this.loading=null;}
    if(!this.loading){
      this.catalogBuild={done:0,total:manifest.shards.length};
      this.loading=this.build(manifest,this.quizzes,this.quizVersion,master,this.catalogBuild).catch(error=>{if(this.version===version)this.loading=null;throw error;});
    }
    if(progress)progress.catalog=this.catalogBuild;
    return this.loading;
  }
  async build(manifest,quizzes,quizVersion,master,catalogBuild) {
    const readAsset=async (file,limit)=>libraryJSON(await this.core.assets.fetch(new Request('https://quiz-assets.invalid/'+file)),limit);
    const [artist,creditedNames]=await Promise.all([
      readAsset('play-artists.json',16000000),readAsset('quiz-library/artist-names.json',2000000),
    ]);
    const anime=new Set(),songs=new Set(),artists=new Set([...artist.names,...creditedNames]),playable=new Map(),withAudio=new Map(),ngmcRows=[];
    const occurrenceAnime=new Map(), linkedAnime=new Map();
    for(const [ann,[myanimelist,anilist]] of Object.entries(master.animeLinks||{}))linkedAnime.set(Number(ann),{myanimelist,anilist});
    const extras=new Map(), officialById=new Map(), matchedSheet=new Set(),matchedQuiz=new Set(),alternates=new Map();
    for(const [amq,ann,animeId,type,title,performer,titles] of master.official||[]){
      const meta={annId:animeId,type,title,artist:performer,titles};
      if(amq)officialById.set('a:'+amq,meta);
      if(ann)officialById.set('n:'+ann,meta);
      songs.add(title);artists.add(performer);for(const value of titles)anime.add(value);
    }
    function add(row,sheetId,quizId,extra=false){
      const sheet=sheetId===undefined?null:sheetRecording(master,sheetId), quiz=quizzes.rows[quizId];
      const titles=sheetId!==undefined?master.records[sheetId].slice(1):quiz?.answers||row.titles||[];
      for(const title of titles)anime.add(title);
      if(row.title)songs.add(row.title);
      if(row.artist)artists.add(row.artist);
      for(const name of row.artistNames||[])artists.add(name);
      const title=sheet?.title||quiz?.title||row.title,performer=sheet?.artist||quiz?.artist||row.artist;
      if(title)songs.add(title);if(performer)artists.add(performer);
      const source=playAudioSource(sheet?.audio)||playAudioSource(quiz?.audio)||playAudioSource(row.audio);
      if(!title||!performer||!titles.length||!source)return;
      const key=sheetId!==undefined?'sheet:'+sheetId:quizId!==undefined?'quiz:'+quizId:String(row.amqSongId||source);
      if(!playable.has(key)){playable.set(key,[]);withAudio.set(key,source);}
      for(const url of [quiz?.audio,row.audio]){
        if(!url||url.split('/').pop()===withAudio.get(key).split('/').pop()||!playAudioSource(url))continue;
        if(!alternates.has(key))alternates.set(key,new Set());
        alternates.get(key).add(url);
      }
      if(sheetId!==undefined)matchedSheet.add(sheetId);
      if(quizId!==undefined)matchedQuiz.add(quizId);
      const id=extra?-(extras.size+1):row.annSongId;
      if(extra)extras.set(id,row);
      playable.get(key).push(id);
      const annId=row.annId||sheet?.annId||quiz?.sourceIds?.annIds?.[0];
      if(annId){
        occurrenceAnime.set(id,annId);
        if(row.linkedIds?.myanimelist || row.linkedIds?.anilist){
          const prior=linkedAnime.get(annId);
          linkedAnime.set(annId,{myanimelist:row.linkedIds.myanimelist||prior?.myanimelist,anilist:row.linkedIds.anilist||prior?.anilist});
        }
      }
      const type=(annId===sheet?.annId&&sheet?.type)||row.type||quiz?.type||sheet?.type;
      if(type&&annId)ngmcRows.push({annId,annSongId:id,amqSongId:key,audio:source,type});
    }
    for await(const [,rows] of libraryShards(this.core,manifest,manifest.shards)) {
      for(const row of Object.values(rows)){
        add(row,bestMasterRecord(master,[row]),bestMasterRecord(quizzes,[row]));
      }
      catalogBuild.done++;
    }
    let sheetAdded=0,quizAdded=0;
    for(const [id] of (master.recordings||[]).entries()){
      if(matchedSheet.has(id))continue;
      const row=sheetRecording(master,id);
      add(row,id,bestMasterRecord(quizzes,[row]),true);
      if(matchedSheet.has(id))sheetAdded++;
    }
    for(const quiz of quizzes.rows){
      const id=bestMasterRecord(quizzes,[quiz]),sheetId=bestMasterRecord(master,[quiz]);
      if(matchedQuiz.has(id)||matchedSheet.has(sheetId))continue;
      const ann=quiz.sourceIds?.annSongIds?.[0],amq=quiz.sourceIds?.amqSongIds?.[0];
      const last=officialById.get('n:'+ann)||officialById.get('a:'+amq);
      add({...last,...quiz,amqSongId:amq,type:quiz.type||last?.type,annId:quiz.sourceIds?.annIds?.[0]||last?.annId,titles:quiz.answers},sheetId,id,true);
      if(matchedQuiz.has(id))quizAdded++;
    }
    // Names are independent lists. No per-song answer mapping goes to clients.
    for(const song of Object.values(artist.songs))if(song.title)songs.add(song.title);
    const available=[...playable.entries()].filter(([key])=>withAudio.has(key));
    const version=manifest.version+'+'+master.version+'+quiz-'+quizVersion;
    const coverage={playableRecordings:available.length,sheetAdded,quizAdded,seedArtistNames:creditedNames.length};
    return {version,master,quizzes,artist,extras,ngmcRows,occurrenceAnime,linkedAnime,alternates:available.map(([key])=>alternates.get(key)),sources:available.map(([key])=>withAudio.get(key)),catalog:{version,coverage,anime:[...anime].sort(),artist:[...artists].sort(),song:[...songs].sort()},groups:available.map(([,ids])=>ids)};
  }
  async catalog() { return (await this.load()).catalog; }
  async watchedAnimeCount(lists, ranked) {
    if(!lists.some(list=>list.ids.length))return 0;
    const data=await this.load();
    return watchedCandidates(data,watchedWeights(lists,data.linkedAnime),ranked).size;
  }
  async verifiedSource(source){
    const cached=this.audioChecks.get(source);
    if(cached&&cached.expires>Date.now())return cached.url;
    const url=await playableMirror(source,this.fetcher);
    this.audioChecks.set(source,{url,expires:Date.now()+(url?3600000:60000)});
    if(this.audioChecks.size>4000)this.audioChecks.delete(this.audioChecks.keys().next().value);
    return url;
  }
  async sample(mode='song-artist',count=20,exclude=null,watched=null,excludeAnime=[],progress=null) {
    const started=Date.now();
    const data=await this.load(progress);
    const catalogReady=Date.now();
    const maxSongs=mode===ARENA_FORMAT?arenaSongCount(arenaRules.maxPlayers):100;
    if(!Number.isInteger(count)||count<1||count>maxSongs)throw Error('Invalid song count.');
    if(data.groups.length<count)throw Object.assign(Error('The song pool is too small for this match.'),{status:503});
    const selected=new Set(),verifiedAudio=new Map(),random=new Uint32Array(1);
    const ranked=mode==='ngmc-ranked',target=exclude?1:ranked?35:count;
    if(progress)Object.assign(progress,{stage:'songs',done:0,total:target});
    const excludedPaths=new Set((exclude||[]).map(audioFilename));
    const lists=Array.isArray(watched)?watched:watched&&Object.entries(watched).map(([provider,ids])=>({provider,ids}));
    const weights=lists?watchedWeights(lists,data.linkedAnime):null;
    for(const anime of excludeAnime)weights?.delete(anime);
    const pickedAnime=new Map();
    const eligible=id=>!weights||weights.has(data.occurrenceAnime.get(id));
    const excluded=new Set(),available=[];
    for(let i=0;i<data.groups.length;i++){
      if(weights && !data.groups[i].some(eligible))excluded.add(i);
      else if(exclude&&[data.sources[i],...(data.alternates[i]||[])].some(url=>excludedPaths.has(audioFilename(url))))excluded.add(i);
      else available.push(i);
    }
    const shortPool=()=>Object.assign(Error("Too few distinct anime with playable songs on the Watched lists. Add more entries, choose fewer songs in a custom lobby, or switch to Random."),{status:422});
    const groupById=ranked?recordingGroupIndex(data):null;
    const checked=progress?new Set():null;
    const verify=async(group,source)=>{
      let url=await this.verifiedSource(source);
      for(const alternate of data.alternates[group]||[]){if(url)break;url=await this.verifiedSource(alternate);}
      if(url&&progress){
        checked.add(weights?audioFilename(url):group);
        progress.done=checked.size;
      }
      return url;
    };
    const randomIndex=length=>Math.floor(crypto.getRandomValues(random)[0]/4294967296*length);
    const tried=new Set(),pool=ranked?[]:[...available];
    if(weights){
      const candidates=watchedCandidates(data,weights,ranked,{groupById,excluded,excludedPaths});
      if(candidates.size<target)throw shortPool();
      for(const anime of weights.keys())if(!candidates.has(anime))weights.delete(anime);
      const recordings=await watchedRecordings(weightedAnimeOrder(weights),new Map([...candidates].map(([anime,options])=>[anime,[...options.values()]])),target,verify,randomIndex,audioFilename);
      if(recordings.length!==target)throw shortPool();
      for(const {anime,group,url} of recordings){
        selected.add(group);tried.add(group);pickedAnime.set(group,anime);verifiedAudio.set(group,url);
      }
    }
    const draw=()=>{
      crypto.getRandomValues(random);
      const i=Math.floor(random[0]/4294967296*pool.length),group=pool[i];
      pool[i]=pool[pool.length-1];pool.pop();return {group,source:data.sources[group]};
    };
    while(!weights&&selected.size<target&&tried.size<target+32){
      const needed=target-selected.size;
      const candidates=ranked?ngmcSongPool(data.ngmcRows.filter(r=>eligible(r.annSongId)&&!excluded.has(groupById.get(r.annSongId))&&!tried.has(groupById.get(r.annSongId))),needed)
        .map(row=>({group:groupById.get(row.annSongId),source:row.audio})):
        Array.from({length:Math.min(pool.length,needed)},draw);
      if(!candidates.length)break;
      const urls=await checkAudioCandidates(candidates,({group,source})=>verify(group,source));
      candidates.forEach(({group},i)=>{
        tried.add(group);
        if(urls[i]){verifiedAudio.set(group,urls[i]);selected.add(group);}
      });
    }
    if(selected.size!==target)throw Object.assign(Error('Not enough playable MP3s. Please try again shortly.'),{status:503});
    if(progress)progress.stage='finalizing';
    // Small, real, unused audio sample for host integrity review. Never part of
    // the scored song list. Check these links even in Song/Artist mode.
    const extras=exclude?[]:available.filter(i=>!tried.has(i));
    // Partial shuffle: only twelve draws, not tens of thousands of RNG calls.
    for(let i=0;i<Math.min(12,extras.length);i++){crypto.getRandomValues(random);const j=i+random[0]%(extras.length-i);[extras[i],extras[j]]=[extras[j],extras[i]];}
    const candidates=extras.slice(0,12);
    const ids=[...selected,...candidates].flatMap(index=>data.groups[index]);
    const songsChecked=Date.now();
    const result=await this.core.lookup({annSongIds:ids.filter(id=>id>0)});
    const byId=new Map(result.songs.map(song=>[song.annSongId,song]));
    const buildSong=index=>{
      const variants=data.groups[index].map(id=>byId.get(id)||data.extras.get(id)).filter(Boolean),song=variants.find(s=>playAudioSource(s.audio))||variants[0], amq=data.artist.songs[song.amqSongId];
      const matched=bestMasterRecord(data.master,variants);
      const sheet=sheetRecording(data.master,matched),quiz=data.quizzes.rows[bestMasterRecord(data.quizzes,variants)];
      const titles=matched===undefined?quiz?.answers||variants.flatMap(s=>s.titles):data.master.records[matched].slice(1);
      const title=sheet?.title||quiz?.title||song.title||amq?.title,performer=sheet?.artist||quiz?.artist||song.artist||amq?.artist;
      const artists=[...new Set([performer,amq?.artist,...variants.map(s=>s.artist)].filter(Boolean))];
      return {audio:verifiedAudio.get(index)||data.sources[index],...(pickedAnime.has(index)?{annId:pickedAnime.get(index)}:{}),anime:titles[0],title,artist:performer,
        artistMembers:data.artist.rules[artistKey(performer)]?.composition||[performer],
        answers:{anime:[...new Set(titles.map(titleKey))],song:[...new Set([title,amq?.title,...variants.map(s=>s.title)].filter(Boolean).map(titleKey))],artist:artists},
        artistRules:Object.fromEntries(artists.map(name=>[artistKey(name),data.artist.rules[artistKey(name)]]).filter(([,rule])=>rule))};
    };
    const songs=[...selected].map(buildSong),decoys=[];
    const used=new Set(songs.map(s=>s.audio));
    for(let i=0;i<candidates.length&&decoys.length<3;i+=3){
      const batch=candidates.slice(i,i+3).map(buildSong).filter(s=>!used.has(s.audio));
      const urls=await Promise.all(batch.map(s=>this.verifiedSource(s.audio)));
      batch.forEach((s,j)=>{if(urls[j]&&!used.has(urls[j])&&decoys.length<3){s.audio=urls[j];decoys.push(s);used.add(s.audio);}});
    }
    const elapsed=Date.now()-started;
    if(elapsed>=2000)console.info('Slow Play song selection',{
      mode,pool:weights?'watched':'random',songs:songs.length,totalMs:elapsed,
      catalogMs:catalogReady-started,drawAndCheckMs:songsChecked-catalogReady,
      metadataAndDecoysMs:elapsed-(songsChecked-started),
    });
    return {version:data.version,songs,decoys};
  }
}
