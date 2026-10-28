import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { winnerTeams, winnerPredictionBody } from "../public/tour-winner.js";
import {
  predictionBody,
  predictionDraft,
  pickemBoard,
} from "../public/pickem-board.js";
import {
  settlementBody,
  settlementTable,
} from "../public/pickem-settlement.js";
import { winnerCreatePanel, winnerEditor } from "../public/tour-winner-ui.js";

const teams = ["Alpha", "Beta", "Gamma", "Delta"];
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = Date.UTC(2026, 9, 28);
  const sql = (s, ...a) => db.prepare(s).all(...a),
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
  const host = (a, b, key = crypto.randomUUID()) =>
    e.mutate("host:" + a, key, b, () => e.host(a, b));
  const act = (id, b, key = crypto.randomUUID()) =>
    e.mutate(id + ":predict", key, b, () => e.action(id, "predict", b));
  const create = (b = {}) => {
    const r = host("pickem-winner", { name: "Tour", teams, ...b });
    return e.pickemEvents.read(r.event).matches[0];
  };
  return {
    e,
    sql,
    tx,
    host,
    act,
    create,
    now: () => now,
    advance: (n) => (now += n),
  };
}
test("winner-only creation publishes one choice per tour with500 winner reward and ten-minute default, for2 through64 teams", (t) => {
  const f = fixture(t);
  for (const n of [2, 4, 6, 8, 64]) {
    const p = f.create({
      teams: Array.from({ length: n }, (_, i) => "Team " + i),
    });
    assert.equal(p.mode, "tour");
    assert.equal(p.ends, f.now() + 600000);
    assert.equal(p.winner_reward, 500);
    assert.equal(p.score_reward, 0);
    assert.equal(JSON.parse(p.teams).length, n);
    const event = f.e.pickemEvents.read(p.event_id);
    assert.equal(event.format, "winner");
    assert.equal(event.matches.length, 1);
  }
  assert.throws(() => f.create({ teams: ["A", "a"] }), /different/);
  assert.throws(() => f.create({ teams: ["Only"] }), /between/);
  assert.throws(() => f.create({ teams: ["A", null, "B"] }), /valid/);
  assert.deepEqual(winnerTeams(" Alpha \n\n Beta \r\nGamma"), [
    "Alpha",
    "Beta",
    "Gamma",
  ]);
});
test("winner prediction accepts any listed team without scores, remains editable and private, and closes at deadline", (t) => {
  const f = fixture(t),
    p = f.create();
  const b = winnerPredictionBody({
    pickem: String(p.id),
    winner: "Delta",
    expectedTeams: p.teams,
  });
  f.act("p", b, "vote");
  f.act("p", b, "vote");
  assert.equal(f.e.one("SELECT count(*) AS n FROM predictions").n, 1);
  assert.equal(
    f.e.pickemEvents.detail(p.event_id, "p").matches[0].prediction,
    "Delta",
  );
  assert.equal(
    f.e.pickemEvents.detail(p.event_id, "q").matches[0].prediction,
    null,
  );
  f.act("p", { ...b, winner: "Beta" });
  assert.equal(f.e.one("SELECT winner FROM predictions").winner, "Beta");
  assert.throws(() => f.act("q", { ...b, winner: "Foreign" }), /teams/);
  assert.throws(() => f.act("q", { ...b, expectedTeams: "[]" }), /changed/);
  f.advance(600000);
  assert.throws(() => f.act("q", b), /closed/);
});
test("tour settlement pays only the correct winner once and updates winner accuracy without score rewards", (t) => {
  const f = fixture(t),
    p = f.create({ winnerReward: 750 });
  f.act("p", {
    pickem: p.id,
    winner: "Delta",
    expectedTeams: p.teams,
    scoreA: 0,
    scoreB: 0,
  });
  f.act("q", { pickem: p.id, winner: "Alpha", expectedTeams: p.teams });
  const b = { pickem: p.id, winner: "Delta", expectedTeams: p.teams };
  assert.throws(() => f.host("settle", b), /close/);
  f.advance(600000);
  assert.throws(
    () => f.host("settle", { ...b, winner: "No such team" }),
    /winning team/,
  );
  const before = f.e.player("p").balance;
  const r = f.host("settle", b, "winner-once");
  assert.deepEqual(f.host("settle", b, "winner-once"), r);
  assert.equal(f.e.player("p").balance, before + 750);
  assert.equal(f.e.player("p").earned, 750);
  assert.equal(f.e.player("q").balance, 0);
  assert.deepEqual(
    { ...f.e.profile("p").stats.pickems },
    { total: 1, correct: 1 },
  );
  assert.deepEqual(
    { ...f.e.profile("q").stats.pickems },
    { total: 1, correct: 0 },
  );
  assert.throws(() => f.host("settle", b), /already settled/);
  const after = f.e.pickemEvents.match(p.id);
  assert.equal(after.result_winner, "Delta");
  assert.equal(after.result_a, null);
  assert.equal(after.result_b, null);
});
test("winner roster edits require reviewed snapshots and clearing consent, preserve picks for reward/name edits and protect paid results", (t) => {
  const f = fixture(t),
    p = f.create();
  f.act("p", { pickem: p.id, winner: "Delta", expectedTeams: p.teams });
  const current = () => f.e.pickemEvents.match(p.id),
    edit = (extra) => ({
      pickem: p.id,
      expected: current(),
      name: "Renamed",
      teams,
      winnerReward: 500,
      ends: p.ends,
      ...extra,
    });
  f.host("pickem-winner-edit", edit({ winnerReward: 900 }));
  assert.equal(f.e.one("SELECT count(*) AS n FROM predictions").n, 1);
  const reviewed = edit({ teams: ["A", "B"] });
  assert.throws(
    () => f.host("pickem-winner-edit", reviewed),
    /clears existing/,
  );
  f.host("pickem-winner-edit", { ...reviewed, clearPredictions: true });
  assert.equal(f.e.one("SELECT count(*) AS n FROM predictions").n, 0);
  assert.throws(
    () => f.act("p", { pickem: p.id, winner: "Delta", expectedTeams: p.teams }),
    /changed/,
  );
  assert.throws(() => f.host("pickem-winner-edit", reviewed), /changed/);
  f.advance(600000);
  const c = current();
  f.host("settle", { pickem: p.id, winner: "A", expectedTeams: c.teams });
  assert.throws(
    () => f.host("pickem-winner-edit", edit({ teams: ["A", "B"] })),
    /Settled/,
  );
  assert.throws(
    () =>
      f.host("pickem-delete", {
        pickem: p.id,
        expected: current(),
        confirmation: "DELETE PICKEM " + p.id,
      }),
    /Settled/,
  );
});
test("deleting an unsettled winner pickem removes its event and picks without changing credits; restart retains migration and data", (t) => {
  const f = fixture(t),
    p = f.create();
  f.act("p", { pickem: p.id, winner: "Delta", expectedTeams: p.teams });
  const restarted = new Engine(f.sql, f.tx, f.now);
  assert.equal(restarted.pickemEvents.match(p.id).mode, "tour");
  f.host("pickem-delete", {
    pickem: p.id,
    expected: f.e.pickemEvents.match(p.id),
    confirmation: "DELETE PICKEM " + p.id,
  });
  assert.equal(f.e.one("SELECT count(*) AS n FROM pickem_events").n, 0);
  assert.equal(f.e.one("SELECT count(*) AS n FROM predictions").n, 0);
  assert.equal(f.e.player("p").balance, 0);
});
test("public and host winner forms contain no score controls, retain team-keyed drafts, and render closed/settled winners", (t) => {
  const f = fixture(t),
    p = f.create(),
    esc = (s) => String(s).replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const b = predictionBody({
    mode: "tour",
    pickem: p.id,
    winner: "Delta",
    expectedTeams: p.teams,
  });
  assert.deepEqual(b, {
    pickem: p.id,
    winner: "Delta",
    expectedTeams: p.teams,
  });
  const d = predictionDraft(p);
  d.winner = "Delta";
  assert.equal(predictionDraft(p, d).winner, "Delta");
  assert.equal(predictionDraft({ ...p, teams: '["A","B"]' }, d).winner, "");
  const detail = f.e.pickemEvents.detail(p.event_id, "p"),
    html = pickemBoard(f.e.pickemEvents.page().tours, detail, {
      escape: esc,
      number: String,
      now: f.now(),
      drafts: { [p.id]: d },
      signedIn: true,
    });
  assert.match(html, /Who will win/);
  assert.match(html, /value="Delta" selected/);
  assert.doesNotMatch(html, /name="score[AB]"|Two-game result/);
  assert.doesNotMatch(winnerCreatePanel(), /name="format"|name="scoreReward"/);
  assert.doesNotMatch(
    winnerEditor(f.e.pickemEvents.match(p.id), esc),
    /scoreReward/,
  );
  f.advance(600000);
  const settlement = settlementBody(p, { winner: "Delta" }, f.now());
  assert.equal(settlement.winner, "Delta");
  const table = settlementTable([p], esc, {}, f.now());
  assert.match(table, /Confirm winner/);
  assert.doesNotMatch(table, /scoreA|scoreB/);
  f.host("settle", settlement);
  assert.match(settlementTable([f.e.pickemEvents.match(p.id)], esc), /Delta/);
});
