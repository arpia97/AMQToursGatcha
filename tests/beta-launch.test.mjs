import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
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
  const e = new Engine((s, ...a) => db.prepare(s).all(...a), tx);
  e.host("players", {
    players: [
      { id: "368", name: "arpia97" },
      { id: "q", name: "chommy" },
    ],
  });
  e.host("catalog", {
    cards: Array.from({ length: 12 }, (_, i) => ({
      id: "c" + i,
      kind: i < 6 ? "character" : "seiyuu",
      name: "Card " + i,
    })),
  });
  return { e, db, tx };
}
test("only canonical arpia97 may authorize host actions, even if another player is marked admin", (t) => {
  const { e } = fixture(t);
  e.run("UPDATE players SET is_admin=1");
  e.run(
    "INSERT INTO sessions VALUES('owner','368',9999999999999),('other','q',9999999999999)",
  );
  assert.equal(e.adminSession("owner"), true);
  assert.equal(e.adminSession("other"), false);
  assert.equal(e.player("q").is_admin, 0);
  assert.equal(e.player("368").is_admin, 1);
});
test("clean beta reset is idempotent and preserves accounts/catalogue while restoring5000 and refreshing stock", (t) => {
  const { e } = fixture(t);
  e.run(
    "UPDATE players SET password='kept',balance=123,earned=999,starter_granted=1,starter_amount=5000",
  );
  e.run("UPDATE players SET is_admin=1 WHERE id='368'");
  e.addCard("368", "c0");
  e.addCard("q", "c1");
  e.ensureAuctions();
  const old = e.state("368");
  const b = { confirmation: "START CLEAN BETA" };
  const reset = () =>
    e.mutate("host:host/beta-reset", "beta-launch-once", b, () =>
      e.host("beta-reset", b),
    );
  assert.equal(reset().players, 2);
  e.ensureAuctions();
  for (const id of ["368", "q"]) {
    assert.equal(e.player(id).balance, 5000);
    assert.equal(e.player(id).earned, 5000);
    assert.equal(e.state(id).inventory.length, 0);
    assert.equal(
      e.one("SELECT password FROM players WHERE id=?", id).password,
      "kept",
    );
  }
  assert.equal(e.catalogStore.summary().total, 12);
  assert.equal(e.state("368").shop.length, 10);
  assert.equal(e.state("368").auctions.length, 10);
  assert.ok(
    e.state("368").shop.every((s) => !old.shop.some((o) => o.id === s.id)),
  );
  e.wallet("q", -100, "After reset");
  reset();
  e.ensureAuctions();
  assert.equal(e.player("q").balance, 4900);
  assert.equal(e.player("368").is_admin, 1);
});
