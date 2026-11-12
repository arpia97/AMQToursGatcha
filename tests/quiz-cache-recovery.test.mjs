import test from "node:test";
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
