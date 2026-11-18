import {relevantAnswers} from './answer-relevance.js';
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
    index={length:answers.length,rows:answers.map((title,order)=>{const key=searchKey(title);return {value:title,order,key,words:key.split(/\s+/)};})
      .sort((a,b)=>a.value.length-b.value.length||a.value.localeCompare(b.value)||a.order-b.order)};
    indexes.set(answers,index);
  }
  return index.rows;
}
export function quizAnswerOptions(answers, query, limit = 20) {
  const key=searchKey(query);if(!key||limit<=0)return [];
  return relevantAnswers(indexFor(answers),key,limit);
}
