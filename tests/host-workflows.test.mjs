import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { swissRound } from "../public/pickem-formats.js";
import {
  initialTourRewards,
  tourRewardQuote,
  participationRate,
} from "../public/tour-rewards.js";
import { participationNames } from "../public/participation.js";

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

test("event publishing is atomic, defaults to1000 winner/500 per exact score, preserves standalone matches and fences Swiss rounds", (t) => {
  const { e, host, now, time } = fixture(t);
  const b = {
    name: "Tour",
    format: "double-4",
    teams: teams(4),
    deadlines: Array.from(
      { length: 3 },
      (_, i) => now() + 3600000 + i * 86400000,
    ),
  };
  const run = () =>
    e.mutate("host:event", "event-key", b, () => e.host("pickem-event", b));
  run();
  run();
  assert.equal(e.one("SELECT count(*) n FROM pickems").n, 6);
  assert.ok(
    e
      .all("SELECT * FROM pickems")
      .every((p) => p.winner_reward === 1000 && p.score_reward === 500),
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
    1000,
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
test("participation accepts scored results and ranked signup lists, resolves aliases and credits exactly once per event", (t) => {
  const { e, host } = fixture(t);
  const raw =
    "Player (98.893) oldname (83.829) | Total = 182.722 | Guesses = [54]\nOther (95.528) | Total = 95.528 | Guesses = [5]";
  assert.deepEqual(participationNames(raw), ["Player", "oldname", "Other"]);
  const ranked = "Player (A), oldname (B-), Other (S+)";
  assert.deepEqual(participationNames(ranked), ["Player", "oldname", "Other"]);
  const signup =
    "HaruUrara (A), xeyz (B-), LordGrond (C), Beokros (S-), lily (S+), Progenitor (S), Ilffam (D+), Mikuu_ (D), Wolbachia (D), UwUKingPikachu (C-), dking20 (A-), ONAI (C+), RyoutaVN (B-), hmsuis (S-), chemist (A+), Dovixx (D+), Bommie (B+), claydoll1091 (S)";
  const signupNames = [
    "HaruUrara",
    "xeyz",
    "LordGrond",
    "Beokros",
    "lily",
    "Progenitor",
    "Ilffam",
    "Mikuu_",
    "Wolbachia",
    "UwUKingPikachu",
    "dking20",
    "ONAI",
    "RyoutaVN",
    "hmsuis",
    "chemist",
    "Dovixx",
    "Bommie",
    "claydoll1091",
  ];
  assert.deepEqual(participationNames(signup), signupNames);
  host("players", {
    players: signupNames.map((name, i) => ({ id: "signup-" + i, name })),
  });
  assert.equal(e.participation.preview(signup).players.length, 18);
  assert.deepEqual(
    participationNames("Player (AG), oldname (Anything Goes)\nOther (None)"),
    ["Player", "oldname", "Other"],
  );
  const preview = e.participation.preview(raw);
  assert.deepEqual(e.participation.preview(ranked), preview);
  assert.deepEqual(
    preview.players.map((p) => p.id),
    ["p", "q"],
  );
  const b = {
    text: ranked,
    ...initialTourRewards(preview.players),
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
  assert.equal(e.player("p").balance, 600);
  assert.equal(e.player("q").earned, 600);
  assert.equal(e.profile("p").stats.participation, 1);
  assert.throws(
    () => host("participation-batch", { ...b, text: raw }),
    /already awarded/,
  );
  assert.equal(e.player("p").balance, 600);
  assert.throws(
    () => e.participation.preview(ranked + ", missing (A)"),
    /Unknown.*missing/,
  );
  for (const bad of [
    "Player (100) garbage",
    "Player (A),",
    "Player (A++), Other (S)",
  ])
    assert.throws(() => participationNames(bad), /Cannot read/);
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
    p1.tours.every((t) => t.matches === 6 && t.rounds === 3 && t.open === 6),
  );
  const detail = e.pickemEvents.detail(first, "p");
  assert.equal(detail.matches.length, 6);
  assert.deepEqual([...new Set(detail.matches.map((p) => p.round))], [1, 2, 3]);
  e.tx(() =>
    e.action("p", "predict", {
      pickem: detail.matches[0].id,
      winner: "a",
      scoreA: 2,
      scoreB: 0,
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
  host("pickem-event", { name: "Tour", format: "single-6", teams: teams(6) });
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
  time(now() + 900001);
  const match = e.pickemEvents.read(paid).matches[0];
  host("settle", { pickem: match.id, scoreA: 2, scoreB: 0 });
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

test("whole-tour rewards price rounds by size, split substitutes and pay flat staff credits atomically once per tour", (t) => {
  const f = fixture(t),
    text = "Player (A), Other (B)",
    preview = f.e.participation.preview(text);
  for (const [size, rate] of [
    [8, 200],
    [16, 200],
    [24, 300],
    [32, 400],
    [40, 400],
    [48, 400],
    [64, 400],
    [128, 400],
    [500, 400],
  ]) {
    assert.equal(participationRate(size), rate);
    const plan = initialTourRewards(preview.players, {
      tourSize: size,
      maxRounds: 6,
    });
    assert.equal(
      tourRewardQuote(preview.players, plan).participation,
      12 * rate,
    );
  }
  const body = {
    text,
    event: "staff-tour",
    note: "",
    expectedPlayers: ["p", "q"],
    ...initialTourRewards(preview.players, { tourSize: 16, maxRounds: 6 }),
  };
  body.participants[0] = { player: "p", rounds: 2, count: true, report: true };
  body.participants.push({
    player: "368",
    rounds: 4,
    count: false,
    report: false,
    replaces: "p",
  });
  const invalid = {
    ...body,
    participants: body.participants.map((r) =>
      r.player === "368" ? { ...r, rounds: 5 } : r,
    ),
  };
  assert.throws(() => f.host("participation-batch", invalid), /maximum rounds/);
  assert.equal(f.e.player("p").balance, 0);
  const unknown = {
    ...body,
    participants: body.participants.map((r) =>
      r.player === "368" ? { ...r, player: "missing" } : r,
    ),
  };
  assert.throws(() => f.host("participation-batch", unknown));
  assert.equal(f.e.player("p").balance, 0);
  const result = f.host("participation-batch", body);
  assert.equal(result.total, 3900);
  assert.equal(result.participation, 2400);
  assert.equal(result.staff, 1500);
  assert.equal(f.e.player("p").balance, 1900);
  assert.equal(f.e.player("q").balance, 1200);
  assert.equal(f.e.player("368").balance, 800);
  assert.equal(f.e.profile("p").stats.counting, 1);
  assert.equal(f.e.profile("p").stats.reporting, 1);
  assert.throws(() => f.host("participation-batch", body), /already/);
  assert.equal(f.e.player("p").balance, 1900);
  assert.throws(
    () =>
      f.host("participation-batch", {
        ...body,
        event: "old-client",
        rewardVersion: undefined,
      }),
    /rules changed/,
  );
  assert.equal(
    f.e.one("SELECT count(*) n FROM tour_events WHERE event='old-client'").n,
    0,
  );
  const helper = {
    ...initialTourRewards(preview.players),
    text,
    event: "outside-staff",
    expectedPlayers: ["p", "q"],
  };
  helper.participants.push({
    player: "368",
    rounds: 0,
    staffOnly: true,
    count: true,
    report: false,
  });
  assert.equal(f.host("participation-batch", helper).staff, 750);
  assert.throws(
    () =>
      tourRewardQuote(preview.players, {
        ...body,
        participants: [...body.participants, body.participants[0]],
      }),
    /only once/,
  );
  f.host("grant", { player: "p", reason: "reporting", amount: 1, note: "" });
  assert.equal(
    f.e.one("SELECT reason FROM ledger ORDER BY id DESC LIMIT 1").reason,
    "reporting: Tour reporting",
  );
});

test("participation batch accepts more than 32 players with rate capped at 32-player default", (t) => {
  const f = fixture(t);
  const playerList = Array.from({ length: 36 }, (_, i) => ({
    id: `bigp${i + 1}`,
    name: `BigPlayer${i + 1}`,
  }));
  f.e.host("players", { players: playerList });

  const rosterText = playerList.map((p) => `${p.name} (100.0)`).join("\n");
  const preview = f.e.participation.preview(rosterText);
  assert.equal(preview.players.length, 36);
  assert.equal(preview.tourSize, 40);
  assert.equal(preview.maxRounds, 5);

  const plan = initialTourRewards(preview.players, preview);
  const quote = tourRewardQuote(preview.players, plan);
  assert.equal(quote.rate, 400);
  assert.equal(quote.participation, 36 * 5 * 400);

  const result = f.host("participation-batch", {
    text: rosterText,
    event: "big-tour-2026",
    note: "Big Tour",
    expectedPlayers: preview.players.map((p) => p.id),
    ...plan,
  });
  assert.equal(result.participation, 36 * 5 * 400);
  assert.equal(result.tourSize, 40);
  assert.equal(f.e.player("bigp1").balance, 2000);
  assert.equal(f.e.player("bigp36").balance, 2000);
});
