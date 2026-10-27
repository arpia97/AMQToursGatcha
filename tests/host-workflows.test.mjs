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
  const nextPairing = swissRound(teams(9), rows(), e.pickemEvents.read(ev.event).byes);
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
