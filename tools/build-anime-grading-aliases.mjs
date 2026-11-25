import {readFile,writeFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {animeAnswerKey,quizAnswerKey} from '../public/quiz-rules.js';

const library=new URL('../public/quiz-library/',import.meta.url);
const plusNames=new URL('amq-plus-edition-names.json',import.meta.url);
const target=new URL('../src/anime-grading-aliases.json',import.meta.url);
const json=async url=>JSON.parse(await readFile(url,'utf8'));
const officialCatalog=()=>json(new URL('../public/quiz-amq-master.json',import.meta.url));
const officialNames=anime=>[...Object.values(anime?.mainNames||{}),...(anime?.names||[]).map(n=>n.name)];
const compare=(a,b)=>a<b?-1:a>b?1:0;
function add(map,id,title){
  const name=quizAnswerKey(title);
  if(!/^(?:al:)?[1-9]\d*$/.test(String(id))||!name)return;
  const key=String(id);
  if(!map.has(key))map.set(key,new Set());
  map.get(key).add(name);
}

// The compact song shards mix recording-specific answers and anime names.
// Preserve the upstream edition-level English and romaji separately at build time.
export async function writePlusNames(rows){
  const {animeMap:official}=await officialCatalog(),extra=new Map();
  for(const row of rows){
    const known=new Set(officialNames(official[row.annId]).map(quizAnswerKey));
    for(const title of [row.animeENName,row.animeJPName,...(Array.isArray(row.animeAltName)?row.animeAltName:[])]){
      if(!known.has(quizAnswerKey(title)))add(extra,row.annId,title);
    }
  }
  const entries=[...extra].sort((a,b)=>Number(a[0])-Number(b[0]));
  await writeFile(plusNames,JSON.stringify(Object.fromEntries(entries.map(([id,names])=>[id,[...names].sort(compare)])))+'\n');
}

export async function buildGradingCatalog(){
  const editions=new Map();
  const {animeMap:official,masterListId}=await officialCatalog();
  for(const [id,anime] of Object.entries(official))for(const title of officialNames(anime))add(editions,id,title);
  const update=await json(new URL('amq-official-name-updates.json',import.meta.url));
  const sources=[await json(plusNames)];
  if(update.masterListId.split('-')[0]>masterListId.split('-')[0])sources.push(update.names);
  for(const source of sources)for(const [id,names] of Object.entries(source)){
    for(const name of names)add(editions,id,name);
  }
  for(const row of await json(new URL('verified-anilist-editions.json',import.meta.url))){
    for(const name of row.names)add(editions,row.ann||'al:'+row.anilist,name);
  }
  const sheets=await json(new URL('master-answers.json',library));
  for(const [i,[altCount,...titles]] of sheets.records.entries()){
    // Both source builders put the canonical names first, followed by exactly altCount other labels.
    for(const name of titles.slice(0,titles.length-altCount))add(editions,sheets.recordings[i][2],name);
  }

  // Use this signature only as corroboration within an identified edition's own recordings.
  // Never apply it to typed guesses. Exclamation counts and other edition markers stay significant.
  const spelling=value=>value.replaceAll('★','☆').replace(/ou/g,'o').replace(/uu/g,'u').replace(/[\s:'’‘ʼ"“”‐‑‒–—-]/gu,'');
  const bySpelling=new Map();
  for(const [id,names] of editions)for(const name of names)add(bySpelling,id,spelling(name));
  for(const file of (await readdir(library)).filter(f=>/^\d+\.json$/.test(f))){
    for(const row of Object.values(await json(new URL(file,library)))){
      const known=bySpelling.get(String(row.annId));
      for(const title of row.titles||[])if(known?.has(spelling(quizAnswerKey(title))))add(editions,row.annId,title);
    }
  }

  // Play also accepts answers without spaces. Exclude a shared key from automatic
  // translation in both graders. Explicitly accepted labels still match literally.
  const owners=new Map();
  for(const [id,names] of editions)for(const name of names){
    const key=animeAnswerKey(name,true);
    if(!owners.has(key))owners.set(key,new Set());
    owners.get(key).add(id);
  }
  const groups=[];
  for(const names of editions.values()){
    const safe=[...names].filter(name=>owners.get(animeAnswerKey(name,true)).size===1).sort(compare);
    if(safe.length>1)groups.push(safe);
  }
  return {groups,editions,owners};
}
export async function writeGradingAliases(check=false){
  const {groups}=await buildGradingCatalog();
  const data='[\n'+groups.map(g=>JSON.stringify(g)).join(',\n')+'\n]\n';
  if(check){
    if((await readFile(target,'utf8')).replaceAll('\r\n','\n')!==data)throw Error('Rebuild the anime grading aliases from the current catalogs.');
  }else await writeFile(target,data);
  console.log(groups.length+' editions, '+groups.reduce((n,g)=>n+g.length,0)+' registered spellings');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await writeGradingAliases(process.argv.includes('--check'));
