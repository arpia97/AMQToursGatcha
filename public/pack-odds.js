export const PREMIUM_RULE = {
  boosted: ["AG", "Ubers", "SSS", "SS"],
  multiplier: 2,
  from: "D",
};

export function premiumPool(cards) {
  const high = cards.filter((c) => PREMIUM_RULE.boosted.includes(c.rarity));
  const d = cards.filter((c) => c.rarity === "D").length;
  if (high.length > d)
    throw Object.assign(
      new Error(
        "Premium packs are temporarily unavailable: not enough D cards to fund the rare-tier boost.",
      ),
      { status: 409 },
    );
  if (!cards.length)
    throw Object.assign(new Error("This card pool is empty."), { status: 409 });
  return { cards, high, d };
}

export function drawPremium({ cards, high, d }, rand) {
  let c = cards[rand(cards.length)];
  // Redirect H/D of D draws to a uniformly chosen above-S card.
  // Each high card becomes 2/N; all non-D lower tiers stay at 1/N.
  if (c.rarity === "D" && high.length && rand(d) < high.length)
    c = high[rand(high.length)];
  return c;
}
