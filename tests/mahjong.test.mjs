import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import { createMahjongUI, tileName, tileFace } from "../public/mahjong-ui.js";
import {
  dealMahjong,
  replaceMahjong,
  scoreMahjong,
  publicMahjong,
  MAHJONG_START,
  MAHJONG_DISCARD,
  tenpaiMahjong,
  declareRiichi,
  riichiDiscards,
  MAHJONG_RIICHI,
  mahjongTilePool,
  kanOptions,
  kanMahjong,
  tileBase,
  tileSort,
} from "../public/mahjong-rules.js";

function tiles(s) {
  return [...s.matchAll(/([mpsz])(\d+)/g)].flatMap(([, suit, ranks]) =>
    [...ranks].map((n) => ({ m: 0, p: 9, s: 18, z: 27 })[suit] + Number(n) - 1),
  );
}
function hand(s, win, seat = 1, indicator = 33) {
  const all = tiles(s),
    last = tiles(win)[0];
  all.splice(all.indexOf(last), 1);
  all.push(last);
  return {
    hand: all,
    seat,
    indicator,
    wall: [1],
    discards: [],
    version: 0,
    status: "active",
    cost: 1000,
    payout: 0,
    result: null,
  };
}
const pinfu = (seat = 1) => hand("m123p22456s234567", "s7", seat);

test("closed tsumo scores han/fu, winning wait, dealer and all non-dealer seats correctly", () => {
  for (const seat of [1, 2, 3]) {
    const score = scoreMahjong(pinfu(seat));
    assert.equal(score.han, 2);
    assert.equal(score.fu, 20);
    assert.equal(score.payout, 1500);
    assert.equal(score.payments.find((p) => p.seat === "East").amount, 700);
    assert.equal(
      score.payments.reduce((s, p) => s + p.amount, 0),
      1500,
    );
    assert.ok(score.yaku.some((y) => y.name === "Menzen tsumo"));
    assert.ok(score.yaku.some((y) => y.name === "Pinfu"));
  }
  assert.equal(scoreMahjong(pinfu(0)).payout, 2100);
  // Same printed tiles, but a pair wait removes pinfu and adds wait fu.
  const pair = scoreMahjong(hand("m123p22456s234567", "p2"));
  assert.equal(pair.han, 1);
  assert.equal(pair.fu, 30);
  assert.equal(pair.payout, 1100);
});
test("dora indicators, seat/round winds and last-wall tsumo affect scoring", () => {
  const g = pinfu();
  g.indicator = 9; // 1 dots -> 2 dots, two dora
  assert.equal(scoreMahjong(g).han, 4);
  assert.equal(scoreMahjong(g).payout, 5200);
  const last = pinfu();
  last.wall = [];
  assert.equal(scoreMahjong(last).han, 3);
  assert.equal(scoreMahjong(last).payout, 2700);
  const south = scoreMahjong(hand("m123p456s789z22233", "z3", 1));
  const west = scoreMahjong(hand("m123p456s789z22233", "z3", 2));
  assert.ok(south.yaku.some((y) => y.name === "Seat wind · South"));
  assert.ok(!west.yaku.some((y) => y.name.startsWith("Seat wind")));
  assert.equal(
    scoreMahjong(pinfu()).yaku.some((y) =>
      /heaven|earth|天和|地和/i.test(y.name),
    ),
    false,
  );
});
test("seven pairs, thirteen orphans and yakuman limits use Riichi scoring", () => {
  const pairs = scoreMahjong(hand("m1199p2288s3377z11", "z1"));
  assert.equal(pairs.fu, 25);
  assert.equal(pairs.han, 3);
  assert.equal(pairs.payout, 3200);
  const kokushi = scoreMahjong(hand("m19p19s19z11234567", "p1"));
  assert.equal(kokushi.yakuman, 1);
  assert.equal(kokushi.payout, 32000);
  const double = scoreMahjong(hand("m19p19s19z11234567", "z1", 0));
  assert.equal(double.yakuman, 2);
  assert.equal(double.payout, 96000);
  const flush = scoreMahjong(hand("m11223345678999", "m9"));
  assert.ok(flush.han >= 6);
  assert.ok(flush.payout >= 12000);
  assert.ok(flush.limit);
});
test("invalid and incomplete hands cannot score and original tile order is unchanged", () => {
  const g = pinfu(),
    before = structuredClone(g);
  scoreMahjong(g);
  assert.deepEqual(g, before);
  assert.equal(scoreMahjong({ ...g, hand: g.hand.slice(1) }), null);
  assert.equal(scoreMahjong({ ...g, hand: Array(14).fill(0) }), null);
  assert.equal(scoreMahjong({ ...g, hand: tiles("m123456789p12345") }), null);
  assert.equal(scoreMahjong({ ...g, seat: 4 }), null);
});
test("dealing uses four copies of 34 tiles, 69 replacements, a separate drawn tile and random seats", () => {
  let seed = 12345;
  const rand = (n) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % n;
  };
  const seats = new Set();
  for (let i = 0; i < 200; i++) {
    const g = dealMahjong(rand);
    seats.add(g.seat);
    assert.equal(g.hand.length, 14);
    assert.equal(g.wall.length, 69);
    assert.deepEqual(
      g.hand.slice(0, 13),
      g.hand.slice(0, 13).toSorted(tileSort),
    );
    const counts = Array(34).fill(0);
    for (const t of [...g.hand, ...g.wall, g.indicator, g.uraIndicator]) {
      assert.ok(t >= 0 && t <= 36);
      counts[tileBase(t)]++;
    }
    assert.ok(counts.every((n) => n <= 4));
    assert.equal("wall" in publicMahjong(g), false);
    assert.equal("uraIndicator" in publicMahjong(g), false);
  }
  assert.equal(seats.size, 4);
});

test("Riichi options require a tenpai discard and four live tiles; first-discard declaration is double and locks the hand", () => {
  const g = { ...pinfu(), wall: [24, 1, 2, 3, 8, 5, 6, 7, 24] };
  g.hand[13] = 8;
  assert.ok(
    riichiDiscards(g).some((o) => o.index === 13 && o.waits.includes(24)),
  );
  assert.deepEqual(riichiDiscards({ ...g, wall: [1, 2, 3] }), []);
  assert.equal(declareRiichi(g, 0), null);
  const double = declareRiichi(g, 13);
  assert.equal(double.riichi, 2);
  assert.equal(double.ippatsu, true);
  assert.equal(double.cost, 1000 + MAHJONG_RIICHI + MAHJONG_DISCARD);
  assert.equal(double.version, 1);
  assert.equal(double.wall.length, 5);
  assert.equal(scoreMahjong(double).han, 5);
  assert.equal(scoreMahjong(double).payout, 8000);
  assert.ok(
    scoreMahjong(double).yaku.some(
      (y) => y.name === "Double Riichi" && y.han === 2,
    ),
  );
  assert.ok(
    scoreMahjong(double).yaku.some((y) => y.name === "Ippatsu" && y.han === 1),
  );
  assert.equal(declareRiichi(double, 13), null);
  assert.throws(() => replaceMahjong(double, 0), /newly drawn/);
  const normal = declareRiichi({ ...g, discards: [0] }, 13);
  assert.equal(normal.riichi, 1);
  assert.equal(scoreMahjong(normal).han, 4);
  assert.equal(scoreMahjong(normal).payout, 5200);
  const miss = declareRiichi({ ...g, wall: [8, 1, 2, 3, 24, 5, 6, 7, 8] }, 13);
  assert.equal(scoreMahjong(miss), null);
  const laterWin = replaceMahjong(miss, 13);
  assert.equal(laterWin.ippatsu, false);
  assert.equal(scoreMahjong(laterWin).han, 4);
  assert.equal(
    scoreMahjong(laterWin).yaku.some((y) => y.name === "Ippatsu"),
    false,
  );
});

test("Riichi bonuses respect dealer limits, special hands and hidden ura-dora reveal", () => {
  for (const seat of [0, 1, 2, 3]) {
    const g = { ...pinfu(seat), riichi: 2, ippatsu: true, uraIndicator: 9 };
    assert.equal(scoreMahjong(g).han, 5);
    assert.equal(scoreMahjong(g).payout, seat === 0 ? 12000 : 8000);
    const revealed = scoreMahjong(g, { revealUra: true });
    assert.equal(revealed.han, 7);
    assert.equal(revealed.payout, seat === 0 ? 18000 : 12000);
    assert.equal(publicMahjong(g).uraIndicator, undefined);
    assert.equal(publicMahjong(g).score.han, 5);
    assert.equal(
      publicMahjong({ ...g, status: "won", result: revealed }).uraIndicator,
      9,
    );
    assert.equal(
      publicMahjong({ ...g, status: "ended" }).uraIndicator,
      undefined,
    );
    assert.equal(scoreMahjong({ ...g, riichi: 0 }, { revealUra: true }).han, 2);
  }
  const pairs = hand("m1199p2288s3377z11", "z1");
  pairs.hand[13] = 28;
  pairs.wall = [27, 1, 2, 3];
  assert.ok(riichiDiscards(pairs).some((o) => o.index === 13));
  assert.equal(scoreMahjong(declareRiichi(pairs, 13)).han, 6); // Opponents consume the last tile, so no haitei.
});

test("server declares Riichi atomically once, returns the winning stake once and records total net without leaking hidden tiles", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  const g = { ...pinfu(), id: a.id, uraIndicator: 9, wall: [24, 1, 2, 3, 8] };
  g.hand[13] = 8;
  f.save(g);
  const before = e.player("p"),
    body = { game: a.id, version: 0, index: 13 };
  const declared = act("mahjong-riichi", body, "riichi").mahjong;
  assert.equal(
    e.player("p").balance,
    before.balance - MAHJONG_RIICHI - MAHJONG_DISCARD,
  );
  assert.equal(declared.riichi, 2);
  assert.equal(declared.uraIndicator, undefined);
  assert.deepEqual(act("mahjong-riichi", body, "riichi").mahjong, declared);
  assert.throws(() => act("mahjong-riichi", body), /hand changed/);
  assert.throws(
    () => act("mahjong-discard", { game: a.id, version: 1, index: 0 }),
    /newly drawn/,
  );
  const balance = e.player("p").balance;
  const won = act(
    "mahjong-tsumo",
    { game: a.id, version: 1 },
    "riichi-win",
  ).mahjong;
  assert.equal(won.result.han, 7);
  assert.equal(won.result.payout, 12000);
  assert.equal(won.riichiReturned, 1000);
  assert.equal(won.payout, 13000);
  assert.equal(e.player("p").balance, balance + 13000);
  act("mahjong-tsumo", { game: a.id, version: 1 }, "riichi-win");
  assert.equal(e.player("p").balance, balance + 13000);
  assert.equal(e.player("p").earned, before.earned);
  const row = e.economy.mahjong.history("p").items[0];
  assert.equal(row.riichi, 2);
  assert.equal(row.riichiReturned, 1000);
  assert.equal(row.uraIndicator, 9);
  assert.equal(row.cost, 1000 + MAHJONG_RIICHI + MAHJONG_DISCARD);
  assert.equal(row.net, 13000 - 1000 - MAHJONG_RIICHI - MAHJONG_DISCARD);
  assert.equal(e.gameState("q").mahjong, null);
});

test("Riichi rejects invalid/late/stale/foreign/unaffordable declarations without changes and draw refunds exclude the Riichi stake", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  const g = { ...pinfu(), id: a.id, wall: [8, 1, 2, 3] };
  g.hand[13] = 8;
  f.save(g);
  const before = e.player("p").balance,
    body = { game: a.id, version: 0, index: 13 };
  assert.throws(() => act("mahjong-riichi", { ...body, index: 0 }), /tenpai/);
  assert.throws(() => act("mahjong-riichi", body, undefined, "q"), /no active/);
  e.run("UPDATE players SET balance=1049 WHERE id='p'");
  const saved = e.economy.mahjong.read("p");
  assert.throws(() => act("mahjong-riichi", body), /credits/i);
  assert.deepEqual(e.economy.mahjong.read("p"), saved);
  assert.equal(e.player("p").balance, 1049);
  e.run("UPDATE players SET balance=? WHERE id='p'", before);
  f.save({ ...g, wall: [1, 2, 3] });
  assert.throws(() => act("mahjong-riichi", body), /four live/);
  f.save(g);
  const draw = act("mahjong-riichi", body, "draw-riichi").mahjong;
  assert.equal(draw.status, "exhausted");
  assert.equal(draw.tenpai, true);
  assert.equal(draw.refund, 1000);
  assert.equal(draw.payout, 1000);
  assert.equal(
    e.player("p").balance,
    before - MAHJONG_RIICHI - MAHJONG_DISCARD + 1000,
  );
  act("mahjong-riichi", body, "draw-riichi");
  assert.equal(e.player("p").balance, before - MAHJONG_DISCARD);
  assert.equal(draw.hand.length, 13);
});

test("Riichi UI enables only eligible selections and locks existing tiles after declaration", () => {
  const raw = { ...pinfu(), id: 1, wall: [8, 1, 2, 3, 24] };
  raw.hand[13] = 8;
  let state = { me: { balance: 5000 }, mahjong: publicMahjong(raw) };
  const ui = createMahjongUI({
    getState: () => state,
    escape: String,
    number: String,
  });
  assert.match(ui.render(), /Call Double Riichi/);
  ui.select(13);
  assert.match(
    ui.render(),
    /data-action="mahjong-riichi"[^>]*data-index="13"\s*>/,
  );
  state = { ...state, mahjong: publicMahjong(declareRiichi(raw, 13)) };
  assert.equal(ui.select(0), null);
  assert.match(ui.render(), /Hand locked/);
  assert.doesNotMatch(ui.render(), /data-action="mahjong-riichi"/);
  assert.equal(ui.select(13), null);
  assert.deepEqual(ui.select(13), { game: 1, version: 1, index: 13 });
});

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const transaction = (fn) => {
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
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    transaction,
    () => Date.UTC(2026, 9, 25),
  );
  e.tx(() => {
    e.host("players", {
      players: [
        { id: "p", name: "Player" },
        { id: "q", name: "Other" },
      ],
    });
    e.host("grant", {
      player: "p",
      amount: 100000,
      reason: "other",
      note: "Test",
    });
  });
  const act = (action, b = {}, key = crypto.randomUUID(), player = "p") =>
    e.mutate(player + ":" + action, key, b, () => e.action(player, action, b));
  const start = () =>
    act("mahjong-start", {
      previousGame: e.economy.mahjong.read("p")?.id ?? null,
    }).mahjong;
  const save = (g) =>
    e.run(
      "UPDATE mahjong_games SET data=? WHERE player='p'",
      JSON.stringify(g),
    );
  return { e, db, act, start, save, transaction };
}
test("start and replacement charges persist once, retries replay and stale versions cannot charge", (t) => {
  const f = fixture(t),
    { e, act } = f,
    initial = e.player("p");
  const body = { previousGame: null };
  const a = act("mahjong-start", body, "start").mahjong;
  assert.equal(e.player("p").balance, initial.balance - MAHJONG_START);
  assert.deepEqual(act("mahjong-start", body, "start").mahjong, a);
  assert.throws(() => act("mahjong-start", body), /current hand/);
  const old = e.economy.mahjong.read("p"),
    discarded = old.hand[4],
    drawn = old.wall[0];
  const move = { game: a.id, version: 0, index: 4 };
  const b = act("mahjong-discard", move, "draw").mahjong;
  assert.equal(b.cost, MAHJONG_START + MAHJONG_DISCARD);
  assert.equal(b.remaining, 65);
  assert.equal(b.turnsLeft, 17);
  assert.equal(b.discards[0], discarded);
  assert.equal(b.hand[13], drawn);
  assert.deepEqual(act("mahjong-discard", move, "draw").mahjong, b);
  assert.throws(() => act("mahjong-discard", move), /hand changed/);
  assert.equal(
    e.player("p").balance,
    initial.balance - MAHJONG_START - MAHJONG_DISCARD,
  );
  assert.equal(e.player("p").earned, initial.earned);
  assert.equal(
    e.economy.rankings("gambling_won").rows[0].value,
    -MAHJONG_START - MAHJONG_DISCARD,
  );
  assert.equal(e.state("q").mahjong, null);
  assert.equal(e.state(null).mahjong, null);
  const restarted = new Engine(
    (s, ...a) => f.db.prepare(s).all(...a),
    f.transaction,
  );
  assert.deepEqual(restarted.state("p").mahjong, b);
  assert.equal("wall" in e.state("p").mahjong, false);
});
test("winning hands can be claimed exactly once or discarded while still winning", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  f.save({ ...pinfu(), id: a.id, wall: [8, 7] });
  const before = e.player("p");
  const body = { game: a.id, version: 0 };
  const win = act("mahjong-tsumo", body, "win").mahjong;
  assert.equal(win.status, "won");
  assert.equal(win.payout, 1500);
  assert.equal(e.player("p").balance, before.balance + 1500);
  assert.deepEqual(act("mahjong-tsumo", body, "win").mahjong, win);
  assert.throws(() => act("mahjong-tsumo", body), /no active/);
  assert.equal(e.player("p").earned, before.earned);
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 500);
  const b = f.start();
  f.save({ ...pinfu(), id: b.id, wall: [8, 7, 6, 5, 4] });
  const next = act("mahjong-discard", {
    game: b.id,
    version: 0,
    index: 13,
  }).mahjong;
  assert.equal(next.payout, 0);
  assert.equal(next.remaining, 1);
  assert.equal(
    e.player("p").balance,
    before.balance + 1500 - MAHJONG_START - MAHJONG_DISCARD,
  );
});
test("invalid actions and insufficient balance roll back wallet, wall and version together", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  const nonwin = { ...pinfu(), id: a.id };
  nonwin.hand[0] = 8;
  f.save(nonwin);
  const before = e.player("p").balance,
    state = e.state("p").mahjong;
  assert.throws(
    () => act("mahjong-tsumo", { game: a.id, version: 0 }),
    /does not qualify/,
  );
  for (const index of [-1, 14, 1.5, "1"])
    assert.throws(
      () => act("mahjong-discard", { game: a.id, version: 0, index }),
      /whole number/,
    );
  assert.throws(
    () => act("mahjong-discard", { game: a.id + 1, version: 0, index: 0 }),
    /hand changed/,
  );
  assert.throws(
    () => act("mahjong-tsumo", { game: a.id, version: 0 }, undefined, "q"),
    /no active/,
  );
  assert.equal(e.player("p").balance, before);
  assert.deepEqual(e.state("p").mahjong, state);
  e.run("UPDATE players SET balance=49 WHERE id='p'");
  assert.throws(
    () => act("mahjong-discard", { game: a.id, version: 0, index: 0 }),
    /Not enough/,
  );
  assert.equal(e.player("p").balance, 49);
  assert.deepEqual(e.state("p").mahjong, state);
  act("mahjong-end", { game: a.id, version: 0 });
  assert.throws(() => f.start(), /Not enough/);
  assert.equal(e.player("p").balance, 49);
});
test("wall exhaustion keeps a final tsumo claimable and ends non-tenpai hands without a refund", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  const g = { ...pinfu(), id: a.id, wall: [24] };
  g.hand[13] = 8;
  f.save(g);
  const last = act("mahjong-discard", {
    game: a.id,
    version: 0,
    index: 13,
  }).mahjong;
  assert.equal(last.remaining, 0);
  assert.equal(last.status, "active");
  assert.equal(last.score.payout, 2700);
  assert.throws(
    () => act("mahjong-discard", { game: a.id, version: 1, index: 0 }),
    /wall is empty/,
  );
  const claimed = act("mahjong-tsumo", { game: a.id, version: 1 }).mahjong;
  assert.equal(claimed.payout, 2700);
  const b = f.start();
  const bad = {
    ...pinfu(),
    id: b.id,
    hand: tiles("m147p258s369z12345"),
    wall: [7],
  };
  f.save(bad);
  const exhausted = act("mahjong-discard", {
    game: b.id,
    version: 0,
    index: 0,
  }).mahjong;
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.payout, 0);
  assert.equal(exhausted.remaining, 0);
  assert.ok(f.start().id > b.id);
});
test("four-player draw pacing consumes up to four wall tiles per turn and haitei belongs only to the player's last-tile draw", () => {
  const g = { ...pinfu(), wall: [24, 5, 6, 7] };
  g.hand[13] = 8;
  const next = replaceMahjong(g, 13);
  assert.equal(next.wall.length, 0);
  assert.equal(next.lastDrawFinal, false);
  assert.equal(scoreMahjong(next).han, 2);
  const last = replaceMahjong({ ...g, wall: [24] }, 13);
  assert.equal(last.lastDrawFinal, true);
  assert.equal(scoreMahjong(last).han, 3);
  let dealt = dealMahjong(() => 0),
    turns = 0;
  while (dealt.wall.length) {
    dealt = replaceMahjong(dealt, 13);
    turns++;
  }
  assert.equal(turns, 18);
  assert.equal(dealt.cost, MAHJONG_START + 18 * MAHJONG_DISCARD);
});
test("tenpai handles normal hands, seven pairs and thirteen orphans without permitting five identical tiles", () => {
  assert.ok(tenpaiMahjong(tiles("m123p22456s23456"))?.waits.includes(24));
  assert.deepEqual(tenpaiMahjong(tiles("m112233p445566z1")).waits, [27]);
  assert.equal(tenpaiMahjong(tiles("m19p19s19z1234567")).waits.length, 13);
  assert.equal(tenpaiMahjong(tiles("m147p258s369z1234")), null);
  assert.equal(tenpaiMahjong(Array(13).fill(0)), null);
});
test("exhaustive tenpai refunds only the entry fee once, records private draw history, and early endings do not refund", (t) => {
  const f = fixture(t),
    { e, act } = f,
    a = f.start();
  f.save({ ...pinfu(), id: a.id, wall: [8] });
  const before = e.player("p"),
    body = { game: a.id, version: 0, index: 13 };
  const result = act("mahjong-discard", body, "tenpai-final").mahjong;
  assert.equal(result.status, "exhausted");
  assert.equal(result.tenpai, true);
  assert.equal(result.refund, 1000);
  assert.equal(result.payout, 1000);
  assert.equal(result.hand.length, 13);
  assert.equal(e.player("p").balance, before.balance - MAHJONG_DISCARD + 1000);
  assert.equal(e.player("p").earned, before.earned);
  act("mahjong-discard", body, "tenpai-final");
  assert.equal(e.player("p").balance, before.balance - MAHJONG_DISCARD + 1000);
  assert.throws(
    () => act("mahjong-end", { game: a.id, version: 1 }),
    /no active/,
  );
  const row = e.economy.mahjong.history("p").items[0];
  assert.equal(row.tenpai, true);
  assert.equal(row.refund, 1000);
  assert.equal(row.net, -MAHJONG_DISCARD);
  assert.equal(e.economy.mahjong.history("q").items.length, 0);
  const b = f.start();
  f.save({ ...pinfu(), id: b.id, wall: [8, 7, 6, 5] });
  const balance = e.player("p").balance;
  const ended = act("mahjong-end", { game: b.id, version: 0 }).mahjong;
  assert.equal(ended.status, "ended");
  assert.equal(ended.payout, 0);
  assert.equal(e.player("p").balance, balance);
});
test("ending, identity migration and host resets preserve financial history and clean active hands", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  act("mahjong-end", { game: a.id, version: 0 });
  assert.equal(e.economy.mahjong.state("p").status, "ended");
  assert.equal(e.player("p").balance, 100000 - MAHJONG_START);
  assert.throws(
    () => act("mahjong-start", { previousGame: null }),
    /hand changed/,
  );
  const b = f.start();
  e.tx(() => new AliasSync(e).renamePlayer("p", "renamed"));
  assert.equal(e.state("renamed").mahjong.id, b.id);
  assert.equal(
    e.one("SELECT count(*) n FROM gambling_rounds WHERE player='renamed'").n,
    2,
  );
  e.tx(() => e.economy.resetPlayer("renamed"));
  assert.equal(e.state("renamed").mahjong, null);
  assert.equal(
    e.one("SELECT count(*) n FROM gambling_rounds WHERE player='renamed'").n,
    0,
  );
});
test("retired games are disabled server-side and never charge credits", (t) => {
  const { e, act } = fixture(t),
    before = e.player("p").balance;
  for (const game of ["dice", "seven"])
    assert.throws(
      () => act("gamble", { game, stake: 100, choice: "heads" }),
      (err) => err.status === 410,
    );
  assert.equal(e.player("p").balance, before);
});

test("clicking the selected tile returns one paid discard intent and resets after a revision", (t) => {
  const f = fixture(t),
    g = f.start();
  let state = f.e.state("p");
  const ui = createMahjongUI({
    getState: () => state,
    escape: String,
    number: String,
  });
  assert.equal(ui.select(3), null);
  assert.equal(ui.select(4), null); // Different tile changes selection only.
  const intent = ui.select(4);
  assert.deepEqual(intent, { game: g.id, version: 0, index: 4 });
  f.act("mahjong-discard", intent, "two-click");
  assert.equal(
    f.e.player("p").balance,
    100000 - MAHJONG_START - MAHJONG_DISCARD,
  );
  f.act("mahjong-discard", intent, "two-click");
  assert.equal(
    f.e.player("p").balance,
    100000 - MAHJONG_START - MAHJONG_DISCARD,
  );
  state = f.e.state("p");
  assert.equal(ui.select(4), null); // Replacement needs a new first click.
  state.mahjong.version++;
  assert.equal(ui.select(4), null); // Remote update cannot turn selection into a discard.
  state.me.balance = MAHJONG_DISCARD - 1;
  assert.throws(() => ui.select(4), /Not enough credits/);
  state.me.balance = MAHJONG_DISCARD;
  state.mahjong.remaining = 0;
  assert.throws(() => ui.select(4), /wall is empty/);
});

test("private paged history retains final hands and discards without exposing walls, including older summaries", (t) => {
  const f = fixture(t),
    { e, act } = f;
  for (let i = 0; i < 12; i++) {
    const g = f.start();
    act("mahjong-discard", { game: g.id, version: 0, index: i % 14 });
    act("mahjong-end", { game: g.id, version: 1 });
  }
  const first = e.economy.mahjong.history("p"),
    second = e.economy.mahjong.history("p", 2);
  assert.equal(first.items.length, 10);
  assert.equal(first.hasMore, true);
  assert.equal(second.items.length, 2);
  assert.equal(second.hasMore, false);
  assert.ok(first.items[0].id > second.items[0].id);
  assert.ok(
    first.items.every(
      (r) =>
        r.hand.length === 14 &&
        r.discards.length === 1 &&
        r.cost === MAHJONG_START + MAHJONG_DISCARD &&
        r.net === -MAHJONG_START - MAHJONG_DISCARD,
    ),
  );
  assert.ok(first.items.every((r) => !("wall" in r)));
  assert.equal(e.economy.mahjong.history("q").items.length, 0);
  assert.throws(() => e.economy.mahjong.history("p", 0), /whole number/);
  const latest = e.economy.mahjong.read("p");
  e.run(
    "UPDATE gambling_rounds SET outcome=? WHERE id=?",
    JSON.stringify({
      status: "ended",
      seat: latest.seat,
      discards: 1,
      result: null,
    }),
    latest.id,
  );
  assert.equal(e.economy.mahjong.history("p").items[0].hand.length, 14);
  f.start(); // Backfills the old last-hand summary before replacing it.
  assert.equal(e.economy.mahjong.history("p").items[0].hand.length, 14);
  const old = second.items[0];
  e.run(
    "UPDATE gambling_rounds SET outcome=? WHERE id=?",
    JSON.stringify({ status: "ended", seat: 1, discards: 3, result: null }),
    old.id,
  );
  const legacy = e.economy.mahjong
    .history("p", 2)
    .items.find((r) => r.id === old.id);
  assert.deepEqual(legacy.hand, []);
  assert.equal(legacy.discardCount, 3);
});

test("host reset scopes clear saved Mahjong hands while retaining the catalogue", (t) => {
  const f = fixture(t),
    { e } = f;
  e.tx(() => {
    e.host("catalog", {
      cards: [{ id: "kept", kind: "character", name: "Protected catalogue" }],
    });
    e.host("grant", {
      player: "q",
      amount: 10000,
      reason: "other",
      note: "Test",
    });
  });
  f.start();
  f.act("mahjong-start", { previousGame: null }, undefined, "q");
  e.tx(() =>
    e.host("reset-player", { player: "p", confirmation: "RESET PLAYER p" }),
  );
  assert.equal(e.state("p").mahjong, null);
  assert.ok(e.state("q").mahjong);
  e.tx(() =>
    e.host("reset-all", {
      confirmation: "RESET ALL GAME DATA",
      deleteRegistry: false,
    }),
  );
  assert.equal(e.state("q").mahjong, null);
  assert.ok(e.catalogStore.card("kept"));
  assert.equal(e.one("SELECT count(*) n FROM mahjong_games").n, 0);
});

const kanHand = () => ({
  ...hand("m123p456s789z15555", "z5"),
  wall: [5, 6, 7, 8, 9],
  rinshanTiles: [27, 2, 3, 4],
  nextIndicators: [
    [8, 9],
    [10, 11],
    [12, 13],
    [14, 15],
  ],
  indicators: [33],
  uraIndicators: [33],
  uraIndicator: 33,
  melds: [],
  deadWallTail: [],
});
test("new pool replaces exactly one five per suit with a red five while preserving 136 tiles and four of each face", () => {
  const pool = mahjongTilePool();
  assert.equal(pool.length, 136);
  for (let t = 0; t < 34; t++)
    assert.equal(pool.filter((x) => tileBase(x) === t).length, 4);
  for (const r of [34, 35, 36])
    assert.equal(pool.filter((t) => t === r).length, 1);
  const g = pinfu();
  g.hand[g.hand.indexOf(13)] = 35;
  assert.equal(scoreMahjong(g).han, 3);
  assert.ok(
    scoreMahjong(g).yaku.some((y) => y.name === "Aka-dora" && y.han === 1),
  );
  g.indicator = 12;
  assert.equal(scoreMahjong(g).han, 4); // Red five also matches the normal dora indicator.
  const invalid = { ...g, hand: [34, 34, ...g.hand.slice(2)] };
  assert.equal(scoreMahjong(invalid), null);
  assert.ok(tenpaiMahjong(g.hand.slice(0, -1))?.waits.includes(24));
  assert.equal(tileName(34), "Red 5 man");
  assert.equal(tileName(35), "Red 5 pin");
  assert.equal(tileName(36), "Red 5 sou");
  assert.match(tileFace(34), /0m.svg/);
  assert.match(tileFace(35), /0p.svg/);
  assert.match(tileFace(36), /0s.svg/);
});
test("concealed Kan draws from the dead wall, reveals another indicator, pays no fee and scores rinshan without haitei", () => {
  const g = kanHand(),
    before = structuredClone(g);
  assert.ok(kanOptions(g).some((o) => o.tile === 31));
  const k = kanMahjong(g, 31);
  assert.deepEqual(g, before);
  assert.equal(k.hand.length, 11);
  assert.equal(k.hand.at(-1), 27);
  assert.equal(k.melds[0].length, 4);
  assert.equal(k.wall.length, 4);
  assert.equal(k.deadWallTail[0], 9);
  assert.equal(k.rinshanTiles.length, 3);
  assert.equal(k.indicators.length, 2);
  assert.equal(k.uraIndicators.length, 2);
  assert.equal(k.cost, g.cost);
  assert.equal(k.version, 1);
  const score = scoreMahjong(k);
  assert.ok(score);
  assert.ok(score.yaku.some((y) => y.name === "Rinshan kaihou"));
  assert.ok(score.yaku.some((y) => y.name === "Menzen tsumo"));
  assert.equal(
    score.yaku.some((y) => y.name === "Haitei"),
    false,
  );
  const exposed = publicMahjong(k);
  for (const f of [
    "wall",
    "nextIndicators",
    "uraIndicators",
    "rinshanTiles",
    "deadWallTail",
  ])
    assert.equal(exposed[f], undefined);
  const last = kanMahjong({ ...g, wall: [3] }, 31);
  assert.equal(last.status, "active");
  assert.equal(last.lastDrawFinal, false);
  assert.ok(scoreMahjong(last));
  assert.equal(kanMahjong({ ...g, wall: [] }, 31), null);
  assert.equal(kanMahjong({ ...g, rinshanTiles: [] }, 31), null);
  assert.equal(kanMahjong({ ...g, rinshanTiles: undefined }, 31), null); // Older hands keep their original pool.
  const after = replaceMahjong({ ...k, wall: [...k.wall, 1, 2, 3, 4] }, 10);
  assert.equal(after.rinshan, false);
  assert.equal(after.hand.length, 11);
});
test("Kan after Riichi requires a drawn fourth tile and unchanged waits/interpretations, cancels ippatsu, and later Riichi is not double", () => {
  const g = { ...kanHand(), riichi: 1, ippatsu: true };
  const k = kanMahjong(g, 31);
  assert.ok(k);
  assert.equal(k.ippatsu, false);
  assert.equal(k.riichi, 1);
  const score = scoreMahjong(k);
  assert.ok(score.yaku.some((y) => y.name === "Riichi"));
  assert.equal(
    score.yaku.some((y) => y.name === "Ippatsu"),
    false,
  );
  const wrongDraw = { ...g, hand: g.hand.slice() };
  [wrongDraw.hand[0], wrongDraw.hand[13]] = [
    wrongDraw.hand[13],
    wrongDraw.hand[0],
  ];
  assert.equal(kanMahjong(wrongDraw, 31), null);
  const changed = { ...g, hand: tiles("m11122233334455") };
  assert.equal(kanMahjong(changed, 2), null);
  assert.ok(riichiDiscards({ ...k, riichi: 0 }).length);
  const option = riichiDiscards({ ...k, riichi: 0 })[0];
  assert.equal(declareRiichi({ ...k, riichi: 0 }, option.index).riichi, 1);
});
test("Kan endpoint preserves cost, rejects stale/foreign/impossible calls and persists melds through history and retries", (t) => {
  const f = fixture(t),
    a = f.start(),
    { e, act } = f;
  f.save({ ...kanHand(), id: a.id });
  const balance = e.player("p").balance;
  const body = { game: a.id, version: 0, tile: 31 };
  assert.throws(() => act("mahjong-kan", body, undefined, "q"), /no active/);
  assert.throws(() => act("mahjong-kan", { ...body, tile: 0 }), /not legal/);
  const k = act("mahjong-kan", body, "kan").mahjong;
  assert.equal(k.cost, 1000);
  assert.equal(e.player("p").balance, balance);
  assert.deepEqual(act("mahjong-kan", body, "kan").mahjong, k);
  assert.throws(() => act("mahjong-kan", body), /hand changed/);
  const won = act("mahjong-tsumo", { game: a.id, version: 1 }).mahjong;
  assert.equal(won.melds.length, 1);
  const row = e.economy.mahjong.history("p").items[0];
  assert.equal(row.melds[0].length, 4);
  assert.equal(row.indicators.length, 2);
});
test("only latest50 Mahjong hands retain details; old financial totals and idempotency protection survive archiving", (t) => {
  const f = fixture(t),
    { e, act } = f;
  let oldBody = { previousGame: null };
  for (let i = 0; i < 60; i++) {
    const current = e.economy.mahjong.read("p");
    const b = { previousGame: current?.id ?? null };
    const g = act(
      "mahjong-start",
      b,
      i === 0 ? "old-start" : crypto.randomUUID(),
    ).mahjong;
    act("mahjong-end", { game: g.id, version: 0 });
  }
  assert.equal(
    e.one("SELECT count(*) n FROM gambling_rounds WHERE game='mahjong'").n,
    60,
  );
  assert.equal(
    e.one(
      "SELECT count(*) n FROM gambling_rounds WHERE game='mahjong' AND json_extract(outcome,'$.status')!='archived'",
    ).n,
    50,
  );
  const rows = [1, 2, 3, 4, 5].flatMap(
    (page) => e.economy.mahjong.history("p", page).items,
  );
  assert.equal(rows.length, 50);
  assert.equal(e.economy.mahjong.history("p", 6).items.length, 0);
  const balance = e.player("p").balance,
    rank = e.economy.rankings("gambling_lost").rows[0].value;
  assert.match(
    act("mahjong-start", oldBody, "old-start").message,
    /already applied/,
  );
  assert.equal(e.player("p").balance, balance);
  assert.equal(e.economy.rankings("gambling_lost").rows[0].value, rank);
  assert.equal(rank, -60 * MAHJONG_START);
  const receipt = e.one(
    "SELECT result FROM receipts WHERE scope='p:mahjong-start' AND key='old-start'",
  );
  assert.equal(JSON.parse(receipt.result).mahjong, undefined);
});

test("successive Kans shorten the concealed hand and stack dora/ura indicators without changing physical red fives", () => {
  assert.deepEqual(
    tenpaiMahjong(tiles("m23p456s789z11"), [tiles("m1111")]).waits,
    [3],
  );
  const g = {
    ...kanHand(),
    hand: tiles("m1111p2222s345z11m2"),
    rinshanTiles: [2, 3, 4, 5],
    wall: [1, 2, 3, 4, 5, 6, 7, 8],
  };
  const a = kanMahjong(g, 0);
  assert.equal(a.hand.length, 11);
  assert.equal(a.indicators.length, 2);
  const b = kanMahjong(a, 10);
  assert.equal(b.hand.length, 8);
  assert.equal(b.indicators.length, 3);
  assert.equal(b.uraIndicators.length, 3);
  assert.ok(scoreMahjong(b));
  assert.equal(b.melds.length, 2);
  assert.equal(b.wall.length, 6);
  const next = replaceMahjong(b, 7);
  assert.equal(next.hand.length, 8);
  assert.equal(next.rinshan, false);
  const red = {
    ...kanHand(),
    hand: tiles("m5555p123s456z1112"),
    rinshanTiles: [28, 2, 3, 4],
  };
  red.hand[red.hand.indexOf(4)] = 34;
  const k = kanMahjong(red, 4);
  assert.ok(k);
  assert.ok(k.melds[0].includes(34));
  assert.ok(scoreMahjong(k)?.yaku.some((y) => y.name === "Aka-dora"));
});
test("one-time retention migration caps existing players and compacts old receipts while preserving amounts and keys", (t) => {
  const f = fixture(t),
    { e } = f;
  for (let i = 0; i < 55; i++)
    e.run(
      "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES('q','mahjong',1000,0,-1000,?,?)",
      JSON.stringify({ status: "ended", hand: [1, 2, 3], discards: [4] }),
      i,
    );
  const old = e.one(
    "SELECT min(id) id FROM gambling_rounds WHERE player='q'",
  ).id;
  e.run(
    "INSERT INTO receipts VALUES('q:mahjong-end','old','{}',?,0)",
    JSON.stringify({ mahjong: { id: old, hand: [1, 2, 3] } }),
  );
  e.run("DELETE FROM catalog_meta WHERE key='mahjong-history-retention'");
  const restarted = new Engine(
    (s, ...a) => f.db.prepare(s).all(...a),
    f.transaction,
  );
  assert.equal(restarted.economy.mahjong.history("q", 1).items.length, 10);
  assert.equal(
    e.one(
      "SELECT count(*) n FROM gambling_rounds WHERE player='q' AND json_extract(outcome,'$.status')='archived'",
    ).n,
    5,
  );
  assert.equal(
    e.one("SELECT sum(stake) n FROM gambling_rounds WHERE player='q'").n,
    55000,
  );
  const r = e.one(
    "SELECT * FROM receipts WHERE scope='q:mahjong-end' AND key='old'",
  );
  assert.equal(r.input, "{}");
  assert.equal(JSON.parse(r.result).mahjong, undefined);
});

test("host Mahjong reversal restores net costs once, preserves other games/earned/cards, excludes reverted ranks and fences activity", (t) => {
  const f = fixture(t),
    { e, act } = f;
  const first = f.start();
  act("mahjong-end", { game: first.id, version: 0 });
  const second = f.start();
  act("mahjong-end", { game: second.id, version: 0 });
  const third = f.start();
  const preview = e.economy.mahjong.reversalPreview("p", 2);
  assert.equal(preview.count, 2);
  assert.equal(preview.adjustment, 2 * MAHJONG_START);
  const body = {
    player: "p",
    limit: 2,
    confirmation: "REVERT MAHJONG p 2",
    expectedRounds: preview.rounds,
    expectedActive: preview.active,
  };
  const reverse = (key = "reversal") =>
    e.mutate("host:host/mahjong-revert", key, body, () =>
      e.host("mahjong-revert", body),
    );
  const before = e.player("p");
  const result = reverse();
  assert.equal(result.balance, before.balance + 2 * MAHJONG_START);
  assert.equal(e.player("p").earned, before.earned);
  assert.equal(e.economy.mahjong.state("p"), null);
  assert.equal(
    e.one(
      "SELECT count(*) n FROM gambling_rounds WHERE game='mahjong-reverted'",
    ).n,
    2,
  );
  assert.equal(
    e.economy.rankings("gambling_lost").rows[0].value,
    -MAHJONG_START,
  );
  assert.deepEqual(reverse(), result);
  assert.equal(e.player("p").balance, result.balance);
  assert.throws(() => reverse("new-key"), /changed/);
  assert.equal(e.economy.mahjong.history("p").items.length, 1);
  const g = f.start(),
    stale = e.economy.mahjong.reversalPreview("p", 1);
  act("mahjong-discard", { game: g.id, version: 0, index: 13 });
  const input = {
    player: "p",
    limit: 1,
    confirmation: "REVERT MAHJONG p 1",
    expectedRounds: stale.rounds,
    expectedActive: stale.active,
  };
  assert.throws(() => e.tx(() => e.host("mahjong-revert", input)), /changed/);
});

test("new pricing charges500/50 and refunds the saved entry fee for new and pre-change hands without replaying refunds", (t) => {
  const f = fixture(t),
    { e, act } = f,
    before = e.player("p").balance;
  const g = f.start();
  assert.equal(g.cost, 500);
  assert.equal(g.entryFee, 500);
  assert.equal(e.player("p").balance, before - 500);
  f.save({
    ...pinfu(),
    id: g.id,
    entryFee: g.entryFee,
    cost: g.cost,
    wall: [8],
  });
  const body = { game: g.id, version: 0, index: 13 },
    ended = act("mahjong-discard", body, "new-price").mahjong;
  assert.equal(ended.cost, 550);
  assert.equal(ended.refund, 500);
  assert.match(act("mahjong-discard", body, "new-price").message, /500-credit/);
  assert.equal(e.player("p").balance, before - 50);
  const old = f.start();
  f.save({ ...pinfu(), id: old.id, wall: [8] });
  const legacyBefore = e.player("p").balance;
  const legacy = act("mahjong-discard", {
    game: old.id,
    version: 0,
    index: 13,
  }).mahjong;
  assert.equal(legacy.cost, 1050);
  assert.equal(legacy.refund, 1000);
  assert.equal(e.player("p").balance, legacyBefore - 50 + 1000);
  const explicit = f.start();
  f.save({ ...pinfu(), id: explicit.id, entryFee: 500, cost: 500, wall: [] });
  const settled = act("mahjong-end", { game: explicit.id, version: 0 });
  assert.equal(settled.mahjong.refund, 500);
  assert.match(settled.message, /500-credit/);
});
