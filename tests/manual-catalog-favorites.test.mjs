import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const tx = (fn) => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    tx,
    () => 1234567,
  );
  const body = {
    cards: [
      {
        id: "mal-person-49032",
        kind: "seiyuu",
        name: "Natsuyoshi, Yuuko",
        series: "Voice actor",
        image: "https://cdn.myanimelist.net/images/voiceactors/2/78287.jpg",
        source: "https://myanimelist.net/people/49032",
        favorites: 322,
      },
    ],
  };
  const put = (b = body, key = crypto.randomUUID()) =>
    e.mutate("host:host/catalog", key, b, () => e.host("catalog", b));
  return { e, body, put };
}
test("one-off MAL imports retain favorites, get normal rarity, replay once and preserve scanner checkpoints", (t) => {
  const f = fixture(t),
    checkpoint = JSON.stringify({
      status: "running",
      page: 123,
      nextAt: 123456789,
      lease: 0,
    });
  f.e.run(
    "INSERT OR REPLACE INTO catalog_meta VALUES('jikan-import',?)",
    checkpoint,
  );
  const result = f.put(f.body, "once");
  assert.deepEqual(f.put(f.body, "once"), result);
  const card = f.e.catalogStore.card("mal-person-49032");
  assert.equal(card.favorites, 322);
  assert.ok(card.rarity);
  assert.notEqual(card.raritySource, "community");
  assert.equal(f.e.catalogStore.summary().seiyuu, 1);
  assert.equal(
    f.e.one("SELECT value FROM catalog_meta WHERE key='jikan-import'").value,
    checkpoint,
  );
  f.put({
    cards: [{ ...f.body.cards[0], favorites: undefined, name: "Updated Name" }],
  });
  assert.equal(f.e.catalogStore.card(card.id).favorites, 322);
  const restart = new Engine(f.e.db, f.e.transaction, f.e.now);
  assert.equal(restart.catalogStore.card(card.id).favorites, 322);
});
test("invalid favorite counts reject the entire manual import atomically", (t) => {
  const f = fixture(t);
  for (const favorites of [-1, "322", 1.5, Infinity]) {
    assert.throws(
      () => f.put({ cards: [{ ...f.body.cards[0], favorites }] }),
      /favorites/,
    );
    assert.equal(f.e.catalogStore.rawCard("mal-person-49032"), null);
    assert.deepEqual(f.e.catalogStore.popularity.histogram("seiyuu"), {});
  }
});
