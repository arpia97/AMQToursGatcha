import { RARITIES, cardInvestment } from "./card-values.js";

export const FUSION_REVISION = 3;
export const FUSION_ROLL_SCALE = 5120000;
export const FUSION_TIER_RULES = Object.freeze([
  { rarity: "D", contribution: 3500, cap: 5500 },
  { rarity: "C", contribution: 3700, cap: 5700 },
  { rarity: "B", contribution: 3900, cap: 5900 },
  { rarity: "A", contribution: 4100, cap: 6100 },
  { rarity: "S", contribution: 4300, cap: 6300 },
  { rarity: "SS", contribution: 4500, cap: 6500 },
  { rarity: "SSS", contribution: 4700, cap: 6800 },
  { rarity: "Ubers", contribution: 4800, cap: 7000 },
]);
export const FUSION_RESULTS = Object.freeze([
  { outcome: "upgrade", label: "Success", steps: 1, weight: 9000 },
  { outcome: "great", label: "Great Success", steps: 2, weight: 900 },
  { outcome: "erig", label: "Erig", steps: 3, weight: 100 },
]);
export const FUSION_DOWNGRADES = Object.freeze([
  { outcome: "downgrade", label: "Downgrade", steps: -1, weight: 9000 },
  { outcome: "downgrade2", label: "Double Downgrade", steps: -2, weight: 900 },
  { outcome: "downgrade3", label: "Triple Downgrade", steps: -3, weight: 100 },
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
  const rule = FUSION_TIER_RULES[top];
  if (!rule || top < index) invalid("Invalid fusion baseline.");
  return { upgrade: (rule.contribution * copies) / 2 ** (top - index), copies };
}
export function fusionQuote(materials) {
  if (!Array.isArray(materials) || materials.length < 1 || materials.length > 5)
    invalid("Choose between one and five fusion cards.");
  if (materials.some((m) => m.rarity === "AG"))
    invalid("AG cards cannot be used as fusion materials.");
  const baseline =
    RARITIES[Math.max(...materials.map((m) => RARITIES.indexOf(m.rarity)))];
  const contributions = materials.map((m) =>
    fusionContribution(m, m.level, baseline),
  );
  const rule = FUSION_TIER_RULES[RARITIES.indexOf(baseline)];
  const anchor = materials.findIndex((m) => m.rarity === baseline);
  const rawUpgrade =
    contributions.reduce((sum, p) => sum + p.upgrade, 0) - rule.contribution;
  const upgrade = Math.min(rule.cap, rawUpgrade);
  // Excess equivalent material still gets consumed. Every 4 excess percentage
  // points transfers 1 point from stay to downgrade, up to 20 points.
  const overload = Math.min(2000, Math.max(0, rawUpgrade - rule.cap) / 4);
  const stay = 3000 - overload;
  const downgrade = 10000 - upgrade - stay;
  const index = RARITIES.indexOf(baseline);
  const outcomes = FUSION_RESULTS.map((result) => ({
    ...result,
    rarity: RARITIES[Math.min(RARITIES.length - 1, index + result.steps)],
    chance: (upgrade * result.weight) / 10000,
  }));
  const downgrades = FUSION_DOWNGRADES.map((result) => ({
    ...result,
    rarity: RARITIES[Math.max(0, index + result.steps)],
    chance: (downgrade * result.weight) / 10000,
  }));
  return {
    revision: FUSION_REVISION,
    anchor,
    baseline,
    upgraded: outcomes[0].rarity,
    stay,
    upgrade,
    downgrade,
    overload,
    cap: rule.cap,
    contribution: rule.contribution,
    rawUpgrade,
    count: materials.length,
    investment: contributions.reduce((sum, p) => sum + p.copies, 0),
    outcomes,
    downgrades,
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
    "downgrade",
    "overload",
    "cap",
    "contribution",
    "rawUpgrade",
    "count",
    "investment",
  ].every((key) => expected?.[key] === actual[key]);
}
export function rollFusion(odds, rand) {
  const roll = rand(FUSION_ROLL_SCALE);
  const unit = FUSION_ROLL_SCALE / 10000;
  if (roll >= odds.upgrade * unit && roll < (odds.upgrade + odds.stay) * unit)
    return {
      outcome: "stay",
      label: "Same Tier",
      grade: odds.baseline,
      roll,
      qualityRoll: null,
    };
  const qualityRoll = rand(10000);
  const pool = roll < odds.upgrade * unit ? odds.outcomes : odds.downgrades;
  const result =
    qualityRoll < 9000 ? pool[0] : qualityRoll < 9900 ? pool[1] : pool[2];
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
