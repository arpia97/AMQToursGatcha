import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  SHOP_PRICE_REVISION,
  SHOP_PRICES,
  instantSalePrice,
} from "../public/card-values.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const sql = (q, ...a) => db.prepare(q).all(...a);
  const tx = (fn) => {
    db.exec("BEGIN");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  const now = () => Date.UTC(2026, 9, 29),
    fresh = () => new Engine(sql, tx, now, () => 0),
    e = fresh();
  e.host("players", { players: [{ id: "p", name: "Player" }] });
  e.wallet("p", 10000, "Fixture", true);
  e.host("catalog", {
    cards: [
      { id: "a", kind: "character", name: "A" },
      { id: "b", kind: "seiyuu", name: "B" },
    ],
  });
  e.addCard("p", "a", 5);
  e.action("p", "list-card", {
    card: "a",
    variant: "extra",
    venue: "shop",
    price: 12345,
  });
  e.action("p", "list-card", {
    card: "a",
    variant: "extra",
    venue: "auction",
    hours: 24,
    price: 7777,
  });
  e.run(
    "INSERT INTO catalog_meta VALUES('pricing-import-checkpoint','{\"scanned\":12345}')",
  );
  return { e, fresh, now };
}
function legacyStock(e, now) {
  e.run("DELETE FROM settings WHERE key='shop_price_revision'");
  for (const [price, ends, buyer] of [
    [100, now() + 86400000, null],
    [25600, now() + 86400000, null],
    [12800, now() + 86400000, "p"],
    [200, now() - 1, null],
  ])
    e.run(
      "INSERT INTO weekly_shop(card,kind,price,starts,ends,buyer) VALUES('a','character',?,?,?,?)",
      price,
      now() - 1000,
      ends,
      buyer,
    );
}

test("price reduction reprices active unsold stock once across restarts, preserving IDs, sold history and the economy", (t) => {
  const { e, fresh, now } = fixture(t);
  legacyStock(e, now);
  const before = e.all("SELECT * FROM weekly_shop ORDER BY id");
  const protectedTables = [
    "players",
    "inventory",
    "ledger",
    "market_listings",
    "auctions",
    "catalog",
    "catalog_meta",
    "receipts",
  ];
  const saved = Object.fromEntries(
    protectedTables.map((table) => [table, e.all("SELECT * FROM " + table)]),
  );
  const restarted = fresh();
  assert.equal(
    restarted.one("SELECT value FROM settings WHERE key='shop_price_revision'")
      .value,
    SHOP_PRICE_REVISION,
  );
  assert.deepEqual(
    restarted
      .all("SELECT * FROM weekly_shop ORDER BY id")
      .map((row) => ({ ...row })),
    before.map((row, i) => ({
      ...row,
      price: i < 2 ? row.price / 2 : row.price,
    })),
  );
  for (const table of protectedTables)
    assert.deepEqual(
      restarted.all("SELECT * FROM " + table),
      saved[table],
      table + " changed",
    );
  const once = restarted.all("SELECT * FROM weekly_shop ORDER BY id");
  fresh().economy.applyShopPriceRevision();
  assert.deepEqual(e.all("SELECT * FROM weekly_shop ORDER BY id"), once);
  const balance = e.player("p").balance;
  e.mutate("p:shop-buy", "purchase", { slot: before[0].id }, () =>
    e.action("p", "shop-buy", { slot: before[0].id }),
  );
  assert.equal(e.player("p").balance, balance - 50);
  assert.equal(
    e.one("SELECT price FROM weekly_shop WHERE id=?", before[0].id).price,
    50,
  );
  assert.equal(e.player("p").earned, 10000);
});

test("a failed pricing revision rolls back prices and its receipt before a safe retry", (t) => {
  const { e, now } = fixture(t);
  legacyStock(e, now);
  const before = e.all("SELECT * FROM weekly_shop ORDER BY id"),
    run = e.run.bind(e);
  e.run = (q, ...a) => {
    if (q.startsWith("INSERT INTO settings VALUES('shop_price_revision'"))
      throw Error("Simulated storage failure");
    return run(q, ...a);
  };
  assert.throws(() => e.economy.applyShopPriceRevision(), /storage failure/);
  assert.deepEqual(e.all("SELECT * FROM weekly_shop ORDER BY id"), before);
  assert.equal(
    e.one("SELECT value FROM settings WHERE key='shop_price_revision'"),
    undefined,
  );
  e.run = run;
  e.economy.applyShopPriceRevision();
  e.economy.applyShopPriceRevision();
  assert.deepEqual(
    e.all("SELECT price FROM weekly_shop ORDER BY id").map((row) => row.price),
    [50, 12800, 12800, 200],
  );
});

test("old single-card sale quotes reject before consuming, while revised enhanced sales pay once", (t) => {
  const { e } = fixture(t);
  e.run("UPDATE inventory SET level=4 WHERE player='p' AND card='a'");
  e.catalogStore.card = (id) => ({
    id,
    name: "Card",
    kind: "character",
    rarity: "D",
  });
  const before = e.player("p"),
    item = e.one("SELECT * FROM inventory WHERE player='p' AND card='a'");
  const old = {
    card: "a",
    variant: "card",
    expectedRarity: "D",
    expectedLevel: 4,
    expectedPrice: 400,
  };
  assert.throws(
    () =>
      e.mutate("p:sell-instant", "old", old, () =>
        e.action("p", "sell-instant", old),
      ),
    /changed/,
  );
  assert.deepEqual(
    e.one("SELECT * FROM inventory WHERE player='p' AND card='a'"),
    item,
  );
  assert.deepEqual(e.player("p"), before);
  const body = { ...old, expectedPrice: 200 },
    act = () =>
      e.mutate("p:sell-instant", "new", body, () =>
        e.action("p", "sell-instant", body),
      );
  assert.equal(act().price, 200);
  assert.equal(act().price, 200);
  assert.equal(e.player("p").balance, before.balance + 200);
  assert.equal(e.player("p").earned, before.earned);
  assert.equal(SHOP_PRICES.AG, 12800);
  assert.equal(instantSalePrice({ rarity: "AG" }), 6400);
});
