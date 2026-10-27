import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { gemValue, nextFacetChance } from "../public/gem-rules.js";
import { AliasSync } from "../src/aliases.js";
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
    () => Date.UTC(2026, 9, 25),
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
  return {
    e,
    db,
    act: (a, b, key = crypto.randomUUID(), player = "p") =>
      e.mutate(player + ":" + a, key, b, () => e.action(player, a, b)),
  };
}
test("faceting chance moves by10 after either row result and clamps25–75; payouts follow squared successes", () => {
  assert.equal(nextFacetChance(75, true), 65);
  assert.equal(nextFacetChance(25, true), 25);
  assert.equal(nextFacetChance(25, false), 35);
  assert.equal(nextFacetChance(75, false), 75);
  assert.equal(gemValue(7, 3), 1800);
  assert.equal(gemValue(6, 4), 900);
  assert.equal(gemValue(10, 0), 4500);
  assert.equal(gemValue(2, 7), 0);
});
test("faceting persists twenty paid cuts, includes misses/bad successes, pays once and blocks stale/foreign/full-row actions", (t) => {
  const { e, act } = fixture(t);
  let g = act("gem-start", { previousGame: null }, "start").gem;
  assert.equal(e.player("p").balance, 10000);
  assert.equal(e.economy.rankings("gambling_won").rows.length, 0);
  assert.deepEqual(act("gem-start", { previousGame: null }, "start").gem, g);
  assert.throws(() => act("gem-start", { previousGame: g.id }), /Finish/);
  assert.throws(
    () =>
      act("gem-facet", { game: g.id, version: 0, row: "good" }, undefined, "q"),
    /Start a gem/,
  );
  const move = { game: g.id, version: 0, row: "good" };
  g = act("gem-facet", move, "first").gem;
  assert.equal(g.chance, 65);
  assert.equal(g.cost, 50);
  act("gem-facet", move, "first");
  assert.equal(e.player("p").balance, 9950);
  assert.throws(() => act("gem-facet", move), /changed/);
  e.rand = () => 99;
  g = act("gem-facet", { game: g.id, version: g.version, row: "bad" }).gem;
  assert.equal(g.chance, 75);
  assert.equal(g.bad[0], false);
  e.rand = () => 0;
  while (g.good.length < 10)
    g = act("gem-facet", { game: g.id, version: g.version, row: "good" }).gem;
  assert.throws(
    () => act("gem-facet", { game: g.id, version: g.version, row: "good" }),
    /empty node/,
  );
  // Miss remaining fractures, producing10good /0bad.
  e.rand = () => 99;
  while (g.bad.length < 9)
    g = act("gem-facet", { game: g.id, version: g.version, row: "bad" }).gem;
  const last = { game: g.id, version: g.version, row: "bad" };
  g = act("gem-facet", last, "final").gem;
  assert.equal(g.status, "complete");
  assert.equal(g.payout, 4500);
  assert.equal(g.cost, 1000);
  assert.equal(e.player("p").balance, 13500);
  assert.equal(e.player("p").earned, 10000);
  act("gem-facet", last, "final");
  assert.equal(e.player("p").balance, 13500);
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 3500);
  assert.equal(e.state("q").gem, null);
  assert.equal(e.state("p").gem.status, "complete");
  assert.ok(act("gem-start", { previousGame: g.id }).gem.id > g.id);
});
test("failed facet affordability leaves board and odds untouched", (t) => {
  const { e, act } = fixture(t),
    g = act("gem-start", { previousGame: null }).gem;
  e.run("UPDATE players SET balance=49 WHERE id='p'");
  assert.throws(
    () => act("gem-facet", { game: g.id, version: 0, row: "good" }),
    /Not enough/,
  );
  assert.deepEqual(e.state("p").gem, g);
});
test("bad-row successes lower the chance too, roll boundaries are exact, and saved gems follow identity/reset scopes", (t) => {
  const { e, act, db } = fixture(t);
  let g = act("gem-start", { previousGame: null }).gem;
  e.rand = () => 74;
  g = act("gem-facet", { game: g.id, version: 0, row: "bad" }).gem;
  assert.deepEqual(g.bad, [true]);
  assert.equal(g.chance, 65);
  e.rand = () => 65;
  g = act("gem-facet", { game: g.id, version: 1, row: "good" }).gem;
  assert.deepEqual(g.good, [false]);
  assert.equal(g.chance, 75);
  const before = e.player("p").balance;
  assert.throws(
    () => act("gem-facet", { game: g.id, version: 2, row: "wrong" }),
    /empty node/,
  );
  assert.equal(e.player("p").balance, before);
  const restart = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    (fn) => fn(),
  );
  assert.deepEqual(restart.state("p").gem, g);
  e.tx(() => new AliasSync(e).renamePlayer("p", "renamed"));
  assert.deepEqual(e.state("renamed").gem, g);
  e.tx(() =>
    e.host("reset-player", {
      player: "renamed",
      confirmation: "RESET PLAYER renamed",
    }),
  );
  assert.equal(e.state("renamed").gem, null);
  e.host("grant", { player: "q", amount: 1000, reason: "other", note: "Test" });
  act("gem-start", { previousGame: null }, undefined, "q");
  e.tx(() =>
    e.host("reset-all", {
      deleteRegistry: false,
      confirmation: "RESET ALL GAME DATA",
    }),
  );
  assert.equal(e.state("q").gem, null);
});
test("coin flip uses fair two-sided outcomes and floors 1.75x gross payouts, with idempotent balance and earned preservation", (t) => {
  const { e, act } = fixture(t);
  const b = { game: "coin", choice: "heads", stake: 3 };
  let r = act("gamble", b, "coin");
  assert.equal(r.payout, 5);
  assert.equal(r.net, 2);
  act("gamble", b, "coin");
  assert.equal(e.player("p").balance, 10002);
  e.rand = () => 1;
  r = act("gamble", b);
  assert.equal(r.payout, 0);
  assert.equal(e.player("p").balance, 9999);
  assert.equal(e.player("p").earned, 10000);
  e.rand = () => 0;
  for (const [stake, payout] of [
    [1, 1],
    [2, 3],
    [4, 7],
    [100, 175],
  ]) {
    r = act("gamble", { ...b, stake });
    assert.equal(r.payout, payout);
    assert.equal(r.net, payout - stake);
  }
  assert.throws(() => act("gamble", { ...b, stake: 0 }), /whole number/);
  assert.throws(() => act("gamble", { ...b, choice: "bad" }), /heads/);
  assert.throws(
    () => act("gamble", { ...b, game: "dice" }),
    (err) => err.status === 410,
  );
});
