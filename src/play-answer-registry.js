import {amqAlternativeTitles} from '../public/quiz-answer-index.js';
import {quizImportRows,songIsDub} from '../public/quiz-rules.js';
import {fileKey} from './master-song-answers.js';
import {descriptionKeys} from './official-song-coverage.js';
import {animeTitleKey} from './play-artists.js';

const strings = value => Array.isArray(value) ? value : [];
const id = value => /^(?:[1-9][0-9]{0,14})$/.test(String(value)) ? String(value) : null;

export function mergedTitles(...lists) {
  const titles = new Map();
  for (const list of lists) for (const title of list) {
    const key = animeTitleKey(title);
    if (key && !titles.has(key)) titles.set(key,title);
  }
  return [...titles.values()];
}

function recordingKeys(row) {
  const info=row.songInfo||{}, source=row.sourceIds||{}, sites=info.siteIds||{};
  const strong=new Set(), weak=new Set();
  for (const [prefix,values] of [
    ['a:',[row.amqSongId,info.amqSongId,sites.amqSongId,...strings(source.amqSongIds)]],
    ['n:',[row.annSongId,info.annSongId,sites.annSongId,...strings(source.annSongIds)]],
  ]) for (const value of values) if(id(value)) strong.add(prefix+id(value));
  for (const link of [row.audio,row.videoUrl,row.songLinks?.primary,row.songLinks?.playedSrc,...strings(row.songLinks?.allLinks)]) {
    const key=fileKey(link)?.toLowerCase();
    if(key)strong.add(key);
  }
  const title=row.title||row.songName||info.songName, artist=row.artist||row.songArtist||info.artist;
  if(typeof title==='string' && title.length<=500 && typeof artist==='string' && artist.length<=500){
    for (const value of [row.annId,info.annId,sites.annId,...strings(source.annIds)]) {
      const [key]=descriptionKeys(id(value),title,artist);
      if(key)weak.add('m:'+key);
    }
  }
  return [...strong,...weak].sort();
}

function exportRegistration(row) {
  if (!row || typeof row!=='object' || Array.isArray(row) || songIsDub(row)) return null;
  const info=row.songInfo||row;
  const names=info.animeNames;
  const alternatives=amqAlternativeTitles(info).filter(title=>title.length<=400);
  if(!alternatives.length) return null;
  const answers=mergedTitles([names?.romaji,names?.english,...alternatives]
    .filter(title=>typeof title==='string' && title.trim() && title.length<=400).map(title=>title.trim()));
  const keys=recordingKeys(row);
  if (!keys.length || keys.length>48 || !answers.length || answers.length>200) return null;
  return {keys,answers};
}

const invalid = message => Object.assign(Error(message),{status:400});

export class PlayAnswerRegistry {
  constructor(core) { this.core=core; this.db=core.db; }
  snapshot() {
    if (!this.current) {
      this.db.run('CREATE TABLE IF NOT EXISTS play_amq_answers(identity TEXT PRIMARY KEY, answers TEXT NOT NULL)');
      const rows=this.db.all('SELECT identity,answers FROM play_amq_answers ORDER BY identity');
      this.current={revision:this.core.get('registered-play-answers')||'', rows:new Map(rows.map(row=>[row.identity,JSON.parse(row.answers)]))};
    }
    return this.current;
  }
  register(input) {
    let exports;
    try { exports=quizImportRows(input); }
    catch(error) { throw invalid(error.message); }
    const previous=this.snapshot(), next=new Map(previous.rows), writes=new Map();
    let usable=0;
    for(const row of exports) {
      const entry=exportRegistration(row);
      if(!entry)continue;
      usable++;
      const key=JSON.stringify(entry.keys), old=next.get(key)||[];
      const answers=mergedTitles(old,entry.answers);
      if (answers.length>200) throw invalid('A recording has more than 200 registered titles. No answers were saved.');
      if(answers.length>old.length){next.set(key,answers);writes.set(key,answers);}
    }
    if(!usable) throw invalid('No usable AMQ alternative answers were found. Export songs with their working titles and recording IDs or AMQ links.');
    if(writes.size) {
      const revision=crypto.randomUUID();
      this.db.tx(()=>{
        for(const [key,answers] of writes) this.db.run(
          'INSERT INTO play_amq_answers VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET answers=excluded.answers',
          key,JSON.stringify(answers),
        );
        this.core.set('registered-play-answers',revision);
      });
      this.current={revision,rows:next};
    }
    return {updated:writes.size, skipped:exports.length-usable, registered:next.size};
  }
}

// A working-title list may identify one recording in several ways. Resolve across
// the actual groups so a matching title cannot also tag a second recording.
export function registeredGroupAnswers(snapshot,groups) {
  const matched=new Map();
  if(!snapshot?.rows.size)return matched;
  const entries=[...snapshot.rows].map(([identity,answers])=>({keys:JSON.parse(identity),answers}));
  const index=new Map(entries.flatMap(({keys})=>keys.map(key=>[key,new Set()])));
  for(const group of groups) for(const row of group.registrationSources||[]) {
    for(const key of recordingKeys(row))index.get(key)?.add(group);
  }
  for(const {keys,answers} of entries) {
    const candidates = weak => new Set(keys.filter(key=>key.startsWith('m:')===weak).flatMap(key=>[...index.get(key)]));
    const byId=candidates(false);
    // A metadata-only export can fall back to an unambiguous anime-scoped match.
    // If it supplied a strong key, keep it pending until that recording is present.
    const matches=keys.some(key=>!key.startsWith('m:'))?byId:candidates(true);
    if(matches.size!==1)continue;
    const group=matches.values().next().value;
    matched.set(group,mergedTitles(matched.get(group)||[],answers));
  }
  return matched;
}
