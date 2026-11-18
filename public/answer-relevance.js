// Query words match distinct title words. In particular, "shana s" must not
// treat the S inside Shana as a second complete word.
function matchesWords(words,tokens,prefix){
  if(tokens.length===1)return words.some(word=>prefix?word.startsWith(tokens[0]):word===tokens[0]);
  if(tokens.length>words.length)return false;
  const assigned=Array(words.length).fill(-1);
  const visit=(token,seen)=>words.some((word,index)=>{
    if(seen.has(index)||!(prefix?word.startsWith(tokens[token]):word===tokens[token]))return false;
    seen.add(index);
    if(assigned[index]===-1||visit(assigned[index],seen)){assigned[index]=token;return true;}
    return false;
  });
  return tokens.every((_,index)=>visit(index,new Set()));
}
// A contiguous fragment can cross word boundaries: "ge r" matches Revenge R.
// Rows are cached in shortest-first order. Buckets keep that order without
// normalizing or sorting the full bank again for every keystroke.
export function relevantAnswers(rows,key,limit=20){
  if(!key||limit<=0)return [];
  const tokens=key.split(/\s+/),buckets=[[],[],[],[],[]];
  for(const row of rows){
    if(!tokens.every(token=>row.key.includes(token)))continue;
    const rank=row.key===key?0:matchesWords(row.words,tokens,false)?1:row.key.includes(key)?2:matchesWords(row.words,tokens,true)?3:4;
    if(buckets[rank].length<limit)buckets[rank].push(row.value);
  }
  return buckets.flat().slice(0,limit);
}
