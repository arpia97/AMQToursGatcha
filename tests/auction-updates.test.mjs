import {flashDiscount} from '../public/community-market-rules.js';
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

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  if (t) t.after(() => db.close());
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
    advance: (ms = 8 * 86400000) => {
      now += ms;
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

test("community reform waits for the weekly boundary, preserves pending wins and restarts only new community lots by 12 hours with exact 10% raises", (t) => {
  const f = fixture(t),
    { e, act } = f,
    old = e.state("p"),
    activation = e.economy.community.activation();
  const lot = old.auctions[0];
  act("p", "bid", { auction: lot.id, amount: 100 });
  act("q", "bid", { auction: lot.id, amount: 101 }); // Current weekly rules remain intact.
  assert.equal(
    e.one("SELECT ends FROM auctions WHERE id=?", lot.id).ends,
    lot.ends,
  );
  assert.deepEqual(e.state().shop, old.shop);
  f.advance(activation - e.now());
  e.ensureAuctions();
  const lots = e.state("q").auctions.filter((a) => a.ends > e.now());
  assert.equal(lots.length, 10);
  assert.ok(
    lots.every((a) => a.rolling === 1 && a.ends === e.now() + 12 * 3600000),
  );
  assert.ok(e.state("q").auctionWins.some((a) => a.id === lot.id));
  act("q", "claim", { auction: lot.id });
  const a = lots[0];
  act("p", "bid", { auction: a.id, amount: 100 });
  f.advance(3600000);
  const before = e.player("q").balance;
  assert.throws(() => act("q", "bid", { auction: a.id, amount: 109 }), /110/);
  assert.equal(e.player("q").balance, before);
  act("q", "bid", { auction: a.id, amount: 110 }, "rolling-bid");
  const held = e.player("q").balance;
  act("q", "bid", { auction: a.id, amount: 110 }, "rolling-bid");
  assert.equal(e.player("q").balance, held);
  assert.equal(
    e.one("SELECT ends FROM auctions WHERE id=?", a.id).ends,
    e.now() + 12 * 3600000,
  );
  f.advance(11 * 3600000);
  e.ensureAuctions();
  assert.equal(e.one("SELECT closed FROM auctions WHERE id=?", a.id).closed, 0);
  assert.equal(
    e.all("SELECT id FROM auctions WHERE seller IS NULL AND closed=0").length,
    10,
  );
  const restarted = new Engine(e.db, e.transaction, e.now, e.rand);
  assert.equal(restarted.economy.community.activation(), activation);
  assert.equal(
    restarted.one("SELECT winner FROM auctions WHERE id=?", a.id).winner,
    "q",
  );
  e.addCard("q", "character0");
  act("q", "list-card", {
    card: "character0",
    variant: "card",
    venue: "auction",
    price: 100,
    hours: 1,
  });
  const user = e.one("SELECT * FROM auctions WHERE seller IS NOT NULL");
  act("p", "bid", { auction: user.id, amount: 100 });
  act("p", "bid", { auction: user.id, amount: 101 });
  assert.equal(
    e.one("SELECT ends FROM auctions WHERE id=?", user.id).ends,
    user.ends,
  );
});
test("flash stock is S-or-higher, shared, refilled once per paid purchase, and alternates persistent three-hour openings and closures after closing", (t) => {
  const f = fixture(t),
    { e, act } = f;
  e.host("catalog", {
    cards: ["character", "seiyuu"].flatMap((kind) =>
      Array.from({ length: 6 }, (_, i) => ({
        id: "community-flash-" + kind + i,
        kind,
        name: "Flash " + kind + i,
        fixedRarity: "S",
      })),
    ),
  });
  e.rand = max => max - 1;
  f.advance(e.economy.community.activation() - e.now());
  e.ensureAuctions();
  const slots = e.state("p").shop;
  assert.equal(slots.length, 10);
  assert.ok(
    slots.every(
      (s) =>
        s.ends === e.now() + 3 * 3600000 &&
        e.catalogStore.card(s.card).rarity === "S",
    ),
  );
  assert.ok(slots.every(s=>s.discount_percent===50 && s.base_price===800 && s.price===400));
  e.run("DELETE FROM settings WHERE key='flash_shop_cycle_anchor'");
  e.run("UPDATE settings SET value=? WHERE key='flash_shop_next'", e.now()+24*3600000);
  e.ensureAuctions();
  assert.deepEqual(e.state("p").shop,slots);
  const next = e.one(
    "SELECT value FROM settings WHERE key='flash_shop_next'",
  ).value;
  assert.equal(next, slots[0].ends + 3 * 3600000);
  const s = slots[0],
    before = e.player("p").balance;
  const buy = act("p", "shop-buy", { slot: s.id }, "flash-buy");
  assert.deepEqual(act("p", "shop-buy", { slot: s.id }, "flash-buy"), buy);
  assert.equal(e.player("p").balance, before - s.price);
  assert.equal(e.state().shop.length, 10);
  assert.equal(new Set(e.state().shop.map((s) => s.card)).size, 10);
  f.advance(3 * 3600000);
  e.ensureAuctions();
  assert.equal(e.state().shop.length, 0);
  assert.equal(e.state().communityMarket.flashOpen,false);
  assert.equal(e.state().communityMarket.flashNext,next);
  assert.throws(() => act("q", "shop-buy", { slot: slots[1].id }), /expired/);
  assert.equal(
    e.one("SELECT value FROM settings WHERE key='flash_shop_next'").value,
    next,
  );
  const restarted = new Engine(e.db, e.transaction, e.now, e.rand);
  assert.equal(
    restarted.one("SELECT value FROM settings WHERE key='flash_shop_next'")
      .value,
    next,
  );
  f.advance(next - e.now());
  e.ensureAuctions();
  assert.equal(e.state().shop.length, 10);
  assert.ok(e.state().shop.every((s) => s.starts === next));
  const ids = e.state().shop.map((s) => s.id);
  e.ensureAuctions();
  assert.deepEqual(
    e.state().shop.map((s) => s.id),
    ids,
  );
  f.advance(7*3600000);
  e.ensureAuctions();
  assert.ok(e.state().shop.every(s=>s.starts===next+6*3600000));
  assert.equal(e.state().communityMarket.flashEnds,e.now()+2*3600000);
});


test("every flash discount from 0 through 50 has strictly decreasing probability",()=>{
 const counts=Array(51).fill(0);
 for(let roll=0;roll<1326;roll++)counts[flashDiscount(()=>roll)]++;
 assert.deepEqual(counts,Array.from({length:51},(_,i)=>51-i));
 assert.equal(flashDiscount(()=>0),0);
 assert.equal(flashDiscount(max=>max-1),50);
});
