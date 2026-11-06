import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  RARITIES,
  cardInvestment,
  instantSalePrice,
} from "../public/card-values.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine(
    (sql, ...a) => db.prepare(sql).all(...a),
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
    () => Date.UTC(2026, 9, 24),
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  const cards = new Map(
    [...RARITIES, "Pending"].map((rarity, i) => [
      rarity,
      {
        id: rarity,
        kind: i % 2 ? "seiyuu" : "character",
        rarity: rarity === "Pending" ? null : rarity,
        name: rarity + " card",
        series: "Anime",
        active: 1,
      },
    ]),
  );
  e.host("catalog", { cards: [...cards.values()] });
  // Model a deterministic classified source while keeping real SQLite ownership,
  // wallet, escrow, receipt and rollback behaviour under test.
  e.catalogStore.card = (id) => cards.get(id) || null;
  e.catalogStore.pool = (kind) => ({
    cards: [...cards.values()].filter((c) => c.kind === kind),
  });
  const act = (action, b, key = crypto.randomUUID()) =>
    e.mutate("p:" + action, key, b, () => e.action("p", action, b));
  const add = (id, copies = 1, level = 1) => {
    e.addCard("p", id, copies);
    e.run(
      "UPDATE inventory SET level=? WHERE player='p' AND card=?",
      level,
      id,
    );
  };
  const material = (id, variant = "card") => ({
    card: id,
    variant,
    expectedRarity: cards.get(id).rarity || "Pending",
    expectedLevel:
      variant === "extra"
        ? 1
        : e.one("SELECT level FROM inventory WHERE player='p' AND card=?", id)
            ?.level,
  });
  // Historical result fixtures test restoration without re-running retired fusion odds.
  const recordFusion = (key) => {
    const materials = ["D", "B"].map((id) => ({
      card: id,
      name: cards.get(id).name,
      kind: cards.get(id).kind,
      rarity: id,
      level: 1,
      variant: "card",
    }));
    e.run("DELETE FROM inventory WHERE player='p' AND card IN ('D','B')");
    e.addCard("p", "C");
    const result = { materials, cards: [cards.get("C")] };
    e.run(
      "INSERT INTO receipts VALUES(?,?,?,?,?)",
      "p:fusion",
      key,
      JSON.stringify({ cards: materials }),
      JSON.stringify(result),
      e.now(),
    );
    return result;
  };
  const sell = (id, variant = "card", key) => {
    const m = material(id, variant);
    return act(
      "sell-instant",
      { ...m, expectedPrice: instantSalePrice(cards.get(id), m.expectedLevel) },
      key,
    );
  };
  return { e, act, add, material, recordFusion, sell, cards };
}

test("sale values use half the shop tier price times the exact enhancement investment", (t) => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(cardInvestment),
    [1, 2, 4, 7, 11, 16],
  );
  for (let i = 0; i < RARITIES.length; i++)
    for (const level of [1, 2, 4, 6])
      assert.equal(
        instantSalePrice({ rarity: RARITIES[i] }, level),
        25 * 2 ** i * cardInvestment(level),
      );
  assert.equal(instantSalePrice({ rarity: null }), 25);
  assert.throws(() => instantSalePrice({ rarity: "__proto__" }), /sale price/);
  assert.throws(() => cardInvestment(21), /level/);
});
test("instant sale preserves extra levels correctly, excludes earned rankings, and cannot pay twice", (t) => {
  const f = fixture(t),
    { e } = f;
  f.add("D", 3, 4);
  const m = f.material("D"),
    b = { ...m, expectedPrice: 175 };
  const r = f.act("sell-instant", b, "sale");
  assert.equal(r.price, 175);
  assert.deepEqual(f.act("sell-instant", b, "sale"), r);
  assert.equal(e.player("p").balance, 175);
  assert.equal(e.player("p").earned, 0);
  assert.deepEqual(
    {
      ...e.one(
        "SELECT copies,level FROM inventory WHERE player='p' AND card='D'",
      ),
    },
    { copies: 2, level: 1 },
  );
  assert.equal(f.sell("D", "extra").price, 25);
  assert.throws(() => f.sell("D", "extra"), /extra copy/);
  assert.equal(e.player("p").balance, 200);
});
test("selling a last copy cleans profile references and rejects stale quotes, foreign cards and wallet overflow atomically", (t) => {
  const f = fixture(t),
    { e } = f;
  f.add("D");
  e.action("p", "profile", { avatar: "D" });
  e.action("p", "showcase", { cards: ["D"] });
  const b = { ...f.material("D"), expectedPrice: 25 };
  f.cards.get("D").rarity = "C";
  assert.throws(() => f.act("sell-instant", b), /changed/);
  assert.equal(e.state("p").inventory.length, 1);
  f.cards.get("D").rarity = "D";
  e.run("UPDATE players SET balance=1000000000000 WHERE id='p'");
  assert.throws(() => f.act("sell-instant", b), /limit/);
  assert.equal(e.player("p").avatar_card, "D");
  e.run("UPDATE players SET balance=0 WHERE id='p'");
  f.act("sell-instant", b);
  assert.equal(e.player("p").avatar_card, null);
  assert.equal(e.profile("p").showcase.length, 0);
  assert.throws(() => e.tx(() => e.action("q", "sell-instant", b)), /own/);
});
test("high-level AG sale values fit the wallet without truncating the invested-card payout", (t) => {
  const f = fixture(t);
  f.add("AG", 1, 6);
  assert.equal(f.sell("AG").price, 102400);
  assert.equal(f.e.player("p").balance, 102400);
});

test("focused fusion restoration is atomic, preserves wallet and unrelated cards, and replays only once", (t) => {
  const f = fixture(t);
  f.add("D");
  f.add("B");
  f.add("AG");
  const result = f.recordFusion("source-fusion");
  const wallet = f.e.player("p").balance,
    preview = f.e.economy.fusion.reversalPreview("p", "source-fusion");
  assert.equal(preview.restored.length, 2);
  assert.equal(preview.removed.id, result.cards[0].id);
  const restore = () =>
    f.e.mutate(
      "host:fusion-revert",
      "source-fusion",
      { player: "p", sourceKey: "source-fusion" },
      () => f.e.economy.fusion.reverse("p", "source-fusion"),
    );
  const first = restore();
  assert.deepEqual(restore(), first);
  assert.equal(f.e.player("p").balance, wallet);
  assert(f.e.one("SELECT card FROM inventory WHERE player='p' AND card='AG'"));
  for (const id of ["D", "B"])
    assert.equal(
      f.e.one("SELECT copies FROM inventory WHERE player='p' AND card=?", id)
        .copies,
      1,
    );
  assert.equal(
    f.e.one(
      "SELECT card FROM inventory WHERE player='p' AND card=?",
      result.cards[0].id,
    ),
    undefined,
  );
  assert.throws(
    () => f.e.economy.fusion.reverse("p", "source-fusion"),
    /changed/,
  );
});
test("fusion restoration refuses moved or enhanced output without partial card restoration", (t) => {
  const f = fixture(t);
  f.add("D");
  f.add("B");
  const result = f.recordFusion("source");
  f.e.run(
    "UPDATE inventory SET level=2 WHERE player='p' AND card=?",
    result.cards[0].id,
  );
  const before = f.e.all("SELECT * FROM inventory");
  assert.throws(
    () => f.e.tx(() => f.e.economy.fusion.reverse("p", "source")),
    /changed/,
  );
  assert.deepEqual(f.e.all("SELECT * FROM inventory"), before);
});
