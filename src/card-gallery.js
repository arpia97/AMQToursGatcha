import {fail,randomInt} from './engine.js';
import {MAX_CARD_LEVEL} from '../public/card-values.js';
import {sourcePortrait} from '../public/mal-portraits.js';

const portraitRollCost = alternatives => 500 * (alternatives + 1);

export function refundPortraitOverpayments(e){
  const key='portrait-roll-pricing-v2';
  if(e.one('SELECT 1 FROM settings WHERE key=?',key))return;
  e.tx(()=>{
    if(e.one('SELECT 1 FROM settings WHERE key=?',key))return;
    // Legacy rolls saved the quote and owned image count (including the original).
    const rolls=e.all(`SELECT p.id,r.input FROM players p CROSS JOIN receipts r
      WHERE r.scope=p.id||':card-gallery' AND json_extract(r.input,'$.action')='roll'
      AND json_type(r.result,'$.unlocked')='text'`);
    for(const roll of rolls){
      const {price,owned}=JSON.parse(roll.input);
      const refund=price-portraitRollCost(Math.max(0,owned-1));
      if(Number.isSafeInteger(refund)&&refund>0)e.wallet(roll.id,refund,'Alternative image roll price refund');
    }
    e.run('INSERT INTO settings(key,value) VALUES(?,?)',key,e.now());
  });
}

export function installCardGallery(e){
  e.run('CREATE TABLE IF NOT EXISTS gallery_queue(card TEXT PRIMARY KEY,due INTEGER NOT NULL)');
  e.run('CREATE INDEX IF NOT EXISTS gallery_queue_next ON gallery_queue(due,card)');
  e.run('CREATE TABLE IF NOT EXISTS card_gallery(card TEXT PRIMARY KEY, pictures TEXT NOT NULL, checked INTEGER NOT NULL)');
  e.run('CREATE TABLE IF NOT EXISTS player_portraits(player TEXT NOT NULL,card TEXT NOT NULL,image TEXT NOT NULL,PRIMARY KEY(player,card,image))');
  e.run('CREATE TABLE IF NOT EXISTS portrait_choice(player TEXT NOT NULL,card TEXT NOT NULL,image TEXT NOT NULL,PRIMARY KEY(player,card))');
  for(const table of ['market_listings','auctions','trade_listings','trade_offer_cards']){
    if(!e.all('PRAGMA table_info('+table+')').some(c=>c.name==='artwork'))
      e.run('ALTER TABLE '+table+' ADD COLUMN artwork TEXT');
  }
  // Removing the enhanced base either deletes inventory or promotes a plain spare.
  // These triggers also cover direct batch sales and host inventory corrections.
  const clear="DELETE FROM player_portraits WHERE player=OLD.player AND card=OLD.card; DELETE FROM portrait_choice WHERE player=OLD.player AND card=OLD.card;";
  e.run('CREATE TRIGGER IF NOT EXISTS gallery_base_removed AFTER DELETE ON inventory BEGIN '+clear+' END');
  e.run('CREATE TRIGGER IF NOT EXISTS gallery_base_replaced AFTER UPDATE OF level ON inventory WHEN OLD.level>1 AND NEW.level=1 BEGIN '+clear+' END');
}
export function cardArtwork(e,player,card,variant){
  if(variant!=='card')return null;
  const images=e.all('SELECT image FROM player_portraits WHERE player=? AND card=? ORDER BY rowid',player,card).map(row=>row.image);
  if(!images.length)return null;
  const selected=e.one('SELECT image FROM portrait_choice WHERE player=? AND card=?',player,card)?.image;
  return JSON.stringify({images,selected});
}
export function receiveArtwork(e,player,card,artwork,hadBase){
  if(!artwork)return;
  const {images,selected}=JSON.parse(artwork);
  e.run('INSERT OR IGNORE INTO player_portraits(player,card,image) SELECT ?,?,value FROM json_each(?)',player,card,JSON.stringify(images));
  if(selected&&images.includes(selected)&&!hadBase)
    e.run('INSERT OR REPLACE INTO portrait_choice VALUES(?,?,?)',player,card,selected);
}
const ttl=15*86400000;
const key=url=>url.replace(/\.(jpg|jpeg|png|webp)$/i,'');
const inflight=new WeakMap();
export async function loadGallery(e,card,fetchSource){
  const cached=e.one('SELECT checked,pictures FROM card_gallery WHERE card=?',card.id);
  const identity=/^mal-(character|person)-([1-9]\d*)$/.exec(card.id);
  if(!identity||cached&&cached.checked+ttl>e.now())return;
  if(!inflight.has(e))inflight.set(e,new Map());
  const pending=inflight.get(e);
  if(!pending.has(card.id))pending.set(card.id,(async()=>{
    let response;
    try{response=await fetchSource('/'+(identity[1]==='person'?'people':'characters')+'/'+identity[2]+'/pictures');}catch(error){if(error.upstreamStatus!==404)throw error;response={data:[]};}
    if(!Array.isArray(response?.data))fail('The portrait gallery is unavailable.',503);
    const urls=new Map();
    for(const pic of response.data){
      const url=sourcePortrait(card.kind,pic);
      if(url)urls.set(key(url),url);
    }
    e.run('INSERT OR REPLACE INTO card_gallery VALUES(?,?,?)',card.id,JSON.stringify([...urls.values()]),e.now());
  })().catch(error=>{if(!cached)throw error;}).finally(()=>pending.delete(card.id)));
  await pending.get(card.id);
}
// The existing favorites refresh discovers identities without depending on gallery views.
export function queueGalleries(e,ids){
  if(!ids.length)return;
  e.run(`INSERT OR IGNORE INTO gallery_queue(card,due)
    SELECT value,? FROM json_each(?) WHERE NOT EXISTS
    (SELECT 1 FROM card_gallery WHERE card=value AND checked>?)`,e.now(),JSON.stringify(ids),e.now()-ttl);
}
export function nextGallery(e){
  const due=e.one('SELECT due FROM gallery_queue ORDER BY due,card LIMIT 1')?.due;
  const cooldown=Number(e.one("SELECT value FROM catalog_meta WHERE key='gallery-next'")?.value||0);
  return due==null?Infinity:Math.max(due,cooldown);
}
export async function indexGallery(e,source){
  if(nextGallery(e)>e.now())return;
  const row=e.one('SELECT card FROM gallery_queue ORDER BY due,card LIMIT 1');
  const wait=ms=>e.run("INSERT OR REPLACE INTO catalog_meta VALUES('gallery-next',?)",String(e.now()+ms));
  wait(30000);
  try{
    const card=e.catalogStore.card(row.card);
    if(card)await loadGallery(e,card,source);
    e.run('DELETE FROM gallery_queue WHERE card=?',row.card);
  }catch(error){
    const delay=Math.max(Number(error.retryMs)||0,60000);
    wait(delay);
    e.run('UPDATE gallery_queue SET due=? WHERE card=?',e.now()+Math.max(delay,3600000),row.card);
  }
}
export function galleryCounts(e,cards){
  const ids=cards.filter(c=>/^mal-(character|person)-[0-9]+$/.test(c.id)).map(c=>c.id);
  const rows=ids.length?e.all('SELECT card,pictures FROM card_gallery WHERE card IN (SELECT value FROM json_each(?))',JSON.stringify(ids)):[];
  const cache=new Map(rows.map(r=>[r.card,JSON.parse(r.pictures)]));
  return cards.map(c=>{
    const pics=cache.get(c.id);
    const alternatives=pics?pics.filter(url=>!c.image||key(url)!==key(c.image)).length:/^mal-(character|person)-/.test(c.id)?null:0;
    return {...c,alternatives};
  });
}
export function galleryView(e,player,card){
  const stock=e.one('SELECT level FROM inventory WHERE player=? AND card=? AND copies>0',player,card.id);
  const cache=e.one('SELECT pictures FROM card_gallery WHERE card=?',card.id);
  const unlocked=e.all('SELECT image FROM player_portraits WHERE player=? AND card=? ORDER BY rowid',player,card.id).map(r=>r.image);
  const owned=new Set(unlocked.map(key));
  const chosen=e.one('SELECT image FROM portrait_choice WHERE player=? AND card=?',player,card.id)?.image;
  const urls=new Map();
  for(const url of [card.image,...unlocked,...JSON.parse(cache?.pictures||'[]')].filter(Boolean)){
    if(!urls.has(key(url)))urls.set(key(url),url);
  }
  const pictures=[...urls.values()].map(url=>({url,owned:!!stock&&(url===card.image||owned.has(key(url))),selected:!!stock&&(chosen?key(chosen)===key(url):url===card.image)}));
  return {card:card.id,name:card.name,rarity:card.rarity,level:stock?.level||0,price:portraitRollCost(owned.size),
    balance:e.player(player).balance,pictures};
}
export function changePortrait(e,player,body){
  e.assertAccountUnlocked(player);
  const card=e.catalogStore.card(body.card);
  if(!card)fail('Card unavailable.',404);
  const view=galleryView(e,player,card);
  if(!view.level)fail('You must own this card.');
  if(body.action==='equip'){
    const pick=view.pictures.find(p=>p.owned&&p.url===body.image);
    if(!pick)fail('Choose an unlocked image.');
    if(pick.url===card.image)e.run('DELETE FROM portrait_choice WHERE player=? AND card=?',player,card.id);
    else e.run('INSERT OR REPLACE INTO portrait_choice VALUES(?,?,?)',player,card.id,pick.url);
  }else if(body.action==='roll'){
    if(view.level<MAX_CARD_LEVEL)fail('Max the card before rolling for artwork.');
    const locked=view.pictures.filter(p=>!p.owned);
    if(!locked.length)fail('Every available image is unlocked.');
    if(!view.price||view.price!==body.price||view.pictures.length-locked.length!==body.owned)fail('The gallery changed. Reopen it before rolling.',409);
    const pick=locked[randomInt(locked.length)];
    e.wallet(player,-view.price,'Portrait unlock · '+card.name);
    e.run('INSERT INTO player_portraits VALUES(?,?,?)',player,card.id,pick.url);
    return {unlocked:pick.url};
  }else fail('Choose a gallery action.');
  return {equipped:true};
}
