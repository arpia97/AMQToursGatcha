import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  return e;
}
import { prepareQuizSongs } from "../public/quiz-rules.js";
import { repairQuizAnswers } from "../src/quiz-answer-repair.js";
const master = {
  masterListId: "test",
  animeMap: {
    30555: {
      annId: 30555,
      mainNames: { JA: "Ple Ple Pleiades x Kagejitsu!" },
      songLinks: { ED: [{ songId: 75802, annSongId: 41542 }] },
    },
    24085: {
      mainNames: {
        JA: "Kage no Jitsuryokusha ni Naritakute!",
        EN: "The Eminence in Shadow",
      },
    },
    27193: {
      mainNames: {
        JA: "Kage no Jitsuryokusha ni Naritakute! 2nd Season",
        EN: "The Eminence in Shadow Season 2",
      },
    },
  },
  songMap: { 75802: { name: "HHH-PLExKAGE MIX-", artist: "OxT" } },
};
test("AMQ working-title fields and all exact occurrence identities survive duplicate MP3 merging and storage", (t) => {
  const e = fixture(t);
  const prepared = prepareQuizSongs(
    [
      {
        songInfo: {
          annSongId: 41542,
          altAnimeNames: ["Working Extra"],
          altAnimeNamesAnswers: ["Another Accepted"],
        },
        videoUrl: "https://example.com/hhh.mp3",
        songName: "HHH-PLExKAGE MIX-",
      },
      {
        annSongId: 41542,
        audio: "https://example.com/hhh.mp3",
        altAnimeNamesAnswers: ["Second Row Title"],
      },
    ],
    master,
  );
  assert.equal(prepared.songs.length, 1);
  const s = prepared.songs[0];
  assert.ok(s.answers.includes("The Eminence in Shadow Season 2"));
  assert.ok(s.answers.includes("Another Accepted"));
  assert.ok(s.answers.includes("Second Row Title"));
  e.quiz.save({ id: "quiz", name: "Quiz", songs: prepared.songs });
  const stored = e.quiz.hostSongs("quiz").songs[0];
  assert.deepEqual(stored.sourceIds, s.sourceIds);
  assert.deepEqual(stored.workingTitles, s.workingTitles);
});
test("repair adds confirmed working answers to saved pools and unfinished runs once without changing scores or rewards", (t) => {
  const e = fixture(t);
  e.quiz.save({
    id: "quiz",
    name: "Quiz",
    songs: [
      {
        audio: "https://example.com/hhh.mp3",
        answers: ["Ple Ple Pleiades x Kagejitsu!"],
        title: "HHH-PLExKAGE MIX-",
        artist: "OxT",
      },
    ],
  });
  e.run(
    "INSERT INTO quiz_progress(player,quiz,best,at,best_at) VALUES('p','quiz',13,1,1)",
  );
  const run = {
    finished: false,
    songs: [
      {
        audio: "https://example.com/hhh.mp3",
        answers: ["Ple Ple Pleiades x Kagejitsu!"],
        sample: 0.2,
      },
    ],
    answers: [],
  };
  e.run(
    "INSERT INTO quiz_runs VALUES(?,?,?)",
    "p",
    "quiz",
    JSON.stringify(run),
  );
  const preview = repairQuizAnswers(e, master);
  assert.equal(preview.songs, 1);
  assert.equal(preview.rows[0].after.answers.length, 5);
  assert.throws(() => e.tx(() => repairQuizAnswers(e, master, true, "stale")), {
    status: 409,
  });
  const out = e.tx(() => repairQuizAnswers(e, master, true, preview.signature));
  assert.equal(out.addedAnswers, 4);
  assert.equal(e.quiz.hostSongs("quiz").songs[0].answers.length, 5);
  assert.equal(
    JSON.parse(e.one("SELECT data FROM quiz_runs").data).songs[0].answers
      .length,
    5,
  );
  assert.equal(e.one("SELECT best FROM quiz_progress").best, 13);
  assert.equal(
    e.tx(() => repairQuizAnswers(e, master, true, preview.signature))
      .alreadyApplied,
    true,
  );
});
test("quiz count has no thirty-quiz cap, categories persist and existing quizzes default to Singers", (t) => {
  const e = fixture(t);
  for (let i = 0; i < 35; i++)
    e.quiz.save({
      id: "q" + i,
      name: "Quiz" + i,
      category: i % 2 ? "singers" : "composers",
    });
  assert.equal(e.quiz.list("p", true).length, 35);
  assert.equal(
    e.quiz.list("p", true).filter((q) => q.category === "composers").length,
    18,
  );
  e.quiz.save({ id: "legacy", name: "Legacy" });
  assert.equal(
    e.one("SELECT category FROM quizzes WHERE id='legacy'").category,
    "singers",
  );
});
