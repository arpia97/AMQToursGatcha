// Uniform at each step: anime, available OP/ED/IN category, then song.
export function ngmcSongPool(rows, count = 35, random = secureIndex) {
  const anime = new Map();
  const occurrences = new Map();
  for (const row of rows) {
    const type = /^(Opening|OP)\b/i.test(row.type) ? 'OP' : /^(Ending|ED)\b/i.test(row.type) ? 'ED' : /^(Insert|IN)\b/i.test(row.type) ? 'IN' : null;
    if (!row.audio || !row.annId || !type) continue;
    const id = String(row.amqSongId || row.audio);
    if (!anime.has(row.annId)) anime.set(row.annId, new Map());
    const types = anime.get(row.annId);
    if (!types.has(type)) types.set(type, new Map());
    const songs = types.get(type);
    if (!songs.has(id)) {
      if (!occurrences.has(id)) occurrences.set(id, []);
      occurrences.get(id).push([row.annId, type]);
    }
    songs.set(id, row);
  }
  const result = [];
  while (result.length < count && anime.size) {
    const types = [...anime.values()][random(anime.size)];
    const songs = [...types.values()][random(types.size)];
    const [id, song] = [...songs.entries()][random(songs.size)];
    result.push(song);
    // Remove the selected recording from every occurrence before the next draw.
    for (const [animeId, kind] of occurrences.get(id)) {
      const categories = anime.get(animeId), entries = categories.get(kind);
      entries.delete(id);
      if (!entries.size) categories.delete(kind);
      if (!categories.size) anime.delete(animeId);
    }
  }
  if (result.length !== count) throw Object.assign(Error('Not enough playable NGMC songs.'), {status:503});
  return result;
}
function secureIndex(length) {
  const bytes = new Uint32Array(1), limit = Math.floor(4294967296 / length) * length;
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % length;
}
