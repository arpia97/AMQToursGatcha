import { fail } from "./engine.js";

// Owner-operated backfill for this rollout only, never a startup migration.
export const BOP_COMPENSATION_ID = "bop-target-miss-backfill-2026-11-15-v1";
export function savedBopCompensation(e) {
  e.run("CREATE TABLE IF NOT EXISTS alchemy_compensations(id TEXT PRIMARY KEY,at INTEGER NOT NULL,result TEXT NOT NULL)");
  const saved = e.one("SELECT result FROM alchemy_compensations WHERE id=?", BOP_COMPENSATION_ID);
  return saved ? { ...JSON.parse(saved.result), alreadyApplied: true } : null;
}
export function bopCompensationPlan(e) {
  const resets = e.all(
    "SELECT rowid AS seq,input,scope FROM receipts WHERE scope IN ('host:host/reset-player','host:host/reset-all','host:host/beta-reset') ORDER BY rowid",
  );
  const cutoffs = new Map();
  let globalCutoff = 0;
  for (const row of resets) {
    if (row.scope === "host:host/reset-player") {
      const body = JSON.parse(row.input);
      if (typeof body.player === "string") cutoffs.set(body.player, row.seq);
    } else globalCutoff = row.seq;
  }
  const counts = { draws: 0, eligibleMisses: 0, hits: 0, untargeted: 0, reset: 0, reverted: 0, alreadyCredited: 0, guaranteed: 0, excludedResetXP: 0 };
  const rows = [], source = [], warnings = [];
  const players = e.all(
    "SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.account_locked,a.xp,a.version,a.refinements,COALESCE(b.xp,0) AS bopXP FROM players p LEFT JOIN card_alchemy a ON a.player=p.id LEFT JOIN alchemy_bop_xp b ON b.player=p.id WHERE EXISTS(SELECT 1 FROM receipts r WHERE r.scope=p.id||':alchemy-draw') ORDER BY p.id",
  );
  for (const p of players) {
    const cutoff = Math.max(globalCutoff, cutoffs.get(p.id) || 0);
    let bonus = 0, misses = 0;
    // The scope/key index bounds each read to one player's draws. Do not scan
    // the full receipt/quiz ledger or infer misses from today's saved target.
    for (const row of e.all("SELECT rowid AS seq,key,input,result,at FROM receipts WHERE scope=? ORDER BY rowid", p.id + ":alchemy-draw")) {
      counts.draws++;
      let body, result;
      try { body = JSON.parse(row.input); result = JSON.parse(row.result); }
      catch { warnings.push(p.id + ":" + row.key + " has malformed history."); continue; }
      if (!body || typeof body !== "object" || !result || typeof result !== "object") {
        warnings.push(p.id + ":" + row.key + " has malformed history."); continue;
      }
      if (result.reverted === true) { counts.reverted++; continue; }
      if (row.seq <= cutoff || p.version === null) {
        counts.reset++;
        if (body.targetCard && result.targetHit === false && Number.isSafeInteger(result.xpSpent) && result.xpSpent > 0)
          counts.excludedResetXP += result.xpSpent / 10;
        if (p.version === null && row.seq > cutoff)
          warnings.push(p.id + ":" + row.key + " has history without active alchemy progress.");
        continue;
      }
      if (body.currency === "bop" || result.currency === "bop") { counts.guaranteed++; continue; }
      if (Object.hasOwn(result, "bopXPGained")) { counts.alreadyCredited++; continue; }
      if (!body.targetCard) { counts.untargeted++; continue; }
      if (result.targetHit === true) { counts.hits++; continue; }
      const cost = result.xpSpent, drawn = result.cards?.[0]?.id;
      const version = result.alchemyState?.version, refinements = result.alchemyState?.refinements;
      if (result.targetHit !== false || typeof body.targetCard !== "string" ||
          !drawn || drawn === body.targetCard || !Number.isSafeInteger(cost) || cost <= 0 || cost % 10 !== 0 ||
          !Number.isSafeInteger(body.expectedVersion) || version !== body.expectedVersion + 1 ||
          version > p.version || !Number.isSafeInteger(refinements) || refinements < 0 || refinements > p.refinements) {
        warnings.push(p.id + ":" + row.key + " needs historical draw review.");
        continue;
      }
      if (p.account_locked) {
        warnings.push(p.id + " has eligible history on a locked account.");
        continue;
      }
      bonus += cost / 10;
      misses++;
      source.push({ player: p.id, key: row.key, seq: row.seq, at: row.at,
        cutoff, target: body.targetCard, drawn, cost, version, refinements });
    }
    if (!misses) continue;
    if (!Number.isSafeInteger(p.version) || p.version >= Number.MAX_SAFE_INTEGER)
      warnings.push(p.id + " needs alchemy version maintenance.");
    if (!Number.isSafeInteger(bonus) || !Number.isSafeInteger(p.bopXP + bonus))
      warnings.push(p.id + " would exceed the bop XP balance limit.");
    counts.eligibleMisses += misses;
    rows.push({ player: p.id, name: p.name, misses, bonus,
      priorBopXP: p.bopXP, resultingBopXP: p.bopXP + bonus, normalXP: p.xp, priorVersion: p.version });
  }
  return { id: BOP_COMPENSATION_ID, players: rows.length,
    totalBopXP: rows.reduce((sum,row)=>sum+row.bonus,0), counts, rows, warnings, source };
}
export const bopCompensationSource = plan => JSON.stringify({ id: plan.id, source: plan.source });

export function applyBopCompensation(e, plan, expectedSource, sourceDigest, bookmark) {
  const saved = savedBopCompensation(e);
  if (saved) return saved;
  if (plan.id !== BOP_COMPENSATION_ID || bopCompensationSource(plan) !== expectedSource ||
      typeof bookmark !== "string" || !bookmark)
    fail("Use the reviewed bop XP compensation scope and recovery bookmark.", 409);
  const current = bopCompensationPlan(e);
  if (bopCompensationSource(current) !== expectedSource)
    fail("The historical draw evidence changed. Preview compensation again.", 409);
  if (current.warnings.length)
    fail("Historical bop XP needs review: " + current.warnings.join("; "), 409);
  // Recomputed balances are additive: normal live earnings/spending since the
  // preview are retained. A reset or reversal changes the source and aborts.
  for (const row of current.rows) {
    e.economy.alchemy.saveBopXP(row.player, row.resultingBopXP);
    e.run("UPDATE card_alchemy SET version=version+1 WHERE player=?", row.player);
    row.afterVersion = row.priorVersion + 1;
  }
  const { source, ...result } = current;
  Object.assign(result, { at: e.now(), sourceDigest, sourceReceipts: source.length, bookmark,
    message: "Historical target misses compensated with bop XP. Normal XP and credits were kept." });
  e.run("INSERT INTO alchemy_compensations VALUES(?,?,?)", BOP_COMPENSATION_ID, result.at, JSON.stringify(result));
  return result;
}
