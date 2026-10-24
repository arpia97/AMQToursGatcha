export const RARITIES = ["D", "C", "B", "A", "S", "SS", "SSS", "Ubers", "AG"];
export const SHOP_PRICES = Object.freeze({
  ...Object.fromEntries(RARITIES.map((r, i) => [r, 100 * 2 ** i])),
  Pending: 100,
});

export function cardInvestment(level = 1) {
  if (!Number.isSafeInteger(level) || level < 1 || level > 20)
    throw Object.assign(new Error("Invalid card enhancement level."), {
      status: 400,
    });
  return 2 ** (level - 1);
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
