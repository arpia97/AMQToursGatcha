import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const read=async file=>JSON.parse(await readFile(new URL('../public/'+file,import.meta.url),'utf8'));
// A recording's accepted answers can include other shows. Only anime identities supply display names.
export async function writeSongAnimeLabels(master){
  master??=await read('quiz-amq-master.json');
  const manifest=await read('quiz-library/manifest.json');
  const links=new Map();
  for(const bucket of manifest.shards){
    for(const row of Object.values(await read('quiz-library/'+bucket+'.json'))){
      const mal=row.linkedIds?.myanimelist;
      if(!Number.isSafeInteger(mal)||mal<=0)continue;
      const previous=links.get(row.annId);
      links.set(row.annId,previous===undefined||previous===mal?mal:null);
    }
  }
  const labels={};
  for(const [ann,anime] of Object.entries(master.animeMap)){
    const name=anime.mainNames?.EN||anime.mainNames?.JA;
    if(name)labels[ann]=[name,links.get(Number(ann))||0];
  }
  await writeFile(new URL('../src/song-anime-labels.json',import.meta.url),JSON.stringify(labels)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await writeSongAnimeLabels();
