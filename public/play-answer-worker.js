import {answerSearchIndex,searchAnswers} from './play-answer-search.js';
import {amqAnimeOptions} from './amq-anime-search.js';
import {percentDone} from './play-setup-progress.js';
let index, sessionId, fuzzySession;
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
      // Shared event links extend only their own worker's copy of the Play catalogue.
      if (data.extra) {
        for (const kind of ['song','artist']) {
          const values=catalog[kind]||[];
          const key=value=>value.normalize('NFKC').trim().toLowerCase();
          const seen=new Set(values.map(key));
          catalog[kind]=[...values];
          for (const value of data.extra[kind]||[]) {
            const normalized=key(value);
            if(normalized && !seen.has(normalized)){catalog[kind].push(value);seen.add(normalized);}
          }
        }
      }
      index=answerSearchIndex(catalog);
      self.postMessage({type:'ready',count:Object.fromEntries(Object.entries(index).map(([k,v])=>[k,v.length]))});
    }else if(data.type==='search'&&index){
      if (data.session !== sessionId || !fuzzySession) {
        sessionId = data.session;
        fuzzySession = {};
      }
      const standard=data.kind==='anime'&&!data.fuzzy;
      const items=standard?amqAnimeOptions(index.anime,data.query):searchAnswers(index,data.kind,data.query,undefined,fuzzySession);
      self.postMessage({type:'results',id:data.id,items});
    }
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
