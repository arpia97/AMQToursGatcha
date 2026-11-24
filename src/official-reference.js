import {descriptionKeys} from './official-song-coverage.js';

export function buildOfficialReference(data) {
  if (!data.masterListId || !data.songMap || !data.animeMap || !data.artistMap || !data.groupMap)
    throw Error('Expected the full official AMQ master list.');
  const eligible=new Map(), ann={}, exact={}, loose={};
  function add(index,key,id) {
    if (!key) return;
    const prior=index[key];
    if (prior===undefined) index[key]=id;
    else if (prior!==id) index[key]=[...new Set([].concat(prior,id))];
  }
  for (const anime of Object.values(data.animeMap)) {
    for (const [kind,links] of Object.entries(anime.songLinks||{})) for (const link of links) {
      const id=Number(link.songId),song=data.songMap[id];
      if (!song) continue;
      const playable=Boolean(link.uploaded && !link.dub && ['OP','ED','INS'].includes(kind));
      eligible.set(id,playable || eligible.get(id) || false);
      add(ann,Number(link.annSongId),id);
      for (const artist of [data.artistMap[song.songArtistId],data.groupMap[song.songGroupId]]) {
        const [strictKey,looseKey]=descriptionKeys(anime.annId,song.name,artist?.name);
        add(exact,strictKey,id);
        add(loose,looseKey,id);
      }
    }
  }
  const version=data.masterListId;
  if (!eligible.size || !Object.keys(ann).length || !Object.keys(exact).length) throw Error('Official AMQ export has incomplete recording data.');
  return {version,ids:[...eligible].map(([id,ok])=>ok?id:-id),ann,exact,loose};
}
