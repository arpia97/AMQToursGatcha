import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {Engine} from '../src/engine.js';
import {PayPalDonator,paypalEnabled,paypalSandboxEnabled} from '../src/paypal-donator.js';

const origin='http://localhost:8787';
const env={
  PAYPAL_SANDBOX_ENABLED:'1',PAYPAL_SANDBOX_ORIGIN:origin,
  PAYPAL_SANDBOX_CLIENT_ID:'sandbox-id',PAYPAL_SANDBOX_CLIENT_SECRET:'sandbox-secret',
  PAYPAL_SANDBOX_WEBHOOK_ID:'sandbox-webhook',
};
const planId='P-83748229JY806903DNME2JRI';
const id='I-SANDBOXPAYPAL';
const headers=new Headers({
  'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.sandbox.paypal.com/cert',
  'paypal-transmission-id':'transmission','paypal-transmission-sig':'signature','paypal-transmission-time':'2026-11-28T00:00:00Z',
});

const liveEnv={PAYPAL_LIVE_ENABLED:'1',PAYPAL_LIVE_CLIENT_ID:'live-test-id',PAYPAL_LIVE_CLIENT_SECRET:'live-test-secret',
  PAYPAL_LIVE_WEBHOOK_ID:'LIVE-WEBHOOK',PAYPAL_LIVE_PRODUCT_ID:'PROD-LIVE',PAYPAL_LIVE_PLAN_ID:'P-LIVE'};

test('production checkout requires all Live bindings and the official HTTPS origin',()=>{
  assert.equal(paypalEnabled(liveEnv,'https://amqtours.app'),true);
  for(const key of Object.keys(liveEnv))assert.equal(paypalEnabled({...liveEnv,[key]:''},'https://amqtours.app'),false);
  assert.equal(paypalEnabled({...env,...liveEnv},origin),false);
  assert.equal(paypalEnabled({...liveEnv,PAYPAL_LIVE_PLAN_ID:planId},'https://amqtours.app'),false);
});

for(const live of [false,true])test((live?'Live':'Sandbox')+' checkout binds a chosen monthly amount to the signed-in account, then honors verified payments and reversals',async t=>{
  const config=live?liveEnv:env;
  const site=live?'https://amqtours.app':origin;
  const expectedPlan=live?liveEnv.PAYPAL_LIVE_PLAN_ID:planId;
  const checkoutSite=live?'https://www.paypal.com':'https://www.sandbox.paypal.com';
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  let now=Date.UTC(2026,10,28),sub,status='APPROVAL_PENDING',payments=[],verified=true;
  const engine=new Engine((sql,...args)=>db.prepare(sql).all(...args),fn=>{
    db.exec('BEGIN');
    try{const result=fn();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  },()=>now);
  for(const player of ['buyer','visitor'])engine.run('INSERT INTO players(id,name) VALUES(?,?)',player,player);

  let creates=0,prepared;
  const paypal=new PayPalDonator(engine,config,async (url,request)=>{
    const remote=new URL(url);
    assert.equal(remote.origin,live?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com');
    const path=remote.pathname;
    if(path==='/v1/oauth2/token')return Response.json({access_token:'fixture-token',expires_in:300});
    if(path==='/v1/billing/plans/'+expectedPlan)return Response.json({
      id:expectedPlan,product_id:live?liveEnv.PAYPAL_LIVE_PRODUCT_ID:'PROD-77A51505TF950570P',status:'ACTIVE',billing_cycles:[{frequency:{interval_unit:'MONTH',interval_count:1},
        tenure_type:'REGULAR',total_cycles:0,pricing_scheme:{fixed_price:{currency_code:'USD',value:'1.00'}}}],
    });
    if(path==='/v1/billing/subscriptions') {
      creates++;
      prepared=JSON.parse(request.body);
      assert.equal(prepared.custom_id,request.headers['PayPal-Request-Id']);
      sub={id,custom_id:prepared.custom_id,plan_id:expectedPlan,links:[{rel:'approve',href:checkoutSite+'/webapps/billing/subscriptions?ba_token=fixture'}]};
      return Response.json({...sub,status});
    }
    if(path.endsWith('/verify-webhook-signature')) {
      assert.equal(JSON.parse(request.body).webhook_id,live?liveEnv.PAYPAL_LIVE_WEBHOOK_ID:env.PAYPAL_SANDBOX_WEBHOOK_ID);
      return Response.json({verification_status:verified?'SUCCESS':'FAILURE'});
    }
    if(path==='/v1/billing/subscriptions/'+id)return Response.json({...sub,status,billing_info:payments.length?{last_payment:{}}:{}});
    if(path.endsWith('/'+id+'/transactions'))return Response.json({transactions:payments});
    assert.fail(path);
  });
  const action=(name,player,body={},extra={})=>paypal.action({path:'paypal-donator-'+name,
    session:player?{player}:null,origin:site,headers,body,...extra});
  const sale=(id,amount='3.75',currency='USD')=>({id,time:new Date(now).toISOString(),status:'COMPLETED',
    amount_with_breakdown:{gross_amount:{value:amount,currency_code:currency}}});
  const completed=idForSale=>({event_type:'PAYMENT.SALE.COMPLETED',resource:{id:idForSale,billing_agreement_id:id}});
  assert.equal(paypalSandboxEnabled({...env,PAYPAL_SANDBOX_ORIGIN:'https://amqtours.app'},'https://amqtours.app'),false);
  await assert.rejects(action('start',null,{amount:'3.75'}),err=>err.status===401);
  for(const amount of ['0.99','1.001','1e2',3.75])await assert.rejects(action('start','buyer',{amount}),/at least/);
  const checkout=await action('start','buyer',{amount:'3.75',plan_id:'untrusted',player:'visitor'});
  assert.equal(prepared.plan_id,expectedPlan);
  assert.match(prepared.custom_id,/^[0-9a-f-]{36}$/);
  assert.equal(prepared.plan.billing_cycles[0].pricing_scheme.fixed_price.value,'3.75');
  assert.equal(checkout.amount,'3.75');
  await assert.rejects(action('start','buyer',{amount:'6.00'}),err=>err.status===409);
  assert.equal((await action('start','buyer',{amount:'3.75'})).amount,'3.75');
  assert.equal(creates,1);
  status='ACTIVE';
  assert.equal((await action('sync','buyer')).active,false);
  payments=[sale('WRONG-AMOUNT','1.00'),sale('WRONG-CURRENCY','3.75','EUR')];
  assert.equal((await action('sync','buyer')).active,false);
  payments.push(sale('FIRST-PAYMENT'));
  await assert.rejects(action('webhook',null,completed('FIRST-PAYMENT'),{headers:new Headers()}),err=>err.status===400);
  verified=false;
  await assert.rejects(action('webhook',null,completed('FIRST-PAYMENT')),err=>err.status===403);
  assert.equal(engine.player('buyer').donator,false);
  assert.equal((await action('sync','visitor',{subscription:id})).active,false);
  verified=true;
  assert.equal((await action('sync','buyer')).active,true);
  assert.equal(engine.publicRoles().buyer,'Donator');
  const first=engine.player('buyer').donator_until;
  await action('webhook',null,completed('FIRST-PAYMENT'));
  assert.equal(engine.player('buyer').donator_until,first);

  now=Date.UTC(2026,11,28);
  payments.push(sale('RENEWAL'));
  await action('webhook',null,completed('RENEWAL'));
  const renewed=engine.player('buyer').donator_until;
  assert.equal(renewed,Date.UTC(2027,0,28));
  assert.equal(engine.player('visitor').donator,false);
  status='CANCELLED';
  assert.equal((await action('sync','buyer')).expires,renewed);

  await action('webhook',null,{event_type:'PAYMENT.SALE.REFUNDED',resource:{sale_id:'RENEWAL'}});
  await action('webhook',null,completed('RENEWAL'));
  assert.equal(engine.player('buyer').donator_until,first);
  assert.equal(engine.player('buyer').donator,false);
});


test('PayPal sandbox is reachable only through the preview account routes',async t=>{
  const {playRuntimeFixture}=await import('./play-runtime-fixture.mjs');
  const origin='http://localhost:8787';
  let remoteRequests=0,reference;
  const fixture=await playRuntimeFixture({paypal:{env,async send(request){
    remoteRequests++;
    const path=new URL(request.url).pathname;
    if(path.endsWith('/token'))return Response.json({access_token:'fixture-token',expires_in:300});
    if(path.endsWith(planId))return Response.json({
      id:planId,product_id:'PROD-77A51505TF950570P',status:'ACTIVE',
      billing_cycles:[{frequency:{interval_unit:'MONTH',interval_count:1},tenure_type:'REGULAR',total_cycles:0,
        pricing_scheme:{fixed_price:{currency_code:'USD',value:'1.00'}}}],
    });
    if(path.endsWith('/subscriptions')){
      const body=await request.json();
      reference=body.custom_id;
      assert.equal(body.plan.billing_cycles[0].pricing_scheme.fixed_price.value,'1.25');
      return Response.json({id,plan_id:planId,custom_id:reference,status:'APPROVAL_PENDING',
        links:[{rel:'approve',href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions'}]});
    }
    if(path.endsWith('/verify-webhook-signature'))return Response.json({verification_status:'SUCCESS'});
    if(path.endsWith('/transactions'))return Response.json({transactions:[{
      id:'FIXTURE-SALE',status:'COMPLETED',time:new Date(Date.now()-1000).toISOString(),
      amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'1.25'}},
    }]});
    if(path.endsWith('/'+id))return Response.json({id,plan_id:planId,custom_id:reference,status:'ACTIVE'});
    assert.fail(path);
  }}});
  t.after(()=>fixture.dispose());
  const fetchLocal=(path,options)=>fixture.dispatchFetch(origin+'/api/'+path,options);
  const registered=await fetchLocal('__test-session?id=1');
  const {cookie}=await registered.json();
  const account=await (await fetchLocal('play-state',{headers:{Cookie:cookie}})).json();
  assert.equal(account.donatorCheckout,true);
  const gachaAccount=await (await fetchLocal('state?view=compact',{headers:{Cookie:cookie}})).json();
  assert.equal(gachaAccount.donatorCheckout,true);
  const guest=await (await fetchLocal('state?view=compact')).json();
  assert.equal(guest.donatorCheckout,false);
  const request=(path,body,extra={})=>fetchLocal(path,{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body),
  });
  const unsigned=await request('paypal-donator-start',{amount:'1.00'});
  assert.equal(unsigned.status,401);
  const badPrice=await request('paypal-donator-start',{amount:'0.99'},{Cookie:cookie});
  assert.equal(badPrice.status,400);
  const spoofed=await request('paypal-donator-start',{amount:'1.00'},{Cookie:cookie,Origin:'https://elsewhere.invalid'});
  assert.equal(spoofed.status,403);
  const sync=await request('paypal-donator-sync',{subscription:'I-UNTRUSTED'},{Cookie:cookie});
  assert.equal(sync.status,200);
  assert.deepEqual(await sync.json(),{active:false,expires:0,linked:false});
  const webhook=await request('paypal-donator-webhook',{event_type:'PAYMENT.SALE.COMPLETED',resource:{}});
  assert.equal(webhook.status,400);
  assert.equal(remoteRequests,0);

  const checkout=await request('paypal-donator-start',{amount:'1.25'},{Cookie:cookie});
  assert.equal(checkout.status,200,await checkout.clone().text());
  const other=(await (await fetchLocal('__test-session?id=2')).json()).cookie;
  const delivery=await request('paypal-donator-webhook',{
    event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'FIXTURE-SALE',billing_agreement_id:id},
  },Object.fromEntries(headers));
  assert.equal(delivery.status,200,await delivery.clone().text());
  const donator=async Cookie=>(await (await fetchLocal('play-state',{headers:{Cookie}})).json()).me.donator;
  assert.equal(await donator(cookie),true);
  assert.equal(await donator(other),false);
});

for(const live of [false,true])test((live?'Live':'Sandbox')+' one-time PayPal order grants one month to the account that started it',async t=>{
  const {playRuntimeFixture}=await import('./play-runtime-fixture.mjs');
  const origin=live?'https://amqtours.app':env.PAYPAL_SANDBOX_ORIGIN;
  const checkoutId='ORDERPASS123456';
  const abandonedId='ABANDONED123456';
  const captureId='CAPTUREPASS123';
  let order, abandoned, capture, charges=0, verification=true;
  const runtime=await playRuntimeFixture({paypal:{env:live?liveEnv:env,async send(request){
    assert.equal(new URL(request.url).origin,live?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com');
    const path=new URL(request.url).pathname;
    if(path.endsWith('/token'))return Response.json({access_token:'fixture-token',expires_in:300});
    if(path.endsWith('/verify-webhook-signature'))return Response.json({verification_status:verification?'SUCCESS':'FAILURE'});
    if(path==='/v2/checkout/orders'){
      const body=await request.json();
      assert.equal(body.intent,'CAPTURE');
      const amount=abandoned?'6.25':'2.00';
      assert.deepEqual(body.purchase_units[0].amount,{value:amount,currency_code:'USD'});
      assert.match(body.purchase_units[0].custom_id,/^[0-9a-f-]{36}$/);
      assert.equal(body.payment_source.paypal.experience_context.user_action,'PAY_NOW');
      assert.equal(body.payment_source.paypal.experience_context.return_url,origin+'/play/overview?donator=pass-return');
      const id=abandoned?checkoutId:abandonedId;
      const created={...body,id,status:'PAYER_ACTION_REQUIRED',
        links:[{rel:'payer-action',href:(live?'https://www.paypal.com':'https://www.sandbox.paypal.com')+'/checkoutnow?token='+id}]};
      if(abandoned)order=created;
      else abandoned=created;
      return Response.json(created,{status:201});
    }
    if(path==='/v2/checkout/orders/'+checkoutId+'/capture'){
      assert.match(request.headers.get('PayPal-Request-Id'),/^cap-[a-f0-9]{32}$/);
      assert.equal(order.status,'APPROVED');
      charges++;
      capture={id:captureId,status:'PENDING',create_time:new Date().toISOString(),amount:{currency_code:'USD',value:'6.25'}};
      order.purchase_units[0].payments={captures:[capture]};
      order.status='COMPLETED';
      // The payment is recorded at PayPal even if the merchant loses this response.
      return Response.json({name:'INTERNAL_SERVER_ERROR'},{status:500});
    }
    if(path==='/v2/checkout/orders/'+checkoutId)return Response.json(order);
    if(path==='/v2/checkout/orders/'+abandonedId)return Response.json(abandoned);
    assert.fail(path);
  }}});
  t.after(()=>runtime.dispose());
  const endpoint=path=>origin+'/api/'+path;
  const session=async id=>(await (await runtime.dispatchFetch(endpoint('__test-session?id='+id))).json()).cookie;
  const buyer=await session(11), control=await session(12);
  const send=(path,body,extra)=>runtime.dispatchFetch(endpoint('paypal-donator-'+path),{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body),
  });
  const status=async Cookie=>(await (await runtime.dispatchFetch(endpoint('play-state'),{headers:{Cookie}})).json()).me;
  const event=(event_type,resource)=>send('webhook',{event_type,resource},Object.fromEntries(headers));

  const low=await send('start',{kind:'pass',amount:'0.99'},{Cookie:buyer});
  assert.equal(low.status,400);
  const original=await send('start',{kind:'pass',amount:'2.00'},{Cookie:buyer});
  assert.equal(original.status,200);
  const start=await send('start',{kind:'pass',amount:'6.25',player:'12'},{Cookie:buyer});
  assert.equal(start.status,200,await start.clone().text());
  assert.equal((await start.json()).amount,'6.25');
  const resume=await send('start',{kind:'pass',amount:'6.25'},{Cookie:buyer});
  assert.equal(resume.status,200);
  abandoned.status='APPROVED';
  assert.equal((await event('CHECKOUT.ORDER.APPROVED',{id:abandonedId})).status,200);
  assert.equal(charges,0);
  // An approval notification can arrive before the Orders API reflects it.
  assert.equal((await event('CHECKOUT.ORDER.APPROVED',{id:checkoutId})).status,503);
  assert.equal(charges,0);
  order.status='APPROVED';
  const wrong=await send('sync',{kind:'pass',order:checkoutId},{Cookie:control});
  assert.deepEqual(await wrong.json(),{active:false,expires:0,linked:false});
  verification=false;
  assert.equal((await event('CHECKOUT.ORDER.APPROVED',{id:checkoutId})).status,403);
  assert.equal(charges,0);
  verification=true;
  const approval=await event('CHECKOUT.ORDER.APPROVED',{id:checkoutId});
  assert.equal(approval.status,200,await approval.clone().text());
  assert.equal(charges,1);
  assert.equal((await status(buyer)).donator,false);
  capture.status='COMPLETED';
  const settlement={id:captureId,supplementary_data:{related_ids:{order_id:checkoutId}}};
  assert.equal((await event('PAYMENT.CAPTURE.COMPLETED',settlement)).status,200);
  const entitlement=await status(buyer);
  assert.equal(entitlement.donator,true);
  const paid=new Date(capture.create_time), month=new Date(paid);
  month.setUTCMonth(month.getUTCMonth()+1,1);
  const days=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
  month.setUTCDate(Math.min(paid.getUTCDate(),days));
  assert.equal(entitlement.donator_until,month.getTime());
  assert.equal((await status(control)).donator,false);
  assert.equal((await event('PAYMENT.CAPTURE.COMPLETED',settlement)).status,200);
  assert.equal((await send('sync',{kind:'pass',order:checkoutId},{Cookie:buyer})).status,200);
  assert.equal((await status(buyer)).donator_until,entitlement.donator_until);
  assert.equal(charges,1);
  assert.equal((await event('PAYMENT.CAPTURE.REFUNDED',{
    links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/'+captureId}],
  })).status,200);
  assert.equal((await event('PAYMENT.CAPTURE.COMPLETED',settlement)).status,200);
  assert.equal((await status(buyer)).donator,false);
});
