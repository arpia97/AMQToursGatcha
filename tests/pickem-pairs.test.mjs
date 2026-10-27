import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  roundRobin,
  pickemRounds,
  pickemOutcome,
} from "../public/pickem-formats.js";
import {
  pickemBoard,
  predictionBody,
  predictionDraft,
  tourSummaries,
} from "../public/pickem-board.js";
const teams = ["A", "B", "C", "D"];
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = Date.UTC(2026, 9, 28);
  const sql = (q, ...a) => db.prepare(q).all(...a),
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
  const e = new Engine(sql, tx, () => now);
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  return {
    e,
    sql,
    tx,
    now: () => now,
    advance: (ms) => (now += ms),
    host: (a, b) => tx(() => e.host(a, b)),
    act: (a, b, key = crypto.randomUUID(), player = "p") =>
      e.mutate(player + ":" + a, key, b, () => e.action(player, a, b)),
  };
}
function legacy(f) {
  const event = f.host("pickem-event", {
    name: "Legacy",
    format: "double-4",
    teams,
  }).event;
  f.e.run("DELETE FROM pickems WHERE event_id=?", event);
  const rounds = roundRobin("double-4", teams);
  for (let i = 0; i < rounds.length; i++)
    for (const [a, b] of rounds[i])
      f.e.run(
        "INSERT INTO pickems(title,tour,team_a,team_b,ends,winner_reward,score_reward,event_id,round) VALUES(?,?,?,?,?,?,?,?,?)",
        "Legacy · Round " + (i + 1) + " · " + a + " vs " + b,
        "Legacy",
        a,
        b,
        f.now() + 600000 + i * 1000,
        500,
        500,
        event,
        i + 1,
      );
  return event;
}
test("double round robin publishes six unique pair predictions covering twelve physical games", (t) => {
  const f = fixture(t);
  assert.equal(roundRobin("double-4", teams).flat().length, 12);
  assert.equal(pickemRounds("double-4", teams).flat().length, 6);
  const id = f.host("pickem-event", {
    name: "Combined",
    format: "double-4",
    teams,
  }).event;
  const rows = f.e.pickemEvents.read(id).matches;
  assert.equal(rows.length, 6);
  assert.ok(rows.every((p) => p.mode === "pair"));
  assert.equal(
    new Set(rows.map((p) => [p.team_a, p.team_b].sort().join("|"))).size,
    6,
  );
  assert.equal(f.e.pickemEvents.page().tours[0].pairs, 6);
  const restarted = new Engine(f.sql, f.tx, f.now);
  assert.equal(restarted.pickemEvents.read(id).matches[0].mode, "pair");
});
test("all three two-game outcomes can be predicted and settled once, including split rewards and profile accuracy", (t) => {
  for (const result of ["2:0", "1:1", "0:2"]) {
    const f = fixture(t),
      id = f.host("pickem-event", {
        name: result,
        format: "double-4",
        teams,
      }).event,
      p = f.e.pickemEvents.read(id).matches[0];
    const body = predictionBody({ pickem: String(p.id), result });
    assert.equal(
      body.winner,
      result === "1:1" ? "draw" : result === "2:0" ? "a" : "b",
    );
    f.act("predict", body, "vote");
    f.act("predict", body, "vote");
    f.act(
      "predict",
      predictionBody({
        pickem: String(p.id),
        result: result === "1:1" ? "2:0" : "1:1",
      }),
      "wrong",
      "q",
    );
    f.advance(600001);
    const settlement = {
      pickem: p.id,
      scoreA: body.scoreA,
      scoreB: body.scoreB,
    };
    const settle = () =>
      f.e.mutate("host:settle", "settle", settlement, () =>
        f.e.host("settle", settlement),
      );
    settle();
    settle();
    assert.equal(f.e.player("p").balance, 1500);
    assert.equal(f.e.player("p").earned, 1500);
    assert.equal(f.e.player("q").balance, 0);
    assert.deepEqual(
      { ...f.e.profile("p").stats.pickems },
      { total: 1, correct: 1 },
    );
    assert.deepEqual(
      { ...f.e.profile("q").stats.pickems },
      { total: 1, correct: 0 },
    );
    assert.throws(() => f.host("settle", settlement), /already settled/);
  }
});
test("pair predictions/results reject other score totals and generic or Swiss matches still reject draws", (t) => {
  const f = fixture(t);
  const id = f.host("pickem-event", {
      name: "Combined",
      format: "double-4",
      teams,
    }).event,
    p = f.e.pickemEvents.read(id).matches[0];
  for (const [scoreA, scoreB, winner] of [
    [3, 0, "a"],
    [0, 0, "draw"],
    [2, 2, "draw"],
    [1, 1, "a"],
  ])
    assert.throws(() =>
      f.act("predict", { pickem: p.id, scoreA, scoreB, winner }),
    );
  f.advance(600001);
  assert.throws(
    () => f.host("settle", { pickem: p.id, scoreA: 3, scoreB: 0 }),
    /2:0/,
  );
  assert.equal(f.e.pickemEvents.match(p.id).settled, 0);
  f.host("pickem", { title: "Normal", tour: "Normal", teamA: "A", teamB: "B" });
  const normal = f.e.one("SELECT id FROM pickems WHERE title='Normal'").id;
  assert.throws(
    () =>
      f.act("predict", {
        pickem: normal,
        winner: "draw",
        scoreA: 1,
        scoreB: 1,
      }),
    /winning team/,
  );
  assert.throws(() => pickemOutcome(1, 1, "match"), /winning team/);
});
test("reviewed legacy conversion keeps first-leg IDs/deadlines, requires clearing votes, rejects stale reviews and is idempotent", (t) => {
  const f = fixture(t),
    id = legacy(f);
  let event = f.e.pickemEvents.read(id);
  const ids = event.matches.slice(0, 6).map((p) => p.id),
    before = f.e.player("p").balance;
  f.act("predict", { pickem: ids[0], winner: "a", scoreA: 3, scoreB: 1 });
  const convert = () => ({
    event: id,
    expectedMatches: event.matches,
    confirmation: "COMBINE TOUR " + id,
  });
  assert.throws(() => f.host("pickem-combine", convert()), /changed/);
  event = f.e.pickemEvents.read(id);
  assert.throws(
    () => f.host("pickem-combine", convert()),
    /clearing existing predictions/,
  );
  const body = { ...convert(), clearPredictions: true },
    run = () =>
      f.e.mutate("host:combine", "combine", body, () =>
        f.e.host("pickem-combine", body),
      );
  run();
  run();
  const after = f.e.pickemEvents.read(id);
  assert.deepEqual(
    after.matches.map((p) => p.id),
    ids,
  );
  assert.ok(after.matches.every((p) => p.mode === "pair"));
  assert.deepEqual(
    after.matches.map((p) => p.ends),
    event.matches.slice(0, 6).map((p) => p.ends),
  );
  assert.equal(f.e.one("SELECT count(*) n FROM predictions").n, 0);
  assert.equal(f.e.player("p").balance, before);
  f.host("pickem-combine", body);
  assert.equal(f.e.pickemEvents.read(id).matches.length, 6);
});
test("conversion refuses paid or incomplete/mismatched legs without deleting votes or changing balances", (t) => {
  const f = fixture(t),
    id = legacy(f);
  let event = f.e.pickemEvents.read(id);
  const body = () => ({
    event: id,
    expectedMatches: event.matches,
    confirmation: "COMBINE TOUR " + id,
  });
  f.e.run(
    "UPDATE pickems SET winner_reward=999 WHERE id=?",
    event.matches.at(-1).id,
  );
  event = f.e.pickemEvents.read(id);
  assert.throws(() => f.host("pickem-combine", body()), /rewards equal/);
  assert.equal(f.e.pickemEvents.read(id).matches.length, 12);
  f.e.run("UPDATE pickems SET winner_reward=500 WHERE event_id=?", id);
  f.advance(700000);
  event = f.e.pickemEvents.read(id);
  f.host("settle", { pickem: event.matches[0].id, scoreA: 3, scoreB: 1 });
  event = f.e.pickemEvents.read(id);
  assert.throws(
    () => f.host("pickem-combine", body()),
    /rewards have been paid/,
  );
  assert.equal(f.e.pickemEvents.read(id).matches.length, 12);
  const incomplete = fixture(t),
    other = legacy(incomplete);
  let missing = incomplete.e.pickemEvents.read(other);
  incomplete.e.run("DELETE FROM pickems WHERE id=?", missing.matches.at(-1).id);
  missing = incomplete.e.pickemEvents.read(other);
  assert.throws(
    () =>
      incomplete.host("pickem-combine", {
        event: other,
        expectedMatches: missing.matches,
        confirmation: "COMBINE TOUR " + other,
      }),
    /original twelve matches/,
  );
  assert.equal(incomplete.e.pickemEvents.read(other).matches.length, 11);
});
test("combined table exposes only 2:0/1:1/0:2 choices once per pair, restores split drafts and clears old-mode drafts", () => {
  const rows = pickemRounds("double-4", teams).flatMap((pairs, i) =>
    pairs.map(([a, b], j) => ({
      id: i * 2 + j + 1,
      event_id: 1,
      round: i + 1,
      mode: "pair",
      tour: "Tour",
      team_a: a,
      team_b: b,
      ends: 10000,
      winner_reward: 500,
      score_reward: 500,
      settled: 0,
    })),
  );
  const summaries = tourSummaries(rows, 0),
    drafts = { 1: { ...predictionDraft(rows[0]), result: "1:1" } };
  const html = pickemBoard(
    summaries,
    { key: 1, matches: rows, byes: [] },
    { escape: String, number: String, now: 0, drafts },
  );
  assert.equal((html.match(/name="result"/g) || []).length, 6);
  assert.doesNotMatch(html, /name="winner"|name="scoreA"/);
  for (const result of ["2:0", "1:1", "0:2"])
    assert.match(html, new RegExp('value="' + result + '"'));
  assert.match(html, /1500 for the correct two-game result/);
  assert.match(html, /Two-game result/);
  assert.match(html, /value="1:1" selected/);
  const previous = {
    ...predictionDraft({ ...rows[0], mode: "match" }),
    winner: "a",
    scoreA: "3",
    scoreB: "1",
  };
  assert.equal(predictionDraft(rows[0], previous).result, "");
  assert.throws(() => predictionBody({ pickem: "1", result: "3:0" }), /2:0/);
});
