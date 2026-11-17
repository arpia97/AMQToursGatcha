import fs from 'node:fs/promises';
import {buildArtistLibrary} from '../src/play-artists.js';
const input=process.argv[2];
const master=input?JSON.parse(await fs.readFile(input,'utf8')):await (await fetch('https://animemusicquiz.com/libraryMasterList',{signal:AbortSignal.timeout(30000)})).json();
if(!master.masterListId||Object.keys(master.artistMap||{}).length<1000)throw Error('Invalid artist library; existing file kept.');
const result=buildArtistLibrary(master);
await fs.writeFile(new URL('../public/play-artists.json',import.meta.url),JSON.stringify(result)+'\n');
console.log(JSON.stringify({version:result.version,artists:result.names.length,songs:Object.keys(result.songs).length}));
