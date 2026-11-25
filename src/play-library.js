import {ARENA_FORMAT, arenaRules} from '../public/play-arena-config.js';
import {PLAY_SONG_SOURCE_ORDER, playSongInventory} from './play-song-inventory.js';
import {mergedTitles,registeredGroupAnswers} from './play-answer-registry.js';
import {ONE_TEAM_MODE} from '../public/play-mode-rules.js';
import {arenaSongCount} from './play-arena.js';
import {playAudioSource,playableMirror} from './play-media.js';
import {watchedRigOwners, watchedWeights, weightedAnimeOrder, watchedRecordings, watchedCandidates, countWatchedCandidates, recordingGroupIndex, audioFilename, checkAudioCandidates} from './play-watched-selection.js';
import { ngmcSongPool } from './ngmc-selection.js';
import { libraryJSON, libraryShards } from './quiz-library.js';
import { animeTitleKey, titleKey, artistKey, artistAliasLabels, recordingArtistRules } from './play-artists.js';
import {songIsDub} from "../public/quiz-rules.js";
import dubIndex from "../public/quiz-library/dub-recordings.json" with {type:"json"};
import {loadMasterSongAnswers,bestMasterRecord,indexQuizRecordings,sheetRecording,fileKey} from './master-song-answers.js';
const dubAnnIds = new Set(dubIndex.annSongIds);
const dubAmqIds = new Set(dubIndex.amqSongIds);
const dubAudioKeys = new Set(dubIndex.audioKeys);
const dubAudio = audio => dubAudioKeys.has(fileKey(audio));
function isDubRecording(row) {
  return !!row && (songIsDub(row) || dubAudio(row.audio) ||
    [row.annSongId, ...(row.sourceIds?.annSongIds || [])].some(id => dubAnnIds.has(Number(id))) ||
    [row.amqSongId, ...(row.sourceIds?.amqSongIds || [])].some(id => dubAmqIds.has(Number(id))));
}
function preferRecord(index,current,candidate) {
  if(candidate===undefined)return current;
  if(current===undefined)return candidate;
  const difference=index.records[candidate][0]-index.records[current][0];
  return difference>0||difference===0&&candidate<current?candidate:current;
}

export class PlayLibrary {
  constructor(core,fetcher=(...args)=>globalThis.fetch(...args),quizSource=()=>null,sheetSource=()=>loadMasterSongAnswers(core.assets),answerSource=()=>null) {
    this.answerSource=answerSource;
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
  async load(progress,{refreshQuizzes=false,refreshSheet=false}={}) {
    if(refreshQuizzes||Date.now()>=this.nextCheck){
      this.refreshing??=this.refreshQuizzes().finally(()=>{this.refreshing=null;});
      await this.refreshing;
    }
    const manifest=await this.core.active();
    const master=await this.sheetSource(refreshSheet);
    const registrations=this.answerSource();
    const version=manifest.version+'+'+this.quizVersion+'+'+master.version+'+'+(registrations?.revision||'');
    if(this.version!==version){this.version=version;this.loading=null;}
    if(!this.loading){
      this.catalogBuild={done:0,total:manifest.shards.length};
      this.loading=this.build(manifest,this.quizzes,this.quizVersion,master,this.catalogBuild,registrations).catch(error=>{if(this.version===version)this.loading=null;throw error;});
    }
    if(progress)progress.catalog=this.catalogBuild;
    return this.loading;
  }
  async build(manifest,quizzes,quizVersion,master,catalogBuild,registrations) {
    const hasRegistrations=!!registrations?.rows.size;
    const readAsset=async (file,limit)=>libraryJSON(await this.core.assets.fetch(new Request('https://quiz-assets.invalid/'+file)),limit);
    const [artist,creditedNames]=await Promise.all([
      readAsset('play-artists.json',16000000),readAsset('quiz-library/artist-names.json',2000000),
    ]);
    const anime=new Set(),songs=new Set(),artists=new Set([...artist.names,...creditedNames,...artistAliasLabels]),playable=new Map(),ngmcRows=[];
    const occurrenceAnime=new Map(), linkedAnime=new Map();
    for(const [ann,[myanimelist,anilist]] of Object.entries(master.animeLinks||{}))linkedAnime.set(Number(ann),{myanimelist,anilist});
    const extras=new Map(), officialById=new Map(), amqOccurrences=[];
    const dubSheet = new Set();
    for (const id of dubAnnIds) dubSheet.add(master.keys['n:'+id]);
    for (const id of dubAmqIds) dubSheet.add(master.keys['a:'+id]);
    for (const key of dubAudioKeys) dubSheet.add(master.keys[key]);
    dubSheet.delete(undefined);
    for(const [amq,ann,animeId,type,title,performer,titles] of master.official||[]){
      const meta={annId:animeId,annSongId:ann,amqSongId:amq,type,title,artist:performer,titles};
      if(amq)officialById.set('a:'+amq,meta);
      if(ann)officialById.set('n:'+ann,meta);
      songs.add(title);artists.add(performer);for(const value of titles)anime.add(value);
    }
    function occurrences(group,row,id) {
      group.ids.push(id);
      const annId=row.annId||row.sourceIds?.annIds?.[0];
      if(!annId)return;
      occurrenceAnime.set(id,annId);
      if(row.linkedIds?.myanimelist || row.linkedIds?.anilist){
        const prior=linkedAnime.get(annId);
        linkedAnime.set(annId,{myanimelist:row.linkedIds.myanimelist||prior?.myanimelist,anilist:row.linkedIds.anilist||prior?.anilist});
      }
      if(row.type)group.ngmc.push({annId,annSongId:id,type:row.type});
    }

    const inventory=playSongInventory(master,quizzes);
    function groupFor(record) {
      const key=inventory.root(record);
      if(!playable.has(key))playable.set(key,{ids:[],ngmc:[],audio:[],quizId:undefined,sheetId:undefined,amqTitles:[]});
      return playable.get(key);
    }
    for await(const [,rows] of libraryShards(this.core,manifest,manifest.shards)) {
      for(const row of Object.values(rows)){
        const sheetId=bestMasterRecord(master,[row]),quizId=bestMasterRecord(quizzes,[row]);
        const record=inventory.addAmqPlus(row,sheetId,quizId);
        if(isDubRecording(row))continue;
        if(row.title)songs.add(row.title);
        if(row.artist)artists.add(row.artist);
        for(const name of row.artistNames||[])artists.add(name);
        amqOccurrences.push({record,amqSongId:row.amqSongId,annSongId:row.annSongId,annId:row.annId,type:row.type,
          audio:row.audio,title:row.title,artist:row.artist,titles:row.titles,linkedIds:row.linkedIds});
      }
      catalogBuild.done++;
    }
    for(const row of amqOccurrences){
      const group=groupFor(row.record);
      if(hasRegistrations)(group.registrationSources??=[]).push(row);
      group.hasAmqPlus=true;
      group.amqTitle||=row.title;
      group.amqArtist||=row.artist;
      for(const title of row.titles||[])group.amqTitles.push(title);
      const url=playAudioSource(row.audio);
      if(url&&!dubAudio(url))group.audio.push(url);
      occurrences(group,row,row.annSongId);
    }
    function addSource(record,row,id,field,index) {
      const group=groupFor(record);
      if(hasRegistrations)(group.registrationSources??=[]).push(row);
      group[field]=preferRecord(index,group[field],id);
      const url=playAudioSource(row.audio);
      if(url&&!dubAudio(url))group.audio.push(url);
      const annId=row.annId||row.sourceIds?.annIds?.[0];
      if(group.hasAmqPlus&&(!annId||group.ids.some(id=>occurrenceAnime.get(id)===annId)))return;
      const extraId=-(extras.size+1);
      extras.set(extraId,row);
      occurrences(group,row,extraId);
    }
    for(const id of new Set(quizzes.recordingIds)){
      const quiz=quizzes.rows[id];
      if(isDubRecording(quiz))continue;
      const ann=quiz.sourceIds?.annSongIds?.[0],amq=quiz.sourceIds?.amqSongIds?.[0];
      const last=officialById.get('n:'+ann)||officialById.get('a:'+amq);
      addSource(inventory.quiz(id),{...last,...quiz,amqSongId:amq??last?.amqSongId,type:quiz.type||last?.type,
        annId:quiz.sourceIds?.annIds?.[0]||last?.annId,titles:quiz.answers},id,'quizId',quizzes);
    }
    for(const [id,record] of master.records.entries()){
      const row=sheetRecording(master,id)||{titles:record.slice(1)};
      if(dubSheet.has(id)||isDubRecording(row))continue;
      addSource(inventory.sheet(id),row,id,'sheetId',master);
    }

    const registeredAnswers=registeredGroupAnswers(registrations,playable.values());
    const groups=[],sources=[],alternates=[],preferred=[];
    let registeredMatches=0;
    let sheetAdded=0,quizAdded=0;
    for(const group of playable.values()){
      const quiz=quizzes.rows[group.quizId];
      const sheet=sheetRecording(master,group.sheetId)||(group.sheetId===undefined?null:{titles:master.records[group.sheetId].slice(1)});
      const registered=registeredAnswers.get(group);
      const titles=registered ? mergedTitles(quiz?.answers||[],registered) :
        quiz?.answers?.length ? quiz.answers : sheet?.titles??group.amqTitles;
      for(const title of titles)anime.add(title);
      const title=quiz?.title||sheet?.title,performer=quiz?.artist||sheet?.artist;
      if(title)songs.add(title);
      if(performer)artists.add(performer);
      const audio=new Map();
      for(const link of [quiz?.audio,sheet?.audio,...group.audio]){
        const url=playAudioSource(link);
        if(url&&!dubAudio(url)&&!audio.has(audioFilename(url)))audio.set(audioFilename(url),url);
      }
      if(!titles.length||!audio.size||!(title||group.amqTitle)||!(performer||group.amqArtist))continue;
      if(registered)registeredMatches++;
      const [source,...mirrors]=audio.values(),groupId=groups.length;
      groups.push(group.ids);sources.push(source);alternates.push(mirrors);
      preferred.push({quiz,sheet,titles,amqTitle:group.amqTitle,amqArtist:group.amqArtist});
      for(const row of group.ngmc)ngmcRows.push({...row,amqSongId:groupId+1,audio:source});
      if(!group.hasAmqPlus){
        if(quiz)quizAdded++;
        else if(sheet)sheetAdded++;
      }
    }
    // Names are independent lists. No per-song answer mapping goes to clients.
    for(const song of Object.values(artist.songs))if(song.title)songs.add(song.title);
    const registrationVersion=hasRegistrations?'+answers-'+registrations.revision:'';
    const version=manifest.version+'+'+master.version+'+quiz-'+quizVersion+registrationVersion+'+no-dubs+'+PLAY_SONG_SOURCE_ORDER;
    const coverage={playableRecordings:groups.length,sheetAdded,quizAdded,seedArtistNames:creditedNames.length};
    const counts=inventory.counts();
    if(registrations)Object.assign(counts,{registeredAnswers:registrations.rows.size,registeredMatches});
    return {version,inventory:counts,artist,extras,ngmcRows,occurrenceAnime,linkedAnime,alternates,sources,preferred,groups,
      catalog:{version,coverage,anime:[...anime].sort(),artist:[...artists].sort(),song:[...songs].sort()}};
  }
  async inventory(refreshQuizzes) {
    const {inventory}=await this.load(undefined,{refreshQuizzes,refreshSheet:true});
    return inventory;
  }
  async catalog() { return (await this.load()).catalog; }
  async watchedAnimeCount(lists, ranked) {
    if(!lists.some(list=>list.ids.length))return 0;
    const data=await this.load();
    return countWatchedCandidates(data,watchedWeights(lists,data.linkedAnime),ranked);
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
    const allowShort=mode===ONE_TEAM_MODE&&!exclude;
    if(!allowShort&&data.groups.length<count)throw Object.assign(Error('The song pool is too small for this match.'),{status:503});
    const selected=new Set(),verifiedAudio=new Map(),random=new Uint32Array(1);
    const ranked=mode==='ngmc-ranked';
    let target=exclude?1:ranked?35:allowShort?Math.min(count,data.groups.length):count;
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
        progress.done=Math.min(target,checked.size);
      }
      return url;
    };
    const randomIndex=length=>Math.floor(crypto.getRandomValues(random)[0]/4294967296*length);
    const tried=new Set(),pool=ranked?[]:[...available];
    if(weights){
      const candidates=watchedCandidates(data,weights,ranked,{groupById,excluded,excludedPaths});
      if(allowShort){
        target=Math.min(target,candidates.size);
        if(progress)progress.total=target;
      }
      if(!target||candidates.size<target)throw shortPool();
      for(const anime of weights.keys())if(!candidates.has(anime))weights.delete(anime);
      const recordings=await watchedRecordings(weightedAnimeOrder(weights),new Map([...candidates].map(([anime,options])=>[anime,[...options.values()]])),target,verify,randomIndex,audioFilename);
      if(!recordings.length||!allowShort&&recordings.length!==target)throw shortPool();
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
    if(!selected.size||!allowShort&&selected.size!==target)throw Object.assign(Error('Not enough playable MP3s. Please try again shortly.'),{status:503});
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
    const rigOwners=lists?.some(list=>list.player!=null)
      ? watchedRigOwners(lists,data.linkedAnime,pickedAnime.values()) : null;
    const buildSong=index=>{
      const variants=data.groups[index].map(id=>byId.get(id)||data.extras.get(id)).filter(Boolean),song=variants.find(s=>playAudioSource(s.audio))||variants[0], amq=data.artist.songs[song.amqSongId];
      const {quiz,sheet,titles,amqTitle,amqArtist}=data.preferred[index];
      const animeTitles=[...new Set(titles.filter(title=>animeTitleKey(title)))];
      const title=quiz?.title||sheet?.title||song.title||amqTitle||amq?.title;
      const performer=quiz?.artist||sheet?.artist||song.artist||amqArtist||amq?.artist;
      const artists=[...new Set((quiz?.artist||sheet?.artist?[performer]:[performer,amq?.artist,...variants.map(s=>s.artist)]).filter(Boolean))];
      const songNames=quiz?.title||sheet?.title?[title]:[title,amq?.title,...variants.map(s=>s.title)];
      const artistRules=recordingArtistRules(artists,data.artist.rules,song.amqSongId,amq?.artist);
      return {audio:verifiedAudio.get(index)||data.sources[index],...(pickedAnime.has(index)?{annId:pickedAnime.get(index),...(rigOwners?{rigOwners:rigOwners.get(pickedAnime.get(index))}:{})}:{}),anime:animeTitles[0],animeTitles,title,
        songType:quiz?.type||sheet?.type||song.type,artist:performer,
        artistMembers:artistRules[artistKey(performer)]?.composition||[performer],
        answers:{anime:[...new Set(animeTitles.map(animeTitleKey))],song:[...new Set(songNames.filter(Boolean).map(titleKey))],artist:artists},
        artistRules};
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
