import {retryDurableOperation,storageUnavailableResponse} from './durable-recovery.js';

const freshMs=10_000, fallbackMs=60_000;

// Only public directory data belongs here. Signed-in presence is an authenticated heartbeat.
export async function publicPlaySnapshot(url,namespace,cache,ctx){
  const key=new Request(url.origin+url.pathname+'?public-snapshot=v2');
  const saved=await cache?.match(key).catch(()=>undefined);
  const savedAt=Number(saved?.headers.get('X-Play-Snapshot-At'));
  const response=(body,at,stale=false)=>new Response(body,{headers:{
    'Content-Type':'application/json','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
    'X-Play-Snapshot-At':String(at),'X-Play-Snapshot':stale?'stale':'fresh',
  }});
  if(saved&&Date.now()-savedAt<freshMs)return response(saved.body,savedAt);
  try{
    const data=await retryDurableOperation(()=>{
      const queue=namespace.getByName('play-queues-v1');
      if(url.pathname==='/api/play-lobbies')return queue.lobbyDirectory();
      if(url.pathname==='/api/play-queue-counts')return queue.queueCounts();
      return queue.liveActivity(null);
    });
    const at=Date.now(),body=JSON.stringify(data);
    if(cache)ctx.waitUntil(cache.put(key,new Response(body,{headers:{
      'Cache-Control':'public,max-age=60','X-Play-Snapshot-At':String(at),
    }})).catch(()=>{}));
    return response(body,at);
  }catch(error){
    const unavailable=storageUnavailableResponse(error,"public-play-queue");
    if(!unavailable)throw error;
    if(saved&&Date.now()-savedAt<fallbackMs)return response(saved.body,savedAt,true);
    return unavailable;
  }
}
