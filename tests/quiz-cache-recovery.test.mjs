import test from "node:test";
import { publicPlaySnapshot } from "../src/play-public-snapshot.js";
import assert from "node:assert/strict";
import {
  quizAudioUrl,
  createQuizAudioCache,
} from "../public/quiz-audio-cache.js";
import {
  durableRead,
  storageUnavailableResponse,
} from "../src/durable-recovery.js";
test("Quiz preload rewrites only AMQ mirrors, downloads distinct files with bounded concurrency, reuses blobs and releases memory", async () => {
  assert.equal(
    quizAudioUrl("https://eudist.animemusicquiz.com/a.mp3", "NAW"),
    "https://nawdist.animemusicquiz.com/a.mp3",
  );
  assert.equal(
    quizAudioUrl("https://example.com/a.mp3", "NAE"),
    "https://example.com/a.mp3",
  );
  let active = 0,
    peak = 0,
    calls = 0,
    created = 0;
  const revoked = [],
    progress = [];
  const cache = createQuizAudioCache({
    fetcher: async () => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return new Response(new Blob(["mp3"], { type: "application/octet-stream" }));
    },
    createUrl: blob => { assert.equal(blob.type,"audio/mpeg"); return "blob:" + ++created; },
    revokeUrl: (u) => revoked.push(u),
  });
  const sources = ["a", "a", "b", "c"].map(
    (s) => "https://eudist.animemusicquiz.com/" + s + ".mp3",
  );
  await cache.prepare(sources, "EU", { onProgress: (p) => progress.push(p) });
  assert.equal(calls, 3);
  assert.ok(peak <= 2);
  assert.equal(progress.at(-1).loaded, 3);
  await cache.prepare(sources, "EU");
  assert.equal(calls, 3);
  assert.ok(cache.url(sources[0], "EU"));
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    cache.prepare(sources, "NAE", { signal: aborted.signal }),
    { name: "AbortError" },
  );
  cache.clear();
  assert.equal(revoked.length, 3);
  assert.equal(cache.url(sources[0], "EU"), null);
});
test("Storage recovery reacquires a stub for one safe read retry, never replays writes or overloads and emits a JSON503", async () => {
  let attempts = 0,
    waits = 0;
  const failure = Object.assign(
    Error("Internal error in Durable Object storage caused object to be reset"),
    { retryable: true },
  );
  const ns = {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: async (request) => {
        attempts++;
        if (attempts === 1) throw failure;
        return new Response(id + request.method);
      },
    }),
  };
  const response = await durableRead(
    ns,
    new Request("https://test/api/state"),
    { wait: async () => waits++ },
  );
  assert.match(await response.text(), /GET$/);
  assert.equal(attempts, 2);
  assert.equal(waits, 1);
  for (const [method, overloaded] of [
    ["POST", false],
    ["GET", true],
  ]) {
    attempts = 0;
    failure.overloaded = overloaded;
    await assert.rejects(
      durableRead(ns, new Request("https://test/api/test", { method }), {
        wait: async () => waits++,
      }),
    );
    assert.equal(attempts, 1);
  }
  assert.equal(storageUnavailableResponse(failure).status, 503);
  assert.equal(storageUnavailableResponse(Error("coding error")), null);
});

test("Public lobby snapshots survive a short queue outage and expire after one minute",async()=>{
  let at=Date.now(),calls=0,fail=false;
  const url=new URL('https://game/api/play-lobbies');
  const rooms=[{code:'fixture',locked:true}];
  let entry;
  const cache={match:async()=>entry&&new Response(await entry.clone().text(),{headers:{
    'X-Play-Snapshot-At':String(at),
  }}),put:async(key,value)=>{entry=value;}};
  const namespace={getByName:()=>({lobbyDirectory(){calls++;if(fail)throw Object.assign(Error('busy'),{overloaded:true});return rooms;}})};
  const ctx={waitUntil(){}};
  assert.deepEqual(await (await publicPlaySnapshot(url,namespace,cache,ctx)).json(),rooms);
  fail=true;
  assert.equal((await publicPlaySnapshot(url,namespace,cache,ctx)).headers.get('X-Play-Snapshot'),'fresh');
  assert.equal(calls,1);
  at-=15_000;
  const stale=await publicPlaySnapshot(url,namespace,cache,ctx);
  assert.equal(stale.headers.get('X-Play-Snapshot'),'stale');
  assert.equal(stale.headers.get('Cache-Control'),'no-store');assert.deepEqual(await stale.json(),rooms);
  at-=60_000;
  assert.equal((await publicPlaySnapshot(url,namespace,cache,ctx)).status,503);
  assert.equal(calls,3);
});


test('rolling quiz audio bounds concurrency and memory and continues after a failed song',async()=>{
  const {createRollingQuizAudio}=await import('../public/quiz-audio-cache.js');
  const calls=[],released=[],pending=new Map();
  const rolling=createRollingQuizAudio(()=>{
    let stored;
    return {
      prepare([source],server,{signal}){
        calls.push(source);
        return new Promise((resolve,reject)=>{
          pending.set(source,()=>{stored=source;resolve();});
          signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
          if(source==='b')reject(Error('bad mirror'));
        });
      },
      url(){return stored;},clear(){if(stored)released.push(stored);stored=null;},
    };
  });
  const tick=()=>new Promise(r=>setImmediate(r));
  const window=['now','a','b','c','d','e'];
  rolling.update('run','EU',window);
  assert.deepEqual(calls,['a','b']);
  await tick();
  assert.deepEqual(calls,['a','b','c']);
  rolling.update('run','EU',window);
  for(const id of ['a','c','d','e']){pending.get(id)();await tick();}
  assert.equal(rolling.url('a','EU'),'a');
  rolling.update('run','EU',['c','d','e','f']);
  assert.deepEqual(calls,['a','b','c','d','e','f']);
  assert.ok(released.includes('a'));
  rolling.clear();
  await tick();
  assert.ok(!rolling.url('c','EU'));
});
