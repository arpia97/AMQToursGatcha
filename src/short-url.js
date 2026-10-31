// Keep the economy and its Durable Object in the original Worker.
// The shorter public address forwards requests through a private service binding.
import { publicTourHub } from './public-tour-hub.js';
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname==='/tours')return Response.redirect(url.origin+'/tours/'+url.search,308);
    const tourResponse=await publicTourHub(request,env);
    if(tourResponse)return tourResponse;
    return env.GAME_SITE.fetch(request);
  },
};
