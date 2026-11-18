import { quizElapsed } from "../public/quiz-time.js";
import { fail, integer } from "./engine.js";

function firstSongStart(e, player, quiz, run, first) {
  const receivedAt = first?.receivedAt ?? first?.answerReceivedAt;
  if (Number.isSafeInteger(receivedAt) && Number.isSafeInteger(first.responseMs) && first.responseMs >= 0)
    return receivedAt - first.responseMs;
  if (first?.skipped && Number.isSafeInteger(receivedAt)) return receivedAt;
  if (run.timing?.index === 0) return run.timing.startsAt;
  // Early timing versions did not include response timestamps in the recap.
  return e.one(`SELECT json_extract(result,'$.run.startsAt') AS startsAt FROM receipts
    WHERE scope=? AND json_extract(input,'$.quiz')=? AND json_extract(input,'$.run')=?
      AND json_extract(input,'$.index')=0 AND json_extract(result,'$.run.startsAt') IS NOT NULL
    ORDER BY at LIMIT 1`, `${player}:quiz-ready`, quiz, run.id)?.startsAt;
}

export function correctQuizClock(e, player, quiz, run) {
  if (run.clockFromAudio || run.fast || !Number.isSafeInteger(run.startedAt)) return run;
  if (run.index === 0 && !run.timing && !run.answers.length)
    return { ...run, clockFromAudio: true, startedAt: null };
  const startedAt = firstSongStart(e, player, quiz, run, run.answers[0]);
  const shift = quizElapsed(run.startedAt, startedAt);
  if (shift === null) return run;
  const durationMs = quizElapsed(startedAt, run.completedAt);
  if (Number.isSafeInteger(run.durationMs) && durationMs === null) return run;
  return {
    ...run, clockFromAudio: true, startedAt,
    ...(durationMs === null ? {} : { durationMs }),
    answers: run.answers.map(answer => ({ ...answer, elapsedMs: rebasedElapsed(answer.elapsedMs, shift) })),
  };
}

function rebasedElapsed(elapsedMs, shift) {
  return Number.isSafeInteger(elapsedMs) ? Math.max(0, elapsedMs - shift) : null;
}

export function correctQuizReceipt(e, player, quiz, result) {
  const run = result.run;
  if (!run?.finished || run.clockFromAudio || !Number.isSafeInteger(run.durationMs)) return result;
  const startedAt = firstSongStart(e, player, quiz, run, run.history?.[0]);
  const shift = quizElapsed(run.startedAt, startedAt);
  if (shift === null || shift > run.durationMs) return result;
  return {
    ...result,
    run: {
      ...run, clockFromAudio: true, startedAt, durationMs: run.durationMs - shift,
      ...(run.history && { history: run.history.map(song => ({ ...song, elapsedMs: rebasedElapsed(song.elapsedMs, shift) })) }),
    },
  };
}

const BATCH_SIZE = 40;

// Match the saved personal best to its exact finish. Receipts from before a
// score reset cannot reintroduce deleted scores or replace that attempt.
export function quizCountdownPlan(e, after = 0) {
  const rows = e.all(`SELECT rowid AS cursor,player,quiz,best,best_at AS bestAt,best_duration_ms AS duration
    FROM quiz_progress WHERE rowid>? AND best_duration_ms>=0 ORDER BY rowid LIMIT ?`, after, BATCH_SIZE);
  const changes = [], missing = [];
  let verified = 0;
  for (const row of rows) {
    const receipt = e.one(`SELECT result FROM receipts WHERE scope=? AND at>=?
      AND json_extract(input,'$.quiz')=? AND json_extract(result,'$.run.finished')=1
      AND COALESCE(json_extract(result,'$.run.preview'),0)=0
      AND json_extract(result,'$.run.score')=?
      AND json_extract(result,'$.run.startedAt')+json_extract(result,'$.run.durationMs')=?
      ORDER BY (json_extract(result,'$.run.durationMs')=?) DESC LIMIT 1`,
      `${row.player}:quiz-next`, row.bestAt, row.quiz, row.best, row.bestAt, row.duration);
    const original = receipt && JSON.parse(receipt.result);
    let run = original && correctQuizReceipt(e, row.player, row.quiz, original).run;
    if (run && row.duration !== original.run.durationMs && row.duration !== run.durationMs) run = null;
    if (!run?.clockFromAudio) {
      const stored = e.one("SELECT data FROM quiz_runs WHERE player=? AND quiz=?", row.player, row.quiz);
      const latest = stored && JSON.parse(stored.data);
      if (latest?.finished && !latest.preview && latest.completedAt === row.bestAt &&
          latest.answers.filter(answer => answer.correct).length === row.best) {
        const corrected = correctQuizClock(e, row.player, row.quiz, latest);
        if (latest.durationMs === row.duration || corrected.durationMs === row.duration) run = corrected;
      }
    }
    if (!run?.clockFromAudio && !run?.fast) missing.push(row);
    else if (run.durationMs < row.duration) changes.push({ ...row, corrected: run.durationMs });
    else verified++;
  }
  return { changes, verified, missing, next: rows.length === BATCH_SIZE ? rows.at(-1).cursor : null };
}

export function applyQuizCountdown(e, body) {
  const plan = quizCountdownPlan(e, integer(body.after, 0));
  if (JSON.stringify(plan.changes) !== JSON.stringify(body.changes))
    fail("Quiz scores changed. Preview this batch again.", 409);
  for (const row of plan.changes)
    e.run("UPDATE quiz_progress SET best_duration_ms=? WHERE rowid=?", row.corrected, row.cursor);
  return { updated: plan.changes.length, next: plan.next };
}
