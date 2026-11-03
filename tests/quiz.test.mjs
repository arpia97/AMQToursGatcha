import { AliasSync } from "../src/aliases.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  prepareQuizSongs,
  quizReward,
  quizRarity,
  validQuizAudio,
  resolveQuizAudio,
} from "../public/quiz-rules.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const tx = (fn) => {
    db.exec("BEGIN");
    try {
      const v = fn();
      db.exec("COMMIT");
      return v;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  let now = 123456;
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    tx,
    () => now,
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  const songs = Array.from({ length: 25 }, (_, i) => ({
    audio: "https://example.com/" + i + ".mp3",
    answers: ["Anime " + i, "Alternative " + i],
    title: "Song " + i,
  }));
  const save = (b = {}) =>
    e.tx(() =>
      e.quiz.save({
        id: "test",
        name: "Quiz",
        songs,
        title: "Perfect Listener",
        published: true,
        ...b,
      }),
    );
  save();
  const action = (p, a, b, key = crypto.randomUUID()) =>
    e.mutate(p + ":" + a, key, b, () => e.action(p, a, b));
  return {
    e,
    songs,
    save,
    action,
    advance: (n) => {
      now += n;
    },
  };
}
test("AMQ IDs supply alternative and shared-song answers; video, unmatched and duplicate audio are rejected", () => {
  const master = {
    masterListId: "v1",
    animeMap: {
      1: {
        mainNames: { EN: "Anime", JA: "Anime JP" },
        names: [{ name: "Alt Anime" }],
        songLinks: { OP: [{ songId: 9, annSongId: 99 }] },
      },
      2: {
        mainNames: { EN: "Sequel" },
        songLinks: { ED: [{ songId: 9, annSongId: 100 }] },
      },
    },
  };
  const input = [
    {
      annId: 1,
      annSongId: 99,
      audio: "https://example.com/a.mp3",
      songName: "OP",
    },
    { annId: 1, audio: "https://example.com/a.mp3" },
    { annId: 1, video: "https://example.com/v.mp4" },
    { annId: 404, audio: "https://example.com/b.mp3" },
  ];
  const q = prepareQuizSongs(input, master);
  assert.equal(q.songs.length, 1);
  assert.equal(q.rejected.length, 2);
  assert.deepEqual(q.songs[0].answers, [
    "Anime",
    "Anime JP",
    "Alt Anime",
    "Sequel",
  ]);
  for (const url of [
    "http://example.com/a.mp3",
    "https://example.com/a.mp4",
    "javascript:alert(1)",
  ])
    assert.equal(validQuizAudio(url), null);
  assert.throws(() => prepareQuizSongs(input, {}), /unavailable/);
});
test("personal bests pay only improvements and separately crossed milestones, max2900", () => {
  assert.deepEqual(quizReward(0, 10), {
    best: 10,
    improvement: 500,
    milestones: 400,
  });
  assert.deepEqual(quizReward(10, 13), {
    best: 13,
    improvement: 150,
    milestones: 0,
  });
  assert.deepEqual(quizReward(13, 5), {
    best: 13,
    improvement: 0,
    milestones: 0,
  });
  const q = quizReward(0, 20);
  assert.equal(q.improvement + q.milestones, 2900);
  assert.deepEqual([0, 3, 5, 8, 10, 13, 15, 18, 20].map(quizRarity), [
    "D",
    "C",
    "B",
    "A",
    "S",
    "SS",
    "SSS",
    "Ubers",
    "AG",
  ]);
});
function play(f, score, keyPrefix = crypto.randomUUID(), player = "p") {
  let result = f.action(player, "quiz-start", { quiz: "test" }),
    run = result.run;
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const ready = f.action(player, "quiz-ready", {
      quiz: "test",
      run: run.id,
      index: i,
    });
    f.advance(Math.max(0, ready.run.startsAt - f.e.now()));
    const stored = f.e.quiz.run(player, "test");
    const song = stored.songs[i];
    seen.add(song.audio);
    const b = {
      quiz: "test",
      run: run.id,
      index: i,
      answer: i < score ? song.answers[1] : "Wrong",
    };
    const key = keyPrefix + "-a-" + i;
    const answer = f.action(player, "quiz-answer", b, key);
    assert.equal(answer.run.correct, i < score);
    assert.deepEqual(f.action(player, "quiz-answer", b, key), answer);
    assert.throws(() => f.action(player, "quiz-answer", b), /already locked/);
    const next = { quiz: "test", run: run.id, index: i },
      nk = keyPrefix + "-n-" + i;
    result = f.action(player, "quiz-next", next, nk);
    run = result.run;
    assert.deepEqual(f.action(player, "quiz-next", next, nk), result);
  }
  assert.equal(seen.size, 20);
  return result;
}
test("server picks20 unique songs, resumes, locks answers, awards once across retries, pool changes and restarts", (t) => {
  const f = fixture(t);
  const first = f.action("p", "quiz-start", { quiz: "test" });
  assert.equal(first.run.index, 0);
  assert.equal(first.run.answer, undefined);
  assert.equal(
    f.action("p", "quiz-start", { quiz: "test" }).run.id,
    first.run.id,
  );
  const state = f.e.quiz.run("p", "test");
  const result = play(f, 10);
  assert.equal(result.run.reward.total, 900);
  assert.equal(f.e.player("p").earned, 900);
  const next = play(f, 13);
  assert.equal(next.run.reward.total, 150);
  const lower = play(f, 5);
  assert.equal(lower.run.reward.total, 0);
  f.save({ name: "Updated Pool" });
  const perfect = play(f, 20);
  assert.equal(perfect.run.reward.total, 1850);
  assert.equal(f.e.player("p").earned, 2900);
  assert.equal(f.e.profile("p").titles[0].title, "Perfect Listener");
  assert.equal(play(f, 20).run.reward.total, 0);
  assert.equal(f.e.player("p").earned, 2900);
  assert.equal(f.e.player("q").earned, 0);
  const restart = new Engine(f.e.db, f.e.transaction, f.e.now, () => 0);
  assert.equal(restart.quiz.view("p", "test").run.finished, true);
  assert.equal(restart.quiz.list("p")[0].best, 20);
  assert.equal(state.songs.length, 20);
});
test("pool updates preserve active run snapshot; invalid and under20 publication roll back", (t) => {
  const f = fixture(t);
  f.action("p", "quiz-start", { quiz: "test" });
  const snapshot = f.e.quiz.run("p", "test");
  f.save({ songs: f.songs.map((s) => ({ ...s, answers: ["Replacement"] })) });
  assert.deepEqual(f.e.quiz.run("p", "test"), snapshot);
  assert.throws(() => f.save({ songs: f.songs.slice(0, 19) }), /20 matched/);
  assert.equal(f.e.quiz.list("p")[0].songs, 25);
  assert.throws(
    () => f.save({ cover: "data:image/svg+xml;base64,PHN2Zz4=" }),
    /PNG/,
  );
  assert.deepEqual(f.e.quiz.suggestions("test", "Re").answers, ["Replacement"]);
  assert.deepEqual(f.e.quiz.suggestions("test", "%").answers, []);
  f.save({ published: false });
  assert.equal(f.e.quiz.list().length, 0);
  assert.throws(() => f.e.quiz.view("p", "test"), /not available/);
});
test("reset clears quiz progress and restores5000 once while quiz definitions remain", (t) => {
  const f = fixture(t);
  play(f, 20);
  f.e.tx(() =>
    f.e.host("reset-player", { player: "p", confirmation: "RESET PLAYER p" }),
  );
  assert.equal(f.e.player("p").balance, 5000);
  assert.equal(f.e.player("p").earned, 5000);
  f.e.tx(() => f.e.economy.fundStarters());
  assert.equal(f.e.player("p").balance, 5000);
  assert.equal(f.e.quiz.list("p")[0].best, 0);
  assert.equal(f.e.quiz.view("p", "test").run, null);
  assert.equal(f.e.profile("p").titles.length, 0);
});

test("canonical ID migration retains quiz progress and active questions", (t) => {
  const f = fixture(t);
  play(f, 20);
  f.action("p", "quiz-start", { quiz: "test" });
  const run = f.e.quiz.view("p", "test").run;
  f.e.tx(() => new AliasSync(f.e).renamePlayer("p", "90001"));
  assert.equal(f.e.quiz.list("90001")[0].best, 20);
  assert.equal(f.e.quiz.view("90001", "test").run.id, run.id);
  assert.equal(f.e.profile("90001").titles[0].title, "Perfect Listener");
  assert.equal(
    f.e.one("SELECT count(*) n FROM quiz_progress WHERE player='p'").n,
    0,
  );
});

test("AnisongDB filenames resolve only to the AMQ HTTPS mirror while malformed and video links stay rejected", () => {
  assert.equal(
    resolveQuizAudio("dntpj0.mp3"),
    "https://naedist.animemusicquiz.com/dntpj0.mp3",
  );
  assert.equal(
    resolveQuizAudio(" song_123-A.MP3 "),
    "https://naedist.animemusicquiz.com/song_123-A.MP3",
  );
  assert.equal(
    resolveQuizAudio("https://example.com/song.mp3?key=1"),
    "https://example.com/song.mp3?key=1",
  );
  for (const value of [
    "//evil.test/song.mp3",
    "../song.mp3",
    "/song.mp3",
    "http://example.com/song.mp3",
    "javascript:alert(1)",
    "video.webm",
    null,
    {},
  ])
    assert.equal(resolveQuizAudio(value), null);
  const imported = prepareQuizSongs(
    [{ annId: 1, audio: "dntpj0.mp3" }, null, { annId: 1, HQ: "video.webm" }],
    {
      masterListId: "test",
      animeMap: { 1: { mainNames: { EN: "Anime" }, songLinks: {} } },
    },
  );
  assert.equal(imported.songs.length, 1);
  assert.equal(
    imported.songs[0].audio,
    "https://naedist.animemusicquiz.com/dntpj0.mp3",
  );
  assert.equal(imported.rejected.length, 2);
});

test("AMQ occurrence links override legacy exports that mislabel an occurrence ID as the shared song", () => {
  const master = {
    masterListId: "legacy",
    animeMap: {
      1: {
        mainNames: { EN: "Original" },
        songLinks: { OP: [{ songId: 9, annSongId: 99 }] },
      },
      2: {
        mainNames: { EN: "Shared Appearance" },
        songLinks: { ED: [{ songId: 9, annSongId: 100 }] },
      },
      3: {
        mainNames: { EN: "Unrelated Cover" },
        songLinks: { OP: [{ songId: 99, annSongId: 101 }] },
      },
    },
  };
  const q = prepareQuizSongs(
    [{ annId: 1, annSongId: 99, amqSongId: 99, audio: "legacy.mp3" }],
    master,
  );
  assert.deepEqual(q.songs[0].answers, ["Original", "Shared Appearance"]);
});

test("draft quizzes, answer choices and playback are available only to hosts, and preview runs never award credits or progress", (t) => {
  const f = fixture(t);
  f.e.host("players", { players: [{ id: "368", name: "Owner" }] });
  f.e.run("UPDATE players SET is_admin=1 WHERE id='368'");
  f.save({ published: false });
  assert.equal(f.e.quiz.list().length, 0);
  assert.equal(f.e.quiz.list("p").length, 0);
  assert.equal(f.e.quiz.list("368").length, 1);
  for (const player of [null, "p", "q"]) {
    assert.throws(
      () => f.e.quiz.definition("test", player),
      (e) => e.status === 404,
    );
    assert.throws(
      () => f.e.quiz.answerBank("test", player),
      (e) => e.status === 404,
    );
  }
  const before = f.e.player("368");
  let run = f.action("368", "quiz-start", { quiz: "test" }).run;
  assert.equal(run.preview, true);
  for (let i = 0; i < 20; i++) {
    const ready = f.action("368", "quiz-ready", {
      quiz: "test",
      run: run.id,
      index: i,
    });
    f.advance(Math.max(0, ready.run.startsAt - f.e.now()));
    const answer = f.e.quiz.run("368", "test").songs[i].answers[0];
    f.action("368", "quiz-answer", {
      quiz: "test",
      run: run.id,
      index: i,
      answer,
    });
    run = f.action("368", "quiz-next", {
      quiz: "test",
      run: run.id,
      index: i,
    }).run;
  }
  assert.equal(run.score, 20);
  assert.equal(run.reward.total, 0);
  assert.equal(run.reward.preview, true);
  assert.equal(f.e.player("368").balance, before.balance);
  assert.equal(f.e.player("368").earned, before.earned);
  assert.equal(f.e.quiz.list("368")[0].best, 0);
  assert.equal(f.e.quiz.titles("368").length, 0);
  f.e.run("UPDATE players SET is_admin=0 WHERE id='368'");
  assert.throws(
    () => f.e.quiz.view("368", "test"),
    (e) => e.status === 404,
  );
});
test("song timers arm once after readiness, have a two-second initial lead-in, and survive refresh without adding time", (t) => {
  const f = fixture(t),
    start = f.action("p", "quiz-start", { quiz: "test" }).run,
    b = { quiz: "test", run: start.id, index: 0 };
  assert.equal(start.endsAt, null);
  assert.throws(
    () => f.action("p", "quiz-answer", { ...b, answer: "Anime 1" }),
    /audio to load/,
  );
  const ready = f.action("p", "quiz-ready", b).run;
  assert.equal(ready.startsAt, f.e.now() + 2000);
  assert.equal(ready.endsAt, ready.startsAt + 20000);
  assert.throws(
    () => f.action("p", "quiz-answer", { ...b, answer: "Anime 1" }),
    /countdown/,
  );
  f.advance(1000);
  assert.equal(f.action("p", "quiz-ready", b).run.endsAt, ready.endsAt);
  const restart = new Engine(f.e.db, f.e.transaction, f.e.now, () => 0);
  assert.equal(restart.quiz.view("p", "test").run.endsAt, ready.endsAt);
  f.advance(1000);
  const answer = f.e.quiz.run("p", "test").songs[0].answers[0];
  assert.equal(
    f.action("p", "quiz-answer", { ...b, answer }).run.correct,
    true,
  );
  const next = f.action("p", "quiz-next", b).run;
  assert.equal(next.endsAt, null);
  const second = f.action("p", "quiz-ready", { ...b, index: 1 }).run;
  assert.equal(second.startsAt, f.e.now());
  assert.equal(second.endsAt, f.e.now() + 20000);
});
test("expired questions cannot gain points from late or forged answers; normal timeout submissions have network-transit allowance", (t) => {
  const f = fixture(t),
    run = f.action("p", "quiz-start", { quiz: "test" }).run,
    b = { quiz: "test", run: run.id, index: 0 };
  let ready = f.action("p", "quiz-ready", b).run;
  f.advance(ready.endsAt - f.e.now() + 1001);
  const correct = f.e.quiz.run("p", "test").songs[0].answers[0];
  const late = f.action("p", "quiz-answer", {
    ...b,
    answer: correct,
    now: ready.endsAt - 1,
  });
  assert.equal(late.run.correct, false);
  assert.equal(late.run.timedOut, true);
  assert.equal(late.run.submittedAnswer, correct);
  assert.equal(f.e.quiz.view("p", "test").run.submittedAnswer, correct);
  assert.equal(late.run.score, 0);
  f.action("p", "quiz-next", b);
  ready = f.action("p", "quiz-ready", { ...b, index: 1 }).run;
  f.advance(ready.endsAt - f.e.now() + 500);
  const second = f.e.quiz.run("p", "test").songs[1].answers[0];
  assert.equal(
    f.action("p", "quiz-answer", { ...b, index: 1, answer: second }).run
      .correct,
    true,
  );
});
test("answer banks paginate completely and retain quiz scope", (t) => {
  const f = fixture(t);
  f.save({
    songs: Array.from({ length: 1201 }, (_, i) => ({
      audio: "https://example.com/" + i + ".mp3",
      title: "Song",
      answers: ["Title " + String(i).padStart(4, "0")],
    })),
  });
  const first = f.e.quiz.answerBank("test", "p", 1),
    second = f.e.quiz.answerBank("test", "p", 2);
  assert.equal(first.answers.length, 1000);
  assert.equal(first.hasMore, true);
  assert.equal(second.answers.length, 201);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.answers, ...second.answers]).size, 1201);
  assert.equal(first.version, second.version);
});

test("skipping unloaded audio never scores a supplied answer", (t) => {
  const f = fixture(t),
    run = f.action("p", "quiz-start", { quiz: "test" }).run;
  const answer = f.e.quiz.run("p", "test").songs[0].answers[0];
  const result = f.action("p", "quiz-answer", {
    quiz: "test",
    run: run.id,
    index: 0,
    skip: true,
    answer,
  });
  assert.equal(result.run.correct, false);
  assert.equal(f.e.quiz.run("p", "test").answers[0].answer, "");
  assert.equal(result.run.score, 0);
});

test("title selection is limited to earned titles, changes public display only, and cannot hide Host", (t) => {
  const f = fixture(t);
  play(f, 20);
  const before = {
    balance: f.e.player("p").balance,
    best: f.e.quiz.list("p")[0].best,
  };
  assert.equal(f.e.quiz.titleSettings("p").titles[0].equipped, true);
  const hidden = f.action("p", "equip-titles", { quizzes: [] }, "hide-title");
  assert.equal(hidden.titles[0].equipped, false);
  assert.equal(f.e.profile("p").titles.length, 0);
  assert.deepEqual(
    f.action("p", "equip-titles", { quizzes: [] }, "hide-title"),
    hidden,
  );
  assert.throws(
    () => f.action("q", "equip-titles", { quizzes: ["test"] }),
    /earned/,
  );
  assert.throws(
    () => f.action("p", "equip-titles", { quizzes: ["Host"] }),
    /earned/,
  );
  assert.throws(
    () => f.action("p", "equip-titles", { quizzes: ["test", "test"] }),
    /earned/,
  );
  f.action("p", "equip-titles", { quizzes: ["test"] });
  assert.equal(f.e.profile("p").titles[0].title, "Perfect Listener");
  assert.equal(f.e.player("p").balance, before.balance);
  assert.equal(f.e.quiz.list("p")[0].best, before.best);
  f.e.host("players", { players: [{ id: "368", name: "Owner" }] });
  f.e.run("UPDATE players SET is_admin=1 WHERE id='368'");
  f.action("368", "equip-titles", { quizzes: [], host: false });
  assert.equal(f.e.quiz.titleSettings("368").role, "Host");
  assert.equal(f.e.profile("368").role, "Host");
});
test("title visibility survives restarts and canonical migration, newly earned titles equip by default and player reset clears preferences", (t) => {
  const f = fixture(t);
  play(f, 20);
  f.action("p", "equip-titles", { quizzes: [] });
  let restarted = new Engine(f.e.db, f.e.transaction, f.e.now, () => 0);
  assert.equal(restarted.quiz.titleSettings("p").titles[0].equipped, false);
  f.save({ id: "second", title: "Second Title" });
  f.e.run(
    "INSERT INTO quiz_progress(player,quiz,best,at) VALUES('p','second',20,?)",
    f.e.now(),
  );
  assert.deepEqual(
    f.e.quiz.titles("p").map((t) => t.title),
    ["Second Title"],
  );
  f.e.tx(() => new AliasSync(f.e).renamePlayer("p", "90001"));
  assert.equal(
    f.e.quiz.titleSettings("90001").titles.find((t) => t.quiz === "test")
      .equipped,
    false,
  );
  f.e.tx(() =>
    f.e.host("reset-player", {
      player: "90001",
      confirmation: "RESET PLAYER 90001",
    }),
  );
  assert.equal(
    f.e.one(
      "SELECT count(*) AS n FROM profile_title_preferences WHERE player='90001'",
    ).n,
    0,
  );
  assert.equal(f.e.quiz.titleSettings("90001").titles.length, 0);
});

test("quiz restart returns to song1 with a fresh hand while preserving best scores, rewards and idempotency", (t) => {
  const f = fixture(t);
  play(f, 20);
  const balance = f.e.player("p").balance;
  let run = f.action("p", "quiz-start", { quiz: "test" }).run;
  let b = { quiz: "test", run: run.id, index: 0 };
  const ready = f.action("p", "quiz-ready", b);
  f.advance(2000);
  f.action("p", "quiz-answer", {
    ...b,
    answer: f.e.quiz.run("p", "test").songs[0].answers[0],
  });
  const restart = f.action("p", "quiz-restart", b, "restart-once");
  assert.notEqual(restart.run.id, run.id);
  assert.equal(restart.run.index, 0);
  assert.equal(restart.run.score, 0);
  assert.equal(restart.run.answered, false);
  assert.deepEqual(f.action("p", "quiz-restart", b, "restart-once"), restart);
  assert.throws(() => f.action("p", "quiz-restart", b), /changed/);
  assert.equal(f.e.quiz.list("p")[0].best, 20);
  assert.equal(f.e.player("p").balance, balance);
});
test("leaderboards order by best score and the first time that score was achieved, even after repeat runs and legacy timestamp backfill", (t) => {
  const f = fixture(t);
  play(f, 10);
  const first = f.e.now();
  f.advance(1000);
  play(f, 10, undefined, "q");
  f.advance(1000);
  play(f, 10);
  assert.deepEqual(
    f.e.quiz.leaderboard("test").rows.map((r) => r.id),
    ["p", "q"],
  );
  f.e.run(
    "UPDATE quiz_progress SET best_at=NULL,at=? WHERE player='p'",
    f.e.now() + 5000,
  );
  assert.equal(f.e.quiz.leaderboard("test").rows[0].bestAt, first);
  play(f, 11, undefined, "q");
  f.advance(1000);
  play(f, 11);
  assert.deepEqual(
    f.e.quiz.leaderboard("test").rows.map((r) => r.id),
    ["q", "p"],
  );
});
test("host quiz score reset removes scores, active runs and completion titles without credit loss or repeat reward farming; renaming updates existing holders", (t) => {
  const f = fixture(t);
  play(f, 20);
  const balance = f.e.player("p").balance;
  f.action("p", "quiz-start", { quiz: "test" });
  f.e.run("DELETE FROM quiz_reward_history WHERE player='p'");
  const b = { quiz: "test", confirmation: "RESET QUIZ SCORES AND TITLES" },
    reset = () =>
      f.e.mutate("host:quiz-scores-reset", "reset-once", b, () =>
        f.e.quiz.resetScores(b),
      );
  const result = reset();
  assert.equal(result.players, 1);
  assert.equal(f.e.quiz.leaderboard("test").rows.length, 0);
  assert.equal(f.e.quiz.run("p", "test"), null);
  assert.equal(f.e.profile("p").titles.length, 0);
  assert.equal(f.e.player("p").balance, balance);
  assert.equal(
    f.e.one(
      "SELECT best FROM quiz_reward_history WHERE player='p' AND quiz='test'",
    ).best,
    20,
  );
  const replay = play(f, 20);
  assert.equal(replay.run.reward.total, 0);
  assert.equal(f.e.player("p").balance, balance);
  assert.deepEqual(reset(), result);
  assert.equal(f.e.quiz.list("p")[0].best, 20);
  f.save({ title: "Renamed Completion" });
  assert.equal(f.e.profile("p").titles[0].title, "Renamed Completion");
  assert.equal(
    f.e.quiz.titleSettings("p").titles[0].title,
    "Renamed Completion",
  );
});
test("leaderboards paginate completed attempts without omissions and respect hidden draft access", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 45; i++) {
    const id = "rank" + i;
    f.e.host("players", { players: [{ id, name: id }] });
    f.e.run(
      "INSERT INTO quiz_progress(player,quiz,best,at,best_at) VALUES(?,?,?,?,?)",
      id,
      "test",
      10,
      i + 1,
      i + 1,
    );
  }
  const pages = [1, 2, 3].map((p) => f.e.quiz.leaderboard("test", null, p));
  assert.deepEqual(
    pages.map((p) => p.rows.length),
    [20, 20, 5],
  );
  assert.equal(new Set(pages.flatMap((p) => p.rows.map((r) => r.id))).size, 45);
  assert.equal(pages[2].hasMore, false);
  f.save({ published: false });
  assert.throws(() => f.e.quiz.leaderboard("test"), /not available/);
});

test("submitted answers are hidden before locking and persist separately from the revealed correct title", (t) => {
  const f = fixture(t),
    run = f.action("p", "quiz-start", { quiz: "test" }).run,
    b = { quiz: "test", run: run.id, index: 0 };
  assert.equal(run.submittedAnswer, undefined);
  assert.equal(run.answer, undefined);
  const ready = f.action("p", "quiz-ready", b).run;
  f.advance(ready.startsAt - f.e.now());
  const canonical = f.e.quiz.run("p", "test").songs[0].answers[0],
    alternative = f.e.quiz.run("p", "test").songs[0].answers[1];
  const result = f.action("p", "quiz-answer", {
    ...b,
    answer: alternative,
  }).run;
  assert.equal(result.correct, true);
  assert.equal(result.answer, canonical);
  assert.equal(result.submittedAnswer, alternative);
  assert.equal(f.e.quiz.view("p", "test").run.submittedAnswer, alternative);
  const stored = f.e.quiz.run("p", "test");
  delete stored.answers[0].submittedAnswer;
  f.e.quiz.persist("p", "test", stored);
  assert.equal(f.e.quiz.view("p", "test").run.submittedAnswer, alternative);
});
