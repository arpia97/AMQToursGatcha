import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { characterCards, animeTitles } from "../src/jikan.js";
import { seriesTitle, rarityClass } from "../public/card-display.js";

function fixture() {
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
    (max) => 0,
  );
  return { e, db, advance: (n) => (time += n) };
}
const card = (id, role = "supporting") => ({
  id: "mal-character-" + id,
  kind: "character",
  name: "Name " + id,
  series: "Shingeki no Kyojin",
  series_romaji: "Shingeki no Kyojin",
  series_english: "Attack on Titan",
  role,
  image: "https://cdn.myanimelist.net/images/characters/1/" + id + ".jpg",
  source: "https://myanimelist.net/character/" + id,
});
test("cast import uses MAL portraits, accepts only documented roles, and records both anime titles", () => {
  const cast = [
    {
      character: {
        mal_id: 1,
        name: "Character",
        images: { jpg: { image_url: card(1).image } },
      },
      role: "Supporting",
    },
    {
      character: {
        mal_id: 2,
        name: "Unknown",
        images: { jpg: { image_url: card(2).image } },
      },
      role: "Unknown",
    },
  ];
  const cards = characterCards(cast, {
    title: "Shingeki no Kyojin",
    title_english: "Attack on Titan",
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].role, "supporting");
  assert.equal(cards[0].series_english, "Attack on Titan");
  assert.equal(seriesTitle(cards[0], "romaji"), "Shingeki no Kyojin");
  assert.equal(seriesTitle(cards[0], "english"), "Attack on Titan");
  assert.equal(
    seriesTitle({ ...cards[0], series_english: "" }, "english"),
    "Shingeki no Kyojin",
  );
  assert.equal(
    animeTitles({
      title: "Name",
      titles: [{ type: "English", title: "English name" }],
    }).series_english,
    "English name",
  );
  assert.equal(rarityClass("AG"), "ag");
});
test("incremental buckets deduplicate characters, promote Main appearances, and search both title languages", () => {
  const { e } = fixture(),
    c = e.catalogStore;
  assert.equal(c.tenrai.upsert([card(1), card(501)]), 2);
  assert.equal(c.tenrai.upsert([card(1, "main")]), 0);
  assert.equal(c.rawCard("mal-character-1").role, "main");
  c.tenrai.upsert([card(1)]);
  assert.equal(c.rawCard("mal-character-1").role, "main");
  assert.equal(c.summary().character, 2);
  assert.throws(
    () => e.host("catalog", { cards: [{ ...card(1), kind: "seiyuu" }] }),
    /type/,
  );
  assert.equal(c.page("character", "Attack on Titan").cards.length, 2);
  assert.equal(c.page("character", "Shingeki").cards.length, 2);
  e.host("catalog", { cards: [{ ...card(1), role: "supporting" }] });
  assert.equal(c.summary().character, 2);
  assert.equal(c.rawCard("mal-character-1").role, "supporting");
  assert.equal(
    c.page("character").cards.filter((c) => c.id === "mal-character-1").length,
    1,
  );
});
test("weighted Tenrai draws preserve role odds and exclude auction duplicates across buckets", () => {
  const { e } = fixture(),
    c = e.catalogStore;
  c.tenrai.upsert([card(1, "main"), card(500), card(1000)]);
  const counts = {};
  for (let i = 0; i < 280; i++) {
    const c1 = c.draw("character", () => i, 80);
    counts[c1.id] = (counts[c1.id] || 0) + 1;
  }
  assert.deepEqual(counts, {
    "mal-character-1": 80,
    "mal-character-500": 100,
    "mal-character-1000": 100,
  });
  const result = c.draw("character", () => 0, 80, new Set(["mal-character-1"]));
  assert.notEqual(result.id, "mal-character-1");
});
test("favorite tiers use cumulative percentiles, average tied ranks, and separate populations", () => {
  const { e } = fixture(),
    c = e.catalogStore;
  c.tenrai.upsert(Array.from({ length: 1000 }, (_, i) => card(i + 1)));
  c.popularity.sync(
    "character",
    Array.from({ length: 1000 }, (_, i) => [
      "mal-character-" + (i + 1),
      1000 - i,
    ]),
  );
  const expected = [
    [1, "AG"],
    [2, "Ubers"],
    [6, "SSS"],
    [11, "SS"],
    [26, "S"],
    [51, "A"],
    [101, "B"],
    [201, "C"],
    [401, "D"],
  ];
  for (const [id, tier] of expected)
    assert.equal(c.card("mal-character-" + id).rarity, tier);
  const commonPage = c.page("character", "Attack on Titan", 1, 40, {
    rarity: "D",
    role: "supporting",
  });
  assert.equal(commonPage.cards.length, 40);
  assert.equal(commonPage.hasMore, true);
  assert.ok(commonPage.cards.every((entry) => entry.rarity === "D"));
  e.host("catalog", { cards: [{ ...card(501), role: "main" }] });
  const overridden = c.page("character", "Attack on Titan", 1, 40, {
    rarity: "D",
    role: "main",
  });
  assert.deepEqual(
    overridden.cards.map((entry) => entry.id),
    ["mal-character-501"],
  );
  c.popularity.sync("character", [["mal-character-2", 1000]]);
  assert.equal(c.card("mal-character-2").rarity, "AG");
  assert.equal(c.card("mal-character-1").rankedPopulation, 1000);
  e.host("catalog", {
    cards: [{ ...card(1), id: "mal-person-1", kind: "seiyuu" }],
  });
  c.popularity.sync("seiyuu", [["mal-person-1", 1]]);
  assert.equal(c.card("mal-person-1").rarity, "AG");
  assert.equal(c.card("mal-person-1").rankedPopulation, 1);
  c.tenrai.upsert([card(1001)]);
  assert.equal(c.card("mal-character-1001").rarity, null);
  c.popularity.sync("character", [
    ["mal-character-1001", 0],
    ["mal-character-999999", 999999],
  ]);
  assert.equal(c.card("mal-character-1001").rarity, "D");
  assert.equal(c.card("mal-character-1001").rankedPopulation, 1001);
});
test("large zero-favorite ties share a bottom tier rather than a top-tier badge", () => {
  const { e } = fixture();
  e.catalogStore.tenrai.upsert([card(1), card(2), card(3), card(4)]);
  e.catalogStore.popularity.sync(
    "character",
    [
      [1, 100],
      [2, 0],
      [3, 0],
      [4, 0],
    ].map(([id, n]) => ["mal-character-" + id, n]),
  );
  assert.equal(e.catalogStore.card("mal-character-1").rarity, "AG");
  for (const id of [2, 3, 4])
    assert.equal(e.catalogStore.card("mal-character-" + id).rarity, "D");
});
test("ACDB retirement refunds unclaimed auction escrow once and preserves unrelated data and receipts", () => {
  const { e } = fixture();
  e.host("players", { players: [{ id: "p", name: "Player" }] });
  e.host("catalog", {
    cards: [
      { ...card(1), id: "acdb-character-1" },
      { ...card(2), id: "mal-person-2", kind: "seiyuu" },
    ],
  });
  e.run(
    "INSERT INTO inventory(player,card,copies,level) VALUES('p','acdb-character-1',1,2)",
  );
  e.run(
    "INSERT INTO inventory(player,card,copies,level) VALUES('p','mal-person-2',1,1)",
  );
  e.run("UPDATE players SET avatar_card='acdb-character-1' WHERE id='p'");
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends,bid,winner) VALUES('acdb-character-1','character',0,200000,200,'p')",
  );
  e.mutate("p:pack", "old-request", {}, () => ({
    cards: [{ id: "acdb-character-1" }],
  }));
  assert.throws(
    () => e.tx(() => e.catalogStore.retireAcdb("wrong")),
    /confirm/,
  );
  const result = e.tx(() =>
    e.catalogStore.retireAcdb("REPLACE ACDB WITH TENRAI"),
  );
  assert.equal(result.refunded, 200);
  assert.equal(e.player("p").balance, 200);
  assert.equal(e.player("p").earned, 0);
  assert.equal(e.player("p").avatar_card, null);
  assert.equal(e.state("p").inventory.length, 1);
  assert.equal(e.catalogStore.card("acdb-character-1"), null);
  assert.equal(
    e.mutate("p:pack", "old-request", {}, () =>
      assert.fail("must not replay a purchase"),
    ).cards.length,
    0,
  );
  e.tx(() => e.catalogStore.retireAcdb("REPLACE ACDB WITH TENRAI"));
  assert.equal(e.player("p").balance, 200);
});
test("all host reset scopes preserve character and seiyuu catalogues, rarity, and scan checkpoints", () => {
  const { e } = fixture();
  e.catalogStore.tenrai.upsert([card(1)]);
  e.host("catalog", {
    cards: [{ ...card(2), id: "mal-person-2", kind: "seiyuu" }],
  });
  e.catalogStore.popularity.sync("character", [["mal-character-1", 100]]);
  e.run(
    'INSERT INTO catalog_meta VALUES(\'jikan-import\',\'{"status":"running","page":7}\')',
  );
  for (const body of [
    { deleteRegistry: false, confirmation: "RESET ALL GAME DATA" },
    { deleteRegistry: true, confirmation: "DELETE EVERYTHING" },
  ]) {
    e.tx(() => e.host("reset-all", body));
    assert.equal(e.catalogStore.summary().character, 1);
    assert.equal(e.catalogStore.summary().seiyuu, 1);
    assert.equal(e.catalogStore.card("mal-character-1").favorites, 100);
    assert.equal(
      JSON.parse(
        e.one("SELECT value FROM catalog_meta WHERE key='jikan-import'").value,
      ).page,
      7,
    );
  }
});
