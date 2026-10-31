const HOST = 'https://amq-tours-host-draft.smokyflint131.chatgpt.site';
const modules = new Set(['styles.css','logo.png','workflow-view.js','signup-view.js','tour-workflow.js','presentation.js','signups.js','domain.js','team-balancer.js']);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function boundedBody(request) {
  const reader=request.body?.getReader();if(!reader)throw Error('JSON Is Required.');
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel();throw Error('Request Is Too Large.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
// Only the public signup/draft projection is reachable. Never proxy arbitrary
// Host Site URLs, account/host routes, archive records, blacklists or uploads.
export async function publicTourHub(request,env,fetcher=fetch) {
  const url=new URL(request.url),api=url.pathname.startsWith('/api/tour-hub');
  if(!api&&!url.pathname.startsWith('/tours/'))return null;
  let target,body;
  if(api){
    const tail=url.pathname.slice('/api/tour-hub'.length);
    if(!/^\/?(?:[0-9a-f-]{36})?$/.test(tail))return json({error:'Public Draft Not Found.'},404);
    if(!['GET','POST'].includes(request.method))return json({error:'Method Not Allowed.'},405);
    if(request.method==='POST'){
      if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Use the Tour Signup or Draft Controls.'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON Is Required.'},400);
      try{body=await boundedBody(request);}catch{return json({error:'Invalid or Oversized Request.'},400);}
      if(!['signup','withdraw','pick'].includes(body?.action))return json({error:'This Action Is Not Available Here.'},403);
    }
    target='/api/public-tours'+tail;
    if(request.method==='GET'&&url.searchParams.has('known'))target+='?known='+encodeURIComponent(url.searchParams.get('known').slice(0,100));
  }else{
    if(!['GET','HEAD'].includes(request.method))return json({error:'Method Not Allowed.'},405);
    const name=url.pathname.slice('/tours/'.length);
    if(name===''||name==='index.html')target='/tour-hub/index.html';
    else if(name==='hub.js')target='/tour-hub/hub.js';
    else if(name.startsWith('portal/')&&modules.has(name.slice(7)))target='/portal/'+name.slice(7);
    else return json({error:'Page Not Found.'},404);
  }
  if(!env.TOUR_HOST_SERVICE_TOKEN)return json({error:'The Public Draft Page Is Temporarily Unavailable.'},503);
  const headers=new Headers({'OAI-Sites-Authorization':'Bearer '+env.TOUR_HOST_SERVICE_TOKEN});
  if(api){
    const token=request.headers.get('cookie')?.match(/(?:^|;\s*)amq_session=([a-f0-9]{48})(?:;|$)/)?.[1];
    if(token)headers.set('Cookie','__Host-amq_host_session='+token);
    if(body){headers.set('Content-Type','application/json');headers.set('Origin',HOST);}
  }
  try{
    const response=await fetcher(HOST+target,{method:request.method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(25000)});
    const type=response.headers.get('content-type')||'';
    if(response.status>=300&&response.status<400||api&&!type.includes('application/json'))return json({error:'The Public Draft Service Is Temporarily Unavailable.'},503);
    return new Response(response.body,{status:response.status,headers:{'Content-Type':type,'Cache-Control':api?'private, no-store':'public, max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  }catch{return json({error:'The Public Draft Service Is Temporarily Unavailable. Try Again.'},503);}
}
