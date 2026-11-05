import { fail } from "./engine.js";
const ID = "alchemy-xp-2026-11-05-v2";
function table(e) {
  e.run(
    "CREATE TABLE IF NOT EXISTS alchemy_compensations(id TEXT PRIMARY KEY,at INTEGER NOT NULL,result TEXT NOT NULL)",
  );
}
export function alchemyCompensation(e, apply = false) {
  table(e);
  const saved = e.one(
    "SELECT result FROM alchemy_compensations WHERE id=?",
    ID,
  );
  if (saved) return { ...JSON.parse(saved.result), alreadyApplied: true };
  const rows = [],
    warnings = [];
  for (const p of e.all(
    "SELECT a.*,COALESCE(p.display_name,p.name) AS name FROM card_alchemy a JOIN players p ON p.id=a.player WHERE a.refinements>0 ORDER BY a.player",
  )) {
    let left = p.refinements,
      originalXP = 0,
      oldRefinements = 0;
    // Most recent N physical refinements delimit the current reset lifecycle.
    // Replayed receipts exist once; batch totals are never counted twice.
    for (const receipt of e.all(
      "SELECT result FROM receipts WHERE scope=? ORDER BY at DESC,rowid DESC",
      p.player + ":alchemy-feed",
    )) {
      if (!left) break;
      const result = JSON.parse(receipt.result),
        outcomes = result.refinements || [result];
      if (outcomes.length > left) {
        warnings.push(
          p.player + ": refinement history crosses a reset boundary",
        );
        break;
      }
      for (const r of outcomes) {
        if (!Number.isSafeInteger(r.xpGained) || r.xpGained < 0) {
          warnings.push(p.player + ": invalid XP receipt");
          continue;
        }
        if ((r.xpRevision || result.xpRevision || 1) < 2) {
          originalXP += r.xpGained;
          oldRefinements++;
        }
      }
      left -= outcomes.length;
    }
    if (left)
      warnings.push(
        p.player + ": missing history for " + left + " refinements",
      );
    const bonus = originalXP / 2;
    if (!Number.isSafeInteger(bonus) || !Number.isSafeInteger(p.xp + bonus))
      warnings.push(p.player + ": invalid XP total");
    if (bonus)
      rows.push({
        player: p.player,
        name: p.name,
        priorXP: p.xp,
        refinements: p.refinements,
        oldRefinements,
        originalXP,
        bonus,
        resultXP: p.xp + bonus,
        priorVersion: p.version,
      });
  }
  const result = {
    id: ID,
    at: e.now(),
    players: rows.length,
    totalBonus: rows.reduce((s, r) => s + r.bonus, 0),
    rows,
    warnings,
  };
  if (!apply) return result;
  if (warnings.length)
    fail("Alchemy compensation needs review: " + warnings.join("; "), 409);
  for (const r of rows)
    e.run(
      "UPDATE card_alchemy SET xp=xp+?,version=version+1 WHERE player=?",
      r.bonus,
      r.player,
    );
  e.run(
    "INSERT INTO alchemy_compensations VALUES(?,?,?)",
    ID,
    result.at,
    JSON.stringify(result),
  );
  return result;
}
