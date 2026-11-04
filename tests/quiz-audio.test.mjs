import test from "node:test";
import assert from "node:assert/strict";
import { checkQuizAudio, applyQuizAudioReview } from "../src/quiz-audio.js";
test("audio checks use bounded HEAD requests, try supplied fallback MP3s and cache successful results", async () => {
  const calls = [],
    cache = new Map();
  let active = 0,
    max = 0;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setImmediate(r));
    active--;
    return new Response(null, {
      status: url.includes("broken") ? 404 : 200,
      headers: { "Content-Type": "audio/mpeg", "Content-Length": "1000" },
    });
  };
  const songs = Array.from({ length: 8 }, (_, i) => ({
    audio: "https://example.com/" + i + ".mp3",
  }));
  songs[0] = {
    audio: "https://example.com/broken.mp3",
    alternatives: ["https://example.com/fallback.mp3"],
  };
  let result = await checkQuizAudio(songs, fetcher, cache, 1000);
  assert.ok(result.checks.every((c) => c.working));
  assert.equal(result.checks[0].resolvedAudio, songs[0].alternatives[0]);
  assert.equal(max, 2);
  assert.equal(calls.length, 9);
  assert.ok(calls.every((c) => c.options.method === "HEAD"));
  await checkQuizAudio(songs, fetcher, cache, 2000);
  assert.equal(calls.length, 9);
  await assert.rejects(checkQuizAudio([...songs, songs[0]], fetcher), {
    status: 400,
  });
});
test("audio checks reject private targets, unsafe redirects, HTML and empty files; HEAD-unsupported hosts use a bounded range GET", async () => {
  const bad = await checkQuizAudio(
    [
      { audio: "https://127.0.0.1/a.mp3" },
      { audio: "https://machine.local/a.mp3" },
    ],
    () => assert.fail("No private requests"),
  );
  assert.ok(bad.checks.every((c) => !c.working));
  const calls = [];
  const result = await checkQuizAudio(
    ["redirect", "html", "empty", "range"].map((x) => ({
      audio: "https://example.com/" + x + ".mp3",
    })),
    async (url, o) => {
      calls.push({ url, o });
      if (url.includes("redirect"))
        return new Response(null, {
          status: 302,
          headers: { Location: "https://127.0.0.1/a.mp3" },
        });
      if (url.includes("html"))
        return new Response("html", {
          headers: { "Content-Type": "text/html" },
        });
      if (url.includes("empty"))
        return new Response(null, {
          headers: { "Content-Type": "audio/mpeg", "Content-Length": "0" },
        });
      return o.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response("ID3", {
            status: 206,
            headers: { "Content-Type": "audio/mpeg" },
          });
    },
  );
  assert.deepEqual(
    result.checks.map((c) => c.working),
    [false, false, false, true],
  );
  assert.equal(calls.at(-1).o.headers.Range, "bytes=0-1023");
  assert.equal(calls.filter((c) => c.url.includes("127.0.0.1")).length, 0);
});
test("save requires cached working links and only permits replacements/skips for the reviewed source pool", () => {
  const audio = "https://example.com/a.mp3",
    replacement = "https://example.com/new.mp3",
    other = "https://example.com/b.mp3",
    cache = new Map([[replacement, { working: true, at: 1000 }]]),
    prepared = {
      songs: [
        { audio, title: "A", answers: ["Authoritative"] },
        { audio: other, title: "B", answers: ["Other"] },
      ],
      rejected: [],
    };
  assert.throws(() => applyQuizAudioReview(prepared, {}, cache, 2000), {
    status: 409,
  });
  const result = applyQuizAudioReview(
    prepared,
    { audioOverrides: { [audio]: replacement }, skipAudio: [other] },
    cache,
    2000,
  );
  assert.equal(result.songs.length, 1);
  assert.equal(result.songs[0].audio, replacement);
  assert.deepEqual(result.songs[0].answers, ["Authoritative"]);
  assert.throws(
    () =>
      applyQuizAudioReview(prepared, { skipAudio: ["foreign"] }, cache, 2000),
    { status: 409 },
  );
  assert.throws(
    () =>
      applyQuizAudioReview(
        prepared,
        { audioOverrides: { [audio]: replacement }, skipAudio: [other] },
        cache,
        86402000,
      ),
    { status: 409 },
  );
});

test("an explicit retry rechecks a recently failed link instead of repeating the cached failure", async () => {
  const cache = new Map();
  let calls = 0,
    healthy = false;
  const songs = [{ audio: "https://example.com/temporary.mp3" }],
    fetcher = async () => {
      calls++;
      return new Response(null, {
        status: healthy ? 200 : 503,
        headers: { "Content-Type": "audio/mpeg" },
      });
    };
  assert.equal(
    (await checkQuizAudio(songs, fetcher, cache, 1000)).checks[0].working,
    false,
  );
  healthy = true;
  assert.equal(
    (await checkQuizAudio(songs, fetcher, cache, 2000)).checks[0].working,
    false,
  );
  assert.equal(
    (await checkQuizAudio(songs, fetcher, cache, 2000, true)).checks[0].working,
    true,
  );
  assert.equal(calls, 2);
});
