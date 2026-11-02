import { RARITIES, cardInvestment } from "./card-values.js";

export const FUSION_REVISION = 2;
export const FUSION_ROLL_SCALE = 1280000;

export const FUSION_RESULTS = Object.freeze([
  { outcome: "upgrade", label: "Success", steps: 1, weight: 9000 },
  { outcome: "great", label: "Great Success", steps: 2, weight: 900 },
  { outcome: "erig", label: "Erig", steps: 3, weight: 100 },
]);
const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function fusionContribution(card, level = 1, baseline = card.rarity) {
  const copies = cardInvestment(level),
    index = RARITIES.indexOf(card.rarity),
    top = RARITIES.indexOf(baseline);
  if (index < 0)
    invalid("Pending cards cannot be fused until their rarity is known.");
  if (card.rarity === "AG")
    invalid("AG cards cannot be used as fusion materials.");
  if (top < index) invalid("Invalid fusion baseline.");
  return { upgrade: (5000 * copies) / 2 ** (top - index), copies };
}
export function fusionQuote(materials) {
  if (!Array.isArray(materials) || materials.length < 1 || materials.length > 5)
    invalid("Choose between one and five fusion cards.");
  const baseline =
    RARITIES[Math.max(...materials.map((m) => RARITIES.indexOf(m.rarity)))];
  const contributions = materials.map((m) =>
    fusionContribution(m, m.level, baseline),
  );
  const anchor = materials.findIndex((m) => m.rarity === baseline);
  const rawUpgrade =
    contributions.reduce((sum, p) => sum + p.upgrade, 0) - 5000;
  const upgrade = Math.min(10000, rawUpgrade);
  const index = RARITIES.indexOf(baseline);
  const outcomes = FUSION_RESULTS.map((result) => ({
    ...result,
    rarity: RARITIES[Math.min(RARITIES.length - 1, index + result.steps)],
    chance: (upgrade * result.weight) / 10000,
  }));
  return {
    revision: FUSION_REVISION,
    anchor,
    baseline,
    upgraded: outcomes[0].rarity,
    stay: 10000 - upgrade,
    upgrade,
    rawUpgrade,
    count: materials.length,
    investment: contributions.reduce((sum, p) => sum + p.copies, 0),
    outcomes,
  };
}
export function fusionOddsMatch(expected, actual) {
  return [
    "revision",
    "anchor",
    "baseline",
    "upgraded",
    "stay",
    "upgrade",
    "rawUpgrade",
    "count",
    "investment",
  ].every((key) => expected?.[key] === actual[key]);
}
export function rollFusion(odds, rand) {
  // 128 units per basis point preserve even the smallest cross-tier contribution.
  const roll = rand(FUSION_ROLL_SCALE);
  if (roll >= odds.upgrade * 128)
    return {
      outcome: "stay",
      label: "Same Tier",
      grade: odds.baseline,
      roll,
      qualityRoll: null,
    };
  const qualityRoll = rand(10000);
  const result =
    qualityRoll < 9000
      ? odds.outcomes[0]
      : qualityRoll < 9900
        ? odds.outcomes[1]
        : odds.outcomes[2];
  return {
    outcome: result.outcome,
    label: result.label,
    grade: result.rarity,
    roll,
    qualityRoll,
  };
}
export const chanceText = (bp) =>
  (bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
