import {answerSearchIndex,searchAnswers} from './play-answer-search.js';
import {percentDone} from './play-setup-progress.js';
let index;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      const response=await fetch(new URL('api/play-catalog?source=integrated-v2',import.meta.url),{signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw Error('Could not load the answer lists. Please retry.');
      const total=Number(response.headers.get('Content-Length'));
      const encoding=response.headers.get('Content-Encoding');
      let body=response;
      if(response.body&&total>0&&(!encoding||encoding==='identity')){
        let done=0,last='';
        body=new Response(response.body.pipeThrough(new TransformStream({transform(chunk,controller){
          done+=chunk.byteLength;
          const percent=percentDone(done,total);
          if(percent!==last){last=percent;self.postMessage({type:'progress',label:'Downloading answer lists · '+percent});}
          controller.enqueue(chunk);
        }})));
      }
      const catalog=await body.json();
      self.postMessage({type:'progress',label:'Preparing answer search…'});
      index=answerSearchIndex(catalog);
      self.postMessage({type:'ready',count:Object.fromEntries(Object.entries(index).map(([k,v])=>[k,v.length]))});
    }else if(data.type==='search'&&index)self.postMessage({type:'results',id:data.id,kind:data.kind,items:searchAnswers(index,data.kind,data.query)});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
