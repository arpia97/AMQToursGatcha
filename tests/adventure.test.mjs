import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import { createAdventureUI } from "../public/adventure-ui.js";
import {
  ROULETTE_DURATION,
  ROULETTE_POCKETS,
  ROULETTE_RETURNS,
  CLIMB_OPTIONS,
  climbOffers,
  climbPayout,
} from "../public/pachinko-rules.js";

test("a reconnected spinning wheel displays its locked server bet, not a fresh form draft", () => {
  const s = {
    me: { balance: 1000 },
    roulette: {
      id: 1,
      status: "spinning",
      choice: "black",
      stake: 75,
      pocket: 2,
      startedAt: 100,
      endsAt: 4700,
    },
  };
  const view = createAdventureUI({
    getState: () => s,
    escape: String,
    number: String,
    ui: { rouletteDraft: { choice: "red", stake: 100 } },
    now: () => 1100,
  });
  const html = view.roulette();
  assert.match(html, /value="black" checked/);
  assert.doesNotMatch(html, /value="red" checked/);
  assert.match(html, /value="75" required disabled/);
  assert.match(html, /roulette-choices" disabled/);
  assert.match(html, /--roulette-elapsed:-1000ms/);
  s.roulette = null;
  assert.match(view.roulette(), /value="red" checked/);
  assert.match(view.roulette(), /value="100" required /);
});
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let time = 1000000;
  const sql = (q, ...a) => db.prepare(q).all(...a),
    tx = (fn) => {
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
  const fresh = () =>
      new Engine(
        sql,
        tx,
        () => time,
        () => 0,
      ),
    e = fresh();
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.wallet("p", 100000, "Fixture", true);
  e.wallet("q", 100000, "Fixture", true);
  return {
    e,
    db,
    fresh,
    advance: (ms) => (time += ms),
    act: (a, b, key = crypto.randomUUID(), player = "p") =>
      e.mutate(player + ":" + a, key, b, () => e.action(player, a, b)),
  };
}
test("roulette has 18 red,18 black,one green; climb pool contains exactly the requested inclusive ranges and offers without replacement", () => {
  assert.equal(ROULETTE_POCKETS.filter((c) => c === "red").length, 18);
  assert.equal(ROULETTE_POCKETS.filter((c) => c === "black").length, 18);
  assert.equal(ROULETTE_POCKETS.filter((c) => c === "green").length, 1);
  assert.deepEqual(ROULETTE_RETURNS, { red: 2, black: 2, green: 35 });
  assert.deepEqual(
    CLIMB_OPTIONS.map((o) => [o.min, o.max]),
    [
      [1, 1],
      [2, 2],
      [3, 3],
      [5, 5],
      [1, 6],
      [-1, 1],
      [-1, 2],
      [-1, 3],
      [-2, 3],
      [-2, 4],
      [-2, 5],
      [-3, 3],
      [-3, 4],
      [-3, 5],
      [-5, 10],
      [-5, 5],
      [-10, 10],
      [-7, 7],
    ],
  );
  assert.deepEqual(
    climbOffers(() => 0),
    [0, 1, 2],
  );
  assert.deepEqual(
    climbOffers((n) => n - 1),
    [17, 16, 15],
  );
  assert.equal(climbPayout(30), 540);
});
test("roulette debits once, locks the selection, waits for server time, persists restart and settles exactly once", (t) => {
  const f = fixture(t),
    { e, act } = f,
    b = { previousGame: null, choice: "green", stake: 3 };
  act("roulette-start", b, "spin");
  const g = e.gameState("p").roulette;
  assert.equal(g.pocket, 0);
  assert.equal(g.status, "spinning");
  assert.equal(g.payout, 0);
  assert.equal(e.player("p").balance, 99997);
  act("roulette-start", b, "spin");
  assert.equal(e.player("p").balance, 99997);
  assert.throws(
    () => act("roulette-start", { ...b, previousGame: g.id }),
    /Finish/,
  );
  assert.deepEqual(f.fresh().gameState("p").roulette, g);
  f.advance(ROULETTE_DURATION - 1);
  e.tx(() => e.economy.pachinko.settleDue("p"));
  assert.equal(e.player("p").balance, 99997);
  f.advance(1);
  e.tx(() => e.economy.pachinko.settleDue("p"));
  e.tx(() => e.economy.pachinko.settleDue("p"));
  assert.equal(e.player("p").balance, 100102);
  assert.equal(e.player("p").earned, 100000);
  assert.equal(e.gameState("p").roulette.payout, 105);
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 102);
  assert.equal(e.gameState("q").roulette, null);
  assert.throws(
    () => act("roulette-start", { ...b, previousGame: null }),
    /changed/,
  );
});
test("every roulette pocket maps to its displayed colour and exact gross return, including red/black losses", (t) => {
  const f = fixture(t),
    { e, act } = f;
  let previousGame = null;
  for (let pocket = 0; pocket < 37; pocket++)
    for (const choice of ["red", "black", "green"]) {
      e.rand = () => pocket;
      const before = e.player("p").balance;
      act("roulette-start", { previousGame, choice, stake: 2 });
      previousGame = e.gameState("p").roulette.id;
      f.advance(ROULETTE_DURATION);
      e.tx(() => e.economy.pachinko.settleDue("p"));
      const g = e.gameState("p").roulette,
        expected =
          ROULETTE_POCKETS[pocket] === choice
            ? 2 * ROULETTE_RETURNS[choice]
            : 0;
      assert.equal(g.colour, ROULETTE_POCKETS[pocket]);
      assert.equal(g.payout, expected);
      assert.equal(e.player("p").balance, before - 2 + expected);
    }
});
test("invalid roulette inputs and insufficient balances roll back without creating a game or ledger charge", (t) => {
  const { e, act } = fixture(t),
    before = e.player("p").balance;
  for (const bad of [
    { choice: "blue", stake: 100 },
    { choice: "__proto__", stake: 100 },
    { choice: "red", stake: 0 },
    { choice: "red", stake: 1.5 },
    { choice: "red", stake: 1000001 },
  ])
    assert.throws(() => act("roulette-start", { previousGame: null, ...bad }));
  assert.equal(e.player("p").balance, before);
  assert.equal(e.all("SELECT * FROM gambling_rounds").length, 0);
  assert.equal(e.gameState("p").roulette, null);
  e.run("UPDATE players SET balance=1 WHERE id='p'");
  assert.throws(
    () =>
      act("roulette-start", { previousGame: null, choice: "red", stake: 2 }),
    /Not enough/,
  );
  assert.equal(e.gameState("p").roulette, null);
});
test("climbing charges one entry, offers fixed saved choices, validates ownership/version/offers and makes ten free choices", (t) => {
  const f = fixture(t),
    { e, act } = f;
  e.run("UPDATE players SET balance=500 WHERE id='p'");
  act("climb-start", { previousGame: null }, "start");
  let g = e.gameState("p").climb;
  assert.equal(e.player("p").balance, 0);
  assert.deepEqual(g.offers, [0, 1, 2]);
  act("climb-start", { previousGame: null }, "start");
  assert.equal(e.player("p").balance, 0);
  assert.deepEqual(f.fresh().gameState("p").climb, g);
  assert.deepEqual(e.gameState("p").climb, g);
  assert.throws(() => act("climb-start", { previousGame: g.id }), /Finish/);
  assert.throws(
    () => act("climb-choose", { game: g.id, version: 0, option: 3 }),
    /available/,
  );
  assert.throws(
    () =>
      act(
        "climb-choose",
        { game: g.id, version: 0, option: 2 },
        undefined,
        "q",
      ),
    /Start a climb/,
  );
  const first = { game: g.id, version: g.version, option: 2 };
  act("climb-choose", first, "first");
  act("climb-choose", first, "first");
  g = e.gameState("p").climb;
  assert.equal(g.height, 3);
  assert.equal(g.moves.length, 1);
  assert.throws(() => act("climb-choose", first), /changed/);
  while (g.status === "active") {
    act("climb-choose", { game: g.id, version: g.version, option: 2 });
    g = e.gameState("p").climb;
  }
  assert.equal(g.moves.length, 10);
  assert.equal(g.height, 30);
  assert.equal(g.payout, 540);
  assert.equal(e.player("p").balance, 540);
  assert.deepEqual(g.offers, []);
  assert.throws(
    () => act("climb-choose", { game: g.id, version: g.version, option: 2 }),
    /Start a climb/,
  );
  assert.equal(e.player("p").balance, 540);
  assert.equal(e.player("p").earned, 100000);
});
test("random climbing rolls include both endpoints, stop at ground and can reach height100 for1800 credits", (t) => {
  const { e, act } = fixture(t);
  e.rand = (n) => n - 1;
  act("climb-start", { previousGame: null });
  let g = e.gameState("p").climb;
  e.rand = () => 0;
  act("climb-choose", { game: g.id, version: 0, option: 16 });
  g = e.gameState("p").climb;
  assert.equal(g.last.delta, -10);
  assert.equal(g.height, 0);
  while (g.status === "active") {
    act("climb-choose", { game: g.id, version: g.version, option: 0 });
    g = e.gameState("p").climb;
  }
  e.rand = (n) => n - 1;
  act("climb-start", { previousGame: g.id });
  g = e.gameState("p").climb;
  while (g.status === "active") {
    assert(g.offers.includes(16));
    act("climb-choose", { game: g.id, version: g.version, option: 16 });
    g = e.gameState("p").climb;
  }
  assert.equal(g.height, 100);
  assert.equal(g.payout, 1800);
  assert.equal(g.moves[0].delta, 10);
});
test("final climbing moves replay without duplicate payout and affordability failures preserve current metadata", (t) => {
  const { e, act } = fixture(t);
  e.run("UPDATE players SET balance=499 WHERE id='p'");
  assert.throws(() => act("climb-start", { previousGame: null }), /Not enough/);
  assert.equal(e.gameState("p").climb, null);
  e.wallet("p", 1000, "Fixture");
  act("climb-start", { previousGame: null });
  let g = e.gameState("p").climb;
  for (let i = 0; i < 9; i++) {
    act("climb-choose", { game: g.id, version: g.version, option: 0 });
    g = e.gameState("p").climb;
  }
  const body = { game: g.id, version: g.version, option: 0 };
  act("climb-choose", body, "last");
  const balance = e.player("p").balance;
  act("climb-choose", body, "last");
  assert.equal(e.player("p").balance, balance);
  assert.equal(e.gameState("p").climb.payout, 180);
});
test("both game states follow identity migration and individual/full resets without affecting another player", (t) => {
  const { e, act } = fixture(t);
  act("climb-start", { previousGame: null });
  act("roulette-start", { previousGame: null, choice: "red", stake: 100 });
  act("climb-start", { previousGame: null }, undefined, "q");
  new AliasSync(e).renamePlayer("p", "renamed");
  assert(e.gameState("renamed").roulette);
  assert(e.gameState("renamed").climb);
  e.tx(() =>
    e.host("reset-player", {
      player: "renamed",
      confirmation: "RESET PLAYER renamed",
    }),
  );
  assert.equal(e.gameState("renamed").roulette, null);
  assert.equal(e.gameState("renamed").climb, null);
  assert(e.gameState("q").climb);
  e.tx(() =>
    e.host("reset-all", {
      deleteRegistry: false,
      confirmation: "RESET ALL GAME DATA",
    }),
  );
  assert.equal(e.gameState("q").climb, null);
});
test("detailed roulette history retains50 games while all financial records remain for rankings", (t) => {
  const f = fixture(t),
    { e, act } = f;
  let previousGame = null;
  for (let i = 0; i < 55; i++) {
    act("roulette-start", { previousGame, choice: "green", stake: 1 });
    previousGame = e.gameState("p").roulette.id;
    f.advance(ROULETTE_DURATION);
    e.tx(() => e.economy.pachinko.settleDue("p"));
  }
  assert.equal(
    e.one("SELECT count(*) AS n FROM gambling_rounds WHERE game='roulette'").n,
    55,
  );
  assert.equal(
    e.one(
      "SELECT count(*) AS n FROM gambling_rounds WHERE game='roulette' AND outcome!='{}'",
    ).n,
    50,
  );
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 55 * 34);
});
