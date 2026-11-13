import { quizAnswerIndex } from "../public/quiz-answer-index.js";
import { quizAnswerKey } from "../public/quiz-rules.js";
import { fail } from "./engine.js";
// Add titles to this quiz only. AMQ exports and active-run snapshots are preserved.
export function syncQuizLibraryAnswers(e, id, before, master, library) {
  const q = e.one("SELECT * FROM quizzes WHERE id=?", id);
  if (!q) fail("Choose a Quiz.");
  const rows = e.all(
    "SELECT id,data FROM quiz_songs WHERE quiz=? ORDER BY id",
    id,
  );
  if (JSON.stringify(rows) !== JSON.stringify(before))
    fail("The Quiz Pool Changed. Refresh Before Syncing Answers.", 409);
  const index = quizAnswerIndex(master, library.songs || []);
  let changed = 0,
    added = 0,
    protectedSongs = 0;
  for (const row of rows) {
    const song = JSON.parse(row.data);
    if (song.answerSource === "amq-export" || song.workingTitles?.length) {
      protectedSongs++;
      continue;
    }
    const resolved = index.resolve(song, true),
      answers = [...new Set([...song.answers, ...resolved.answers])];
    if (answers.length === song.answers.length) continue;
    added += answers.length - song.answers.length;
    changed++;
    e.run(
      "UPDATE quiz_songs SET data=? WHERE quiz=? AND id=?",
      JSON.stringify({
        ...song,
        answers,
        sourceIds: resolved.sourceIds,
        answerSource: resolved.answerSource,
      }),
      id,
      row.id,
    );
  }
  if (changed) {
    e.run("DELETE FROM quiz_answers WHERE quiz=?", id);
    for (const row of e.all("SELECT data FROM quiz_songs WHERE quiz=?", id))
      for (const answer of JSON.parse(row.data).answers)
        e.run(
          "INSERT OR IGNORE INTO quiz_answers VALUES(?,?,?)",
          id,
          answer,
          quizAnswerKey(answer),
        );
    e.run(
      "UPDATE quizzes SET source=?,updated=MAX(updated+1,?) WHERE id=?",
      library.version || master.masterListId,
      e.now(),
      id,
    );
  }
  return {
    message:
      "Quiz Answers Synced: " + added + " Added. AMQ Export Answers Were Kept.",
    songs: changed,
    addedAnswers: added,
    protectedSongs,
    version: library.version,
  };
}
