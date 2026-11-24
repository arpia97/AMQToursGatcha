import fs from 'node:fs/promises';
import {buildOfficialReference} from '../src/official-reference.js';
import {pathToFileURL} from 'node:url';

export async function writeOfficialCoverage(data) {
  const reference=buildOfficialReference(data);
  const {version}=reference;
  await fs.writeFile(new URL('../public/quiz-library/official-coverage.json',import.meta.url),JSON.stringify(reference)+'\n');
  await fs.writeFile(new URL('../src/official-coverage-version.json',import.meta.url),JSON.stringify({version})+'\n');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  await writeOfficialCoverage(JSON.parse(await fs.readFile(process.argv[2],'utf8')));
}
