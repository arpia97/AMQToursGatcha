import {fail} from './engine.js';

const liveOrigin = 'https://amqtours.app';
const plans = '/v1/billing/plans/';
const subscriptions = '/v1/billing/subscriptions';
const orders = '/v2/checkout/orders';
const sandboxPlan = 'P-83748229JY806903DNME2JRI';
const sandboxProduct = 'PROD-77A51505TF950570P';
const subId = /^I-[A-Z0-9]{6,40}$/;
const validSale = value => typeof value==='string' && /^[A-Z0-9-]{3,50}$/i.test(value);
const day = 86_400_000;
const closedStates = new Set(['CANCELLED','EXPIRED']);
const passEvents = new Set([
  'CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED',
]);
const paymentEvents = new Set(['PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED',...passEvents]);
const signatureFields = ['auth_algo','cert_url','transmission_id','transmission_sig','transmission_time'];

export function paypalSandboxEnabled(env,origin) {
  if (env.PAYPAL_SANDBOX_ENABLED!=='1' || !env.PAYPAL_SANDBOX_CLIENT_ID || !env.PAYPAL_SANDBOX_CLIENT_SECRET ||
      env.PAYPAL_SANDBOX_ORIGIN!==origin) return false;
  const url=new URL(origin);
  return url.hostname!=='amqtours.app' && !url.hostname.endsWith('.amqtours.app') &&
    (url.protocol==='https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
}

export function paypalEnabled(env, origin) {
  if (env.PAYPAL_LIVE_ENABLED !== '1') return paypalSandboxEnabled(env,origin);
  return origin===liveOrigin && Boolean(env.PAYPAL_LIVE_CLIENT_ID && env.PAYPAL_LIVE_CLIENT_SECRET &&
    env.PAYPAL_LIVE_WEBHOOK_ID && env.PAYPAL_LIVE_PRODUCT_ID && env.PAYPAL_LIVE_PLAN_ID &&
    env.PAYPAL_LIVE_PRODUCT_ID!==sandboxProduct && env.PAYPAL_LIVE_PLAN_ID!==sandboxPlan);
}

function cents(value) {
  if (typeof value !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return 0;
  const [whole,fraction=''] = value.split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}

function nextMonth(at) {
  const end = new Date(at);
  const date = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth()+2,0);
  end.setUTCDate(Math.min(date,end.getUTCDate()));
  return end.getTime();
}

function approvedUrl(checkout, approvalOrigin) {
  const value = checkout.links?.find(link => link.rel==='approve'||link.rel==='payer-action')?.href;
  if (typeof value !== 'string') fail('PayPal did not return an approval page.',502);
  const url = new URL(value);
  if (url.origin !== approvalOrigin || url.username || url.password) {
    fail('PayPal returned an unexpected approval page.',502);
  }
  return url.href;
}

export class PayPalDonator {
  constructor(engine,env,send=(url,options)=>fetch(url,options)) {
    this.e=engine;
    this.env=env;
    this.send=send;
    const live=env.PAYPAL_LIVE_ENABLED==='1';
    this.api=live?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
    this.approvalOrigin=live?'https://www.paypal.com':'https://www.sandbox.paypal.com';
    this.plan=live?env.PAYPAL_LIVE_PLAN_ID:sandboxPlan;
    this.product=live?env.PAYPAL_LIVE_PRODUCT_ID:sandboxProduct;
    this.clientId=live?env.PAYPAL_LIVE_CLIENT_ID:env.PAYPAL_SANDBOX_CLIENT_ID;
    this.secret=live?env.PAYPAL_LIVE_CLIENT_SECRET:env.PAYPAL_SANDBOX_CLIENT_SECRET;
    this.webhookId=live?env.PAYPAL_LIVE_WEBHOOK_ID:env.PAYPAL_SANDBOX_WEBHOOK_ID;
  }

  async request(path,body,requestId) {
    const now=Date.now();
    if (!(this.oauth?.expires>now)) {
      const result=await this.fetchJson('/v1/oauth2/token',{
        method:'POST',headers:{Authorization:'Basic '+btoa(this.clientId+':'+this.secret),'Content-Type':'application/x-www-form-urlencoded'},
        body:'grant_type=client_credentials',
      });
      if (!result.access_token) fail('PayPal authentication failed.',502);
      this.oauth={token:result.access_token,expires:now+Math.max(0,Number(result.expires_in||0)-60)*1000};
    }
    return this.fetchJson(path,{
      method:body?'POST':'GET',
      headers:{
        Authorization:'Bearer '+this.oauth.token,'Content-Type':'application/json',
        ...(requestId?{'PayPal-Request-Id':requestId,Prefer:'return=representation'}:{}),
      },
      body:body&&JSON.stringify(body),
    });
  }

  async fetchJson(path,options) {
    const response=await this.send(this.api+path,{...options,redirect:'manual',signal:AbortSignal.timeout(8_000)});
    if(!response.ok)throw Object.assign(Error('PayPal request failed (HTTP '+response.status+').'),
      {status:502,paypalStatus:response.status});
    return response.json();
  }

  link(player,kind='monthly') {
    return this.e.one('SELECT * FROM paypal_donator_links WHERE player=? AND kind=? ORDER BY created DESC, rowid DESC LIMIT 1',player,kind);
  }

  openCheckout(player,kind,amount) {
    const {e}=this;
    return e.tx(()=>{
      const previous=this.link(player,kind);
      if (previous && !previous.closed) return previous;
      const ref=crypto.randomUUID(),now=e.now();
      e.run('INSERT INTO paypal_donator_links(ref,player,kind,cents,created) VALUES(?,?,?,?,?)',ref,player,kind,amount,now);
      return this.link(player,kind);
    });
  }

  async subscription(link) {
    const sub=await this.request(subscriptions+'/'+link.subscription);
    if (sub.id!==link.subscription || sub.custom_id!==link.ref || sub.plan_id!==this.plan) {
      fail('PayPal returned a subscription outside this account link.',502);
    }
    return sub;
  }

  async start(player,amount,origin) {
    const {e}=this;
    let link=this.link(player);
    if (link?.subscription && !link.closed) {
      const current=await this.subscription(link);
      if (!closedStates.has(current.status)) {
        if (current.status==='APPROVAL_PENDING' && link.approval) {
          if(link.cents!==amount)fail('A $'+(link.cents/100).toFixed(2)+' monthly checkout is pending. Resume that amount or cancel it in PayPal.',409);
          return {approval:link.approval,amount:(link.cents/100).toFixed(2)};
        }
        fail('This account already has a PayPal subscription. Manage it in PayPal.',409);
      }
      e.run('UPDATE paypal_donator_links SET closed=1 WHERE ref=?',link.ref);
    }
    // A persistent request ID makes retries and concurrent taps reuse the same checkout.
    link=this.openCheckout(player,'monthly',amount);
    if(link.cents!==amount)fail('Another monthly checkout amount is pending for this account.',409);
    if (link.subscription) {
      if (link.approval) return {approval:link.approval,amount:(link.cents/100).toFixed(2)};
      fail('This account already has a PayPal subscription.',409);
    }
    if (e.now()-link.created>=72*60*60*1000) fail('The incomplete PayPal setup needs host review.',409);
    const plan=await this.request(plans+this.plan);
    const [cycle]=plan.billing_cycles??[];
    if (plan.id!==this.plan || plan.product_id!==this.product || plan.status!=='ACTIVE' ||
        plan.quantity_supported===true || plan.billing_cycles?.length!==1 ||
        cycle?.frequency?.interval_unit!=='MONTH' || cycle.frequency.interval_count!==1 ||
        cycle.tenure_type!=='REGULAR' || cycle.total_cycles!==0 ||
        cycle.pricing_scheme?.fixed_price?.currency_code!=='USD' ||
        cents(cycle.pricing_scheme.fixed_price.value)!==100 ||
        Number(plan.payment_preferences?.setup_fee?.value??0)!==0 || Number(plan.taxes?.percentage??0)!==0) {
      fail('The configured PayPal plan does not match the monthly offer.',502);
    }
    const amountUsd=(link.cents/100).toFixed(2);
    const sub=await this.request(subscriptions,{
      plan_id:this.plan,
      custom_id:link.ref,
      ...(link.cents===100?{}:{plan:{billing_cycles:[{
        sequence:1,pricing_scheme:{fixed_price:{value:amountUsd,currency_code:'USD'}},
      }]}}),
      application_context:{
        brand_name:'AMQ Tours',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',
        return_url:origin+'/play/overview?donator=return',cancel_url:origin+'/play/overview?donator=cancel',
      },
    },link.ref);
    if (!subId.test(sub.id) || sub.plan_id!==this.plan || sub.custom_id!==link.ref ||
        sub.status!=='APPROVAL_PENDING') fail('PayPal did not confirm this checkout.',502);
    const approval=approvedUrl(sub,this.approvalOrigin);
    e.run('UPDATE paypal_donator_links SET subscription=?,approval=? WHERE ref=? AND subscription IS NULL',sub.id,approval,link.ref);
    return {approval,amount:amountUsd};
  }

  async startPass(player,amount,origin) {
    const {e}=this;
    let link=this.link(player,'pass');
    if (link && !link.closed) {
      // An amount change can replace an unapproved order. A pending create
      // keeps its request ID for PayPal's six-hour idempotency window.
      const expired=e.now()-link.created>=6*60*60*1000;
      if (link.order_id && (expired || link.cents!==amount)) {
        const order=await this.readPassOrder(link).catch(error=>{
          if (!expired || error.paypalStatus!==404) throw error;
        });
        const canReplace=!order || ['CREATED','SAVED','PAYER_ACTION_REQUIRED','VOIDED'].includes(order.status);
        if (canReplace) {
          e.run('UPDATE paypal_donator_links SET closed=1,approval=NULL WHERE ref=? AND approval IS NOT NULL',link.ref);
        }
      } else if (!link.order_id && expired) {
        e.run('UPDATE paypal_donator_links SET closed=1 WHERE ref=? AND order_id IS NULL',link.ref);
      }
    }
    link=this.openCheckout(player,'pass',amount);
    const amountUsd=(link.cents/100).toFixed(2);
    if (link.cents!==amount) fail('There is a $'+amountUsd+' pass checkout in progress. Resume it or check its payment status.',409);
    if (link.order_id) {
      if (link.approval) return {approval:link.approval,amount:amountUsd};
      fail('Check the status of your current PayPal pass payment.',409);
    }
    const order=await this.request(orders,{
      intent:'CAPTURE',
      purchase_units:[{custom_id:link.ref,description:'AMQ Tours Donator · one month',
        amount:{currency_code:'USD',value:amountUsd}}],
      payment_source:{paypal:{experience_context:{
        brand_name:'AMQ Tours',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',
        return_url:origin+'/play/overview?donator=pass-return',cancel_url:origin+'/play/overview?donator=pass-cancel',
      }}},
    },link.ref);
    if (!validSale(order.id) || !['CREATED','PAYER_ACTION_REQUIRED'].includes(order.status)) {
      fail('PayPal did not confirm this pass checkout.',502);
    }
    const approval=approvedUrl(order,this.approvalOrigin);
    e.run('UPDATE paypal_donator_links SET order_id=?,approval=? WHERE ref=? AND order_id IS NULL AND closed=0',order.id,approval,link.ref);
    const current=e.one('SELECT order_id,closed FROM paypal_donator_links WHERE ref=?',link.ref);
    if (current?.closed || current?.order_id!==order.id) fail('This PayPal checkout was replaced. Start again.',409);
    return {approval,amount:amountUsd};
  }

  async readPassOrder(link) {
    const order=await this.request(orders+'/'+link.order_id);
    const [unit]=order.purchase_units??[];
    if (order.id!==link.order_id || order.intent!=='CAPTURE' || order.purchase_units?.length!==1 ||
        unit?.custom_id!==link.ref || unit.amount?.currency_code!=='USD' || cents(unit.amount.value)!==link.cents) {
      fail('PayPal returned an order outside this account link or amount.',502);
    }
    return order;
  }

  async syncPass(link,{expectedCapture='',approved=false}={}) {
    const {e}=this;
    let order=await this.readPassOrder(link);
    if (approved && !['APPROVED','COMPLETED','VOIDED'].includes(order.status)) {
      fail('PayPal is still confirming the pass approval.',503);
    }
    if (order.status==='APPROVED' && !expectedCapture) {
      // PayPal must have approved the exact order before any funds are captured.
      // Re-read after a failed capture response in case it completed concurrently.
      const current=e.one('SELECT closed FROM paypal_donator_links WHERE ref=?',link.ref);
      if (!current || current.closed) return;
      // Do this before yielding so a new amount cannot replace an order being captured.
      e.run('UPDATE paypal_donator_links SET approval=NULL WHERE ref=?',link.ref);
      try {
        await this.request(orders+'/'+link.order_id+'/capture',{},'cap-'+link.ref.replaceAll('-',''));
      } catch(error) {
        order=await this.readPassOrder(link);
        if (order.status!=='COMPLETED') throw error;
      }
      if (order.status!=='COMPLETED') order=await this.readPassOrder(link);
      if (order.status!=='COMPLETED') fail('PayPal is still processing the pass capture.',503);
    }
    if (expectedCapture && order.status!=='COMPLETED') fail('PayPal is still confirming the pass payment.',503);
    const captures=order.purchase_units[0].payments?.captures??[];
    const [capture]=captures;
    if (order.status==='COMPLETED' && captures.length>1) fail('The PayPal pass order has an unexpected number of captures.',502);
    if (expectedCapture && capture?.id!==expectedCapture) fail('PayPal is still confirming the pass payment.',503);
    const terminal=['DECLINED','FAILED','REFUNDED','PARTIALLY_REFUNDED','REVERSED'];
    const refunded=['REFUNDED','PARTIALLY_REFUNDED','REVERSED'].includes(capture?.status);
    const paid=Date.parse(capture?.create_time);
    const completed=order.status==='COMPLETED' && capture?.status==='COMPLETED';
    if (expectedCapture && !completed && !terminal.includes(capture?.status)) fail('PayPal is still confirming the pass payment.',503);
    if (completed && (!validSale(capture.id) || capture.amount?.currency_code!=='USD' ||
        cents(capture.amount.value)!==link.cents || !Number.isFinite(paid) || paid<link.created-60_000 || paid>e.now()+60_000)) {
      fail('The PayPal capture did not match the one-time pass.',502);
    }
    e.tx(()=>{
      if (refunded && validSale(capture.id)) this.revoke('capture:'+capture.id);
      if (completed) {
        e.run('INSERT OR IGNORE INTO paypal_donator_sales(sale,link,expires,revoked) VALUES(?,?,?,0)',
          'capture:'+capture.id,link.ref,nextMonth(paid));
      }
      if (completed || order.status==='VOIDED' || terminal.includes(capture?.status)) {
        e.run('UPDATE paypal_donator_links SET closed=1,approval=NULL WHERE ref=?',link.ref);
      } else if (order.status==='COMPLETED') {
        e.run('UPDATE paypal_donator_links SET approval=NULL WHERE ref=?',link.ref);
      }
    });
  }

  async sync(link,expectedSale='') {
    const {e}=this;
    const sub=await this.subscription(link);
    if (closedStates.has(sub.status)) e.run('UPDATE paypal_donator_links SET closed=1 WHERE ref=?',link.ref);
    if (sub.status!=='APPROVAL_PENDING') e.run('UPDATE paypal_donator_links SET approval=NULL WHERE ref=?',link.ref);
    if (!sub.billing_info?.last_payment && !expectedSale) return;
    const now=e.now();
    const params=new URLSearchParams({
      start_time:new Date(now-40*day).toISOString(),
      end_time:new Date(now).toISOString(),
    });
    const result=await this.request(subscriptions+'/'+link.subscription+'/transactions?'+params);
    const payments=result.transactions??[];
    if (expectedSale && !payments.some(payment=>payment.id===expectedSale && payment.status!=='PENDING')) {
      fail('The PayPal payment is still being verified.',503);
    }
    e.tx(()=>{
      for (const payment of payments) {
        if (!validSale(payment.id)) continue;
        if (['REFUNDED','PARTIALLY_REFUNDED','REVERSED'].includes(payment.status)) {
          this.revoke(payment.id);
          continue;
        }
        const gross=payment.amount_with_breakdown?.gross_amount;
        const paid=Date.parse(payment.time);
        if (payment.status!=='COMPLETED' || gross?.currency_code!=='USD' || cents(gross.value)!==link.cents ||
            !Number.isFinite(paid) || paid>now || paid<now-40*day) continue;
        e.run('INSERT OR IGNORE INTO paypal_donator_sales(sale,link,expires,revoked) VALUES(?,?,?,0)',
          payment.id,link.ref,nextMonth(paid));
      }
    });
  }

  revoke(id) {
    this.e.run(`INSERT INTO paypal_donator_sales(sale,link,expires,revoked) VALUES(?,NULL,0,1)
      ON CONFLICT(sale) DO UPDATE SET revoked=1`,id);
  }

  async webhook(headers,event) {
    if (!paymentEvents.has(event.event_type)) return;
    const signature=Object.fromEntries(signatureFields.map(field=>[field,headers.get('paypal-'+field.replaceAll('_','-'))]));
    if (!Object.values(signature).every(Boolean)) fail('PayPal signature headers are required.',400);
    const verified=await this.request('/v1/notifications/verify-webhook-signature',{
      ...signature,webhook_id:this.webhookId,webhook_event:event,
    });
    if (verified.verification_status!=='SUCCESS') fail('PayPal webhook signature rejected.',403);
    const resource=event.resource??{};
    if (passEvents.has(event.event_type)) {
      const related=resource.supplementary_data?.related_ids;
      const upstream=resource.links?.find(link=>link.rel==='up')?.href;
      if (event.event_type==='PAYMENT.CAPTURE.REFUNDED'||event.event_type==='PAYMENT.CAPTURE.REVERSED') {
        const capture=related?.capture_id??upstream?.match(/\/v2\/payments\/captures\/([A-Z0-9-]+)$/i)?.[1]??
          (event.event_type==='PAYMENT.CAPTURE.REVERSED'?resource.id:null);
        if (validSale(capture)) this.revoke('capture:'+capture);
        return;
      }
      const approved=event.event_type==='CHECKOUT.ORDER.APPROVED';
      const order=approved?resource.id:related?.order_id??upstream?.match(/\/v2\/checkout\/orders\/([A-Z0-9-]+)$/i)?.[1];
      if (!validSale(order) || (!approved&&!validSale(resource.id))) return;
      const link=this.e.one('SELECT * FROM paypal_donator_links WHERE order_id=?',order);
      if (link && (!approved||!link.closed)) await this.syncPass(link,{approved,expectedCapture:approved?'':resource.id});
      return;
    }
    if (event.event_type==='PAYMENT.SALE.COMPLETED') {
      if (!subId.test(resource.billing_agreement_id) || !validSale(resource.id)) return;
      const link=this.e.one('SELECT * FROM paypal_donator_links WHERE subscription=?',resource.billing_agreement_id);
      if (link) await this.sync(link,resource.id);
      return;
    }
    const linkSale=resource.links?.find(link=>link.rel==='sale')?.href?.match(/\/v1\/payments\/sale\/([A-Z0-9-]+)$/i)?.[1];
    const refunded=resource.sale_id??linkSale??(event.event_type==='PAYMENT.SALE.REVERSED'?resource.id:null);
    if (validSale(refunded??'')) this.revoke(refunded);
  }

  async action({path,session,body,headers,origin}) {
    if (!paypalEnabled(this.env,origin)) fail('Donator checkout is unavailable.',404);
    if (path==='paypal-donator-webhook') {
      if (!this.webhookId) fail('PayPal webhooks are unavailable.',404);
      await this.webhook(headers,body);
      return {ok:true};
    }
    if (!session) fail('Sign in to your AMQ Tours account first.',401);
    this.e.assertAccountUnlocked(session.player);
    const kind=body.kind??'monthly';
    if (!['pass','monthly'].includes(kind)) fail('Choose a Donator payment type.');
    if (path==='paypal-donator-start') {
      const amount=cents(body.amount);
      if (amount<100 || amount>100_000_000) fail('Enter an amount of at least $1 USD with up to two decimal places.');
      return kind==='pass'?this.startPass(session.player,amount,origin):this.start(session.player,amount,origin);
    }
    const link=kind==='pass'&&body.order!==undefined
      ? this.e.one('SELECT * FROM paypal_donator_links WHERE player=? AND order_id=?',session.player,validSale(body.order)?body.order:'')
      : this.link(session.player,kind);
    if (link?.order_id) await this.syncPass(link);
    if (link?.subscription) await this.sync(link);
    const me=this.e.player(session.player);
    return {active:me.donator,expires:me.donator_until,linked:!!(link?.subscription||link?.order_id)};
  }
}
