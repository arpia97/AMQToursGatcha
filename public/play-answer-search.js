import {quizAnswerOptions} from './quiz-autocomplete.js';
import {relevantAnswers} from './answer-relevance.js';
export const searchKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function answerSearchIndex(catalog) {
  const index = {anime: [...new Set(catalog.anime || [])]};
  for (const kind of ['artist', 'song']) {
    index[kind] = [...new Set(catalog[kind] || [])].map(value => {
      const key = searchKey(value);
      return {value, key, words: key.split(/\s+/)};
    }).sort((a,b) => a.value.length-b.value.length || a.value.localeCompare(b.value));
  }
  return index;
}
// A fallback for a single mistyped word. Strong matches always get the full list first.
function nearWord(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  if(a.length>b.length)return nearWord(b,a);
  let i=0;
  while(i<a.length&&a[i]===b[i])i++;
  if(a.length!==b.length)return a.slice(i)===b.slice(i+1);
  return a.slice(i+1)===b.slice(i+1)||
    (a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2));
}
export function searchAnswers(index,kind,query,limit,session){
  if(kind==='anime')return quizAnswerOptions(index.anime,query,limit,session);
  limit ??= 20;
  const rows=index[kind]||[],raw=String(query||'').trim().slice(0,120);
  if(!raw||limit<=0)return [];
  const key=searchKey(raw);
  if(!key)return rows.filter(row=>row.value.includes(raw)).slice(0,limit).map(row=>row.value);
  const results=relevantAnswers(rows,key,limit);
  if(results.length||key.length<4||key.includes(' '))return results;
  for(const row of rows){
    if(row.words.some(word=>nearWord(word,key)))results.push(row.value);
    if(results.length===limit)break;
  }
  return results;
}
