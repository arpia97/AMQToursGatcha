const key = (s) =>
  String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
const artistKey = (s) =>
  key(s).replace(/,/g, " ").split(/\s+/).sort().join(" ");
const list = (v) => (Array.isArray(v) ? v : []);
const titles = (a) =>
  [
    ...Object.values(a?.mainNames || {}),
    ...list(a?.names).map((n) => n.name),
  ].filter(Boolean);
// Confirmed by the user's AMQ All Working Titles screenshot, scoped to this song.
const workingAnimeOverrides = { 75802: [30555, 24085, 27193] };
// Recording-specific working titles confirmed in addition to the catalog.
export const butterflyPresageTitle = "Fate/stay night: Heaven's Feel I. Presage Flower";

export function amqAlternativeTitles(info) {
  return [...new Set(["allAlternativeAnswers","altAnimeNames","altAnimeNamesAnswers","animeNamesAnswers"]
    .flatMap(field => list(info?.[field]))
    .filter(title => typeof title === "string" && title.trim())
    .map(title => title.trim()))];
}
function distinctTitles(values) {
  const seen = new Set();
  return values.filter(title => {
    if (typeof title !== "string" || !title.trim() || seen.has(key(title))) return false;
    seen.add(key(title));
    return true;
  }).map(title => title.trim());
}

export function mergeQuizAnswerFields(old, song) {
  for (const source of ["amq-export","saved-amq-export"]) {
    const uploads = [old,song].filter(row => row.answerSource === source);
    if (!uploads.length) continue;
    // Older imports mixed catalog titles into answers but kept the export in workingTitles.
    const candidates = uploads.map(row => ({
      row, titles: distinctTitles(row.workingTitles?.length ? row.workingTitles : row.answers)
    }));
    const best = candidates.reduce((a,b) => b.titles.length > a.titles.length ? b : a);
    return {answerSource:source, answers:best.titles, workingTitles:best.titles, verifiedTitles:best.row.verifiedTitles || []};
  }
  const preferred = [song,old].find(row => row.answerSource === "amq-master-sheet") ||
    [song,old].find(row => row.answerSource === "published-quiz");
  const verifiedTitles = distinctTitles([...(old.verifiedTitles || []),...(song.verifiedTitles || [])]);
  return {
    answerSource:preferred?.answerSource || song.answerSource || old.answerSource,
    answers:distinctTitles(preferred ? [...preferred.answers,...verifiedTitles] : [...old.answers,...song.answers]),
    workingTitles:distinctTitles(preferred ? [...(preferred.workingTitles || []),...verifiedTitles] :
      [...(old.workingTitles || []),...(song.workingTitles || [])]),
    verifiedTitles
  };
}

export function quizAnswerIndex(master, fallbackSongs = []) {
  master ||= {animeMap:{}};
  const fallbackAnn=new Map(),fallbackAmq=new Map();
  for(const song of fallbackSongs){fallbackAnn.set(String(song.annSongId),song);if(song.amqSongId){const key=String(song.amqSongId);if(!fallbackAmq.has(key))fallbackAmq.set(key,[]);fallbackAmq.get(key).push(song);}}
  const bySong = new Map(),
    byAnnSong = new Map(),
    byTitleArtist = new Map();
  const add = (map, id, value) => {
    id = String(id);
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(String(value));
  };
  for (const [annId, a] of Object.entries(master.animeMap || {}))
    for (const link of Object.values(a.songLinks || {}).flat()) {
      add(bySong, link.songId, a.annId ?? annId);
      if (link.annSongId != null) add(byAnnSong, link.annSongId, link.songId);
    }
  for (const [id, s] of Object.entries(master.songMap || {})) {
    const artist =
      s.artist ||
      master.artistMap?.[s.songArtistId]?.name ||
      master.groupMap?.[s.songGroupId]?.name;
    if (artist) add(byTitleArtist, key(s.name) + "\0" + artistKey(artist), id);
  }
  function resolve(row, legacy = false) {
    const source = row.sourceIds || {},
      info = row.songInfo || {};
    const songs = new Set(list(source.amqSongIds).map(String)),
      anns = new Set(list(source.annIds).map(String));
    const annSongs = new Set(list(source.annSongIds).map(String));
    for (const id of [row.amqSongId, info.amqSongId])
      if (id != null) songs.add(String(id));
    if (!legacy && row.songId != null) songs.add(String(row.songId));
    for (const id of [row.annSongId, info.annSongId, info.siteIds?.annSongId])
      if (id != null) annSongs.add(String(id));
    for (const id of [
      row.annId,
      row.annID,
      row.animeAnnId,
      info.annId,
      info.siteIds?.annId,
    ])
      if (id != null) anns.add(String(id));
    const occurrenceSongs = new Set(
      [...annSongs].flatMap((id) => [...(byAnnSong.get(id) || [])]),
    );
    if (occurrenceSongs.size) {
      songs.clear();
      for (const song of occurrenceSongs) songs.add(song);
    }
    for (const id of [...songs])
      if (!bySong.has(id) && byAnnSong.has(id)) {
        songs.delete(id);
        annSongs.add(id);
        for (const song of byAnnSong.get(id)) songs.add(song);
      }
    if (!songs.size && !annSongs.size) {
      const found = byTitleArtist.get(
        key(row.songName||row.songTitle||row.title) + "\0" + artistKey(row.songArtist||row.artist),
      );
      if (found?.size === 1) for (const id of found) songs.add(id);
    }
    for (const id of songs)
      for (const ann of [
        ...(bySong.get(id) || []),
        ...(workingAnimeOverrides[id] || []),
      ])
        anns.add(String(ann));
    const confirmed = songs.has("82626") || annSongs.has("48740") ? [butterflyPresageTitle] : [];
    const verifiedTitles = [...new Set([
      ...list(row.verifiedTitles),
      ...amqAlternativeTitles(row),
      ...amqAlternativeTitles(info),
    ])];
    const working = [
      ...list(row.workingTitles),
      ...verifiedTitles,
    ]
      .filter((n) => typeof n === "string" && n.trim())
      .map((n) => n.trim());
    const names = info.animeNames ?? row.animeNames;
    const exportNames = names && typeof names === "object" ? Object.values(names) : [];
    const uploaded = distinctTitles([...exportNames,...amqAlternativeTitles(info),...amqAlternativeTitles(row)]);
    const exportTitles = uploaded.length ? uploaded : row.answerSource === "amq-export"
      ? distinctTitles(row.workingTitles?.length ? row.workingTitles : list(row.answers)) : [];
    const exactFallback=[...annSongs].map(id=>fallbackAnn.get(id)).filter(Boolean),fallback=exactFallback.length?exactFallback:[...songs].flatMap(id=>fallbackAmq.get(id)||[]);
    const amqAnswers=[...anns].flatMap(id=>titles(master.animeMap?.[id]));
    const cachedAnswers=fallback.flatMap(s=>s.titles||[]);
    const answers = exportTitles.length ? exportTitles : distinctTitles([...working,...(cachedAnswers.length ? cachedAnswers : amqAnswers),...confirmed]);
    return {
      answers,
      verifiedTitles:exportTitles.length ? verifiedTitles : distinctTitles([...verifiedTitles,...confirmed]),
      workingTitles:exportTitles.length ? exportTitles : distinctTitles([...working,...confirmed]),
      answerSource:exportTitles.length?'amq-export':cachedAnswers.length?'amq-plus':'amq',
      sourceIds: {
        amqSongIds: [...songs],
        annSongIds: [...annSongs],
        annIds: [...anns],
      },
    };
  }
  const index = { resolve };
  return index;
}
