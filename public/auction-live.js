import { minimumBid } from './community-market-rules.js';

export function auctionRefreshIds(state, market, openId) {
  return [...new Set([openId,...(market?.items||[]).map(a=>a.id),
    ...(state.auctions||[]).map(a=>a.id),
    ...(state.myListings||[]).filter(a=>a.venue==='auction').map(a=>a.id)]
    .map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,64);
}

// Ignore late reads from before a paid action or an account change.
export function applyAuctionRefresh(state, market, snapshot) {
  if(!snapshot || snapshot.player!==state.me?.id ||
    snapshot.now<Math.max(state.now||0,state.gameUpdatedAt||0,state.auctionUpdatedAt||0))return false;
  const lots=new Map(snapshot.lots.map(a=>[a.id,a]));
  let changed=state.me.balance!==snapshot.balance;
  state.me={...state.me,balance:snapshot.balance};
  state.auctionUpdatedAt=snapshot.now;
  const merge=(rows,own=false)=>rows?.map(row=>{
    if(own&&row.venue!=='auction')return row;
    const lot=lots.get(row.id);if(!lot)return row;
    const next={...row,...lot};
    if(JSON.stringify(next)!==JSON.stringify(row))changed=true;
    return next;
  });
  state.auctions=merge(state.auctions);
  state.myListings=merge(state.myListings,true);
  if(market)market.items=merge(market.items);
  return changed;
}

export function syncBidForm(form, lot, me, number=String, now=Date.now()) {
  if(!form||!lot)return;
  const input=form.elements.amount,oldMin=input.min,next=String(minimumBid(lot));
  input.min=next;
  // Keep custom bids, but move an untouched minimum up to the current price.
  if(!input.value||input.value===oldMin)input.value=next;
  const ended=!!lot.closed||lot.ends<=now;
  form.querySelector('[data-bid-current]').textContent=ended?'This auction has ended.':
    (lot.bid?'Highest bid: '+number(lot.bid)+' credits. ':'Be the first to bid. ')+
    'Minimum bid: '+number(minimumBid(lot))+' credits. Your credits are held while your bid leads.';
  form.querySelector('[data-bid-balance]').textContent='Available: '+number(me.balance)+' credits'+
    (lot.winner===me.id?' · Your existing bid counts toward the total.':'');
  form.querySelector('button[type="submit"]').disabled=ended||lot.seller===me.id;
}
