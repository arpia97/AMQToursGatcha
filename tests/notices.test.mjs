import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import { noticePanel, noticeCopy } from "../public/player-notices.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = Date.UTC(2026, 9, 28);
  const query = (s, ...a) => db.prepare(s).all(...a),
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
  const e = new Engine(
    query,
    tx,
    () => now,
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Seller" },
      { id: "q", name: "Bidder" },
      { id: "r", name: "Buyer" },
    ],
  });
  for (const id of ["p", "q", "r"])
    e.host("grant", {
      player: id,
      amount: 10000,
      reason: "other",
      note: "Test",
    });
  const cards = Array.from({ length: 10 }, (_, i) => ({
    id: "card-" + i,
    kind: i < 5 ? "character" : "seiyuu",
    name: "Card " + i,
    series: "Test",
    image: "https://example.com/card.png",
    source: "https://example.com/card",
  }));
  e.host("catalog", { cards });
  e.addCard("p", "card-0");
  e.run("UPDATE inventory SET level=3 WHERE player='p' AND card='card-0'");
  const act = (player, a, b, key = crypto.randomUUID()) =>
    e.mutate(player + ":" + a, key, b, () => e.action(player, a, b));
  return { e, act, query, tx, advance: (n) => (now += n) };
}
test("marketplace sale queues one private durable seller event, acknowledgment is repeatable and cannot access another player", (t) => {
  const { e, act, query, tx } = fixture(t);
  act("p", "list-card", {
    card: "card-0",
    variant: "card",
    venue: "shop",
    price: 700,
  });
  const id = e.one("SELECT id FROM market_listings").id;
  const before = e.player("p").balance;
  act("r", "buy-listing", { listing: id }, "purchase");
  act("r", "buy-listing", { listing: id }, "purchase");
  const notices = e.state("p").notices;
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "market-sale");
  assert.equal(notices[0].credits, 700);
  assert.equal(notices[0].level, 3);
  assert.equal(e.player("p").balance, before + 700);
  assert.deepEqual(e.gameState("p").notices, notices);
  assert.deepEqual(e.state("r").notices, []);
  assert.deepEqual(e.state(null).notices, []);
  const restarted = new Engine(query, tx);
  assert.deepEqual(restarted.gameState("p").notices, notices);
  assert.throws(
    () => act("r", "notice-seen", { ids: [notices[0].id] }),
    /not available/,
  );
  assert.equal(e.gameState("p").notices.length, 1);
  act("p", "notice-seen", { ids: [notices[0].id] }, "seen");
  act("p", "notice-seen", { ids: [notices[0].id] }, "seen");
  act("p", "notice-seen", { ids: [notices[0].id] });
  assert.deepEqual(e.state("p").notices, []);
  assert.equal(e.player("p").balance, before + 700);
});
test("outbid events return held credits once, own raises/failed bids stay silent, and normal auction wins retain their existing one-time reveal", (t) => {
  const { e, act, advance } = fixture(t);
  e.run(
    "INSERT INTO auctions(card,kind,starts,ends) VALUES('card-1','character',?,?)",
    e.now(),
    e.now() + 1000,
  );
  const id = e.one("SELECT max(id) id FROM auctions").id;
  act("q", "bid", { auction: id, amount: 100 });
  act("q", "bid", { auction: id, amount: 200 });
  assert.deepEqual(e.gameState("q").notices, []);
  assert.throws(() => act("r", "bid", { auction: id, amount: 100 }), /minimum/);
  assert.deepEqual(e.gameState("q").notices, []);
  act("r", "bid", { auction: id, amount: 300 }, "bid");
  act("r", "bid", { auction: id, amount: 300 }, "bid");
  const notice = e.gameState("q").notices[0];
  assert.equal(notice.kind, "outbid");
  assert.equal(notice.credits, 200);
  assert.equal(e.player("q").balance, 10000);
  assert.equal(e.gameState("r").auctionWins.length, 0);
  advance(1001);
  e.ensureAuctions();
  assert.equal(
    e.gameState("r").auctionWins.filter((a) => a.id === id).length,
    1,
  );
  act("r", "auction-notice", { auction: id });
  assert.equal(e.gameState("r").auctionWins.length, 0);
  assert.equal(e.gameState("q").notices.length, 1);
});
test("auction buyouts queue winner/seller/refund events atomically, with direct-reveal acknowledgment IDs and no duplicates", (t) => {
  const { e, act } = fixture(t);
  act("p", "list-card", {
    card: "card-0",
    variant: "card",
    venue: "auction",
    hours: 1,
    price: 100,
    buyout: 500,
  });
  const id = e.one("SELECT max(id) id FROM auctions").id;
  act("q", "bid", { auction: id, amount: 100 });
  const result = act("r", "buyout", { auction: id }, "buyout");
  act("r", "buyout", { auction: id }, "buyout");
  assert.equal(result.noticeIds.length, 1);
  assert.equal(e.gameState("r").notices[0].kind, "auction-buyout");
  assert.equal(e.gameState("r").notices[0].id, result.noticeIds[0]);
  assert.equal(e.gameState("p").notices[0].kind, "auction-sale");
  assert.equal(e.gameState("q").notices[0].kind, "outbid");
  assert.equal(e.player("q").balance, 10000);
  assert.equal(e.gameState("r").auctionWins.length, 0);
  act("r", "notice-seen", { ids: result.noticeIds });
  assert.deepEqual(e.gameState("r").notices, []);
});
test("auction seller settlements are exactly-once across tick and claim, while unsold listings do not invent sale notices", (t) => {
  const { e, act, advance } = fixture(t);
  act("p", "list-card", {
    card: "card-0",
    variant: "card",
    venue: "auction",
    hours: 1,
    price: 100,
  });
  const id = e.one("SELECT max(id) id FROM auctions").id;
  act("q", "bid", { auction: id, amount: 300 });
  advance(3600001);
  e.ensureAuctions();
  e.ensureAuctions();
  act("q", "claim", { auction: id });
  assert.equal(e.state("p").notices.length, 1);
  assert.equal(e.state("p").notices[0].credits, 300);
  e.addCard("p", "card-1");
  act("p", "list-card", {
    card: "card-1",
    variant: "card",
    venue: "auction",
    hours: 1,
    price: 100,
  });
  advance(3600001);
  e.ensureAuctions();
  assert.equal(e.state("p").notices.length, 1);
});
test("a rejected financial transaction rolls back its event records with wallets and escrow", (t) => {
  const { e, act } = fixture(t);
  act("p", "list-card", {
    card: "card-0",
    variant: "card",
    venue: "auction",
    hours: 1,
    price: 100,
    buyout: 500,
  });
  const id = e.one("SELECT max(id) id FROM auctions").id;
  act("q", "bid", { auction: id, amount: 100 });
  e.run("UPDATE players SET balance=1000000000000 WHERE id='p'");
  assert.throws(() => act("r", "buyout", { auction: id }), /Wallet/);
  assert.equal(e.player("r").balance, 10000);
  assert.equal(e.player("q").balance, 9900);
  for (const player of ["p", "q", "r"])
    assert.deepEqual(e.gameState(player).notices, []);
  assert.equal(e.one("SELECT winner FROM auctions WHERE id=?", id).winner, "q");
});
test("notice batches are bounded, old sales are not backfilled, and identity/reset scopes preserve or clear the right inbox", (t) => {
  const { e, act, query, tx } = fixture(t);
  for (let i = 0; i < 25; i++)
    e.tx(() =>
      e.economy.notices.add("p", "event:" + i, "market-sale", "card-0", 1, 100),
    );
  assert.equal(e.gameState("p").notices.length, 20);
  const ids = e.gameState("p").notices.map((n) => n.id);
  act("p", "notice-seen", { ids });
  assert.equal(e.gameState("p").notices.length, 5);
  assert.throws(() => act("p", "notice-seen", { ids: [] }), /between/);
  assert.throws(
    () => act("p", "notice-seen", { ids: [ids[0], ids[0]] }),
    /between/,
  );
  e.tx(() => new AliasSync(e).renamePlayer("p", "canonical"));
  assert.equal(e.gameState("canonical").notices.length, 5);
  e.tx(() =>
    e.host("reset-player", {
      player: "canonical",
      confirmation: "RESET PLAYER canonical",
    }),
  );
  assert.deepEqual(e.gameState("canonical").notices, []);
  const restarted = new Engine(query, tx);
  assert.deepEqual(restarted.gameState("canonical").notices, []);
  e.tx(() =>
    e.economy.notices.add("q", "other-event", "outbid", "card-0", 1, 200),
  );
  e.tx(() =>
    e.host("reset-all", {
      deleteRegistry: false,
      confirmation: "RESET ALL GAME DATA",
    }),
  );
  assert.deepEqual(e.gameState("q").notices, []);
});
test("no-event visits render no popup, and event copy clearly distinguishes received credits, refunds and buyouts", () => {
  const options = {
    escape: (s) => String(s ?? "").replaceAll("<", "&lt;"),
    number: String,
    cardBy: () => ({ name: "<Name>", rarity: "S" }),
    image: () => '<img alt="card">',
    rarityClass: () => "s",
  };
  assert.equal(noticePanel([], options), "");
  const html = noticePanel(
    [{ kind: "market-sale", card: "x", level: 3, credits: 500 }],
    options,
  );
  assert.match(html, /Your Marketplace Card Sold/);
  assert.match(html, /&lt;Name>/);
  assert.match(html, /Lv. 3/);
  assert.equal(noticeCopy({ kind: "outbid" }).credit, "Refunded");
  assert.equal(noticeCopy({ kind: "auction-buyout" }).sign, "−");
});
