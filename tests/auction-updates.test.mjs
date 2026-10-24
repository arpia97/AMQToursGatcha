import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  AUCTION_WEIGHTS,
  drawAuction,
  drawFeatured,
} from "../public/auction-odds.js";
import {
  countdownText,
  nextDailyReset,
  nextWeeklyReset,
} from "../public/countdown.js";

test("community auction tier-first draws exactly match the approved spread, renormalize and exclude duplicates", () => {
  const cards = Object.keys(AUCTION_WEIGHTS).flatMap((rarity) =>
    Array.from({ length: rarity === "D" ? 200 : 2 }, (_, i) => ({
      id: rarity + i,
      rarity,
    })),
  );
  cards.push({ id: "pending" });
  const counts = {};
  for (let roll = 0; roll < 100; roll++) {
    let n = 0;
    const c = drawAuction(cards, (max) => (n++ === 0 ? roll : max - 1));
    counts[c.rarity] = (counts[c.rarity] || 0) + 1;
  }
  assert.deepEqual(counts, AUCTION_WEIGHTS);
  const chosen = new Set();
  for (let i = 0; i < 20; i++) {
    const c = drawAuction(cards, () => 0, chosen);
    assert.ok(!chosen.has(c.id));
    assert.ok(c.rarity);
    chosen.add(c.id);
  }
  assert.equal(drawAuction([{ id: "pending" }], () => 0).id, "pending");
  assert.throws(() => drawAuction([], () => 0), /available/);
  const onlyD = cards.filter((c) => c.rarity === "D");
  assert.equal(drawAuction(onlyD, () => 0).rarity, "D");
});
test("banner randomly samples three distinct SSS-or-higher cards from both types", () => {
  const pool = ["D", "SS", "SSS", "SSS", "Ubers", "AG"].map((rarity, i) => ({
    id: String(i),
    rarity,
    kind: i % 2 ? "seiyuu" : "character",
  }));
  const a = drawFeatured(pool, () => 0),
    b = drawFeatured(pool, (n) => n - 1);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((c) => c.id)).size, 3);
  assert.ok(a.every((c) => ["SSS", "Ubers", "AG"].includes(c.rarity)));
  assert.notDeepEqual(a, b);
  assert.equal(pool.length, 6);
  assert.deepEqual(
    drawFeatured([], () => 0),
    [],
  );
});
test("countdowns use KST daily boundaries and the existing UTC Monday weekly schedule including exact rollovers", () => {
  const now = Date.UTC(2026, 9, 24, 14, 59, 58);
  assert.equal(
    countdownText(nextDailyReset(now), now),
    "00 hours 00 minutes 02 seconds",
  );
  assert.equal(nextDailyReset(now), Date.UTC(2026, 9, 24, 15));
  assert.equal(
    nextDailyReset(Date.UTC(2026, 9, 24, 15)),
    Date.UTC(2026, 9, 25, 15),
  );
  assert.equal(nextWeeklyReset(now), Date.UTC(2026, 9, 26));
  assert.equal(
    countdownText(nextWeeklyReset(now), now, true),
    "01 days 09 hours 00 minutes 02 seconds",
  );
  assert.equal(
    countdownText(now - 1, now, true),
    "00 days 00 hours 00 minutes 00 seconds",
  );
});

function fixture() {
  const db = new DatabaseSync(":memory:");
  let now = Date.UTC(2026, 9, 24);
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
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
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.host("catalog", {
    cards: ["character", "seiyuu"].flatMap((kind) =>
      Array.from({ length: 6 }, (_, i) => ({
        id: kind + i,
        kind,
        name: kind + i,
        role: "supporting",
      })),
    ),
  });
  e.wallet("p", 10000, "Fixture");
  e.wallet("q", 10000, "Fixture");
  e.ensureAuctions();
  const act = (player, action, b, key = crypto.randomUUID()) =>
    e.mutate(player + ":" + action, key, b, () => e.action(player, action, b));
  return {
    e,
    act,
    advance: () => {
      now += 8 * 86400000;
    },
  };
}
test("auction-only refresh refunds once and preserves shop, owned cards, player auctions and importer state", () => {
  const { e, act } = fixture();
  const shop = e.all("SELECT * FROM weekly_shop");
  e.addCard("p", "character0", 2);
  act("p", "list-card", {
    card: "character0",
    variant: "extra",
    venue: "auction",
    price: 100,
    hours: 24,
  });
  const user = e.one("SELECT * FROM auctions WHERE seller IS NOT NULL");
  const lot = e.one("SELECT * FROM auctions WHERE seller IS NULL AND closed=0");
  act("p", "bid", { auction: lot.id, amount: 500 });
  e.run(
    "INSERT OR REPLACE INTO catalog_meta VALUES('test-checkpoint','preserve')",
  );
  const body = { confirmation: "REFRESH COMMUNITY AUCTIONS" };
  const refresh = () =>
    e.mutate("host:refresh-auctions", "once", body, () =>
      e.host("refresh-auctions", body),
    );
  assert.throws(
    () => e.host("refresh-auctions", { confirmation: "wrong" }),
    /Type/,
  );
  const result = refresh();
  assert.equal(result.refunded, 500);
  assert.deepEqual(refresh(), result);
  assert.deepEqual(e.all("SELECT * FROM weekly_shop"), shop);
  assert.deepEqual(e.one("SELECT * FROM auctions WHERE id=?", user.id), user);
  assert.equal(e.player("p").balance, 10000);
  assert.equal(
    e.one(
      "SELECT copies FROM inventory WHERE player=? AND card=?",
      "p",
      "character0",
    ).copies,
    1,
  );
  assert.equal(
    e.one("SELECT value FROM catalog_meta WHERE key='test-checkpoint'").value,
    "preserve",
  );
  assert.equal(result.auctionIds.length, 10);
  assert.ok(!result.auctionIds.includes(lot.id));
  assert.equal(
    new Set(
      e
        .all("SELECT card FROM auctions WHERE closed=0 AND seller IS NULL")
        .map((x) => x.card),
    ).size,
    10,
  );
});
test("auction-win notifications survive reconnects, stay private, acknowledge once and preserve unclaimed delivery", () => {
  const { e, act, advance } = fixture(),
    a = e.one("SELECT * FROM auctions WHERE seller IS NULL");
  act("p", "bid", { auction: a.id, amount: 100 });
  assert.equal(e.state("p").auctionWins.length, 0);
  assert.throws(
    () => act("p", "auction-notice", { auction: a.id }),
    /not available/,
  );
  advance();
  e.ensureAuctions();
  assert.equal(e.state("p").auctionWins[0].id, a.id);
  assert.equal(e.state("p").auctionWins[0].id, a.id);
  assert.equal(e.state("q").auctionWins.length, 0);
  assert.equal(e.state().auctionWins.length, 0);
  assert.throws(
    () => act("q", "auction-notice", { auction: a.id }),
    /not available/,
  );
  const body = { auction: a.id };
  const notice = act("p", "auction-notice", body, "notice");
  assert.deepEqual(act("p", "auction-notice", body, "notice"), notice);
  assert.equal(e.state("p").auctionWins.length, 0);
  assert.ok(e.state("p").auctions.some((x) => x.id === a.id));
  const result = act("p", "claim", body, "claim");
  assert.equal(result.cards[0].id, a.card);
  assert.equal(result.level, 1);
  assert.deepEqual(act("p", "claim", body, "claim"), result);
  assert.equal(
    e.one("SELECT copies FROM inventory WHERE player=? AND card=?", "p", a.card)
      .copies,
    1,
  );
});
test("shop purchases return reveal metadata without granting extra copies on retry", () => {
  const { e, act } = fixture(),
    slot = e.one("SELECT * FROM weekly_shop"),
    body = { slot: slot.id };
  const result = act("p", "shop-buy", body, "buy");
  assert.equal(result.cards[0].id, slot.card);
  assert.equal(result.level, 1);
  assert.deepEqual(act("p", "shop-buy", body, "buy"), result);
  assert.equal(
    e.one(
      "SELECT copies FROM inventory WHERE player=? AND card=?",
      "p",
      slot.card,
    ).copies,
    1,
  );
});
