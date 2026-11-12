import { fail } from "./engine.js";
import { cardInvestment } from "../public/card-values.js";

// A deliberately scoped, owner-operated correction, not a general SQL editor.
const PLAYER = "16";
export const BOP_ROLLBACK_ID = "bop-full-rollback-2026-11-12-v1";
const stable = (row) => JSON.stringify(row === null ? null :
  Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
const key = (player, card) => player + ":" + card;

export function inspectAccountRollback(e, plan) {
  if (plan.repairId !== BOP_ROLLBACK_ID || plan.player !== PLAYER ||
      plan.confirmation !== "REVERT BOP ACCOUNT 16")
    fail("Invalid scoped account rollback.");
  const account = e.one("SELECT id,balance,earned,access_reset,password IS NOT NULL AS has_password FROM players WHERE id=?", PLAYER);
  if (!account || account.has_password || !account.access_reset ||
      account.balance !== plan.expectedBalance || account.earned !== plan.expectedEarned ||
      e.one("SELECT COUNT(*) AS n FROM sessions WHERE player=?", PLAYER).n)
    fail("Account access or balance changed after the snapshot.", 409);
  const receipts = e.all("SELECT scope,key,at FROM receipts WHERE scope>=? AND scope<? ORDER BY scope,key", PLAYER + ":", PLAYER + ":\uffff");
  if (JSON.stringify(receipts) !== JSON.stringify(plan.receipts))
    fail("Account activity changed after the snapshot.", 409);
  if (JSON.stringify(e.all("SELECT * FROM inventory WHERE player=? ORDER BY card",PLAYER)) !== JSON.stringify(plan.ownInventory))
    fail("The account inventory changed after the snapshot.",409);
  for (const [sql, args] of [
    ["SELECT COUNT(*) AS n FROM auctions WHERE seller=? OR winner=?", [PLAYER, PLAYER]],
    ["SELECT COUNT(*) AS n FROM market_listings WHERE seller=? OR buyer=?", [PLAYER, PLAYER]],
    ["SELECT COUNT(*) AS n FROM weekly_shop WHERE buyer=?", [PLAYER]],
    ["SELECT COUNT(*) AS n FROM trade_listings WHERE seller=?", [PLAYER]],
    ["SELECT COUNT(*) AS n FROM trade_offers WHERE proposer=? AND status='open'", [PLAYER]],
  ]) if (e.one(sql, ...args).n) fail("Additional transactions need review before rollback.", 409);

  const trades = e.all(
    "SELECT l.*,o.id AS offer,o.card AS offered_card,o.level AS offered_level,o.extra_copies AS offered_extras FROM trade_offers o INDEXED BY trade_offer_player JOIN trade_listings l ON l.id=o.listing WHERE o.proposer=? AND o.status='accepted' AND l.status='completed' AND l.accepted_offer=o.id ORDER BY l.id",
    PLAYER,
  );
  if (!trades.length || trades.length > 50 ||
      JSON.stringify(trades.map((t) => ({ listing:t.id,offer:t.offer,at:t.updated_at }))) !== JSON.stringify(plan.trades))
    fail("Completed trades changed after the snapshot.", 409);
  const changes = new Map();
  const add = (player, card, units) => {
    const k = key(player, card), old = changes.get(k);
    changes.set(k, { player, card, units: (old?.units || 0) + units });
  };
  for (const trade of trades) {
    if (trade.level !== 1 || trade.extra_copies || trade.seller === PLAYER)
      fail("This transfer needs a separate enhancement review.", 409);
    add(trade.seller, trade.card, 1);
    const bundle = e.all("SELECT card,level,extra_copies FROM trade_offer_cards WHERE offer=? ORDER BY position", trade.offer);
    const materials = bundle.length ? bundle : [{ card:trade.offered_card,level:trade.offered_level,extra_copies:trade.offered_extras }];
    for (const card of materials) {
      if (card.level !== 1 || card.extra_copies)
        fail("This transfer needs a separate enhancement review.", 409);
      add(trade.seller, card.card, -1);
    }
  }
  const wanted = [...changes.values()].sort((a,b) => key(a.player,a.card).localeCompare(key(b.player,b.card)));
  if (!Array.isArray(plan.inventory) || wanted.length !== plan.inventory.length)
    fail("Inventory snapshot does not cover every affected card.", 409);
  const adjustments = wanted.map((change, i) => {
    const expected = plan.inventory[i];
    if (change.player !== expected.player || change.card !== expected.card)
      fail("Inventory snapshot order changed.", 409);
    const before = e.one("SELECT * FROM inventory WHERE player=? AND card=?", change.player,change.card) || null;
    if (stable(before) !== stable(expected.before))
      fail("An affected card changed after review. Refresh the rollback snapshot.", 409);
    const total = (before ? cardInvestment(before.level) + before.copies - 1 : 0) + change.units;
    if (total < 0 || (change.units < 0 && before?.level === 6))
      fail("Transferred cards were consumed or require a MAX-title review.", 409);
    let after = before;
    if (change.units && total === 0) after = null;
    else if (change.units && before) {
      let level = before.level;
      while (cardInvestment(level) > total) level--;
      after = { ...before,level,copies:total-cardInvestment(level)+1 };
    } else if (change.units) {
      after = { player:change.player,card:change.card,copies:total,level:1,acquired_at:e.now(),protected:0,position:null,for_trade:0 };
    }
    return { ...change,before,after };
  });
  return { account:PLAYER,trades,adjustments,receiptCount:receipts.length };
}

// Worker wraps this in Engine.mutate/transactionSync, including the receipt.
export function applyAccountRollback(e, plan, digest, bookmark) {
  const review = inspectAccountRollback(e, plan);
  const special = e.one("SELECT * FROM special_packs WHERE player=?", PLAYER);
  const participants = [...new Set(review.trades.map((t) => t.seller))];
  for (const row of review.adjustments) {
    if (!row.units) continue;
    if (!row.after) {
      e.run("DELETE FROM inventory WHERE player=? AND card=?", row.player,row.card);
      e.run("DELETE FROM profile_showcase WHERE player=? AND card=?", row.player,row.card);
      e.run("UPDATE players SET avatar_card=NULL,avatar_crop=NULL WHERE id=? AND avatar_card=?", row.player,row.card);
    } else if (row.before) {
      e.run("UPDATE inventory SET copies=?,level=? WHERE player=? AND card=?", row.after.copies,row.after.level,row.player,row.card);
    } else {
      const r = row.after;
      e.run("INSERT INTO inventory(player,card,copies,level,acquired_at,protected,position,for_trade) VALUES(?,?,?,?,?,?,?,?)",r.player,r.card,r.copies,r.level,r.acquired_at,r.protected,r.position,r.for_trade);
    }
  }
  for (const t of review.trades) {
    e.run("UPDATE trade_listings SET status='cancelled',accepted_offer=NULL,updated_at=? WHERE id=?",e.now(),t.id);
    e.run("UPDATE trade_offers SET status='cancelled',updated_at=? WHERE id=?",e.now(),t.offer);
    e.run("DELETE FROM player_notices WHERE kind LIKE 'trade-%' AND json_extract(metadata,'$.listing')=?",t.id);
  }
  e.host("reset-player",{ player:PLAYER,confirmation:"RESET PLAYER " + PLAYER });
  e.run("UPDATE players SET password=NULL,invite=NULL,invite_expires=NULL,access_reset=1 WHERE id=?",PLAYER);
  if (special)
    e.run("INSERT INTO special_packs(player,granted_at,cards,seen) VALUES(?,?,?,1)",PLAYER,special.granted_at,special.cards);
  const tombstone = JSON.stringify({ message:"This activity was reverted by the owner.",reverted:true,repairId:plan.repairId });
  e.run("UPDATE receipts SET result=? WHERE scope>=? AND scope<?",tombstone,PLAYER+":",PLAYER+":\uffff");
  e.quiz.statisticsCache = null;
  return {
    message:"Scoped account rollback applied atomically. Account access remains revoked.",
    repairId:plan.repairId,digest,bookmark,at:e.now(),player:PLAYER,
    tradesReversed:review.trades.length,participants,
    cards:review.adjustments.filter((r) => r.units).map(({player,card,units,before,after}) => ({player,card,units,before,after})),
    startingCredits:5000,accessRevoked:true,specialBonusRemainsConsumed:!!special,
  };
}
