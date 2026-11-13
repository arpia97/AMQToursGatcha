import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { listingModalHTML } from "../public/listing-form.js";

const cardS = {
  id: "card-s",
  name: "Homura Akemi",
  rarity: "S",
  kind: "character",
  series: "Madoka Magica",
};

test("Trade marker clicks reach the inventory toggle instead of the trade-board menu", async () => {
  const source = readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf("async function handleFeatureClick("),
    source.indexOf("function listingForm("),
  );
  const item = { card: "card-s", copies: 1, level: 1, for_trade: 0 };
  const calls = [],
    flags = [],
    pressed = [];
  const surface = {};
  const button = {
    dataset: { id: item.card },
    setAttribute: (name, value) => pressed.push([name, value]),
    classList: { toggle() {} },
    closest: () => surface,
  };
  const context = vm.createContext({
    busy: false,
    state: { me: { id: "p" }, inventory: [item] },
    ui: {},
    saveCardAction: async (path, body) => calls.push({ path, ...body }),
    cardFlags: () => ({ forTrade: !!item.for_trade }),
    syncCardFlags: (root, getFlags) => flags.push(getFlags()),
    toast: (message) => assert.fail(message),
  });
  vm.runInContext(handler, context);
  assert.equal(await context.handleFeatureClick("trade-toggle", button), true);
  assert.equal(item.for_trade, 1);
  assert.equal(button.textContent, "⚖️ For Trade");
  assert.equal(flags[0].forTrade, true);
  assert.equal(calls[0].path, "trade-card");
  assert.equal(calls[0].forTrade, true);
  await context.handleFeatureClick("trade-toggle", button);
  assert.equal(item.for_trade, 0);
  assert.equal(flags[1].forTrade, false);
  assert.equal(calls[1].forTrade, false);
  assert.equal(button.textContent, "⚖️ Trade");
  assert.deepEqual(pressed, [
    ["aria-pressed", "true"],
    ["aria-pressed", "false"],
  ]);
  context.busy = true;
  await context.handleFeatureClick("trade-toggle", button);
  assert.equal(item.for_trade, 0);
  assert.equal(calls.length, 2);
  context.busy = false;
  context.saveCardAction = async () => undefined;
  await context.handleFeatureClick("trade-toggle", button);
  assert.equal(item.for_trade, 0, "failed saves restore the previous marker");
  assert.equal(button.textContent, "⚖️ Trade");
});

function listing(options = {}) {
  return listingModalHTML({
    card: cardS,
    item: { card: cardS.id, level: 3, copies: 2 },
    ...options,
  });
}

test("listing venues submit the selected market and its required fields", () => {
  for (const [venue, fields] of [
    ["shop", ["price"]],
    ["auction", ["price", "hours", "buyout"]],
    ["trade", ["variant"]],
  ]) {
    const html = listing(venue === "shop" ? {} : { venue });
    assert.ok(html.includes(`name="venue" type="hidden" value="${venue}"`));
    assert.match(html, /<form id="listing-form"/);
    for (const field of fields) assert.ok(html.includes(`name="${field}"`));
    if (venue === "trade") assert.doesNotMatch(html, /name="price"/);
    assert.deepEqual(
      [...html.matchAll(/data-venue="(\w+)"/g)].map((match) => match[1]),
      ["shop", "auction", "trade", "store"],
    );
  }
});

test("store quotes the selected copy and offers extras only when owned", () => {
  for (const [variant, price, level] of [
    ["card", 1600, 3],
    ["extra", 400, 1],
  ]) {
    const html = listing({ venue: "store", variant });
    assert.match(html, /<form id="instant-sell-form"/);
    assert.ok(html.includes(`name="expectedPrice" value="${price}"`));
    assert.ok(html.includes(`name="expectedLevel" value="${level}"`));
    assert.match(html, /name="expectedRarity" value="S"/);
    assert.ok(html.includes(`value="${variant}" selected`));
  }
  const single = listing({
    venue: "store",
    item: { card: cardS.id, level: 3, copies: 1 },
  });
  assert.doesNotMatch(single, /value="extra"/);
  assert.match(single, /value="card" selected/);
});
