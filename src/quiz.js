import { fail, integer, text } from "./engine.js";
import {
  QUIZ_LENGTH,
  QUIZ_SONG_MS,
  QUIZ_LEAD_IN_MS,
  QUIZ_ANSWER_GRACE_MS,
  quizAnswerKey,
  quizReward,
  validQuizAudio,
} from "../public/quiz-rules.js";
export class Quiz {
  constructor(e) {
    this.e = e;
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,name TEXT NOT NULL,cover TEXT NOT NULL,title TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL,updated INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS quiz_songs(quiz TEXT NOT NULL,id INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(quiz,id))",
      "CREATE TABLE IF NOT EXISTS quiz_answers(quiz TEXT NOT NULL,answer TEXT NOT NULL,key TEXT NOT NULL,PRIMARY KEY(quiz,key))",
      "CREATE INDEX IF NOT EXISTS quiz_answer_prefix ON quiz_answers(key)",
      "CREATE TABLE IF NOT EXISTS quiz_progress(player TEXT NOT NULL,quiz TEXT NOT NULL,best INTEGER NOT NULL DEFAULT 0,at INTEGER NOT NULL,PRIMARY KEY(player,quiz))",
      "CREATE TABLE IF NOT EXISTS quiz_runs(player TEXT NOT NULL,quiz TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(player,quiz))",
    ])
      e.run(sql);
  }
  isHost(player) {
    return !!player && !!this.e.player(player).is_admin;
  }
  list(player = null, host = false) {
    host = host || this.isHost(player);
    return this.e.all(
      "SELECT q.*,(SELECT count(*) FROM quiz_songs s WHERE s.quiz=q.id) AS songs,COALESCE(p.best,0) AS best FROM quizzes q LEFT JOIN quiz_progress p ON p.quiz=q.id AND p.player=? " +
        (host ? "" : "WHERE q.published=1 ") +
        "ORDER BY q.updated DESC,q.id",
      player || "",
    );
  }
  save(b) {
    const e = this.e,
      id = text(b.id || crypto.randomUUID(), 100),
      name = text(b.name, 100),
      title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : "";
    const existing = e.one("SELECT * FROM quizzes WHERE id=?", id);
    if (!existing && e.one("SELECT count(*) AS n FROM quizzes").n >= 30)
      fail("At most 30 quizzes can be configured.");
    const cover = b.cover ?? existing?.cover ?? "";
    if (
      typeof cover !== "string" ||
      cover.length > 400000 ||
      (cover &&
        !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(cover))
    )
      fail("Use a PNG, JPEG or WebP cover under 300 KB.");
    if (b.songs !== undefined) {
      if (!Array.isArray(b.songs) || b.songs.length > 2000)
        fail("Invalid quiz pool.");
      const normalized = [];
      for (const [index, s] of b.songs.entries()) {
        const audio = validQuizAudio(s.audio);
        if (
          !audio ||
          !Array.isArray(s.answers) ||
          !s.answers.length ||
          s.answers.length > 100
        )
          fail("A quiz song is invalid.");
        const answers = [...new Set(s.answers.map((a) => text(a, 300)))];
        normalized.push({
          id: index,
          audio,
          answers,
          title: text(s.title || "Unknown Song", 200),
          artist: String(s.artist || "").slice(0, 200),
        });
      }
      e.run("DELETE FROM quiz_songs WHERE quiz=?", id);
      e.run("DELETE FROM quiz_answers WHERE quiz=?", id);
      for (const song of normalized) {
        e.run(
          "INSERT INTO quiz_songs VALUES(?,?,?)",
          id,
          song.id,
          JSON.stringify(song),
        );
        for (const a of song.answers)
          e.run(
            "INSERT OR IGNORE INTO quiz_answers VALUES(?,?,?)",
            id,
            a,
            quizAnswerKey(a),
          );
      }
    }
    const count = e.one(
      "SELECT count(*) AS n FROM quiz_songs WHERE quiz=?",
      id,
    ).n;
    if (b.published && count < QUIZ_LENGTH)
      fail("At least 20 matched MP3 songs are needed before publishing.");
    e.run(
      "INSERT INTO quizzes VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,cover=excluded.cover,title=excluded.title,published=excluded.published,source=excluded.source,updated=excluded.updated",
      id,
      name,
      cover,
      title,
      b.published ? 1 : 0,
      String(b.source || existing?.source || ""),
      e.now(),
    );
    return {
      id,
      message:
        (b.published ? "Quiz Published" : "Quiz Draft Saved") +
        " · " +
        count +
        " matched MP3 songs.",
      songs: count,
      rejected: b.rejected || [],
    };
  }
  definition(id, player = null) {
    const q = this.e.one("SELECT * FROM quizzes WHERE id=?", text(id, 100));
    if (!q || (!q.published && !this.isHost(player)))
      fail("That quiz is not available.", 404);
    return q;
  }
  run(player, id) {
    const r = this.e.one(
      "SELECT data FROM quiz_runs WHERE player=? AND quiz=?",
      player,
      id,
    );
    return r ? JSON.parse(r.data) : null;
  }
  persist(player, id, run) {
    this.e.run(
      "INSERT OR REPLACE INTO quiz_runs VALUES(?,?,?)",
      player,
      id,
      JSON.stringify(run),
    );
  }
  view(player, id) {
    const q = this.definition(id, player);
    const run = this.run(player, id);
    const now = this.e.now();
    if (!run) return { now, run: null };
    const score = run.answers.filter((a) => a.correct).length;
    if (run.finished)
      return {
        now,
        run: {
          id: run.id,
          index: 20,
          score,
          finished: true,
          reward: run.reward,
          preview: !!run.preview || !q.published,
        },
      };
    const song = run.songs[run.index],
      answer = run.answers[run.index];
    return {
      now,
      run: {
        id: run.id,
        index: run.index,
        score,
        finished: false,
        audio: song.audio,
        sample: song.sample,
        preview: !!run.preview || !q.published,
        startsAt: run.timing?.index === run.index ? run.timing.startsAt : null,
        endsAt: run.timing?.index === run.index ? run.timing.endsAt : null,
        answered: !!answer,
        ...(answer
          ? {
              correct: answer.correct,
              timedOut: !!answer.timedOut,
              answer: song.answers[0],
              songTitle: song.title,
              artist: song.artist,
            }
          : {}),
      },
    };
  }
  answerBank(id, player = null, page = 1) {
    const q = this.definition(id, player);
    integer(page, 1, 10000);
    const rows = this.e.all(
      "SELECT answer FROM quiz_answers WHERE quiz=? ORDER BY key LIMIT 1001 OFFSET ?",
      id,
      (page - 1) * 1000,
    );
    return {
      page,
      version: q.updated,
      answers: rows.slice(0, 1000).map((r) => r.answer),
      hasMore: rows.length > 1000,
    };
  }
  suggestions(id, q, player = null) {
    this.definition(id, player);
    const key = quizAnswerKey(q);
    if (key.length < 2) return { answers: [] };
    return {
      answers: this.e
        .all(
          "SELECT answer FROM quiz_answers WHERE quiz=? AND key LIKE ? ESCAPE '\\' ORDER BY key LIMIT 20",
          id,
          key.replace(/[\\%_]/g, "\\$&") + "%",
        )
        .map((r) => r.answer),
    };
  }
  action(player, action, b) {
    const q = this.definition(b.quiz, player),
      e = this.e;
    let run = this.run(player, q.id);
    if (action === "quiz-start") {
      if (run && !run.finished && !!run.preview === !q.published)
        return { ...this.view(player, q.id), message: "Quiz Resumed" };
      const pool = e
        .all("SELECT data FROM quiz_songs WHERE quiz=? ORDER BY id", q.id)
        .map((r) => JSON.parse(r.data));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = e.rand(i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      if (pool.length < 20) fail("This quiz needs at least 20 songs.");
      run = {
        id: crypto.randomUUID(),
        index: 0,
        songs: pool
          .slice(0, 20)
          .map((s) => ({ ...s, sample: (10 + e.rand(61)) / 100 })),
        answers: [],
        finished: false,
        preview: !q.published,
        timing: null,
      };
      this.persist(player, q.id, run);
      return { ...this.view(player, q.id), message: "Quiz Started" };
    }
    if (!run || run.finished || run.id !== b.run || run.index !== b.index)
      fail("The question changed. Refresh the quiz.", 409);
    if (action === "quiz-ready") {
      if (
        !run.answers[run.index] &&
        (!run.timing || run.timing.index !== run.index)
      ) {
        const startsAt = e.now() + (run.index === 0 ? QUIZ_LEAD_IN_MS : 0);
        run.timing = {
          index: run.index,
          startsAt,
          endsAt: startsAt + QUIZ_SONG_MS,
        };
        this.persist(player, q.id, run);
      }
      return { ...this.view(player, q.id), message: "Song Ready" };
    }
    if (action === "quiz-answer") {
      if (run.answers[run.index]) fail("This answer is already locked.", 409);
      if (!b.skip && (!run.timing || run.timing.index !== run.index))
        fail("Wait for the audio to load.", 409);
      if (!b.skip && e.now() < run.timing.startsAt)
        fail("Wait for the starting countdown.", 409);
      // One second covers a submission sent at zero arriving over the network.
      const timedOut =
        !b.skip && e.now() > run.timing.endsAt + QUIZ_ANSWER_GRACE_MS;
      const answer =
        timedOut || b.skip ? "" : String(b.answer || "").slice(0, 300);
      run.answers.push({
        answer,
        timedOut,
        correct:
          !!answer &&
          run.songs[run.index].answers.some(
            (a) => quizAnswerKey(a) === quizAnswerKey(answer),
          ),
      });
    } else if (action === "quiz-next") {
      if (!run.answers[run.index]) fail("Lock an answer first.");
      if (run.index === 19) {
        const score = run.answers.filter((a) => a.correct).length;
        const previous =
          e.one(
            "SELECT best FROM quiz_progress WHERE player=? AND quiz=?",
            player,
            q.id,
          )?.best || 0;
        const reward = quizReward(previous, score);
        const preview = !!run.preview || !q.published;
        if (!preview) {
          if (reward.improvement + reward.milestones)
            e.wallet(
              player,
              reward.improvement + reward.milestones,
              "Quiz: " + q.name + " · " + score + "/20",
              true,
            );
          e.run(
            "INSERT INTO quiz_progress VALUES(?,?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=excluded.best,at=excluded.at",
            player,
            q.id,
            reward.best,
            e.now(),
          );
        }
        run.finished = true;
        run.preview = preview;
        run.reward = preview
          ? {
              best: score,
              improvement: 0,
              milestones: 0,
              total: 0,
              title: "",
              preview: true,
            }
          : {
              ...reward,
              total: reward.improvement + reward.milestones,
              title: score === 20 ? q.title : "",
            };
      } else {
        run.index++;
        run.timing = null;
      }
    } else fail("Unknown quiz action.", 404);
    this.persist(player, q.id, run);
    return {
      ...this.view(player, q.id),
      message: run.finished ? "Quiz Complete" : "Answer Updated",
      me: e.player(player),
    };
  }
  titles(player) {
    return this.e.all(
      "SELECT q.id AS quiz,q.title FROM quiz_progress p JOIN quizzes q ON q.id=p.quiz WHERE p.player=? AND p.best=20 AND q.title!='' ORDER BY p.at",
      player,
    );
  }
}
