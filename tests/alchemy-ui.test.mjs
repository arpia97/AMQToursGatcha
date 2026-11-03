import test from "node:test";
import assert from "node:assert/strict";
import { createAlchemyUI } from "../public/alchemy-ui.js";
const escape = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function fixture() {
  const cards = [
      { id: "a", name: "<Alchemy>", rarity: "AG", kind: "character" },
      { id: "d", name: "D Card", rarity: "D", kind: "seiyuu" },
    ],
    state = {
      me: { id: "p" },
      inventory: [
        { card: "a", copies: 2, level: 4 },
        { card: "d", copies: 1, level: 1 },
      ],
    };
  const ui = createAlchemyUI({
    escape,
    number: (n) => String(n),
    getState: () => state,
    cardBy: (id) => cards.find((c) => c.id === id),
    image: (c) => '<img alt="' + escape(c.name) + '">',
    gradeBadge: () => "",
    cardHTML: (c) => "<article>" + escape(c.name) + "</article>",
    btn: (label, action, extra = "") =>
      '<button data-action="' +
      action +
      '" ' +
      extra +
      ">" +
      label +
      "</button>",
    empty: (a, b) => a + b,
  });
  return { ui, cards, state };
}
test("alchemy selects only one material and confirmation preserves the exact version, enhancement and lucky quote", () => {
  const f = fixture();
  f.ui.update({
    xp: 0,
    refinements: 5,
    version: 7,
    targets: {},
    cards: [],
    nextLucky: true,
    nextRefinement: 6,
  });
  f.ui.add({ card: "a", variant: "card" });
  const request = f.ui.request();
  assert.equal(request.expectedLevel, 4);
  assert.equal(request.expectedVersion, 7);
  assert.match(f.ui.confirmation(request), /50%|50<\/strong>/);
  assert.match(f.ui.confirmation(request), /45%|45<\/strong>/);
  assert.match(f.ui.confirmation(request), /&lt;Alchemy>/);
  assert.match(f.ui.render(), /A lucky energy engulfs the room/);
  f.ui.add({ card: "d", variant: "card" });
  assert.equal(f.ui.request().card, "d");
  assert.equal(f.state.inventory.length, 2);
});
test("target clearing addresses its own tier and cash-out quotes keep leftover XP for other tiers", () => {
  const f = fixture();
  f.ui.update({
    xp: 13000,
    refinements: 1,
    version: 3,
    targets: { AG: "a" },
    cards: f.cards,
    nextLucky: false,
    nextRefinement: 2,
  });
  assert.equal(f.ui.drawRequest("AG").targetCard, "a");
  assert.equal(f.ui.targetRequest(null, "AG").rarity, "AG");
  assert.match(f.ui.confirmation(f.ui.drawRequest("AG")), /12800 XP/);
  assert.match(f.ui.render(), /One Shared XP Pool/);
});
test("older target search responses cannot overwrite the newer query", async () => {
  const f = fixture();
  f.ui.update({
    xp: 0,
    refinements: 0,
    version: 0,
    targets: {},
    cards: [],
    nextRefinement: 1,
  });
  f.ui.openPicker("target", "D");
  const pending = [];
  const api = () => new Promise((resolve) => pending.push(resolve));
  const old = f.ui.loadTargets(api);
  f.ui.filter("query", "new");
  const latest = f.ui.loadTargets(api);
  pending[1]({
    cards: [{ ...f.cards[1], name: "new card" }],
    page: 1,
    total: 1,
    eligibleTotal: 2,
  });
  await latest;
  pending[0]({
    cards: [{ ...f.cards[1], name: "old card" }],
    page: 1,
    total: 1,
    eligibleTotal: 2,
  });
  await old;
  assert.match(f.ui.renderPicker(), /new card/);
  assert.doesNotMatch(f.ui.renderPicker(), /old card/);
});
