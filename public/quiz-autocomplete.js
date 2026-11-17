import { quizAnswerKey } from "./quiz-rules.js";
const searchKey = (value) =>
  quizAnswerKey(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// Banks are reused for every keystroke. Cache their normalized shortest-first
// order; partial bank loads invalidate by length without retaining old banks.
const indexes=new WeakMap();
function indexFor(answers){
  let index=indexes.get(answers);
  if(!index||index.length!==answers.length){
    index={length:answers.length,rows:answers.map((title,order)=>({title,order,key:searchKey(title)}))
      .sort((a,b)=>a.title.length-b.title.length||a.title.localeCompare(b.title)||a.order-b.order)};
    indexes.set(answers,index);
  }
  return index.rows;
}
export function quizAnswerOptions(answers, query, limit = 20) {
  const key=searchKey(query);if(!key||limit<=0)return [];
  const words=key.split(" "),matches=[];
  for(const row of indexFor(answers)){
    if(row.key.includes(key)||words.every(word=>row.key.includes(word))){
      matches.push(row.title);if(matches.length>=limit)break;
    }
  }
  return matches;
}
