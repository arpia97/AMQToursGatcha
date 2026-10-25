export const GEM_CLICK_PRICE = 50;
export const GEM_PAYOUT_FACTOR = 45;
export function gemValue(good, bad) {
  return Math.max(0, GEM_PAYOUT_FACTOR * (good * good - bad * bad));
}
export function gemCounts(game) {
  return {
    good: game.good.filter(Boolean).length,
    bad: game.bad.filter(Boolean).length,
  };
}
export function nextFacetChance(chance, success) {
  return Math.max(25, Math.min(75, chance + (success ? -10 : 10)));
}
