import { quizAnswerIndex } from "../public/quiz-answer-index.js";
import { quizAnswerKey } from "../public/quiz-rules.js";
import { fail } from "./engine.js";
const ID = "quiz-working-answers-2026-11-05";
export function repairQuizAnswers(e, master, apply = false, expected = null) {
  e.run(
    "CREATE TABLE IF NOT EXISTS quiz_answer_repairs(id TEXT PRIMARY KEY,at INTEGER NOT NULL,result TEXT NOT NULL)",
  );
  const saved = e.one("SELECT result FROM quiz_answer_repairs WHERE id=?", ID);
  if (saved) return { ...JSON.parse(saved.result), alreadyApplied: true };
  if (!master) return null;
  const index = quizAnswerIndex(master),
    rows = [];
  for (const row of e.all("SELECT * FROM quiz_songs ORDER BY quiz,id")) {
    const old = JSON.parse(row.data),
      resolved = index.resolve(old, true);
    const answers = [...new Set([...old.answers, ...resolved.answers])];
    if (answers.length === old.answers.length) continue;
    rows.push({
      quiz: row.quiz,
      id: row.id,
      before: old,
      after: { ...old, ...resolved, answers },
    });
  }
  const signature = JSON.stringify(
    rows.map((r) => [r.quiz, r.id, r.before, r.after]),
  );
  const result = {
    id: ID,
    at: e.now(),
    master: master.masterListId,
    songs: rows.length,
    addedAnswers: rows.reduce(
      (n, r) => n + r.after.answers.length - r.before.answers.length,
      0,
    ),
    rows,
    signature,
  };
  if (!apply) return result;
  if (expected !== signature)
    fail("Quiz answers changed. Review the repair again.", 409);
  const quizzes = new Set();
  for (const row of rows) {
    e.run(
      "UPDATE quiz_songs SET data=? WHERE quiz=? AND id=?",
      JSON.stringify(row.after),
      row.quiz,
      row.id,
    );
    quizzes.add(row.quiz);
  }
  for (const quiz of quizzes) {
    e.run("DELETE FROM quiz_answers WHERE quiz=?", quiz);
    const songs = e
        .all("SELECT data FROM quiz_songs WHERE quiz=?", quiz)
        .map((r) => JSON.parse(r.data)),
      byAudio = new Map(songs.map((s) => [s.audio, s]));
    for (const s of songs)
      for (const answer of s.answers)
        e.run(
          "INSERT OR IGNORE INTO quiz_answers VALUES(?,?,?)",
          quiz,
          answer,
          quizAnswerKey(answer),
        );
    for (const runRow of e.all(
      "SELECT player,data FROM quiz_runs WHERE quiz=?",
      quiz,
    )) {
      const run = JSON.parse(runRow.data);
      if (run.finished) continue;
      run.songs = run.songs.map((s) =>
        byAudio.has(s.audio)
          ? { ...s, answers: byAudio.get(s.audio).answers }
          : s,
      );
      e.run(
        "UPDATE quiz_runs SET data=? WHERE player=? AND quiz=?",
        JSON.stringify(run),
        runRow.player,
        quiz,
      );
    }
    e.run(
      "UPDATE quizzes SET source=?,updated=MAX(updated+1,?) WHERE id=?",
      master.masterListId,
      e.now(),
      quiz,
    );
  }
  e.run(
    "INSERT INTO quiz_answer_repairs VALUES(?,?,?)",
    ID,
    result.at,
    JSON.stringify(result),
  );
  return result;
}
