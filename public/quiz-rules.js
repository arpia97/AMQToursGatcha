import { quizAnswerIndex } from "./quiz-answer-index.js";
export const QUIZ_SONG_MS = 20000;
export const QUIZ_LEAD_IN_MS = 2000;
export const QUIZ_ANSWER_GRACE_MS = 1000;
export const QUIZ_LENGTH = 20;
export const QUIZ_MILESTONES = Object.freeze([
  { score: 5, credits: 100 },
  { score: 10, credits: 300 },
  { score: 15, credits: 500 },
  { score: 20, credits: 1000 },
]);
export const quizAnswerKey = (s) =>
  String(s || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
export function quizReward(previous, score) {
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 20 ||
    !Number.isInteger(previous) ||
    previous < 0 ||
    previous > 20
  )
    throw Error("Invalid quiz score.");
  const best = Math.max(previous, score);
  return {
    best,
    improvement: (best - previous) * 50,
    milestones: QUIZ_MILESTONES.filter(
      (m) => m.score > previous && m.score <= best,
    ).reduce((s, m) => s + m.credits, 0),
  };
}
export function quizRarity(score = 0) {
  return (
    [
      [20, "AG"],
      [18, "Ubers"],
      [15, "SSS"],
      [13, "SS"],
      [10, "S"],
      [8, "A"],
      [5, "B"],
      [3, "C"],
    ].find(([n]) => score >= n)?.[1] || "D"
  );
}
export function validQuizAudio(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.pathname.toLowerCase().endsWith(".mp3")
      ? u.href
      : null;
  } catch {
    return null;
  }
}
// AnisongDB exports AMQ mirror filenames, while saved pools keep full HTTPS URLs.
export function resolveQuizAudio(value) {
  if (typeof value !== "string") return null;
  const link = value.trim();
  return validQuizAudio(
    /^[a-z0-9_-]+\.mp3$/i.test(link)
      ? "https://naedist.animemusicquiz.com/" + link
      : link,
  );
}
export function quizImportRows(input) {
  const rows = Array.isArray(input) ? input : input?.songs;
  if (!Array.isArray(rows) || rows.length > 2000)
    throw Error("Upload AnisongDB or AMQ JSON with at most 2,000 songs.");
  return rows.map((row) => {
    const info = row?.songInfo;
    if (!info || typeof info !== "object" || Array.isArray(info)) return row;
    return {
      ...row,
      annId: row.annId ?? info.annId ?? info.siteIds?.annId,
      annSongId: row.annSongId ?? info.annSongId ?? info.siteIds?.annSongId,
      amqSongId: row.amqSongId ?? info.amqSongId,
      songName: row.songName ?? info.songName,
      artist: row.songArtist ?? row.artist ?? info.artist,
      audio: [
        row.audio,
        row.audioUrl,
        row.audio_url,
        row.mp3,
        row.songLink,
        info.audio,
        info.audioUrl,
        info.mp3,
        row.videoUrl,
        info.videoUrl,
      ]
        .map(resolveQuizAudio)
        .find(Boolean),
    };
  });
}
export function prepareQuizSongs(input, master) {
  const rows = quizImportRows(input);
  if (!master?.animeMap)
    throw Error("AMQ's answer database is unavailable. No pool was changed.");
  const indexer = quizAnswerIndex(master);
  const songs = [],
    rejected = [],
    seen = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      rejected.push({ row: index + 1, reason: "Invalid song record" });
      continue;
    }
    const audio =
      [
        row.audio,
        row.audioUrl,
        row.audio_url,
        row.mp3,
        row.songLink,
        row.videoUrl,
      ]
        .map(resolveQuizAudio)
        .find(Boolean) || null;
    const resolved = indexer.resolve(row);
    if (!audio || !resolved.answers.length) {
      rejected.push({
        row: index + 1,
        reason: !audio ? "No HTTPS MP3" : "Anime/song ID not found in AMQ",
      });
      continue;
    }
    const answers = resolved.answers;
    const previous = seen.get(audio);
    if (previous) {
      previous.answers = [...new Set([...previous.answers, ...answers])];
      previous.workingTitles = [
        ...new Set([...previous.workingTitles, ...resolved.workingTitles]),
      ];
      for (const kind of Object.keys(previous.sourceIds))
        previous.sourceIds[kind] = [
          ...new Set([
            ...previous.sourceIds[kind],
            ...resolved.sourceIds[kind],
          ]),
        ];
      continue;
    }
    if (!answers.length) {
      rejected.push({ row: index + 1, reason: "No accepted AMQ titles" });
      continue;
    }
    songs.push({
      id: String(row.annSongId ?? row.amqSongId ?? row.songId ?? index),
      audio,
      ...(resolveQuizAudio(row.videoUrl) &&
      resolveQuizAudio(row.videoUrl) !== audio
        ? { alternatives: [resolveQuizAudio(row.videoUrl)] }
        : {}),
      answers,
      sourceIds: resolved.sourceIds,
      workingTitles: resolved.workingTitles,
      title: String(row.songName || row.songTitle || "Unknown Song").slice(
        0,
        200,
      ),
      artist: String(row.songArtist || row.artist || "").slice(0, 200),
    });
    seen.set(audio, songs.at(-1));
  }
  return { songs, rejected, masterListId: String(master.masterListId || "") };
}
