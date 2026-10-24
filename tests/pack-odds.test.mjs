import { test } from "node:test";
import assert from "node:assert/strict";
import { premiumPool, drawPremium } from "../public/pack-odds.js";

test("premium exactly doubles every S-through-AG card, funding it only from D", () => {
  const cards = [
    "AG",
    "Ubers",
    "SSS",
    "SS",
    "S",
    "A",
    "B",
    "C",
    "Pending",
    ...Array(6).fill("D"),
  ].map((rarity, i) => ({ id: String(i), rarity }));
  const pool = premiumPool(cards),
    counts = Array(cards.length).fill(0);
  // Enumerate all possible random branches, including unused rolls, for an exact
  // probability proof without a flaky Monte Carlo assertion.
  for (let i = 0; i < cards.length; i++)
    for (let d = 0; d < 6; d++)
      for (let h = 0; h < 5; h++) {
        const rolls = [i, d, h];
        const c = drawPremium(pool, () => rolls.shift());
        counts[Number(c.id)]++;
      }
  assert.deepEqual(counts.slice(0, 5), [60, 60, 60, 60, 60]);
  assert.deepEqual(counts.slice(5, 9), [30, 30, 30, 30]);
  assert.deepEqual(counts.slice(9), Array(6).fill(5));
  assert.equal(
    counts.reduce((a, b) => a + b),
    cards.length * 6 * 5,
  );
});
test("premium works with Pending cards, permits all-D mass to be reassigned, and rejects unfundable odds", () => {
  const p = { id: "p", rarity: null };
  assert.equal(
    drawPremium(premiumPool([p]), () => 0),
    p,
  );
  const balanced = premiumPool([
    { id: "a", rarity: "SS" },
    { id: "d", rarity: "D" },
  ]);
  const rolls = [1, 0, 0];
  assert.equal(drawPremium(balanced, () => rolls.shift()).id, "a");
  assert.throws(() => premiumPool([{ rarity: "AG" }]), /not enough D/);
});
