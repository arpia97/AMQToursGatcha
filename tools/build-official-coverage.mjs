import fs from 'node:fs/promises';
import {descriptionKeys} from '../src/official-song-coverage.js';
import {pathToFileURL} from 'node:url';

export async function writeOfficialCoverage(data) {
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
  const reference={version,ids:[...eligible].map(([id,ok])=>ok?id:-id),ann,exact,loose};
  await fs.writeFile(new URL('../public/quiz-library/official-coverage.json',import.meta.url),JSON.stringify(reference)+'\n');
  await fs.writeFile(new URL('../src/official-coverage-version.json',import.meta.url),JSON.stringify({version})+'\n');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  await writeOfficialCoverage(JSON.parse(await fs.readFile(process.argv[2],'utf8')));
}
