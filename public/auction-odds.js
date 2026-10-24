export const AUCTION_WEIGHTS = Object.freeze({
  AG: 3,
  Ubers: 7,
  SSS: 15,
  SS: 20,
  S: 20,
  A: 15,
  B: 10,
  C: 7,
  D: 3,
});

// Choose a tier first, then a card uniformly within that tier. Renormalize
// available tiers as unique cards leave the pool. Pending is a bootstrap fallback.
export function drawAuction(cards, rand, excluded = new Set()) {
  const available = cards.filter((c) => !excluded.has(c.id));
  const groups = Object.entries(AUCTION_WEIGHTS)
    .map(([tier, weight]) => ({
      weight,
      cards: available.filter((c) => c.rarity === tier),
    }))
    .filter((g) => g.cards.length);
  if (!groups.length) {
    if (!available.length) throw new Error("No auction cards available.");
    return available[rand(available.length)];
  }
  let roll = rand(groups.reduce((n, g) => n + g.weight, 0));
  for (const group of groups) {
    if (roll < group.weight) return group.cards[rand(group.cards.length)];
    roll -= group.weight;
  }
}

export function drawFeatured(cards, rand) {
  const pool = cards.filter((c) => ["SSS", "Ubers", "AG"].includes(c.rarity));
  const selected = [];
  while (pool.length && selected.length < 3)
    selected.push(pool.splice(rand(pool.length), 1)[0]);
  return selected;
}
