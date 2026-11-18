import {relevantAnswers} from './answer-relevance.js';
export const searchKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function answerSearchIndex(catalog){return Object.fromEntries(['anime','artist','song'].map(kind=>[kind,[...new Set(catalog[kind]||[])].map(value=>{const key=searchKey(value);return {value,key,words:key.split(/\s+/)};}).sort((a,b)=>a.value.length-b.value.length||a.value.localeCompare(b.value))]));}
export function searchAnswers(index,kind,query,limit=20){
  return relevantAnswers(index[kind]||[],searchKey(query).slice(0,120),limit);
}
