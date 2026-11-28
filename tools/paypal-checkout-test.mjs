import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {playRuntimeFixture} from '../tests/play-runtime-fixture.mjs';

const paypal='https://api-m.sandbox.paypal.com';
const site='http://127.0.0.1:8799';
const events='/v1/notifications/webhooks';
const webhookRoute='/webhook/'+randomBytes(24).toString('hex');
const amount='1.25';
const checkoutFormKey=randomBytes(24).toString('hex');
const {PAYPAL_SANDBOX_CLIENT_ID:clientId,PAYPAL_SANDBOX_CLIENT_SECRET:secret}=process.env;
const origin=process.argv[2];
if(!clientId||!secret||!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin??'')){
  throw Error('Run the sandbox checkout launcher with Sandbox credentials and an active quick tunnel.');
}

let testState={phase:'Preparing'};
let fixture, webhookId, token, buyerCookie, controlCookie, completedSubscription, checkout;
let webhookServer, userServer, stopping;
const requestUrl=path=>origin+path;

async function provider(path,options={}) {
  const r=await fetch(paypal+path,{
    ...options,redirect:'error',signal:AbortSignal.timeout(12_000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},
  });
  if(!r.ok)throw Error('PayPal Sandbox returned HTTP '+r.status+' for '+path.split('?')[0]+'.');
  return r.status===204?null:r.json();
}
async function listen(port,handler) {
  const server=createServer((req,res)=>void handler(req,res).catch(()=>{
    if(!res.headersSent)res.writeHead(500,{'Cache-Control':'no-store'});
    res.end('Sandbox test request failed.');
  }));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  return server;
}
function respond(res,status,body,type='text/plain; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  res.end(body);
}
function page(res,title,body) {
  respond(res,200,'<!doctype html><html lang="en"><title>'+title+'</title><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;margin:3rem auto;max-width:38rem;padding:1rem"><h1>'+title+'</h1>'+body+'</body></html>','text/html; charset=utf-8');
}
async function account(cookie) {
  const r=await fixture.dispatchFetch(requestUrl('/api/play-state'),{headers:{Cookie:cookie}});
  if(!r.ok)throw Error('Could not read the sandbox account.');
  const {me}=await r.json();
  if(!me)throw Error('The sandbox test session was unavailable.');
  return {id:me.id,active:me.donator,expires:me.donator_until};
}
async function webhook(req,res) {
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/play/overview'&&['return','cancel'].includes(url.searchParams.get('donator'))){
    return page(res,'PayPal Sandbox approval returned','<p>The test is waiting for the verified webhook.</p><a href="'+site+'/">View local test result</a>');
  }
  if(req.method==='GET'&&url.pathname==='/health-'+webhookRoute.split('/').at(-1))return respond(res,200,'ready');
  if(req.method!=='POST'||url.pathname!==webhookRoute)return respond(res,404,'Not found');
  if(!fixture||!webhookId)return respond(res,503,'Test starting');
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>128_000)return respond(res,413,'Payload too large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  const headers=new Headers({'Content-Type':'application/json'});
  for(const name of ['auth-algo','cert-url','transmission-id','transmission-sig','transmission-time']){
    const value=req.headers['paypal-'+name];
    if(typeof value==='string')headers.set('paypal-'+name,value);
  }
  const result=await fixture.dispatchFetch(requestUrl('/api/paypal-donator-webhook'),{method:'POST',body:raw,headers});
  let event;
  try{event=JSON.parse(raw);}catch{}
  const payment=event?.event_type==='PAYMENT.SALE.COMPLETED';
  if(payment&&!result.ok){
    testState={phase:'Waiting for PayPal webhook retry',status:result.status};
    return respond(res,result.status,'Webhook could not be processed');
  }
  if(payment&&result.ok&&checkout&&!completedSubscription){
    const [buyer,control]=await Promise.all([account(buyerCookie),account(controlCookie)]);
    if(buyer.active&&!control.active){
      completedSubscription=event.resource?.billing_agreement_id;
      testState={phase:'Passed',amountUsd:amount,linkedAccount:'Sandbox Buyer',buyerDonator:true,controlDonator:false,expiresAt:new Date(buyer.expires).toISOString(),source:'verified PayPal Sandbox webhook'};
      console.log(JSON.stringify(testState));
      setTimeout(()=>void finish(),1_000).unref();
    }
  }
  respond(res,result.status,result.ok?'ok':'Webhook could not be processed');
}
async function user(req,res) {
  const url=new URL(req.url,site);
  if(req.method==='GET'&&url.pathname==='/status')return respond(res,200,JSON.stringify(testState),'application/json');
  if(req.method==='GET'&&url.pathname==='/start'){
    res.writeHead(303,{Location:'/', 'Cache-Control':'no-store'});res.end();return;
  }
  if(req.method==='POST'&&url.pathname==='/start'){
    let form='';
    for await(const chunk of req){
      form+=chunk.toString('utf8');
      if(form.length>1024)return respond(res,413,'Payload too large');
    }
    if(new URLSearchParams(form).get('key')!==checkoutFormKey)return respond(res,403,'Open the local test page and try again.');
    if(!fixture||!buyerCookie)return respond(res,503,'Test starting');
    checkout??=(async()=>{
      const r=await fixture.dispatchFetch(requestUrl('/api/paypal-donator-start'),{
        method:'POST',body:JSON.stringify({amount}),headers:{Cookie:buyerCookie,Origin:origin,'Content-Type':'application/json'},
      });
      const result=await r.json();
      if(!r.ok)throw Error(result.error||'Could not start the sandbox checkout.');
      testState={phase:'Waiting for Sandbox buyer approval',amountUsd:amount};
      return result.approval;
    })().catch(error=>{
      checkout=null;
      testState={phase:'Checkout error',error:error.message};
      throw error;
    });
    const approval=await checkout.catch(()=>null);
    if(!approval)return page(res,'Checkout could not start','<p><a href="/status">View the error</a> or <a href="/">try again</a>.</p>');
    res.writeHead(303,{Location:approval,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;
  }
  if(req.method!=='GET'||url.pathname!=='/')return respond(res,404,'Not found');
  if(testState.phase==='Passed')return page(res,'Webhook test passed','<p>Sandbox Buyer received Donator. The control account stayed unchanged.</p>');
  page(res,'AMQ Tours Sandbox checkout','<p>Pay $'+amount+' in PayPal Sandbox using a Sandbox Personal buyer. This applies to the disposable Sandbox Buyer account.</p><form method="post" action="/start"><input type="hidden" name="key" value="'+checkoutFormKey+'"><button>Continue to PayPal Sandbox</button></form><p><a href="/status">Test status</a></p>');
}
async function finish(){
  if(stopping)return;
  stopping=true;
  if(completedSubscription&&/^I-[A-Z0-9]+$/.test(completedSubscription)){
    await provider('/v1/billing/subscriptions/'+completedSubscription+'/cancel',{
      method:'POST',body:JSON.stringify({reason:'Completed AMQ Tours Sandbox verification'}),
    }).catch(()=>console.log('Test passed. The sandbox subscription still needs cancellation.'));
  }
  if(webhookId)await provider(events+'/'+webhookId,{method:'DELETE'}).catch(()=>console.log('The temporary Sandbox webhook still needs removal.'));
  webhookServer?.close();
  if(fixture)await fixture.dispose();
  if(testState.phase==='Passed')await delay(120_000);
  userServer?.close();
}
process.once('SIGINT',()=>void finish());
process.once('SIGTERM',()=>void finish());

try{
  const oauth=await fetch(paypal+'/v1/oauth2/token',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(12_000),
    headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials',
  });
  if(!oauth.ok)throw Error('PayPal Sandbox rejected the credentials (HTTP '+oauth.status+').');
  token=(await oauth.json()).access_token;
  if(!token)throw Error('PayPal Sandbox did not return an access token.');
  webhookServer=await listen(8798,webhook);
  userServer=await listen(8799,user);
  const probe=await fetch(requestUrl('/health-'+webhookRoute.split('/').at(-1)),{signal:AbortSignal.timeout(12_000)});
  if(!probe.ok||await probe.text()!=='ready')throw Error('The temporary PayPal-facing webhook tunnel did not reach this computer.');
  const hook=await provider(events,{
    method:'POST',body:JSON.stringify({url:requestUrl(webhookRoute),event_types:[{name:'PAYMENT.SALE.COMPLETED'}]}),
  });
  if(!/^[A-Z0-9]{6,40}$/.test(hook.id))throw Error('PayPal Sandbox did not return a webhook ID.');
  webhookId=hook.id;
  fixture=await playRuntimeFixture({paypal:{
    env:{PAYPAL_SANDBOX_ENABLED:'1',PAYPAL_SANDBOX_ORIGIN:origin,
      PAYPAL_SANDBOX_CLIENT_ID:clientId,PAYPAL_SANDBOX_CLIENT_SECRET:secret,PAYPAL_SANDBOX_WEBHOOK_ID:webhookId},
    send:async request=>{
      const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),
        body:request.method==='POST'?await request.arrayBuffer():undefined,redirect:'error',signal:AbortSignal.timeout(12_000)});
      if(!response.ok){
        const error=await response.clone().json().catch(()=>({}));
        const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(value);
        const issues=(Array.isArray(error.details)?error.details:[]).map(item=>item?.issue).filter(code);
        if(code(error.name))issues.unshift(error.name);
        console.log('Sandbox API '+request.method+' '+new URL(request.url).pathname.replace(/\/(?:I|P)-[A-Z0-9]+(?=\/|$)/g,'/[id]')+
          ' returned '+response.status+(issues.length?' ('+issues.join(', ')+')':''));
      }
      return response;
    },
  }});
  const createAccount=async (id,name)=>(await (await fixture.dispatchFetch(requestUrl('/api/__test-session?'+new URLSearchParams({id,name})))).json()).cookie;
  buyerCookie=await createAccount('79','Sandbox Buyer');
  controlCookie=await createAccount('80','Control Account');
  const [buyer,control]=await Promise.all([account(buyerCookie),account(controlCookie)]);
  if(buyer.active||control.active||buyer.id===control.id)throw Error('The isolated test accounts were not created correctly.');
  testState={phase:'Checkout ready',amountUsd:amount};
  console.log('Checkout ready at '+site+'/');
  console.log('Keep this window open until the webhook test result appears.');
}catch(error){
  console.error(error.message);
  process.exitCode=1;
  await finish();
}
