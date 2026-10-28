import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { BurstLimits } from "../src/request-limits.js";
import { applyGameState } from "../public/game-state.js";
import { SqlBudget } from "../src/sql-budget.js";

test("normal sustained gameplay has no fifteen-minute cap; rapid bursts recover in one second and players are independent", () => {
  let now = 0;
  const limits = new BurstLimits(() => now);
  for (let i = 0; i < 3600; i++) {
    limits.take("p");
    now += 250;
  }
  const burst = new BurstLimits(() => now, 2);
  for (let i = 0; i < 30; i++) burst.take("p");
  assert.throws(
    () => burst.take("p"),
    (e) => e.status === 429 && e.retryAfter === 1,
  );
  burst.take("q");
  now += 1000;
  for (let i = 0; i < 6; i++) burst.take("p");
  assert.throws(
    () => burst.take("p"),
    (e) => e.status === 429,
  );
  burst.take("r");
  assert.equal(burst.buckets.size, 2);
  assert.equal(burst.buckets.has("q"), false);
});

test("compact game snapshots preserve wallet/history/privacy without loading catalogue, inventory or global rankings", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const queries = [];
  const e = new Engine(
    (s, ...a) => {
      queries.push(s);
      return db.prepare(s).all(...a);
    },
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
    () => 1000000,
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.host("grant", {
    player: "p",
    amount: 10000,
    reason: "other",
    note: "Test",
  });
  const act = (action, body, key = crypto.randomUUID()) =>
    e.mutate("p:" + action, key, body, () => e.action("p", action, body));
  let game = act("mahjong-start", { previousGame: null }).mahjong;
  const body = { game: game.id, version: game.version, index: 13 };
  const result = act("mahjong-discard", body, "discard");
  assert.equal(e.player("p").balance, 9450);
  act("mahjong-discard", body, "discard");
  assert.equal(e.player("p").balance, 9450);
  assert.throws(
    () => act("mahjong-discard", body),
    (e) => e.status === 409,
  );
  queries.length = 0;
  const snapshot = e.gameState("p");
  assert.equal(snapshot.me.balance, 9450);
  assert.equal(snapshot.me.earned, 10000);
  assert.deepEqual(snapshot.mahjong, result.mahjong);
  assert.equal("wall" in snapshot.mahjong, false);
  assert.equal(snapshot.ledger[0].delta, -50);
  // One bounded, indexed inbox lookup accompanies the six existing game reads.
  assert.ok(queries.length <= 7);
  assert.deepEqual(snapshot.notices, []);
  assert.equal(
    queries.some((q) =>
      /FROM (?:catalog|inventory|settings)|GROUP BY|RANK\(/i.test(q),
    ),
    false,
  );
  assert.equal(e.gameState("q").mahjong, null);
  assert.equal(e.gameState("q").ledger.length, 0);
  assert.throws(
    () => e.gameState("unknown"),
    (err) => err.status === 404,
  );
  // Game polling retains auction-win delivery and only resolves those card references.
  e.run(
    "INSERT INTO catalog(id,kind,name) VALUES('prize','character','Prize')",
  );
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends,winner) VALUES('prize','character',0,1,'p')",
  );
  const win = e.gameState("p");
  assert.equal(win.auctionWins.length, 1);
  assert.equal(win.cards[0].id, "prize");
  assert.equal(e.gameState("q").auctionWins.length, 0);
});

test("game patch keeps shared collection data, ignores stale snapshots and rejects another signed-in identity", () => {
  const state = {
    now: 10,
    me: { id: "p", balance: 100 },
    inventory: [{ card: "a" }],
    catalog: [{ id: "a" }],
    mahjong: { id: 2, version: 3 },
    gem: null,
  };
  const update = {
    now: 20,
    me: { id: "p", balance: 50 },
    mahjong: { id: 2, version: 4 },
    gem: null,
    ledger: [],
    auctionWins: [],
  };
  const next = applyGameState(state, update);
  assert.equal(next.me.balance, 50);
  assert.equal(next.inventory, state.inventory);
  assert.equal(next.catalog, state.catalog);
  assert.equal(next.now, 10); // Shared deadline polling still uses the full snapshot's timestamp.
  assert.equal(applyGameState(next, { ...update, now: 19 }), next);
  assert.equal(
    applyGameState(next, {
      ...update,
      now: 21,
      mahjong: { id: 2, version: 3 },
    }),
    next,
  );
  assert.equal(applyGameState(next, { ...update, me: { id: "q" } }), null);
});

test("SQL budget batches read-only checkpoints, persists threshold crossings and bounds crash loss", () => {
  let now = 0,
    saved = null,
    writes = 0;
  const b = new SqlBudget(
    () => saved,
    (v) => {
      saved = structuredClone(v);
      writes++;
    },
    () => now,
  );
  for (let i = 0; i < 20; i++) {
    b.observe(10, 0);
    b.flush();
  }
  assert.equal(writes, 0);
  now = 60000;
  b.flush();
  assert.equal(writes, 1);
  assert.equal(saved.rowsRead, 200);
  b.flush();
  assert.equal(writes, 1);
  b.observe(1000, 0);
  b.flush();
  assert.equal(writes, 2);
  b.observe(0, 100);
  b.flush();
  assert.equal(writes, 3);
  b.observe(1998800, 0);
  b.flush();
  assert.equal(b.paused(), true);
  const n = writes;
  b.observe(1, 0);
  b.flush();
  assert.equal(writes, n);
  b.flush(true);
  assert.equal(writes, n + 1);
  const restored = new SqlBudget(
    () => saved,
    () => {},
    () => now,
  );
  assert.equal(restored.paused(), true);
  now = 86400001;
  b.flush();
  assert.equal(saved.rowsRead, 0);
  assert.equal(b.paused(), false);
});
