export const RARITIES = ["D", "C", "B", "A", "S", "SS", "SSS", "Ubers", "AG"];
export const SHOP_PRICE_REVISION = 1;
export const SHOP_PRICES = Object.freeze({
  ...Object.fromEntries(RARITIES.map((r, i) => [r, 50 * 2 ** i])),
  Pending: 50,
});

export const MAX_CARD_LEVEL = 6;
export const MIN_TITLE_UPGRADE_CARDS = 8;
export const ENHANCEMENT_REVISION = 3;
export const LEVEL_INVESTMENTS = Object.freeze([0, 1, 2, 4, 7, 11, 16]);
export const REVISION_2_INVESTMENTS = Object.freeze([0, 1, 3, 6, 10, 15, 21]);
export function cardInvestment(level = 1) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CARD_LEVEL)
    throw Object.assign(new Error("Invalid card enhancement level."), {
      status: 400,
    });
  return LEVEL_INVESTMENTS[level];
}
export function enhancementCost(level) {
  cardInvestment(level);
  return level >= MAX_CARD_LEVEL ? null : level;
}
export function levelLabel(level = 1) {
  return level >= MAX_CARD_LEVEL ? "MAX" : "Lv. " + level;
}
function convertInvestment(copies, investments) {
  let next = MAX_CARD_LEVEL;
  while (investments[next] > copies) next--;
  return {
    level: next,
    extraCopies: copies - investments[next],
    invested: copies,
  };
}
export function convertLegacyLevel(level, investments = LEVEL_INVESTMENTS) {
  if (!Number.isInteger(level) || level < 1 || level > 20)
    throw Error("Invalid legacy enhancement level.");
  return convertInvestment(2 ** (level - 1), investments);
}
export function convertRevision2Level(level) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CARD_LEVEL)
    throw Error("Invalid revision-2 enhancement level.");
  return convertInvestment(REVISION_2_INVESTMENTS[level], LEVEL_INVESTMENTS);
}
export function instantSalePrice(card, level = 1) {
  const grade = card.rarity || "Pending";
  const price = Object.hasOwn(SHOP_PRICES, grade) ? SHOP_PRICES[grade] : null;
  if (!price)
    throw Object.assign(new Error("This card has no sale price."), {
      status: 400,
    });
  return (price / 2) * cardInvestment(level);
}
