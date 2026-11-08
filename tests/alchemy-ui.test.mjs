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
test("alchemy keeps an ordered selection and confirmation preserves the exact version, enhancement and lucky quote", () => {
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
  assert.equal(f.ui.toggle({ card: "a", variant: "card" }), false);
  assert.throws(() => f.ui.request(), /Choose cards/);
  assert.equal(f.ui.toggle({ card: "a", variant: "card" }, true), true);
  const request = f.ui.request();
  assert.equal(request.expectedLevel, 4);
  assert.equal(request.expectedVersion, 7);
  assert.match(f.ui.confirmation(request), /50%|50<\/strong>/);
  assert.match(f.ui.confirmation(request), /45%|45<\/strong>/);
  assert.match(f.ui.confirmation(request), /&lt;Alchemy>/);
  assert.match(f.ui.render(), /A lucky energy engulfs the room/);
  f.ui.add({ card: "d", variant: "card" });
  assert.deepEqual(
    f.ui.request().materials.map((m) => m.card),
    ["a", "d"],
  );
  f.ui.move(1, -1);
  assert.deepEqual(
    f.ui.request().materials.map((m) => m.card),
    ["d", "a"],
  );
  assert.match(f.ui.queueHTML(), /Refinement #6/);
  assert.match(f.ui.queueHTML(), /Lucky/);
  f.ui.remove(0);
  assert.equal(f.ui.request().card, "a");
  assert.equal(f.state.inventory.length, 2);
  f.ui.toggle({ card: "a", variant: "card" });
  assert.throws(() => f.ui.request(), /Choose cards/);
  f.state.inventory[0].copies = 5;
  f.ui.setExtras("a", 3);
  f.ui.toggle({ card: "d", variant: "card" });
  const keys = f.ui.orderKeys();
  f.ui.dropKey(keys[3], keys[0], false);
  assert.equal(f.ui.request().materials[0].card, "d");
  f.ui.setExtras("a", 1);
  assert.equal(f.ui.request().materials.length, 2);
  assert.equal(f.ui.orderKeys()[1], keys[0]);
  f.ui.openPicker("material");
  assert.doesNotMatch(f.ui.renderPicker(), />Add Card|>Add Extra/);
  f.ui.toggle({ card: "a", variant: "extra" });
  assert.equal(f.ui.request().card, "d");
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

test("refinement results stay in the confirmation dialog without creating a page banner or another consumption form", () => {
  const f = fixture();
  f.ui.complete({
    outcome: "great",
    label: "Great Success",
    xpGained: 5120,
    multiplier: 2,
    lucky: true,
    material: { id: "a", name: "<Alchemy>", rarity: "AG", level: 1 },
    alchemyState: {
      xp: 5120,
      refinements: 6,
      version: 1,
      targets: {},
      cards: [],
      nextLucky: false,
      nextRefinement: 7,
    },
  });
  const popup = f.ui.refinementResult();
  assert.match(popup, /Great Success/);
  assert.match(popup, /5120 XP/);
  assert.match(popup, /&lt;Alchemy>/);
  assert.match(popup, /Lucky Refinement/);
  assert.ok(popup.includes(">Done</button>"));
  assert.doesNotMatch(popup, /<form|type="submit"/);
  assert.doesNotMatch(
    f.ui.render(),
    /REFINEMENT COMPLETE|alchemy-result|Great Success ·/,
  );
});

test("reordering enhanced base and extra copies preserves their investment and last extra becomes a valid level-one card", () => {
  const f = fixture();
  f.ui.update({
    xp: 0,
    refinements: 4,
    version: 0,
    targets: {},
    cards: [],
    nextRefinement: 5,
  });
  f.ui.add({ card: "a", variant: "card" });
  f.ui.add({ card: "a", variant: "extra" });
  assert.deepEqual(
    f.ui.request().materials.map((m) => [m.variant, m.expectedLevel]),
    [
      ["card", 4],
      ["card", 1],
    ],
  );
  f.ui.move(1, -1);
  assert.deepEqual(
    f.ui.request().materials.map((m) => [m.variant, m.expectedLevel]),
    [
      ["extra", 1],
      ["card", 4],
    ],
  );
  assert.throws(() => f.ui.add({ card: "a", variant: "extra" }), /available/);
  f.ui.openPicker("material");
  assert.match(f.ui.renderPicker(), /Selected Cards/);
  assert.match(f.ui.renderPicker(), /Done Selecting/);
  assert.match(f.ui.confirmation(f.ui.request()), /displayed order/);
});

test("batch result popups keep the shared Done focus target and escape card names", () => {
  const f = fixture();
  f.ui.complete({
    refinements: [
      {
        material: { id: "a", name: "<Alchemy>", rarity: "AG", level: 1 },
        label: "Success",
        xpGained: 2560,
        lucky: true,
      },
    ],
    xpGained: 2560,
    alchemyState: {
      xp: 2560,
      refinements: 6,
      version: 1,
      targets: {},
      cards: [],
    },
  });
  assert.match(f.ui.refinementResult(), /fusion-review-actions/);
  assert.match(f.ui.refinementResult(), />Done<\/button>/);
  assert.match(f.ui.refinementResult(), /&lt;Alchemy>/);
  assert.doesNotMatch(f.ui.refinementResult(), /<form|type="submit"/);
});

test("target Wishlist filter is beneath Type, stays in requests with search/type/page, and ignores stale unfiltered responses", async () => {
  const f = fixture();
  f.ui.openPicker("target", "D");
  assert.match(
    f.ui.renderPicker(),
    /id="fusion-kind"[\s\S]*id="alchemy-wishlist"/,
  );
  const pending = [],
    paths = [];
  const api = (path) => {
    paths.push(new URL("http://local/" + path));
    return new Promise((resolve) => pending.push(resolve));
  };
  const old = f.ui.loadTargets(api);
  f.ui.filter("wishlist", true);
  f.ui.filter("kind", "seiyuu");
  f.ui.filter("query", "D");
  f.ui.next();
  const current = f.ui.loadTargets(api);
  assert.equal(paths[1].searchParams.get("wishlist"), "1");
  assert.equal(paths[1].searchParams.get("kind"), "seiyuu");
  assert.equal(paths[1].searchParams.get("q"), "D");
  assert.equal(paths[1].searchParams.get("page"), "2");
  pending[1]({ cards: [f.cards[1]], page: 1, total: 1, eligibleTotal: 1 });
  assert.ok(await current);
  assert.match(f.ui.renderPicker(), /D Card/);
  pending[0]({ cards: [f.cards[0]], page: 1, total: 1, eligibleTotal: 1 });
  assert.equal(await old, null);
  assert.match(
    f.ui.renderPicker(),
    /id="alchemy-wishlist" type="checkbox" checked/,
  );
  assert.doesNotMatch(f.ui.renderPicker(), /&lt;Alchemy>/);
  f.ui.filter("wishlist", false);
  const unfiltered = f.ui.loadTargets(api);
  assert.equal(paths[2].searchParams.get("wishlist"), "0");
  assert.equal(paths[2].searchParams.get("page"), "1");
  pending[2]({ cards: [], page: 1, total: 0 });
  await unfiltered;
  f.ui.openPicker("material");
  assert.doesNotMatch(f.ui.renderPicker(), /id="alchemy-wishlist"/);
});

test("material picker finds comma-separated names in either order and retains protected-card controls", () => {
  const f = fixture();
  f.cards[1].name = "Iwami, Manaka";
  f.ui.openPicker("material");
  for (const q of ["Iwami Manaka", "Manaka Iwami", "Manaka, Iwami"]) {
    f.ui.filter("query", q);
    assert.match(f.ui.renderPicker(), /Iwami, Manaka/);
  }
  f.ui.filter("query", "Iwami Someone");
  assert.doesNotMatch(f.ui.renderPicker(), /alt="Iwami, Manaka"/);
});

test("Hide Protected Cards filters material choices and Auto Refine respects protection and maximum rarity", () => {
  const f = fixture();
  f.state.inventory[0].protected = 1;
  f.ui.update({ xp: 0, refinements: 5, version: 0, cards: [], targets: {} });
  f.ui.openPicker("material");
  assert.match(f.ui.renderPicker(), /Hide Protected Cards/);
  f.ui.filter("hideProtected", true);
  assert.doesNotMatch(f.ui.renderPicker(true), /data-id="a"/);
  f.ui.autoSelect(1, "D");
  assert.equal(f.ui.request().card, "d");
  assert.match(f.ui.autoForm(), /Maximum Rarity/);
});

test("draw results stay in a covered-card popup and reveal locally once without issuing another draw", () => {
  const f = fixture();
  const result = {
    cards: [f.cards[0]],
    rarity: "AG",
    xpSpent: 12800,
    targetHit: true,
    alchemyState: {
      xp: 200,
      refinements: 1,
      version: 4,
      targets: {},
      cards: [],
    },
  };
  const saved = structuredClone(result);
  f.ui.complete(result);
  assert.match(f.ui.drawResult(), /Reveal Your Alchemy Card/);
  assert.doesNotMatch(f.ui.drawResult(), /&lt;Alchemy>|Target Card!/);
  assert.doesNotMatch(
    f.ui.render(),
    /alchemy-draw-popup|alchemy-result|12800 XP Spent/,
  );
  assert.equal(f.ui.revealDraw(), true);
  assert.match(f.ui.drawResult(), /&lt;Alchemy>/);
  assert.match(f.ui.drawResult(), /Target Card!/);
  assert.doesNotMatch(
    f.ui.drawResult(),
    /<form|type="submit"|data-action="alchemy-draw-review"/,
  );
  assert.equal(f.ui.revealDraw(), false);
  assert.deepEqual(result, saved);
  assert.throws(() => f.ui.drawRequest("AG"), /Not enough/);
  f.ui.dismiss();
  assert.equal(f.ui.drawResult(), "");
});
