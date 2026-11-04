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
      "CREATE TABLE IF NOT EXISTS quiz_reward_history(player TEXT NOT NULL,quiz TEXT NOT NULL,best INTEGER NOT NULL,PRIMARY KEY(player,quiz))",
      "CREATE TABLE IF NOT EXISTS profile_title_preferences(player TEXT NOT NULL,quiz TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),PRIMARY KEY(player,quiz))",
    ])
      e.run(sql);
    if (
      !e
        .all("PRAGMA table_info(quiz_progress)")
        .some((c) => c.name === "best_at")
    )
      e.run("ALTER TABLE quiz_progress ADD COLUMN best_at INTEGER");
    e.run(
      "CREATE INDEX IF NOT EXISTS quiz_leaderboard ON quiz_progress(quiz,best DESC,best_at,player)",
    );
  }
  bestTime(player, quiz, best, fallback) {
    return (
      this.e.one(
        "SELECT MIN(at) AS first FROM receipts WHERE scope=? AND json_extract(input,'$.quiz')=? AND json_extract(result,'$.run.finished')=1 AND json_extract(result,'$.run.score')>=?",
        player + ":quiz-next",
        quiz,
        best,
      )?.first || fallback
    );
  }
  leaderboard(id, player = null, page = 1) {
    this.definition(id, player);
    integer(page, 1, 10000);
    const missing = this.e.all(
      "SELECT player,best,at FROM quiz_progress WHERE quiz=? AND best_at IS NULL",
      id,
    );
    if (missing.length)
      this.e.tx(() => {
        for (const row of missing)
          this.e.run(
            "UPDATE quiz_progress SET best_at=? WHERE player=? AND quiz=? AND best_at IS NULL",
            this.bestTime(row.player, id, row.best, row.at),
            row.player,
            id,
          );
      });
    const rows = this.e.all(
      "SELECT p.player AS id,COALESCE(u.display_name,u.name) AS name,p.best,p.best_at AS bestAt FROM quiz_progress p JOIN players u ON u.id=p.player WHERE p.quiz=? ORDER BY p.best DESC,p.best_at,p.player LIMIT 21 OFFSET ?",
      id,
      (page - 1) * 20,
    );
    return {
      rows: rows.slice(0, 20),
      page,
      hasMore: rows.length > 20,
      total: this.e.one(
        "SELECT count(*) AS n FROM quiz_progress WHERE quiz=?",
        id,
      ).n,
    };
  }
  resetScores(b) {
    const id = text(b.quiz, 100);
    if (!this.e.one("SELECT id FROM quizzes WHERE id=?", id))
      fail("Quiz was not found.", 404);
    if (b.confirmation !== "RESET QUIZ SCORES AND TITLES")
      fail("Confirm resetting this quiz’s scores and titles.");
    const count = this.e.one(
      "SELECT count(*) AS n FROM quiz_progress WHERE quiz=?",
      id,
    ).n;
    for (const row of this.e.all(
      "SELECT player,best FROM quiz_progress WHERE quiz=?",
      id,
    ))
      this.e.run(
        "INSERT INTO quiz_reward_history VALUES(?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=MAX(best,excluded.best)",
        row.player,
        id,
        row.best,
      );
    for (const table of [
      "quiz_progress",
      "quiz_runs",
      "profile_title_preferences",
    ])
      this.e.run("DELETE FROM " + table + " WHERE quiz=?", id);
    return {
      message:
        "Quiz scores, active runs and completion titles reset. Existing credits and claimed rewards retained.",
      players: count,
    };
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
  hostSongs(id) {
    const quiz = this.e.one(
      "SELECT id,updated FROM quizzes WHERE id=?",
      text(id, 100),
    );
    if (!quiz) fail("Quiz was not found.", 404);
    return {
      ...quiz,
      songs: this.e
        .all("SELECT data FROM quiz_songs WHERE quiz=? ORDER BY id", id)
        .map((row) => JSON.parse(row.data)),
    };
  }
  save(b) {
    const e = this.e,
      id = text(b.id || crypto.randomUUID(), 100),
      name = text(b.name, 100),
      title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : "";
    const existing = e.one("SELECT * FROM quizzes WHERE id=?", id);
    if (
      existing &&
      b.expectedUpdated !== undefined &&
      b.expectedUpdated !== existing.updated
    )
      fail(
        "This quiz changed. Select it again and review the current songs.",
        409,
      );
    if (b.songMode !== undefined && !["append", "replace"].includes(b.songMode))
      fail("Choose add songs or replace pool.");
    const removed = b.removeSongIds || [];
    if (
      !Array.isArray(removed) ||
      removed.length > 2000 ||
      removed.some((id) => !Number.isInteger(id) || id < 0)
    )
      fail("Invalid song removal selection.");
    if (
      existing &&
      (removed.length || b.songMode === "append") &&
      b.expectedUpdated === undefined
    )
      fail("Load the current pool before editing it.", 409);
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
    if (b.songs !== undefined || removed.length) {
      if (
        b.songs !== undefined &&
        (!Array.isArray(b.songs) ||
          b.songs.some((song) => !song || typeof song !== "object"))
      )
        fail("Invalid quiz pool.");
      const saved = existing ? this.hostSongs(id).songs : [];
      if (removed.some((id) => !saved.some((song) => song.id === id)))
        fail("A selected song no longer exists. Reload the quiz.", 409);
      const kept = saved.filter((song) => !removed.includes(song.id));
      const incoming =
        b.songs === undefined
          ? kept
          : b.songMode === "append"
            ? [...kept, ...b.songs]
            : b.songs;
      if (!Array.isArray(incoming)) fail("Invalid quiz pool.");
      b = {
        ...b,
        songs: [
          ...new Map(incoming.map((song) => [song.audio, song])).values(),
        ],
      };
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
      Math.max(e.now(), (existing?.updated || 0) + 1),
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
              submittedAnswer: answer.submittedAnswer ?? answer.answer,
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
    if (action === "quiz-start" || action === "quiz-restart") {
      if (
        action === "quiz-restart" &&
        (!run || run.finished || run.id !== b.run || run.index !== b.index)
      )
        fail("The quiz run changed. Refresh before restarting.", 409);
      if (
        action === "quiz-start" &&
        run &&
        !run.finished &&
        !!run.preview === !q.published
      )
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
      const submittedAnswer = b.skip
        ? ""
        : String(b.answer || "").slice(0, 300);
      const answer = timedOut ? "" : submittedAnswer;
      run.answers.push({
        answer,
        submittedAnswer,
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
        const previous = e.one(
          "SELECT best,at,best_at FROM quiz_progress WHERE player=? AND quiz=?",
          player,
          q.id,
        );
        const paid =
          e.one(
            "SELECT best FROM quiz_reward_history WHERE player=? AND quiz=?",
            player,
            q.id,
          )?.best ??
          previous?.best ??
          0;
        const reward = quizReward(paid, score),
          displayBest = Math.max(previous?.best || 0, score);
        const preview = !!run.preview || !q.published;
        if (!preview) {
          if (reward.improvement + reward.milestones)
            e.wallet(
              player,
              reward.improvement + reward.milestones,
              "Quiz: " + q.name + " · " + score + "/20",
              true,
            );
          const bestAt =
            !previous || score > previous.best
              ? e.now()
              : (previous.best_at ??
                this.bestTime(player, q.id, previous.best, previous.at));
          e.run(
            "INSERT INTO quiz_progress(player,quiz,best,at,best_at) VALUES(?,?,?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=excluded.best,at=excluded.at,best_at=excluded.best_at",
            player,
            q.id,
            displayBest,
            e.now(),
            bestAt,
          );
          e.run(
            "INSERT INTO quiz_reward_history VALUES(?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=MAX(best,excluded.best)",
            player,
            q.id,
            reward.best,
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
              best: displayBest,
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
  titleOptions(player) {
    return this.e
      .all(
        "SELECT q.id AS quiz,q.title,q.name AS quizName,COALESCE(t.hidden,0) AS hidden FROM quiz_progress p JOIN quizzes q ON q.id=p.quiz LEFT JOIN profile_title_preferences t ON t.player=p.player AND t.quiz=p.quiz WHERE p.player=? AND p.best=20 AND q.title!='' ORDER BY p.at,q.id",
        player,
      )
      .map(({ hidden, ...title }) => ({ ...title, equipped: !hidden }));
  }
  titleSettings(player) {
    return {
      role: this.e.player(player).role,
      titles: this.titleOptions(player),
    };
  }
  equipTitles(player, b) {
    const earned = this.titleOptions(player);
    if (
      !Array.isArray(b.quizzes) ||
      b.quizzes.length > 30 ||
      b.quizzes.some(
        (id) => typeof id !== "string" || !earned.some((t) => t.quiz === id),
      ) ||
      new Set(b.quizzes).size !== b.quizzes.length
    )
      fail("Choose only titles you have earned.");
    this.e.run("DELETE FROM profile_title_preferences WHERE player=?", player);
    for (const title of earned)
      if (!b.quizzes.includes(title.quiz))
        this.e.run(
          "INSERT INTO profile_title_preferences VALUES(?,?,1)",
          player,
          title.quiz,
        );
    return {
      ...this.titleSettings(player),
      message: "Displayed titles updated.",
    };
  }
  titles(player) {
    return this.titleOptions(player)
      .filter((t) => t.equipped)
      .map(({ quiz, title }) => ({ quiz, title }));
  }
}
