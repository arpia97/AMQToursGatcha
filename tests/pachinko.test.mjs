import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { blackjackTotal, blackjackShoe } from "../public/blackjack-rules.js";
import { gemValue, nextFacetChance } from "../public/gem-rules.js";
import {
  gamblingHistoryModalHTML,
  formatOutcomeSummary,
  gameDisplayName,
} from "../public/gambling-history-ui.js";
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
test("retired coin/dice endpoints cannot charge credits or create new rounds", (t) => {
  const { e, act } = fixture(t),
    before = e.player("p").balance;
  for (const game of ["coin", "dice", "roulette"])
    assert.throws(
      () => act("gamble", { game, choice: "heads", stake: 100 }),
      (err) => err.status === 410,
    );
  assert.equal(e.player("p").balance, before);
  assert.equal(e.all("SELECT * FROM gambling_rounds").length, 0);
});

test("67 Blackjack keeps its shoe and hole card private, persists active hands, settles ties/busts once and blocks stale or foreign moves", (t) => {
  const { e, act } = fixture(t);
  e.rand = (n) => n - 1;
  const shoe = blackjackShoe(e.rand);
  assert.equal(shoe.length, 208);
  for (let rank = 1; rank <= 13; rank++)
    assert.equal(shoe.filter((c) => c.rank === rank).length, 16);
  assert.deepEqual(blackjackTotal([{ rank: 1 }, { rank: 1 }, { rank: 10 }]), {
    total: 44,
    soft: false,
  });
  assert.deepEqual(blackjackTotal([{ rank: 1 }, { rank: 10 }]), {
    total: 67,
    soft: true,
  });
  const start = { stake: 101, previousGame: null };
  act("blackjack-start", start, "deal");
  act("blackjack-start", start, "deal");
  let g = e.gameState("p").blackjack;
  assert.equal(e.player("p").balance, 9899);
  assert.equal(g.total, 60);
  assert.equal(g.dealer[1], null);
  assert.equal(g.dealerTotal, null);
  assert.ok(!Object.hasOwn(g, "shoe"));
  assert.ok(
    !JSON.parse(
      e.one("SELECT outcome FROM gambling_rounds WHERE game='blackjack67'")
        .outcome,
    ).shoe,
  );
  assert.throws(
    () => act("blackjack-start", { stake: 100, previousGame: g.id }),
    /Finish/,
  );
  assert.throws(
    () => act("blackjack-hit", { game: g.id, version: 9 }),
    /changed/,
  );
  assert.throws(
    () =>
      act("blackjack-hit", { game: g.id, version: g.version }, "foreign", "q"),
    /Start/,
  );
  const restarted = new Engine(e.db, e.transaction, e.now, e.rand);
  assert.deepEqual(restarted.gameState("p").blackjack, g);
  act("blackjack-stand", { game: g.id, version: g.version }, "stand");
  act("blackjack-stand", { game: g.id, version: g.version }, "stand");
  g = e.gameState("p").blackjack;
  assert.equal(g.result, "push");
  assert.equal(g.payout, 101);
  assert.equal(e.player("p").balance, 10000);
  assert.equal(g.dealer.length, 2);
  assert.ok(g.dealer.every(Boolean));
  act("blackjack-start", { stake: 100, previousGame: g.id });
  g = e.gameState("p").blackjack;
  act("blackjack-hit", { game: g.id, version: g.version });
  g = e.gameState("p").blackjack;
  assert.equal(g.result, "bust");
  assert.equal(g.payout, 0);
  assert.equal(e.player("p").balance, 9900);
  assert.equal(e.economy.rankings("gambling_lost").rows[0].gambling_net, -100);
  assert.equal(e.player("p").earned, 10000);
});
test("67 Blackjack floors natural payouts, recognizes dealer naturals and rolls back unaffordable or invalid stakes", (t) => {
  const { e, act } = fixture(t);
  let shuffled = 0;
  e.rand = (n) => (shuffled++ === 0 ? 195 : n - 1);
  act("blackjack-start", { stake: 101, previousGame: null });
  let g = e.gameState("p").blackjack;
  assert.equal(g.status, "complete");
  assert.equal(g.result, "blackjack");
  assert.equal(g.payout, 252);
  assert.equal(e.player("p").balance, 10151);
  shuffled = 0;
  e.rand = (n) => (shuffled++ === 1 ? 195 : n - 1);
  act("blackjack-start", { stake: 100, previousGame: g.id });
  g = e.gameState("p").blackjack;
  assert.equal(g.result, "dealer-blackjack");
  assert.equal(g.payout, 0);
  assert.equal(e.player("p").balance, 10051);
  for (const stake of [0, 1.5, 1000001, 10052])
    assert.throws(() => act("blackjack-start", { stake, previousGame: g.id }));
  assert.equal(e.player("p").balance, 10051);
  assert.equal(e.gameState("p").blackjack.id, g.id);
});
test("pachinko history queries completed rounds across games, respects filters, and formats modal HTML", (t) => {
  const { e, act } = fixture(t);
  let shuffled = 0;
  e.rand = (n) => (shuffled++ === 0 ? 195 : n - 1);
  act("blackjack-start", { stake: 100, previousGame: null });
  const bj = e.gameState("p").blackjack;
  assert.equal(bj.status, "complete");

  const allHistory = e.economy.pachinko.history("p");
  assert.equal(allHistory.items.length, 1);
  assert.equal(allHistory.items[0].game, "blackjack67");
  assert.equal(allHistory.items[0].stake, 100);
  assert.equal(allHistory.items[0].payout, 250);
  assert.equal(allHistory.items[0].net, 150);
  assert.equal(allHistory.hasMore, false);

  const bjFiltered = e.economy.pachinko.history("p", "blackjack");
  assert.equal(bjFiltered.items.length, 1);

  const mahjongFiltered = e.economy.pachinko.history("p", "mahjong");
  assert.equal(mahjongFiltered.items.length, 0);

  // Formatting tests
  assert.equal(gameDisplayName("blackjack67"), "67 Blackjack");
  assert.equal(gameDisplayName("horse-racing"), "Horse Racing");
  assert.equal(gameDisplayName("faceting"), "Gem Faceting");

  const summary = formatOutcomeSummary("blackjack67", bj);
  assert.match(summary, /Natural Blackjack/);

  const html = gamblingHistoryModalHTML(allHistory, false, "blackjack");
  assert.match(html, /Gambling History/);
  assert.match(html, /data-action="gambling-history-filter"/);
  assert.match(html, /Round #/);
  assert.match(html, /67 Blackjack/);
  assert.match(html, /Stake ✦ 100/);

  const loadingHTML = gamblingHistoryModalHTML(null, true, "all");
  assert.match(loadingHTML, /Loading gambling history/);
});
