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
export function mergeQuizAnswers(old,song){if(old.answerSource==='amq-export'&&song.answerSource!=='amq-export')return [...new Set([...old.answers,...(song.workingTitles||[])])];if(song.answerSource==='amq-export'&&old.answerSource!=='amq-export')return [...new Set([...song.answers,...(old.workingTitles||[])])];return [...new Set([...old.answers,...song.answers])];}
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
    if (!songs.size && legacy) {
      const found = byTitleArtist.get(
        key(row.title) + "\0" + artistKey(row.artist),
      );
      if (found?.size === 1) for (const id of found) songs.add(id);
    }
    for (const id of songs)
      for (const ann of [
        ...(bySong.get(id) || []),
        ...(workingAnimeOverrides[id] || []),
      ])
        anns.add(String(ann));
    const working = [
      ...list(row.workingTitles),
      ...list(row.altAnimeNames),
      ...list(row.altAnimeNamesAnswers),
      ...list(info.altAnimeNames),
      ...list(info.altAnimeNamesAnswers),
      ...list(info.animeNamesAnswers),
    ]
      .filter((n) => typeof n === "string" && n.trim())
      .map((n) => n.trim());
    const exportNames=info.animeNames&&typeof info.animeNames==='object'?Object.values(info.animeNames).filter(v=>typeof v==='string'&&v.trim()):[];
    const authoritative=row.answerSource==='amq-export'||!!row.songInfo&&(working.length>0||exportNames.length>0);
    const exactFallback=[...annSongs].map(id=>fallbackAnn.get(id)).filter(Boolean),fallback=exactFallback.length?exactFallback:[...songs].flatMap(id=>fallbackAmq.get(id)||[]);
    const amqAnswers=[...anns].flatMap(id=>titles(master.animeMap?.[id]));
    const answers = [
      ...new Set(
        [...working,...exportNames,...amqAnswers,...(authoritative?[]:fallback.flatMap(s=>s.titles||[]))],
      ),
    ];
    return {
      answers,
      trustedAnswers:[...new Set([...working,...exportNames,...amqAnswers])],
      workingTitles: [...new Set([...working,...exportNames])],
      answerSource:authoritative?'amq-export':fallback.length?'amq-plus':'amq',
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
