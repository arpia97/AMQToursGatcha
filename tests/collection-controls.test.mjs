import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionView, collectionPage } from "../public/card-display.js";
import { createWorkshop } from "../public/workshop-ui.js";
import { fusionOutcomesPage } from "../public/fusion-outcomes.js";

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
test("fusion popup selection supports sparse slots, replacement, cancel, and validates physical copies", () => {
  const cards = [
    { id: "d", kind: "character", rarity: "D", name: "D Card" },
    { id: "c", kind: "seiyuu", rarity: "C", name: "C Actor" },
    { id: "ag", kind: "character", rarity: "AG", name: "AG Card" },
  ];
  const state = {
    me: { id: "p" },
    inventory: [
      { card: "d", copies: 2, level: 1 },
      { card: "c", copies: 1, level: 2 },
      { card: "ag", copies: 1, level: 1 },
    ],
  };
  const h = {
    getState: () => state,
    cardBy: (id) => cards.find((c) => c.id === id),
    escape: String,
    number: String,
    cardHTML: (c) => c.name,
    image: (c) => c.name,
    gradeBadge: (c) => c.rarity,
    btn: (label, action) => `<button data-action="${action}">${label}</button>`,
    empty: () => "",
  };
  const w = createWorkshop(h);
  w.openPicker(4);
  assert.match(w.renderPicker(), /Slot 5/);
  w.add({ card: "d", variant: "card" });
  w.closePicker();
  assert.match(w.render(), /Change material in slot 5: D Card/);
  assert.equal(w.request().cards.length, 1);
  w.openPicker(4);
  w.add({ card: "c", variant: "card" });
  w.closePicker();
  assert.equal(w.request().cards[0].card, "c");
  assert.match(w.render(), /Seiyuus only/);
  w.openPicker(0);
  assert.throws(
    () => w.add({ card: "c", variant: "card" }),
    /no longer available/,
  );
  w.closePicker();
  assert.equal(w.request().cards.length, 1);
  w.openPicker(0);
  w.add({ card: "d", variant: "extra" });
  w.closePicker();
  assert.match(w.render(), /Characters \+ seiyuus/);
  w.openPicker(1);
  assert.throws(() => w.add({ card: "ag", variant: "card" }), /AG/);
  w.closePicker();
  assert.equal(w.request().cards.length, 2);
  assert.equal(state.inventory[0].copies, 2);
  w.remove(4);
  assert.equal(w.request().cards[0].card, "d");
  w.clear();
  assert.equal(w.pickerOpen(), false);
});
test("fusion target choices load after the first material, follow mixed pools, persist across paging and clear when no longer eligible", async () => {
  const cards = [
    { id: "d", kind: "character", rarity: "D", name: "Material" },
    { id: "actor-d", kind: "seiyuu", rarity: "D", name: "Actor material" },
    ...Array.from({ length: 15 }, (_, i) => ({
      id: "c" + i,
      kind: i === 14 ? "seiyuu" : "character",
      rarity: "C",
      name: "Outcome " + String(i).padStart(2, "0"),
    })),
  ];
  const state = {
    me: { id: "p" },
    inventory: [
      { card: "d", copies: 2, level: 1 },
      { card: "actor-d", copies: 1, level: 1 },
    ],
  };
  const w = createWorkshop({
    getState: () => state,
    cardBy: (id) => cards.find((c) => c.id === id),
    escape: String,
    number: String,
    cardHTML: (c) => c.name,
    image: (c) => c.name,
    gradeBadge: (c) => c.rarity,
    btn: (label) => label,
    empty: () => "",
  });
  const api = async (path) => {
    const p = new URLSearchParams(path.split("?")[1]);
    return fusionOutcomesPage(cards, {
      rarity: p.get("rarity"),
      kind: p.get("kind"),
      query: p.get("q"),
      page: Number(p.get("page")),
    });
  };
  assert.equal(await w.loadOutcomes(api), null);
  w.add({ card: "d", variant: "card" });
  assert.equal((await w.loadOutcomes(api)).eligibleTotal, 14);
  w.chooseTarget("c0");
  assert.equal(w.request().targetCard, undefined);
  w.add({ card: "d", variant: "extra" });
  await w.loadOutcomes(api);
  assert.equal(w.request().targetCard, "c0");
  w.outcomeFilter("page", 1);
  await w.loadOutcomes(api);
  assert.equal(w.request().targetCard, "c0");
  w.add({ card: "actor-d", variant: "card" });
  assert.equal((await w.loadOutcomes(api)).eligibleTotal, 15);
  w.outcomeFilter("query", "14");
  await w.loadOutcomes(api);
  w.chooseTarget("c14");
  assert.equal(w.request().targetCard, "c14");
  w.remove(2);
  await w.loadOutcomes(api);
  assert.equal(w.request().targetCard, undefined);
  w.clear();
  assert.equal(await w.loadOutcomes(api), null);
});
