import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { JikanImport } from "../src/jikan-import.js";

function fixture(get) {
  const db = new DatabaseSync(":memory:");
  let time = 100000;
  const e = new Engine(
    (sql, ...args) => db.prepare(sql).all(...args),
    (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    () => time,
  );
  return { e, job: new JikanImport(e, get), advance: (n) => (time += n) };
}
const person = {
  mal_id: 118,
  name: "Kamiya, Hiroshi",
  images: {
    jpg: {
      image_url: "https://cdn.myanimelist.net/images/voiceactors/1/66163.jpg",
    },
  },
};
test("background import checkpoints pages, adds one identity per actor, and enforces request spacing", async () => {
  const calls = [];
  const f = fixture(async (path) => {
    calls.push(path);
    return path.startsWith("/anime?")
      ? {
          data: [
            { mal_id: 1, title: "First" },
            { mal_id: 2, title: "Second" },
          ],
          pagination: { has_next_page: false, items: { total: 2 } },
        }
      : {
          data: [
            {
              role: "Main",
              voice_actors: [
                { person, language: "Japanese" },
                { person, language: "Japanese" },
              ],
            },
          ],
        };
  });
  f.job.start();
  await f.job.step();
  assert.equal(calls.length, 0);
  f.advance(1000);
  await f.job.step();
  assert.equal(calls.length, 1);
  await f.job.step();
  assert.equal(calls.length, 1);
  f.advance(10000);
  await f.job.step();
  assert.equal(f.job.status().importedActors, 1);
  f.e.run(
    "UPDATE catalog SET name=? WHERE id=?",
    "Host corrected name",
    "mal-person-118",
  );
  f.advance(10000);
  await f.job.step();
  assert.equal(f.job.status().status, "completed");
  assert.equal(f.job.status().scannedTitles, 2);
  assert.equal(f.e.catalogStore.summary().seiyuu, 1);
  assert.equal(
    f.e.catalogStore.card("mal-person-118").name,
    "Host corrected name",
  );
  assert.equal(f.job.nextAlarm(), null);
});
test("upstream outages back off, Retry-After is respected, and authorization failures pause", async () => {
  const f = fixture(async () => {
    throw Object.assign(new Error("rate limited"), {
      upstreamStatus: 429,
      retryMs: 900000,
    });
  });
  f.job.start();
  f.advance(1000);
  const s = await f.job.step();
  assert.equal(s.status, "waiting");
  assert.equal(s.nextAt - s.updatedAt, 900000);
  assert.equal(s.importedActors, 0);
  assert.equal(s.scannedTitles, 0);
  const before = s.requests;
  await f.job.step();
  assert.equal(f.job.status().requests, before);
  f.job.pause();
  f.job.start();
  assert.equal(f.job.status().nextAt, s.nextAt);
  f.job.get = async () => {
    throw Object.assign(new Error("forbidden"), { upstreamStatus: 403 });
  };
  f.advance(900000);
  await f.job.step();
  assert.equal(f.job.status().status, "paused");
  assert.equal(f.job.nextAlarm(), null);
});
test("a pause discards an in-flight response and the persisted lease prevents overlap", async () => {
  let finish;
  let calls = 0;
  const f = fixture(() => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  });
  f.job.start();
  f.advance(1000);
  const work = f.job.step();
  await f.job.step();
  assert.equal(calls, 1);
  f.job.pause();
  finish({ data: [], pagination: { has_next_page: false } });
  await work;
  assert.equal(f.job.status().status, "paused");
  assert.equal(f.job.status().scannedTitles, 0);
});

test("migrating a retired-provider job keeps its checkpoint and clears retired-provider backoff", () => {
  const f = fixture(async () => ({}));
  f.job.start();
  const saved = f.job.read();
  Object.assign(saved, {
    provider: "Jikan",
    status: "paused",
    page: 7,
    queue: [{ id: 99, title: "Saved title" }],
    failures: 6,
    lastError: "Jikan returned HTTP 522.",
    retryUntil: 9999999,
  });
  f.job.save(saved);
  const resumed = f.job.start();
  assert.equal(resumed.provider, "Tenrai");
  assert.equal(resumed.page, 7);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.failures, 0);
  assert.equal(resumed.lastError, null);
  assert.equal(f.job.read().queue[0].id, 99);
});

test("combined import saves bilingual MAL characters and schedules lightweight favorite scans every 15 days", async () => {
  const calls = [];
  const f = fixture(async (path) => {
    calls.push(path);
    if (path.startsWith("/anime?"))
      return {
        data: [
          { mal_id: 1, title: "Romaji title", title_english: "English title" },
        ],
        pagination: { has_next_page: false, items: { total: 1 } },
      };
    if (path === "/anime/1/characters")
      return {
        data: [
          {
            character: {
              mal_id: 1,
              name: "Character",
              images: {
                jpg: {
                  image_url:
                    "https://cdn.myanimelist.net/images/characters/1/1.jpg",
                },
              },
            },
            role: "Main",
            favorites: 10,
            voice_actors: [
              { person: { ...person, favorites: 20 }, language: "Japanese" },
            ],
          },
        ],
      };
    if (path.startsWith("/characters?"))
      return {
        data: [{ mal_id: 1, favorites: 30 }],
        pagination: { has_next_page: false },
      };
    if (path.startsWith("/people?"))
      return {
        data: [{ mal_id: 118, favorites: 40 }],
        pagination: { has_next_page: false },
      };
    assert.fail("unexpected path " + path);
  });
  f.e.tx(() => {
    f.e.catalogStore.tenrai.initialize();
    f.job.enableCharacters();
  });
  for (let i = 0; i < 4; i++) {
    f.advance(10000);
    await f.job.step();
  }
  assert.equal(f.job.status().importedCharacters, 1);
  assert.equal(f.job.status().importedActors, 1);
  assert.equal(
    f.e.catalogStore.card("mal-character-1").series_english,
    "English title",
  );
  assert.equal(f.e.catalogStore.card("mal-character-1").favorites, 30);
  assert.equal(f.e.catalogStore.card("mal-person-118").favorites, 40);
  const state = f.job.status();
  assert.equal(state.status, "completed");
  assert.equal(state.favorites.status, "idle");
  assert.equal(
    state.favorites.nextRefreshAt - state.favorites.lastCompletedAt,
    15 * 86400000,
  );
  assert.ok(f.job.nextAlarm());
  await f.job.step();
  assert.equal(calls.length, 4);
  f.job.pause();
  f.job.start();
  assert.equal(f.job.status().nextAt, state.favorites.nextRefreshAt);
  await f.job.step();
  assert.equal(calls.length, 4);
  f.e.tx(() =>
    f.e.host("reset-all", {
      deleteRegistry: true,
      confirmation: "DELETE EVERYTHING",
    }),
  );
  assert.equal(
    f.job.status().favorites.nextRefreshAt,
    state.favorites.nextRefreshAt,
  );
  f.advance(15 * 86400000);
  await f.job.step();
  assert.ok(calls.at(-1).startsWith("/characters?"));
  assert.equal(f.job.status().favorites.kind, "seiyuu");
  f.advance(10000);
  await f.job.step();
  assert.equal(f.job.status().favorites.status, "idle");
});

test("enabling character import fences an old in-flight seiyuu scan and resets discovery without deleting actors", async () => {
  let finish;
  const f = fixture(() => new Promise((resolve) => (finish = resolve)));
  f.job.start();
  f.advance(1000);
  const pending = f.job.step();
  f.e.tx(() => f.job.enableCharacters());
  finish({
    data: [{ mal_id: 999, title: "Stale title" }],
    pagination: { has_next_page: false },
  });
  await pending;
  assert.equal(f.job.read().queue.length, 0);
  assert.equal(f.job.status().includeCharacters, true);
  assert.equal(f.job.status().page, 1);
  assert.equal(f.job.status().scannedTitles, 0);
});
