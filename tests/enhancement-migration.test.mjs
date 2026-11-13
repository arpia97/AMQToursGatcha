import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  cardInvestment,
  enhancementCost,
  levelLabel,
  REVISION_2_INVESTMENTS,
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
  assert.equal(converted.all("SELECT * FROM enhancement_migrations").length, 2);
  assert.equal(
    converted.all("SELECT * FROM enhancement_migration_rows").length,
    19,
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(cardInvestment),
    [1, 2, 4, 7, 11, 16],
  );
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(enhancementCost), [
    1,
    2,
    3,
    4,
    5,
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
  assert.deepEqual([market.level, market.extra_copies], [3, 4]);
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
  assert.equal(cardInvestment(merged.level) + merged.copies - 1, 11);
});

test("revision3 refunds only invested-copy differences once and preserves previous audits, spare copies, protection, avatars, wallets and Alchemy XP", (t) => {
  const { e, fresh, act } = fixture(t);
  e.run("DELETE FROM enhancement_migrations WHERE revision=3");
  e.run(
    "INSERT INTO enhancement_migration_rows VALUES('inventory','historical','{}','{}')",
  );
  const previous = e.one(
      "SELECT * FROM enhancement_migrations WHERE revision=2",
    ),
    oldAudit = e.all("SELECT * FROM enhancement_migration_rows");
  for (let level = 1; level <= 6; level++)
    e.run(
      "INSERT INTO inventory(player,card,copies,level,protected) VALUES('p',?,4,?,1)",
      "c" + level,
      level,
    );
  e.run("INSERT INTO inventory(player,card,copies,level) VALUES('q','c2',1,2)");
  e.run(
    "UPDATE players SET balance=5432,earned=6000,avatar_card='c6' WHERE id='p'",
  );
  e.economy.alchemy.save("p", { xp: 75, refinements: 5, version: 9 });
  const migrated = fresh();
  for (let level = 1; level <= 6; level++) {
    const row = migrated.one(
      "SELECT * FROM inventory WHERE player='p' AND card=?",
      "c" + level,
    );
    assert.equal(row.level, level);
    assert.equal(row.copies, 4 + level - 1);
    assert.equal(
      cardInvestment(row.level) + row.copies - 1,
      REVISION_2_INVESTMENTS[level] + 3,
    );
    assert.equal(row.protected, 1);
  }
  assert.deepEqual(
    { ...migrated.economy.alchemy.read("p") },
    {
      xp: 75,
      refinements: 5,
      version: 10,
    },
  );
  assert.deepEqual(
    { ...migrated.economy.alchemy.read("q") },
    {
      xp: 0,
      refinements: 0,
      version: 1,
    },
  );
  assert.deepEqual(
    {
      ...migrated.one(
        "SELECT balance,earned,avatar_card FROM players WHERE id='p'",
      ),
    },
    { balance: 5432, earned: 6000, avatar_card: "c6" },
  );
  assert.deepEqual(
    migrated.one("SELECT * FROM enhancement_migrations WHERE revision=2"),
    previous,
  );
  assert.deepEqual(
    migrated.all("SELECT * FROM enhancement_migration_rows"),
    oldAudit,
  );
  const summary = JSON.parse(
    migrated.one("SELECT summary FROM enhancement_migrations WHERE revision=3")
      .summary,
  );
  assert.equal(summary.returnedSpareCopies, 16);
  assert.equal(summary.inventory, 6);
  const rows = JSON.stringify(
    migrated.all("SELECT * FROM inventory ORDER BY player,card"),
  );
  const receipt = JSON.stringify(
    migrated.one("SELECT * FROM enhancement_migrations WHERE revision=3"),
  );
  fresh();
  assert.equal(
    JSON.stringify(
      migrated.all("SELECT * FROM inventory ORDER BY player,card"),
    ),
    rows,
  );
  assert.equal(
    JSON.stringify(
      migrated.one("SELECT * FROM enhancement_migrations WHERE revision=3"),
    ),
    receipt,
  );
  const stale = {
    card: "c2",
    variant: "card",
    expectedLevel: 2,
    expectedRarity: "D",
    expectedVersion: 1,
    confirmed: true,
    enhancementRevision: 2,
  };
  assert.throws(() => act(migrated, "q", "alchemy-feed", stale), {
    status: 409,
  });
  assert.throws(
    () =>
      act(migrated, "q", "enhance", {
        card: "c2",
        expectedLevel: 2,
        enhancementRevision: 2,
      }),
    { status: 409 },
  );
});
test("revision3 preserves held surplus and transfers it through marketplace, auctions, legacy offers, competing returns and multi-card trades", (t) => {
  const { e, fresh, act } = fixture(t);
  e.run("DELETE FROM enhancement_migrations WHERE revision=3");
  e.host("players", { players: [{ id: "r", name: "Third" }] });
  e.run("UPDATE players SET balance=100000 WHERE id='q'");
  e.run(
    "INSERT INTO market_listings(seller,card,kind,level,extra_copies,price,created) VALUES('p','c1','character',6,2,100,1)",
  );
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends,seller,level,extra_copies,reserve,winner,bid,paid,closed) VALUES('c2','character',1,0,'p',5,3,100,'q',100,1,1)",
  );
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends,seller,level,extra_copies,reserve) VALUES('c3','character',1,9999999,'p',4,4,100)",
  );
  e.run(
    "INSERT INTO trade_listings(seller,card,level,extra_copies,created_at,updated_at) VALUES('p','c4',3,5,1,1),('p','c6',6,2,1,1)",
  );
  e.run(
    "INSERT INTO trade_offers(listing,proposer,card,level,extra_copies,created_at,updated_at) VALUES(1,'q','c5',2,6,1,1),(2,'q','c7',3,0,1,1),(1,'r','c9',4,4,1,1)",
  );
  e.run(
    "INSERT INTO trade_offer_cards(offer,position,card,level,extra_copies) VALUES(2,0,'c7',3,2),(2,1,'c8',6,1)",
  );
  e.run(
    "INSERT INTO market_listings(seller,card,kind,level,extra_copies,price,created,status) VALUES('p','c10','character',6,9,100,1,'cancelled')",
  );
  const migrated = fresh();
  assert.deepEqual(
    {
      ...migrated.one(
        "SELECT level,extra_copies FROM market_listings WHERE id=1",
      ),
    },
    { level: 6, extra_copies: 7 },
  );
  assert.equal(
    migrated.one("SELECT extra_copies FROM market_listings WHERE id=2")
      .extra_copies,
    9,
  );
  assert.deepEqual(
    migrated
      .all("SELECT balance FROM players WHERE id IN ('p','q') ORDER BY id")
      .map((r) => r.balance),
    [0, 100000],
  );
  act(migrated, "q", "buy-listing", { listing: 1 });
  act(migrated, "q", "claim", { auction: 1 });
  act(migrated, "p", "cancel-listing", { listing: 2, venue: "auction" });
  act(migrated, "p", "trade-accept", { offer: 1 });
  act(migrated, "p", "trade-accept", { offer: 2 });
  for (const [player, card, total] of [
    ["q", "c1", 23],
    ["q", "c2", 18],
    ["p", "c3", 14],
    ["q", "c4", 11],
    ["p", "c5", 9],
    ["q", "c6", 23],
    ["p", "c7", 8],
    ["p", "c8", 22],
    ["r", "c9", 14],
  ]) {
    const row = migrated.one(
      "SELECT * FROM inventory WHERE player=? AND card=?",
      player,
      card,
    );
    assert.equal(cardInvestment(row.level) + row.copies - 1, total, card);
  }
});
test("a revision3 conversion failure rolls back all cards, audit rows and its receipt without changing revision2", (t) => {
  const { e, fresh } = fixture(t);
  e.run("DELETE FROM enhancement_migrations WHERE revision=3");
  e.run(
    "INSERT INTO inventory(player,card,copies,level) VALUES('p','c1',2,2),('p','c2',1,7)",
  );
  assert.throws(() => fresh(), /revision-2/);
  assert.equal(e.one("SELECT copies FROM inventory WHERE card='c1'").copies, 2);
  assert.equal(
    e.one("SELECT revision FROM enhancement_migrations WHERE revision=3"),
    undefined,
  );
  assert.equal(e.all("SELECT * FROM enhancement_revision_rows").length, 0);
  assert.ok(
    e.one("SELECT revision FROM enhancement_migrations WHERE revision=2"),
  );
});
