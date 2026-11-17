export const searchKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function answerSearchIndex(catalog){return Object.fromEntries(['anime','artist','song'].map(kind=>[kind,(catalog[kind]||[]).map(value=>({value,key:searchKey(value)}))]));}
export function searchAnswers(index,kind,query,limit=20){
  const key=searchKey(query).slice(0,120),tokens=key.split(/\s+/).filter(Boolean);if(!tokens.length)return [];
  const starts=[],other=[];
  for(const row of index[kind]||[]){if(tokens.every(token=>row.key.includes(token))){const target=row.key.startsWith(key)?starts:other;if(target.length<limit)target.push(row.value);if(starts.length===limit)break;}}
  return [...starts,...other].slice(0,limit);
}
