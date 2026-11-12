import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import { MAX_WISHLIST } from "../src/wishlist.js";
import { migrateTradeDefaults } from "../src/trade-defaults.js";
import { demoFeatures } from "../public/demo-features.js";
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
test("automatic trade defaults migrate once, follow protection, retain opt-outs and exclude locked accounts",t=>{
  const {e,act}=fixture(t);
  e.addCard("p","c1",3);e.addCard("p","c2");e.addCard("q","c3");
  e.run("UPDATE inventory SET for_trade=0 WHERE player='p' AND card='c1'");
  e.run("UPDATE inventory SET protected=1,for_trade=1 WHERE player='p' AND card='c2'");
  e.run("UPDATE players SET account_locked=1 WHERE id='q'");
  e.run("DELETE FROM settings WHERE key='automatic_trade_defaults_revision'");
  const before=e.all("SELECT player,card,copies,level,protected,position,acquired_at FROM inventory ORDER BY player,card");
  const balances=e.all("SELECT id,balance,earned FROM players ORDER BY id");
  assert.equal(migrateTradeDefaults(e),true);
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c1'").for_trade,1);
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c2'").for_trade,0);
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c3'").for_trade,0);
  assert.deepEqual(e.all("SELECT player,card,copies,level,protected,position,acquired_at FROM inventory ORDER BY player,card"),before);
  assert.deepEqual(e.all("SELECT id,balance,earned FROM players ORDER BY id"),balances);
  act("p","trade-card",{card:"c1",forTrade:false});
  assert.equal(migrateTradeDefaults(e),false);
  e.addCard("p","c1");
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c1'").for_trade,0);
  assert.throws(()=>act("p","trade-card",{card:"c2",forTrade:true}),/Unprotect/);
  act("p","protect-card",{card:"c2",protected:false});
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c2'").for_trade,1);
  act("p","protect-card",{card:"c2",protected:true});
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c2'").for_trade,0);
  e.addCard("p","c2");
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c2'").for_trade,0);
  e.economy.acquire("p","c4",3);e.economy.acquire("q","c5",2);
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c4'").for_trade,1);
  assert.equal(e.one("SELECT for_trade FROM inventory WHERE card='c5'").for_trade,0);
});

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
  assert.match(collectorsButton(counted, String), /Collection \(2\/1\) ↗/);
  assert.match(
    collectorsButton(counted, String),
    /aria-label="Collection: 2 owned, 1 wishlisted"/,
  );
  assert.match(
    collectorsButton(counted, String),
    /title="Owned by 2 · Wishlisted by 1"/,
  );
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

test("collection custom order persists, filters and sorts in profile collection view", (t) => {
  const { e, act } = fixture(t);
  e.host("catalog", {
    cards: [
      { id: "community-0", name: "Card 0", kind: "character", fixedRarity: "AG", role: "main", series: "Series" },
      { id: "community-1", name: "Card 1", kind: "seiyuu", fixedRarity: "S", series: "Series" },
      { id: "community-2", name: "Card 2", kind: "character", fixedRarity: "B", role: "supporting", series: "Series" },
    ],
  });
  e.addCard("p", "community-0");
  e.addCard("p", "community-1");
  e.addCard("p", "community-2");
  e.run("UPDATE inventory SET level=4,copies=3,acquired_at=100 WHERE player='p' AND card='community-0'");
  e.run("UPDATE inventory SET level=2,copies=5,acquired_at=300 WHERE player='p' AND card='community-1'");
  e.run("UPDATE inventory SET level=1,copies=1,acquired_at=200 WHERE player='p' AND card='community-2'");

  const initial = e.economy.wishlist.readCollection("p").map((r) => r.card);
  assert.deepEqual(initial, ["community-1", "community-2", "community-0"]);

  const customOrder = ["community-2", "community-0", "community-1"];
  const saved = act(
    "p",
    "collection-order",
    { cards: customOrder, expectedCards: initial },
    "col-order-1",
  );
  assert.deepEqual(
    saved.inventory.map((r) => r.card),
    customOrder,
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { sort: "custom" }).rows.map((r) => r.card),
    customOrder,
  );
  assert.deepEqual(
    e.state("p").inventory.map((r) => r.card),
    customOrder,
  );
  assert.deepEqual(
    e.profile("p").inventory.map((r) => r.card),
    customOrder,
  );
  assert.throws(
    () =>
      act("p", "collection-order", {
        cards: customOrder,
        expectedCards: initial,
      }),
    /changed/,
  );

  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { kind: "seiyuu" }).rows.map((r) => r.card),
    ["community-1"],
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { kind: "character", role: "main" }).rows.map((r) => r.card),
    ["community-0"],
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { rarity: "B" }).rows.map((r) => r.card),
    ["community-2"],
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { query: "Card 1" }).rows.map((r) => r.card),
    ["community-1"],
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { sort: "copies" }).rows.map((r) => r.card),
    ["community-1", "community-0", "community-2"],
  );
  assert.deepEqual(
    e.economy.wishlist.page("p", "collection", 1, { sort: "rarity" }).rows.map((r) => r.card),
    ["community-0", "community-1", "community-2"],
  );

  const ownHtml = profileCardPanel(
    e.economy.wishlist.page("p", "collection", 1),
    {
      cardBy: (id) => e.catalogStore.card(id),
      cardHTML: () => "<article></article>",
      escape: String,
      number: String,
      own: true,
      wishlist: [],
      collectionFilters: {
        kind: "character",
        query: "Card",
        rarity: "AG",
        role: "Main",
        sort: "custom",
      },
    },
  );
  assert.match(ownHtml, /data-action="collection-arrange"/);
  assert.match(ownHtml, /data-action="profile-collection-kind"/);
  assert.match(ownHtml, /id="profile-collection-search"/);
  assert.match(ownHtml, /id="profile-collection-sort"/);
  assert.match(ownHtml, /id="profile-collection-rarity"/);
  assert.match(ownHtml, /id="profile-collection-role"/);
});

test("trade-card toggles willing-to-trade marker, and viewer wishlist filters public collection", (t) => {
  const { e, act } = fixture(t);
  e.host("catalog", {
    cards: [
      { id: "community-trade-1", name: "Trade 1", kind: "character", fixedRarity: "AG", series: "Series" },
      { id: "community-trade-2", name: "Trade 2", kind: "character", fixedRarity: "S", series: "Series" },
      { id: "community-trade-3", name: "Trade 3", kind: "seiyuu", fixedRarity: "A", series: "Series" },
    ],
  });
  e.addCard("p", "community-trade-1");
  e.addCard("p", "community-trade-2");
  e.addCard("p", "community-trade-3");

  // Newly acquired unprotected cards start tradeable; opt-outs remain available.
  assert.equal(e.economy.wishlist.readCollection("p")[0].for_trade, 1);
  act("p","trade-card",{card:"community-trade-2",forTrade:false});
  act("p","trade-card",{card:"community-trade-3",forTrade:false});

  // Toggle forTrade on
  const resOn = act("p", "trade-card", { card: "community-trade-1", forTrade: true });
  assert.match(resOn.message, /marked for trade/i);
  assert.equal(
    e.one("SELECT for_trade FROM inventory WHERE player='p' AND card='community-trade-1'").for_trade,
    1,
  );
  assert.equal(
    e.economy.wishlist.page("p", "collection", 1).rows.find((r) => r.card === "community-trade-1").for_trade,
    1,
  );

  // Toggle forTrade off
  const resOff = act("p", "trade-card", { card: "community-trade-1", forTrade: false });
  assert.match(resOff.message, /trade marker removed/i);
  assert.equal(
    e.one("SELECT for_trade FROM inventory WHERE player='p' AND card='community-trade-1'").for_trade,
    0,
  );

  // Re-enable for trade on community-trade-1
  act("p", "trade-card", { card: "community-trade-1", forTrade: true });

  // Cannot mark unowned card
  assert.throws(
    () => act("p", "trade-card", { card: "community-trade-unowned", forTrade: true }),
    /own that card/,
  );

  // Viewer q has wishlisted community-trade-2
  act("q", "wishlist", { card: "community-trade-2", wanted: true });

  // When viewer q views p's collection with wishlist: true
  const filtered = e.economy.wishlist.page("p", "collection", 1, {
    wishlist: true,
    viewer: "q",
  });
  assert.deepEqual(
    filtered.rows.map((r) => r.card),
    ["community-trade-2"],
  );
  assert.equal(filtered.total, 1);

  // When viewer q views p's collection without wishlist filter
  const allRows = e.economy.wishlist.page("p", "collection", 1, {
    viewer: "q",
  });
  assert.equal(allRows.rows.length, 3);

  // When viewing p's collection with tradeable: true
  const tradeableOnly = e.economy.wishlist.page("p", "collection", 1, {
    tradeable: true,
  });
  assert.deepEqual(
    tradeableOnly.rows.map((r) => r.card),
    ["community-trade-1"],
  );
  assert.equal(tradeableOnly.total, 1);

  // When viewing p's collection with both wishlist and tradeable
  const bothFilter = e.economy.wishlist.page("p", "collection", 1, {
    wishlist: true,
    tradeable: true,
    viewer: "q",
  });
  // q wishlisted community-trade-2, but only community-trade-1 is for trade
  assert.equal(bothFilter.total, 0);

  // UI tests for "My Wishlist Only" and "Tradeable Only" checkbox
  const viewerHtml = profileCardPanel(
    e.economy.wishlist.page("p", "collection", 1),
    {
      cardBy: (id) => e.catalogStore.card(id),
      cardHTML: () => "<article></article>",
      escape: String,
      number: String,
      own: false,
      wishlist: ["community-trade-2"],
      collectionFilters: {
        kind: "both",
        query: "",
        rarity: "",
        role: "",
        sort: "custom",
        wishlist: true,
        tradeable: true,
      },
    },
  );
  assert.match(viewerHtml, /id="profile-collection-wishlist"/);
  assert.match(viewerHtml, /My Wishlist Only/);
  assert.match(viewerHtml, /id="profile-collection-tradeable"/);
  assert.match(viewerHtml, /Tradeable Only/);
  assert.match(
    viewerHtml,
    /My Wishlist Only<\/label>[\s\S]*?Tradeable Only<\/label>/,
  );

  // Own collection also has Tradeable Only; the viewer wishlist filter stays separate.
  const ownHtml = profileCardPanel(
    e.economy.wishlist.page("p", "collection", 1),
    {
      cardBy: (id) => e.catalogStore.card(id),
      cardHTML: () => "<article></article>",
      escape: String,
      number: String,
      own: true,
      wishlist: ["community-trade-2"],
      collectionFilters: {},
    },
  );
  assert.doesNotMatch(ownHtml, /id="profile-collection-wishlist"/);
  assert.match(ownHtml, /id="profile-collection-tradeable"/);
  assert.match(ownHtml, /class="collection-checkboxes"/);

  const featuresCss = fs.readFileSync(
    new URL("../public/features.css", import.meta.url),
    "utf8",
  );
  assert.match(
    featuresCss,
    /\.profile-collection-toolbar[\s\S]*?align-items:\s*end;/,
  );
  assert.match(
    featuresCss,
    /\.collection-checkboxes[\s\S]*?align-self:\s*end;/,
  );
  assert.match(
    featuresCss,
    /\.collection-checkboxes \.check-label[\s\S]*?height:\s*34px;/,
  );
});

test("wishlist capacity supports 1000 cards across engine, reordering, pagination and demo mock", (t) => {
  assert.equal(MAX_WISHLIST, 1000);
  const { e, act } = fixture(t);

  // Insert 1001 catalog cards: w0..w1000
  for (let i = 0; i <= 1000; i++) {
    e.run(
      "INSERT OR IGNORE INTO catalog(id,kind,name,series) VALUES(?,?,?,?)",
      "w" + i,
      "character",
      "Wish Card " + i,
      "Series",
    );
  }

  // Prepopulate 1000 cards in wishlist for player p (w0 .. w999)
  for (let i = 0; i < 1000; i++) {
    e.run(
      "INSERT INTO card_wishlist(player,card,created,position) VALUES('p',?,?,?)",
      "w" + i,
      1000 + i,
      i,
    );
  }

  assert.equal(e.economy.wishlist.read("p").length, 1000);

  // Re-saving an already wishlisted card at capacity succeeds (idempotent)
  const resExisting = act("p", "wishlist", { card: "w0", wanted: true });
  assert.equal(resExisting.message, "Card saved to wishlist.");
  assert.equal(e.economy.wishlist.read("p").length, 1000);

  // Adding the 1001st unique card rejects with limit error
  assert.throws(
    () => act("p", "wishlist", { card: "w1000", wanted: true }),
    /Your wishlist can hold up to 1000 cards\./,
  );

  // Removing one card reduces length to 999
  const resRemove = act("p", "wishlist", { card: "w0", wanted: false });
  assert.equal(resRemove.message, "Card removed from wishlist.");
  assert.equal(e.economy.wishlist.read("p").length, 999);

  // Now adding the 1001st card succeeds, bringing total back to 1000
  const resAdd = act("p", "wishlist", { card: "w1000", wanted: true });
  assert.equal(resAdd.message, "Card saved to wishlist.");
  assert.equal(e.economy.wishlist.read("p").length, 1000);

  // Wishlist pagination works with 1000 items (42 pages: 41 * 24 + 16 = 1000)
  const page1 = e.economy.wishlist.page("p", "wishlist", 1);
  assert.equal(page1.rows.length, 24);
  assert.equal(page1.hasMore, true);

  const page42 = e.economy.wishlist.page("p", "wishlist", 42);
  assert.equal(page42.rows.length, 16);
  assert.equal(page42.hasMore, false);

  // Reorder 1000 items
  const current = e.economy.wishlist.read("p");
  const reversed = [...current].reverse();
  const reorderRes = act("p", "wishlist-order", {
    cards: reversed,
    expectedCards: current,
  });
  assert.equal(reorderRes.message, "Wishlist order saved.");
  assert.deepEqual(e.economy.wishlist.read("p"), reversed);

  // Demo features mock enforces MAX_WISHLIST
  const mockCards = Array.from({ length: 1001 }, (_, i) => ({ id: "d" + i }));
  const mockState = {
    s: { wishlist: mockCards.slice(0, 1000).map((c) => c.id) },
    cards: mockCards,
  };
  assert.throws(
    () => demoFeatures(mockState, "wishlist", { card: "d1000", wanted: true }),
    /Your wishlist can hold up to 1000 cards\./,
  );
  // Re-saving existing card in demo succeeds
  const mockResExisting = demoFeatures(mockState, "wishlist", {
    card: "d0",
    wanted: true,
  });
  assert.equal(mockResExisting.wishlist.length, 1000);
});
