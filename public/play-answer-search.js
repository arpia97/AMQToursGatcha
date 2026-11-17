export const searchKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function answerSearchIndex(catalog){return Object.fromEntries(['anime','artist','song'].map(kind=>[kind,[...new Set(catalog[kind]||[])].map(value=>({value,key:searchKey(value)})).sort((a,b)=>a.value.length-b.value.length||a.value.localeCompare(b.value))]));}
export function searchAnswers(index,kind,query,limit=20){
  const key=searchKey(query).slice(0,120),tokens=key.split(/\s+/).filter(Boolean);if(!tokens.length)return [];
  const matches=[];
  for(const row of index[kind]||[]){if(tokens.every(token=>row.key.includes(token))){matches.push(row.value);if(matches.length>=limit)break;}}
  return matches;
}
