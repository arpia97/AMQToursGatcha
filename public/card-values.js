export const RARITIES = ["D", "C", "B", "A", "S", "SS", "SSS", "Ubers", "AG"];
export const SHOP_PRICE_REVISION = 1;
export const SHOP_PRICES = Object.freeze({
  ...Object.fromEntries(RARITIES.map((r, i) => [r, 50 * 2 ** i])),
  Pending: 50,
});

export const MAX_CARD_LEVEL = 6;
export const ENHANCEMENT_REVISION = 2;
export const LEVEL_INVESTMENTS = Object.freeze([0, 1, 3, 6, 10, 15, 21]);
export function cardInvestment(level = 1) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CARD_LEVEL)
    throw Object.assign(new Error("Invalid card enhancement level."), {
      status: 400,
    });
  return LEVEL_INVESTMENTS[level];
}
export function enhancementCost(level) {
  cardInvestment(level);
  return level >= MAX_CARD_LEVEL ? null : level + 1;
}
export function levelLabel(level = 1) {
  return level >= MAX_CARD_LEVEL ? "MAX" : "Lv. " + level;
}
export function convertLegacyLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > 20)
    throw Error("Invalid legacy enhancement level.");
  const copies = 2 ** (level - 1);
  let next = MAX_CARD_LEVEL;
  while (LEVEL_INVESTMENTS[next] > copies) next--;
  return {
    level: next,
    extraCopies: copies - LEVEL_INVESTMENTS[next],
    invested: copies,
  };
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
