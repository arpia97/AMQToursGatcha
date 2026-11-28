import { syncBundledCards } from '../src/community-cards.js';
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
  assert.equal(e.catalogStore.card(first.id).rarity, first.fixedRarity);
  const restart = new Engine(sql, tx);
  assert.equal(restart.catalogStore.card(first.id).rarity, first.fixedRarity);
  e.host("reset-all", {
    confirmation: "RESET ALL GAME DATA",
    deleteRegistry: false,
  });
  assert.equal(e.catalogStore.card(first.id).rarity, first.fixedRarity);
  assert.equal(e.catalogStore.card("mal-character-1").favorites, 1234);
});
test("community cards participate in search, rarity sorting, uniform draw pools, premium weighting and anime collection progress", (t) => {
  const { e, host } = fixture(t);
  host({ cards });
  const page = e.catalogStore.page("character", "GGius Tours", 1, 40, {
    sort: "rarity",
  });
  assert.equal(page.total, 24);
  assert.equal(page.cards.length, 24);
  const actors = e.catalogStore.page("seiyuu", "Chris Lefkó", 1, 40, {
    sort: "rarity",
    rarity: "AG",
  });
  assert.equal(actors.total, 1);
  assert.equal(actors.cards[0].id, "community-ggius-chrislefko");
  assert.equal(page.cards[0].rarity, "AG");
  assert.equal(
    e.catalogStore.page("character", "GGius Tours", 1, 40, {
      sort: "rarity",
      rarity: "SSS",
    }).cards.length,
    4,
  );
  const pool = e.catalogStore.pool("character").cards;
  assert.equal(pool.length, 26);
  assert.equal(
    pool.filter((c) => ["S", "SS", "SSS", "Ubers", "AG"].includes(c.rarity))
      .length,
    17,
  );
  const fakerCard = e.catalogStore.card("community-faker");
  assert.equal(fakerCard.name, "Faker");
  assert.equal(fakerCard.series, "League of Legends");
  assert.equal(fakerCard.kind, "character");
  assert.equal(fakerCard.rarity, "AG");
  assert.equal(fakerCard.raritySource, "community");
  const withDs = [
    ...pool,
    ...Array.from({ length: 100 }, (_, i) => ({ id: "d" + i, rarity: "D" })),
  ];
  assert.equal(premiumPool(withDs).high.length, 17);
  const found = new Set();
  for (let i = 0; i < 26; i++)
    found.add(
      e.catalogStore.draw("character", (n) => Math.min(n - 1, i * 100)).id,
    );
  assert.equal(found.size, 26);
  e.addCard("p", cards[0].id);
  const progress = e.economy.anime.page("p");
  assert.equal(progress.series[0].series_romaji, "GGius Tours");
  assert.equal(progress.series[0].owned, 1);
  assert.equal(progress.series[0].total, 24);
});
test("fixed rarity accepts only valid community IDs; malformed imports roll back and repeated import keys do not duplicate cards", (t) => {
  const { e, host } = fixture(t);
  const b = { cards };
  const run = () =>
    e.mutate("host:host/catalog", "ggius-once", b, () => e.host("catalog", b));
  run();
  run();
  assert.equal(e.catalogStore.summary().character, 26);
  assert.equal(e.catalogStore.summary().seiyuu, 1);
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

test('each bundled community portrait resolves to a shipped image on the public Gacha domain', () => {
  for (const card of cards) {
    const url = new URL(card.image);
    assert.equal(url.origin, 'https://amqtours.app', card.id);
    assert.match(url.pathname, /^\/gacha\/community-cards\/[a-z0-9-]+\.(?:webp|jpg|png)$/);
    const file = new URL('../public/' + url.pathname.slice('/gacha/'.length), import.meta.url);
    const bytes = fs.readFileSync(file);
    if (file.pathname.endsWith('.webp')) assert.equal(bytes.subarray(8,12).toString(), 'WEBP');
    else if (file.pathname.endsWith('.png')) assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    else assert.equal(bytes.subarray(0,3).toString('hex'), 'ffd8ff');
  }
});

test('repair and reimport keep bundled portraits available without replacing custom artwork', t => {
  const {e,host,sql}=fixture(t);
  const [first,second,third]=cards;
  const retired=first.image.replace('amqtours.app/gacha','play.amqtours-gatcha.workers.dev');
  const override='https://example.org/custom-art.png';
  host({cards});
  sql('UPDATE catalog SET image=? WHERE id=?',retired,first.id);
  sql("UPDATE catalog SET image='' WHERE id=?",second.id);
  sql('UPDATE catalog SET image=? WHERE id=?',override,third.id);
  assert.equal(e.catalogStore.card(first.id).image,retired);
  syncBundledCards(e);
  assert.equal(e.catalogStore.card(first.id).image,first.image);
  assert.equal(e.catalogStore.card(second.id).image,second.image);
  assert.equal(e.catalogStore.card(third.id).image,override);
  syncBundledCards(e);
  host({cards:[{...first,image:retired},{...second,image:undefined},{...third,image:''}]});
  assert.equal(e.catalogStore.card(first.id).image,first.image);
  assert.equal(e.catalogStore.card(second.id).image,second.image);
  assert.equal(e.catalogStore.card(third.id).image,override);
  assert.equal(sql('SELECT count(*) n FROM catalog')[0].n,cards.length);
});
