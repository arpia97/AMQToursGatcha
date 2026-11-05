import { RARITIES, cardInvestment } from "./card-values.js";
export const ALCHEMY_XP_REVISION = 2;
export const ALCHEMY_TIERS = RARITIES.map((rarity, index) => ({
  rarity,
  cost: 50 * 2 ** index,
  xp: 15 * 2 ** index,
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
export function refinementQueue(entries, inventory, cardBy, refinements = 0) {
  if (!Array.isArray(entries) || entries.length > 100)
    throw Error("Select up to 100 cards per batch.");
  const remaining = new Map(inventory.map((i) => [i.card, { ...i }])),
    counts = new Map();
  for (const entry of entries) {
    if (!entry || !["extra", "card"].includes(entry.variant))
      throw Error("Choose an owned copy.");
    const count = counts.get(entry.card) || { extra: 0, card: 0 };
    count[entry.variant]++;
    counts.set(entry.card, count);
  }
  for (const [id, count] of counts) {
    const item = remaining.get(id);
    if (
      !item ||
      count.card > 1 ||
      count.extra > item.copies - 1 ||
      count.extra + count.card > item.copies
    )
      throw Error("A selected copy is no longer available.");
  }
  return entries.map((entry, index) => {
    const item = remaining.get(entry.card),
      c = cardBy(entry.card);
    if (!c || !item?.copies)
      throw Error("A selected card is no longer available.");
    if (item.protected) throw Error("A selected card is protected.");
    const variant =
        entry.variant === "extra" && item.copies === 1 ? "card" : entry.variant,
      level = variant === "extra" ? 1 : item.level;
    item.copies--;
    if (variant === "card") item.level = 1;
    return {
      ...c,
      variant,
      ...refinementQuote(c.rarity, level, refinements + index),
    };
  });
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
export function autoRefinementPlan(
  inventory,
  cardBy,
  count,
  maxRarity,
  refinements = 0,
) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw Error("Choose between 1 and 100 cards.");
  const cap = RARITIES.indexOf(maxRarity);
  if (cap < 0) throw Error("Choose a maximum rarity.");
  const pool = inventory
    .filter((i) => !i.protected)
    .map((i) => ({ ...i, c: cardBy(i.card), base: true, extras: i.copies - 1 }))
    .filter(
      (i) =>
        i.c &&
        RARITIES.indexOf(i.c.rarity) >= 0 &&
        RARITIES.indexOf(i.c.rarity) <= cap,
    );
  if (pool.reduce((n, i) => n + i.copies, 0) < count)
    throw Error("Not enough unprotected cards within that rarity limit.");
  const plan = [];
  for (let turn = 0; turn < count; turn++) {
    const lucky = (refinements + turn + 1) % 6 === 0;
    const options = pool.flatMap((i) => [
      ...(i.base ? [{ i, variant: "card", level: i.level }] : []),
      ...(i.extras > 0 ? [{ i, variant: "extra", level: 1 }] : []),
    ]);
    options.sort((a, b) => {
      const rarity =
        RARITIES.indexOf(a.i.c.rarity) - RARITIES.indexOf(b.i.c.rarity);
      const xp =
        refinementQuote(a.i.c.rarity, a.level).baseXP -
        refinementQuote(b.i.c.rarity, b.level).baseXP;
      return (
        (lucky ? -1 : 1) * (rarity || xp) ||
        (a.variant === "extra" ? -1 : 1) - (b.variant === "extra" ? -1 : 1) ||
        a.i.card.localeCompare(b.i.card)
      );
    });
    const choice = options[0];
    plan.push({ card: choice.i.card, variant: choice.variant });
    if (choice.variant === "extra") choice.i.extras--;
    else choice.i.base = false;
  }
  refinementQueue(plan, inventory, cardBy, refinements);
  return plan;
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
