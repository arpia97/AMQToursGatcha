import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { batchSaleQuote, canUpgrade } from "../public/card-management.js";
import { collectionView } from "../public/card-display.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const sql = (s, ...a) => db.prepare(s).all(...a);
  const tx = (fn) => {
    db.exec("BEGIN");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const e = new Engine(sql, tx, () => Date.UTC(2026, 9, 27));
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.host("catalog", {
    cards: [
      { id: "d", name: "D card", kind: "character", role: "main" },
      { id: "s", name: "S card", kind: "character", role: "supporting" },
      { id: "v", name: "Voice", kind: "seiyuu" },
    ],
  });
  const map = new Map(
    e.catalogStore
      .cards(["d", "s", "v"])
      .map((c) => [c.id, { ...c, rarity: c.id === "s" ? "S" : "D" }]),
  );
  e.catalogStore.card = (id) => map.get(id);
  e.catalogStore.cards = (ids) => ids.map((id) => map.get(id)).filter(Boolean);
  e.addCard("p", "d", 4);
  e.addCard("p", "s", 2);
  e.addCard("p", "v", 2);
  e.run("UPDATE inventory SET level=3 WHERE player='p' AND card='d'");
  const act = (a, b) => e.tx(() => e.action("p", a, b));
  const filters = {
    kind: "character",
    query: "",
    rarity: "",
    role: "",
    upgradable: false,
    mode: "extras",
  };
  const quote = (f = filters) =>
    batchSaleQuote(
      e.all("SELECT * FROM inventory WHERE player='p'"),
      (id) => map.get(id),
      f,
    );
  return { e, act, filters, quote, map, sql, tx };
}
test("protection persists across pulls and restart and blocks sales, listings and fusion for all copies", (t) => {
  const { e, act, sql, tx } = fixture(t);
  act("protect-card", { card: "d", protected: true });
  e.addCard("p", "d");
  for (const variant of ["extra", "card"]) {
    assert.throws(
      () =>
        act("sell-instant", {
          card: "d",
          variant,
          expectedPrice: variant === "extra" ? 25 : 100,
          expectedLevel: variant === "extra" ? 1 : 3,
          expectedRarity: "D",
        }),
      /protected/,
    );
    assert.throws(
      () => act("list-card", { card: "d", variant, venue: "shop", price: 100 }),
      /protected/,
    );
    assert.throws(
      () =>
        e.economy.fusion.prepare("p", [
          { card: "d", variant, expectedRarity: "D", expectedLevel: 3 },
        ]),
      /protected/,
    );
  }
  assert.equal(
    e.one("SELECT copies FROM inventory WHERE player='p' AND card='d'").copies,
    5,
  );
  const restarted = new Engine(sql, tx);
  assert.equal(
    restarted.one(
      "SELECT protected FROM inventory WHERE player='p' AND card='d'",
    ).protected,
    1,
  );
  act("protect-card", { card: "d", protected: false });
  act("sell-instant", {
    card: "d",
    variant: "extra",
    expectedPrice: 25,
    expectedLevel: 1,
    expectedRarity: "D",
  });
  assert.equal(e.player("p").balance, 25);
  assert.throws(
    () => e.action("q", "protect-card", { card: "d", protected: true }),
    /own/,
  );
});
test("batch extras use combined filters across pages, exclude protected cards and keep enhanced bases", (t) => {
  const { e, act, filters, quote } = fixture(t);
  act("protect-card", { card: "s", protected: true });
  const q = quote();
  assert.equal(q.count, 3);
  assert.equal(q.total, 75);
  const b = { filters, expectedItems: q.items };
  const run = () =>
    e.mutate("p:sell-batch", "batch-once", b, () =>
      e.action("p", "sell-batch", b),
    );
  run();
  run();
  assert.equal(e.player("p").balance, 75);
  assert.equal(e.player("p").earned, 0);
  assert.deepEqual(
    {
      ...e.one(
        "SELECT copies,level FROM inventory WHERE player='p' AND card='d'",
      ),
    },
    { copies: 1, level: 3 },
  );
  assert.equal(
    e.one("SELECT copies FROM inventory WHERE player='p' AND card='s'").copies,
    2,
  );
  assert.equal(quote().items.length, 0);
});
test("batch full sales account for invested levels and clean avatar/showcase only for sold cards", (t) => {
  const { e, act, filters, quote } = fixture(t),
    f = { ...filters, mode: "all", rarity: "D" },
    q = quote(f);
  assert.equal(q.total, 175);
  assert.equal(q.count, 4);
  e.run("UPDATE players SET avatar_card='d' WHERE id='p'");
  act("showcase", { cards: ["d", "s"] });
  act("sell-batch", { filters: f, expectedItems: q.items });
  assert.equal(e.player("p").avatar_card, null);
  assert.deepEqual(
    e
      .all("SELECT card FROM profile_showcase WHERE player='p'")
      .map((row) => ({ ...row })),
    [{ card: "s" }],
  );
  assert.equal(e.all("SELECT * FROM inventory WHERE player='p'").length, 2);
});
test("batch stale protection, rarity or inventory and wallet overflow roll back the entire sale", (t) => {
  const { e, act, filters, quote, map } = fixture(t),
    q = quote(),
    b = { filters, expectedItems: q.items };
  assert.throws(
    () =>
      act("sell-batch", {
        filters,
        expectedItems: q.items.map((item) => ({
          ...item,
          price: item.price * 2,
        })),
      }),
    /changed/,
  );
  act("protect-card", { card: "s", protected: true });
  assert.throws(() => act("sell-batch", b), /changed/);
  act("protect-card", { card: "s", protected: false });
  map.get("d").rarity = "C";
  assert.throws(() => act("sell-batch", b), /changed/);
  map.get("d").rarity = "D";
  e.addCard("p", "d");
  assert.throws(() => act("sell-batch", b), /changed/);
  const fresh = quote();
  e.run("UPDATE players SET balance=1000000000000 WHERE id='p'");
  assert.throws(
    () => act("sell-batch", { filters, expectedItems: fresh.items }),
    /Wallet limit/,
  );
  assert.equal(
    e.one("SELECT copies FROM inventory WHERE player='p' AND card='d'").copies,
    5,
  );
});
test("upgradable filtering uses exact duplicate requirements, combines role and caps levels", () => {
  const c = {
    id: "x",
    name: "A",
    kind: "character",
    role: "main",
    rarity: "D",
  };
  const inventory = [
    { card: "x", copies: 5, level: 3 },
    { card: "y", copies: 4, level: 3 },
    { card: "z", copies: 99999999, level: 20 },
  ];
  assert.equal(canUpgrade(inventory[0]), true);
  assert.equal(canUpgrade(inventory[1]), false);
  assert.equal(canUpgrade(inventory[2]), false);
  assert.equal(
    collectionView(inventory, () => c, {
      kind: "character",
      upgradable: true,
      role: "main",
    }).length,
    1,
  );
  assert.equal(
    collectionView(inventory, () => c, {
      kind: "character",
      upgradable: true,
      role: "supporting",
    }).length,
    0,
  );
});
test("batch preview bounds unique cards to 200 and quotes all extra copies without consuming a base", () => {
  const inv = Array.from({ length: 205 }, (_, i) => ({
    card: String(i),
    level: 2,
    copies: 3,
  }));
  const q = batchSaleQuote(
    inv,
    (id) => ({ id, kind: "seiyuu", name: id, rarity: "D" }),
    { kind: "seiyuu", mode: "extras" },
  );
  assert.equal(q.items.length, 200);
  assert.equal(q.hasMore, true);
  assert.equal(q.total, 10000);
  assert.equal(q.count, 400);
});
