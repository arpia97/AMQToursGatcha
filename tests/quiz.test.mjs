import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  prepareQuizSongs,
  quizReward,
  quizRarity,
  validQuizAudio,
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
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    tx,
    () => 123456,
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
  return { e, songs, save, action };
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
function play(f, score, keyPrefix = crypto.randomUUID()) {
  let result = f.action("p", "quiz-start", { quiz: "test" }),
    run = result.run;
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const stored = f.e.quiz.run("p", "test");
    const song = stored.songs[i];
    seen.add(song.audio);
    const b = {
      quiz: "test",
      run: run.id,
      index: i,
      answer: i < score ? song.answers[1] : "Wrong",
    };
    const key = keyPrefix + "-a-" + i;
    const answer = f.action("p", "quiz-answer", b, key);
    assert.equal(answer.run.correct, i < score);
    assert.deepEqual(f.action("p", "quiz-answer", b, key), answer);
    assert.throws(() => f.action("p", "quiz-answer", b), /already locked/);
    const next = { quiz: "test", run: run.id, index: i },
      nk = keyPrefix + "-n-" + i;
    result = f.action("p", "quiz-next", next, nk);
    run = result.run;
    assert.deepEqual(f.action("p", "quiz-next", next, nk), result);
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
