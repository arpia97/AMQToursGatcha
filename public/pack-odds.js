export const PREMIUM_RULE = {
  boosted: ["AG", "Ubers", "SSS", "SS", "S"],
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
  // Redirect H/D of D draws to a uniformly chosen S-or-higher card.
  // Each high card becomes 2/N; all non-D lower tiers stay at 1/N.
  if (c.rarity === "D" && high.length && rand(d) < high.length)
    c = high[rand(high.length)];
  return c;
}

// Paid Special Card Pack; independent of the historical one-time bonus gift.
export const SPECIAL_PACK_RULE = Object.freeze({
  revision: 3, price: 3000, cards: 10, premiumDraws: 8, guaranteedDraws: 2,
  weights: Object.freeze({ S: 60, SS: 24, SSS: 8, Ubers: 7, AG: 1 }),
});
export const SPECIAL_PACK_DESCRIPTION = "2 guaranteed S-or-higher cards and 8 premium draws.";

export function specialPool(cards) {
  const premium = premiumPool(cards);
  const guaranteed = Object.entries(SPECIAL_PACK_RULE.weights).map(([rarity, weight]) => ({
    weight, cards: cards.filter(card => card.rarity === rarity),
  }));
  if (guaranteed.some(tier => !tier.cards.length))
    throw Object.assign(Error("Special Card Packs are temporarily unavailable: every S-or-higher tier needs cards."), { status: 409 });
  return { premium, guaranteed };
}
export function drawSpecialGuaranteed(guaranteed, rand) {
  let roll = rand(100);
  for (const { weight, cards } of guaranteed) {
    if (roll < weight) return cards[rand(cards.length)];
    roll -= weight;
  }
  throw Error("Invalid Special Card Pack roll.");
}

export function drawSpecialPack({ premium, guaranteed }, rand) {
  return [
    ...Array.from({ length: SPECIAL_PACK_RULE.premiumDraws }, () => drawPremium(premium, rand)),
    ...Array.from({ length: SPECIAL_PACK_RULE.guaranteedDraws }, () => drawSpecialGuaranteed(guaranteed, rand)),
  ];
}
