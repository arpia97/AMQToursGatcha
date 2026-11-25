import {animeAnswerKey} from '../public/quiz-rules.js';
import editions from './anime-grading-aliases.json' with {type:'json'};

// Match registered spellings at grading time. Keep the original labels for
// dropdowns, uploaded answers, match history and the player's submission.
function indexEditions(compact){
  const index=new Map();
  for(const names of editions){
    const canonical=animeAnswerKey(names[0],compact);
    for(const name of names)index.set(animeAnswerKey(name,compact),canonical);
  }
  return index;
}
const quizEditions=indexEditions(false),playEditions=indexEditions(true);
export function animeGradingKey(value,compact=false){
  const key=animeAnswerKey(value,compact);
  return (compact?playEditions:quizEditions).get(key)??key;
}
export const playAnimeGradingKey=value=>animeGradingKey(value,true);
