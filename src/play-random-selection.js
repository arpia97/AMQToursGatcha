import {songTypeKey, checkAudioCandidates, audioFilename} from './play-watched-selection.js';

// Uniform at each step: anime, available OP/ED/IN category, then song.
export function* randomSongDraws(rows, random) {
  const anime = new Map();
  const occurrences = new Map();
  for (const row of rows) {
    const type = songTypeKey(row.type);
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
  while (anime.size) {
    const types = [...anime.values()][random(anime.size)];
    const songs = [...types.values()][random(types.size)];
    const [id, song] = [...songs.entries()][random(songs.size)];
    // Remove the selected recording from every occurrence before the next draw.
    for (const [animeId, kind] of occurrences.get(id)) {
      const categories = anime.get(animeId), entries = categories.get(kind);
      entries.delete(id);
      if (!entries.size) categories.delete(kind);
      if (!categories.size) anime.delete(animeId);
    }
    yield song;
  }
}

// Use the same live pool for retries so a failed file is never drawn again.
export async function randomRecordings(rows, count, verify, randomIndex, excludedPaths, tried = new Set()) {
  const draws = randomSongDraws(rows, randomIndex);
  const usedFiles = new Set(excludedPaths);
  const picks = [];
  const budget = count + 32;
  while (picks.length < count && tried.size < budget) {
    const candidates = [];
    const needed = Math.min(count - picks.length, budget - tried.size);
    while (candidates.length < needed) {
      const {done, value} = draws.next();
      if (done) break;
      candidates.push(value);
    }
    if (!candidates.length) break;
    // The integrated catalog stores group + 1 as the sampling row's amqSongId.
    const urls = await checkAudioCandidates(candidates, row => verify(row.amqSongId - 1, row.audio));
    candidates.forEach((row, i) => {
      const group = row.amqSongId - 1;
      tried.add(group);
      if (!urls[i]) return;
      const file = audioFilename(urls[i]);
      if (usedFiles.has(file)) return;
      usedFiles.add(file);
      picks.push({group, anime:row.annId, label:row.type, url:urls[i]});
    });
  }
  return picks;
}
