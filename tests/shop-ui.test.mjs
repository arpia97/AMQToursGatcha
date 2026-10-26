import { test } from "node:test";
import assert from "node:assert/strict";
import { shopSellPage, createShopUI } from "../public/shop-ui.js";
import { tileName } from "../public/mahjong-ui.js";
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function fixture() {
  const cards = {
    a: {
      id: "a",
      kind: "character",
      name: "Card <A>",
      rarity: "S",
      series: "Series",
    },
    b: { id: "b", kind: "seiyuu", name: "Voice", rarity: "D" },
  };
  const state = {
    now: 0,
    me: { id: "p", name: "Player", balance: 100 },
    inventory: [
      { card: "a", level: 3, copies: 1 },
      { card: "b", level: 2, copies: 3 },
    ],
    shop: [{ id: 1, card: "a", price: 1600, ends: 1000 }],
    myListings: [
      { venue: "shop", id: 2, card: "a", seller: "p", price: 500, level: 3 },
    ],
    catalog: Object.values(cards),
  };
  const ui = {
    shopSection: "buy",
    tab: () => "character",
    shopSell: { query: "", rarity: "", sort: "rarity", page: 1 },
    marketPage: 1,
    marketData: {
      items: [
        {
          id: 3,
          card: "a",
          seller: "q",
          seller_name: "Other",
          price: 75,
          level: 3,
        },
      ],
    },
  };
  const h = {
    getState: () => state,
    escape,
    number: String,
    cardBy: (id) => cards[id],
    image: () => "",
    gradeBadge: () => "",
    rarityClass: (x) => x.toLowerCase(),
    rarity: () => 1,
    series: (c) => c.series || "",
    empty: (a, b, c = "") => a + b + c,
    btn: (label, action, attrs = "") =>
      `<button data-action="${action}" ${attrs}>${label}</button>`,
    profileURL: (id) => "#player/" + id,
    tabs: () => "",
    countdown: () => "",
    nextWeeklyReset: () => 1000,
    pager: () => "",
  };
  return { state, ui, h, shop: createShopUI(h, ui) };
}
test("shop seller inventory combines type/search/rarity/sort and clamps pages after sales", () => {
  const cards = Array.from({ length: 60 }, (_, i) => ({
    id: String(i),
    kind: i < 30 ? "character" : "seiyuu",
    name: "Name " + i,
    series: "Story",
    rarity: i % 2 ? "S" : "D",
  }));
  const inventory = cards.map((c, i) => ({
      card: c.id,
      level: 1,
      copies: i + 1,
    })),
    lookup = (id) => cards[Number(id)];
  const options = { query: "Story", rarity: "", sort: "copies", page: 2 };
  let data = shopSellPage(inventory, lookup, options, "character");
  assert.equal(data.total, 30);
  assert.equal(data.items.length, 6);
  assert.equal(data.items[0].card, "5");
  data = shopSellPage(
    inventory,
    lookup,
    { ...options, rarity: "S" },
    "character",
  );
  assert.equal(data.page, 1);
  assert.equal(data.total, 15);
  assert.ok(data.items.every((x) => x.c.rarity === "S"));
  assert.equal(
    shopSellPage(inventory, lookup, { ...options, query: "missing" }, "seiyuu")
      .total,
    0,
  );
});
test("shop exposes enhanced instant quotes, fixed-price listings, withdrawals, affordability and signed-out states", () => {
  const { shop, state, ui } = fixture();
  let html = shop.render();
  assert.doesNotMatch(html, /provisional/i);
  assert.match(html, /Need 1500 more/);
  assert.match(html, /disabled/);
  ui.shopSection = "sell";
  html = shop.render();
  assert.match(html, /Sell now · ✦ 3200/);
  assert.match(html, /data-action="sell-card"/);
  assert.match(html, /Card &lt;A>/);
  ui.shopSection = "market";
  html = shop.render();
  assert.match(html, /data-action="buy-listing"/);
  assert.match(html, /No listing fee or selling fee/);
  ui.shopSection = "listings";
  html = shop.render();
  assert.match(html, /data-action="cancel-listing"/);
  assert.match(html, /Lv. 3/);
  state.me = null;
  state.inventory = [];
  ui.shopSection = "sell";
  html = shop.render();
  assert.match(html, /Sign in/);
  assert.doesNotMatch(html, /data-action="instant-sell"/);
});
test("Mahjong numbered tile labels consistently use man, pin and sou while honors retain names", () => {
  assert.equal(tileName(0), "1 man");
  assert.equal(tileName(8), "9 man");
  assert.equal(tileName(9), "1 pin");
  assert.equal(tileName(17), "9 pin");
  assert.equal(tileName(18), "1 sou");
  assert.equal(tileName(26), "9 sou");
  assert.equal(tileName(27), "East wind");
  assert.equal(tileName(33), "Red dragon");
});
