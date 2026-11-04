import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  cardInvestment,
  convertLegacyLevel,
  enhancementCost,
  levelLabel,
} from "../public/card-values.js";
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
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    fresh = () =>
      new Engine(
        sql,
        tx,
        () => 1000000,
        () => 0,
      ),
    e = fresh();
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.host("catalog", {
    cards: Array.from({ length: 23 }, (_, i) => ({
      id: "c" + i,
      name: "Card " + i,
      kind: "character",
      rarity: "D",
    })),
  });
  return {
    e,
    fresh,
    act: (engine, p, a, b) =>
      engine.mutate(p + ":" + a, crypto.randomUUID(), b, () =>
        engine.action(p, a, b),
      ),
  };
}
test("legacy levels1–20 convert once without losing invested or spare copies; protected/avatar references remain", (t) => {
  const { e, fresh } = fixture(t);
  for (let level = 1; level <= 20; level++)
    e.run(
      "INSERT INTO inventory(player,card,copies,level,protected) VALUES(?,?,?,?,1)",
      "p",
      "c" + level,
      3,
      level,
    );
  e.run("UPDATE players SET avatar_card='c20' WHERE id='p'");
  e.run("DELETE FROM enhancement_migrations");
  const converted = fresh();
  for (let old = 1; old <= 20; old++) {
    const row = converted.one(
      "SELECT * FROM inventory WHERE player=? AND card=?",
      "p",
      "c" + old,
    );
    assert.ok(row.level <= 6);
    assert.equal(
      cardInvestment(row.level) + row.copies - 1,
      2 ** (old - 1) + 2,
    );
    assert.equal(row.protected, 1);
  }
  assert.equal(converted.player("p").avatar_card, "c20");
  const snapshot = JSON.stringify(
    converted.all("SELECT * FROM inventory ORDER BY card"),
  );
  fresh();
  assert.equal(
    JSON.stringify(converted.all("SELECT * FROM inventory ORDER BY card")),
    snapshot,
  );
  assert.equal(converted.all("SELECT * FROM enhancement_migrations").length, 1);
  assert.equal(
    converted.all("SELECT * FROM enhancement_migration_rows").length,
    19,
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(cardInvestment),
    [1, 3, 6, 10, 15, 21],
  );
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(enhancementCost), [
    2,
    3,
    4,
    5,
    6,
    null,
  ]);
  assert.equal(levelLabel(6), "MAX");
  assert.throws(() => cardInvestment(7), /Invalid/);
});
test("active marketplace and auction held copies keep all old investment when bought, claimed or cancelled", (t) => {
  let { e, fresh, act } = fixture(t);
  e.run("UPDATE players SET balance=100000 WHERE id='q'");
  e.run(
    "INSERT INTO market_listings(seller,card,kind,level,price,created) VALUES('p','c1','character',4,100,1)",
  );
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends,seller,level,reserve,winner,bid,paid,closed) VALUES('c2','character',1,0,'p',6,100,'q',100,1,1)",
  );
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends,seller,level,reserve) VALUES('c3','character',1,9999999,'p',5,100)",
  );
  e.run("DELETE FROM enhancement_migrations");
  e = fresh();
  let market = e.one("SELECT * FROM market_listings");
  assert.deepEqual([market.level, market.extra_copies], [3, 2]);
  act(e, "q", "buy-listing", { listing: market.id });
  let row = e.one("SELECT * FROM inventory WHERE player='q' AND card='c1'");
  assert.equal(cardInvestment(row.level) + row.copies - 1, 8);
  const won = e.one("SELECT * FROM auctions WHERE card='c2'");
  act(e, "q", "claim", { auction: won.id });
  row = e.one("SELECT * FROM inventory WHERE player='q' AND card='c2'");
  assert.equal(cardInvestment(row.level) + row.copies - 1, 32);
  const cancelled = e.one("SELECT * FROM auctions WHERE card='c3'");
  act(e, "p", "cancel-listing", { venue: "auction", listing: cancelled.id });
  row = e.one("SELECT * FROM inventory WHERE player='p' AND card='c3'");
  assert.equal(cardInvestment(row.level) + row.copies - 1, 16);
});
test("trade listings and multi-card offers retain converted surplus through acceptance and enhanced merges conserve value", (t) => {
  let { e, fresh, act } = fixture(t);
  e.run(
    "INSERT INTO trade_listings(seller,card,level,created_at,updated_at) VALUES('p','c1',5,1,1)",
  );
  e.run(
    "INSERT INTO trade_offers(listing,proposer,card,level,created_at,updated_at) VALUES(1,'q','c2',4,1,1)",
  );
  e.run(
    "INSERT INTO trade_offer_cards(offer,position,card,level) VALUES(1,0,'c2',4),(1,1,'c3',7)",
  );
  e.run("DELETE FROM enhancement_migrations");
  e = fresh();
  act(e, "p", "trade-accept", { offer: 1 });
  for (const [p, card, total] of [
    ["q", "c1", 16],
    ["p", "c2", 8],
    ["p", "c3", 64],
  ]) {
    const row = e.one(
      "SELECT * FROM inventory WHERE player=? AND card=?",
      p,
      card,
    );
    assert.equal(cardInvestment(row.level) + row.copies - 1, total);
  }
  e.economy.acquire("p", "c4", 4);
  e.economy.acquire("p", "c4", 3);
  const merged = e.one(
    "SELECT * FROM inventory WHERE player='p' AND card='c4'",
  );
  assert.equal(merged.level, 4);
  assert.equal(cardInvestment(merged.level) + merged.copies - 1, 16);
});
