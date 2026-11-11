import { test } from "node:test";
import assert from "node:assert/strict";
import { listingModalHTML } from "../public/listing-form.js";

const cardS = {
  id: "card-s",
  name: "Homura Akemi",
  rarity: "S",
  kind: "character",
  series: "Madoka Magica",
};

const cardD = {
  id: "card-d",
  name: "Side Character",
  rarity: "D",
  kind: "character",
};

test("listingModalHTML renders all 4 tabs across all venues", () => {
  const item = { card: "card-s", level: 3, copies: 2 };
  const html = listingModalHTML({
    card: cardS,
    item,
    escape: (s) => String(s),
    number: (n) => String(n),
  });

  assert.match(html, /class="tabs listing-venues"/);
  assert.match(html, /data-venue="shop">Fixed-price marketplace<\/button>/);
  assert.match(html, /data-venue="auction">Timed auction<\/button>/);
  assert.match(html, /data-venue="trade">List for trade<\/button>/);
  assert.match(html, /data-venue="store">Sell to store<\/button>/);
});

test("listingModalHTML defaults to shop venue (marketplace)", () => {
  const item = { card: "card-s", level: 3, copies: 2 };
  const html = listingModalHTML({
    card: cardS,
    item,
    venue: "shop",
    escape: (s) => String(s),
    number: (n) => String(n),
  });

  assert.match(html, /<h2>List on the Marketplace<\/h2>/);
  assert.match(html, /class="tab active" data-action="listing-venue" data-id="card-s" data-venue="shop"/);
  assert.match(html, /<form id="listing-form"/);
  assert.match(html, /<input name="venue" type="hidden" value="shop">/);
  assert.match(html, /<label>Selling price<input name="price"/);
  assert.match(html, /List at fixed price →/);
});

test("listingModalHTML renders timed auction venue", () => {
  const item = { card: "card-s", level: 3, copies: 2 };
  const html = listingModalHTML({
    card: cardS,
    item,
    venue: "auction",
    escape: (s) => String(s),
    number: (n) => String(n),
    quantityInput: ({ id, name, value }) =>
      `<div class="qty-mock" id="${id}" data-name="${name}" data-value="${value}"></div>`,
  });

  assert.match(html, /<h2>Start an Auction<\/h2>/);
  assert.match(html, /class="tab active" data-action="listing-venue" data-id="card-s" data-venue="auction"/);
  assert.match(html, /<form id="listing-form"/);
  assert.match(html, /<input name="venue" type="hidden" value="auction">/);
  assert.match(html, /<label>Minimum opening bid<input name="price"/);
  assert.match(html, /class="qty-mock" id="auction-hours"/);
  assert.match(html, /Optional buyout price/);
  assert.match(html, /Start auction →/);
});

test("listingModalHTML renders list for trade venue", () => {
  const item = { card: "card-s", level: 3, copies: 2 };
  const html = listingModalHTML({
    card: cardS,
    item,
    venue: "trade",
    escape: (s) => String(s),
    number: (n) => String(n),
  });

  assert.match(html, /<h2>List for Trade<\/h2>/);
  assert.match(html, /class="tab active" data-action="listing-venue" data-id="card-s" data-venue="trade"/);
  assert.match(html, /<form id="listing-form"/);
  assert.match(html, /<input name="venue" type="hidden" value="trade">/);
  assert.match(html, /<label>Copy to trade<select name="variant">/);
  assert.match(html, /The listed copy is held securely until traded or cancelled\./);
  assert.match(html, /<button class="button full mint" type="submit">List for trade →<\/button>/);
  // Trade listings do not have price fields
  assert.doesNotMatch(html, /name="price"/);
});

test("listingModalHTML renders sell to store venue with accurate flat price", () => {
  // S rarity base price is 800 credits; 50% = 400 credits per investment unit.
  // Lv. 3 investment is 4 copies, so Lv. 3 sells for 400 * 4 = 1600 credits.
  const item = { card: "card-s", level: 3, copies: 2 };
  const html = listingModalHTML({
    card: cardS,
    item,
    venue: "store",
    variant: "card",
    escape: (s) => String(s),
    number: (n) => Number(n).toLocaleString("en-US"),
  });

  assert.match(html, /<h2>Sell to Store<\/h2>/);
  assert.match(html, /class="tab active" data-action="listing-venue" data-id="card-s" data-venue="store"/);
  assert.match(html, /<form id="instant-sell-form"/);
  assert.match(html, /<input type="hidden" name="expectedPrice" value="1600">/);
  assert.match(html, /<input type="hidden" name="expectedLevel" value="3">/);
  assert.match(html, /<input type="hidden" name="expectedRarity" value="S">/);
  assert.match(html, /Receive <strong class="money">✦ 1,600 credits<\/strong> immediately/);
  assert.match(html, /Sell permanently for ✦ 1,600/);
});

test("listingModalHTML sell to store variant calculation for extra copies", () => {
  // Lv. 1 extra copy sells for 400 credits (1 unit).
  const item = { card: "card-s", level: 3, copies: 2 };
  const html = listingModalHTML({
    card: cardS,
    item,
    venue: "store",
    variant: "extra",
    escape: (s) => String(s),
    number: (n) => String(n),
  });

  assert.match(html, /<input type="hidden" name="expectedPrice" value="400">/);
  assert.match(html, /<input type="hidden" name="expectedLevel" value="1">/);
  assert.match(html, /Receive <strong class="money">✦ 400 credits<\/strong> immediately/);
  assert.match(html, /<option value="extra" selected>Extra copy · Lv\. 1<\/option>/);
});

test("listingModalHTML single copy cards only show 'Your card' in variant dropdown", () => {
  const item = { card: "card-d", level: 1, copies: 1 };
  const html = listingModalHTML({
    card: cardD,
    item,
    venue: "store",
    escape: (s) => String(s),
    number: (n) => String(n),
  });

  assert.doesNotMatch(html, /value="extra"/);
  assert.match(html, /<option value="card" selected>Your card · Lv\. 1<\/option>/);
});
