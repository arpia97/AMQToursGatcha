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

export function fileKey(url){
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
      const key=fileKey(audio);if(key)consider(key);else if(audio)consider('url:'+audio);
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

export function sheetRecording(master, id) {
  const meta = master.recordings?.[id];
  if (!meta) return null;
  const [title, artist, annId, type, file, isDub] = meta;
  return {title, artist, annId, type, ...(isDub===true?{isDub}:{}), audio:file && 'https://naedist.animemusicquiz.com/'+file, titles:master.records[id].slice(1)};
}

// Published song pools are the only player-facing data used here. Rows are in
// quiz and song order so ties always select the same saved answer list.
export function indexQuizRecordings(rows) {
  const keys = Object.create(null), records = [], descriptions = new Map(), parents=[], winners=[];
  function root(id){
    while(parents[id]!==id){parents[id]=parents[parents[id]];id=parents[id];}
    return id;
  }
  const norm = value => String(value || '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
  for (const [id,row] of rows.entries()) {
    const answers = [...new Set(row.answers || [])];
    records.push([answers.length,...answers]);
    parents[id]=id;winners[id]=id;
    const audioKey=fileKey(row.audio) || 'url:'+row.audio;
    const strong = [audioKey,...(row.sourceIds?.amqSongIds||[]).map(v=>'a:'+v),...(row.sourceIds?.annSongIds||[]).map(v=>'n:'+v)];
    for(const key of strong){
      if(keys[key]!==undefined){
        const other=root(keys[key]);
        if(other!==id){
          const prior=winners[other],current=winners[id];
          if(records[prior][0]>records[current][0]||(records[prior][0]===records[current][0]&&prior<current))winners[id]=prior;
          parents[other]=id;
        }
      }
      keys[key]=id;
    }
    if (!row.title || !row.artist) continue;
    const suffix='\t'+norm(row.title)+'\t'+norm(row.artist);
    for(const ann of ['',...(row.sourceIds?.annIds||[])]){
      const key='m:'+ann+suffix;
      if(!descriptions.has(key))descriptions.set(key,new Set());
      descriptions.get(key).add(id);
    }
  }
  for(const key of Object.keys(keys))keys[key]=winners[root(keys[key])];
  for(const [key,ids] of descriptions){
    const matches=new Set([...ids].map(id=>winners[root(id)]));
    if(matches.size===1)keys[key]=matches.values().next().value;
  }
  return {records,rows,keys};
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
