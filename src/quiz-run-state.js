import { quizElapsed } from "../public/quiz-time.js";
import { QUIZ_SONG_MS, QUIZ_LEAD_IN_MS, QUIZ_ANSWER_GRACE_MS, animeAnswerKey } from "../public/quiz-rules.js";

function reject(message, status = 409) { throw Object.assign(new Error(message), { status }); }

function revealedSong(song, answer, index) {
  return {
    index,
    title: song.title || "Unknown Song",
    artist: song.artist || "",
    anime: song.answers?.[0] || "",
    submittedAnswer: answer.submittedAnswer ?? answer.answer ?? "",
    correct: !!answer.correct,
    timedOut: !!answer.timedOut,
    skipped: !!answer.skipped,
  };
}

// Shared by the legacy economy path and isolated quiz sessions.
export function quizRunView(q, run, now, includeProgress = false) {
  if (!run) return { now, run: null };
  const score = run.answers.filter((a) => a.correct).length;
  if (run.finished)
    return {
      now,
      run: {
        id: run.id,
        index: 20,
        score,
        results: run.answers.slice(0, 20).map((a) => !!a.correct),
        finished: true,
        startedAt: run.startedAt ?? null,
        ...(run.fast || run.clockFromAudio ? { clockFromAudio: true } : {}),
        durationMs: run.durationMs ?? null,
        reward: run.reward,
        preview: !!run.preview || !q.published,
        history: run.songs.map((song, index) => {
          const answer = run.answers[index] || {};
          return {
            ...revealedSong(song, answer, index),
            answerReceivedAt: answer.receivedAt ?? null,
            elapsedMs: answer.elapsedMs ?? null,
            responseMs: answer.responseMs ?? null,
          };
        }),
      },
    };
  const song = run.songs[run.index],
    answer = run.answers[run.index],
    // Once the current song is revealed, the client may buffer the next
    // song's audio so moving on does not wait for a fresh download. The
    // scored clock still starts only when the server records readiness.
    upcoming = answer ? run.songs[run.index + 1] : null,
    submitted = run.answers.slice(0, run.index + (answer ? 1 : 0));
  return {
    now,
    run: {
      id: run.id,
      ...(run.suddenDeath ? {suddenDeath:true} : {}),
      ...(run.fast ? { transport: "session" } : {}),
      index: run.index,
      score,
      results: submitted.map((a) => !!a.correct),
      // Resuming gets only revealed tracks. Later moves return the current reveal.
      ...(includeProgress && submitted.length ? {
        progressDetails: submitted.map((a, index) => a ? revealedSong(run.songs[index], a, index) : null),
      } : {}),
      finished: false,
      startedAt: run.startedAt ?? null,
      timingPending: run.clockFromAudio === true && run.startedAt == null,
      elapsedMs: quizElapsed(run.startedAt, run.completedAt ?? now),
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
            skipped: !!answer.skipped,
            answerReceivedAt: answer.receivedAt ?? null,
            answer: song.answers[0],
            submittedAnswer: answer.submittedAnswer ?? answer.answer,
            songTitle: song.title,
            artist: song.artist,
          }
        : {}),
      ...(upcoming
        ? { nextAudio: upcoming.audio, nextSample: upcoming.sample }
        : {}),
    },
  };
}

export function advanceQuizRun(run, action, b, now, arrival = now) {
  if (!run || run.finished || run.id !== b.run || run.index !== b.index)
    reject("The question changed. Refresh the quiz.");
  if (action === "quiz-ready") {
    if (!run.answers[run.index] && run.timing?.index !== run.index) {
      const startsAt = now + (run.index === 0 ? QUIZ_LEAD_IN_MS : 0);
      run.timing = { index: run.index, startsAt, endsAt: startsAt + QUIZ_SONG_MS };
      if ((run.fast || run.clockFromAudio) && run.startedAt == null) run.startedAt = startsAt;
    }
    return;
  }
  if (action === "quiz-answer") {
    const receivedAt = Number.isSafeInteger(arrival) && arrival > 0 && arrival <= now + 1000
      ? Math.min(now, arrival) : now;
    if (run.answers[run.index]) reject("This answer is already locked.");
    if (!b.skip && run.timing?.index !== run.index) reject("Wait for the audio to load.");
    if (!b.skip && receivedAt < run.timing.startsAt) reject("Wait for the starting countdown.");
    const timedOut = !b.skip && receivedAt > run.timing.endsAt + QUIZ_ANSWER_GRACE_MS;
    if ((run.fast || run.clockFromAudio) && (run.startedAt == null || (b.skip && receivedAt < run.startedAt)))
      run.startedAt = receivedAt;
    const submittedAnswer = b.skip ? "" : String(b.answer || "").slice(0, 300);
    const answer = timedOut ? "" : submittedAnswer;
    run.answers.push({
      answer, submittedAnswer, receivedAt, processedAt: now, timedOut, skipped: !!b.skip,
      elapsedMs: quizElapsed(run.startedAt, receivedAt),
      responseMs: quizElapsed(run.timing?.startsAt, receivedAt),
      correct: !!answer && run.songs[run.index].answers.some(a => animeAnswerKey(a) === animeAnswerKey(answer)),
    });
    if (run.index === 19) {
      run.completedAt = receivedAt;
      run.durationMs = quizElapsed(run.startedAt, receivedAt);
    }
    return;
  }
  if (action !== "quiz-next") reject("Unknown quiz action.", 404);
  if (!run.answers[run.index]) reject("Lock an answer first.");
  if (run.suddenDeath && !run.answers[run.index].correct) reject("Restart this Sudden Death attempt.");
  if (run.index === 19) reject("Finish this quiz through the reward server.");
  run.index++;
  run.timing = b.ready === true
    ? { index: run.index, startsAt: now, endsAt: now + QUIZ_SONG_MS } : null;
}
