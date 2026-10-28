import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fusionOutcomesPage,
  fusionTarget,
  drawFusionResult,
} from "../public/fusion-outcomes.js";
import {
  SITE_ROUTES,
  resolvePage,
  navigationSection,
} from "../public/site-navigation.js";
test("target draw gives exactly half the mass to the target and shares the rest among other outcomes", () => {
  const pool = [{ id: "a" }, { id: "target" }, { id: "b" }, { id: "c" }];
  const counts = {};
  for (const coin of [0, 1])
    for (let i = 0; i < 3; i++) {
      const values = [coin, i],
        c = drawFusionResult(pool, pool[1], () => values.shift());
      counts[c.id] = (counts[c.id] || 0) + 1;
    }
  assert.deepEqual(counts, { target: 3, a: 1, b: 1, c: 1 });
  assert.equal(fusionTarget(pool, "target"), pool[1]);
  assert.equal(fusionTarget(undefined, null), null);
  assert.throws(() => fusionTarget([pool[1]], "target"), /only one/);
});
test("possible fusion outcomes paginate12 cards, combine types, search both titles and report total eligible independently of search", () => {
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
test("navigation separates catalogue and own profile, retains public/collection links and always ends with Rankings", () => {
  assert.equal(resolvePage("#catalog"), "catalog");
  assert.equal(resolvePage("#profile"), "profile");
  assert.equal(resolvePage("#collection"), "collection");
  assert.equal(resolvePage("#player/368"), "player");
  assert.equal(resolvePage("#invalid"), "home");
  assert.equal(navigationSection("collection", "368"), "profile");
  assert.equal(navigationSection("player", "368", "368"), "profile");
  assert.equal(navigationSection("player", "368", "357"), "players");
  assert.equal(SITE_ROUTES.at(-1)[0], "ranks");
  assert.ok(!SITE_ROUTES.some(([id]) => id === "collection"));
});
