import { RARITIES, cardInvestment } from "./card-values.js";
export const ALCHEMY_TIERS = RARITIES.map((rarity, index) => ({
  rarity,
  cost: 50 * 2 ** index,
  xp: 10 * 2 ** index,
}));
export const ALCHEMY_OUTCOMES = [
  {
    outcome: "success",
    label: "Success",
    multiplier: 1,
    chance: 90,
    luckyChance: 50,
  },
  {
    outcome: "great",
    label: "Great Success",
    multiplier: 2,
    chance: 9,
    luckyChance: 45,
  },
  { outcome: "erig", label: "Erig", multiplier: 5, chance: 1, luckyChance: 5 },
];
export function refinementQuote(rarity, level = 1, refinements = 0) {
  const tier = ALCHEMY_TIERS.find((t) => t.rarity === rarity);
  if (!tier)
    throw Error("This card needs a classified rarity before refinement.");
  if (
    !Number.isSafeInteger(refinements) ||
    refinements < 0 ||
    refinements >= Number.MAX_SAFE_INTEGER
  )
    throw Error("Invalid refinement count.");
  const investment = cardInvestment(level),
    baseXP = tier.xp * investment,
    lucky = (refinements + 1) % 6 === 0;
  return {
    rarity,
    level,
    investment,
    baseXP,
    lucky,
    next: refinements + 1,
    outcomes: ALCHEMY_OUTCOMES.map((o) => ({
      ...o,
      chance: lucky ? o.luckyChance : o.chance,
      xp: baseXP * o.multiplier,
    })),
  };
}
export function rollRefinement(quote, rand) {
  const roll = rand(100);
  let bound = 0;
  for (const outcome of quote.outcomes) {
    bound += outcome.chance;
    if (roll < bound) return { ...outcome, roll };
  }
  throw Error("Invalid refinement roll.");
}
export function drawAlchemyCard(pool, target, rand) {
  if (!pool.length) throw Error("No cards are available at this rarity.");
  if (!target || pool.length === 1) return pool[rand(pool.length)];
  if (rand(2) === 0) return target;
  const index = pool.findIndex((c) => c.id === target.id),
    choice = rand(pool.length - 1);
  if (index < 0) throw Error("Choose a valid target card.");
  return pool[choice >= index ? choice + 1 : choice];
}
export function applyAlchemyPatch(state, result) {
  if (!result.alchemyState) return null;
  const patch = result.collectionPatch;
  if (!patch) return state;
  const changed = new Map(patch.inventory.map((i) => [i.card, i]));
  const inventory = state.inventory
    .filter((i) => !changed.has(i.card))
    .concat(patch.inventory.filter((i) => !i.removed));
  return { ...state, inventory, me: patch.me, showcase: patch.showcase };
}
