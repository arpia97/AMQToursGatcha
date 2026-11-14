import { fail } from "./engine.js";

// Owner-only, sealed one-time correction. Private evidence stays in the manifest.
export const TARGETED_RECOVERY_ID = "targeted-benefit-recovery-2026-11-14-v1";
export const TARGETED_RECOVERY_DIGEST = "e451276703d6d002fc535053e20ba1268961a9a5b07e05b5a6e24703624741c9";
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const exact = (actual, expected, label) => {
  if (stable(actual) !== stable(expected)) fail(label + " changed after review.", 409);
};

// The Worker computes the digest from the entire submitted plan, never a client claim.
export function inspectTargetedRecovery(e, plan, verifiedDigest) {
  if (verifiedDigest !== TARGETED_RECOVERY_DIGEST || plan.repairId !== TARGETED_RECOVERY_ID ||
      plan.confirmation !== "APPLY REVIEWED TARGETED RECOVERY") fail("Invalid sealed recovery.", 409);
  const id = plan.player;
  exact(e.one("SELECT id,balance,earned,account_locked,avatar_card,avatar_crop FROM players WHERE id=?", id), plan.account, "Account");
  if (plan.account.account_locked !== 1 || plan.cashRecovery !== plan.account.balance ||
      !Number.isSafeInteger(plan.cashRecovery) || plan.cashRecovery < 0) fail("Keep the reviewed account locked.", 409);
  exact(e.one("SELECT * FROM card_alchemy WHERE player=?", id), plan.alchemy, "Alchemy");
  if (!Number.isSafeInteger(plan.xpRecovery) || plan.xpRecovery < 0 || plan.xpRecovery > plan.alchemy.xp)
    fail("Invalid XP recovery.");
  exact(e.one("SELECT max(id) AS max_id FROM ledger WHERE player=?", id)?.max_id, plan.ledgerMax, "Wallet activity");
  const cards = plan.inventory.map(r => r.card);
  if (!cards.length || cards.length > 100 || new Set(cards).size !== cards.length) fail("Invalid card recovery.");
  for (const change of plan.inventory) {
    exact(e.one("SELECT * FROM inventory WHERE player=? AND card=?", id, change.card) || null, change.before, "Affected card");
    if (change.before?.player !== id || change.before.card !== change.card ||
        (change.after && (change.after.player !== id || change.after.card !== change.card))) fail("Invalid card owner.");
    if (change.after && (change.after.level !== 1 || change.after.copies !== 1 || change.before.level !== 2 || change.before.copies !== 1))
      fail("Invalid reviewed downgrade.");
    if (!change.after && (change.before.level !== 1 || change.before.copies !== 1)) fail("Invalid reviewed removal.");
    for (const table of ["card_titles", "card_title_awards"])
      if (e.one(`SELECT 1 FROM ${table} WHERE player=? AND card=? LIMIT 1`, id, change.card))
        fail("An affected title requires a new review.", 409);
  }
  const marks = cards.map(() => "?").join(",");
  exact(e.all(`SELECT * FROM card_upgrade_progress WHERE player=? AND card IN (${marks}) ORDER BY card`, id, ...cards), plan.upgradeProgress, "Upgrade progress");
  return { repairId: plan.repairId, player: id, cardsRemoved: plan.inventory.filter(c => !c.after).length,
    cardsDowngraded: plan.inventory.filter(c => c.after).length, creditsRecovered: plan.cashRecovery,
    xpRecovered: plan.xpRecovery, unrecoveredSourceCredits: plan.unrecoveredSourceCredits };
}

// Caller wraps all writes and the receipt in Engine.mutate / transactionSync.
export function applyTargetedRecovery(e, plan, verifiedDigest, bookmark) {
  const summary = inspectTargetedRecovery(e, plan, verifiedDigest), id = plan.player;
  for (const change of plan.inventory) {
    if (change.after) {
      e.run("UPDATE inventory SET level=1,copies=1 WHERE player=? AND card=?", id, change.card);
    } else {
      e.run("DELETE FROM inventory WHERE player=? AND card=?", id, change.card);
      e.run("DELETE FROM profile_showcase WHERE player=? AND card=?", id, change.card);
      e.run("UPDATE players SET avatar_card=NULL,avatar_crop=NULL WHERE id=? AND avatar_card=?", id, change.card);
    }
    e.run("DELETE FROM card_upgrade_progress WHERE player=? AND card=?", id, change.card);
  }
  e.run("UPDATE card_alchemy SET xp=xp-?,version=version+1 WHERE player=?", plan.xpRecovery, id);
  e.wallet(id, -plan.cashRecovery, "Owner-approved targeted recovery: " + plan.repairId);
  return { ...summary, digest: verifiedDigest, bookmark, at: e.now(), accountRemainsLocked: true,
    message: "Reviewed cards, XP and credits recovered atomically. Unrelated progress retained." };
}
