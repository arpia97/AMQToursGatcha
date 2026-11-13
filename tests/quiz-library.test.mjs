import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { QuizLibraryCore, WORKING_TITLES_URL } from "../src/quiz-library.js";
import {
  compactLibrarySong,
  libraryQuery,
} from "../public/quiz-library-data.js";
import { prepareQuizSongs } from "../public/quiz-rules.js";
import { resolveQuizImport } from "../src/quiz-import.js";
import { syncQuizLibraryAnswers } from "../src/quiz-library-sync.js";
import { Engine } from "../src/engine.js";
function dbFixture(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  const all = (s, ...a) => sql.prepare(s).all(...a),
    tx = (fn) => {
      sql.exec("BEGIN");
      try {
        const v = fn();
        sql.exec("COMMIT");
        return v;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    };
  return {
    sql,
    db: {
      all,
      one: (...a) => all(...a)[0],
      run: (s, ...a) => sql.prepare(s).run(...a),
      tx,
    },
    tx,
    all,
  };
}
const raw = (id) => ({
  annSongId: id,
  amqSongId: 100 + id,
  annId: 10 + id,
  songName: "Song " + id,
  songArtist: "Artist",
  audio: "song" + id + ".mp3",
  animeENName: "Anime " + id,
});
const song = (id) => compactLibrarySong(raw(id), ["Working " + id]);
function fixture(t, fetcher) {
  const f = dbFixture(t),
    seed = {
      schema: 1,
      version: "seed-test",
      source: "Fixture",
      generatedAt: "2026-11-01T00:00:00Z",
      count: 2,
      requested: 3,
      missing: [3],
      shards: [0],
      amq: { 101: [1], 102: [2] },
    },
    assets = {
      fetch: async (req) =>
        new URL(req.url).pathname.endsWith("manifest.json")
          ? Response.json(seed)
          : Response.json({ 1: song(1), 2: song(2) }),
    };
  let time = 1000000;
  return {
    ...f,
    assets,
    core: new QuizLibraryCore(f.db, assets, fetcher, () => time),
    tick: (ms = 30001) => (time += ms),
    restart: () => new QuizLibraryCore(f.db, assets, fetcher, () => time),
  };
}

test("the staged masterlist refresh resumes after restart, respects spacing and Retry-After, keeps missing cached songs and publishes only after validation", async (t) => {
  let calls = 0,
    block = true;
  const f = fixture(t, async (url, options) => {
    calls++;
    if (url === WORKING_TITLES_URL)
      return Response.json({
        1: ["New One"],
        2: ["New Two"],
        3: ["New Three"],
        4: ["Missing Four"],
      });
    if (block) {
      block = false;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "120" },
      });
    }
    assert.deepEqual(JSON.parse(options.body).ann_song_ids, [1, 2, 3, 4]);
    return Response.json([raw(1), raw(3)]);
  });
  const first = await f.core.action({ action: "start" }, "request-start");
  assert.equal(first.job.status, "running");
  await f.core.step();
  assert.equal(calls, 1);
  assert.equal((await f.core.status()).current.version, "seed-test");
  await f.core.step();
  assert.equal(calls, 1, "no early upstream request");
  f.tick();
  await f.core.step();
  assert.match((await f.core.status()).job.error, /429/);
  const next = f.core.nextAlarm();
  f.tick(119000);
  await f.core.step();
  assert.equal(calls, 2, "Retry-After retained");
  f.tick(2000);
  const core = f.restart();
  await core.step();
  assert.equal(calls, 3);
  assert.equal(
    (await core.status()).current.songs,
    2,
    "staged results not active",
  );
  f.tick();
  await core.step();
  const status = await core.status();
  assert.equal(status.job.status, "completed");
  assert.equal(status.current.songs, 3);
  assert.deepEqual(status.current.missing, [4]);
  assert.equal(status.job.retained, 1);
  assert.ok(next > 1000000);
  const cached = await core.lookup({ amqSongIds: [102] });
  assert.equal(cached.songs[0].title, "Song 2");
  assert.ok(cached.songs[0].titles.includes("New Two"));
  assert.equal(
    f.sql
      .prepare(
        "SELECT count(*) n FROM library_shards WHERE version LIKE '%:titles'",
      )
      .get().n,
    0,
  );
  assert.match(
    (await core.action({ action: "start" }, "request-start")).message,
    /started/,
  );
  await assert.rejects(
    core.action({ action: "pause" }, "request-start"),
    (e) => e.status === 409,
  );
});

test("a paused or superseded fetch cannot commit; invalid/shrunken sources preserve the active version", async (t) => {
  let finish;
  const f = fixture(t, () => new Promise((resolve) => (finish = resolve)));
  await f.core.action({ action: "start" }, "start-race");
  const pending = f.core.step();
  await new Promise((r) => setImmediate(r));
  await f.core.action({ action: "pause" }, "pause-race");
  finish(Response.json({ 1: ["One"], 2: ["Two"], 3: ["Three"] }));
  await pending;
  assert.equal(f.core.get("job").phase, "titles");
  assert.equal((await f.core.status()).job.status, "paused");
  await f.core.action({ action: "resume" }, "resume-race");
  f.tick(90001);
  f.core.fetcher = async () => Response.json({});
  await f.core.step();
  assert.match((await f.core.status()).job.error, /incomplete/);
  assert.equal((await f.core.status()).current.version, "seed-test");
  await f.core.action({ action: "cancel" }, "cancel-race");
  assert.equal(f.core.nextAlarm(), null);
  assert.equal((await f.core.status()).job.status, "cancelled");
});

test("AMQ export titles and audio beat incomplete fallback data; metadata lookup and saved-quiz sync preserve authority and running attempts", async (t) => {
  const fallback = {
      version: "new-cache",
      songs: [
        {
          ...song(1),
          titles: ["Fallback Only"],
          audio: "https://example.com/old.mp3",
        },
      ],
    },
    master = {
      masterListId: "fixture",
      animeMap: {
        11: {
          mainNames: { EN: "AMQ Known" },
          songLinks: { OP: [{ songId: 101, annSongId: 1 }] },
        },
      },
    };
  const input = [
    {
      songInfo: {
        annSongId: 1,
        amqSongId: 101,
        animeNames: { english: "Export Main" },
        altAnimeNamesAnswers: ["Export Alternative"],
        songName: "Export Song",
      },
      videoUrl: "https://example.com/new.mp3",
      answer: "Never Accept Player Guess",
    },
  ];
  const rows = await resolveQuizImport(
    input,
    () => {
      throw Error("No upstream request allowed");
    },
    new Map(),
    0,
    fallback.songs,
  );
  assert.equal(rows[0].audio, "https://example.com/new.mp3");
  assert.deepEqual(libraryQuery(rows), { annSongIds: [1], amqSongIds: [101] });
  const prepared = prepareQuizSongs(rows, master, fallback),
    s = prepared.songs[0];
  assert.ok(s.answers.includes("Export Alternative"));
  assert.ok(s.answers.includes("Export Main"));
  assert.ok(!s.answers.includes("Fallback Only"));
  assert.ok(!s.answers.includes("Never Accept Player Guess"));
  assert.equal(s.answerSource, "amq-export");
  const f = dbFixture(t),
    e = new Engine(f.all, f.tx);
  e.host("players", { players: [{ id: "p", name: "Player" }] });
  e.quiz.save({ id: "export", name: "Export", songs: prepared.songs });
  const simple = {
    ...prepared.songs[0],
    answerSource: "amq",
    workingTitles: [],
    answers: ["AMQ Known"],
  };
  e.quiz.save({ id: "fallback", name: "Fallback", songs: [simple] });
  e.run(
    "INSERT INTO quiz_runs VALUES(?,?,?)",
    "p",
    "fallback",
    JSON.stringify({ id: "running", songs: [simple], index: 0 }),
  );
  const attempt = e.one("SELECT data FROM quiz_runs WHERE player=?", "p").data;
  const before = (id) =>
    e.all("SELECT id,data FROM quiz_songs WHERE quiz=? ORDER BY id", id);
  const protectedResult = e.tx(() =>
    syncQuizLibraryAnswers(e, "export", before("export"), master, fallback),
  );
  assert.equal(protectedResult.protectedSongs, 1);
  assert.equal(protectedResult.addedAnswers, 0);
  const updated = e.tx(() =>
    syncQuizLibraryAnswers(e, "fallback", before("fallback"), master, fallback),
  );
  assert.equal(updated.addedAnswers, 1);
  assert.equal(
    e.one("SELECT data FROM quiz_runs WHERE player=?", "p").data,
    attempt,
  );
  const stale = before("fallback");
  e.run("DELETE FROM quiz_songs WHERE quiz=?", "fallback");
  assert.throws(
    () => syncQuizLibraryAnswers(e, "fallback", stale, master, fallback),
    (e) => e.status === 409,
  );
});

test("the supplied seed contains all 38194 unique returned records and documents exactly the six API-missing IDs", async () => {
  const root = new URL("../public/quiz-library/", import.meta.url),
    m = JSON.parse(await fs.readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(
    m.sourceSha256,
    "dbadc351ac0702361209fa24fe3be9b845231645f76e5b246bdddf9579c400f2",
  );
  assert.equal(m.requested, 38200);
  assert.deepEqual(m.missing, [3249, 11315, 11444, 12300, 14117, 38061]);
  const ids = new Set();
  for (const b of m.shards) {
    const rows = JSON.parse(
      await fs.readFile(new URL(b + ".json", root), "utf8"),
    );
    for (const [id, s] of Object.entries(rows)) {
      assert.equal(Number(id), s.annSongId);
      assert.ok(!ids.has(id));
      ids.add(id);
      assert.ok(s.titles.length);
      if (s.amqSongId) assert.ok(m.amq[s.amqSongId].includes(s.annSongId));
    }
  }
  assert.equal(ids.size, 38194);
  assert.equal(m.count, ids.size);
});
