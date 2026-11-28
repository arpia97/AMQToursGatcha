// Refresh poster references offline. No requests to Tenrai are needed during gameplay.
import {mkdir,writeFile,readFile,rename} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {fetchJikan} from '../src/jikan.js';

const directory=new URL('../public/song-posters/',import.meta.url);
const shards=new Map();
let total=0,seen=0;
for(let page=1;;page++){
  let data;
  for(let attempt=0;!data;attempt++){
    try{
      data=await fetchJikan('/anime?order_by=mal_id&sort=asc&limit=100&page='+page);
    }catch(error){
      if(attempt>=5||error.upstreamStatus&&error.upstreamStatus<500&&error.upstreamStatus!==429)throw error;
      await wait(Math.max(error.retryMs||0,2000*2**attempt));
    }
  }
  if(data.pagination?.current_page!==page||!Array.isArray(data.data)||!data.data.length)throw Error('Incomplete Tenrai page '+page);
  for(const row of data.data){
    seen++;
    const id=row.mal_id;
    const path=/^https:\/\/cdn\.myanimelist\.net\/images\/anime\/(\d+\/\d+)\.jpg$/i.exec(row.images?.jpg?.image_url)?.[1];
    if(!Number.isSafeInteger(id)||!path)continue;
    const shard=Math.floor(id/4096);
    if(!shards.has(shard))shards.set(shard,{});
    const entries=shards.get(shard);
    if(!entries[id])total++;
    entries[id]=path;
  }
  if(page%25===0)console.log('Tenrai pages',page,'/',data.pagination.last_visible_page,'·',total,'posters');
  if(!data.pagination.has_next_page)break;
  await wait(525);
}
if(!total)throw Error('Tenrai returned no usable poster references.');
await mkdir(directory,{recursive:true});
for(const [shard,entries] of shards){
  const url=new URL(shard+'.json',directory);
  // Keep a last-known poster if an upstream page temporarily loses its image.
  let previous={};
  try{previous=JSON.parse(await readFile(url,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=new URL(shard+'.json.tmp',directory);
  await writeFile(temporary,JSON.stringify({...previous,...entries})+'\n');
  await rename(temporary,url);
}
console.log('Indexed',total,'MAL poster references from',seen,'anime records.');
