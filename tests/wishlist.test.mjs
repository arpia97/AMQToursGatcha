import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import {
  profileCardPanel,
  profileCardTabs,
} from "../public/profile-cards-ui.js";
import {
  collectorsButton,
  collectorsPanel,
} from "../public/card-collectors.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    () => 1000000,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  const cards = Array.from({ length: 30 }, (_, i) => ({
    id: "c" + i,
    name: "Card " + i,
    kind: i % 2 ? "seiyuu" : "character",
    rarity: "D",
    series: "Series",
  }));
  e.host("catalog", { cards });
  return {
    e,
    db,
    act: (p, a, b, key = crypto.randomUUID()) =>
      e.mutate(p + ":" + a, key, b, () => e.action(p, a, b)),
  };
}
test("wishlists persist, paginate and deduplicate without requiring ownership or changing credits", (t) => {
  const { e, act } = fixture(t),
    before = e.player("p").balance;
  for (let i = 0; i < 26; i++)
    act("p", "wishlist", { card: "c" + i, wanted: true });
  const result = act("p", "wishlist", { card: "c0", wanted: true }, "once");
  assert.deepEqual(
    act("p", "wishlist", { card: "c0", wanted: true }, "once"),
    result,
  );
  assert.equal(e.economy.wishlist.read("p").length, 26);
  assert.equal(e.economy.wishlist.page("p", "wishlist", 1).rows.length, 24);
  assert.equal(e.economy.wishlist.page("p", "wishlist", 1).hasMore, true);
  assert.equal(e.economy.wishlist.page("p", "wishlist", 2).rows.length, 2);
  assert.equal(e.economy.wishlist.read("q").length, 0);
  assert.equal(e.player("p").balance, before);
  const expected = e.economy.wishlist.read("p"),
    cards = [...expected].reverse();
  const reordered = act(
    "p",
    "wishlist-order",
    { cards, expectedCards: expected },
    "reorder-once",
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "wishlist").rows.map((r) => r.card),
    cards.slice(0, 24),
  );
  assert.deepEqual(
    act(
      "p",
      "wishlist-order",
      { cards, expectedCards: expected },
      "reorder-once",
    ),
    reordered,
  );
  assert.throws(
    () => act("p", "wishlist-order", { cards, expectedCards: expected }),
    /changed/,
  );
  assert.throws(
    () => act("q", "wishlist-order", { cards, expectedCards: [] }),
    /already/,
  );
  const restarted = new Engine(e.db, e.transaction, e.now);
  assert.deepEqual(restarted.economy.wishlist.read("p"), cards);
  assert.equal(restarted.economy.wishlist.read("p").length, 26);
  act("q", "wishlist", { card: "c0", wanted: true });
  act("q", "wishlist", { card: "c0", wanted: false });
  assert.equal(e.economy.wishlist.read("p").length, 26);
  assert.throws(
    () => act("p", "wishlist", { card: "missing", wanted: true }),
    /Unknown/,
  );
  assert.throws(
    () => act("p", "wishlist", { card: "c0", wanted: "yes" }),
    /Choose/,
  );
});
test("public collections paginate the selected player's cards with levels and read-only actions", (t) => {
  const { e, act } = fixture(t);
  for (let i = 0; i < 27; i++) e.addCard("p", "c" + i);
  e.addCard("q", "c29");
  e.run("UPDATE inventory SET level=3,copies=2 WHERE player='p' AND card='c0'");
  act("p", "protect-card", { card: "c0", protected: true });
  act("p", "wishlist", { card: "c0", wanted: true });
  const before = e.state("p").inventory;
  const first = e.economy.wishlist.page("p", "collection"),
    last = e.economy.wishlist.page("p", "collection", 2);
  assert.equal(first.rows.length, 24);
  assert.equal(first.hasMore, true);
  assert.equal(last.rows.length, 3);
  assert.equal(last.hasMore, false);
  assert.equal(
    new Set([...first.rows, ...last.rows].map((r) => r.card)).size,
    27,
  );
  assert.equal(first.cards.length, 24);
  assert.ok(!first.rows.some((r) => r.card === "c29"));
  const card = first.rows.find((r) => r.card === "c0");
  assert.equal(card.level, 3);
  assert.equal(card.copies, 2);
  assert.equal(card.protected, 1);
  assert.equal(card.wishlisted, true);
  assert.deepEqual(
    e.economy.wishlist.page("q", "collection").rows.map((r) => r.card),
    ["c29"],
  );
  assert.deepEqual(e.economy.wishlist.page("p", "collection", 3).rows, []);
  assert.throws(
    () => e.economy.wishlist.page("p", "collection", 0),
    /whole number/i,
  );
  assert.throws(
    () => e.economy.wishlist.page("missing", "collection"),
    /Unknown AMQ player ID/i,
  );
  assert.match(
    profileCardTabs("collection"),
    /active" data-action="profile-cards-view" data-view="collection"/,
  );
  const html = profileCardPanel(first, {
    cardBy: (id) => e.catalogStore.card(id),
    cardHTML: (_c, _a, flags, actions) => {
      assert.equal(flags.preview, true);
      return actions;
    },
    escape: (s) => String(s),
    number: String,
    own: false,
    wishlist: [],
  });
  assert.match(html, /<h2>Collection<\/h2>/);
  assert.match(html, /card-collectors/);
  assert.doesNotMatch(
    html,
    /data-action="(?:sell-card|enhance|protect-card|list-card|showcase)"/,
  );
  assert.deepEqual(e.state("p").inventory, before);
});
test("public profile listings include only current sale, auction and trade cards with enhancement levels", (t) => {
  const { e, act } = fixture(t);
  for (let i = 0; i < 4; i++) {
    e.addCard("p", "c" + i);
    e.run("UPDATE inventory SET level=3 WHERE player='p' AND card=?", "c" + i);
  }
  act("p", "list-card", {
    card: "c0",
    variant: "card",
    venue: "shop",
    price: 123,
  });
  act("p", "list-card", {
    card: "c1",
    variant: "card",
    venue: "auction",
    price: 456,
    hours: 1,
  });
  act("p", "trade-list", { card: "c2", variant: "card", expectedLevel: 3 });
  act("q", "wishlist", { card: "c3", wanted: true });
  for (const card of ["c0", "c1", "c2", "c3"])
    assert.deepEqual(
      e.economy.wishlist.collectors(card).rows.map((p) => p.id),
      ["p"],
    );
  const wanted = e.economy.wishlist.collectors("c3", "wanted");
  assert.deepEqual(
    wanted.rows.map((p) => p.id),
    ["q"],
  );
  assert.deepEqual(wanted.counts, { owned: 1, wanted: 1 });
  assert.ok(
    wanted.rows.every(
      (p) => !Object.hasOwn(p, "balance") && !Object.hasOwn(p, "password"),
    ),
  );
  let data = e.economy.wishlist.page("p", "listings");
  assert.deepEqual(
    new Set(data.rows.map((r) => r.venue)),
    new Set(["sale", "auction", "trade"]),
  );
  assert.ok(data.rows.every((r) => r.level === 3));
  assert.equal(data.cards.length, 3);
  assert.equal(data.rows.find((r) => r.venue === "sale").price, 123);
  const shop = e.one("SELECT id FROM market_listings WHERE seller='p'");
  e.run("UPDATE players SET balance=1000 WHERE id='q'");
  act("q", "buy-listing", { listing: shop.id });
  data = e.economy.wishlist.page("p", "listings");
  assert.deepEqual(
    e.economy.wishlist.collectors("c0").rows.map((p) => p.id),
    ["q"],
  );
  assert.equal(data.rows.length, 2);
  e.run("UPDATE auctions SET ends=0 WHERE seller='p'");
  assert.equal(e.economy.wishlist.page("p", "listings").rows.length, 1);
  assert.equal(e.economy.wishlist.page("q", "listings").rows.length, 0);
  assert.throws(() => e.economy.wishlist.page("p", "private"), /Choose/);
});
test("wishlist follows canonical identity migration and player reset clears only that wishlist", (t) => {
  const { e, act } = fixture(t);
  act("p", "wishlist", { card: "c0", wanted: true });
  act("q", "wishlist", { card: "c1", wanted: true });
  const sync = new AliasSync(e, {});
  e.tx(() => sync.renamePlayer("p", "newp"));
  assert.deepEqual(e.economy.wishlist.read("newp"), ["c0"]);
  e.host("reset-player", { player: "newp", confirmation: "RESET PLAYER newp" });
  assert.deepEqual(e.economy.wishlist.read("newp"), []);
  assert.deepEqual(e.economy.wishlist.read("q"), ["c1"]);
});

test("public profile and wishlist card flags belong to that profile's player", (t) => {
  const { e, act } = fixture(t);
  e.addCard("p", "c0");
  e.addCard("q", "c0");
  act("p", "protect-card", { card: "c0", protected: true });
  act("p", "wishlist", { card: "c0", wanted: true });
  e.run("INSERT INTO showcase_slots VALUES('p',1)");
  act("p", "showcase", { cards: ["c0"] });
  const profile = e.profile("p");
  assert.deepEqual(profile.wishlist, ["c0"]);
  assert.equal(profile.showcase[0].protected, 1);
  const row = e.economy.wishlist.page("p", "wishlist").rows[0];
  assert.equal(row.protected, 1);
  assert.equal(row.wishlisted, true);
  const counted = e.economy.wishlist.withCounts(
    e.catalogStore.cards(["c0"]),
  )[0];
  assert.deepEqual(counted.collectors, { wanted: 1, owned: 2 });
  assert.match(collectorsButton(counted, String), /Collectors \(1\/2\)/);
  const panel = collectorsPanel(
    { ...e.economy.wishlist.collectors("c0"), rarity: "SSS" },
    {
      escape: String,
      number: String,
      cardBy: () => counted,
      avatarHTML: () => "",
      profileURL: () => "#profile",
    },
  );
  assert.match(panel, /grade-sss collector-rarity/);
  assert.match(panel, /Owned By/);
  assert.match(panel, /Wanted By/);
  assert.deepEqual(e.profile("q").wishlist, []);
  assert.equal(e.profile("q").inventory[0].protected, 0);
});
