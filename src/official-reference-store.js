import bundled from './official-coverage-version.json' with {type:'json'};
import {libraryJSON} from './quiz-library.js';
import {buildOfficialReference} from './official-reference.js';

export const officialActorName='play-official-amq-coverage-v1';
const stateKey='official-reference-state';
const masterUrl='https://animemusicquiz.com/libraryMasterList';

export class OfficialReferenceStore {
  constructor(core) {
    this.core=core;
  }
  status() {
    const saved=this.core.get(stateKey);
    // Official export IDs start with a sortable release timestamp.
    if (saved && saved.version.localeCompare(bundled.version,'en',{numeric:true})>=0) return saved;
    return {version:bundled.version,checkedAt:null};
  }
  snapshot(revision) {
    if (this.status().revision!==revision) throw Error('The official export changed. Reopen Song Library to load it.');
    const decoder=new TextDecoder();
    let json='';
    for (const row of this.core.db.all('SELECT data FROM official_reference_parts ORDER BY part')) {
      json+=decoder.decode(row.data,{stream:true});
    }
    return json+decoder.decode();
  }
  refresh(fetcher=fetch) {
    this.pending??=this.check(fetcher).finally(()=>{this.pending=null;});
    return this.pending;
  }
  async check(fetcher) {
    const previous=this.status();
    const headers=previous.etag?{'If-None-Match':previous.etag}:{};
    const response=await fetcher(masterUrl,{headers,cache:'no-store',signal:AbortSignal.timeout(45000)});
    if (response.status===304 && previous.etag) {
      const current={...previous,checkedAt:Date.now()};
      this.core.set(stateKey,current);
      return {version:current.version,checkedAt:current.checkedAt,changed:false};
    }
    const source=await libraryJSON(response,32000000);
    const ref=buildOfficialReference(source);
    if (typeof ref.version!=='string' || ref.version.localeCompare(previous.version,'en',{numeric:true})<0)
      throw Error('AMQ returned an older export. Try again later.');
    const bytes=new TextEncoder().encode(JSON.stringify(ref));
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    const revision=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
    const current={version:ref.version,revision,checkedAt:Date.now(),etag:response.headers.get('etag')};
    const db=this.core.db;
    db.tx(()=>{
      if (revision!==previous.revision) {
        db.run('CREATE TABLE IF NOT EXISTS official_reference_parts(part INTEGER PRIMARY KEY,data BLOB NOT NULL)');
        db.run('DELETE FROM official_reference_parts');
        for (let i=0;i<bytes.length;i+=512000)
          db.run('INSERT INTO official_reference_parts VALUES(?,?)',i,bytes.subarray(i,i+512000));
      }
      this.core.set(stateKey,current);
    });
    return {version:ref.version,checkedAt:current.checkedAt,changed:ref.version!==previous.version||Boolean(previous.revision && previous.revision!==revision)};
  }
}
