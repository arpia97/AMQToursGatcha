import { quizImportRows, resolveQuizAudio } from "../public/quiz-rules.js";
const CACHE_MS = 86400000;
const CACHE_LIMIT = 4000;
const LOOKUPS = {
  ann: { path: "ann_song_ids_request", field: "ann_song_ids", id: "annSongId" },
  amq: { path: "amq_song_ids_request", field: "amq_song_ids", id: "amqSongId" },
};
const validID = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
async function readRows(response) {
  if (!response.ok) throw Error("AnisongDB returned HTTP " + response.status);
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty song lookup response");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 10000000) {
      await reader.cancel();
      throw Error("Song lookup response exceeds the import limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const rows = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(rows) || rows.length > 10000)
    throw Error("Invalid song lookup response");
  return rows;
}
// Only AMQ records without playable links need metadata requests. Player answers are never imported.
export async function resolveQuizImport(
  input,
  fetcher,
  cache = new Map(),
  now = Date.now(),
  librarySongs = [],
) {
  const byAnn=new Map(librarySongs.map(s=>[String(s.annSongId),s])),byAmq=new Map();
  for(const song of librarySongs)if(song.amqSongId&&!byAmq.has(String(song.amqSongId)))byAmq.set(String(song.amqSongId),song);
  const rows = quizImportRows(input).map(row=>{if(!row||typeof row!=='object')return row;const song=byAnn.get(String(row.annSongId))||byAmq.get(String(row.amqSongId));return song?{...row,audio:resolveQuizAudio(row.audio)||song.audio,amqSongId:row.amqSongId??song.amqSongId,songName:row.songName||song.title,artist:row.songArtist||row.artist||song.artist}:row;}),
    needed = { ann: new Set(), amq: new Set() };
  const reference = (row) => {
    if (!row?.songInfo || resolveQuizAudio(row.audio)) return null;
    const ann = validID(row.annSongId);
    if (ann) return { kind: "ann", id: ann };
    const amq = validID(row.amqSongId);
    return amq ? { kind: "amq", id: amq } : null;
  };
  for (const row of rows) {
    const ref = reference(row);
    if (!ref) continue;
    const key = ref.kind + ":" + ref.id,
      entry = cache.get(key);
    if (!entry || now - entry.at >= CACHE_MS) {
      cache.delete(key);
      needed[ref.kind].add(ref.id);
    }
  }
  const found = new Map();
  try {
    for (const [kind, set] of Object.entries(needed)) {
      const spec = LOOKUPS[kind],
        ids = [...set];
      for (let offset = 0; offset < ids.length; offset += 500) {
        const batch = ids.slice(offset, offset + 500),
          requested = new Set(batch);
        const response = await fetcher(
          "https://anisongdb.com/api/" + spec.path,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              [spec.field]: batch,
              ignore_duplicate: false,
            }),
            signal: AbortSignal.timeout(20000),
          },
        );
        for (const row of await readRows(response)) {
          const id = validID(row?.[spec.id]),
            audio = resolveQuizAudio(row?.audio);
          if (!requested.has(id) || !audio) continue;
          const value = { audio, amqSongId: validID(row.amqSongId) };
          const key = kind + ":" + id;
          found.set(key, value);
          cache.set(key, { at: now, ...value });
          while (cache.size > CACHE_LIMIT)
            cache.delete(cache.keys().next().value);
        }
      }
    }
  } catch (error) {
    throw Object.assign(
      new Error(
        "Could not resolve AMQ export audio: " +
          error.message +
          ". No pool was changed. Please retry later.",
      ),
      { status: 502 },
    );
  }
  return rows.map((row) => {
    const ref = reference(row);
    if (!ref) return row;
    const value =
      found.get(ref.kind + ":" + ref.id) || cache.get(ref.kind + ":" + ref.id);
    return value
      ? {
          ...row,
          audio: value.audio,
          amqSongId: value.amqSongId ?? row.amqSongId,
        }
      : row;
  });
}
