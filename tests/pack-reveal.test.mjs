import { test } from "node:test";
import assert from "node:assert/strict";
import { createPackReveal } from "../public/pack-reveal.js";

test("pack reveals keep highest-rarity effects, duplicate controls, paid-pack identity and paging without granting again", () => {
  const views = [],
    cards = Array.from({ length: 25 }, (_, i) => ({
      id: i < 2 ? "duplicate" : "card-" + i,
      name: "Card " + i,
      rarity: i === 8 ? "AG" : "D",
    }));
  const state = {
    me: { balance: 100 }, wishlist: [],
    settings: { premium_seiyuu_price: 1000 },
    inventory: cards.map((c) => ({
      card: c.id,
      copies: 1,
      level: 1,
      protected: c.id === "duplicate",
    })),
    showcase: ["duplicate"],
  };
  const saved = JSON.stringify(state);
  const reveal = createPackReveal({
    modal: (html) => views.push(html),
    cardHTML: (c, a, b, actions) => "<article>" + c.id + actions + "</article>",
    escape: String,
    number: String,
    getState: () => state,
    motionControl: () => "<label>Pack animations</label>",
  });
  reveal.show({ cards }, { kind: "seiyuu", premium: true, count: 5 });
  assert.match(views.at(-1), /aura-ag/);
  assert.doesNotMatch(views.at(-1), /<article>/);
  reveal.reveal();
  assert.match(views.at(-1), /Page 1 of 2/);
  assert.equal((views.at(-1).match(/<article>/g) || []).length, 20);
  assert.equal((views.at(-1).match(/🔒 Protected/g) || []).length, 2);
  assert.equal((views.at(-1).match(/★ Showcased/g) || []).length, 2);
  assert.match(
    views.at(-1),
    /data-kind="seiyuu" data-premium="true" data-count="5"/,
  );
  assert.match(views.at(-1), /5 more packs.*5,?000/);
  reveal.turn(1);
  assert.match(views.at(-1), /Page 2 of 2/);
  assert.equal((views.at(-1).match(/<article>/g) || []).length, 5);
  assert.match(views.at(-1), /card-24/);
  assert.match(views.at(-1), /protect-toggle/);
  assert.match(views.at(-1), /showcase-toggle/);
  reveal.turn(-1);
  assert.match(views.at(-1), /Page 1 of 2/);
  const count = views.length;
  reveal.reveal();
  assert.equal(views.length, count);
  assert.equal(JSON.stringify(state), saved);
  const sold = cards.map((c, i) => i < 2 ? { ...c, autoSold: true, autoSoldId: "sale-" + i, autoSoldPrice: 25 } : { ...c });
  reveal.show({ cards: sold, autoSoldCount: 2, autoSoldCredits: 50 }, { kind: "character", count: 5 });
  reveal.reveal();
  const html = views.at(-1);
  assert.ok(html.indexOf('data-action="pack-autosell-cancel"') < html.indexOf('data-action="wishlist-toggle"'));
  assert.equal((html.match(/Cancel Auto-sell · −✦ 25/g) || []).length, 2);
  const root = { querySelectorAll: () => [], querySelector: () => null };
  state.me.balance = 75;
  reveal.cancelAutoSale("sale-0", root);
  reveal.cancelAutoSale("sale-0", root); // Duplicate acknowledgement is harmless.
  assert.equal(sold[0].autoSold, false);
  assert.equal(sold[1].autoSold, true);
  reveal.turn(1);
  reveal.turn(-1);
  assert.match(views.at(-1), /Page 1 of 2/);
  assert.equal((views.at(-1).match(/Cancel Auto-sell · −✦ 25/g) || []).length, 1);
  assert.match(views.at(-1), /Auto-sold <strong>1<\/strong>/);
  assert.match(views.at(-1), /Credits left:.*75/);
  assert.match(views.at(-1), /data-auto-sold-id="sale-0"><button[^>]*data-action="wishlist-toggle"/);
  reveal.show({cards:cards.slice(0,10),balance:3000},{kind:'character',paidSpecial:true,count:2});
  assert.match(views.at(-1),/SPECIAL CARD PACK/);assert.match(views.at(-1),/2 guaranteed S cards, 4 normal draws, and 4 premium draws/);assert.doesNotMatch(views.at(-1),/1 AG guaranteed/);
  reveal.reveal();assert.match(views.at(-1),/data-special="true"/);assert.match(views.at(-1),/2 more packs.*6,?000/);
  reveal.show({ cards: cards.slice(0, 5) }, { daily: true });
  reveal.reveal();
  assert.match(views.at(-1), /DAILY PACK CLAIMED/);
  assert.doesNotMatch(
    views.at(-1),
    /data-action="daily-pack"|data-action="pack"/,
  );
});
