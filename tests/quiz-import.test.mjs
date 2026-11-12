import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuizImport } from "../src/quiz-import.js";
import { prepareQuizSongs } from "../public/quiz-rules.js";
const row = (id, extra = {}) => ({
  songNumber: id,
  songInfo: {
    annId: 1,
    annSongId: id,
    animeNames: { english: "AMQ Export Title" },
    songName: "Song " + id,
    artist: "Artist",
  },
  answer: "Wrong player answer",
  ...extra,
});
const master = {
  masterListId: "test",
  animeMap: {
    1: {
      mainNames: { EN: "Accepted Anime" },
      names: [{ name: "Accepted Alias" }],
      songLinks: { OP: [{ annSongId: 1, songId: 9 }] },
    },
    2: {
      mainNames: { EN: "Shared Anime" },
      songLinks: { ED: [{ annSongId: 99, songId: 9 }] },
    },
  },
};
test("AMQ songInfo exports resolve exact occurrence IDs in one batch and retain authoritative shared answers", async () => {
  const calls = [];
  const cache = new Map();
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json([
      { annSongId: 2, amqSongId: 10, audio: "two.mp3" },
      { annSongId: 1, amqSongId: 9, audio: "one.mp3" },
    ]);
  };
  const input = { roomName: "Not imported", songs: [row(1), row(2), row(1)] };
  const rows = await resolveQuizImport(input, fetcher, cache, 1000);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.ann_song_ids, [1, 2]);
  assert.match(calls[0].url, /ann_song_ids_request$/);
  const ready = prepareQuizSongs(rows, master);
  assert.equal(ready.songs.length, 2);
  assert.equal(ready.rejected.length, 0);
  assert.equal(ready.songs[0].title, "Song 1");
  assert.equal(ready.songs[0].artist, "Artist");
  assert.ok(ready.songs[0].answers.includes("Shared Anime"));
  assert.ok(ready.songs[0].answers.includes("Accepted Alias"));
  assert.ok(!ready.songs[0].answers.includes("Wrong player answer"));
  assert.ok(ready.songs[0].answers.includes("AMQ Export Title"));
  assert.equal(ready.songs[0].answerSource,'amq-export');
  await resolveQuizImport(input, fetcher, cache, 2000);
  assert.equal(calls.length, 1);
  await resolveQuizImport(input, fetcher, cache, 86402000);
  assert.equal(calls.length, 2);
});
test("AMQ nested site IDs and supplied MP3s work without requests; AnisongDB imports remain unchanged", async () => {
  const input = [
    {
      songInfo: {
        siteIds: { annId: 1, annSongId: 1 },
        songName: "Nested",
        artist: "Artist",
        audio: "nested.mp3",
      },
    },
    { annId: 1, audio: "existing.mp3", songName: "Existing" },
  ];
  const rows = await resolveQuizImport(input, () => {
    throw Error("Unexpected lookup");
  });
  const ready = prepareQuizSongs(rows, master);
  assert.equal(ready.songs.length, 2);
  assert.equal(ready.songs[0].title, "Nested");
  assert.match(ready.songs[1].audio, /existing.mp3$/);
});
test("shared AMQ song IDs use their own endpoint and never interpret occurrence IDs as shared IDs", async () => {
  const calls = [];
  const rows = await resolveQuizImport(
    [
      { songInfo: { annId: 1, amqSongId: 9, songName: "Shared" } },
      {
        songInfo: {
          annId: 1,
          annSongId: 1,
          amqSongId: 999,
          songName: "Occurrence",
        },
      },
    ],
    async (url, options) => {
      calls.push(url);
      const ann = url.includes("ann_song");
      return Response.json([
        ann
          ? { annSongId: 1, amqSongId: 9, audio: "ann.mp3" }
          : { amqSongId: 9, audio: "shared.mp3" },
      ]);
    },
  );
  assert.equal(calls.length, 2);
  assert.match(calls[0], /ann_song_ids_request$/);
  assert.match(calls[1], /amq_song_ids_request$/);
  assert.equal(rows[1].amqSongId, 9);
});
test("lookups are sequential batches of at most500 and ignore unrelated or video-only responses", async () => {
  const batches = [];
  const rows = await resolveQuizImport(
    Array.from({ length: 501 }, (_, i) => row(i + 1)),
    async (url, options) => {
      const ids = JSON.parse(options.body).ann_song_ids;
      batches.push(ids.length);
      return Response.json([
        ...ids.map((id) => ({
          annSongId: id,
          audio: id === 1 ? "video.webm" : "song-" + id + ".mp3",
        })),
        { annSongId: 9000, audio: "other.mp3" },
      ]);
    },
  );
  assert.deepEqual(batches, [500, 1]);
  assert.equal(rows[0].audio, undefined);
  assert.match(rows[500].audio, /song-501.mp3$/);
  assert.equal(prepareQuizSongs(rows, master).rejected.length, 1);
});
test("unavailable metadata fails clearly without yielding a replacement pool; malformed exports fail before lookup", async () => {
  for (const response of [
    () => new Response("No", { status: 429 }),
    () => Response.json({ error: "Bad" }),
    () => new Response("not-json"),
  ])
    await assert.rejects(
      resolveQuizImport([row(1)], async () => response()),
      (e) => e.status === 502 && /No pool was changed/.test(e.message),
    );
  await assert.rejects(
    resolveQuizImport({ songs: "bad" }, () => {
      throw Error("Should not fetch");
    }),
    /AnisongDB or AMQ/,
  );
  const ready = prepareQuizSongs(
    await resolveQuizImport([row(1)], async () => Response.json([])),
    master,
  );
  assert.equal(ready.songs.length, 0);
  assert.equal(ready.rejected[0].reason, "No HTTPS MP3");
});

test("AMQ videoUrl MP3s are used directly without metadata requests and remain an alternate when explicit audio exists", async () => {
  const rows = await resolveQuizImport(
    {
      songs: [
        row(1, { videoUrl: "https://nawdist.animemusicquiz.com/direct.mp3" }),
        row(2, {
          audio: "https://example.com/old.mp3",
          videoUrl: "https://nawdist.animemusicquiz.com/new.mp3",
        }),
      ],
    },
    () => assert.fail("Supplied MP3 needs no lookup"),
  );
  const ready = prepareQuizSongs(rows, master);
  assert.equal(
    ready.songs[0].audio,
    "https://nawdist.animemusicquiz.com/direct.mp3",
  );
  assert.deepEqual(ready.songs[1].alternatives, [
    "https://nawdist.animemusicquiz.com/new.mp3",
  ]);
});
