import { RARITIES, cardInvestment } from "./card-values.js";

// Percentages are kept as integer basis points, including half-tier interpolation.
export const FUSION_STAY = [100, 200, 400, 800, 1200, 1600, 2400, 3200];
const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function fusionContribution(card, level = 1) {
  cardInvestment(level); // validates the enhancement range
  const index = RARITIES.indexOf(card.rarity);
  if (index < 0)
    invalid("Pending cards cannot be fused until their rarity is known.");
  if (card.rarity === "AG")
    invalid("AG cards cannot be used as fusion materials.");
  const position = index + (level - 1) / 2,
    low = Math.floor(position);
  // Virtual probability tiers beyond Ubers double per full tier; the card's
  // actual rarity and the result's one-tier upgrade are unchanged.
  const at = (i) =>
    i < FUSION_STAY.length
      ? FUSION_STAY[i]
      : FUSION_STAY.at(-1) * 2 ** (i - FUSION_STAY.length + 1);
  const stay = position === low ? at(low) : (at(low) + at(low + 1)) / 2;
  return { stay, upgrade: stay / 2 };
}
export function fusionQuote(materials) {
  if (!Array.isArray(materials) || materials.length < 1 || materials.length > 5)
    invalid("Choose between one and five fusion cards.");
  let baseline = -1,
    stay = 0,
    upgrade = 0;
  for (const m of materials) {
    const p = fusionContribution(m, m.level);
    baseline = Math.max(baseline, RARITIES.indexOf(m.rarity));
    stay += p.stay;
    upgrade += p.upgrade;
  }
  if (materials.length < 2) upgrade = 0;
  if (stay + upgrade > 10000)
    invalid(
      "This board exceeds the 100% total chance limit. Remove a card or use a lower level.",
    );
  return {
    baseline: RARITIES[baseline],
    upgraded: RARITIES[baseline + 1],
    stay,
    upgrade,
    break: 10000 - stay - upgrade,
    count: materials.length,
  };
}
export const chanceText = (bp) =>
  (bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
