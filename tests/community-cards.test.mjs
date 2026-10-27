import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { premiumPool } from "../public/pack-odds.js";
import { popularityLabel } from "../public/card-display.js";
const cards = JSON.parse(
  fs.readFileSync(
    new URL("../public/community-cards.json", import.meta.url),
    "utf8",
  ),
);
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const sql = (s, ...a) => db.prepare(s).all(...a),
    tx = (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    };
  const e = new Engine(sql, tx);
  e.host("players", { players: [{ id: "p", name: "Player" }] });
  return { e, sql, tx, host: (b) => e.tx(() => e.host("catalog", b)) };
}
test("GGius Tours manifest has all21 exact names/rarities and original local image assets", () => {
  const expected = {
    ArronChu: "AG",
    "Austin the Kangaroo": "Ubers",
    bop: "AG",
    catdelusion: "SS",
    catdespair: "SSS",
    Catge: "B",
    Chommy: "C",
    cluegi: "S",
    como: "SSS",
    dogmelon: "SS",
    doncato: "AG",
    DONTENJOY: "A",
    ENJOY: "A",
    gregory: "B",
    pogsire: "S",
    raiva: "SSS",
    SHADOG: "B",
    skull_emoji: "AG",
    vosnatu: "A",
    worryriot: "A",
    CHOMMYNOODLES: "AG",
  };
  assert.equal(cards.length, 21);
  assert.equal(new Set(cards.map((c) => c.id)).size, 21);
  assert.deepEqual(
    Object.fromEntries(cards.map((c) => [c.name, c.fixedRarity])),
    expected,
  );
  for (const c of cards) {
    assert.equal(c.kind, "character");
    assert.equal(c.series, "GGius Tours");
    assert.equal(c.series_romaji, c.series);
    assert.equal(c.series_english, c.series);
    const url = new URL(c.image);
    assert.equal(url.origin, "https://play.amqtours-gatcha.workers.dev");
    assert.ok(
      fs.statSync(new URL("../public" + url.pathname, import.meta.url)).size >
        0,
    );
  }
});
test("community rarity survives metadata updates, favorite refresh, restart and gameplay reset without changing MAL percentile ranks", (t) => {
  const { e, sql, tx, host } = fixture(t);
  host({ cards });
  host({ cards: [{ id: "mal-character-1", kind: "character", name: "MAL" }] });
  e.catalogStore.popularity.sync("character", [["mal-character-1", 1234]]);
  const hist = e.catalogStore.popularity.histogram("character");
  e.catalogStore.popularity.sync(
    "character",
    cards.map((c) => [c.id, 99999999]),
  );
  assert.deepEqual(e.catalogStore.popularity.histogram("character"), hist);
  for (const c of cards) {
    const actual = e.catalogStore.card(c.id);
    assert.equal(actual.rarity, c.fixedRarity);
    assert.equal(actual.raritySource, "community");
    assert.match(popularityLabel(actual), /Community card/);
  }
  const first = cards[0];
  host({
    cards: [
      {
        id: first.id,
        kind: "character",
        name: first.name,
        series: "GGius Tours",
      },
    ],
  });
  assert.equal(e.catalogStore.card(first.id).rarity, "AG");
  const restart = new Engine(sql, tx);
  assert.equal(restart.catalogStore.card(first.id).rarity, "AG");
  e.host("reset-all", {
    confirmation: "RESET ALL GAME DATA",
    deleteRegistry: false,
  });
  assert.equal(e.catalogStore.card(first.id).rarity, "AG");
  assert.equal(e.catalogStore.card("mal-character-1").favorites, 1234);
});
test("community cards participate in search, rarity sorting, uniform draw pools, premium weighting and anime collection progress", (t) => {
  const { e, host } = fixture(t);
  host({ cards });
  const page = e.catalogStore.page("character", "GGius Tours", 1, 40, {
    sort: "rarity",
  });
  assert.equal(page.total, 21);
  assert.equal(page.cards.length, 21);
  assert.equal(page.cards[0].rarity, "AG");
  assert.equal(
    e.catalogStore.page("character", "GGius Tours", 1, 40, {
      sort: "rarity",
      rarity: "SSS",
    }).cards.length,
    3,
  );
  const pool = e.catalogStore.pool("character").cards;
  assert.equal(pool.length, 21);
  assert.equal(
    pool.filter((c) => ["S", "SS", "SSS", "Ubers", "AG"].includes(c.rarity))
      .length,
    13,
  );
  const withDs = [
    ...pool,
    ...Array.from({ length: 100 }, (_, i) => ({ id: "d" + i, rarity: "D" })),
  ];
  assert.equal(premiumPool(withDs).high.length, 13);
  const found = new Set();
  for (let i = 0; i < 21; i++)
    found.add(
      e.catalogStore.draw("character", (n) => Math.min(n - 1, i * 100)).id,
    );
  assert.equal(found.size, 21);
  e.addCard("p", cards[0].id);
  const progress = e.economy.anime.page("p");
  assert.equal(progress.series[0].series_romaji, "GGius Tours");
  assert.equal(progress.series[0].owned, 1);
  assert.equal(progress.series[0].total, 21);
});
test("fixed rarity accepts only valid community IDs; malformed imports roll back and repeated import keys do not duplicate cards", (t) => {
  const { e, host } = fixture(t);
  const b = { cards };
  const run = () =>
    e.mutate("host:host/catalog", "ggius-once", b, () => e.host("catalog", b));
  run();
  run();
  assert.equal(e.catalogStore.summary().character, 21);
  for (const c of [
    { ...cards[0], id: "mal-character-1" },
    { ...cards[0], fixedRarity: "Legendary" },
    { ...cards[0], id: "other-id" },
  ])
    assert.throws(
      () => host({ cards: [{ ...cards[0], id: "community-temporary" }, c] }),
      /Fixed rarity/,
    );
  assert.equal(e.catalogStore.card("community-temporary"), null);
  host({ cards: [{ ...cards[0], fixedRarity: "S" }] });
  assert.equal(e.catalogStore.card(cards[0].id).rarity, "S");
  host({ cards: [{ ...cards[0], fixedRarity: null }] });
  assert.equal(e.catalogStore.card(cards[0].id).rarity, null);
});
