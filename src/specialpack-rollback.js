import { fail } from "./engine.js";
import { cardInvestment } from "../public/card-values.js";

// Private case details stay in the manifest. The owner-only Worker verifies this
// sealed scope before entering the transaction; prior repairs remain separate.
export const SPECIALPACK_ROLLBACK_ID = "specialpack-three-account-rollback-2026-11-12-v1";
export const SPECIALPACK_SCOPE_DIGEST = "eb198b0869306f1eaab86998c4130358ecb63693f127b285b72111b126486bae";
const placeholders = values => values.map(()=>"?").join(",");
const cardKey = (p,c) => p+":"+c;
const stable = value => JSON.stringify(value, (_,v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
const exact = (actual,expected,label) => {
  if (stable(actual)!==stable(expected)) fail(label+" changed after review.",409);
};

export function specialPackRollbackSnapshot(e,scope) {
  const TARGETS=scope.targets,ROOTS="("+placeholders(TARGETS)+")";
  const listings=[...scope.tradeIds,...scope.escrowIds];
  return {
    accounts:e.all(`SELECT id,balance,earned,access_reset,password IS NOT NULL has_password,(SELECT count(*) FROM sessions WHERE player=p.id) sessions FROM players p WHERE id IN ${ROOTS} ORDER BY id`,...TARGETS),
    receipts:TARGETS.flatMap(p=>e.all("SELECT scope,key,at FROM receipts WHERE scope>=? AND scope<? ORDER BY scope,key",p+":",p+":\uffff")),
    inventory:e.all(`SELECT * FROM inventory WHERE player IN ${ROOTS} ORDER BY player,card`,...TARGETS),
    markets:e.all(`SELECT * FROM market_listings WHERE seller IN ${ROOTS} OR buyer IN ${ROOTS} ORDER BY id`,...TARGETS,...TARGETS),
    trades:e.all(`SELECT l.*,o.id offer,o.proposer,o.card offer_card,o.level offer_level,o.extra_copies offer_extras,o.status offer_status,o.updated_at offer_updated FROM trade_listings l LEFT JOIN trade_offers o ON o.listing=l.id WHERE l.seller IN ${ROOTS} OR o.proposer IN ${ROOTS} ORDER BY l.id,o.id`,...TARGETS,...TARGETS),
    escrow:e.all(`SELECT * FROM trade_listings WHERE id IN (${placeholders(scope.escrowIds)}) ORDER BY id`,...scope.escrowIds),
    offers:e.all(`SELECT * FROM trade_offers WHERE listing IN (${placeholders(scope.escrowIds)}) ORDER BY id`,...scope.escrowIds),
    bundles:e.all(`SELECT * FROM trade_offer_cards WHERE offer IN (SELECT id FROM trade_offers WHERE listing IN (${placeholders(listings)})) ORDER BY offer,position`,...listings),
    onward:e.one("SELECT * FROM trade_listings WHERE id=?",scope.onwardListing),
    sale:e.one("SELECT id,player,delta,reason,at FROM ledger WHERE id=?",scope.saleLedger),
    special:e.all(`SELECT * FROM special_packs WHERE player IN ${ROOTS} ORDER BY player`,...TARGETS),
  };
}

// scopeDigest must be computed from plan.scope by the owner-only HTTP route.
export function inspectSpecialPackRollback(e,plan,scopeDigest) {
  if (scopeDigest!==SPECIALPACK_SCOPE_DIGEST || plan.repairId!==SPECIALPACK_ROLLBACK_ID || plan.confirmation!=="REVERT THREE SPECIAL PACK ACCOUNTS" ||
      plan.recovery!=="counterparty-value") fail("Invalid reviewed special-pack rollback.");
  const scope=plan.scope,TARGETS=scope.targets;
  const s=specialPackRollbackSnapshot(e,scope);
  exact(s,plan.snapshot,"Account/transaction snapshot");
  if (s.accounts.length!==3 || s.special.length!==3 || s.accounts.some(p=>p.has_password || !p.access_reset || p.sessions))
    fail("Revoke all three accounts before preparing this correction.",409);
  exact(s.markets.map(m=>m.id),scope.marketIds,"Marketplace scope");
  exact(s.trades.map(t=>t.id),scope.tradeIds,"Completed-trade scope");
  exact(s.escrow.map(t=>t.id),scope.escrowIds,"Escrow scope");
  for (const p of TARGETS) {
    if (e.one("SELECT count(*) n FROM auctions WHERE seller=? OR winner=?",p,p).n ||
        e.one("SELECT count(*) n FROM weekly_shop WHERE buyer=?",p).n)
      fail("Additional transactions require a separate review.",409);
  }
  if (s.onward?.status!=="completed" || s.onward.seller!==scope.onwardSeller || s.onward.accepted_offer!==scope.onwardOffer ||
      s.sale?.player!==scope.onwardSeller || s.sale.delta!==scope.recoveryAmount || s.sale.reason!==scope.saleReason)
    fail("The reviewed onward-sale recovery no longer matches.",409);
  const changes=new Map();
  const add=(player,card,units)=> {
    if (TARGETS.includes(player)) return;
    const k=cardKey(player,card),prev=changes.get(k);
    changes.set(k,{player,card,units:(prev?.units||0)+units});
  };
  let walletDelta=0;
  for(const m of s.markets) {
    if(m.status!=="sold" || m.level!==1 || m.extra_copies || ![m.seller,m.buyer].includes(scope.counterparty))
      fail("Marketplace transfer requires further review.",409);
    add(m.seller,m.card,1); add(m.buyer,m.card,-1);
    walletDelta+=m.seller===scope.counterparty?-m.price:m.price;
  }
  for(const t of s.trades) {
    if(t.status!=="completed" || t.offer_status!=="accepted" || t.accepted_offer!==t.offer ||
        t.level!==1 || t.extra_copies || ![t.seller,t.proposer].includes(scope.counterparty))
      fail("Completed transfer requires further review.",409);
    add(t.seller,t.card,1);add(t.proposer,t.card,-1);
    const cards=s.bundles.filter(c=>c.offer===t.offer);
    if(!cards.length) fail("The reviewed transfer bundle is missing.",409);
    for(const c of cards) {
      if(c.level!==1 || c.extra_copies) fail("Enhanced escrow needs review.",409);
      add(t.proposer,c.card,1);add(t.seller,c.card,-1);
    }
  }
  // The owner chooses value recovery, preserving the uninvolved onward trade.
  const marketReversal=walletDelta;
  add(scope.counterparty,scope.recoveryCard,1);
  walletDelta-=scope.recoveryAmount;
  if(walletDelta!==scope.expectedWalletDelta) fail("Credit-reversal totals changed.",409);
  for(const l of s.escrow) {
    if(l.status!=="open" || l.seller!==scope.counterparty || l.level!==1 || l.extra_copies ||
        !scope.escrowCards.includes(l.card)) fail("Escrow changed.",409);
    add(l.seller,l.card,1); // consume the tainted escrow instead of returning it
    for(const o of s.offers.filter(o=>o.listing===l.id && o.status==="open")) {
      const cards=s.bundles.filter(c=>c.offer===o.id);
      if(!cards.length || o.proposer===scope.counterparty || TARGETS.includes(o.proposer)) fail("Held offer needs review.",409);
      for(const c of cards) {
        if(c.level!==1 || c.extra_copies) fail("Enhanced held offer needs review.",409);
        add(o.proposer,c.card,1);
      }
    }
  }
  const wanted=[...changes.values()].sort((a,b)=>cardKey(a.player,a.card).localeCompare(cardKey(b.player,b.card)));
  if(!Array.isArray(plan.affected) || wanted.length!==plan.affected.length) fail("Affected inventory snapshot is incomplete.",409);
  const adjustments=wanted.map((c,i)=> {
    const expected=plan.affected[i];
    if(c.player!==expected.player || c.card!==expected.card) fail("Affected inventory order changed.",409);
    const before=e.one("SELECT * FROM inventory WHERE player=? AND card=?",c.player,c.card)||null;
    exact(before,expected.before,"Affected card");
    const total=(before?cardInvestment(before.level)+before.copies-1:0)+c.units;
    if(total<0 || (c.units<0 && before?.level===6)) fail("Affected investment requires another review.",409);
    let after=before;
    if(c.units && !total) after=null;
    else if(c.units && before) {
      let level=before.level;while(cardInvestment(level)>total)level--;
      after={...before,level,copies:total-cardInvestment(level)+1};
    } else if(c.units) after={player:c.player,card:c.card,copies:total,level:1,acquired_at:e.now(),protected:0,position:null,for_trade:0};
    return {...c,before,after};
  });
  const wallet=e.one("SELECT id,balance,earned FROM players WHERE id=?",scope.counterparty);
  exact(wallet,plan.wallet,"Counterparty wallet");
  if(wallet.balance+walletDelta<0) fail("Recovery would exceed available credits.",409);
  return {accounts:TARGETS,adjustments,wallet:{...wallet,marketReversal,valueRecovered:scope.recoveryAmount,delta:walletDelta,after:wallet.balance+walletDelta},marketCount:s.markets.length,tradeCount:s.trades.length,escrowCount:s.escrow.length};
}

export function applySpecialPackRollback(e,plan,digest,bookmark,scopeDigest) {
  const review=inspectSpecialPackRollback(e,plan,scopeDigest),s=plan.snapshot;
  for(const r of review.adjustments) {
    if(!r.units)continue;
    if(!r.after) {
      e.run("DELETE FROM inventory WHERE player=? AND card=?",r.player,r.card);
      e.run("DELETE FROM profile_showcase WHERE player=? AND card=?",r.player,r.card);
      e.run("UPDATE players SET avatar_card=NULL,avatar_crop=NULL WHERE id=? AND avatar_card=?",r.player,r.card);
    } else if(r.before) e.run("UPDATE inventory SET copies=?,level=? WHERE player=? AND card=?",r.after.copies,r.after.level,r.player,r.card);
    else { const a=r.after; e.run("INSERT INTO inventory(player,card,copies,level,acquired_at,protected,position,for_trade) VALUES(?,?,?,?,?,?,?,?)",a.player,a.card,a.copies,a.level,a.acquired_at,a.protected,a.position,a.for_trade); }
  }
  e.wallet(plan.scope.counterparty,review.wallet.delta,"Reviewed account rollback: marketplace reversals and onward-card value recovery");
  for(const t of [...s.trades,...s.escrow]) {
    e.run("UPDATE trade_listings SET status='cancelled',accepted_offer=NULL,updated_at=? WHERE id=?",e.now(),t.id);
    e.run("UPDATE trade_offers SET status=CASE WHEN status='open' THEN 'returned' ELSE 'cancelled' END,updated_at=? WHERE listing=? AND status IN ('open','accepted')",e.now(),t.id);
    e.run("DELETE FROM player_notices WHERE kind LIKE 'trade-%' AND json_extract(metadata,'$.listing')=?",t.id);
  }
  for(const m of s.markets) {
    e.run("UPDATE market_listings SET status='cancelled',buyer=NULL,sold_at=NULL WHERE id=?",m.id);
    e.run("DELETE FROM player_notices WHERE event_key=?","market-sale:"+m.id);
  }
  for(const p of plan.scope.targets) {
    e.host("reset-player",{player:p,confirmation:"RESET PLAYER "+p});
    e.run("UPDATE players SET password=NULL,invite=NULL,invite_expires=NULL,access_reset=1 WHERE id=?",p);
    const pack=s.special.find(r=>r.player===p);
    if(pack)e.run("INSERT INTO special_packs(player,granted_at,cards,seen) VALUES(?,?,?,1)",p,pack.granted_at,pack.cards);
    e.run("UPDATE receipts SET result=? WHERE scope>=? AND scope<?",JSON.stringify({message:"This activity was reverted by the owner.",reverted:true,repairId:plan.repairId}),p+":",p+":\uffff");
  }
  e.quiz.statisticsCache=null;
  return {message:"Reviewed account rollback applied atomically; account access remains revoked.",repairId:plan.repairId,digest,scopeDigest,bookmark,at:e.now(),...review,recovery:plan.recovery,specialBonusesRemainConsumed:true};
}
