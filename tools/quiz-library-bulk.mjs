import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

export async function writeBulkShards(root,manifest){
  manifest.bulkSize=8;
  for(let start=0;start<manifest.shards.length;start+=manifest.bulkSize){
    const buckets=manifest.shards.slice(start,start+manifest.bulkSize);
    const rows=await Promise.all(buckets.map(async b=>JSON.parse(await readFile(new URL(b+'.json',root),'utf8'))));
    const data=JSON.stringify({version:manifest.version,buckets,rows});
    await writeFile(new URL('bulk-'+start+'.bin',root),gzipSync(data));
  }
}
