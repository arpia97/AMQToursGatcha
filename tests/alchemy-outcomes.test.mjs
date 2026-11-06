import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionOutcomesPage } from "../public/fusion-outcomes.js";

test("Alchemy target pages combine types, search both titles and retain full eligible counts", () => {
  const cards = Array.from({ length: 31 }, (_, i) => ({
    id: String(i),
    name: String(i).padStart(2, "0"),
    kind: i % 2 ? "seiyuu" : "character",
    rarity: i === 30 ? "D" : "C",
    series_romaji: "Anime",
    series_english: i === 2 ? "Special" : "English",
  }));
  const p1 = fusionOutcomesPage(cards, { rarity: "C" }),
    p2 = fusionOutcomesPage(cards, { rarity: "C", page: 2 });
  assert.equal(p1.cards.length, 12);
  assert.equal(p1.eligibleTotal, 30);
  assert.equal(p1.hasMore, true);
  assert.ok(!p1.cards.some((c) => p2.cards.some((x) => x.id === c.id)));
  const one = fusionOutcomesPage(cards, {
    rarity: "C",
    kind: "character",
    query: "special",
  });
  assert.equal(one.total, 1);
  assert.equal(one.eligibleTotal, 15);
  assert.equal(one.cards[0].id, "2");
  assert.equal(fusionOutcomesPage(cards, { rarity: "C", page: 999 }).page, 3);
  for (const options of [
    { rarity: "Pending" },
    { rarity: "C", kind: "unknown" },
    { rarity: "C", page: 0 },
  ])
    assert.throws(() => fusionOutcomesPage(cards, options));
});
