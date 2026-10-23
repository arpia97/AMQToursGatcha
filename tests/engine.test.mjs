import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine, WEEK } from "../src/engine.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  let now = Date.UTC(2026, 9, 24, 12);
  const engine = new Engine(
    (s, ...args) => db.prepare(s).all(...args),
    (fn) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    () => now,
    () => 0,
  );
  engine.tx(() => {
    engine.host("players", {
      players: [
        { id: "1", name: "Alice", aliases: ["A"] },
        { id: "2", name: "Bob", aliases: ["B"] },
      ],
    });
    engine.host("catalog", {
      cards: ["character", "seiyuu"].flatMap((kind) =>
        Array.from({ length: 6 }, (_, i) => ({
          id: kind + i,
          kind,
          name: kind + i,
        })),
      ),
    });
  });
  const grant = (id, n) =>
    engine.tx(() =>
      engine.host("grant", {
        player: id,
        amount: n,
        reason: "participation",
        note: "Tour 42",
      }),
    );
  const act = (id, action, b = {}) =>
    engine.tx(() => engine.action(id, action, b));
  return { e: engine, db, grant, act, time: (n) => (now = n), now: () => now };
}
test("daily bonus is once per player per KST day, including boundary", () => {
  const f = fixture();
  f.time(Date.UTC(2026, 9, 24, 14, 59));
  f.act("1", "daily");
  assert.equal(f.e.player("1").balance, 100);
  assert.throws(() => f.act("1", "daily"), /already claimed/);
  f.time(Date.UTC(2026, 9, 24, 15, 0));
  f.act("1", "daily");
  assert.equal(f.e.player("1").earned, 200);
});
test("grants are validated, audit logged and idempotent across retries", () => {
  const f = fixture(),
    b = { player: "1", amount: 500, reason: "reporting", note: "Tour 42" };
  for (let i = 0; i < 2; i++)
    f.e.mutate("host:grant", "tour-42-alice", b, () => f.e.host("grant", b));
  assert.equal(f.e.player("1").balance, 500);
  assert.equal(f.e.one("SELECT count(*) n FROM ledger").n, 1);
  assert.throws(
    () =>
      f.e.mutate(
        "host:grant",
        "tour-42-alice",
        { ...b, amount: 600 },
        () => {},
      ),
    /different action/,
  );
  for (const amount of [-10, 1.2, Infinity, "100"])
    assert.throws(() => f.grant("1", amount));
});
test("packs cost server-side price, draw five cards and retain duplicates", () => {
  const f = fixture();
  f.grant("1", 1000);
  const r = f.act("1", "pack", { kind: "character", price: 0 });
  assert.equal(r.cards.length, 5);
  assert.equal(f.e.player("1").balance, 500);
  assert.equal(f.e.player("1").earned, 1000);
  assert.equal(f.e.one("SELECT copies FROM inventory").copies, 5);
  assert.equal(
    f.e.one("SELECT kind FROM catalog WHERE id=?", r.cards[0].id).kind,
    "character",
  );
});
test("insufficient balance rolls back purchases and invalid pack types are rejected", () => {
  const f = fixture();
  assert.throws(() => f.act("1", "pack", { kind: "character" }), /Not enough/);
  assert.equal(f.e.all("SELECT * FROM inventory").length, 0);
  assert.throws(() => f.act("1", "pack", { kind: "unknown" }), /pack type/);
});
test("enhancement consumes 1, 2, 4 extra copies and preserves a base card", () => {
  const f = fixture();
  f.e.addCard("1", "character0", 8);
  for (const expected of [
    [2, 7],
    [3, 5],
    [4, 1],
  ]) {
    f.act("1", "enhance", { card: "character0" });
    const i = f.e.one("SELECT * FROM inventory");
    assert.deepEqual([i.level, i.copies], expected);
  }
  assert.throws(() => f.act("1", "enhance", { card: "character0" }), /8 extra/);
});
test("weekly auctions contain exactly five distinct random cards per type", () => {
  const f = fixture();
  f.e.ensureAuctions();
  f.e.ensureAuctions();
  const a = f.e.all("SELECT * FROM auctions");
  assert.equal(a.length, 10);
  for (const kind of ["character", "seiyuu"]) {
    const group = a.filter((x) => x.kind === kind);
    assert.equal(new Set(group.map((x) => x.card)).size, 5);
    assert.equal(group[0].ends - group[0].starts, WEEK);
  }
  f.time(a[0].ends);
  f.e.ensureAuctions();
  assert.equal(f.e.all("SELECT * FROM auctions WHERE closed=0").length, 10);
  assert.equal(f.e.all("SELECT * FROM auctions WHERE closed=1").length, 10);
});
test("bids escrow funds; raises charge delta; outbid refunds never count as earnings", () => {
  const f = fixture();
  f.e.ensureAuctions();
  f.grant("1", 1000);
  f.grant("2", 1000);
  f.act("1", "bid", { auction: 1, amount: 200 });
  f.act("1", "bid", { auction: 1, amount: 300 });
  assert.equal(f.e.player("1").balance, 700);
  f.act("2", "bid", { auction: 1, amount: 400 });
  assert.equal(f.e.player("1").balance, 1000);
  assert.equal(f.e.player("1").earned, 1000);
  assert.equal(f.e.player("2").balance, 600);
  assert.equal(f.e.player("1").balance + f.e.player("2").balance + 400, 2000);
  assert.throws(
    () => f.act("1", "bid", { auction: 2, amount: 1100 }),
    /Not enough/,
  );
  assert.equal(f.e.one("SELECT bid FROM auctions WHERE id=2").bid, 0);
});
test("auction winner can claim only once, only after deadline; late bids fail", () => {
  const f = fixture();
  f.e.ensureAuctions();
  f.grant("1", 500);
  f.act("1", "bid", { auction: 1, amount: 100 });
  assert.throws(() => f.act("1", "claim", { auction: 1 }), /cannot be claimed/);
  const end = f.e.one("SELECT ends FROM auctions WHERE id=1").ends;
  f.time(end);
  assert.throws(() => f.act("2", "bid", { auction: 1, amount: 200 }), /ended/);
  assert.throws(() => f.act("2", "claim", { auction: 1 }), /cannot be claimed/);
  f.act("1", "claim", { auction: 1 });
  assert.equal(f.e.one("SELECT copies FROM inventory").copies, 1);
  assert.throws(() => f.act("1", "claim", { auction: 1 }), /cannot be claimed/);
  assert.equal(f.e.player("1").balance, 400);
});
test("pickems allow edits before lock and pay winner plus each exact team score once", () => {
  const f = fixture(),
    end = f.now() + 60001;
  f.e.tx(() =>
    f.e.host("pickem", {
      title: "Finals",
      tour: "Usual",
      teamA: "A",
      teamB: "B",
      ends: end,
      winnerReward: 300,
      scoreReward: 100,
    }),
  );
  f.act("1", "predict", { pickem: 1, winner: "a", scoreA: 3, scoreB: 1 });
  f.act("1", "predict", { pickem: 1, winner: "a", scoreA: 3, scoreB: 2 });
  f.act("2", "predict", { pickem: 1, winner: "b", scoreA: 3, scoreB: 4 });
  assert.throws(
    () => f.e.tx(() => f.e.host("settle", { pickem: 1, scoreA: 3, scoreB: 2 })),
    /Wait until/,
  );
  f.time(end);
  assert.throws(
    () =>
      f.act("1", "predict", { pickem: 1, winner: "a", scoreA: 3, scoreB: 1 }),
    /closed/,
  );
  f.e.tx(() => f.e.host("settle", { pickem: 1, scoreA: 3, scoreB: 2 }));
  assert.equal(f.e.player("1").earned, 500);
  assert.equal(f.e.player("2").earned, 100);
  assert.throws(
    () => f.e.tx(() => f.e.host("settle", { pickem: 1, scoreA: 3, scoreB: 2 })),
    /already settled/,
  );
});
test("score guesses must agree with a winner and forbid negative or tied scores", () => {
  const f = fixture();
  f.e.tx(() =>
    f.e.host("pickem", {
      title: "Match",
      tour: "Tour",
      teamA: "A",
      teamB: "B",
      ends: f.now() + 60001,
      winnerReward: 0,
      scoreReward: 0,
    }),
  );
  for (const [winner, scoreA, scoreB] of [
    ["a", 1, 2],
    ["b", 3, 2],
    ["a", 2, 2],
    ["a", -1, 2],
  ])
    assert.throws(() =>
      f.act("1", "predict", { pickem: 1, winner, scoreA, scoreB }),
    );
});
test("alias conflicts roll back whole imports; IDs are strings including leading zeros", () => {
  const f = fixture();
  assert.throws(
    () =>
      f.e.tx(() =>
        f.e.host("players", {
          players: [
            { id: "003", name: "New Player", aliases: ["brand-new"] },
            { id: "004", name: "Other", aliases: ["a"] },
          ],
        }),
      ),
    /another player/,
  );
  assert.equal(f.e.one("SELECT id FROM players WHERE id=?", "003"), undefined);
  f.e.tx(() =>
    f.e.host("players", {
      players: [{ id: "003", name: "New Player", aliases: ["new"] }],
    }),
  );
  assert.equal(f.e.player("003").id, "003");
  assert.equal(
    f.e.one("SELECT player FROM aliases WHERE alias=?", "new").player,
    "003",
  );
});
test("failed multi-write mutations are rolled back and do not leave receipts", () => {
  const f = fixture();
  assert.throws(
    () =>
      f.e.mutate("test", "one", {}, () => {
        f.e.wallet("1", 100, "temporary", true);
        throw new Error("abort");
      }),
    /abort/,
  );
  assert.equal(f.e.player("1").balance, 0);
  assert.equal(f.e.all("SELECT * FROM ledger").length, 0);
  assert.equal(f.e.all("SELECT * FROM receipts").length, 0);
});
test("ranks use lifetime earned, independent of spending and refunds", () => {
  const f = fixture();
  f.grant("1", 1000);
  f.grant("2", 600);
  f.act("1", "pack", { kind: "character" });
  const state = f.e.state("1");
  assert.equal(state.ranks[0].id, "1");
  assert.equal(state.me.balance, 500);
  assert.equal(state.me.earned, 1000);
});
