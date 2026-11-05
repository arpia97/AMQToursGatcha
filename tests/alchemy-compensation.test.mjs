import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
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
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  return e;
}
import { alchemyCompensation } from "../src/alchemy-compensation.js";
import {
  autoRefinementPlan,
  refinementQueue,
  refinementQuote,
} from "../public/alchemy-rules.js";
test("1.5x Alchemy history compensation includes actual lucky/batch XP already spent, skips new XP, and pays once", (t) => {
  const e = fixture(t);
  const put = (id, result, at) =>
    e.run(
      "INSERT INTO receipts VALUES(?,?,?,?,?)",
      "p:alchemy-feed",
      id,
      "{}",
      JSON.stringify(result),
      at,
    );
  put("old", { xpGained: 10 }, 1);
  put(
    "batch",
    { refinements: [{ xpGained: 40 }, { xpGained: 100 }], xpGained: 140 },
    2,
  );
  put("new", { xpGained: 15, xpRevision: 2 }, 3);
  e.economy.alchemy.save("p", { xp: 5, refinements: 4, version: 8 });
  const before = e.player("p");
  let preview = alchemyCompensation(e);
  assert.equal(preview.totalBonus, 75);
  assert.equal(preview.rows[0].originalXP, 150);
  assert.equal(e.economy.alchemy.read("p").xp, 5);
  const applied = e.tx(() => alchemyCompensation(e, true));
  assert.equal(applied.totalBonus, 75);
  assert.equal(e.economy.alchemy.read("p").xp, 80);
  assert.equal(e.economy.alchemy.read("p").version, 9);
  assert.deepEqual(e.player("p"), before);
  assert.equal(e.tx(() => alchemyCompensation(e, true)).alreadyApplied, true);
  assert.equal(e.economy.alchemy.read("p").xp, 80);
});
test("history compensation rejects incomplete evidence atomically and does not compensate a previous reset lifecycle", (t) => {
  const e = fixture(t);
  e.run(
    "INSERT INTO receipts VALUES(?,?,?,?,?)",
    "p:alchemy-feed",
    "old",
    "{}",
    JSON.stringify({ xpGained: 100 }),
    1,
  );
  e.run(
    "INSERT INTO receipts VALUES(?,?,?,?,?)",
    "p:alchemy-feed",
    "new",
    "{}",
    JSON.stringify({ xpGained: 15, xpRevision: 2 }),
    2,
  );
  e.economy.alchemy.save("p", { xp: 10, refinements: 3, version: 0 });
  assert.throws(() => e.tx(() => alchemyCompensation(e, true)), {
    status: 409,
  });
  assert.equal(e.economy.alchemy.read("p").xp, 10);
  e.economy.alchemy.save("p", { xp: 10, refinements: 1, version: 0 });
  assert.equal(alchemyCompensation(e).totalBonus, 0);
});
test("Auto Refine uses low normal/high lucky rarities, max rarity and invested XP, never protected cards", () => {
  const cards = {
    d: { id: "d", rarity: "D" },
    s: { id: "s", rarity: "S" },
    a: { id: "a", rarity: "AG" },
    p: { id: "p", rarity: "AG" },
  };
  const inventory = [
    { card: "d", level: 1, copies: 20 },
    { card: "s", level: 6, copies: 2 },
    { card: "a", level: 1, copies: 1 },
    { card: "p", level: 6, copies: 3, protected: 1 },
  ];
  const by = (id) => cards[id];
  const plan = autoRefinementPlan(inventory, by, 12, "AG", 0),
    q = refinementQueue(plan, inventory, by);
  assert.equal(q[5].id, "a");
  assert.equal(q[11].id, "s");
  assert.equal(q[11].level, 6);
  assert.ok(
    q.filter((c, i) => ![5, 11].includes(i)).every((c) => c.id === "d"),
  );
  assert.ok(plan.every((c) => c.card !== "p"));
  assert.ok(
    autoRefinementPlan(inventory, by, 10, "B").every((c) => c.card === "d"),
  );
  assert.throws(
    () => autoRefinementPlan(inventory, by, 100, "AG"),
    /Not enough/,
  );
  assert.equal(refinementQuote("D").baseXP, 15);
  assert.equal(refinementQuote("AG").baseXP, 3840);
});
