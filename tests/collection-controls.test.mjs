import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionView, collectionPage } from "../public/card-display.js";
import { createPinnedAnimeEditor } from "../public/pinned-anime-order.js";

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

test("pinned anime editor manages ordering, drag handles, rank inputs, dirty states and reset", () => {
  const pins = [
    { series_key: "s1", series_romaji: "Alpha Anime", owned: 2, total: 5 },
    { series_key: "s2", series_romaji: "Beta Anime", owned: 5, total: 5 },
    { series_key: "s3", series_romaji: "Gamma Anime", owned: 0, total: 3 },
  ];
  const editor = createPinnedAnimeEditor({
    series: (c) => c.series_romaji,
    escape: String,
  });
  editor.open(pins, "player-1");
  assert.equal(editor.activeFor("player-1"), true);
  assert.equal(editor.activeFor("player-2"), false);
  assert.equal(editor.dirty(), false);
  assert.deepEqual(editor.keys(), ["s1", "s2", "s3"]);

  // Move s3 to position 0
  assert.equal(editor.move("s3", 0), true);
  assert.equal(editor.dirty(), true);
  assert.deepEqual(editor.keys(), ["s3", "s1", "s2"]);

  // Drop s2 before s3
  assert.equal(editor.drop("s2", "s3", false), true);
  assert.deepEqual(editor.keys(), ["s2", "s3", "s1"]);

  // Reset
  editor.reset();
  assert.equal(editor.dirty(), false);
  assert.deepEqual(editor.keys(), ["s1", "s2", "s3"]);

  // Move again and check render
  editor.move("s1", 2);
  const html = editor.render();
  assert.match(html, /pinned-anime-arrange-panel/);
  assert.match(html, /Save Pinned Order/);
  assert.match(html, /data-pinned-anime-handle="s1"/);
  assert.match(html, /data-pinned-anime-rank="s1"/);
  assert.match(html, /data-pinned-anime-sort-card="s1"/);
  assert.match(html, /value="3"/);

  const payload = editor.payload("player-1");
  assert.deepEqual(payload.order, ["s2", "s3", "s1"]);
  assert.deepEqual(payload.expectedOrder, ["s1", "s2", "s3"]);

  editor.close();
  assert.equal(editor.activeFor("player-1"), false);
  assert.equal(editor.render(), "");
});
