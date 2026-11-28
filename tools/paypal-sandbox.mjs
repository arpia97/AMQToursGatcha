import {pathToFileURL} from 'node:url';

const productsPath = '/v1/catalogs/products';
const plansPath = '/v1/billing/plans';
const product = {name:'AMQ Tours Donator', type:'DIGITAL'};
const paypalProductId = /^PROD-[A-Z0-9]{17}$/;
const planName = 'AMQ Tours Donator Monthly';
const amount = {currency_code:'USD', value:'1.00'};

export async function setupPayPalSandbox(credentials, send = fetch) {
  return setupMembership('sandbox', credentials, send);
}

async function setupMembership(environment, {clientId,clientSecret}, send = fetch) {
  const live=environment==='live';
  const prefix=live?'PAYPAL_LIVE':'PAYPAL_SANDBOX';
  const api=live?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  if (!clientId || !clientSecret) {
    throw Error('Set '+prefix+'_CLIENT_ID and '+prefix+'_CLIENT_SECRET locally.');
  }
  const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const oauth = await send(api + '/v1/oauth2/token', {
    method:'POST',
    headers:{Authorization:'Basic ' + credentials, 'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials',
    redirect:'error',
    signal:AbortSignal.timeout(15_000),
  });
  if (!oauth.ok) throw Error('PayPal sign-in returned HTTP ' + oauth.status + '. Check the app credentials.');
  const {access_token:token} = await oauth.json();
  if (!token) throw Error('PayPal did not return an access token.');

  async function request(path, body, requestId) {
    const response = await send(api + path, {
      method:body ? 'POST' : 'GET',
      headers:{
        Authorization:'Bearer ' + token,
        'Content-Type':'application/json',
        ...(body && {'PayPal-Request-Id':requestId, Prefer:'return=representation'}),
      },
      body:body && JSON.stringify(body),
      redirect:'error',
      signal:AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const code = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(value) ? value : '';
      const field = value => typeof value === 'string' && /^\/[a-z0-9_./-]{1,100}$/i.test(value) ? value : '';
      const details = Array.isArray(result?.details) ? result.details.slice(0, 5).map(detail =>
        [code(detail?.issue), field(detail?.field)].filter(Boolean).join(' ')) : [];
      const debugId = typeof result?.debug_id === 'string' && /^[a-f0-9]{8,32}$/i.test(result.debug_id)
        ? 'debug ID ' + result.debug_id : '';
      const diagnosis = [code(result?.name), ...details, debugId].filter(Boolean).join(', ');
      throw Error('PayPal returned HTTP ' + response.status + ' for ' + path.split('?')[0] +
        (diagnosis ? ' (' + diagnosis + ').' : '.'));
    }
    return response.json();
  }

  async function findByName(path, key, name, filters = {}) {
    const matches = [];
    let page = 1;
    for (;;) {
      const list = await request(path + '?' + new URLSearchParams({
        ...filters, page_size:'20', page:String(page), total_required:'true',
      }));
      const entries = list[key] ?? [];
      if (!Array.isArray(entries)) throw Error('PayPal returned an invalid ' + key + ' list.');
      matches.push(...entries.filter(item => item.name === name));
      const more = page < (list.total_pages ?? 1) || list.links?.some(link => link.rel === 'next');
      if (!more) break;
      page++;
    }
    if (matches.length > 1) throw Error('Multiple entries named "' + name + '" already exist.');
    return matches[0];
  }

  const existingProduct = await findByName(productsPath, 'products', product.name);
  const savedProduct = existingProduct ?? await request(productsPath, {
    ...product,
    description:'Digital supporter perks for a signed-in AMQ Tours account.',
  }, 'amqtours-'+environment+'-product-v2');
  const productId = savedProduct.id;
  if (!paypalProductId.test(productId)) throw Error('PayPal did not return a generated product ID.');
  const productDetails = await request(productsPath + '/' + productId);
  if (productDetails.name !== product.name || productDetails.type !== product.type) {
    throw Error('The PayPal product differs from the expected AMQ Tours Donator product.');
  }

  const existingPlan = await findByName(plansPath, 'plans', planName, {product_id:productId});
  const planRequestId = 'amq-plan1-' + productId;
  const savedPlan = existingPlan ?? await request(plansPath, {
    product_id:productId,
    name:planName,
    description:'AMQ Tours Donator membership. Renews monthly.',
    status:'ACTIVE',
    billing_cycles:[{
      frequency:{interval_unit:'MONTH', interval_count:1}, tenure_type:'REGULAR',
      sequence:1, total_cycles:0, pricing_scheme:{fixed_price:amount},
    }],
    payment_preferences:{auto_bill_outstanding:false, payment_failure_threshold:1},
    quantity_supported:false,
  }, planRequestId);
  if (!/^P-[A-Z0-9]+$/.test(savedPlan.id)) throw Error('PayPal did not return a valid plan ID.');
  const plan = await request(plansPath + '/' + savedPlan.id);
  const [cycle] = plan?.billing_cycles ?? [];
  const price = cycle?.pricing_scheme?.fixed_price;
  if (plan.id !== savedPlan.id || plan.product_id !== productId ||
      plan.status !== 'ACTIVE' || plan.billing_cycles?.length !== 1 ||
      cycle.tenure_type !== 'REGULAR' || cycle.total_cycles !== 0 ||
      cycle.frequency?.interval_unit !== 'MONTH' || cycle.frequency.interval_count !== 1 ||
      price?.currency_code !== amount.currency_code || !/^1(?:\.0{1,2})?$/.test(price.value) ||
      Number(plan.payment_preferences?.setup_fee?.value ?? 0) !== 0 ||
      Number(plan.taxes?.percentage ?? 0) !== 0 || plan.quantity_supported) {
    throw Error('The PayPal plan does not match the active USD $1 monthly membership.');
  }
  const result={environment,productId,planId:plan.id,monthlyUsd:amount.value};
  if(live){
    const url='https://amqtours.app/gacha/api/paypal-donator-webhook';
    const events=['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.REFUNDED',
      'PAYMENT.CAPTURE.REVERSED','PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'];
    const path='/v1/notifications/webhooks';
    const existing=(await request(path)).webhooks.find(h=>h.url===url);
    const hook=existing??await request(path,{url,event_types:events.map(name=>({name}))},'amqtours-live-webhook-v1');
    const names=new Set(hook.event_types.map(event=>event.name));
    if(!hook.id||hook.url!==url||(!names.has('*')&&!events.every(name=>names.has(name))))
      throw Error('Check the live webhook URL and subscribed events in PayPal. An existing webhook may need editing.');
    result.webhookId=hook.id;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const live=process.argv.includes('--live');
    const prefix=live?'PAYPAL_LIVE':'PAYPAL_SANDBOX';
    console.log(await setupMembership(live?'live':'sandbox',{
      clientId:process.env[prefix+'_CLIENT_ID'],
      clientSecret:process.env[prefix+'_CLIENT_SECRET'],
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
