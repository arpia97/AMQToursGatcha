import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import { HORSE_ROSTER } from "../public/horse-roster.js";
import {
  makeRaceField,
  decoratedHorse,
  horseStrength,
  raceMarkets,
  quoteHorseTicket,
  quoteHorseCart,
  drawRaceOrder,
  horseTicketWins,
  horseProgress,
  TICKET_TYPES,
  RACE_DURATION,
} from "../public/horse-rules.js";
import { createHorseUI, coveredHorseNumbers } from "../public/horse-ui.js";

function random(seed = 12345) {
  return (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * n);
  };
}
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = 1793174400000;
  const query = (s, ...a) => db.prepare(s).all(...a),
    tx = (fn) => {
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
  const e = new Engine(query, tx, () => now, random());
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
    note: "LOCAL TEST",
  });
  const act = (a, b, key = crypto.randomUUID(), player = "p") =>
    e.mutate(player + ":" + a, key, b, () => e.action(player, a, b));
  return { e, db, query, tx, act, advance: (n) => (now += n) };
}
const equalField = () =>
  Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    bracket: i < 4 ? i + 1 : 5 + Math.floor((i - 4) / 2),
    weight: 100,
  }));
const close = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test("163 original horse portraits are present, staff excluded, career records distinguish decorated and fictional runners", () => {
  assert.equal(HORSE_ROSTER.length, 163);
  assert.equal(new Set(HORSE_ROSTER.map((h) => h.id)).size, 163);
  assert(!HORSE_ROSTER.some((h) => h.name === "Aoi Kiryuin"));
  for (const h of HORSE_ROSTER) {
    const b = fs.readFileSync(new URL("../public/" + h.image, import.meta.url));
    assert.equal(b.subarray(1, 4).toString(), "PNG");
    assert.equal(b.readUInt32BE(16), 256);
    assert.equal(b.readUInt32BE(20), 256);
    assert(Number.isFinite(horseStrength(h)));
  }
  const gold = HORSE_ROSTER.find((h) => h.name === "Gold Ship"),
    urara = HORSE_ROSTER.find((h) => h.name === "Haru Urara"),
    rickey = HORSE_ROSTER.find((h) => h.name === "Copano Rickey");
  assert.equal(gold.g1Wins, 6);
  assert.equal(rickey.g1Wins, 11);
  assert(horseStrength(gold) > 4 * horseStrength(urara));
  for (const h of HORSE_ROSTER.filter((h) => h.fictional))
    assert.equal(horseStrength(h), 1);
});
test("fields use six decorated and six other unique runners with shuffled numbers, correct eight brackets and persisted form strength", () => {
  const rng = random(),
    seen = new Set();
  for (let j = 0; j < 200; j++) {
    const f = makeRaceField(rng);
    assert.equal(new Set(f.map((h) => h.id)).size, 12);
    assert.equal(f.filter(decoratedHorse).length, 6);
    assert.deepEqual(
      f.map((h) => h.bracket),
      [1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8],
    );
    for (const h of f) {
      seen.add(h.id);
      assert(h.form >= 70 && h.form <= 130);
      assert.equal(h.weight, Math.round(horseStrength(h) * h.form * 100));
    }
  }
  assert.equal(seen.size, 163);
});
test("exact top-three enumeration normalizes every market and gives correct equal-strength probabilities and JRA-style returns", () => {
  const f = equalField(),
    m = raceMarkets(f);
  for (const [kind, sum] of [
    ["win", 1],
    ["place", 3],
    ["bracket", 1],
    ["quinella", 1],
    ["wide", 3],
    ["exacta", 1],
    ["trio", 1],
    ["trifecta", 1],
  ])
    close(
      Object.values(m[kind]).reduce((a, b) => a + b, 0),
      sum,
    );
  close(m.win[1], 1 / 12);
  close(m.place[1], 3 / 12);
  close(m.quinella["1-2"], 1 / 66);
  close(m.exacta["1-2"], 1 / 132);
  close(m.wide["1-2"], 3 / 66);
  close(m.trio["1-2-3"], 1 / 220);
  close(m.trifecta["1-2-3"], 1 / 1320);
  close(m.bracket["5-5"], 1 / 66);
  assert.equal(
    quoteHorseTicket(f, { kind: "win", picks: [1], stake: 100 }, m).oddsTenths,
    96,
  );
  assert.equal(
    quoteHorseTicket(f, { kind: "place", picks: [1], stake: 100 }, m)
      .potentialPayout,
    320,
  );
});
test("higher strengths raise win and top-three probabilities, lower payouts, and are sampled consistently without replacement", () => {
  const f = equalField();
  f[0].weight = 800;
  const m = raceMarkets(f);
  assert(m.win[1] > m.win[2]);
  assert(m.place[1] > m.place[2]);
  assert.equal(m.win[1], 8 / 19);
  const a = quoteHorseTicket(f, { kind: "win", picks: [1], stake: 100 }, m),
    b = quoteHorseTicket(f, { kind: "win", picks: [2], stake: 100 }, m);
  assert(a.oddsTenths < b.oddsTenths);
  const rng = random(),
    counts = Array(12).fill(0);
  for (let i = 0; i < 25000; i++) {
    const order = drawRaceOrder(f, rng);
    assert.equal(new Set(order).size, 12);
    counts[order[0] - 1]++;
  }
  assert(Math.abs(counts[0] / 25000 - m.win[1]) < 0.015);
  assert(counts[0] > counts[1] * 6);
});
test("all eight ticket conditions distinguish order, top-three combinations and same-bracket pairs", () => {
  const f = equalField(),
    order = [5, 6, 3, 1, 2, 4, 7, 8, 9, 10, 11, 12];
  for (const [kind, picks, won] of [
    ["win", [5], true],
    ["win", [6], false],
    ["place", [3], true],
    ["place", [1], false],
    ["bracket", [5, 5], true],
    ["bracket", [5, 3], false],
    ["quinella", [6, 5], true],
    ["exacta", [6, 5], false],
    ["exacta", [5, 6], true],
    ["wide", [3, 6], true],
    ["wide", [5, 1], false],
    ["trio", [3, 6, 5], true],
    ["trifecta", [5, 6, 3], true],
    ["trifecta", [5, 3, 6], false],
  ])
    assert.equal(horseTicketWins({ kind, picks }, order, f), won, kind + picks);
});
test("ticket validation rejects impossible pairs, foreign runners, malformed stakes, tampered odds and excess cart sizes/stakes", () => {
  const f = equalField(),
    q = quoteHorseTicket(f, { kind: "win", picks: [1], stake: 100 });
  for (const t of [
    { kind: "bad", picks: [1], stake: 100 },
    { kind: "win", picks: [99], stake: 100 },
    { kind: "exacta", picks: [1, 1], stake: 100 },
    { kind: "bracket", picks: [1, 1], stake: 100 },
    { kind: "trio", picks: [1, 2], stake: 100 },
    { kind: "win", picks: [1], stake: 50 },
    { kind: "win", picks: [1], stake: 100.5 },
    { kind: "win", picks: [1], stake: 100100 },
  ])
    assert.throws(() => quoteHorseTicket(f, t));
  assert.throws(
    () => quoteHorseCart(f, [{ ...q, oddsTenths: q.oddsTenths + 1 }]),
    /odds changed/,
  );
  assert.throws(() => quoteHorseCart(f, []), /between/);
  assert.throws(() => quoteHorseCart(f, Array(21).fill(q)), /between/);
  assert.throws(
    () =>
      quoteHorseCart(f, [
        { ...q, stake: 100000 },
        { ...q, stake: 100000 },
      ]),
    /total stake/,
  );
});
test("preparation is free, durable, private and idempotent; it cannot reroll a pending field", (t) => {
  const { e, act, query, tx } = fixture(t),
    before = e.player("p").balance;
  const body = { previousRace: null },
    g = act("horse-prepare", body, "prepare").horseRace;
  assert.equal(g.status, "betting");
  assert.equal(g.field.length, 12);
  assert.equal(e.player("p").balance, before);
  assert.deepEqual(act("horse-prepare", body, "prepare").horseRace, g);
  assert.throws(
    () => act("horse-prepare", { previousRace: g.id }),
    /current race/,
  );
  const restart = new Engine(query, tx);
  assert.deepEqual(restart.gameState("p").horseRace, g);
  assert.equal(e.gameState("q").horseRace, null);
  assert.equal(e.state(null).horseRace, null);
});
test("tickets charge once, close betting, hold payouts until server-clock finish and settle once after reconnect", (t) => {
  const { e, act, advance, query, tx } = fixture(t),
    before = e.player("p").balance,
    earned = e.player("p").earned;
  const g = act("horse-prepare", { previousRace: null }).horseRace;
  e.rand = () => 0;
  const q = quoteHorseTicket(g.field, { kind: "win", picks: [1], stake: 100 });
  const body = { race: g.id, version: g.version, tickets: [q] };
  const run = act("horse-start", body, "buy").horseRace;
  assert.equal(e.player("p").balance, before - 100);
  assert.equal(run.payout, undefined);
  assert.equal(run.ticketResults, undefined);
  assert.equal(run.status, "running");
  assert.equal(run.order[0], 1);
  act("horse-start", body, "buy");
  assert.equal(e.player("p").balance, before - 100);
  assert.throws(() => act("horse-start", body), /betting has closed/);
  advance(run.endsAt - e.now() - 1);
  assert.equal(
    e.tx(() => e.economy.horse.settleDue("p")),
    false,
  );
  advance(1);
  const restarted = new Engine(query, tx, () => e.now(), random());
  assert.equal(
    restarted.tx(() => restarted.economy.horse.settleDue("p")),
    true,
  );
  const complete = restarted.gameState("p").horseRace;
  assert.equal(complete.payout, q.potentialPayout);
  assert.equal(complete.status, "complete");
  assert.equal(complete.tickets[0].won, true);
  assert.equal(restarted.player("p").balance, before - 100 + q.potentialPayout);
  assert.equal(restarted.player("p").earned, earned);
  assert.equal(
    restarted.tx(() => restarted.economy.horse.settleDue("p")),
    false,
  );
  assert.equal(
    e.one("SELECT net FROM gambling_rounds WHERE id=?", g.id).net,
    q.potentialPayout - 100,
  );
  assert(act("horse-prepare", { previousRace: g.id }).horseRace.id > g.id);
});
test("invalid, stale, unaffordable and foreign purchases cannot debit or change the saved race", (t) => {
  const { e, act } = fixture(t),
    g = act("horse-prepare", { previousRace: null }).horseRace;
  const q = quoteHorseTicket(g.field, { kind: "win", picks: [1], stake: 100 });
  const body = { race: g.id, version: 0, tickets: [q] },
    before = e.player("p").balance;
  assert.throws(() => act("horse-start", { ...body, version: 1 }), /changed/);
  assert.throws(() => act("horse-start", body, undefined, "q"), /changed/);
  assert.throws(
    () =>
      act("horse-start", { ...body, tickets: [{ ...q, oddsTenths: 100000 }] }),
    /odds changed/,
  );
  assert.equal(e.player("p").balance, before);
  assert.deepEqual(e.gameState("p").horseRace, g);
  e.run("UPDATE players SET balance=99 WHERE id='p'");
  assert.throws(() => act("horse-start", body), /Not enough/);
  assert.equal(e.player("p").balance, 99);
  assert.deepEqual(e.gameState("p").horseRace, g);
});
test("race state follows canonical identity migration and reset scopes, while old full race payloads are bounded", (t) => {
  const { e, act, advance } = fixture(t);
  let previous = null;
  e.rand = () => 0;
  for (let i = 0; i < 52; i++) {
    const g = act("horse-prepare", { previousRace: previous }).horseRace;
    const q = quoteHorseTicket(g.field, {
      kind: "win",
      picks: [12],
      stake: 100,
    });
    const run = act("horse-start", {
      race: g.id,
      version: 0,
      tickets: [q],
    }).horseRace;
    advance(run.endsAt - e.now());
    e.tx(() => e.economy.horse.settleDue("p"));
    previous = g.id;
  }
  assert.equal(
    e.one(
      "SELECT count(*) n FROM gambling_rounds WHERE game='horse-racing' AND outcome!='{}'",
    ).n,
    50,
  );
  assert.equal(
    e.one("SELECT count(*) n FROM gambling_rounds WHERE game='horse-racing'").n,
    52,
  );
  e.tx(() => new AliasSync(e).renamePlayer("p", "renamed"));
  assert.equal(e.gameState("renamed").horseRace.id, previous);
  assert.equal(e.gameState("q").horseRace, null);
  e.tx(() =>
    e.host("reset-player", {
      player: "renamed",
      confirmation: "RESET PLAYER renamed",
    }),
  );
  assert.equal(e.gameState("renamed").horseRace, null);
  act("horse-prepare", { previousRace: null }, undefined, "q");
  e.tx(() =>
    e.host("reset-all", {
      deleteRegistry: false,
      confirmation: "RESET ALL GAME DATA",
    }),
  );
  assert.equal(e.gameState("q").horseRace, null);
});
test("animation progresses monotonically, permits early position changes and crosses the finish in the authoritative order", () => {
  const race = {
    order: [5, 2, 1, 3, 4, 6, 7, 8, 9, 10, 11, 12],
    animationSeed: 982634,
  };
  for (const number of race.order) {
    let last = 0;
    for (let time = 0; time <= RACE_DURATION; time += 25) {
      const p = horseProgress(race, number, time);
      assert(p >= last);
      assert(p >= 0 && p <= 1);
      last = p;
    }
    assert.equal(last, 1);
  }
  const finishing = race.order
    .map((n) => ({
      n,
      t: Array.from({ length: RACE_DURATION / 10 + 1 }, (_, i) => i * 10).find(
        (t) => horseProgress(race, n, t) >= 1,
      ),
    }))
    .sort((a, b) => a.t - b.t);
  assert.deepEqual(
    finishing.map((x) => x.n),
    race.order,
  );
});
test("English ticket UI quotes all types, preserves its cart across renders, removes tickets and clears it for another identity/race", () => {
  let state = {
    me: { id: "p", balance: 10000 },
    horseRace: {
      id: 1,
      version: 0,
      status: "betting",
      field: makeRaceField(random()),
    },
  };
  const ui = createHorseUI({
    getState: () => state,
    escape: (s) => String(s ?? "").replaceAll('"', "&quot;"),
    number: (n) => String(n),
    now: () => 0,
    onFinish: () => {},
  });
  let html = ui.render();
  assert.match(html, /ODDS LOCKED/);
  assert.match(html, /Place return/);
  assert(!html.includes("100 credits per unit"));
  assert(!html.includes("No tickets yet."));
  assert(!html.includes("Ticket purchase locks every selection."));
  assert(!html.includes("Returns shown for a 100-credit winning ticket"));
  const raceCard = html.slice(
    html.indexOf('<section class="race-runners"'),
    html.indexOf('<details class="mj-rules'),
  );
  assert(!raceCard.includes("✦"));
  for (const type of TICKET_TYPES) assert(html.includes(type.name));
  assert(!/[가-힣]/.test(html));
  ui.add({ kind: "win", pick0: "1", stake: "100" });
  ui.render();
  assert.equal(ui.purchase().tickets.length, 1);
  ui.change({ kind: "exacta", stake: "100" });
  ui.change({ kind: "exacta", pick0: "2", pick1: "3", stake: "100" });
  assert.match(ui.quote(), /RETURN IF WON/);
  ui.add({ kind: "exacta", pick0: "2", pick1: "3", stake: "100" });
  assert.equal(ui.purchase().tickets.length, 2);
  ui.remove(0);
  assert.equal(ui.purchase().tickets.length, 1);
  state = { ...state, me: { id: "q", balance: 10000 } };
  ui.render();
  assert.throws(() => ui.purchase(), /between/);
});

test("backed runners combine ordinary and bracket tickets without duplicates, including same-bracket pairs", () => {
  const field = equalField();
  assert.deepEqual(
    [...coveredHorseNumbers(field)].sort((a, b) => a - b),
    [],
  );
  assert.deepEqual(
    [
      ...coveredHorseNumbers(field, [
        { kind: "win", picks: [2] },
        { kind: "trio", picks: [2, 3, 4] },
        { kind: "bracket", picks: [5, 8] },
        { kind: "bracket", picks: [5, 5] },
      ]),
    ].sort((a, b) => a - b),
    [2, 3, 4, 5, 6, 11, 12],
  );
  assert.deepEqual(
    [...coveredHorseNumbers(field, [{ kind: "bracket", picks: [7, 7] }])],
    [9, 10],
  );
});

test("race highlights follow added/removed cart tickets and recover purchased picks after a fresh UI instance", () => {
  let state = {
    me: { id: "p", balance: 5000 },
    horseRace: {
      id: 1,
      version: 0,
      status: "betting",
      field: makeRaceField(random()),
    },
  };
  const options = {
    getState: () => state,
    escape: (s) => String(s ?? ""),
    number: String,
    now: () => 0,
    onFinish: () => {},
  };
  const backed = (html) =>
    [
      ...html.matchAll(
        /<div class="race-lane is-backed"[\s\S]*?data-runner="(\d+)"/g,
      ),
    ]
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  const ui = createHorseUI(options);
  assert.deepEqual(backed(ui.render()), []);
  ui.add({ kind: "win", pick0: "3", stake: "100" });
  assert.deepEqual(backed(ui.render()), [3]);
  ui.change({ kind: "bracket", stake: "100" });
  ui.add({ kind: "bracket", pick0: "7", pick1: "7", stake: "100" });
  assert.deepEqual(backed(ui.render()), [3, 9, 10]);
  const purchased = ui.purchase().tickets;
  ui.remove(0);
  assert.deepEqual(backed(ui.render()), [9, 10]);
  state = {
    ...state,
    horseRace: {
      ...state.horseRace,
      status: "running",
      version: 1,
      tickets: purchased,
    },
  };
  const reloaded = createHorseUI(options);
  assert.deepEqual(backed(reloaded.render()), [3, 9, 10]);
});
