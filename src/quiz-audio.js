import { validQuizAudio } from "../public/quiz-rules.js";
const MAX_BATCH = 8;
const safeAudio = (value) => {
  const audio = validQuizAudio(value);
  if (!audio) return null;
  const host = new URL(audio).hostname.toLowerCase();
  return host.includes(".") &&
    !/^[\d.]+$/.test(host) &&
    !host.includes(":") &&
    !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
    ? audio
    : null;
};
function save(cache, key, value, now) {
  cache.set(key, { ...value, at: now });
  while (cache.size > 4000) cache.delete(cache.keys().next().value);
  return value;
}
async function checkOne(audio, fetcher) {
  let url = audio;
  for (let redirects = 0; redirects < 4; redirects++) {
    let response;
    try {
      response = await fetcher(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
      });
      if ([405, 501].includes(response.status)) {
        await response.body?.cancel();
        response = await fetcher(url, {
          method: "GET",
          redirect: "manual",
          headers: { Range: "bytes=0-1023" },
          signal: AbortSignal.timeout(6000),
        });
      }
      const status = response.status,
        type = (response.headers.get("Content-Type") || "")
          .split(";")[0]
          .toLowerCase();
      const location = response.headers.get("Location");
      await response.body?.cancel();
      if ([301, 302, 303, 307, 308].includes(status)) {
        url = safeAudio(new URL(location || "", url).href);
        if (!url || !location)
          return {
            working: false,
            message: "Redirect is not a public HTTPS MP3 link.",
          };
        continue;
      }
      if (!response.ok)
        return { working: false, status, message: "HTTP " + status };
      if (response.headers.get("Content-Length") === "0")
        return { working: false, status, message: "The audio file is empty." };
      if (
        type &&
        !type.startsWith("audio/") &&
        ![
          "application/octet-stream",
          "binary/octet-stream",
          "application/mp3",
        ].includes(type)
      )
        return {
          working: false,
          status,
          message: "This link returned " + type + ", not audio.",
        };
      return { working: true, status, message: "Working MP3" };
    } catch {
      return {
        working: false,
        message: "Could not verify this link. Retry or provide another MP3.",
      };
    }
  }
  return { working: false, message: "Too many audio redirects." };
}
export async function checkQuizAudio(
  songs,
  fetcher,
  cache = new Map(),
  now = Date.now(),
  force = false,
) {
  if (!Array.isArray(songs) || songs.length > MAX_BATCH)
    throw Object.assign(Error("Check up to 8 songs at a time."), {
      status: 400,
    });
  const checks = new Array(songs.length);
  let next = 0;
  const check = async (value) => {
    const audio = safeAudio(value);
    if (!audio)
      return { working: false, message: "Use a public HTTPS MP3 link." };
    const old = cache.get(audio);
    if (
      old &&
      (!force || old.working) &&
      now - old.at < (old.working ? 86400000 : 60000)
    )
      return old;
    return save(cache, audio, await checkOne(audio, fetcher), now);
  };
  await Promise.all(
    Array.from({ length: Math.min(2, songs.length) }, async () => {
      while (next < songs.length) {
        const i = next++,
          song = songs[i];
        if (!song || typeof song.audio !== "string")
          throw Object.assign(Error("Choose an MP3 link for each song."), {
            status: 400,
          });
        let result = await check(song.audio),
          resolvedAudio = song.audio;
        if (!result.working)
          for (const alternative of (Array.isArray(song.alternatives)
            ? song.alternatives
            : []
          ).slice(0, 2)) {
            const fallback = await check(alternative);
            if (fallback.working) {
              result = fallback;
              resolvedAudio = alternative;
              break;
            }
          }
        checks[i] = { audio: song.audio, resolvedAudio, ...result };
      }
    }),
  );
  return { checks };
}
export function applyQuizAudioReview(prepared, body, cache, now = Date.now()) {
  const overrides = body.audioOverrides || {},
    skip = body.skipAudio || [];
  if (
    !overrides ||
    typeof overrides !== "object" ||
    Array.isArray(overrides) ||
    !Array.isArray(skip) ||
    Object.keys(overrides).length > 2000 ||
    skip.length > 2000
  )
    throw Object.assign(Error("Invalid audio review."), { status: 400 });
  const known = new Set(prepared.songs.map((s) => s.audio));
  if ([...Object.keys(overrides), ...skip].some((audio) => !known.has(audio)))
    throw Object.assign(
      Error("The song pool changed. Review the audio links again."),
      { status: 409 },
    );
  const skipped = new Set(skip),
    songs = [];
  for (const song of prepared.songs) {
    if (skipped.has(song.audio)) continue;
    const audio = safeAudio(overrides[song.audio] || song.audio),
      check = audio && cache.get(audio);
    if (!check?.working || now - check.at >= 86400000)
      throw Object.assign(
        Error(
          "Use Recheck Audio Links in Song Review before saving. Replace or skip any broken links.",
        ),
        { status: 409 },
      );
    const { alternatives, ...rest } = song;
    songs.push({ ...rest, audio });
  }
  return { ...prepared, songs };
}
