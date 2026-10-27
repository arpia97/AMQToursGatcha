import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  roundRobin,
  swissRound,
  validateTeams,
} from "../public/pickem-formats.js";
import { participationNames } from "../public/participation.js";
import {
  tourSummaries,
  pickemBoard,
  predictionDraft,
  predictionBody,
} from "../public/pickem-board.js";
import {
  scheduleReview,
  prepareSchedule,
  accessPanel,
} from "../public/host-panels.js";
const teams = (n) => Array.from({ length: n }, (_, i) => "Team " + (i + 1));
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = Date.UTC(2026, 9, 27);
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
      { id: "368", name: "arpia97" },
      { id: "p", name: "Player", aliases: ["oldname"] },
      { id: "q", name: "Other" },
    ],
  });
  return {
    e,
    sql,
    tx,
    time: (n) => (now = n),
    now: () => now,
    host: (a, b) => e.tx(() => e.host(a, b)),
  };
}
test("round robin schedules include each pair once or twice, reversed in the second leg, one match per team per round", () => {
  for (const [format, n, numRounds, mult] of [
    ["double-4", 4, 6, 2],
    ["single-6", 6, 5, 1],
  ]) {
    const ts = teams(n),
      rounds = roundRobin(format, ts),
      counts = new Map();
    assert.equal(rounds.length, numRounds);
    for (const pairs of rounds) {
      assert.equal(new Set(pairs.flat()).size, n);
      for (const pair of pairs) {
        const key = [...pair].sort().join("|");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    assert.equal(counts.size, (n * (n - 1)) / 2);
    assert.ok([...counts.values()].every((c) => c === mult));
    if (mult === 2)
      assert.deepEqual(
        rounds.slice(3),
        rounds.slice(0, 3).map((r) => r.map(([a, b]) => [b, a])),
      );
  }
  assert.throws(() => validateTeams("swiss", teams(7)), /8–64/);
  assert.throws(
    () => validateTeams("single-6", ["a", "A", "b", "c", "d", "e"]),
    /unique/,
  );
});
test("Swiss draws first seeds across halves, ranks results and avoids rematches over successive rounds", () => {
  const ts = teams(8),
    matches = [];
  const seen = new Set();
  assert.deepEqual(swissRound(ts).pairs[0], ["Team 1", "Team 5"]);
  for (let r = 0; r < 5; r++) {
    const { pairs, standings } = swissRound(ts, matches);
    assert.equal(new Set(pairs.flat()).size, 8);
    assert.ok(
      standings.every((s, i) => i === 0 || standings[i - 1].wins >= s.wins),
    );
    for (const [a, b] of pairs) {
      const key = [a, b].sort().join("|");
      assert.ok(!seen.has(key));
      seen.add(key);
      matches.push({
        team_a: a,
        team_b: b,
        result_a: 3,
        result_b: r % 3,
        settled: 1,
        round: r + 1,
      });
    }
  }
  assert.throws(
    () => swissRound(ts, [{ ...matches[0], settled: 0 }]),
    /Settle/,
  );
});
test("odd Swiss fields rotate a single bye without repeats and count it as a standings win", () => {
  const ts = teams(9),
    matches = [],
    byes = [];
  for (let round = 1; round <= 4; round++) {
    const draw = swissRound(ts, matches, byes);
    assert.equal(draw.pairs.length, 4);
    assert.equal(new Set([...draw.pairs.flat(), draw.bye]).size, 9);
    assert.ok(!byes.some((b) => b.team === draw.bye));
    if (round === 2)
      assert.equal(draw.standings.find((s) => s.team === "Team 9").wins, 1);
    byes.push({ team: draw.bye, round });
    matches.push(
      ...draw.pairs.map(([a, b]) => ({
        team_a: a,
        team_b: b,
        settled: 1,
        result_a: 3,
        result_b: 1,
        round,
      })),
    );
  }
});
test("event publishing is atomic, defaults to 500 per award, preserves standalone matches and fences Swiss rounds", (t) => {
  const { e, host, now, time } = fixture(t);
  const b = {
    name: "Tour",
    format: "double-4",
    teams: teams(4),
    deadlines: Array.from(
      { length: 6 },
      (_, i) => now() + 3600000 + i * 86400000,
    ),
  };
  const run = () =>
    e.mutate("host:event", "event-key", b, () => e.host("pickem-event", b));
  run();
  run();
  assert.equal(e.one("SELECT count(*) n FROM pickems").n, 12);
  assert.ok(
    e
      .all("SELECT * FROM pickems")
      .every((p) => p.winner_reward === 500 && p.score_reward === 500),
  );
  assert.throws(
    () => host("pickem-event", { ...b, deadlines: [0] }),
    /deadline/,
  );
  assert.equal(e.one("SELECT count(*) n FROM pickem_events").n, 1);
  host("pickem", {
    title: "Manual",
    tour: "Manual",
    teamA: "A",
    teamB: "B",
    ends: now() + 100000,
  });
  assert.equal(
    e.one("SELECT winner_reward FROM pickems WHERE event_id IS NULL")
      .winner_reward,
    500,
  );
  const ev = host("pickem-event", {
    name: "Swiss",
    format: "swiss",
    teams: teams(9),
    deadlines: [now() + 3600000],
  });
  const rows = () =>
    e.all("SELECT * FROM pickems WHERE event_id=? ORDER BY round,id", ev.event);
  assert.throws(
    () =>
      host("pickem-swiss-round", {
        event: ev.event,
        expectedRound: 2,
        expectedPairs: [],
        deadlines: [now() + 5000000],
      }),
    /Settle/,
  );
  time(now() + 3600001);
  for (const m of rows())
    host("settle", { pickem: m.id, scoreA: 3, scoreB: 1 });
  const nextPairing = swissRound(
    teams(9),
    rows(),
    e.pickemEvents.read(ev.event).byes,
  );
  const next = {
    event: ev.event,
    expectedRound: 2,
    expectedPairs: nextPairing.pairs,
    expectedBye: nextPairing.bye,
    deadlines: [now() + 3600000],
  };
  host("pickem-swiss-round", next);
  assert.equal(rows().length, 8);
  assert.equal(e.pickemEvents.read(ev.event).byes.length, 2);
  assert.throws(() => host("pickem-swiss-round", next), /changed/);
});
test("participation paste ignores ratings/totals/guesses, deduplicates aliases to canonical players and credits exactly once per event", (t) => {
  const { e, host } = fixture(t);
  const raw =
    "Player (98.893) oldname (83.829) | Total = 182.722 | Guesses = [54]\nOther (95.528) | Total = 95.528 | Guesses = [5]";
  assert.deepEqual(participationNames(raw), ["Player", "oldname", "Other"]);
  const preview = e.participation.preview(raw);
  assert.deepEqual(
    preview.players.map((p) => p.id),
    ["p", "q"],
  );
  const b = {
    text: raw,
    amount: 500,
    event: "tour-1",
    note: "Beta tour",
    expectedPlayers: ["p", "q"],
  };
  const run = () =>
    e.mutate("host:participation-batch", "reward-key", b, () =>
      e.host("participation-batch", b),
    );
  run();
  run();
  assert.equal(e.player("p").balance, 500);
  assert.equal(e.player("q").earned, 500);
  assert.equal(e.profile("p").stats.participation, 1);
  assert.throws(() => host("participation-batch", b), /already been awarded/);
  assert.equal(e.player("p").balance, 500);
  assert.throws(
    () => e.participation.preview(raw + "\nmissing (100)"),
    /Unknown.*missing/,
  );
  assert.throws(
    () => participationNames("Player (100) garbage"),
    /Cannot read/,
  );
  assert.throws(
    () =>
      host("participation-batch", {
        ...b,
        event: "tour-2",
        expectedPlayers: ["p"],
      }),
    /changed/,
  );
});
test("delegated hosts require explicit owner grant, persist on restart, revoke immediately, and cannot grant roles or alter owner", (t) => {
  const { e, sql, tx } = fixture(t);
  e.run("UPDATE players SET password='hashed',is_admin=1");
  e.run(
    "INSERT INTO sessions VALUES('owner','368',9999999999999),('delegate','p',9999999999999)",
  );
  assert.equal(e.adminSession("delegate"), false);
  assert.throws(
    () => e.setHostAccess("p", { player: "q", enabled: true }),
    /Only arpia97/,
  );
  assert.throws(
    () => e.setHostAccess("368", { player: "368", enabled: false }),
    /cannot be changed/,
  );
  e.tx(() => e.setHostAccess("368", { player: "p", enabled: true }));
  assert.equal(e.adminSession("delegate"), true);
  assert.equal(e.player("p").is_admin, 1);
  const restarted = new Engine(sql, tx);
  assert.equal(restarted.adminSession("delegate"), true);
  e.run("UPDATE players SET password=NULL WHERE id='p'");
  restarted.tx(() =>
    restarted.setHostAccess("368", { player: "p", enabled: false }),
  );
  assert.equal(restarted.adminSession("delegate"), false);
  assert.equal(e.adminSession("owner"), true);
  assert.equal(e.one("SELECT count(*) n FROM host_access_log").n, 2);
  e.run("UPDATE players SET password=NULL WHERE id='q'");
  assert.throws(
    () => e.setHostAccess("368", { player: "q", enabled: true }),
    /register/,
  );
});
test("host schedule review escapes names and exposes per-round editable deadlines with 500 defaults", () => {
  const escape = (s) => String(s).replaceAll("<", "&lt;");
  const d = prepareSchedule(
    { name: "<Tour>", format: "double-4", teams: teams(4).join("\n") },
    {},
  );
  const html = scheduleReview(d, escape);
  assert.match(html, /&lt;Tour>/);
  assert.match(html, /deadline-5/);
  assert.match(html, /value="500"/);
  assert.doesNotMatch(
    accessPanel({ players: [], canManageHosts: false }, escape),
    /id="host-permissions"/,
  );
});
test("schedule preparation explains missing names, wrong team counts, duplicates and an empty Swiss selection", () => {
  const form = { name: "Tour", format: "double-4", teams: teams(4).join("\n") };
  assert.throws(
    () => prepareSchedule({ ...form, name: " " }, {}),
    /Enter a tour name/,
  );
  assert.throws(
    () =>
      prepareSchedule({ ...form, teams: "Team A, Team B, Team C, Team D" }, {}),
    /You entered 1.*separate line/,
  );
  assert.throws(
    () => prepareSchedule({ ...form, teams: "A\na\nB\nC" }, {}),
    /unique/,
  );
  assert.throws(
    () => prepareSchedule({ event: "" }, { pickemEvents: [] }),
    /Choose a Swiss event/,
  );
  assert.equal(prepareSchedule({ ...form, name: "  Tour  " }, {}).name, "Tour");
});
test("reviewed host schedules publish active public pickems once for every supported format", (t) => {
  for (const [format, count, matches] of [
    ["double-4", 4, 12],
    ["single-6", 6, 15],
    ["swiss", 8, 4],
  ]) {
    const { e, now } = fixture(t);
    const draft = prepareSchedule(
      { name: "Active tour", format, teams: teams(count).join("\r\n") },
      {},
    );
    const body = JSON.parse(
      JSON.stringify({
        ...draft.body,
        deadlines: draft.rounds.map(() => null),
        winnerReward: 500,
        scoreReward: 500,
      }),
    );
    const publish = () =>
      e.mutate("host:host/pickem-event", "reviewed-tour", body, () =>
        e.host(draft.path, body),
      );
    const result = publish();
    assert.deepEqual(publish(), result);
    const page = e.pickemPage(null);
    assert.equal(page.pickems.length, matches);
    assert.ok(
      page.pickems.every(
        (p) =>
          p.event_id === result.event &&
          p.tour === draft.name &&
          p.ends === now() + 600000 &&
          !p.settled &&
          p.winner_reward === 500 &&
          p.score_reward === 500,
      ),
    );
    assert.equal(e.state(null).activePickem.tour, draft.name);
    const p = page.pickems[0];
    e.tx(() =>
      e.action("p", "predict", {
        pickem: p.id,
        winner: "a",
        scoreA: 3,
        scoreB: 1,
      }),
    );
    assert.equal(
      e.pickemPage("p").pickems.find((x) => x.id === p.id).prediction,
      "a",
    );
  }
});
test("public tours paginate by complete tour and expand every round with private predictions", (t) => {
  const { e, host } = fixture(t);
  const first = host("pickem-event", {
    name: "Tour 0",
    format: "double-4",
    teams: teams(4),
  }).event;
  for (let i = 1; i < 21; i++)
    host("pickem-event", {
      name: "Tour " + i,
      format: "double-4",
      teams: teams(4),
    });
  const p1 = e.pickemEvents.page(),
    p2 = e.pickemEvents.page(2);
  assert.equal(p1.tours.length, 20);
  assert.equal(p1.hasMore, true);
  assert.equal(p2.tours.length, 1);
  assert.equal(new Set([...p1.tours, ...p2.tours].map((t) => t.key)).size, 21);
  assert.ok(
    p1.tours.every((t) => t.matches === 12 && t.rounds === 6 && t.open === 12),
  );
  const detail = e.pickemEvents.detail(first, "p");
  assert.equal(detail.matches.length, 12);
  assert.deepEqual(
    [...new Set(detail.matches.map((p) => p.round))],
    [1, 2, 3, 4, 5, 6],
  );
  e.tx(() =>
    e.action("p", "predict", {
      pickem: detail.matches[0].id,
      winner: "a",
      scoreA: 3,
      scoreB: 1,
    }),
  );
  assert.equal(e.pickemEvents.detail(first, "p").matches[0].prediction, "a");
  assert.equal(e.pickemEvents.detail(first, "q").matches[0].prediction, null);
  assert.equal(e.pickemEvents.detail(first, null).matches[0].prediction, null);
  host("pickem", {
    title: "Standalone",
    tour: "Other",
    teamA: "A",
    teamB: "B",
  });
  const stand = e.pickemEvents.page().tours[0];
  assert.ok(stand.key < 0);
  assert.equal(e.pickemEvents.detail(stand.key, null).matches.length, 1);
});
test("match edits preserve votes unless team changes are confirmed, reject stale reviews, and delete exactly once without credits", (t) => {
  const { e, host, now } = fixture(t);
  host("pickem-event", { name: "Tour", format: "double-4", teams: teams(4) });
  let p = e.pickemEvents.match(1);
  const edit = () => ({
    pickem: 1,
    expected: p,
    title: "Corrected title",
    teamA: p.team_a,
    teamB: p.team_b,
    ends: now() + 1200000,
    winnerReward: 600,
    scoreReward: 500,
  });
  e.tx(() =>
    e.action("p", "predict", { pickem: 1, winner: "a", scoreA: 3, scoreB: 1 }),
  );
  assert.throws(() => host("pickem-edit", edit()), /changed/);
  p = e.pickemEvents.match(1);
  host("pickem-edit", edit());
  assert.equal(e.pickemEvents.detail(1, "p").matches[0].prediction, "a");
  p = e.pickemEvents.match(1);
  assert.throws(
    () => host("pickem-edit", { ...edit(), teamA: "Replacement" }),
    /clears existing predictions/,
  );
  assert.equal(e.pickemEvents.match(1).team_a, p.team_a);
  host("pickem-edit", {
    ...edit(),
    teamA: "Replacement",
    clearPredictions: true,
  });
  assert.equal(e.pickemEvents.detail(1, "p").matches[0].prediction, null);
  p = e.pickemEvents.match(1);
  const body = { pickem: 1, expected: p, confirmation: "DELETE PICKEM 1" };
  const run = () =>
    e.mutate("host:delete", "delete-key", body, () =>
      e.host("pickem-delete", body),
    );
  assert.deepEqual(run(), run());
  assert.equal(e.one("SELECT count(*) n FROM pickems WHERE id=1").n, 0);
  assert.equal(e.player("p").balance, 0);
  assert.equal(e.player("p").earned, 0);
});
test("whole-tour deletion removes predictions/byes atomically and rejects concurrent votes or paid results", (t) => {
  const { e, host, now, time } = fixture(t);
  const id = host("pickem-event", {
    name: "Swiss",
    format: "swiss",
    teams: teams(9),
  }).event;
  const event = e.pickemEvents.read(id),
    expectedIds = event.matches.map((p) => p.id);
  const body = {
    event: id,
    expectedIds,
    expectedVotes: 0,
    confirmation: `DELETE TOUR ${id}`,
  };
  e.tx(() =>
    e.action("p", "predict", {
      pickem: expectedIds[0],
      winner: "a",
      scoreA: 3,
      scoreB: 1,
    }),
  );
  assert.throws(() => host("pickem-event-delete", body), /changed/);
  assert.equal(e.pickemEvents.read(id).matches.length, 4);
  host("pickem-event-delete", { ...body, expectedVotes: 1 });
  assert.equal(e.one("SELECT count(*) n FROM pickem_byes").n, 0);
  assert.equal(e.one("SELECT count(*) n FROM predictions").n, 0);
  const paid = host("pickem-event", {
    name: "Paid",
    format: "double-4",
    teams: teams(4),
  }).event;
  time(now() + 600001);
  const match = e.pickemEvents.read(paid).matches[0];
  host("settle", { pickem: match.id, scoreA: 3, scoreB: 1 });
  const p = e.pickemEvents.match(match.id);
  assert.throws(
    () =>
      host("pickem-delete", {
        pickem: p.id,
        expected: p,
        confirmation: `DELETE PICKEM ${p.id}`,
      }),
    /rewards have been paid/,
  );
  assert.throws(
    () => host("pickem-edit", { pickem: p.id, expected: p }),
    /rewards have been paid/,
  );
  assert.throws(
    () => host("pickem-event-delete", { event: paid }),
    /rewards have been paid/,
  );
});
test("tour names update the public summary without changing match outcomes or predictions", (t) => {
  const { e, host } = fixture(t);
  const id = host("pickem-event", {
    name: "Typo",
    format: "double-4",
    teams: teams(4),
  }).event;
  host("pickem-event-edit", {
    event: id,
    name: "Corrected",
    expectedName: "Typo",
  });
  assert.equal(e.pickemEvents.page().tours[0].name, "Corrected");
  assert.ok(
    e.pickemEvents
      .detail(id, null)
      .matches.every((p) => p.tour === "Corrected"),
  );
  assert.throws(
    () =>
      host("pickem-event-edit", {
        event: id,
        name: "Stale",
        expectedName: "Typo",
      }),
    /changed/,
  );
});
test("compact board shows one tour button and expands all chronological rounds with escaped names", () => {
  const matches = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    event_id: 1,
    tour: "<Tour>",
    round: Math.floor(i / 2) + 1,
    team_a: "<A>",
    team_b: "B",
    title: "Match",
    ends: 1000,
    winner_reward: 500,
    score_reward: 500,
    settled: 0,
  }));
  const tours = tourSummaries(matches, 0),
    tools = {
      escape: (s) => String(s).replaceAll("<", "&lt;"),
      number: String,
      remaining: () => "10 minutes",
      now: 0,
    };
  const compact = pickemBoard(tours, null, tools);
  assert.equal((compact.match(/data-action="pickem-tour"/g) || []).length, 1);
  assert.doesNotMatch(compact, /class="pickem-table-row"/);
  const expanded = pickemBoard(tours, { key: 1, matches, byes: [] }, tools);
  assert.equal((expanded.match(/class="pickem-table-row"/g) || []).length, 12);
  assert.ok(
    expanded.indexOf('class="round-number">1') <
      expanded.indexOf('class="round-number">6'),
  );
  assert.equal((expanded.match(/data-inline-prediction=/g) || []).length, 12);
  assert.match(expanded, /name="winner" form="tour-prediction-1"/);
  assert.match(expanded, /name="scoreA" form="tour-prediction-1"/);
  assert.match(expanded, />Confirm<\/button>/);
  assert.match(expanded, /&lt;Tour>/);
  assert.doesNotMatch(expanded, /<A>/);
  assert.match(expanded, /aria-expanded="true"/);
});
test("inline prediction drafts survive refreshes, reset after team changes and validate complete winner/score submissions", () => {
  const p = {
    id: 7,
    team_a: "A",
    team_b: "B",
    prediction: "a",
    prediction_a: 3,
    prediction_b: 1,
  };
  const draft = {
    ...predictionDraft(p),
    winner: "b",
    scoreA: "2",
    scoreB: "4",
  };
  assert.deepEqual(predictionDraft({ ...p, prediction_a: 5 }, draft), draft);
  assert.equal(
    predictionDraft({ ...p, team_a: "Replacement" }, draft).winner,
    "a",
  );
  assert.deepEqual(predictionBody({ pickem: "7", ...draft }), {
    pickem: 7,
    winner: "b",
    scoreA: 2,
    scoreB: 4,
  });
  assert.throws(
    () => predictionBody({ pickem: "7", winner: "a", scoreA: "", scoreB: "0" }),
    /both predicted scores/,
  );
  assert.throws(
    () => predictionBody({ pickem: "7", winner: "", scoreA: "3", scoreB: "1" }),
    /winning team/,
  );
  assert.throws(
    () =>
      predictionBody({ pickem: "7", winner: "a", scoreA: "1", scoreB: "3" }),
    /agree/,
  );
  assert.throws(
    () =>
      predictionBody({ pickem: "7", winner: "a", scoreA: "3.5", scoreB: "1" }),
    /whole numbers/,
  );
});
