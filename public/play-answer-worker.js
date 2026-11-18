import {answerSearchIndex,searchAnswers} from './play-answer-search.js';
let index;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      const response=await fetch(new URL('api/play-catalog?source=integrated-v2',import.meta.url),{signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw Error('Could not load the answer lists. Please retry.');
      const catalog=await response.json();index=answerSearchIndex(catalog);
      self.postMessage({type:'ready',count:Object.fromEntries(Object.entries(index).map(([k,v])=>[k,v.length]))});
    }else if(data.type==='search'&&index)self.postMessage({type:'results',id:data.id,kind:data.kind,items:searchAnswers(index,data.kind,data.query)});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
