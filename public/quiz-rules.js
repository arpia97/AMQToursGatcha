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
export function prepareQuizSongs(input, master) {
  const rows = Array.isArray(input) ? input : input?.songs;
  if (!Array.isArray(rows) || rows.length > 2000)
    throw Error("Upload an AnisongDB array with at most 2,000 songs.");
  if (!master?.animeMap)
    throw Error("AMQ's answer database is unavailable. No pool was changed.");
  const bySong = new Map(),
    byAnnSong = new Map();
  for (const anime of Object.values(master.animeMap))
    for (const links of Object.values(anime.songLinks || {}))
      for (const song of links) {
        if (song.annSongId != null)
          byAnnSong.set(String(song.annSongId), String(song.songId));
        if (!bySong.has(String(song.songId)))
          bySong.set(String(song.songId), []);
        bySong.get(String(song.songId)).push(anime);
      }
  const songs = [],
    rejected = [],
    seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      rejected.push({ row: index + 1, reason: "Invalid song record" });
      continue;
    }
    const audio = resolveQuizAudio(
      row.audio || row.audioUrl || row.audio_url || row.mp3 || row.songLink,
    );
    const ann = String(row.annId ?? row.annID ?? row.animeAnnId ?? "");
    const direct = master.animeMap[ann];
    const matched = [
      ...(direct ? [direct] : []),
      ...(bySong.get(
        String(
          row.amqSongId ??
            row.songId ??
            byAnnSong.get(String(row.annSongId ?? "")) ??
            "",
        ),
      ) || []),
    ];
    if (!audio || !matched.length) {
      rejected.push({
        row: index + 1,
        reason: !audio ? "No HTTPS MP3" : "Anime/song ID not found in AMQ",
      });
      continue;
    }
    if (seen.has(audio)) continue;
    const answers = [
      ...new Set(
        matched
          .flatMap((a) => [
            ...Object.values(a.mainNames || {}),
            ...(a.names || []).map((n) => n.name),
          ])
          .filter(Boolean),
      ),
    ];
    if (!answers.length) {
      rejected.push({ row: index + 1, reason: "No accepted AMQ titles" });
      continue;
    }
    seen.add(audio);
    songs.push({
      id: String(row.annSongId ?? row.amqSongId ?? row.songId ?? index),
      audio,
      answers,
      title: String(row.songName || row.songTitle || "Unknown Song").slice(
        0,
        200,
      ),
      artist: String(row.songArtist || row.artist || "").slice(0, 200),
    });
  }
  return { songs, rejected, masterListId: String(master.masterListId || "") };
}
