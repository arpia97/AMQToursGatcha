import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildOfficialReference} from '../src/official-reference.js';

const directory=process.argv[2];
if (!directory) throw Error('Pass an output directory for the official AMQ reference.');
const response=await fetch('https://animemusicquiz.com/libraryMasterList',{signal:AbortSignal.timeout(60000)});
if (!response.ok) throw Error('Official AMQ returned HTTP '+response.status);
const reference=buildOfficialReference(await response.json());
const bytes=JSON.stringify(reference);
const revision=createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(directory,{recursive:true});
await fs.writeFile(path.join(directory,'coverage.json'),bytes);
await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({version:reference.version,revision,sourceCheckedAt:Date.now()})+'\n');
console.log('Verified AMQ export',reference.version,'with',reference.ids.length,'recordings.');
