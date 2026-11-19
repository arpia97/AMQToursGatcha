// Map each imported list to the shared ANN IDs while retaining its own budget.
export function watchedWeights(lists, linkedAnime) {
  const indexes = {myanimelist:new Map(), anilist:new Map()};
  for (const [anime, links] of linkedAnime) for (const [provider,index] of Object.entries(indexes)) {
    const externalId = links[provider];
    if (!externalId) continue;
    if (!index.has(externalId)) index.set(externalId, []);
    index.get(externalId).push(anime);
  }

  const weights = new Map();
  for (const {provider, ids} of lists) {
    const index = indexes[provider];
    const unique = new Set(ids);
    if (!index || !unique.size) continue;
    const ticket = 1 / Math.sqrt(unique.size);
    const anime = new Set();
    for (const id of unique) for (const ann of index.get(id) || []) anime.add(ann);
    for (const ann of anime) weights.set(ann, (weights.get(ann) || 0) + ticket);
  }
  return weights;
}

export function weightedAnimeOrder(weights, random = Math.random) {
  // Sorting log-scores is equivalent to sorting R ** (1 / weight).
  return Array.from(weights, ([anime,weight]) => [anime, Math.log(Math.max(Number.MIN_VALUE,random())) / weight])
    .sort((a,b) => b[1] - a[1]).map(([anime]) => anime);
}

export async function watchedRecordings(order, candidates, count, verify, randomIndex, filename) {
  const selected = new Map();
  const recorded = new Set();
  const tried = new Set();
  let cursor = 0;
  while (selected.size < count && cursor < order.length && tried.size < count + 32) {
    const batch = order.slice(cursor,cursor + Math.min(4, count - selected.size));
    const reserved = new Set();
    const candidatesByAnime = batch.map(anime => [...candidates.get(anime)]);
    while (candidatesByAnime.some(options => options.length) && tried.size < count + 32) {
      const probes = candidatesByAnime.map(options => {
        while (options.length) {
          const [{group, source}] = options.splice(randomIndex(options.length),1);
          if (tried.has(group) || recorded.has(filename(source))) continue;
          if (reserved.has(group)) continue;
          reserved.add(group);
          return {group, source};
        }
      });
      if (!probes.some(Boolean)) break;
      const urls = await Promise.all(probes.map(probe => probe ? verify(probe.group,probe.source) : null));
      probes.forEach((probe,i) => {
        if (!probe) return;
        tried.add(probe.group);
        if (!urls[i] || recorded.has(filename(urls[i]))) return;
        recorded.add(filename(urls[i]));
        selected.set(batch[i], {group:probe.group, url:urls[i]});
        candidatesByAnime[i].length = 0;
      });
    }
    cursor += batch.length;
  }
  // Audio checks can finish out of order. Keep the A-Res ordering in the playlist.
  return order.filter(anime => selected.has(anime)).map(anime => ({anime,...selected.get(anime)}));
}
