import {fileKey} from './master-song-answers.js';
import {libraryJSON,libraryShards} from './quiz-library.js';

const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
export function descriptionKeys(ann, title, artist) {
  if (!ann || !title || !artist) return [];
  const parts = [title,artist].map(normalize);
  const loose = parts.map(value => value.replace(/[^\p{L}\p{N}]/gu,''));
  return [ann+'\t'+parts.join('\t'), loose.every(Boolean) && ann+'\t'+loose.join('\t')];
}

function candidates(keys,index) {
  const hits = new Set();
  for (const key of keys) {
    const value = index[key];
    if (Array.isArray(value)) for (const id of value) hits.add(id);
    else if (value) hits.add(value);
  }
  return hits;
}

function recordingResolver(reference,official,media) {
  return function resolve(amq, ann, files, anime, title, artist) {
    const direct = new Set(amq.map(Number).filter(id => official.has(id)));
    if (direct.size === 1) return direct.values().next().value;
    const occurrence = candidates(ann,reference.ann);
    const consistent = id => (!direct.size || direct.has(id)) && (!occurrence.size || occurrence.has(id));
    if (occurrence.size === 1 && consistent(occurrence.values().next().value)) return occurrence.values().next().value;
    const audio = candidates(files,media);
    if (audio.size === 1 && consistent(audio.values().next().value)) return audio.values().next().value;
    const keys = anime.map(id => descriptionKeys(id,title,artist));
    for (const [aliases, index] of [[keys.map(k=>k[0]),reference.exact],[keys.map(k=>k[1]),reference.loose]]) {
      const hits = candidates(aliases,index);
      if (hits.size === 1 && consistent(hits.values().next().value)) return hits.values().next().value;
    }
  };
}

export async function compareAmqPlus(reference,batches) {
  const official=new Set(reference.ids.map(Math.abs)), media=Object.create(null);
  const resolve=recordingResolver(reference,official,media);
  const plus = new Set(), unmatched = new Set(), matched = new Set();
  for await (const [,rows] of batches) for (const row of Object.values(rows)) {
    const file = fileKey(row.audio)?.toLowerCase();
    const key = row.amqSongId ? 'a:'+row.amqSongId : file || 'n:'+row.annSongId;
    const id = resolve([row.amqSongId],[row.annSongId],[],[row.annId],row.title,row.artist);
    if (!id) { unmatched.add(key); continue; }
    matched.add(key);
    plus.add(id);
    if (file) {
      const prior = media[file];
      if (!prior) media[file]=id;
      else if (prior!==id) media[file]=Array.from(new Set([].concat(prior,id)));
    }
  }
  for (const key of matched) unmatched.delete(key);
  return {missing:reference.ids.filter(id=>!plus.has(Math.abs(id))),media,plusOnly:unmatched.size};
}

export function compareLocalSources(reference,comparison,master,quizzes) {
  const official=new Set(reference.ids.map(Math.abs));
  const resolve=recordingResolver(reference,official,comparison.media);
  const missing=new Set(comparison.missing.map(Math.abs)), sheet=new Set(), quiz=new Set();
  // The importer retains duplicate source identifiers as aliases on one recording.
  const aliases = new Map();
  for (const key in master.keys) {
    const index=master.keys[key],prefix=key.slice(0,2);
    if (!['a:','n:','f:'].includes(prefix)) continue;
    if (!aliases.has(index)) aliases.set(index,{amq:[],ann:[],files:[]});
    const entry=aliases.get(index);
    if (prefix==='f:') entry.files.push(key.toLowerCase());
    else (prefix==='a:'?entry.amq:entry.ann).push(Number(key.slice(2)));
  }
  for (const [i,recording] of (master.recordings||[]).entries()) {
    const [title,artist,anime] = recording || [];
    const keys=aliases.get(i);
    const id=resolve(keys?.amq||[],keys?.ann||[],keys?.files||[],[anime],title,artist);
    if (missing.has(id)) sheet.add(id);
  }
  for (const row of quizzes.rows) {
    const ids=row.sourceIds||{};
    const id=resolve(ids.amqSongIds||[],ids.annSongIds||[],[fileKey(row.audio)?.toLowerCase()],ids.annIds||[],row.title,row.artist);
    if (missing.has(id) && !sheet.has(id)) quiz.add(id);
  }
  const eligible=comparison.missing.filter(id=>id>0 && !sheet.has(id) && !quiz.has(id)).length;
  return {officialVersion:reference.version, missing:missing.size, sheets:sheet.size,
    remaining:missing.size-sheet.size-quiz.size, eligible, plusOnly:comparison.plusOnly};
}

export async function libraryCoverage(play,officialVersion) {
  const core=play.core, master=await play.sheetSource(), manifest=await core.active(), quizzes=play.quizzes;
  const key=JSON.stringify([officialVersion,manifest.version,master.version,play.quizVersion]);
  if (play.comparing?.key === key) return play.comparing.result;
  const cacheKey='host-official-coverage-v1', saved=core.get(cacheKey);
  if (saved?.key===key) return saved.counts;
  const result=(async()=>{
    const url='https://quiz-assets.invalid/quiz-library/official-coverage.json';
    const ref=await libraryJSON(await core.assets.fetch(new Request(url)),16000000);
    if (ref.version!==officialVersion) throw Error('Official export is updating.');
    const plusCacheKey='host-amq-plus-comparison-v1',plusVersion=JSON.stringify([ref.version,manifest.version]);
    let plus=core.get(plusCacheKey);
    if (plus?.version!==plusVersion) {
      const comparison=await compareAmqPlus(ref,libraryShards(core,manifest,manifest.shards));
      plus={version:plusVersion,comparison};
      core.set(plusCacheKey,plus);
    }
    const counts=compareLocalSources(ref,plus.comparison,master,quizzes);
    core.set(cacheKey,{key,counts});
    return counts;
  })();
  play.comparing={key,result};
  try { return await result; }
  finally { if (play.comparing?.result===result) play.comparing=null; }
}
