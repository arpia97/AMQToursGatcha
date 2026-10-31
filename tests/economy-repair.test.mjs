import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  inspectEconomyRepair,
  applyEconomyRepair,
} from "../src/economy-repair.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  const e = new Engine(
    (sql, ...args) => db.prepare(sql).all(...args),
    (fn) => {
      db.exec("BEGIN");
      try {
        const value = fn();
        db.exec("COMMIT");
        return value;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    () => 1793450000000,
  );
  e.host("players", {
    players: [
      { id: "1", name: "One" },
      { id: "2", name: "Two" },
    ],
  });
  e.wallet("1", 1000, "Original grant", true);
  e.wallet("2", 2000, "Unrelated later reward", true);
  e.run("UPDATE players SET password='test-only-credential' WHERE id='1'");
  e.run(
    "INSERT INTO inventory(player,card,copies,level,acquired_at,protected) VALUES('1','kept-card',2,1,1,1)",
  );
  const plan = {
    repairId: "test-repair",
    confirmation: "ROLL BACK HAKOHOKA AWARDS 2026-10-30",
    start: 1793345617731,
    end: 1793361600000,
    originalReplayVerified: true,
    guards: [{ player: "1", ledgerMax: 1, receiptCount: 0 }],
    sourceLedgerIds: [1],
    changes: [
      {
        table: "players",
        key: { id: "1" },
        before: { balance: 1000, earned: 1000 },
        after: { balance: 100, earned: 100 },
      },
      {
        table: "inventory",
        key: { player: "1", card: "kept-card" },
        before: e.one("SELECT * FROM inventory"),
        after: null,
      },
    ],
  };
  return {
    db,
    e,
    plan,
    apply: () =>
      e.mutate("host:economy-repair", plan.repairId, plan, () =>
        applyEconomyRepair(e, plan, "test-digest", "test-bookmark"),
      ),
  };
}
test("reviewed repair commits once, keeps original ledger and credentials, and leaves other players untouched", () => {
  const { e, plan, apply } = fixture();
  assert.equal(inspectEconomyRepair(e, plan).rows, 2);
  const first = apply();
  assert.deepEqual(apply(), first);
  assert.equal(e.player("1").balance, 100);
  assert.equal(e.player("1").earned, 100);
  assert.equal(
    e.one("SELECT password FROM players WHERE id='1'").password,
    "test-only-credential",
  );
  assert.equal(e.player("2").balance, 2000);
  assert.equal(e.player("2").earned, 2000);
  assert.equal(e.all("SELECT * FROM ledger").length, 3);
  assert.equal(
    e.one("SELECT sum(delta) n FROM ledger WHERE player='1'").n,
    100,
  );
  assert.equal(e.all("SELECT * FROM inventory").length, 0);
  assert.equal(e.all("SELECT * FROM economy_repairs").length, 1);
  assert.equal(e.one("SELECT count(*) n FROM receipts").n, 1);
  assert.equal(first.bookmark, "test-bookmark");
});
test("repair rolls back every earlier write if a later row fails", () => {
  const { db, e, apply } = fixture();
  db.exec(
    "CREATE TRIGGER reject_removal BEFORE DELETE ON inventory BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  );
  assert.throws(apply, /injected failure/);
  assert.equal(e.player("1").balance, 1000);
  assert.equal(e.player("1").earned, 1000);
  assert.equal(e.all("SELECT * FROM ledger").length, 2);
  assert.equal(e.all("SELECT * FROM receipts").length, 0);
  assert.equal(e.one("SELECT copies FROM inventory").copies, 2);
});
test("repair rejects stale wallets, new receipts, unsafe columns and out-of-scope rows", () => {
  for (const edit of [
    (f) => f.e.wallet("1", 1, "New activity"),
    (f) =>
      f.e.run(
        "INSERT INTO receipts VALUES('1:protect-card','new','{}','{}',1793450000000)",
      ),
    (f) => (f.plan.changes[0].after.password = "forbidden"),
    (f) => (f.plan.changes[0].table = "catalog"),
    (f) => {
      f.plan.changes[0].key = { id: "2" };
      f.plan.changes[0].before = { balance: 2000, earned: 2000 };
    },
    (f) => (f.plan.guards[0].player = "30"),
    (f) => (f.plan.changes[0].after.balance = -1),
    (f) => f.plan.changes.push(structuredClone(f.plan.changes[0])),
  ]) {
    const f = fixture();
    edit(f);
    assert.throws(f.apply);
    assert.equal(f.e.player("2").balance, 2000);
    assert.equal(
      f.e.all("SELECT * FROM receipts WHERE scope='host:economy-repair'")
        .length,
      0,
    );
  }
});
test("reversed games of every type are excluded from gambling rankings", () => {
  const { e } = fixture();
  for (const game of [
    "mahjong-reverted",
    "roulette-reverted",
    "horse-racing-reverted",
    "faceting-reverted",
  ])
    e.run(
      "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES('1',?,10,100,90,'{}',1)",
      game,
    );
  e.run(
    "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES('2','roulette',10,20,10,'{}',2)",
  );
  const rankings = e.economy.rankings("gambling_won");
  assert.equal(rankings.rows.length, 1);
  assert.equal(rankings.rows[0].id, "2");
});
