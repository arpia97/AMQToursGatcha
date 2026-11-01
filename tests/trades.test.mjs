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
