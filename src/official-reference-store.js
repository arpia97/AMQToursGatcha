import bundled from './official-coverage-version.json' with {type:'json'};
import {libraryJSON} from './quiz-library.js';
import {buildOfficialReference} from './official-reference.js';

export const officialActorName='play-official-amq-coverage-v1';
const stateKey='official-reference-state';
const masterUrl='https://animemusicquiz.com/libraryMasterList';
const mirrorUrl='https://raw.githubusercontent.com/arpia97/AMQToursGatcha/official-amq-reference/';

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
    let response;
    try {
      response=await fetcher(masterUrl,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
    } catch { /* Check the project mirror when the upstream connection is unavailable. */ }
    let ref, manifest, etag=null;
    if (response?.status===304 && previous.etag) {
      return this.confirm(previous,'direct',Date.now());
    } else if (response?.ok) {
      ref=buildOfficialReference(await libraryJSON(response,32000000));
      etag=response.headers.get('etag');
    } else {
      await response?.body?.cancel();
      const get=path=>fetcher(mirrorUrl+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});
      manifest=await libraryJSON(await get('manifest.json'),16000);
      if (!/^[a-f0-9]{64}$/.test(manifest.revision) || typeof manifest.version!=='string' || !Number.isSafeInteger(manifest.sourceCheckedAt) || manifest.sourceCheckedAt<=0)
        throw Error('Invalid AMQ reference manifest.');
      if (previous.revision===manifest.revision && previous.version===manifest.version)
        return this.confirm(previous,'mirror',manifest.sourceCheckedAt);
      ref=await libraryJSON(await get('coverage.json?revision='+manifest.revision),16000000);
      if (ref.version!==manifest.version || !Array.isArray(ref.ids) || !ref.ids.length)
        throw Error('The verified AMQ reference is updating. Try again shortly.');
    }
    if (typeof ref.version!=='string' || ref.version.localeCompare(previous.version,'en',{numeric:true})<0)
      throw Error('The available export is older than the active version.');
    const bytes=new TextEncoder().encode(JSON.stringify(ref));
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    const revision=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
    if (manifest && manifest.revision!==revision) throw Error('AMQ reference checksum mismatch. Try again shortly.');
    const checkedAt=Date.now();
    const current={version:ref.version,revision,checkedAt,etag,source:manifest?'mirror':'direct',sourceCheckedAt:manifest?.sourceCheckedAt??checkedAt};
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
    return {...current,changed:ref.version!==previous.version||Boolean(previous.revision && previous.revision!==revision)};
  }
  confirm(previous,source,sourceCheckedAt) {
    const current={...previous,source,sourceCheckedAt,checkedAt:Date.now()};
    this.core.set(stateKey,current);
    return {...current,changed:false};
  }
}
