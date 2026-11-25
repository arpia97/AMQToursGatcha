// Rebuild after updating either the official AMQ anime catalog or the AMQ+ song shards.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {quizAnswerKey} from '../public/quiz-rules.js';

const library=new URL('../public/quiz-library/',import.meta.url);
const {animeMap}=JSON.parse(await readFile(new URL('../public/quiz-amq-master.json',import.meta.url),'utf8'));
const official=new Map(),plus=new Map(),owners=new Map();
const compact=value=>value.replace(/\s/g,'');
// Only consider differences in separators and quotation marks. Season punctuation stays significant.
const spelling=value=>compact(value).replace(/[:'’‘ʼ"“”‐‑‒–—-]/gu,'');
function add(index,id,value){
  const name=quizAnswerKey(value);
  if(!name)return;
  if(!index.has(id))index.set(id,new Set());
  index.get(id).add(name);
  const key=spelling(name);
  if(!owners.has(key))owners.set(key,new Set());
  owners.get(key).add(id);
}
for(const [id,anime] of Object.entries(animeMap)){
  for(const entry of anime.names||[])add(official,id,entry.name);
  for(const title of Object.values(anime.mainNames||{}))add(official,id,title);
}
for(const file of (await readdir(library)).filter(f=>/^\d+\.json$/.test(f))){
  const rows=JSON.parse(await readFile(new URL(file,library),'utf8'));
  for(const row of Object.values(rows)){
    if(row.annId)for(const title of row.titles||[])add(plus,String(row.annId),title);
  }
}
const groups=[];
for(const [id,names] of official){
  const candidates=plus.get(id);
  if(!candidates)continue;
  const safe=name=>owners.get(spelling(name))?.size===1;
  const aliases=new Set();
  for(const name of names){
    if(!safe(name))continue;
    for(const candidate of candidates){
      if(candidate!==name&&spelling(candidate)===spelling(name)){
        aliases.add(candidate);aliases.add(name);
      }
    }
  }
  if(!aliases.size)continue;
  // Accept either main language for this exact edition even if a quiz imported only one.
  for(const lang of ['JA','EN']){
    const canonical=quizAnswerKey(animeMap[id].mainNames?.[lang]);
    if(canonical&&safe(canonical))aliases.add(canonical);
  }
  groups.push([...aliases].sort());
}
await writeFile(new URL('../src/anime-grading-aliases.json',import.meta.url),'[\n'+groups.map(g=>JSON.stringify(g)).join(',\n')+'\n]\n');
console.log(groups.length+' editions, '+groups.reduce((n,g)=>n+g.length,0)+' spellings');
