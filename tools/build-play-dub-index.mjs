import fs from 'node:fs/promises';
import {libraryId} from '../public/quiz-library-data.js';
import {songIsDub} from '../public/quiz-rules.js';
import {fileKey} from '../src/master-song-answers.js';

const [sourcePath] = process.argv.slice(2);
if (!sourcePath) throw Error('Usage: node tools/build-play-dub-index.mjs ANISONGDB_MASTERLIST_JSON');
const official = JSON.parse(await fs.readFile(new URL('../public/quiz-amq-master.json', import.meta.url), 'utf8'));
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
if (!Array.isArray(source) || !source.length) throw Error('Expected the raw song list.');
const ann = new Set(), amq = new Map(), audio = new Map();
function record(map, id, dubbed) {
  if (id != null) map.set(id, (map.get(id) ?? true) && dubbed);
}
for (const anime of Object.values(official.animeMap)) {
  for (const link of Object.values(anime.songLinks || {}).flat()) {
    const dubbed = songIsDub(link);
    if (dubbed && libraryId(link.annSongId)) ann.add(Number(link.annSongId));
    record(amq, libraryId(link.songId), dubbed);
  }
}
for (const row of source) {
  const dubbed = songIsDub(row) || ann.has(libraryId(row.annSongId));
  if (dubbed && libraryId(row.annSongId)) ann.add(Number(row.annSongId));
  record(amq, libraryId(row.amqSongId), dubbed);
  record(audio, fileKey(row.audio), dubbed);
}
const index = {
  annSongIds: [...ann].sort((a,b) => a-b),
  amqSongIds: [...amq].filter(([,dubbed]) => dubbed).map(([id]) => id).sort((a,b) => a-b),
  audioKeys: [...audio].filter(([,dubbed]) => dubbed).map(([key]) => key).sort(),
};
await fs.writeFile(new URL('../public/quiz-library/dub-recordings.json', import.meta.url), JSON.stringify(index)+'\n');
console.log('Dub index:', Object.fromEntries(Object.entries(index).map(([name, ids]) => [name, ids.length])));
