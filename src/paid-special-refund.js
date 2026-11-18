import { fail } from "./engine.js";

const RELEASE = Date.parse("2026-11-18T04:35:00Z");
const CARD_SPEND = ["enhance", "sell-instant", "sell-batch", "alchemy-feed", "fusion", "list-card", "trade-list", "trade-offer"];

export function paidSpecialRefundPlan(e, revision = 1) {
  if (![1, 2].includes(revision)) fail("Choose a superseded Special Pack version.");
  const buyers = e.all(`SELECT player, SUM(-delta) AS charged FROM ledger
    WHERE at>=? AND delta<0 AND (reason GLOB 'Special character pack*' OR reason GLOB 'Special seiyuu pack*')
    GROUP BY player ORDER BY player`, RELEASE);
  return buyers.map(({ player, charged }) => {
    const receipts = e.all(`SELECT key,result,at FROM receipts
      WHERE scope=? AND at>=? AND json_extract(input,'$.special')=1 ORDER BY at,key`, `${player}:pack`, RELEASE)
      .map(row => ({ key: row.key, at: row.at, ...JSON.parse(row.result) }));
    const legacy = receipts.filter(row => row.packType === "special" && (row.specialPackRevision ?? 1) === revision);
    const confirmed = legacy.filter(row => e.one("SELECT 1 FROM receipts WHERE scope=? AND key=?", `${player}:paid-special-refunded`, row.key));
    const orders = legacy.filter(row => !confirmed.includes(row));
    const problems = [];
    if (receipts.reduce((sum, row) => sum + row.cost, 0) !== charged) problems.push("Purchase ledger and receipts differ");
    const refund = orders.reduce((sum, row) => sum + row.cost, 0);
    const cards = new Map(), sales = [];
    for (const order of orders) {
      if (order.cards?.length !== order.packCount * 10 || order.cost <= 0) {
        problems.push("Incomplete pack receipt");
        continue;
      }
      for (const card of order.cards) {
        if (card.autoSold) {
          const sale = e.one("SELECT * FROM pack_auto_sales WHERE id=? AND player=?", card.autoSoldId, player);
          if (!sale || sale.card !== card.id || sale.price !== card.autoSoldPrice) {
            problems.push("Missing or changed auto-sale");
            continue;
          }
          sales.push(sale);
          if (!sale.cancelled) continue;
        }
        const entry = cards.get(card.id) || { card: card.id, count: 0, at: order.at };
        entry.count++;
        cards.set(card.id, entry);
      }
    }
    const inventory = [...cards.values()].map(row => ({ ...row, current: e.one(
      "SELECT copies,level,acquired_at FROM inventory WHERE player=? AND card=?", player, row.card) || null }));
    const listings = [], refinements = [];
    if (orders.length && cards.size) {
      const scopes = CARD_SPEND.map(action => `${player}:${action}`);
      const actions = e.all(`SELECT scope,key,input,result,at FROM receipts WHERE at>=?
        AND scope IN (${scopes.map(() => "?").join(",")}) ORDER BY at,key`, orders[0].at, ...scopes);
      for (const action of actions) {
        const affected = inventory.filter(row => row.at <= action.at &&
          [action.input, action.result].some(json => json.includes(JSON.stringify(row.card))));
        if (!affected.length) continue;
        const name = action.scope.slice(player.length + 1);
        if (name === "alchemy-feed") {
          const result = JSON.parse(action.result);
          const materials = (result.refinements || [result]).filter(item =>
            affected.some(row => row.card === item.material?.id));
          if (materials.length && materials.every(item => item.material.level === 1 && item.material.investment === 1 &&
              Number.isSafeInteger(item.xpGained) && item.xpGained > 0)) {
            refinements.push(...materials.map(item => ({ key: action.key, card: item.material.id, xp: item.xpGained })));
            continue;
          }
        }
        if (name === "list-card") {
          const input = JSON.parse(action.input);
          const row = affected.find(item => item.card === input.card);
          if (input.venue === "shop" && row) {
            const matching = e.all(`SELECT id,card,status FROM market_listings
              WHERE seller=? AND card=? AND price=? AND level=1 AND extra_copies=0
                AND created BETWEEN ? AND ?`, player, row.card, input.price,
              Math.max(row.at, action.at - 1000), action.at);
            const listing = matching.length === 1 && matching[0];
            if (listing?.status === "cancelled") continue;
            if (listing?.status === "open" && !listings.some(item => item.id === listing.id)) {
              listings.push(listing);
              continue;
            }
          }
        }
        problems.push(name + " needs review: " + action.key);
      }
    }
    for (const row of inventory) {
      row.remove = row.count - listings.filter(listing => listing.card === row.card).length -
        refinements.filter(item => item.card === row.card).length;
      const copies = row.current?.copies || 0;
      if (row.remove < 0 || row.remove > copies ||
          (row.remove > 0 && row.remove === copies && row.current.level !== 1))
        problems.push("Copy count or enhancement needs review: " + row.card);
    }
    const xpRecovery = refinements.reduce((sum, item) => sum + item.xp, 0);
    const alchemy = refinements.length ? e.economy.alchemy.read(player) : null;
    if (alchemy && (alchemy.xp < xpRecovery || alchemy.refinements < refinements.length))
      problems.push("Refinement XP was spent and needs review");
    const autoSaleCredits = sales.reduce((sum, sale) => sum + (sale.cancelled ? 0 : sale.price), 0);
    const balance = e.one("SELECT balance FROM players WHERE id=?", player)?.balance ?? null;
    if (orders.length && (balance === null || balance + refund < autoSaleCredits))
      problems.push("Wallet needs review");
    return {
      player, revision, orders: orders.map(({ key, at, packCount, cost }) => ({ key, at, packCount, cost })),
      refunded: confirmed.length, refund, inventory, sales, listings, refinements, alchemy, xpRecovery,
      autoSaleCredits, problems: [...new Set(problems)],
    };
  });
}

// Review a complete purchase group per buyer, keeping the source receipts intact.
export function applyPaidSpecialRefund(e, body) {
  const plan = paidSpecialRefundPlan(e, body.plan?.revision).find(row => row.player === body.plan?.player);
  if (!plan?.orders.length || plan.problems.length || JSON.stringify(plan) !== JSON.stringify(body.plan))
    fail("Special Pack activity changed or needs review. Preview it again.", 409);
  for (const listing of plan.listings)
    e.run("UPDATE market_listings SET status='cancelled' WHERE id=? AND seller=? AND status='open'", listing.id, plan.player);
  for (const row of plan.inventory) {
    if (row.remove === 0) continue;
    if (row.current.copies > row.remove) {
      e.run("UPDATE inventory SET copies=copies-? WHERE player=? AND card=?", row.remove, plan.player, row.card);
    } else {
      e.run("DELETE FROM inventory WHERE player=? AND card=?", plan.player, row.card);
      e.run("DELETE FROM profile_showcase WHERE player=? AND card=?", plan.player, row.card);
      e.run("UPDATE players SET avatar_card=NULL,avatar_crop=NULL WHERE id=? AND avatar_card=?", plan.player, row.card);
    }
  }
  for (const sale of plan.sales) e.run("DELETE FROM pack_auto_sales WHERE id=? AND player=?", sale.id, plan.player);
  if (plan.alchemy)
    e.run("UPDATE card_alchemy SET xp=xp-?,refinements=refinements-?,version=version+1 WHERE player=?",
      plan.xpRecovery, plan.refinements.length, plan.player);
  e.wallet(plan.player, plan.refund, "Refund: prior Special Card Packs");
  if (plan.autoSaleCredits) e.wallet(plan.player, -plan.autoSaleCredits, "Reverse prior Special Card Pack auto-sales");
  for (const order of plan.orders)
    e.run("INSERT INTO receipts VALUES(?,?,?,?,?)", `${plan.player}:paid-special-refunded`, order.key,
      JSON.stringify({ cost: order.cost }), "{}", e.now());
  return {
    player: plan.player, purchases: plan.orders.length, packs: plan.orders.reduce((sum, order) => sum + order.packCount, 0),
    refund: plan.refund, autoSaleCredits: plan.autoSaleCredits,
    copiesRemoved: plan.inventory.reduce((sum, row) => sum + row.count, 0),
    listingsCancelled: plan.listings.length,
    xpRecovered: plan.xpRecovery,
  };
}
