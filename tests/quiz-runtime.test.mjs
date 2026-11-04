import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const require = createRequire(import.meta.url),
  { Miniflare, Response: RuntimeResponse } = createRequire(
    require.resolve("wrangler/package.json"),
  )("miniflare");
test("Worker quiz endpoints protect imports and answers, match AMQ, hide answer keys and award once", async (t) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/worker.js", import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
  });
  let audioLookups = 0,
    failAudioLookup = false;
  const mf = new Miniflare({
    workers: [
      {
        config: {
          name: "quiz-runtime-test",
          compatibilityDate: "2026-10-01",
          manifest: {
            mainModule: "worker.js",
            modules: {
              "worker.js": {
                type: "esm",
                contents: bundle.outputFiles[0].text,
              },
            },
          },
          exports: {
            Game: {
              type: "durable-object",
              storage: "sqlite",
              state: "created",
            },
          },
          env: {
            GAME: {
              type: "durable-object",
              worker: "quiz-runtime-test",
              exportName: "Game",
            },
            HOST_TOKEN: {
              type: "json",
              value: "isolated-host-token-only-for-tests-12345678",
            },
          },
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: async (request) => {
              if (
                new URL(request.url).pathname === "/api/ann_song_ids_request"
              ) {
                audioLookups++;
                if (failAudioLookup)
                  return new RuntimeResponse("Unavailable", { status: 503 });
                const body = await request.json();
                return new RuntimeResponse(
                  JSON.stringify(
                    body.ann_song_ids.map((id) => ({
                      annId: 1,
                      annSongId: id,
                      audio: "amq-" + id + ".mp3",
                    })),
                  ),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
              return new RuntimeResponse(
                JSON.stringify({
                  masterListId: "test",
                  animeMap: {
                    1: {
                      mainNames: { EN: "Anime Test", JA: "Alternative Test" },
                      songLinks: { OP: [] },
                    },
                  },
                }),
                { headers: { "Content-Type": "application/json" } },
              );
            },
          },
        },
      },
    ],
  });
  t.after(() => mf.dispose());
  const post = (path, body, headers = {}) =>
      mf.dispatchFetch("http://game/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    host = {
      Authorization: "Bearer isolated-host-token-only-for-tests-12345678",
    };

  let response = await post(
    "host/players",
    { players: [{ id: "1", name: "Local User" }] },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  response = await post("register", {
    player: "1",
    password: "local-only-password",
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("Set-Cookie").split(";")[0];
  const auth = { Cookie: cookie };
  const input = Array.from({ length: 20 }, (_, i) => ({
    annId: 1,
    audio: "fixture-song-" + i + ".mp3",
    songName: "Song " + i,
  }));
  response = await post("host/quiz-save", {
    name: "Test",
    input,
    published: true,
  });
  assert.equal(response.status, 401);
  response = await post("host/quiz-preview", { input });
  assert.equal(response.status, 401);
  response = await post("host/quiz-preview", { input }, auth);
  assert.equal(response.status, 401);
  response = await post(
    "host/quiz-preview",
    { input: [...input, input[0], { annId: 1, HQ: "video.webm" }] },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const review = await response.json();
  assert.equal(review.songs.length, 20);
  assert.equal(review.songs[0].title, "Song 0");
  assert.equal(review.songs[0].answers[0], "Anime Test");
  assert.equal(review.songs[0].audio, undefined);
  assert.equal(review.rejected.length, 1);
  response = await mf.dispatchFetch("http://game/api/host/quizzes", {
    headers: host,
  });
  assert.equal((await response.json()).quizzes.length, 0);
  response = await post(
    "host/quiz-preview",
    { input: [{ annId: 1, HQ: "video.webm" }] },
    host,
  );
  assert.equal((await response.json()).songs.length, 0);
  response = await post("host/quiz-preview", {}, host);
  assert.equal(response.status, 400);
  response = await post(
    "host/quiz-save",
    { id: "test", name: "Test", input, published: true, title: "Perfect" },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 20);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test");
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test", {
    headers: auth,
  });
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test", {
    headers: host,
  });
  let editing = await response.json();
  assert.equal(editing.songs.length, 20);
  response = await post(
    "host/quiz-save",
    {
      id: "test",
      name: "Test",
      published: true,
      title: "Perfect",
      expectedUpdated: editing.updated,
      songMode: "append",
      input: [
        { annId: 1, audio: "fixture-song-20.mp3", songName: "Added Song" },
      ],
    },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 21);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test", {
    headers: host,
  });
  editing = await response.json();
  response = await post(
    "host/quiz-save",
    {
      id: "test",
      name: "Test",
      published: true,
      title: "Perfect",
      expectedUpdated: editing.updated,
      removeSongIds: [0],
    },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 20);
  response = await post(
    "host/quiz-save",
    { id: "draft", name: "Draft", input: input.slice(0, 1), published: false },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 1);
  response = await post(
    "host/quiz-save",
    {
      id: "invalid",
      name: "Invalid",
      input: [{ annId: 1, HQ: "video.webm" }],
      published: false,
    },
    host,
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /No playable MP3 songs/);
  const amqBody = {
    id: "amq",
    name: "AMQ Export",
    published: false,
    input: {
      roomName: "Local",
      songs: [501, 502].map((id) => ({
        songInfo: {
          annId: 1,
          annSongId: id,
          songName: "AMQ " + id,
          artist: "Artist",
        },
        answer: "Ignore player guess",
      })),
    },
  };
  response = await post("host/quiz-preview", { input: amqBody.input }, host);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs.length, 2);
  assert.equal(audioLookups, 1);
  const importKey = "amq-test-import";
  response = await post("host/quiz-save", amqBody, {
    ...host,
    "Idempotency-Key": importKey,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 2);
  assert.equal(audioLookups, 1);
  response = await post("host/quiz-save", amqBody, {
    ...host,
    "Idempotency-Key": importKey,
  });
  assert.equal(response.status, 200);
  assert.equal(audioLookups, 1);
  response = await post("host/quiz-save", amqBody, host);
  assert.equal(response.status, 200);
  assert.equal(audioLookups, 1);
  response = await post(
    "host/quiz-save",
    {
      ...amqBody,
      input: {
        songs: [
          {
            songInfo: {
              annId: 1,
              annSongId: 501,
              songName: "Replacement",
              audio: "replacement.mp3",
            },
          },
        ],
      },
    },
    host,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).songs, 1);
  failAudioLookup = true;
  response = await post(
    "host/quiz-save",
    {
      ...amqBody,
      input: {
        songs: [
          { songInfo: { annId: 1, annSongId: 503, songName: "Unavailable" } },
        ],
      },
    },
    host,
  );
  assert.equal(response.status, 502, await response.clone().text());
  assert.match((await response.json()).error, /No pool was changed/);
  response = await mf.dispatchFetch("http://game/api/host/quizzes", {
    headers: host,
  });
  assert.equal(
    (await response.json()).quizzes.find((q) => q.id === "amq").songs,
    1,
  );
  failAudioLookup = false;
  const visible = await mf.dispatchFetch("http://game/api/quizzes");
  assert.deepEqual(
    (await visible.json()).quizzes.map((q) => q.id),
    ["test"],
  );
  response = await mf.dispatchFetch("http://game/api/quiz-run?quiz=test");
  assert.equal(response.status, 401);
  response = await post("quiz-start", { quiz: "test" }, auth);
  assert.equal(response.status, 200);
  let run = (await response.json()).run;
  const oldRunId = run.id;
  response = await post(
    "quiz-restart",
    { quiz: "test", run: run.id, index: 0 },
    auth,
  );
  assert.equal(response.status, 200);
  run = (await response.json()).run;
  assert.notEqual(run.id, oldRunId);
  assert.equal(run.index, 0);
  assert.ok(
    run.audio.startsWith("https://naedist.animemusicquiz.com/fixture-song-"),
  );
  assert.equal(run.answer, undefined);
  assert.equal(run.submittedAnswer, undefined);
  response = await mf.dispatchFetch(
    "http://game/api/quiz-answers?quiz=test&q=Alt",
  );
  assert.deepEqual((await response.json()).answers, ["Alternative Test"]);
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    response = await post(
      "quiz-ready",
      { quiz: "test", run: run.id, index: i },
      auth,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const ready = (await response.json()).run;
    if (ready.startsAt > Date.now())
      await new Promise((resolve) =>
        setTimeout(resolve, ready.startsAt - Date.now() + 10),
      );
    response = await post(
      "quiz-answer",
      {
        quiz: "test",
        run: run.id,
        index: i,
        answer: "Alternative Test",
        score: 0,
      },
      auth,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const answered = (await response.json()).run;
    assert.equal(answered.submittedAnswer, "Alternative Test");
    assert.equal(answered.answer, "Anime Test");
    assert.equal(answered.correct, true);
    const b = { quiz: "test", run: run.id, index: i },
      key = crypto.randomUUID(),
      headers = { ...auth, "Idempotency-Key": key };
    response = await post("quiz-next", b, headers);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    run = result.run;
    const retry = await post("quiz-next", b, headers);
    assert.deepEqual(await retry.json(), result);
  }
  assert.equal(run.score, 20);
  assert.equal(run.reward.total, 2900);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  const profile = await response.json();
  assert.equal(profile.titles[0].title, "Perfect");
  assert.equal(profile.balance, 7900);
  response = await mf.dispatchFetch("http://game/api/my-titles");
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch("http://game/api/my-titles", {
    headers: auth,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).titles[0].equipped, true);
  response = await post("equip-titles", { quizzes: ["not-earned"] }, auth);
  assert.equal(response.status, 400);
  response = await post("equip-titles", { quizzes: [] }, auth);
  assert.equal(response.status, 200);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  const hidden = await response.json();
  assert.equal(hidden.titles.length, 0);
  assert.equal(hidden.balance, 7900);
  response = await post("equip-titles", { quizzes: ["test"] }, auth);
  assert.equal(response.status, 200);
  response = await post(
    "host/quiz-save",
    { id: "test", name: "Test", title: "Renamed Title", published: true },
    host,
  );
  assert.equal(response.status, 200);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  assert.equal((await response.json()).titles[0].title, "Renamed Title");
  response = await mf.dispatchFetch(
    "http://game/api/quiz-leaderboard?quiz=test",
  );
  const board = await response.json();
  assert.equal(board.rows[0].id, "1");
  assert.equal(board.rows[0].best, 20);
  assert(board.rows[0].bestAt > 0);
  response = await post("host/quiz-scores-reset", {
    quiz: "test",
    confirmation: "RESET QUIZ SCORES AND TITLES",
  });
  assert.equal(response.status, 401);
  response = await post(
    "host/quiz-scores-reset",
    { quiz: "test", confirmation: "RESET QUIZ SCORES AND TITLES" },
    host,
  );
  assert.equal(response.status, 200);
  response = await mf.dispatchFetch(
    "http://game/api/quiz-leaderboard?quiz=test",
  );
  assert.equal((await response.json()).total, 0);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  const resetProfile = await response.json();
  assert.equal(resetProfile.titles.length, 0);
  assert.equal(resetProfile.balance, 7900);
});
