import { quizRunView, advanceQuizRun } from "./quiz-run-state.js";
import { titleOrderKey } from "../public/title-order.js";
import {mergeQuizAnswers} from '../public/quiz-answer-index.js';
import { searchSql } from "./search.js";
import { fail, integer, text } from "./engine.js";
import {
  QUIZ_LENGTH,
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
      "CREATE TABLE IF NOT EXISTS quiz_favorites(player TEXT NOT NULL,quiz TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(player,quiz))",
      "CREATE INDEX IF NOT EXISTS quiz_favorites_quiz ON quiz_favorites(quiz)",
      "CREATE TABLE IF NOT EXISTS quiz_reward_history(player TEXT NOT NULL,quiz TEXT NOT NULL,best INTEGER NOT NULL,PRIMARY KEY(player,quiz))",
      "CREATE TABLE IF NOT EXISTS profile_title_preferences(player TEXT NOT NULL,quiz TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),PRIMARY KEY(player,quiz))",
      "CREATE TABLE IF NOT EXISTS profile_title_order(player TEXT PRIMARY KEY,data TEXT NOT NULL)",
      "DROP INDEX IF EXISTS quiz_completion_scores",
    ])
      e.run(sql);
    if (!e.all("PRAGMA table_info(quizzes)").some((c) => c.name === "category"))
      e.run(
        "ALTER TABLE quizzes ADD COLUMN category TEXT NOT NULL DEFAULT 'singers'",
      );
    if (
      !e
        .all("PRAGMA table_info(quiz_progress)")
        .some((c) => c.name === "best_at")
    )
      e.run("ALTER TABLE quiz_progress ADD COLUMN best_at INTEGER");
    if (
      !e
        .all("PRAGMA table_info(quiz_progress)")
        .some((c) => c.name === "best_duration_ms")
    )
      e.run("ALTER TABLE quiz_progress ADD COLUMN best_duration_ms INTEGER");
    e.run(
      "CREATE INDEX IF NOT EXISTS quiz_leaderboard_speed ON quiz_progress(quiz,best DESC,COALESCE(best_duration_ms,9007199254740991),best_at,player)",
    );
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
  ensureBestAt(id, inTx = false) {
    const missing = this.e.all(
      "SELECT player,best,at FROM quiz_progress WHERE quiz=? AND best_at IS NULL",
      id,
    );
    if (!missing.length) return;
    const apply = () => {
      for (const row of missing)
        this.e.run(
          "UPDATE quiz_progress SET best_at=? WHERE player=? AND quiz=? AND best_at IS NULL",
          this.bestTime(row.player, id, row.best, row.at),
          row.player,
          id,
        );
    };
    if (inTx) apply();
    else this.e.tx(apply);
  }
  topLeader(id, inTx = false) {
    this.ensureBestAt(id, inTx);
    return (
      this.e.one(
        "SELECT p.player AS id,COALESCE(u.display_name,u.name) AS name,p.best,p.best_at AS bestAt,p.best_duration_ms AS durationMs FROM quiz_progress p JOIN players u ON u.id=p.player WHERE p.quiz=? ORDER BY p.best DESC,COALESCE(p.best_duration_ms,9007199254740991),p.best_at,p.player LIMIT 1",
        id,
      ) || null
    );
  }
  leaderboard(id, player = null, page = 1) {
    this.definition(id, player);
    integer(page, 1, 10000);
    this.ensureBestAt(id);
    const rows = this.e.all(
      "SELECT p.player AS id,COALESCE(u.display_name,u.name) AS name,p.best,p.best_at AS bestAt,p.best_duration_ms AS durationMs FROM quiz_progress p JOIN players u ON u.id=p.player WHERE p.quiz=? ORDER BY p.best DESC,COALESCE(p.best_duration_ms,9007199254740991),p.best_at,p.player LIMIT 21 OFFSET ?",
      id,
      (page - 1) * 20,
    );
    const pageRows = rows.slice(0, 20);
    let me = null;
    if (player) {
      const idx = pageRows.findIndex((r) => r.id === player);
      if (idx >= 0) {
        me = { ...pageRows[idx], rank: (page - 1) * 20 + idx + 1 };
      } else {
        const own = this.e.one(
          "SELECT p.player AS id,COALESCE(u.display_name,u.name) AS name,p.best,p.best_at AS bestAt,p.best_duration_ms AS durationMs FROM quiz_progress p JOIN players u ON u.id=p.player WHERE p.quiz=? AND p.player=?",
          id,
          player,
        );
        if (own) {
          const ownDuration = own.durationMs ?? 9007199254740991;
          const rank =
            1 +
            this.e.one(
              "SELECT count(*) AS n FROM quiz_progress p JOIN players u ON u.id=p.player WHERE p.quiz=? AND (p.best>? OR (p.best=? AND COALESCE(p.best_duration_ms,9007199254740991)<?) OR (p.best=? AND COALESCE(p.best_duration_ms,9007199254740991)=? AND (p.best_at<? OR (p.best_at=? AND p.player<?))))",
              id,
              own.best,
              own.best,
              ownDuration,
              own.best,
              ownDuration,
              own.bestAt,
              own.bestAt,
              own.id,
            ).n;
          me = { ...own, rank };
        }
      }
    }
    return {
      rows: pageRows,
      me,
      page,
      hasMore: rows.length > 20,
      total: this.e.one(
        "SELECT count(*) AS n FROM quiz_progress WHERE quiz=?",
        id,
      ).n,
    };
  }
  profileStats(player) {
    // Only legacy quizzes with missing achievement timestamps need reconciliation.
    const missing=this.e.all("SELECT DISTINCT p.quiz FROM quiz_progress p JOIN quiz_progress mine ON mine.quiz=p.quiz JOIN quizzes q ON q.id=p.quiz WHERE mine.player=? AND q.published=1 AND p.best_at IS NULL",player);
    for(const {quiz} of missing)this.ensureBestAt(quiz);
    const rows=this.e.all(`SELECT q.id,q.name,q.category,p.best AS score,p.best_duration_ms AS durationMs,
      NOT EXISTS(SELECT 1 FROM quiz_progress r JOIN players u ON u.id=r.player WHERE r.quiz=p.quiz AND
        (r.best>p.best OR (r.best=p.best AND
          (COALESCE(r.best_duration_ms,9007199254740991)<COALESCE(p.best_duration_ms,9007199254740991) OR
           (COALESCE(r.best_duration_ms,9007199254740991)=COALESCE(p.best_duration_ms,9007199254740991) AND
            (r.best_at<p.best_at OR (r.best_at=p.best_at AND r.player<p.player))))))) AS firstPlace
      FROM quiz_progress p JOIN quizzes q ON q.id=p.quiz WHERE p.player=? AND q.published=1 ORDER BY q.name COLLATE NOCASE,q.id`,player);
    const timed=rows.filter(r=>Number.isSafeInteger(r.durationMs)&&r.durationMs>=0);
    const firsts=rows.filter(r=>r.firstPlace).map(({firstPlace,...r})=>r);
    return {player,played:rows.length,maxScores:rows.filter(r=>r.score===QUIZ_LENGTH).length,
      averageScore:rows.length?Number((rows.reduce((n,r)=>n+r.score,0)/rows.length).toFixed(2)):null,
      firstPlaces:firsts.length,averageTimeMs:timed.length?Math.round(timed.reduce((n,r)=>n+r.durationMs,0)/timed.length):null,
      timedQuizzes:timed.length,firsts};
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
    this.e.run(
      "DELETE FROM player_notices WHERE kind='quiz-leader-beaten' AND json_extract(metadata,'$.quiz')=?",
      id,
    );
    this.statisticsCache = null;
    return {
      message:
        "Quiz scores, active runs and completion titles reset. Existing credits and claimed rewards retained.",
      players: count,
    };
  }
  deleteQuiz(b) {
    const id = text(b.quiz, 100);
    const quiz = this.e.one("SELECT id,name FROM quizzes WHERE id=?", id);
    if (!quiz) fail("Quiz was not found.", 404);
    if (b.confirmation !== "DELETE QUIZ")
      fail("Confirm deleting this quiz.");
    for (const table of [
      "quiz_songs",
      "quiz_answers",
      "quiz_progress",
      "quiz_runs",
      "quiz_favorites",
      "quiz_reward_history",
      "profile_title_preferences",
    ])
      this.e.run("DELETE FROM " + table + " WHERE quiz=?", id);
    const key = "quiz:" + id;
    for (const row of this.e.all(
      "SELECT player,data FROM profile_title_order WHERE instr(data,?)>0",
      key,
    )) {
      const order = JSON.parse(row.data);
      if (Array.isArray(order))
        this.e.run(
          "UPDATE profile_title_order SET data=? WHERE player=?",
          JSON.stringify(order.filter((item) => item !== key)),
          row.player,
        );
    }
    this.e.run(
      "DELETE FROM player_notices WHERE kind='quiz-leader-beaten' AND json_extract(metadata,'$.quiz')=?",
      id,
    );
    this.e.run("DELETE FROM quizzes WHERE id=?", id);
    this.statisticsCache = null;
    return {
      message: `Quiz “${quiz.name}” deleted.`,
      id,
    };
  }
  isHost(player) {
    return !!player && !!this.e.player(player).is_admin;
  }
  statistics() {
    // Progress has one personal-best row per player/quiz, so retries cannot
    // give a player extra weight. The existing leaderboard index covers this.
    const now = this.e.now();
    if (this.statisticsCache?.until > now) return this.statisticsCache.rows;
    const rows = new Map(
      this.e.all(
        "SELECT quiz,COUNT(*) AS scoreCount,AVG(best) AS averageScore FROM quiz_progress INDEXED BY quiz_leaderboard GROUP BY quiz",
      ).map(({ quiz, ...stats }) => [quiz, stats]),
    );
    this.statisticsCache = { until: now + 60000, rows };
    return rows;
  }
  list(player = null, host = false) {
    host = host || this.isHost(player);
    const rows = this.e.all(
      "SELECT q.id,q.name,q.title,q.published,q.source,q.updated,q.category,(length(q.cover)>0) AS has_cover" +
        ",(SELECT count(*) FROM quiz_songs s WHERE s.quiz=q.id) AS songs,COALESCE(p.best,0) AS best,CASE WHEN p.player IS NOT NULL THEN 1 ELSE 0 END AS played,CASE WHEN f.player IS NOT NULL THEN 1 ELSE 0 END AS favorited FROM quizzes q LEFT JOIN quiz_progress p ON p.quiz=q.id AND p.player=? LEFT JOIN quiz_favorites f ON f.quiz=q.id AND f.player=? " +
        (host ? "" : "WHERE q.published=1 ") +
        "ORDER BY q.updated DESC,q.id",
      player || "",
      player || "",
    );
    const statistics = this.statistics();
    return rows.map(({ has_cover, ...row }) => {
      const stats = statistics.get(row.id) || { scoreCount: 0, averageScore: null };
      return {
        ...row,
        ...stats,
        cover: has_cover ? "api/quiz-cover?quiz=" + encodeURIComponent(row.id) + "&v=" + row.updated : "",
        // Retain the old wire field for clients already open during rollout.
        completedRuns: stats.scoreCount,
      };
    });
  }
  cover(id, player, version) {
    const quiz = this.e.one(
      "SELECT cover,published,updated FROM quizzes WHERE id=?",
      text(id, 100),
    );
    if (
      !quiz ||
      (!quiz.published && !this.isHost(player)) ||
      String(quiz.updated) !== String(version)
    )
      fail("Quiz cover was not found.", 404);
    const match =
      /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(
        quiz.cover,
      );
    if (!match) fail("Quiz cover was not found.", 404);
    return { type: match[1], base64: match[2], published: !!quiz.published };
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
    const category = b.category ?? existing?.category ?? "singers";
    if (!["singers", "composers"].includes(category))
      fail("Choose Singers or Composers.");
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
      const combined = new Map();
      for (const song of incoming) {
        const old = combined.get(song.audio);
        combined.set(
          song.audio,
          old
            ? {
                ...old,
                ...song,
                answers:mergeQuizAnswers(old,song),
                answerSource:old.answerSource==='amq-export'||song.answerSource==='amq-export'?'amq-export':song.answerSource||old.answerSource,
                workingTitles: [
                  ...new Set([
                    ...(old.workingTitles || []),
                    ...(song.workingTitles || []),
                  ]),
                ],
                sourceIds: Object.fromEntries(
                  ["amqSongIds", "annSongIds", "annIds"].map((k) => [
                    k,
                    [
                      ...new Set([
                        ...(old.sourceIds?.[k] || []),
                        ...(song.sourceIds?.[k] || []),
                      ]),
                    ],
                  ]),
                ),
              }
            : song,
        );
      }
      b = { ...b, songs: [...combined.values()] };
      if (!Array.isArray(b.songs) || b.songs.length > 2000)
        fail("Invalid quiz pool.");
      const normalized = [];
      for (const [index, s] of b.songs.entries()) {
        const audio = validQuizAudio(s.audio);
        if (
          !audio ||
          !Array.isArray(s.answers) ||
          !s.answers.length ||
          s.answers.length > 1000
        )
          fail("A quiz song is invalid.");
        const answers = [...new Set(s.answers.map((a) => text(a, 300)))];
        normalized.push({
          id: index,
          audio,
          answers,
          ...(s.sourceIds ? { sourceIds: s.sourceIds } : {}),
          ...(s.workingTitles ? { workingTitles: s.workingTitles } : {}),
          ...(s.answerSource?{answerSource:s.answerSource}:{}),
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
      "INSERT INTO quizzes(id,name,cover,title,published,source,updated,category) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,cover=excluded.cover,title=excluded.title,published=excluded.published,source=excluded.source,updated=excluded.updated,category=excluded.category",
      id,
      name,
      cover,
      title,
      b.published ? 1 : 0,
      String(b.source || existing?.source || ""),
      Math.max(e.now(), (existing?.updated || 0) + 1),
      category,
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
    const q = this.e.one(
      "SELECT id,name,title,published,source,updated,category FROM quizzes WHERE id=?",
      text(id, 100),
    );
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
    return this.runView(q, this.run(player, q.id));
  }
  runView(q, run) {
    return quizRunView(q, run, this.e.now());
  }

  songs(id, player = null) {
    const q = this.definition(id, player);
    return {
      id: q.id,
      name: q.name,
      updated: q.updated,
      songs: this.e
        .all("SELECT data FROM quiz_songs WHERE quiz=? ORDER BY id", q.id)
        .map((row) => {
          const s = JSON.parse(row.data);
          return {
            id: s.id,
            title: s.title || "Unknown Song",
            artist: s.artist || "",
            anime: s.answers?.[0] || "",
            answers: s.answers || [],
            workingTitles: [...new Set([...(s.answers || []), ...(s.workingTitles || [])])],
          };
        }),
    };
  }
  favorite(player, b) {
    const q = this.definition(b.quiz, player);
    if (typeof b.favorited !== "boolean") fail("Choose whether to favorite this quiz.");
    if (b.favorited)
      this.e.run("INSERT OR IGNORE INTO quiz_favorites(player,quiz,created) VALUES(?,?,?)", player, q.id, this.e.now());
    else this.e.run("DELETE FROM quiz_favorites WHERE player=? AND quiz=?", player, q.id);
    return { quiz: q.id, favorited: b.favorited };
  }
  audioManifest(id, player) {
    const q = this.definition(id, player);
    const audio = this.e
      .all("SELECT data FROM quiz_songs WHERE quiz=? ORDER BY id", id)
      .map(row => JSON.parse(row.data).audio);
    // Download order is independent of the public Song List and play order.
    for (let i = audio.length - 1; i > 0; i--) {
      const j = this.e.rand(i + 1);
      [audio[i], audio[j]] = [audio[j], audio[i]];
    }
    return { version: q.updated, audio };
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
    const search = searchSql("answer", key);
    return {
      answers: this.e
        .all(
          `SELECT answer FROM quiz_answers WHERE quiz=? AND (${search.where}) ORDER BY key LIMIT 20`,
          id,
          ...search.args,
        )
        .map((r) => r.answer),
    };
  }
  action(player, action, b, context = {}) {
    const q = this.definition(b.quiz, player),
      e = this.e;
    let run = this.run(player, q.id);
    if (action === "quiz-stop") {
      if (run?.answers.length === 20 && !run.finished)
        fail(
          "All songs are answered. Finish Quiz to collect your result.",
          409,
        );
      if (run && (run.finished || run.id !== b.run || run.index !== b.index))
        fail("The quiz run changed. Refresh before stopping.", 409);
      e.run("DELETE FROM quiz_runs WHERE player=? AND quiz=?", player, q.id);
      return {
        now: e.now(),
        run: null,
        message:
          "Quiz stopped. Your personal best and earned rewards were kept.",
      };
    }
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
        return { ...this.runView(q, run), message: "Quiz Resumed" };
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
        startedAt: e.now(),
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
      return { ...this.runView(q, run), message: "Quiz Started" };
    }
    if (!run || run.finished || run.id !== b.run || run.index !== b.index)
      fail("The question changed. Refresh the quiz.", 409);
    if (run.fast && context.verifiedSession !== true)
      fail("Continue through the quiz session.", 409);
    if (["quiz-ready", "quiz-answer"].includes(action)) {
      advanceQuizRun(run, action, b, e.now(), context.quizAnswerReceivedAt);
      this.persist(player, q.id, run);
      return { ...this.runView(q, run), message: action === "quiz-ready" ? "Song Ready" : "Answer Updated" };
    }
    if (action === "quiz-next") {
      if (!run.answers[run.index]) fail("Lock an answer first.");
      if (run.index === 19) {
        const score = run.answers.filter((a) => a.correct).length;
        const previous = e.one(
          "SELECT best,at,best_at,best_duration_ms FROM quiz_progress WHERE player=? AND quiz=?",
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
          const faster =
            score === previous?.best &&
            run.durationMs !== null &&
            run.durationMs !== undefined &&
            (previous.best_duration_ms === null ||
              run.durationMs < previous.best_duration_ms);
          const improved = !previous || score > previous.best || faster;
          const previousLeader = improved ? this.topLeader(q.id, true) : null;
          const bestAt = improved
            ? (run.completedAt ?? e.now())
            : (previous.best_at ??
              this.bestTime(player, q.id, previous.best, previous.at));
          const duration = improved
            ? (run.durationMs ?? null)
            : previous.best_duration_ms;
          e.run(
            "INSERT INTO quiz_progress(player,quiz,best,at,best_at,best_duration_ms) VALUES(?,?,?,?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=excluded.best,at=excluded.at,best_at=excluded.best_at,best_duration_ms=excluded.best_duration_ms",
            player,
            q.id,
            displayBest,
            e.now(),
            bestAt,
            duration,
          );
          if (improved && previousLeader && previousLeader.id !== player) {
            const newLeader = this.topLeader(q.id, true);
            if (newLeader?.id === player) {
              const hasCover = !!e.one(
                "SELECT length(cover)>0 AS has_cover FROM quizzes WHERE id=?",
                q.id,
              )?.has_cover;
              e.economy.notices.add(
                previousLeader.id,
                `quiz-leader-beaten:${q.id}:${run.id}`,
                "quiz-leader-beaten",
                "",
                1,
                0,
                {
                  quiz: q.id,
                  quizName: q.name,
                  cover: hasCover
                    ? "api/quiz-cover?quiz=" +
                      encodeURIComponent(q.id) +
                      "&v=" +
                      q.updated
                    : "",
                  byId: newLeader.id,
                  byName: newLeader.name,
                  score: newLeader.best,
                  durationMs: newLeader.durationMs ?? null,
                  previousScore: previousLeader.best,
                  previousDurationMs: previousLeader.durationMs ?? null,
                },
              );
            }
          }
          e.run(
            "INSERT INTO quiz_reward_history VALUES(?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=MAX(best,excluded.best)",
            player,
            q.id,
            reward.best,
          );
        }
        run.finished = true;
        this.statisticsCache = null;
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
        advanceQuizRun(run, action, b, e.now());
      }
    } else fail("Unknown quiz action.", 404);
    this.persist(player, q.id, run);
    return {
      ...this.runView(q, run),
      message: run.finished ? "Quiz Complete" : "Answer Updated",
      ...(run.finished ? { me: e.player(player) } : {}),
    };
  }
  titleOptions(player) {
    const titles = [
      ...this.e
        .all(
          "SELECT q.id AS quiz,q.title,q.name AS quizName,p.best_duration_ms AS durationMs,COALESCE(t.hidden,0) AS hidden FROM quiz_progress p JOIN quizzes q ON q.id=p.quiz LEFT JOIN profile_title_preferences t ON t.player=p.player AND t.quiz=p.quiz WHERE p.player=? AND p.best=20 AND q.title!='' ORDER BY p.at,q.id",
          player,
        )
        .map(({ hidden, ...title }) => ({ ...title, premium:Number.isSafeInteger(title.durationMs)&&title.durationMs>=0&&title.durationMs<60000,equipped: !hidden })),
      ...this.e.cardTitles.options(player),
    ];
    const row = this.e.one(
      "SELECT data FROM profile_title_order WHERE player=?",
      player,
    );
    if (!row) return titles;
    const positions = new Map(JSON.parse(row.data).map((id, i) => [id, i]));
    return titles.sort(
      (a, b) =>
        (positions.get(titleOrderKey(a)) ?? Number.MAX_SAFE_INTEGER) -
        (positions.get(titleOrderKey(b)) ?? Number.MAX_SAFE_INTEGER),
    );
  }
  titleSettings(player) {
    return {
      player,
      orderRevision: 1,
      role: this.e.player(player).role,
      titles: this.titleOptions(player),
    };
  }
  equipTitles(player, b) {
    const earned = this.titleOptions(player),
      quizTitles = earned.filter((t) => t.source !== "card"),
      cardTitles = earned.filter((t) => t.source === "card");
    if (b.order !== undefined) {
      const current = earned.map(titleOrderKey),
        keys = new Set(current);
      if (
        !Array.isArray(b.order) ||
        b.order.length !== current.length ||
        new Set(b.order).size !== current.length ||
        b.order.some((id) => !keys.has(id))
      )
        fail("Arrange only the titles you have earned.");
      if (JSON.stringify(b.expectedOrder) !== JSON.stringify(current))
        fail(
          "Your titles changed. Reload My Titles and review the order before saving.",
          409,
        );
    }
    // Older clients select card IDs; new clients select each award independently.
    const awards =
      b.awards !== undefined
        ? b.awards
        : b.cards === undefined
          ? cardTitles.filter((t) => t.equipped).map((t) => t.award)
          : Array.isArray(b.cards)
            ? cardTitles
                .filter((t) => b.cards.includes(t.card))
                .map((t) => t.award)
            : null;
    if (
      b.awards === undefined &&
      b.cards !== undefined &&
      (!Array.isArray(b.cards) ||
        new Set(b.cards).size !== b.cards.length ||
        b.cards.some(
          (id) =>
            typeof id !== "string" || !cardTitles.some((t) => t.card === id),
        ))
    )
      fail("Choose only titles you have earned.");
    for (const [selected, options, key] of [
      [b.quizzes, quizTitles, "quiz"],
      [awards, cardTitles, "award"],
    ]) {
      if (
        !Array.isArray(selected) ||
        selected.some(
          (id) => typeof id !== "string" || !options.some((t) => t[key] === id),
        ) ||
        new Set(selected).size !== selected.length
      )
        fail("Choose only titles you have earned.");
    }
    this.e.run("DELETE FROM profile_title_preferences WHERE player=?", player);
    for (const title of quizTitles)
      if (!b.quizzes.includes(title.quiz))
        this.e.run(
          "INSERT INTO profile_title_preferences VALUES(?,?,1)",
          player,
          title.quiz,
        );
    for (const title of cardTitles)
      this.e.run(
        "UPDATE card_title_awards SET hidden=? WHERE player=? AND award=?",
        awards.includes(title.award) ? 0 : 1,
        player,
        title.award,
      );
    if (b.order !== undefined)
      this.e.run(
        "INSERT INTO profile_title_order VALUES(?,?) ON CONFLICT(player) DO UPDATE SET data=excluded.data",
        player,
        JSON.stringify(b.order),
      );
    return {
      ...this.titleSettings(player),
      message: "Displayed titles updated.",
    };
  }
  titles(player) {
    return this.titleOptions(player)
      .filter((t) => t.equipped)
      .map((t) =>
        t.source === "card"
          ? {
              award: t.award,
              card: t.card,
              title: t.title,
              rarity: t.rarity,
              source: "card",
            }
          : { quiz: t.quiz, title: t.title, premium:t.premium,durationMs:t.durationMs },
      );
  }
}
