import { test } from "node:test";
import assert from "node:assert/strict";
import { createPackReveal } from "../public/pack-reveal.js";
test("bulk results paginate without purchasing or losing cards and keep per-card controls", () => {
  let html = "";
  const cards = Array.from({ length: 25 }, (_, i) => ({
    id: "c" + i,
    name: "Card" + i,
    rarity: "D",
  }));
  const state = {
    settings: { character_price: 500 },
    inventory: cards.map((c) => ({ card: c.id, copies: 1, level: 1 })),
    showcase: [],
  };
  const ui = createPackReveal({
    modal: (s) => (html = s),
    cardHTML: (c, a, b, actions) =>
      "<article>" + c.name + actions + "</article>",
    escape: String,
    number: String,
    getState: () => state,
  });
  ui.show({ cards }, { kind: "character", count: 5 });
  assert.match(html, /25 cards/);
  ui.reveal();
  assert.match(html, /Page 1 of 2/);
  assert.equal((html.match(/<article>/g) || []).length, 20);
  assert.match(html, /5 more packs/);
  ui.turn(1);
  assert.match(html, /Page 2 of 2/);
  assert.equal((html.match(/<article>/g) || []).length, 5);
  assert.match(html, /Card24/);
  assert.match(html, /protect-toggle/);
  ui.turn(-1);
  assert.match(html, /Card0/);
  assert.equal(state.inventory.length, 25);
});
