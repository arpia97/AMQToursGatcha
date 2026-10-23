import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";

function fixture(n = 501) {
  const db = new DatabaseSync(":memory:");
  let cursor = 0;
  const e = new Engine(
    (s, ...args) => db.prepare(s).all(...args),
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
    () => Date.UTC(2026, 9, 24),
    (max) => (cursor++ * 71) % max,
  );
  const version = "0123456789abcdef";
  const cards = Array.from({ length: n }, (_, i) => ({
    id: "acdb-character-" + (i + 1),
    kind: "character",
    name: "Name " + String(i + 1).padStart(4, "0"),
    series: "Anime series",
    role: i % 3 === 0 ? "main" : i % 3 === 1 ? "supporting" : "unknown",
    image: "https://www.animecharactersdatabase.com/images/" + i + ".jpg",
    source:
      "https://www.animecharactersdatabase.com/characters.php?id=" + (i + 1),
  }));
  const chunks = [];
  const save = (section, bucket, payload) =>
    chunks.push({ version, section, bucket, payload });
  const byBucket = new Map();
  for (const c of cards) {
    const key = Math.floor(Number(c.id.split("-").at(-1)) / 500);
    if (!byBucket.has(key)) byBucket.set(key, {});
    byBucket.get(key)[c.id] = c;
  }
  for (const [key, data] of byBucket) save("cards", key, data);
  const groups = {};
  for (const section of ["main", "other"]) {
    const ids = cards
      .filter((c) => (c.role === "main") === (section === "main"))
      .map((c) => c.id);
    groups[section] = ids.length;
    for (let start = 0; start < ids.length; start += 500)
      save(section, start / 500, ids.slice(start, start + 500));
  }
  for (let start = 0; start < cards.length; start += 500)
    save("browse", start / 500, cards.slice(start, start + 500));
  const manifest = { provider: "ACDB", version, count: n, groups };
  const seed = () => {
    chunks.forEach((c) => e.catalogStore.importChunk(c));
    e.tx(() => e.catalogStore.activate({ manifest }));
  };
  return { e, db, cards, chunks, manifest, seed };
}
test("bulk catalogs activate completely, paginate across buckets and keep public state bounded", () => {
  const f = fixture();
  f.seed();
  const c = f.e.catalogStore;
  assert.equal(c.summary().character, 501);
  assert.equal(c.card("acdb-character-500").name, "Name 0500");
  assert.equal(c.page("character", "", 13).cards.length, 21);
  assert.equal(c.page("character", "", 13).hasMore, false);
  assert.equal(c.page("character", "0500").cards[0].id, "acdb-character-500");
  assert.equal(c.page("seiyuu").cards.length, 0);
  f.e.ensureAuctions();
  const state = f.e.state();
  assert.equal(state.auctions.length, 5);
  assert.ok(state.catalog.length < 20);
  assert.equal(new Set(state.auctions.map((a) => a.card)).size, 5);
  assert.throws(() => c.importChunk(f.chunks[0]), /already active/);
});
test("incomplete or duplicate indexes cannot activate a snapshot", () => {
  const f = fixture(6),
    c = f.e.catalogStore;
  f.chunks.slice(0, -1).forEach((chunk) => c.importChunk(chunk));
  assert.throws(
    () => f.e.tx(() => c.activate({ manifest: f.manifest })),
    /incomplete/,
  );
  assert.equal(c.manifest(), null);
  c.importChunk(f.chunks.at(-1));
  const pool = f.chunks.find((chunk) => chunk.section === "other");
  c.importChunk({ ...pool, payload: pool.payload.map(() => pool.payload[0]) });
  assert.throws(
    () => f.e.tx(() => c.activate({ manifest: f.manifest })),
    /duplicate/,
  );
  assert.equal(c.manifest(), null);
});
test("host role overrides replace bulk identities and preserve exact weighted draw counts", () => {
  const f = fixture(6);
  f.seed();
  const c = f.e.catalogStore;
  f.e.host("catalog", { cards: [{ ...f.cards[0], role: "supporting" }] });
  assert.equal(c.summary().character, 6);
  assert.equal(c.card(f.cards[0].id).role, "supporting");
  assert.equal(
    c.page("character").cards.filter((card) => card.id === f.cards[0].id)
      .length,
    1,
  );
  const counts = new Map();
  // Exhaust both the weighted roll and each remaining bulk index. No stochastic assertions.
  const total = 80 + 5 * 100;
  for (let i = 0; i < total; i++)
    for (let j = 0; j < 4; j++) {
      let cursor = j;
      const card = c.draw(
        "character",
        (max) => (max === total ? i : cursor++ % max),
        80,
      );
      counts.set(card.id, (counts.get(card.id) || 0) + 1);
    }
  assert.equal(counts.size, 6);
  assert.equal(counts.get(f.cards[3].id), 320);
  for (const [id, count] of counts)
    if (id !== f.cards[3].id) assert.equal(count, 400);
  f.e.host("players", { players: [{ id: "p1", name: "Player" }] });
  f.e.host("grant", {
    player: "p1",
    amount: 1000,
    reason: "other",
    note: "test",
  });
  const result = f.e.tx(() => f.e.action("p1", "pack", { kind: "character" }));
  assert.equal(result.cards.length, 5);
  assert.equal(f.e.player("p1").balance, 500);
});
