import test from 'node:test';
import assert from 'node:assert/strict';
import {eventAction,eventAudio,registerEvent} from '../src/quiz-event.js';

test('link-only events serve a blind pool and grade titles and full artist compositions separately',async()=>{
  const data=new Map(), storage={get:k=>data.get(k),put:(k,v)=>data.set(k,v)};
  const id=crypto.randomUUID(), songs=[{title:'Title',titles:['Alt Title'],artist:'Duo',suggestions:['One','Two'],
    rule:{names:['duo'],members:[['one','first'],['two']]},url:'https://files.catbox.moe/abc123.mp3'}];
  await registerEvent(storage,{id,name:'Event',songs});
  const info=await eventAction(storage,{id,action:'info'});
  assert.equal(info.count,1);
  assert.equal(info.songs,undefined);
  await assert.rejects(eventAction(storage,{id:crypto.randomUUID(),action:'info'}),{status:404});
  const answer=artists=>eventAction(storage,{id,revision:info.revision,action:'answer',index:0,song:'alt-title',artists});
  assert.deepEqual(await answer(['Two','First']),{title:'Title',artist:'Duo',songCorrect:true,artistCorrect:true});
  assert.equal((await answer(['One'])).artistCorrect,false);
  assert.equal((await answer(['Duo','One'])).artistCorrect,true);
  const url=new URL('https://example.com/api/quiz-event-audio');
  url.search=new URLSearchParams({event:id,v:info.revision,song:'0'});
  const audio=await eventAudio(storage,url,new Request(url,{headers:{Range:'bytes=0-1'}}),async(src,opts)=>{
    assert.equal(src,songs[0].url);assert.equal(opts.headers.Range,'bytes=0-1');
    return new Response(new Uint8Array([1,2]),{status:206,headers:{'Content-Range':'bytes 0-1/30'}});
  });
  assert.equal(audio.status,206);assert.equal(audio.headers.get('Content-Range'),'bytes 0-1/30');
  await registerEvent(storage,{id,name:'Changed',songs});
  await assert.rejects(answer(['Duo']),{status:409});
  await assert.rejects(registerEvent(storage,{id,name:'Duplicate',songs:[...songs,...songs]}));
});

