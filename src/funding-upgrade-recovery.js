import { fail } from "./engine.js";
import { cardInvestment } from "../public/card-values.js";
import { TARGETED_RECOVERY_ID } from "./targeted-recovery.js";

// One owner-approved supplementary correction; private replay evidence is sealed.
export const FUNDING_RECOVERY_ID = "funding-upgrade-recovery-2026-11-14-v1";
export const FUNDING_RECOVERY_DIGEST = "fbf32fd8e7a0c0faeafa90d9fcd716e55e3657526d15ed65497f3087892fa9ad";
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const exact = (a, b, label) => { if (stable(a) !== stable(b)) fail(label + " changed after review.", 409); };

export function inspectFundingRecovery(e, plan, verifiedDigest) {
  if (verifiedDigest !== FUNDING_RECOVERY_DIGEST || plan.repairId !== FUNDING_RECOVERY_ID ||
      plan.confirmation !== "APPLY REVIEWED FUNDING DOWNGRADES") fail("Invalid sealed upgrade recovery.", 409);
  const id = plan.player;
  exact(e.one("SELECT id,balance,earned,account_locked,avatar_card,avatar_crop FROM players WHERE id=?", id), plan.account, "Account");
  if (plan.account.account_locked !== 1) fail("Keep the reviewed account locked.", 409);
  exact(e.one("SELECT * FROM card_alchemy WHERE player=?", id), plan.alchemy, "Alchemy");
  exact(e.one("SELECT max(id) AS max_id FROM ledger WHERE player=?", id)?.max_id, plan.ledgerMax, "Wallet activity");
  const prior = e.one("SELECT result FROM receipts WHERE scope='host:account-rollback' AND key=?", TARGETED_RECOVERY_ID);
  exact(prior ? JSON.parse(prior.result) : null, plan.priorRecovery, "Prior completed recovery");
  const cards = plan.inventory.map(c => c.card), marks = cards.map(() => "?").join(",");
  if (!cards.length || cards.length > 20 || new Set(cards).size !== cards.length) fail("Invalid upgrade scope.");
  let unitsRemoved = 0;
  for (const c of plan.inventory) {
    exact(e.one("SELECT * FROM inventory WHERE player=? AND card=?", id, c.card) || null, c.before, "Affected card");
    if (c.before?.player !== id || c.before.card !== c.card || !c.after || !Number.isInteger(c.after.level) ||
        c.after.level < 1 || c.after.level >= c.before.level || !Number.isSafeInteger(c.after.copies) || c.after.copies < 1)
      fail("Invalid reviewed downgrade.");
    exact(c.after, {...c.before, level:c.after.level, copies:c.after.copies}, "Unrelated card fields");
    const lost = cardInvestment(c.before.level) + c.before.copies - cardInvestment(c.after.level) - c.after.copies;
    if (lost !== c.unitsRemoved || lost < 1) fail("Invalid recovered copy count.");
    unitsRemoved += lost;
  }
  exact(e.all(`SELECT * FROM card_title_awards WHERE player=? AND card IN (${marks}) ORDER BY award`, id, ...cards), plan.awards, "MAX title awards");
  exact(e.all(`SELECT * FROM card_titles WHERE player=? AND card IN (${marks}) ORDER BY card`, id, ...cards), plan.legacyTitles, "Legacy titles");
  for (const t of [...plan.awards, ...plan.legacyTitles])
    if (!plan.inventory.some(c => c.card === t.card && c.before.level === 6 && c.after.level < 6)) fail("Title is outside the MAX downgrade.");
  exact(e.all(`SELECT * FROM card_upgrade_progress WHERE player=? AND card IN (${marks}) ORDER BY card`, id, ...cards), plan.upgradeProgress, "Upgrade progress");
  exact(e.one("SELECT * FROM profile_title_order WHERE player=?", id) || null, plan.titleOrder, "Title order");
  const progress = plan.inventory.filter(c => c.after.level > 1).map(c => ({player:id,card:c.card,spent:cardInvestment(c.after.level)-1})).sort((a,b) => a.card.localeCompare(b.card));
  exact(progress, plan.afterUpgradeProgress, "Retained legitimate upgrade investment");
  return {repairId:plan.repairId, player:id, cardsDowngraded:cards.length, unitsRemoved,
    titlesRemoved:plan.awards.length, creditsRecovered:0, xpRecovered:0, settlementsHonored:plan.settlementsHonored};
}

// The existing owner-only route wraps these writes and the receipt in one transaction.
export function applyFundingRecovery(e, plan, verifiedDigest, bookmark) {
  const summary = inspectFundingRecovery(e, plan, verifiedDigest), id = plan.player;
  for (const c of plan.inventory) {
    e.run("UPDATE inventory SET level=?,copies=? WHERE player=? AND card=?", c.after.level, c.after.copies, id, c.card);
    e.run("DELETE FROM card_upgrade_progress WHERE player=? AND card=?", id, c.card);
  }
  for (const p of plan.afterUpgradeProgress)
    e.run("INSERT INTO card_upgrade_progress(player,card,spent) VALUES(?,?,?)", id, p.card, p.spent);
  for (const t of plan.awards) e.run("DELETE FROM card_title_awards WHERE player=? AND award=?", id, t.award);
  for (const t of plan.legacyTitles) e.run("DELETE FROM card_titles WHERE player=? AND card=?", id, t.card);
  if (plan.titleOrder) {
    const removed = new Set(plan.awards.map(t => "award:" + t.award));
    const order = JSON.parse(plan.titleOrder.data).filter(key => !removed.has(key));
    e.run("UPDATE profile_title_order SET data=? WHERE player=?", JSON.stringify(order), id);
  }
  return {...summary, digest:verifiedDigest, bookmark, at:e.now(), accountRemainsLocked:true,
    message:"Reviewed funding-based downgrades and affected MAX title applied. Prior recovery and wallet/XP preserved."};
}
