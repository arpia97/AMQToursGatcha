import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { SqlBudget } from "../src/sql-budget.js";
import { AliasSync } from "../src/aliases.js";
const card = (id, role = "supporting") => ({
  id: "mal-character-" + id,
  kind: "character",
  name: "Card " + id,
  role,
  series: "Anime",
  series_romaji: "Anime",
  series_english: "Anime EN",
  image: "",
  source: "",
});
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const queries = [];
  let now = 100000,
    e;
  e = new Engine(
    (sql, ...args) => {
      queries.push({ sql, args, source: e?.usageSource });
      return db.prepare(sql).all(...args);
    },
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
    () => now,
    (max) => Math.floor(Math.random() * max),
  );
  return { e, db, queries, advance: (ms) => (now += ms) };
}
const writes = (queries) =>
  queries.filter((q) => /^INSERT|^UPDATE|^DELETE/i.test(q.sql));
test("batch card lookup shares packed rows and favorites, preserves order/overrides and refreshes after writes or rollback", (t) => {
  const { e, queries, advance } = fixture(t),
    c = e.catalogStore;
  c.tenrai.upsert(Array.from({ length: 120 }, (_, i) => card(i + 1)));
  c.popularity.sync("character", [
    ["mal-character-1", 50],
    ["mal-character-2", 10],
  ]);
  c.invalidate();
  queries.length = 0;
  const batch = c.cards([
    "mal-character-2",
    "mal-character-1",
    "missing",
    "mal-character-2",
  ]);
  assert.deepEqual(
    batch.map((c) => c.id),
    ["mal-character-2", "mal-character-1", "mal-character-2"],
  );
  assert.equal(batch[0].favorites, 10);
  assert.equal(
    queries.filter((q) => q.sql.includes("FROM tenrai_characters")).length,
    1,
  );
  assert.equal(
    queries.filter((q) => q.sql.includes("FROM catalog_popularity")).length,
    1,
  );
  queries.length = 0;
  c.cards(["mal-character-1", "mal-character-2"]);
  assert.equal(queries.length, 0);
  batch[0].name = "Mutated caller copy";
  assert.equal(c.card("mal-character-2").name, "Card 2");
  e.run("INSERT OR REPLACE INTO catalog_meta VALUES('jikan-import',?)", "{}");
  queries.length = 0;
  c.card("mal-character-1");
  assert.equal(queries.length, 0);
  e.host("catalog", { cards: [{ ...card(1), name: "Host override" }] });
  assert.equal(c.card("mal-character-1").name, "Host override");
  assert.throws(
    () =>
      e.tx(() => {
        e.run(
          "UPDATE catalog SET name='Uncommitted' WHERE id='mal-character-1'",
        );
        assert.equal(c.card("mal-character-1").name, "Uncommitted");
        throw Error("abort");
      }),
    /abort/,
  );
  assert.equal(c.card("mal-character-1").name, "Host override");
  c.popularity.sync("character", [["mal-character-1", 5]]);
  assert.equal(c.card("mal-character-1").favorites, 5);
  queries.length = 0;
  advance(300001);
  c.card("mal-character-1");
  assert.ok(queries.length > 0);
});
test("unchanged casts and aliases write nothing; main promotion still updates metadata and anime progress", (t) => {
  const { e, queries, advance } = fixture(t),
    c = e.catalogStore;
  c.tenrai.upsert([card(1), card(501)]);
  advance(10000);
  queries.length = 0;
  assert.equal(c.tenrai.upsert([card(1), card(501)]), 0);
  assert.equal(writes(queries).length, 0);
  c.tenrai.upsert([{ ...card(1, "main"), series_romaji: "Primary anime" }]);
  assert.equal(c.rawCard("mal-character-1").role, "main");
  assert.equal(
    e.one("SELECT romaji FROM character_series WHERE card='mal-character-1'")
      .romaji,
    "Primary anime",
  );
  const sync = new AliasSync(e),
    rows = [{ id: "p", name: "Player", aliases: ["Player", "Alias"] }];
  e.tx(() => sync.import(rows));
  queries.length = 0;
  e.tx(() => sync.import(rows));
  assert.equal(writes(queries).length, 0);
});
test("favorites writes only changed buckets; checked-date refresh does not rewrite histogram", (t) => {
  const { e, queries, advance } = fixture(t),
    c = e.catalogStore;
  c.tenrai.upsert([card(1), card(501)]);
  c.popularity.sync("character", [
    ["mal-character-1", 2],
    ["mal-character-501", 3],
  ]);
  queries.length = 0;
  c.popularity.sync("character", [
    ["mal-character-1", 4],
    ["mal-character-501", 3],
  ]);
  assert.equal(
    writes(queries).filter((q) => q.sql.includes("catalog_popularity")).length,
    1,
  );
  assert.equal(
    writes(queries).filter((q) => q.sql.includes("catalog_meta")).length,
    1,
  );
  advance(86400001);
  queries.length = 0;
  c.popularity.sync("character", [
    ["mal-character-1", 4],
    ["mal-character-501", 3],
  ]);
  assert.equal(
    writes(queries).filter((q) => q.sql.includes("catalog_popularity")).length,
    2,
  );
  assert.equal(
    writes(queries).filter((q) => q.sql.includes("catalog_meta")).length,
    0,
  );
  assert.deepEqual(c.popularity.histogram("character"), { 3: 1, 4: 1 });
});
test("shop replenishes distinct stock without reading the entire catalogue pool, even when only ten cards exist", (t) => {
  const { e } = fixture(t),
    c = e.catalogStore;
  c.tenrai.upsert(Array.from({ length: 10 }, (_, i) => card(i + 1)));
  c.pool = () => {
    throw Error("Whole catalogue read");
  };
  e.economy.seedShop(0, 10000000);
  const sold = e.one("SELECT * FROM weekly_shop LIMIT 1");
  e.run("UPDATE weekly_shop SET buyer='p' WHERE id=?", sold.id);
  e.economy.refillShop(0, 10000000, sold.card);
  const stock = e.all("SELECT card FROM weekly_shop WHERE buyer IS NULL");
  assert.equal(stock.length, 10);
  assert.equal(new Set(stock.map((c) => c.card)).size, 10);
});
test("source accounting keeps earlier totals unattributed, persists breakdown and resets at midnight; sync scopes restore on failure", (t) => {
  const { e, queries } = fixture(t);
  let now = 100000,
    saved;
  const b = new SqlBudget(
    () => ({ day: "1970-01-01", rowsRead: 100, rowsWritten: 20 }),
    (v) => (saved = structuredClone(v)),
    () => now,
  );
  b.observe(10, 2, "catalogImport");
  b.observe(4, 1);
  b.flush(true);
  assert.deepEqual(saved.sources.unattributed, {
    rowsRead: 100,
    rowsWritten: 20,
  });
  assert.deepEqual(saved.sources.catalogImport, {
    rowsRead: 10,
    rowsWritten: 2,
  });
  assert.equal(saved.rowsRead, 114);
  const snapshot = b.status();
  b.observe(3, 0);
  assert.equal(snapshot.rowsRead, 114);
  assert.equal(snapshot.sources.requests.rowsRead, 4);
  const restored = new SqlBudget(
    () => saved,
    () => {},
    () => now,
  );
  assert.equal(restored.status().sources.requests.rowsRead, 4);
  now = 86400001;
  b.observe(1, 0, "indexing");
  assert.equal(b.status().rowsRead, 1);
  assert.equal(b.status().sources.unattributed, undefined);
  queries.length = 0;
  assert.throws(
    () =>
      e.track("catalogImport", () => {
        e.one("SELECT 1");
        e.track("indexing", () => e.one("SELECT 2"));
        e.one("SELECT 3");
        throw Error("scope");
      }),
    /scope/,
  );
  e.one("SELECT 4");
  assert.deepEqual(
    queries.map((q) => q.source),
    ["catalogImport", "indexing", "catalogImport", undefined],
  );
});
