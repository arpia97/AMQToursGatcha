import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionView, collectionPage } from "../public/card-display.js";

test("collection combines rarity, character role, bilingual search and independent inventory sorts", () => {
  const cards = [
    {
      id: "a",
      name: "Alpha",
      kind: "character",
      rarity: "SS",
      role: "main",
      series_english: "English story",
    },
    {
      id: "b",
      name: "Beta",
      kind: "character",
      rarity: "SS",
      role: "supporting",
    },
    { id: "c", name: "Gamma", kind: "character", rarity: null, role: "main" },
    { id: "v", name: "Voice", kind: "seiyuu", rarity: "SS" },
  ];
  const inventory = cards.map((c, i) => ({
    card: c.id,
    copies: i + 1,
    level: 4 - i,
    acquired_at: i,
  }));
  const by = (id) => cards.find((c) => c.id === id),
    view = (opts) =>
      collectionView(inventory, by, { kind: "character", ...opts }).map(
        (i) => i.card,
      );
  assert.deepEqual(view({ rarity: "SS", role: "main", query: "english" }), [
    "a",
  ]);
  assert.deepEqual(view({ rarity: "Pending" }), ["c"]);
  assert.deepEqual(view({ role: "supporting" }), ["b"]);
  assert.deepEqual(view({ sort: "collected" }), ["c", "b", "a"]);
  assert.deepEqual(view({ sort: "copies" }), ["c", "b", "a"]);
  assert.deepEqual(view({ sort: "level" }), ["a", "b", "c"]);
  assert.deepEqual(view({ sort: "name-desc" }), ["c", "b", "a"]);
  assert.deepEqual(view({ kind: "seiyuu", role: "main", rarity: "SS" }), ["v"]);
  assert.deepEqual(view({ kind: "both", sort: "name" }), ["a", "b", "c", "v"]);
  inventory[0].protected = 1;
  inventory[3].protected = 1;
  assert.deepEqual(view({ hideProtected: true }), ["b", "c"]);
  assert.deepEqual(view({ hideProtected: true, kind: "seiyuu" }), []);
  assert.deepEqual(view({ hideProtected: false, kind: "seiyuu" }), ["v"]);
  assert.deepEqual(
    inventory.map((i) => i.card),
    ["a", "b", "c", "v"],
  );
});
test("collection pages are bounded without omissions, and clamp after filtering or selling", () => {
  const items = Array.from({ length: 121 }, (_, id) => ({ id }));
  const pages = [1, 2, 3, 4].map((n) => collectionPage(items, n));
  assert.deepEqual(
    pages.map((p) => p.items.length),
    [40, 40, 40, 1],
  );
  assert.equal(
    new Set(pages.flatMap((p) => p.items.map((i) => i.id))).size,
    121,
  );
  assert.deepEqual(
    pages.map((p) => p.hasMore),
    [true, true, true, false],
  );
  assert.equal(collectionPage(items.slice(0, 2), 4).page, 1);
  assert.equal(collectionPage([], 500).page, 1);
  assert.deepEqual(collectionPage([], 1).items, []);
});
