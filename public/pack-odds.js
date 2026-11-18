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
export const SPECIAL_PACK_RULE = Object.freeze({price:3000,cards:10,premiumDraws:9,
  guaranteed:Object.freeze({S:60,SS:24,SSS:8,Ubers:7,AG:1})});
export function specialPool(cards){
  const premium=premiumPool(cards),tiers=Object.fromEntries(Object.keys(SPECIAL_PACK_RULE.guaranteed).map(rarity=>[rarity,cards.filter(card=>card.rarity===rarity)]));
  if(Object.values(tiers).some(pool=>!pool.length))throw Object.assign(Error('Special Card Packs are temporarily unavailable: every S-and-over rarity must have cards.'),{status:409});
  return {premium,tiers};
}
export function drawSpecialGuaranteed({tiers},rand){
  let roll=rand(100);
  for(const [rarity,weight] of Object.entries(SPECIAL_PACK_RULE.guaranteed)){
    if(roll<weight){const pool=tiers[rarity];return pool[rand(pool.length)];}
    roll-=weight;
  }
  throw Error('Invalid Special Card Pack roll.');
}
export function drawSpecialPack(pool,rand){
  return [...Array.from({length:SPECIAL_PACK_RULE.premiumDraws},()=>drawPremium(pool.premium,rand)),drawSpecialGuaranteed(pool,rand)];
}
