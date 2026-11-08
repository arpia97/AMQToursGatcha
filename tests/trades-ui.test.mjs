import test from "node:test";
import assert from "node:assert/strict";
import { createTradesUI } from "../public/trades-ui.js";
const escape = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const cards = [
  { id: "a", kind: "character", name: "Alpha", rarity: "SS", series: "Show" },
  {
    id: "b",
    kind: "seiyuu",
    name: "<Voice>",
    rarity: "AG",
    series: "Voice actor",
  },
  { id: "p", kind: "character", name: "Protected", rarity: "AG" },
];
const state = {
  me: { id: "owner" },
  inventory: [
    { card: "a", copies: 2, level: 4 },
    { card: "b", copies: 1, level: 3 },
    { card: "p", copies: 1, level: 1, protected: 1 },
  ],
};
function fixture() {
  const s = structuredClone(state),
    ui = {};
  const component = createTradesUI(
    {
      escape,
      number: String,
      btn: (l, a, x = "", c = "") =>
        `<button class="${c}" data-action="${a}" ${x}>${l}</button>`,
      cardBy: (id) => cards.find((c) => c.id === id),
      image: () => '<img alt="">',
      gradeBadge: () => "",
      rarityClass: (r) => r.toLowerCase(),
      rarity: () => 1,
      series: (c) => c.series || "",
      empty: (a, b) => a + b,
      profileURL: (id) => "#player/" + id,
      getState: () => s,
    },
    ui,
  );
  return { s, ui, component };
}
test("trade picker includes both types, excludes protection, searches and selects spare or enhanced base explicitly", () => {
  const { component: c } = fixture();
  c.openPicker();
  assert.match(c.renderPicker(), /Alpha/);
  assert.match(c.renderPicker(), /&lt;Voice&gt;/);
  assert.doesNotMatch(c.renderPicker(), />Protected</);
  c.filter("kind", "seiyuu");
  assert.doesNotMatch(c.renderPicker(), /Alpha/);
  c.filter("query", "missing");
  assert.match(c.renderPicker(), /No Available Cards/);
  c.choose("a");
  assert.deepEqual(c.payload(), {
    action: "trade-list",
    body: { card: "a", variant: "extra", expectedLevel: 1 },
  });
  assert.match(c.renderPicker(), /type="button"[^>]*>Choose Another Card/);
  c.variant("card");
  assert.equal(c.payload().body.expectedLevel, 4);
  assert.throws(() => c.choose("p"), /no longer/);
  c.back();
  assert.throws(() => c.payload(), /Choose/);
});
test("offer payload locks listing and player; rendered owner controls and statuses are contextual", () => {
  const { component: c, ui, s } = fixture(),
    listing = {
      id: 1,
      seller: "owner",
      seller_name: "<Owner>",
      card: "a",
      level: 4,
      status: "open",
      offer_count: 1,
      offers: [
        {
          id: 2,
          proposer: "other",
          proposer_name: "Other",
          card: "b",
          level: 3,
          status: "open",
        },
      ],
    };
  ui.tradeData = { items: [listing], page: 1, hasMore: false };
  assert.match(c.render(), /Accept Trade/);
  assert.match(c.render(), /&lt;Owner&gt;/);
  assert.doesNotMatch(c.render(), /Offer a Card/);
  s.me.id = "other";
  assert.match(c.render(), /Withdraw Offer/);
  assert.doesNotMatch(c.render(), /Accept Trade/);
  c.openPicker(listing);
  c.choose("b");
  assert.equal(c.payload().action, "trade-offer");
  assert.equal(c.payload().body.listing, 1);
  s.me.id = "changed";
  assert.throws(() => c.payload(), /current account/);
});
test("offer builder adds/removes multiple copies, includes full bundle, and prevents selecting the same enhanced base twice", () => {
  const { component: c, s } = fixture();
  c.openPicker({ id: 7, card: "a", level: 1 });
  c.choose("a");
  c.choose("b");
  assert.deepEqual(c.payload().body.cards, [
    { card: "a", variant: "extra", expectedLevel: 1 },
    { card: "b", variant: "card", expectedLevel: 3 },
  ]);
  assert.match(c.renderPicker(), /2 \/ 10 Cards/);
  assert.match(c.renderPicker(), /Send Offer · 2 Cards/);
  c.variant("card", 0);
  assert.equal(c.payload().body.cards[0].expectedLevel, 4);
  c.choose("a");
  assert.throws(() => c.choose("a"), /already/);
  assert.throws(() => c.variant("card", 2), /already/);
  c.remove(1);
  assert.equal(c.payload().body.cards.length, 2);
  assert.match(
    c.offer({
      cards: [
        { card: "a", level: 4 },
        { card: "b", level: 3 },
      ],
    }),
    /&lt;Voice&gt;/,
  );
  c.remove(0);
  c.remove(0);
  assert.throws(() => c.payload(), /Choose/);
  s.inventory[0].copies = 15;
  for (let i = 0; i < 10; i++) c.choose("a");
  assert.throws(() => c.choose("a"), /10/);
});

test("trade search stays visible across views, escapes queries, and distinguishes empty results from no listings", () => {
  const { component: c, ui, s } = fixture();
  ui.tradeQuery = "Manaka Iwami";
  ui.tradeData = { query: "Manaka Iwami", items: [], page: 1, hasMore: false };
  assert.match(c.render(), /aria-label="Search Trades"/);
  ui.tradeWishlistOnly = true;
  assert.match(c.render(), /id="trade-wishlist-only" type="checkbox" checked/);
  assert.match(c.render(), /value="Manaka Iwami"/);
  assert.match(c.render(), /no-results/);
  assert.match(c.render(), /No Matching Trades/);
  assert.match(c.render(), /trade-search-clear/);
  for (const view of ["browse", "listings", "offers"]) {
    ui.tradeView = view;
    assert.match(c.render(), /id="trade-search"/);
  }
  ui.tradeQuery = '"><script>';
  assert.doesNotMatch(c.render(), /value=""><script>/);
  assert.match(c.render(), /value="&quot;&gt;&lt;script&gt;"/);
  ui.tradeQuery = "";
  assert.match(c.render(), /No Offers Yet/);
  assert.doesNotMatch(c.render(), /trade-search-clear/);
  s.me = null;
  assert.match(c.render(), /Sign In to See Your Trades/);
  assert.match(c.render(), /id="trade-search"/);
});
