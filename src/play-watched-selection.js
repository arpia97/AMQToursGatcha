export const audioFilename = url => url.slice(url.lastIndexOf('/') + 1);
const rankedType=/^(Opening|OP|Ending|ED|Insert|IN)\b/i;
const providerIndexes=new WeakMap();

// A slow mirror occupies one slot. Other slots keep working through the draw.
export async function checkAudioCandidates(candidates, verify) {
  const pending = candidates.entries(), results = new Array(candidates.length);
  async function worker() {
    for (const [i, candidate] of pending) results[i] = await verify(candidate);
  }
  await Promise.all(Array.from({length: Math.min(6, candidates.length)}, worker));
  return results;
}

export function recordingGroupIndex(data) {
  if (!data.groupById) {
    const index = new Map();
    data.groups.forEach((ids, group) => {
      for (const id of ids) index.set(id, group);
    });
    data.groupById = index;
  }
  return data.groupById;
}

export function watchedCandidates(data, weights, ranked, options = {}) {
  const {excluded, excludedPaths} = options;
  const candidates = new Map();
  function add(anime, group, source) {
    if (!weights.has(anime) || excluded?.has(group) || excludedPaths?.has(audioFilename(source))) return;
    if (!candidates.has(anime)) candidates.set(anime, new Map());
    candidates.get(anime).set(group, {group,source});
  }
  if (ranked) {
    const groupById = options.groupById ?? recordingGroupIndex(data);
    for (const row of data.ngmcRows) {
      if (rankedType.test(row.type)) add(row.annId,groupById.get(row.annSongId),row.audio);
    }
  } else {
    data.groups.forEach((ids,group) => {
      for (const id of ids) add(data.occurrenceAnime.get(id),group,data.sources[group]);
    });
  }
  return candidates;
}

export function countWatchedCandidates(data,weights,ranked) {
  // Counts need only eligible anime IDs. Build recording choices when the match starts.
  const eligible=ranked
    ? (data.rankedWatchedAnime??=new Set(data.ngmcRows.filter(row=>rankedType.test(row.type)).map(row=>row.annId)))
    : (data.watchedAnime??=new Set(data.occurrenceAnime.values()));
  let count=0;
  for(const anime of weights.keys())if(eligible.has(anime))count++;
  return count;
}

function indexesFor(linkedAnime) {
  if(providerIndexes.has(linkedAnime))return providerIndexes.get(linkedAnime);
  const indexes = {myanimelist:new Map(), anilist:new Map()};
  for (const [anime, links] of linkedAnime) for (const [provider,index] of Object.entries(indexes)) {
    const externalId = links[provider];
    if (!externalId) continue;
    if (!index.has(externalId)) index.set(externalId, []);
    index.get(externalId).push(anime);
  }
  providerIndexes.set(linkedAnime,indexes);
  return indexes;
}

// Map each imported list to the shared ANN IDs while retaining its own budget.
export function watchedWeights(lists, linkedAnime) {
  const indexes=indexesFor(linkedAnime);
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

// Attribute just the actual draws, using the same provider IDs as the selection.
export function watchedRigOwners(lists, linkedAnime, selectedAnime) {
  const owners = new Map(Array.from(selectedAnime, anime => [anime, []]));
  for (const {player, provider, ids} of lists) {
    if (player == null) continue;
    const list = new Set(ids);
    for (const [anime, players] of owners) {
      const id = linkedAnime.get(anime)?.[provider];
      if (id && list.has(id)) players.push(player);
    }
  }
  return owners;
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
    const batch = order.slice(cursor,cursor + count - selected.size);
    const reserved = new Set();
    const candidatesByAnime = batch.map(anime => [...candidates.get(anime)]);
    while (candidatesByAnime.some(options => options.length) && tried.size < count + 32) {
      let budget = count + 32 - tried.size;
      const probes = candidatesByAnime.map(options => {
        if (!budget) return;
        while (options.length) {
          const [{group, source}] = options.splice(randomIndex(options.length),1);
          if (tried.has(group) || recorded.has(filename(source))) continue;
          if (reserved.has(group)) continue;
          reserved.add(group);
          budget--;
          return {group, source};
        }
      });
      if (!probes.some(Boolean)) break;
      const urls = await checkAudioCandidates(probes, probe => probe ? verify(probe.group,probe.source) : null);
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
