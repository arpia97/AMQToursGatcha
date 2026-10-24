import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
function fixture() {
  const db = new DatabaseSync(":memory:");
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
    () => Date.UTC(2026, 9, 24),
    () => 0,
  );
  const host = (a, b) => e.tx(() => e.host(a, b)),
    act = (a, b) => e.tx(() => e.action("001", a, b));
  host("players", {
    players: [
      { id: "001", name: "Original", aliases: ["amqalias"] },
      { id: "002", name: "Other", aliases: ["reservedalias"] },
    ],
  });
  return { e, host, act };
}
test("username changes are searchable through all old names and AMQ aliases", () => {
  const f = fixture();
  f.act("profile", { username: "New Name" });
  f.act("profile", { username: "Newest" });
  for (const q of ["amqalias", "original", "new name", "newest", "001"])
    assert.equal(f.e.searchProfiles(q)[0].id, "001");
  assert.equal(f.e.player("001").name, "Newest");
  assert.deepEqual(f.e.profile("001").usernames, ["New Name", "Newest"]);
});
test("players cannot adopt another player’s alias or historical username", () => {
  const f = fixture();
  assert.throws(
    () => f.act("profile", { username: "RESERVEDALIAS" }),
    /reserved/,
  );
  f.act("profile", { username: "Historical" });
  f.act("profile", { username: "Current" });
  assert.throws(
    () =>
      f.e.tx(() => f.e.action("002", "profile", { username: "historical" })),
    /reserved/,
  );
  assert.throws(
    () => f.host("players", { players: [{ id: "002", name: "historical" }] }),
    /conflicts/,
  );
});
test("avatars must be owned; displayed avatar enhancement follows inventory level", () => {
  const f = fixture();
  assert.throws(() => f.act("profile", { avatar: "card-a" }), /inventory/);
  f.e.addCard("001", "card-a", 4);
  f.act("profile", { avatar: "card-a" });
  f.act("enhance", { card: "card-a" });
  f.act("enhance", { card: "card-a" });
  const p = f.e.profile("001");
  assert.equal(p.avatar_card, "card-a");
  assert.equal(p.inventory[0].level, 3);
  assert.equal(f.e.searchProfiles("001")[0].avatar_level, 3);
});
test("activity counts distinct tour IDs per category, independent of credit amount", () => {
  const f = fixture();
  for (const reason of ["participation", "reporting", "counting"])
    for (let i = 0; i < 2; i++)
      f.host("grant", {
        player: "001",
        reason,
        amount: 100,
        note: "Task " + i,
        event: "tour42",
      });
  f.host("grant", {
    player: "001",
    reason: "participation",
    amount: 5,
    note: "tour43",
    event: "tour43",
  });
  const stats = f.e.profile("001").stats;
  assert.equal(stats.participation, 2);
  assert.equal(stats.reporting, 1);
  assert.equal(stats.counting, 1);
  assert.deepEqual({ ...stats.pickems }, { total: 0, correct: 0 });
});
test("normal packs use uniform card odds for both characters and seiyuus", () => {
  const f = fixture();
  f.e.run("UPDATE settings SET value=80 WHERE key='main_weight'");
  for (const kind of ["character", "seiyuu"])
    f.host("catalog", {
      cards: Array.from({ length: 5 }, (_, i) => ({
        id: kind + i,
        kind,
        name: "Card " + i,
        role: i === 0 ? "main" : "supporting",
      })),
    });
  f.host("grant", {
    player: "001",
    reason: "other",
    amount: 10000,
    note: "test",
  });
  let total;
  f.e.rand = (n) => {
    total = n;
    return 79;
  };
  f.act("pack", { kind: "character" });
  assert.equal(total, 500);
  f.e.rand = (n) => {
    total = n;
    return 100;
  };
  const pulls = f.act("pack", { kind: "character" });
  assert.ok(pulls.cards.every((c) => c.id === "character1"));
  f.act("pack", { kind: "seiyuu" });
  assert.equal(total, 500);
});
test("reset-player requires exact confirmation and clears only that player’s gameplay", () => {
  const f = fixture();
  f.host("grant", {
    player: "001",
    reason: "participation",
    amount: 100,
    note: "42",
  });
  f.host("grant", {
    player: "002",
    reason: "counting",
    amount: 200,
    note: "42",
  });
  f.e.addCard("001", "card-a");
  f.act("profile", { username: "Identity", avatar: "card-a" });
  assert.throws(
    () => f.host("reset-player", { player: "001", confirmation: "wrong" }),
    /Type RESET PLAYER/,
  );
  assert.equal(f.e.player("001").balance, 100);
  f.host("reset-player", { player: "001", confirmation: "RESET PLAYER 001" });
  assert.equal(f.e.player("001").balance, 0);
  assert.equal(f.e.player("001").name, "Identity");
  assert.equal(f.e.profile("001").inventory.length, 0);
  assert.equal(f.e.profile("001").stats.participation, 0);
  assert.equal(f.e.player("002").balance, 200);
});
test("reset-all gameplay retains identity; full reset deletes registry while protecting catalog", () => {
  const f = fixture();
  f.host("catalog", { cards: [{ id: "c", kind: "character", name: "Card" }] });
  f.host("grant", {
    player: "001",
    reason: "other",
    amount: 100,
    note: "test",
  });
  assert.throws(
    () =>
      f.host("reset-all", {
        confirmation: "DELETE EVERYTHING",
        deleteRegistry: false,
      }),
    /confirmation/,
  );
  f.host("reset-all", {
    confirmation: "RESET ALL GAME DATA",
    deleteRegistry: false,
  });
  assert.equal(f.e.player("001").balance, 0);
  assert.equal(f.e.all("SELECT * FROM catalog").length, 1);
  f.host("reset-all", {
    confirmation: "DELETE EVERYTHING",
    deleteRegistry: true,
  });
  assert.equal(f.e.all("SELECT * FROM players").length, 0);
  assert.equal(f.e.all("SELECT * FROM catalog").length, 1);
  assert.equal(f.e.all("SELECT * FROM aliases").length, 0);
});
