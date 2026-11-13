// Keep the economy and its Durable Object in the original Worker.
// The shorter public address forwards requests through a private service binding.
import { publicTourHub } from './public-tour-hub.js';
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.hostname==='amqtours.app'){
      if(url.pathname==='/gacha')return Response.redirect(url.origin+'/gacha/'+url.search,308);
      if(!url.pathname.startsWith('/gacha/'))return new Response('Not Found',{status:404});
      url.pathname=url.pathname.slice('/gacha'.length);
      const upstream=new Request(url,request);
      // A player may also be signed in to Sites on this host. The game only needs its own cookie.
      const session=request.headers.get('cookie')?.match(/(?:^|;\s*)(amq_session=[a-f0-9]{48})(?:;|$)/)?.[1];
      upstream.headers.delete('cookie');
      upstream.headers.delete('authorization');
      upstream.headers.delete('OAI-Sites-Authorization');
      if(session)upstream.headers.set('cookie',session);
      const response=await env.GAME_SITE.fetch(upstream);
      const headers=new Headers(response.headers);
      const location=headers.get('location');
      if(location){
        const target=new URL(location,url);
        if(target.origin===url.origin)headers.set('location','/gacha'+target.pathname+target.search+target.hash);
      }
      const cookie=headers.get('set-cookie');
      if(cookie?.startsWith('amq_session='))headers.set('set-cookie',cookie.replace(/; Path=\/(;|$)/i,'; Path=/gacha$1'));
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    if(url.pathname==='/tours')return Response.redirect(url.origin+'/tours/'+url.search,308);
    const tourResponse=await publicTourHub(request,env);
    if(tourResponse)return tourResponse;
    return env.GAME_SITE.fetch(request);
  },
};
