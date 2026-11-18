import {libraryJSON} from './quiz-library.js';
import {quizRowAudio} from '../public/quiz-rules.js';

const snapshots=new WeakMap();
export function loadMasterSongAnswers(assets){
  if(!snapshots.has(assets)){
    const pending=assets.fetch(new Request('https://quiz-assets.invalid/quiz-library/master-answers.json'))
      .then(response=>libraryJSON(response,24_000_000))
      .then(data=>{
        if(!data.version||!data.records?.length||!data.keys)throw Error('Invalid master-sheet answer snapshot.');
        return data;
      }).catch(error=>{snapshots.delete(assets);throw error;});
    snapshots.set(assets,pending);
  }
  return snapshots.get(assets);
}

function fileKey(url){
  if(typeof url!=='string')return null;
  const match=/^(?:https:\/\/(?:eu|nae|naw)dist\.animemusicquiz\.com\/)?([a-z0-9_-]+\.(?:mp3|webm|mp4))(?:[?#].*)?$/i.exec(url);
  return match?'f:'+match[1]:null;
}

// Each record begins with its distinct alternative count. Its index breaks ties in sheet order.
export function bestMasterRecord(snapshot,rows){
  let best;
  function consider(key){
    const id=snapshot.keys[key];
    if(id===undefined)return;
    if(best===undefined||snapshot.records[id][0]>snapshot.records[best][0]||
      (snapshot.records[id][0]===snapshot.records[best][0]&&id<best))best=id;
  }
  for(const row of rows){
    if(!row)continue;
    for(const audio of [row.audio,row.audioUrl,row.audio_url,row.mp3,row.songLink,row.videoUrl,row.songLinks?.primary,row.songLinks?.playedSrc]){
      const key=fileKey(audio);if(key)consider(key);
    }
    for(const id of [row.amqSongId??row.songId,...(Array.isArray(row.sourceIds?.amqSongIds)?row.sourceIds.amqSongIds:[])])if(id)consider('a:'+id);
    for(const id of [row.annSongId,...(Array.isArray(row.sourceIds?.annSongIds)?row.sourceIds.annSongIds:[])])if(id)consider('n:'+id);
  }
  if(best===undefined){
    const norm=value=>String(value||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
    for(const row of rows){
      if(!row)continue;
      const name=norm(row.songName||row.title||row.songTitle),artist=norm(row.songArtist||row.artist);
      if(!name||!artist)continue;
      const ann=row.annId??row.annID??row.songInfo?.siteIds?.annId;
      if(ann)consider('m:'+ann+'\t'+name+'\t'+artist);
      consider('m:\t'+name+'\t'+artist);
    }
  }
  return best;
}

export function masterImportAnswers(snapshot,rows){
  const byAudio=new Map();
  for(const row of rows){
    const audio=row&&quizRowAudio(row);if(!audio)continue;
    if(!byAudio.has(audio))byAudio.set(audio,[]);
    byAudio.get(audio).push(row);
  }
  const matches=new Map();
  for(const [audio,group] of byAudio){
    const id=bestMasterRecord(snapshot,group);
    if(id!==undefined)matches.set(audio,snapshot.records[id].slice(1));
  }
  return matches;
}
