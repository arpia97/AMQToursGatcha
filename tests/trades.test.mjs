import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine(
    (sql, ...args) => db.prepare(sql).all(...args),
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
  );
  e.host("players", {
    players: ["a", "b", "c"].map((id) => ({ id, name: id })),
  });
  e.host("catalog", {
    cards: [
      { id: "one", kind: "character", name: "One", series: "Series" },
      { id: "two", kind: "seiyuu", name: "Two" },
      { id: "three", kind: "character", name: "Three", series: "Other" },
    ],
  });
  const act = (p, a, b, key = crypto.randomUUID()) =>
    e.mutate(p + ":" + a, key, b, () => e.action(p, a, b));
  const card = (p, id, level = 1, copies = 1) => {
    e.addCard(p, id, copies);
    e.run(
      "UPDATE inventory SET level=? WHERE player=? AND card=?",
      level,
      p,
      id,
    );
  };
  const inv = (p, id) => {
    const row = e.one(
      "SELECT copies,level FROM inventory WHERE player=? AND card=?",
      p,
      id,
    );
    return row ? { ...row } : undefined;
  };
  const list = () =>
    act("a", "trade-list", { card: "one", variant: "card", expectedLevel: 3 })
      .listing;
  const offer = (p, listing, id, level = 1) =>
    act(p, "trade-offer", {
      listing,
      card: id,
      variant: "card",
      expectedLevel: level,
    });
  return { e, db, act, card, inv, list, offer };
}
test("multi-card offers exchange mixed types and enhanced/spare duplicates atomically and refund every losing copy", (t) => {
  const f = fixture(t),
    e = f.e;
  f.card("a", "one", 3);
  f.card("b", "two", 4, 3);
  f.card("b", "three", 2);
  f.card("c", "one", 2);
  f.card("c", "two", 5, 2);
  const balances = ["a", "b", "c"].map((p) => e.player(p)),
    listing = f.list();
  const body = {
    listing,
    cards: [
      { card: "two", variant: "card", expectedLevel: 4 },
      { card: "two", variant: "extra", expectedLevel: 1 },
      { card: "three", variant: "card", expectedLevel: 2 },
    ],
  };
  f.act("b", "trade-offer", body, "bundle");
  f.act("b", "trade-offer", body, "bundle");
  assert.deepEqual(f.inv("b", "two"), { copies: 1, level: 1 });
  assert.equal(f.inv("b", "three"), undefined);
  assert.equal(e.economy.completion("b").character.owned, 1);
  assert.equal(e.economy.anime.progress("b", "other").owned, 1);
  f.act("c", "trade-offer", {
    listing,
    cards: [
      { card: "one", variant: "card", expectedLevel: 2 },
      { card: "two", variant: "card", expectedLevel: 5 },
    ],
  });
  const page = e.economy.trades.page("a"),
    offer = page.items[0].offers.find((o) => o.proposer === "b");
  assert.deepEqual(
    offer.cards.map((c) => [c.card, c.level]),
    [
      ["two", 4],
      ["two", 1],
      ["three", 2],
    ],
  );
  assert.equal(page.cards.length, 3);
  assert.equal(e.economy.trades.page(null).cards.length, 1);
  assert.equal(e.economy.trades.page("c").items[0].offers.length, 1);
  f.act("a", "trade-accept", { offer: offer.id }, "accept-bundle");
  f.act("a", "trade-accept", { offer: offer.id }, "accept-bundle");
  assert.deepEqual(f.inv("a", "two"), { copies: 2, level: 4 });
  assert.deepEqual(f.inv("a", "three"), { copies: 1, level: 2 });
  assert.deepEqual(f.inv("b", "one"), { copies: 1, level: 3 });
  assert.deepEqual(f.inv("c", "one"), { copies: 1, level: 2 });
  assert.deepEqual(f.inv("c", "two"), { copies: 2, level: 5 });
  assert.deepEqual(
    ["a", "b", "c"].map((p) => e.player(p)),
    balances,
  );
  assert.throws(
    () => f.act("a", "trade-accept", { offer: offer.id }),
    (e) => e.status === 409,
  );
});
test("invalid bundles never partially escrow copies: limits, ownership, protection, duplicate bases, stale levels and spare overdraw", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two", 4, 3);
  f.card("b", "three", 2);
  const listing = f.list(),
    base = { card: "two", variant: "card", expectedLevel: 4 },
    extra = { card: "two", variant: "extra", expectedLevel: 1 };
  const bad = [
    [],
    Array(11).fill(extra),
    null,
    [null],
    [base, base],
    [extra, extra, extra],
    [base, { card: "one", variant: "card", expectedLevel: 3 }],
    [base, { card: "three", variant: "card", expectedLevel: 3 }],
  ];
  for (const cards of bad) {
    assert.throws(() => f.act("b", "trade-offer", { listing, cards }));
    assert.deepEqual(f.inv("b", "two"), { copies: 3, level: 4 });
    assert.deepEqual(f.inv("b", "three"), { copies: 1, level: 2 });
    assert.equal(f.e.one("SELECT count(*) n FROM trade_offers").n, 0);
  }
  f.act("b", "protect-card", { card: "three", protected: true });
  assert.throws(
    () =>
      f.act("b", "trade-offer", {
        listing,
        cards: [base, { card: "three", variant: "card", expectedLevel: 2 }],
      }),
    /protected/,
  );
  assert.deepEqual(f.inv("b", "two"), { copies: 3, level: 4 });
});
for (const action of ["trade-withdraw", "trade-decline", "trade-cancel"])
  test(action + " returns every bundled copy once", (t) => {
    const f = fixture(t);
    f.card("a", "one", 3);
    f.card("b", "two", 4, 2);
    f.card("b", "three", 2);
    const listing = f.list();
    f.act("b", "trade-offer", {
      listing,
      cards: [
        { card: "two", variant: "card", expectedLevel: 4 },
        { card: "two", variant: "extra", expectedLevel: 1 },
        { card: "three", variant: "card", expectedLevel: 2 },
      ],
    });
    const offer = f.e.one("SELECT id FROM trade_offers").id,
      p = action === "trade-withdraw" ? "b" : "a",
      body = action === "trade-cancel" ? { listing } : { offer };
    f.act(p, action, body, "return");
    f.act(p, action, body, "return");
    assert.deepEqual(f.inv("b", "two"), { copies: 2, level: 4 });
    assert.deepEqual(f.inv("b", "three"), { copies: 1, level: 2 });
  });
test("old one-card escrow rows remain usable after restart and coexist with new bundles", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two", 4);
  const listing = f.list();
  f.e.tx(() => {
    const level = f.e.economy.take("b", "two", "card");
    f.e.run(
      "INSERT INTO trade_offers(listing,proposer,card,level,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      listing,
      "b",
      "two",
      level,
    );
  });
  const restarted = new Engine(
    (sql, ...args) => f.db.prepare(sql).all(...args),
    (fn) => fn(),
  );
  const offer = restarted.economy.trades.page("a").items[0].offers[0];
  assert.deepEqual(offer.cards, [{ card: "two", level: 4 }]);
  f.act("a", "trade-accept", { offer: offer.id });
  assert.deepEqual(f.inv("a", "two"), { copies: 1, level: 4 });
  assert.deepEqual(f.inv("b", "one"), { copies: 1, level: 3 });
});
test("bundle transfer failures roll back all copies; resetting the lister refunds whole bundles to unaffected offerers", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two", 4);
  f.card("b", "three", 2);
  const listing = f.list();
  f.act("b", "trade-offer", {
    listing,
    cards: [
      { card: "two", variant: "card", expectedLevel: 4 },
      { card: "three", variant: "card", expectedLevel: 2 },
    ],
  });
  const offer = f.e.one("SELECT id FROM trade_offers").id;
  const original = f.e.economy.acquire.bind(f.e.economy);
  let calls = 0;
  f.e.economy.acquire = (...args) => {
    if (++calls === 3) throw Error("third transfer failure");
    return original(...args);
  };
  assert.throws(() => f.act("a", "trade-accept", { offer }), /third transfer/);
  assert.equal(f.inv("a", "two"), undefined);
  assert.equal(f.inv("a", "three"), undefined);
  assert.equal(f.e.one("SELECT status FROM trade_offers").status, "open");
  f.e.economy.acquire = original;
  f.e.tx(() =>
    f.e.host("reset-player", { player: "a", confirmation: "RESET PLAYER a" }),
  );
  assert.deepEqual(f.inv("b", "two"), { copies: 1, level: 4 });
  assert.deepEqual(f.inv("b", "three"), { copies: 1, level: 2 });
});
test("accept atomically exchanges enhanced cards, refunds losing offers, preserves credits and replays once", (t) => {
  const f = fixture(t),
    { e } = f;
  f.card("a", "one", 3);
  f.card("b", "two", 4);
  f.card("c", "three", 2);
  const balances = ["a", "b", "c"].map((p) => e.player(p));
  const listing = f.list();
  f.offer("b", listing, "two", 4);
  f.offer("c", listing, "three", 2);
  assert.equal(f.inv("a", "one"), undefined);
  assert.equal(f.inv("b", "two"), undefined);
  assert.equal(e.economy.completion("a").character.owned, 1);
  assert.equal(e.economy.completion("b").seiyuu.owned, 1);
  assert.equal(e.economy.anime.page("a").series[0].owned, 1);
  const chosen = e.one("SELECT id FROM trade_offers WHERE proposer='b'").id;
  const result = f.act("a", "trade-accept", { offer: chosen }, "accept");
  assert.deepEqual(f.inv("a", "two"), { copies: 1, level: 4 });
  assert.deepEqual(f.inv("b", "one"), { copies: 1, level: 3 });
  assert.deepEqual(f.inv("c", "three"), { copies: 1, level: 2 });
  assert.deepEqual(
    f.act("a", "trade-accept", { offer: chosen }, "accept"),
    result,
  );
  assert.throws(
    () => f.act("a", "trade-accept", { offer: chosen }),
    /no longer/,
  );
  assert.throws(() => f.offer("c", listing, "three", 2), /closed/);
  assert.deepEqual(
    ["a", "b", "c"].map((p) => e.player(p)),
    balances,
  );
  assert.equal(e.one("SELECT status FROM trade_listings").status, "completed");
  assert.equal(
    e.one("SELECT status FROM trade_offers WHERE proposer='c'").status,
    "returned",
  );
});
test("protected/missing copies, stale levels, self offers and unauthorized actions cannot consume cards", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two");
  f.act("a", "protect-card", { card: "one", protected: true });
  assert.throws(() => f.list(), /protected/);
  f.act("a", "protect-card", { card: "one", protected: false });
  assert.throws(
    () =>
      f.act("a", "trade-list", {
        card: "one",
        variant: "card",
        expectedLevel: 2,
      }),
    /changed/,
  );
  const listing = f.list();
  assert.throws(() => f.offer("a", listing, "one"), /own/);
  assert.throws(
    () => f.act("c", "trade-cancel", { listing }),
    (e) => e.status === 403,
  );
  f.offer("b", listing, "two");
  const offer = f.e.one("SELECT id FROM trade_offers").id;
  for (const action of ["trade-accept", "trade-decline", "trade-withdraw"])
    assert.throws(
      () => f.act("c", action, { offer }),
      (e) => e.status === 403,
    );
  assert.equal(f.inv("b", "two"), undefined);
  assert.equal(f.e.one("SELECT status FROM trade_offers").status, "open");
  assert.throws(() => f.offer("b", listing, "two"), /Withdraw/);
});
test("withdraw, decline and cancel return escrow exactly once, including enhanced base versus spare copies", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3, 2);
  f.card("b", "two", 4, 2);
  const listing = f.act("a", "trade-list", {
    card: "one",
    variant: "extra",
    expectedLevel: 1,
  }).listing;
  assert.deepEqual(f.inv("a", "one"), { copies: 1, level: 3 });
  f.offer("b", listing, "two", 4);
  assert.deepEqual(f.inv("b", "two"), { copies: 1, level: 1 });
  let offer = f.e.one("SELECT max(id) id FROM trade_offers").id;
  f.act("b", "trade-withdraw", { offer });
  assert.deepEqual(f.inv("b", "two"), { copies: 2, level: 4 });
  f.offer("b", listing, "two", 4);
  offer = f.e.one("SELECT max(id) id FROM trade_offers").id;
  f.act("a", "trade-decline", { offer });
  assert.deepEqual(f.inv("b", "two"), { copies: 2, level: 4 });
  f.offer("b", listing, "two", 4);
  f.act("a", "trade-cancel", { listing }, "cancel");
  f.act("a", "trade-cancel", { listing }, "cancel");
  assert.deepEqual(f.inv("a", "one"), { copies: 2, level: 3 });
  assert.deepEqual(f.inv("b", "two"), { copies: 2, level: 4 });
});
test("offers are private to their maker and listing owner; public paging never leaks offered cards", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two");
  f.card("c", "three");
  const listing = f.list();
  f.offer("b", listing, "two");
  f.offer("c", listing, "three");
  assert.equal(f.e.economy.trades.page("a").items[0].offers.length, 2);
  assert.equal(f.e.economy.trades.page("b").items[0].offers.length, 1);
  assert.equal(f.e.economy.trades.page(null).items[0].offers.length, 0);
  assert.equal(f.e.economy.trades.page(null).cards.length, 1);
  assert.throws(
    () => f.e.economy.trades.page(null, { view: "offers" }),
    (e) => e.status === 401,
  );
  assert.throws(() => f.e.economy.trades.page("a", { page: 0 }), /whole/);
});
test("resets return other players offers; identity migration preserves trade ownership; full reset removes trades only", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two", 4);
  const listing = f.list();
  f.offer("b", listing, "two", 4);
  f.e.tx(() => new AliasSync(f.e).renamePlayer("a", "99"));
  assert.equal(
    f.e.economy.trades.page("99", { view: "listings" }).items[0].id,
    listing,
  );
  f.e.tx(() =>
    f.e.host("reset-player", { player: "99", confirmation: "RESET PLAYER 99" }),
  );
  assert.deepEqual(f.inv("b", "two"), { copies: 1, level: 4 });
  assert.equal(f.inv("99", "one"), undefined);
  f.e.tx(() => f.e.host("reset-all", { confirmation: "RESET ALL GAME DATA" }));
  assert.equal(f.e.one("SELECT count(*) n FROM trade_listings").n, 0);
  assert.equal(f.e.one("SELECT count(*) n FROM trade_offers").n, 0);
  assert.equal(f.e.catalogStore.summary().character, 2);
});
test("failure mid-accept rolls back both transfers and all offer states", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two", 4);
  const listing = f.list();
  f.offer("b", listing, "two", 4);
  const offer = f.e.one("SELECT id FROM trade_offers").id,
    acquire = f.e.economy.acquire.bind(f.e.economy);
  let n = 0;
  f.e.economy.acquire = (...a) => {
    if (++n === 2) throw Error("injected failure");
    return acquire(...a);
  };
  assert.throws(() => f.act("a", "trade-accept", { offer }), /injected/);
  assert.equal(f.inv("a", "two"), undefined);
  assert.equal(f.e.one("SELECT status FROM trade_listings").status, "open");
  assert.equal(f.e.one("SELECT status FROM trade_offers").status, "open");
});
test("listing pagination has no omissions, limits bound escrow, and resetting an offerer keeps another seller listing intact", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3, 25);
  f.card("b", "two", 2);
  for (let i = 0; i < 20; i++)
    f.act("a", "trade-list", {
      card: "one",
      variant: "extra",
      expectedLevel: 1,
    });
  assert.throws(() => f.list(), /20 open/);
  assert.equal(f.inv("a", "one").copies, 5);
  const first = f.e.economy.trades.page(null),
    second = f.e.economy.trades.page(null, { page: 2 });
  assert.equal(first.items.length, 12);
  assert.equal(second.items.length, 8);
  assert.equal(
    new Set([...first.items, ...second.items].map((l) => l.id)).size,
    20,
  );
  f.offer("b", first.items[0].id, "two", 2);
  f.e.tx(() =>
    f.e.host("reset-player", { player: "b", confirmation: "RESET PLAYER b" }),
  );
  assert.equal(f.e.economy.trades.page("a").items[0].offer_count, 0);
  assert.equal(f.inv("b", "two"), undefined);
  assert.equal(
    f.e.one("SELECT count(*) n FROM trade_listings WHERE status='open'").n,
    20,
  );
});

test("trade search matches card names in either order, anime and sellers before pagination across batches", (t) => {
  const { e } = fixture(t);
  e.run(
    "UPDATE catalog SET name='Iwami, Manaka',series='Anime, Example' WHERE id='two'",
  );
  e.catalogStore.invalidate();
  for (let i = 0; i < 25; i++)
    e.run(
      "INSERT INTO trade_listings(seller,card,level,created_at,updated_at) VALUES('a','two',1,1,1)",
    );
  for (let i = 0; i < 105; i++)
    e.run(
      "INSERT INTO trade_listings(seller,card,level,created_at,updated_at) VALUES('b','one',1,1,1)",
    );
  for (const query of [
    "Iwami, Manaka",
    "Iwami Manaka",
    "Manaka Iwami",
    "Example Anime",
  ]) {
    const a = e.economy.trades.page(null, { query });
    assert.equal(a.items.length, 12);
    assert.equal(a.hasMore, true);
    assert.ok(a.items.every((l) => l.card === "two"));
    assert.equal(a.items[0].id, 25);
    const b = e.economy.trades.page(null, { query, page: 2 });
    assert.equal(b.items.length, 12);
    assert.equal(b.hasMore, true);
    assert.equal(b.items[0].id, 13);
    const c = e.economy.trades.page(null, { query, page: 3 });
    assert.equal(c.items.length, 1);
    assert.equal(c.hasMore, false);
    assert.equal(c.items[0].id, 1);
  }
  e.run("UPDATE players SET display_name='Seller, Collector' WHERE id='a'");
  assert.equal(
    e.economy.trades.page(null, { query: "Collector Seller" }).items[0]
      .seller_name,
    "Seller, Collector",
  );
  assert.equal(
    e.economy.trades.page(null, { query: "missing" }).items.length,
    0,
  );
  assert.equal(
    e.economy.trades.page(null, { query: "' OR 1=1 --" }).items.length,
    0,
  );
  e.action("c", "wishlist", { card: "two", wanted: true });
  assert.throws(() => e.economy.trades.page(null, { wishlistOnly: true }), {
    status: 401,
  });
  const wished = [1, 2, 3].flatMap(
    (page) => e.economy.trades.page("c", { wishlistOnly: true, page }).items,
  );
  assert.equal(wished.length, 25);
  assert.ok(wished.every((l) => l.card === "two"));
  assert.equal(
    e.economy.trades.page("c", { wishlistOnly: true, query: "missing" }).items
      .length,
    0,
  );
  assert.equal(
    e.economy.trades.page("b", { wishlistOnly: true }).items.length,
    0,
  );
  const unfiltered = e.economy.trades.page(null);
  assert.equal(unfiltered.items[0].id, 130);
  assert.equal(unfiltered.query, "");
});
test("trade search keeps account scopes and private offers intact and never changes cards or credits", (t) => {
  const { e, card, list, offer } = fixture(t);
  card("a", "one", 3);
  card("b", "two");
  const id = list();
  offer("b", id, "two");
  const before = JSON.stringify({
    inventory: e.all("SELECT * FROM inventory"),
    wallet: e.all("SELECT balance,earned FROM players"),
    offers: e.all("SELECT * FROM trade_offers"),
  });
  assert.equal(
    e.economy.trades.page("b", { view: "offers", query: "One" }).items.length,
    1,
  );
  assert.equal(
    e.economy.trades.page("c", { view: "offers", query: "One" }).items.length,
    0,
  );
  assert.equal(
    e.economy.trades.page("b", { view: "listings", query: "One" }).items.length,
    0,
  );
  assert.equal(
    e.economy.trades.page("a", { view: "listings", query: "One" }).items.length,
    1,
  );
  assert.equal(e.economy.trades.page(null, { query: "Two" }).items.length, 0);
  assert.equal(
    e.economy.trades.page(null, { query: "One" }).items[0].offers.length,
    0,
  );
  assert.throws(
    () => e.economy.trades.page(null, { view: "offers", query: "One" }),
    { status: 401 },
  );
  assert.equal(
    JSON.stringify({
      inventory: e.all("SELECT * FROM inventory"),
      wallet: e.all("SELECT balance,earned FROM players"),
      offers: e.all("SELECT * FROM trade_offers"),
    }),
    before,
  );
  e.run("UPDATE trade_listings SET status='cancelled' WHERE id=?", id);
  assert.equal(e.economy.trades.page(null, { query: "One" }).items.length, 0);
  assert.equal(
    e.economy.trades.page("a", { view: "listings", query: "One" }).items[0]
      .status,
    "cancelled",
  );
  assert.equal(
    e.economy.trades.page("a", {
      view: "listings",
      query: "One",
      hideCompleted: true,
    }).items.length,
    0,
  );
  e.run("UPDATE trade_listings SET status='completed' WHERE id=?", id);
  assert.equal(
    e.economy.trades.page("a", { view: "listings", query: "One" }).items[0]
      .status,
    "completed",
  );
  assert.equal(
    e.economy.trades.page("a", {
      view: "listings",
      query: "One",
      hideCompleted: true,
    }).items.length,
    0,
  );
  e.run("UPDATE trade_listings SET status='open' WHERE id=?", id);
  assert.equal(
    e.economy.trades.page("a", {
      view: "listings",
      query: "One",
      hideCompleted: true,
    }).items.length,
    1,
  );
});

test("trade requests create exactly one persistent owner notification and seen notices remain private", (t) => {
  const f = fixture(t);
  f.card("a", "one", 3);
  f.card("b", "two", 1);
  const listing = f.list();
  const body = { listing, card: "two", variant: "card", expectedLevel: 1 };
  f.act("b", "trade-offer", body, "request");
  f.act("b", "trade-offer", body, "request");
  const notices = f.e.economy.notices.pending("a");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "trade-request");
  assert.equal(notices[0].metadata.listing, listing);
  assert.equal(notices[0].metadata.proposer, "b");
  assert.equal(f.e.economy.notices.pending("c").length, 0);
  assert.throws(() => f.e.economy.notices.seen("b", [notices[0].id]));
  f.e.economy.notices.seen("a", [notices[0].id]);
  assert.equal(f.e.economy.notices.pending("a").length, 0);
});
