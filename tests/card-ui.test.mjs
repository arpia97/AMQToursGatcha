import { test } from "node:test";
import assert from "node:assert/strict";
import { cardComparator } from "../public/card-display.js";
import { createPackReveal } from "../public/pack-reveal.js";

test("card sorting puts known rarity/favourites first with stable names and role order", () => {
  const cards = [
    { id: "1", name: "Card 10", role: "supporting", rarity: "D", favorites: 0 },
    { id: "2", name: "Card 2", role: "main", rarity: "AG", favorites: 50 },
    { id: "3", name: "A", role: "unknown", rarity: null, favorites: null },
  ];
  assert.deepEqual(
    [...cards].sort(cardComparator("rarity")).map((c) => c.id),
    ["2", "1", "3"],
  );
  assert.deepEqual(
    [...cards].sort(cardComparator("name")).map((c) => c.id),
    ["3", "2", "1"],
  );
  assert.deepEqual(
    [...cards].sort(cardComparator("role")).map((c) => c.id),
    ["2", "1", "3"],
  );
  assert.equal([...cards].sort(cardComparator("favorites"))[0].id, "2");
});
test("pack reveal uses the highest actual pull, keeps duplicate cards and repeats the same paid pack type", () => {
  const views = [];
  const reveal = createPackReveal({
    modal: (html) => views.push(html),
    cardHTML: (c) => `<article>${c.id}</article>`,
    escape: String,
    number: String,
    getState: () => ({ settings: { premium_seiyuu_price: 2500 } }),
    motionControl: () => '<label>Pack animations<select><option>Full</option></select></label>',
  });
  const result = {
    cards: [
      { id: "x", rarity: "D" },
      { id: "x", rarity: "D" },
      { id: "a", rarity: "AG" },
      { id: "u", rarity: "Ubers" },
      { id: "s", rarity: "S" },
    ],
  };
  reveal.show(result, { kind: "seiyuu", premium: true });
  assert.match(views[0], /aura-ag/);
  assert.match(views[0], /data-action="reveal-pack"/);
  assert.match(views[0], /Pack animations/);
  assert.doesNotMatch(views[0], /AG GLOW|Pending GLOW/);
  assert.doesNotMatch(views[0], /<article>/);
  reveal.reveal();
  assert.equal((views[1].match(/<article>/g) || []).length, 5);
  assert.match(views[1], /Pack animations/);
  assert.match(views[1], /data-kind="seiyuu" data-premium="true"/);
  assert.match(views[1], /Open another pack · ✦ 2500/);
  reveal.reveal();
  assert.equal(views.length, 2);
  reveal.show(result, { daily: true });
  reveal.reveal();
  assert.doesNotMatch(
    views.at(-1),
    /data-action="daily-pack"|data-action="pack"/,
  );
  assert.match(views.at(-1), /DAILY PACK CLAIMED/);
});
