import { watchedListStatuses } from './play-list-statuses.js';

export const aniStatuses = Object.freeze({
  CURRENT:'watching', REPEATING:'watching', COMPLETED:'completed', PAUSED:'onHold', DROPPED:'dropped',
});

export function readAniListExport(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw Error('Choose a valid AniList JSON file.'); }
  const root = data?.data ?? data;
  const collection = root?.MediaListCollection;
  if ((data?.type && data.type !== 'ANIME') || !Array.isArray(collection?.lists) || collection.hasNextChunk)
    throw Error('Choose a complete AniList anime list export.');
  const groups = Object.fromEntries(Object.keys(watchedListStatuses).map(key => [key, new Set()]));
  for (const list of collection.lists) {
    if (!Array.isArray(list?.entries)) throw Error('The export contains an invalid list.');
    for (const entry of list.entries) {
      const id = entry?.mediaId ?? entry?.media?.id;
      if (entry?.media?.type === 'MANGA' || !Number.isSafeInteger(id) || id <= 0 ||
          !(Object.hasOwn(aniStatuses, entry.status) || entry.status === 'PLANNING'))
        throw Error('The export contains an invalid anime entry.');
      if (entry.status !== 'PLANNING') groups[aniStatuses[entry.status]].add(id);
    }
  }
  const name = root.User?.name ?? collection.user?.name;
  return {name:typeof name === 'string' ? name.slice(0, 100) : '',
    groups:Object.fromEntries(Object.entries(groups).map(([key, ids]) => [key, [...ids]]))};
}
