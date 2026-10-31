import test from 'node:test';import assert from 'node:assert/strict';
import {publicTourHub} from '../src/public-tour-hub.js';
const env={TOUR_HOST_SERVICE_TOKEN:'test-service-secret'},base='https://play.test';
test('public hub proxies only allowlisted assets and draft routes; secrets and host cookies never reach the browser',async()=>{
  const token='a'.repeat(48);let seen;
  const fetcher=async(url,init)=>{seen={url,init};return Response.json({tours:[]},{headers:{'Set-Cookie':'private-cookie','OAI-Sites-Authorization':'secret'}});};
  const r=await publicTourHub(new Request(base+'/api/tour-hub',{headers:{Cookie:`amq_session=${token}; other=private`,'Authorization':'host-password'}}),env,fetcher);
  assert.equal(r.status,200);assert.ok(seen.url.endsWith('/api/public-tours'));assert.equal(seen.init.headers.get('Cookie'),'__Host-amq_host_session='+token);assert.equal(seen.init.headers.get('Authorization'),null);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('OAI-Sites-Authorization'),null);
  assert.equal((await publicTourHub(new Request(base+'/tours/portal/app.js'),env,fetcher)).status,404);
  assert.equal((await publicTourHub(new Request(base+'/api/tour-hub/host/blacklists'),env,fetcher)).status,404);
  assert.equal(await publicTourHub(new Request(base+'/api/account'),env,fetcher),null);
  await publicTourHub(new Request(base+'/tours/portal/styles.css',{headers:{Cookie:`amq_session=${token}`}}),env,fetcher);assert.equal(seen.init.headers.get('cookie'),null);
  await publicTourHub(new Request(base+'/tours/'),env,fetcher);assert.ok(seen.url.endsWith('/tour-hub/'),'Use the canonical directory URL to avoid an HTML asset redirect');
});
test('public hub blocks cross-origin/host writes, oversized bodies and service redirects',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json({ok:true});};
  const post=(body,origin=base)=>new Request(base+'/api/tour-hub/'+crypto.randomUUID(),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await publicTourHub(post({action:'pick'},'https://else.test'),env,fetcher)).status,403);
  assert.equal((await publicTourHub(post({action:'delete'}),env,fetcher)).status,403);
  assert.equal((await publicTourHub(post({action:'signup',name:'x'.repeat(20000)}),env,fetcher)).status,400);assert.equal(calls,0);
  assert.equal((await publicTourHub(post({action:'pick'}),env,fetcher)).status,200);
  assert.equal((await publicTourHub(new Request(base+'/api/tour-hub'),{},fetcher)).status,503);
  assert.equal((await publicTourHub(new Request(base+'/api/tour-hub'),env,async()=>Response.redirect('https://else.test'))).status,503);
});
