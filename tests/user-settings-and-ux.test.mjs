import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { recentActivityRows } from "../public/account-activity.js";
import { createFeatures } from "../public/features.js";
import { instantSalePrice, shouldAutosellRarity } from "../public/card-values.js";
import { USER_AUCTION_SNIPE_WINDOW_MS } from "../public/community-market-rules.js";
import { PICKEM_PARTICIPATION_REWARD } from "../public/site-defaults.js";
import {
  DEFAULT_QUIZ_HOTKEYS,
  normalizeQuizHotkeys,
  normalizeHotkeyCombo,
  formatHotkeyEvent,
  hotkeyActionForEvent,
} from "../public/quiz-hotkeys.js";
import { createPackReveal } from "../public/pack-reveal.js";
import { createShopUI } from "../public/shop-ui.js";
import { profileCardPanel } from "../public/profile-cards-ui.js";
import { createTradesUI } from "../public/trades-ui.js";
import { pickemBoard } from "../public/pickem-board.js";
import { AliasSync } from "../src/aliases.js";
import { winnerCard } from "../public/tour-winner-ui.js";

function makeFixture(t, { now = 1_750_000_000_000 } = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let currentNow = now;
  const e = new Engine(
    (sql, ...args) => db.prepare(sql).all(...args),
    (fn) => {
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    () => currentNow,
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
      { id: "carol", name: "Carol" },
    ],
  });
  e.host("catalog", {
    cards: [
      {
        id: "community-c-d",
        kind: "character",
        name: "Sakura Low",
        series: "Cardcaptor",
        role: "supporting",
        fixedRarity: "D",
      },
      {
        id: "community-c-b",
        kind: "character",
        name: "Rei Mid",
        series: "Eva",
        role: "main",
        fixedRarity: "B",
      },
      {
        id: "community-c-ag",
        kind: "character",
        name: "Asuka Top",
        series: "Eva",
        role: "main",
        fixedRarity: "AG",
      },
      {
        id: "community-s-s",
        kind: "seiyuu",
        name: "Megumi Hayashibara",
        fixedRarity: "S",
      },
    ],
  });
  const act = (player, action, body, key = crypto.randomUUID()) =>
    e.mutate(`${player}:${action}`, key, body, () =>
      e.action(player, action, body),
    );
  const host = (action, body, key = crypto.randomUUID()) =>
    e.mutate(`host:${action}`, key, body, () => e.host(action, body));
  return {
    db,
    e,
    act,
    host,
    now: () => currentNow,
    advance: (ms) => {
      currentNow += ms;
    },
  };
}

test("pickem participation awards 100 credits to losing predictors in match pickems", (t) => {
  const { e, act, host, now, advance } = makeFixture(t);
  host("pickem", {
    title: "Quarterfinal",
    tour: "Autumn Cup",
    teamA: "Team One",
    teamB: "Team Two",
    ends: now() + 60_000,
    winnerReward: 300,
    scoreReward: 50,
  });
  act("alice", "predict", { pickem: 1, winner: "a", scoreA: 3, scoreB: 1 });
  act("bob", "predict", { pickem: 1, winner: "b", scoreA: 0, scoreB: 3 });
  advance(60_001);
  host("settle", { pickem: 1, scoreA: 3, scoreB: 2 });
  assert.equal(e.player("alice").balance, 350);
  assert.equal(e.player("bob").balance, PICKEM_PARTICIPATION_REWARD);
  assert.equal(e.player("carol").balance, 0);
});

test("pack auto-sale cancellation restores one original-price copy, enforces ownership/funds and survives retries atomically", (t) => {
  const { e, act, host, db } = makeFixture(t);
  act("alice", "profile", { autosellBelow: "AG" });
  const card = e.catalogStore.card("community-c-d");
  const result = e.tx(() => e.grantPackPulls("alice", [card, card]));
  const [first, second] = result.cards;
  assert.notEqual(first.autoSoldId, second.autoSoldId);
  assert.equal(e.all("SELECT * FROM pack_auto_sales WHERE player='alice'").length, 2);
  const starting = e.player("alice");
  assert.throws(() => act("bob", "pack-autosell-cancel", { sale: first.autoSoldId }), /unavailable/);
  assert.throws(() => act("alice", "pack-autosell-cancel", { sale: "invented", card: card.id, price: 0 }), /unavailable/);
  e.run("UPDATE players SET account_locked=1 WHERE id='alice'");
  assert.throws(() => act("alice", "pack-autosell-cancel", { sale: first.autoSoldId }), /locked/);
  e.run("UPDATE players SET account_locked=0 WHERE id='alice'");

  // Failed persistence must roll back both the debit and the inventory grant.
  db.exec("CREATE TRIGGER reject_cancel BEFORE UPDATE OF cancelled ON pack_auto_sales BEGIN SELECT RAISE(ABORT,'cancel failure'); END");
  assert.throws(() => act("alice", "pack-autosell-cancel", { sale: first.autoSoldId }), /cancel failure/);
  assert.equal(e.player("alice").balance, starting.balance);
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='alice'").n, 0);
  assert.equal(e.one("SELECT cancelled FROM pack_auto_sales WHERE id=?", first.autoSoldId).cancelled, 0);
  db.exec("DROP TRIGGER reject_cancel");

  const body = { sale: first.autoSoldId, card: "community-c-ag", price: 0 };
  const cancelled = act("alice", "pack-autosell-cancel", body, "cancel-once");
  assert.equal(cancelled.card, card.id);
  assert.equal(cancelled.price, first.autoSoldPrice);
  assert.equal(e.player("alice").balance, starting.balance - first.autoSoldPrice);
  assert.equal(e.player("alice").earned, starting.earned);
  assert.equal(e.player("alice").autosell_below, "AG");
  assert.deepEqual(act("alice", "pack-autosell-cancel", body, "cancel-once"), cancelled);
  act("alice", "pack-autosell-cancel", body); // Different receipt key, same pull.
  assert.equal(e.one("SELECT copies FROM inventory WHERE player='alice' AND card=?", card.id).copies, 1);
  assert.equal(e.one("SELECT count(*) n FROM ledger WHERE reason LIKE 'Cancel pack auto-sell:%'").n, 1);

  e.tx(() => e.wallet("alice", -e.player("alice").balance, "Local spend"));
  assert.throws(() => act("alice", "pack-autosell-cancel", { sale: second.autoSoldId }), /Not enough/);
  assert.equal(e.one("SELECT cancelled FROM pack_auto_sales WHERE id=?", second.autoSoldId).cancelled, 0);
  e.tx(() => e.wallet("alice", second.autoSoldPrice, "Local funds"));
  e.run("UPDATE inventory SET level=3,copies=2 WHERE player='alice'");
  e.tx(() => new AliasSync(e).renamePlayer("alice", "10001"));
  act("10001", "pack-autosell-cancel", { sale: second.autoSoldId });
  assert.deepEqual({ ...e.one("SELECT level,copies FROM inventory WHERE player='10001' AND card=?", card.id) }, { level: 3, copies: 3 });
  host("reset-player", { player: "10001", confirmation: "RESET PLAYER 10001" });
  assert.equal(e.one("SELECT count(*) n FROM pack_auto_sales").n, 0);
  assert.throws(() => act("10001", "pack-autosell-cancel", { sale: second.autoSoldId }), /unavailable/);
  e.tx(() => e.grantPackPulls("bob", [card])); // No threshold means no cancellation ticket.
  assert.equal(e.one("SELECT count(*) n FROM pack_auto_sales").n, 0);
  act("bob", "profile", { autosellBelow: "AG" });
  e.tx(() => e.grantPackPulls("bob", [card]));
  host("reset-all", { confirmation: "RESET ALL GAME DATA" });
  assert.equal(e.one("SELECT count(*) n FROM pack_auto_sales").n, 0);
});

test("settings persist autosell, privacy flags, and quiz hotkeys; pack autosell excludes trades and buys", (t) => {
  const { e, act } = makeFixture(t);
  e.host("grant", { player: "alice", amount: 5000, reason: "other", note: "Seed" });
  e.host("grant", { player: "bob", amount: 5000, reason: "other", note: "Seed" });
  e.host("catalog", {
    cards: [{ id: "only-d", kind: "character", name: "Only D", rarity: "D" }, { id: "pending", kind: "character", name: "Unrated" }],
  });

  // Invalid autosell tier is rejected
  assert.throws(
    () => act("alice", "profile", { autosellBelow: "X" }),
    /valid auto-sell/,
  );

  // Set autosell below B, privacy flags, and custom quiz hotkeys
  act("alice", "profile", {
    autosellBelow: "B",
    privateBalance: true,
    privateCollection: true,
    quizHotkeys: { skip: "F2", restart: "Alt+X", stop: "", play: "P" },
  });
  const me = e.state("alice").me;
  assert.equal(me.autosell_below, "B");
  assert.equal(me.private_balance, true);
  assert.equal(me.private_collection, true);
  assert.equal(me.quiz_hotkeys.skip, "F2");
  assert.equal(me.quiz_hotkeys.restart, "Alt+X");
  assert.equal(me.quiz_hotkeys.stop, "");
  assert.equal(me.quiz_hotkeys.play, "P");

  // With rand=0 in fixture and c-d / c-b / c-ag / only-d, let's guarantee D-tier only catalog for deterministic autosell test
  // First grant bob a D card and sell it in marketplace to alice: autosell MUST NOT trigger on marketplace purchase
  e.tx(() => e.addCard("bob", "community-c-d"));
  act("bob", "list-card", {
    venue: "shop",
    card: "community-c-d",
    variant: "card",
    price: 100,
  });
  const listingId = e.one("SELECT id FROM market_listings WHERE seller='bob'").id;
  act("alice", "buy-listing", { listing: listingId });
  assert.equal(
    e.one(
      "SELECT count(*) n FROM inventory WHERE player='alice' AND card='community-c-d'",
    ).n,
    1,
    "marketplace purchase must NOT auto-sell",
  );

  // Pack open with autosellBelow="AG" auto-sells all non-AG pulls and returns remaining balance
  act("alice", "profile", { autosellBelow: "AG" });
  const cardD = e.catalogStore.card("community-c-d");
  act("alice", "sell-instant", {
    card: "community-c-d",
    variant: "card",
    expectedPrice: instantSalePrice(cardD, 1),
    expectedRarity: "D",
    expectedLevel: 1,
  });
  const beforePack = e.player("alice").balance;
  const fakeCards = [
    e.catalogStore.card("community-c-d"),
    e.catalogStore.card("community-c-b"),
    e.catalogStore.card("community-c-ag"),
    e.catalogStore.card("pending"),
  ];
  const pullOutcome = e.tx(() => e.grantPackPulls("alice", fakeCards, "Pack"));
  for (const threshold of ["D", "B", "AG"]) {
    assert.equal(shouldAutosellRarity("Pending", threshold), false);
    assert.equal(shouldAutosellRarity(null, threshold), false);
  }
  assert.equal(e.one("SELECT copies FROM inventory WHERE player='alice' AND card='pending'").copies, 1);
  assert.equal(pullOutcome.autoSoldCount, 2);
  assert.equal(
    pullOutcome.autoSoldCredits,
    instantSalePrice(fakeCards[0], 1) + instantSalePrice(fakeCards[1], 1),
  );
  assert.equal(
    pullOutcome.balance,
    beforePack + pullOutcome.autoSoldCredits,
  );
  assert.equal(
    e.one(
      "SELECT count(*) n FROM inventory WHERE player='alice' AND card='community-c-d'",
    ).n,
    0,
  );
  assert.equal(
    e.one(
      "SELECT count(*) n FROM inventory WHERE player='alice' AND card='community-c-ag'",
    ).n,
    1,
  );
});

test("privacy hides balance and collection from other viewers, rankings, search, and collectors", (t) => {
  const { e, act } = makeFixture(t);
  e.host("grant", { player: "alice", amount: 2500, reason: "other", note: "Bonus" });
  e.host("grant", { player: "bob", amount: 1200, reason: "other", note: "Bonus" });
  e.tx(() => {
    e.addCard("alice", "community-c-ag");
    e.addCard("bob", "community-c-ag");
  });
  act("alice", "wishlist", { card: "community-c-ag", wanted: true });
  act("alice", "pin-anime", { series: "eva", pinned: true });
  e.run("UPDATE inventory SET protected=1 WHERE player='alice'");
  act("alice", "profile", { privateBalance: true, privateCollection: true });

  // Non-owner profile view hides credits and inventory
  const publicView = e.profile("alice", "bob");
  assert.equal(publicView.balance, null);
  assert.equal(publicView.earned, null);
  assert.equal(publicView.balanceHidden, true);
  assert.equal(publicView.collectionHidden, true);
  assert.deepEqual(publicView.inventory, []);
  assert.equal(publicView.completion, null);
  assert.equal(publicView.pinnedAnime[0].owned, null);
  assert.equal(publicView.pinnedAnime[0].ownershipHidden, 1);
  for (const kind of ["both", "character"]) {
    const page = e.economy.wishlist.page("alice", "wishlist", 1, { viewer: "bob", kind });
    assert.equal(page.rows[0].protected, null);
    const own = e.economy.wishlist.page("alice", "wishlist", 1, { viewer: "alice", kind });
    assert.equal(own.rows[0].protected, 1);
  }
  const features = createFeatures({
    escape: String, number: String, series: c => c.series_romaji,
    empty: () => "", getState: () => ({}),
  }, {});
  const html = features.profileExtras(publicView, false);
  assert.match(html, /Collection progress is private/);
  assert.match(html, />Private</);
  assert.doesNotMatch(html, /<progress|0 \/ 0/);

  // Owner still sees their own profile values
  const selfView = e.profile("alice", "alice");
  assert.equal(selfView.balance, 2500);
  assert.equal(selfView.balanceHidden, false);
  assert.equal(selfView.collectionHidden, false);
  assert.equal(selfView.inventory.length, 1);
  assert.equal(selfView.pinnedAnime[0].owned, 1);

  // Wishlist/collection endpoints respect private_collection
  const hiddenPage = e.economy.wishlist.page("alice", "collection", 1, {
    viewer: "bob",
  });
  assert.equal(hiddenPage.hidden, true);
  assert.deepEqual(hiddenPage.rows, []);

  const ownPage = e.economy.wishlist.page("alice", "collection", 1, {
    viewer: "alice",
  });
  assert.equal(ownPage.hidden, undefined);
  assert.equal(ownPage.rows.length, 1);

  // Rankings & state().ranks & searchProfiles respect private_balance
  assert.ok(!e.state().ranks.some((r) => r.id === "alice"));
  assert.ok(!e.economy.rankings("earned", 1).rows.some((r) => r.id === "alice"));
  assert.ok(!e.economy.rankings("balance", 1).rows.some((r) => r.id === "alice"));
  const searchedAlice = e.searchProfiles("Alice").find((r) => r.id === "alice");
  assert.equal(searchedAlice.earned, null);
  assert.equal(searchedAlice.private_balance, true);

  // Collectors modal and counts exclude private_collection owners (Bob shown, Alice excluded)
  const col = e.economy.wishlist.collectors("community-c-ag", "owned", 1);
  assert.equal(col.counts.owned, 1);
  assert.deepEqual(
    col.rows.map((r) => r.id),
    ["bob"],
  );
  const [withCounts] = e.economy.wishlist.withCounts([
    e.catalogStore.card("community-c-ag"),
  ]);
  assert.equal(withCounts.collectors.owned, 1);
});

test("recent activity shows card names and counterparties for sales, auctions, and zero-credit trades", (t) => {
  const { e, act } = makeFixture(t);
  e.host("grant", { player: "alice", amount: 1000, reason: "other", note: "Seed" });
  e.host("grant", { player: "bob", amount: 1000, reason: "other", note: "Seed" });
  e.tx(() => {
    e.addCard("alice", "community-c-ag");
    e.addCard("bob", "community-s-s");
  });

  // Marketplace sale shows card + partner names in ledger
  e.tx(() => e.addCard("alice", "community-c-b"));
  act("alice", "list-card", {
    venue: "shop",
    card: "community-c-b",
    variant: "card",
    price: 250,
  });
  const marketId = e.one("SELECT id FROM market_listings WHERE seller='alice'").id;
  act("bob", "buy-listing", { listing: marketId });
  assert.ok(
    e
      .state("bob")
      .ledger.some((l) => /Rei Mid/.test(l.reason) && /Alice/.test(l.reason)),
  );
  assert.ok(
    e
      .state("alice")
      .ledger.some((l) => /Rei Mid/.test(l.reason) && /Bob/.test(l.reason)),
  );

  // 0-credit accepted trade appears in recentTrades with card names + partner name
  act("alice", "trade-list", {
    card: "community-c-ag",
    variant: "card",
    expectedLevel: 1,
  });
  const listingId = e.one("SELECT id FROM trade_listings WHERE seller='alice'").id;
  act("bob", "trade-offer", {
    listing: listingId,
    cards: [{ card: "community-s-s", variant: "card", expectedLevel: 1 }],
    credits: 0,
  });
  const offerId = e.one("SELECT id FROM trade_offers WHERE listing=?", listingId)
    .id;
  act("alice", "trade-accept", { offer: offerId });

  const aliceTrade = e.state("alice").recentTrades[0];
  assert.equal(aliceTrade.partnerName, "Bob");
  assert.deepEqual(aliceTrade.givenCards, ["Asuka Top"]);
  assert.deepEqual(aliceTrade.receivedCards, ["Megumi Hayashibara"]);

  const bobTrade = e.state("bob").recentTrades[0];
  assert.equal(bobTrade.partnerName, "Alice");
  assert.deepEqual(bobTrade.givenCards, ["Megumi Hayashibara"]);
  assert.deepEqual(bobTrade.receivedCards, ["Asuka Top"]);
  // A second trade pays credits into escrow once; completion is informational.
  e.tx(() => {
    e.addCard("alice", "community-c-ag");
    e.addCard("bob", "community-s-s");
  });
  act("alice", "trade-list", { card: "community-c-ag", variant: "card", expectedLevel: 1 });
  const paidListing = e.one("SELECT max(id) id FROM trade_listings").id;
  act("bob", "trade-offer", {
    listing: paidListing,
    cards: [{ card: "community-s-s", variant: "card", expectedLevel: 1 }],
    credits: 300,
  });
  const paidOffer = e.one("SELECT id FROM trade_offers WHERE listing=?", paidListing).id;
  act("alice", "trade-accept", { offer: paidOffer });
  const bobActivity = recentActivityRows(e.state("bob"));
  assert.equal(bobActivity.filter(r => r.delta === -300).length, 1);
  assert.equal(bobActivity.find(r => r.text.startsWith("Trade with Alice")).delta, 0);
  assert.equal(recentActivityRows(e.state("alice")).filter(r => r.delta === 300).length, 1);
  assert.equal(e.player("bob").balance, 450);
  assert.equal(e.player("alice").balance, 1550);
  // Historical single-card offers without bundle rows still display correctly.
  e.run("DELETE FROM trade_offer_cards WHERE offer=?", paidOffer);
  assert.deepEqual(e.economy.trades.recent("bob")[0].givenCards, ["Megumi Hayashibara"]);
  // Mixed participant roles merge into the newest 25, even with unrelated history.
  e.tx(() => {
    for (let n = 0; n < 80; n++) {
      const id = 100 + n;
      const at = e.now() + id;
      const seller = n % 3 === 0 ? "bob" : "carol";
      const proposer = n % 3 === 1 ? "bob" : "alice";
      e.run("INSERT INTO trade_listings(id,seller,card,level,status,accepted_offer,created_at,updated_at) VALUES(?,?,?,1,'completed',?,?,?)", id, seller, "community-c-ag", id, at, at);
      e.run("INSERT INTO trade_offers(id,listing,proposer,card,level,credits,status,created_at,updated_at) VALUES(?,?,?,?,1,0,'accepted',?,?)", id, id, proposer, "community-s-s", at, at);
    }
  });
  const history = e.economy.trades.recent("bob");
  assert.equal(history.length, 25);
  assert.deepEqual(history.map(r => r.id), Array.from({ length: 80 }, (_, n) => 179 - n).filter(id => (id - 100) % 3 !== 2).slice(0, 25));
  assert.deepEqual(e.economy.trades.recent("nobody"), []);


});

test("user auction bids with under 5 minutes remaining reset timer to 5 minutes", (t) => {
  const { e, act, now, advance } = makeFixture(t);
  e.host("grant", { player: "bob", amount: 5000, reason: "other", note: "Seed" });
  e.host("grant", { player: "carol", amount: 5000, reason: "other", note: "Seed" });
  e.tx(() => e.addCard("alice", "community-c-ag"));
  act("alice", "list-card", {
    venue: "auction",
    card: "community-c-ag",
    variant: "card",
    price: 100,
    hours: 1,
  });
  const auction = e.one("SELECT * FROM auctions WHERE seller='alice'");
  const initialEnds = auction.ends;

  // Bid with > 5m remaining: ends stays unchanged
  act("bob", "bid", { auction: auction.id, amount: 150 });
  assert.equal(
    e.one("SELECT ends FROM auctions WHERE id=?", auction.id).ends,
    initialEnds,
  );

  // Advance until 2 minutes remain, then bid: ends resets to now + 5m
  advance(58 * 60_000);
  const expectedReset = now() + USER_AUCTION_SNIPE_WINDOW_MS;
  act("carol", "bid", { auction: auction.id, amount: 200 });
  assert.equal(
    e.one("SELECT ends FROM auctions WHERE id=?", auction.id).ends,
    expectedReset,
  );
});

test("wishlist kind filter and trades search/rarity/role/sort filters filter accurately", (t) => {
  const { e, act } = makeFixture(t);
  act("alice", "wishlist", { card: "community-c-ag", wanted: true });
  act("alice", "wishlist", { card: "community-s-s", wanted: true });
  const charWish = e.economy.wishlist.page("alice", "wishlist", 1, {
    kind: "character",
  });
  assert.deepEqual(
    charWish.rows.map((r) => r.card),
    ["community-c-ag"],
  );
  assert.equal(charWish.kind, "character");
  const seiyuuWish = e.economy.wishlist.page("alice", "wishlist", 1, {
    kind: "seiyuu",
  });
  assert.deepEqual(
    seiyuuWish.rows.map((r) => r.card),
    ["community-s-s"],
  );

  // Trade browse filters by kind, rarity, role, and sort
  e.tx(() => {
    e.addCard("bob", "community-c-d");
    e.addCard("bob", "community-s-s");
    e.addCard("carol", "community-c-ag");
  });
  act("bob", "trade-list", {
    card: "community-c-d",
    variant: "card",
    expectedLevel: 1,
  });
  act("bob", "trade-list", {
    card: "community-s-s",
    variant: "card",
    expectedLevel: 1,
  });
  act("carol", "trade-list", {
    card: "community-c-ag",
    variant: "card",
    expectedLevel: 1,
  });

  const agOnly = e.economy.trades.page("alice", {
    kind: "character",
    rarity: "AG",
    role: "main",
  });
  assert.deepEqual(
    agOnly.items.map((i) => i.card),
    ["community-c-ag"],
  );
  const seiyuuOnly = e.economy.trades.page("alice", { kind: "seiyuu" });
  assert.deepEqual(
    seiyuuOnly.items.map((i) => i.card),
    ["community-s-s"],
  );
  const sortedRarity = e.economy.trades.page("alice", { sort: "rarity" });
  assert.deepEqual(
    sortedRarity.items.map((i) => i.card),
    ["community-c-ag", "community-s-s", "community-c-d"],
  );
});

test("quiz hotkeys normalize combos, respect editable inputs, and UI modules render new controls cleanly", () => {
  assert.equal(normalizeHotkeyCombo("alt + shift + r"), "Alt+Shift+R");
  assert.equal(Object.hasOwn(normalizeQuizHotkeys({ next: "F2" }), "next"), false);
  assert.equal(hotkeyActionForEvent({ key: "F2" }, { next: "F2" }), null);
  assert.equal(
    formatHotkeyEvent({ key: "s", altKey: true, shiftKey: false, ctrlKey: false, metaKey: false }),
    "Alt+S",
  );
  assert.equal(
    hotkeyActionForEvent(
      { key: "r", altKey: true },
      DEFAULT_QUIZ_HOTKEYS,
      { isEditable: true },
    ),
    "restart",
  );
  assert.equal(
    hotkeyActionForEvent(
      { key: "/" },
      DEFAULT_QUIZ_HOTKEYS,
      { isEditable: true },
    ),
    null,
    "single-key focus hotkey must not steal typing inside input",
  );
  assert.equal(
    hotkeyActionForEvent(
      { key: "/" },
      DEFAULT_QUIZ_HOTKEYS,
      { isEditable: false },
    ),
    "focus",
  );

  // Pack Reveal shows credits left, autosell banner, and collectors button
  let modalHtml = "";
  const pr = createPackReveal({
    modal: (html) => {
      modalHtml = html;
    },
    cardHTML: (c, _a, _i, actions) => `<div class="c">${c.name}${actions}</div>`,
    escape: (v) => String(v),
    number: (v) => String(v),
    getState: () => ({ me: { balance: 1500 }, settings: {}, inventory: [], showcase: [] }),
  });
  pr.show(
    {
      cards: [{ id: "c-d", name: "Sakura Low", rarity: "D", autoSold: true, autoSoldPrice: 100 }],
      autoSoldCount: 1,
      autoSoldCredits: 100,
      balance: 1500,
    },
    { kind: "character", premium: false, count: 1 },
  );
  assert.match(modalHtml, /Credits left:.*1500/);
  pr.reveal();
  assert.match(modalHtml, /Auto-sold/);
  assert.match(modalHtml, /data-action="card-collectors"/);

  // Shop listing includes collectors button
  const shop = createShopUI(
    {
      escape: (v) => String(v),
      number: (v) => String(v),
      btn: (label) => `<button>${label}</button>`,
      cardBy: () => ({ id: "c-ag", name: "Asuka Top", kind: "character", rarity: "AG" }),
      empty: () => "",
      profileURL: (id) => `#player/${id}`,
      countdown: () => "",
      nextWeeklyReset: () => 2_000_000_000_000,
      tabs: () => "",
      pager: () => "",
      series: () => "Eva",
      image: () => "",
      gradeBadge: () => "",
      rarityClass: () => "ag",
      cardFlags: () => ({}),
      getState: () => ({ now: 1_750_000_000_000, me: { id: "alice", balance: 2000 }, roles: {}, shop: [{ id: 1, card: "c-ag", price: 500, ends: 2_000_000_000_000 }], myListings: [], communityMarket: {} }),
    },
    { shopSection: "buy" },
  );
  assert.match(shop.render(), /data-action="card-collectors"/);

  // Profile panel handles private collection, wishlist kind tabs, and collectors on active listings
  const hiddenPanel = profileCardPanel(
    { view: "collection", hidden: true, page: 1, rows: [], hasMore: false },
    { cardBy: () => null, cardHTML: () => "", escape: (v) => String(v), number: String, own: false, wishlist: [], collectionFilters: {} },
  );
  assert.match(hiddenPanel, /collection is private/);

  const wishPanel = profileCardPanel(
    { view: "wishlist", kind: "seiyuu", page: 1, rows: [], hasMore: false },
    { cardBy: () => null, cardHTML: () => "", escape: (v) => String(v), number: String, own: false, wishlist: [], collectionFilters: {} },
  );
  assert.match(wishPanel, /data-action="profile-wishlist-kind" data-kind="seiyuu"/);

  // Trades UI renders board filters, collectors button, and picker filters
  const tUI = createTradesUI(
    {
      escape: (v) => String(v),
      number: String,
      btn: (label, a, attrs = "") => `<button data-action="${a}" ${attrs}>${label}</button>`,
      cardBy: () => ({ id: "c-ag", name: "Asuka Top", kind: "character", rarity: "AG", series: "Eva", role: "main" }),
      image: () => "",
      gradeBadge: () => "",
      rarityClass: () => "ag",
      series: () => "Eva",
      empty: () => "",
      profileURL: (id) => `#/${id}`,
      getState: () => ({ me: { id: "alice" }, inventory: [] }),
    },
    {
      tradeView: "browse",
      tradeKind: "character",
      tradeData: {
        page: 1,
        query: "",
        hasMore: false,
        items: [{ id: 1, seller: "bob", seller_name: "Bob", card: "c-ag", level: 1, status: "open", offer_count: 0, offers: [] }],
      },
    },
  );
  const tradeHtml = tUI.render();
  assert.match(tradeHtml, /id="trade-rarity"/);
  assert.match(tradeHtml, /id="trade-role"/);
  assert.match(tradeHtml, /id="trade-sort"/);
  assert.match(tradeHtml, /data-action="card-collectors"/);
  tUI.openPicker();
  const pickerHtml = tUI.renderPicker();
  assert.match(pickerHtml, /id="trade-picker-rarity"/);
  assert.match(pickerHtml, /id="trade-picker-sort"/);
  assert.match(pickerHtml, /id="trade-picker-upgradable"/);

  // Pickem countdown markup replaces static deadline timestamps
  const pHtml = pickemBoard(
    [{ key: 1, name: "Cup", rounds: 1, matches: 1, open: 1, settled: 0, nextEnds: 2_000_000_000_000, pairs: 0 }],
    { key: 1, matches: [{ id: 1, round: 1, team_a: "A", team_b: "B", ends: 2_000_000_000_000, settled: 0, winner_reward: 300, score_reward: 50 }] },
    { escape: (v) => String(v), number: String, now: 1_999_999_000_000, signedIn: true },
  );
  assert.match(pHtml, /data-countdown-end="2000000000000"/);
  const wHtml = winnerCard(
    { key: 1, newest: 1, name: "Cup", matches: 1, open: 1, settled: 0, voters: 0 },
    { key: 1, matches: [{ id: 1, winner_reward: 500, teams: '["A","B"]', ends: 2_000_000_000_000, settled: 0 }] },
    { escape: (v) => String(v), number: String, now: 1_999_999_000_000, signedIn: true },
  );
  assert.match(wHtml, /data-countdown-end="2000000000000"/);
});
