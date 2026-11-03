import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { pickemVoteSummary, pickemVoteChart } from "../public/pickem-votes.js";
import { pickemBoard } from "../public/pickem-board.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = 1000000000;
  const tx = (fn) => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    tx,
    () => now,
  );
  e.host("players", {
    players: Array.from({ length: 5 }, (_, i) => ({
      id: "private-player-" + i,
      name: "Player " + i,
    })),
  });
  const host = (a, b) => e.tx(() => e.host(a, b));
  const vote = (i, p, winner, extra = {}) =>
    e.tx(() =>
      e.action("private-player-" + i, "predict", {
        pickem: p.id,
        winner,
        expectedTeams: p.teams,
        ...extra,
      }),
    );
  const create = (name = "Tour") => {
    const { event } = host("pickem-winner", {
      name,
      teams: ["Alpha", "Beta", "Gamma", "Delta"],
    });
    return e.pickemEvents.read(event).matches[0];
  };
  return {
    e,
    host,
    vote,
    create,
    advance: (n) => {
      now += n;
    },
  };
}
test("team totals include zero-vote teams, update instead of duplicating voters, stay scoped and expose no voter identities", (t) => {
  const f = fixture(t),
    p = f.create(),
    other = f.create("Separate Tour");
  assert.deepEqual(f.e.pickemEvents.detail(p.event_id).matches[0].voteSummary, {
    total: 0,
    choices: ["Alpha", "Beta", "Gamma", "Delta"].map((team) => ({
      key: team,
      team,
      votes: 0,
    })),
  });
  f.vote(0, p, "Alpha");
  f.vote(1, p, "Alpha");
  f.vote(2, p, "Beta");
  f.vote(3, other, "Delta");
  let detail = f.e.pickemEvents.detail(p.event_id);
  assert.equal(detail.matches[0].prediction, null);
  assert.deepEqual(
    detail.matches[0].voteSummary.choices.map((c) => c.votes),
    [2, 1, 0, 0],
  );
  assert.equal(detail.matches[0].voteSummary.total, 3);
  assert.equal(
    f.e.pickemEvents.page().tours.find((t) => t.key === p.event_id).voters,
    3,
  );
  assert.doesNotMatch(JSON.stringify(detail), /private-player/);
  f.vote(0, p, "Gamma");
  f.vote(0, p, "Gamma");
  detail = f.e.pickemEvents.detail(p.event_id, "private-player-0");
  assert.equal(detail.matches[0].prediction, "Gamma");
  assert.deepEqual(
    detail.matches[0].voteSummary.choices.map((c) => c.votes),
    [1, 1, 1, 0],
  );
  assert.equal(detail.matches[0].voteSummary.total, 3);
  f.advance(900000);
  assert.throws(() => f.vote(4, p, "Alpha"), /closed/);
  f.host("settle", { pickem: p.id, winner: "Gamma", expectedTeams: p.teams });
  assert.equal(
    f.e.pickemEvents.detail(p.event_id).matches[0].voteSummary.total,
    3,
  );
  const restarted = new Engine(f.e.db, f.e.transaction, f.e.now);
  assert.equal(
    restarted.pickemEvents.detail(p.event_id).matches[0].voteSummary.total,
    3,
  );
});
test("older combined matchups aggregate draw and both teams independently, with standalone matches scoped by negative keys", (t) => {
  const f = fixture(t),
    { event } = f.host("pickem-event", {
      name: "Legacy",
      format: "double-4",
      teams: ["Alpha", "Beta", "Gamma", "Delta"],
    });
  const matches = f.e.pickemEvents.read(event).matches,
    p = matches[0];
  f.vote(0, p, "a", { scoreA: 2, scoreB: 0 });
  f.vote(1, p, "draw", { scoreA: 1, scoreB: 1 });
  f.vote(2, p, "b", { scoreA: 0, scoreB: 2 });
  f.vote(3, matches[1], "a", { scoreA: 2, scoreB: 0 });
  const detail = f.e.pickemEvents.detail(event);
  assert.deepEqual(detail.matches[0].voteSummary, {
    total: 3,
    choices: [
      { key: "a", team: p.team_a, votes: 1 },
      { key: "b", team: p.team_b, votes: 1 },
      { key: "draw", team: "Draw (1:1)", votes: 1 },
    ],
  });
  assert.equal(detail.matches[1].voteSummary.total, 1);
  assert.equal(detail.matches[2].voteSummary.total, 0);
  f.host("pickem", {
    title: "Single",
    tour: "Single",
    teamA: "One",
    teamB: "Two",
  });
  const single = f.e.one("SELECT * FROM pickems WHERE event_id IS NULL");
  f.vote(4, single, "b", { scoreA: 1, scoreB: 2 });
  assert.deepEqual(
    f.e.pickemEvents
      .detail(-single.id)
      .matches[0].voteSummary.choices.map((c) => c.votes),
    [0, 1],
  );
});
test("clearing picks after a reviewed team edit immediately resets the graph and summary voter total", (t) => {
  const f = fixture(t),
    p = f.create();
  f.vote(0, p, "Alpha");
  f.host("pickem-winner-edit", {
    pickem: p.id,
    expected: f.e.pickemEvents.match(p.id),
    name: "Updated",
    teams: ["New A", "New B"],
    ends: p.ends,
    winnerReward: 500,
    clearPredictions: true,
  });
  assert.equal(f.e.pickemEvents.page().tours[0].voters, 0);
  const summary = f.e.pickemEvents.detail(p.event_id).matches[0].voteSummary;
  assert.equal(summary.total, 0);
  assert.deepEqual(
    summary.choices.map((c) => c.team),
    ["New A", "New B"],
  );
});
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
test("vote chart shows counts, proportions and accessible labels, escapes names and handles zero votes", () => {
  const p = {
    mode: "tour",
    teams: JSON.stringify(["Alpha <script>", 'Beta "Quoted"']),
  };
  p.voteSummary = pickemVoteSummary(p, [
    { winner: "Alpha <script>", votes: 3 },
    { winner: 'Beta "Quoted"', votes: 1 },
  ]);
  const html = pickemVoteChart(p, { escape, number: String });
  assert.match(html, /4 voters/);
  assert.match(html, /3 votes · 75%/);
  assert.match(html, /1 vote · 25%/);
  assert.match(html, /<progress max="4" value="3"/);
  assert.match(html, /aria-valuetext=/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;Quoted&quot;/);
  const zero = pickemVoteChart(
    { ...p, voteSummary: pickemVoteSummary(p) },
    { escape, number: String },
  );
  assert.match(zero, /No votes yet/);
  assert.match(zero, /0 voters/);
  assert.match(zero, /max="1" value="0"/);
  assert.doesNotMatch(zero, /NaN|Infinity/);
});
test("tour cards show total voters when collapsed and the chart for open, locked, settled and anonymous views", (t) => {
  const f = fixture(t),
    p = f.create();
  f.vote(0, p, "Alpha");
  const render = (detail) =>
    pickemBoard(f.e.pickemEvents.page().tours, detail, {
      escape,
      number: String,
      now: f.e.now(),
      signedIn: false,
    });
  assert.match(render(null), /1 voter/);
  assert.doesNotMatch(render(null), /pickem-vote-chart/);
  assert.match(
    render(f.e.pickemEvents.detail(p.event_id)),
    /Vote Distribution/,
  );
  f.advance(900000);
  assert.match(
    render(f.e.pickemEvents.detail(p.event_id)),
    /Vote Distribution/,
  );
  f.host("settle", { pickem: p.id, winner: "Alpha", expectedTeams: p.teams });
  assert.match(render(f.e.pickemEvents.detail(p.event_id)), /1 vote · 100%/);
});
