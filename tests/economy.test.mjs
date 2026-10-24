import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine, WEEK } from "../src/engine.js";
import { AliasSync, sheetPlayers } from "../src/aliases.js";

test("numeric aliases stay separate from canonical player IDs", () => {
  const f = fixture(),
    sync = new AliasSync(f.e);
  const rows = sheetPlayers("Player Name,Player ID\nAlpha,94\n94,105");
  f.e.tx(() => sync.import(rows));
  assert.equal(f.e.resolvePlayer("94"), "94");
  assert.equal(
    f.e.one("SELECT player FROM aliases WHERE alias='94'").player,
    "105",
  );
});

test("catalogue filters combine rarity and role and reject seiyuu roles", () => {
  const { e } = fixture();
  let r = e.catalogStore.page("character", "Card", 1, 40, {
    rarity: "Pending",
    role: "main",
  });
  assert.equal(r.cards.length, 3);
  assert.ok(r.cards.every((c) => c.role === "main" && !c.rarity));
  assert.equal(
    e.catalogStore.page("character", "", 1, 1, { role: "main" }).hasMore,
    true,
  );
  assert.throws(
    () => e.catalogStore.page("seiyuu", "", 1, 40, { role: "main" }),
    /character role/,
  );
  assert.throws(
    () => e.catalogStore.page("character", "", 1, 40, { rarity: "invalid" }),
    /rarity/,
  );
});

test("rankings share tied positions and reject unknown metrics", () => {
  const { e } = fixture();
  const rows = e.economy.rankings("earned").rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1);
  assert.throws(() => e.economy.rankings("__proto__"), /ranking/);
});

test("Lucky seven has exactly six winning outcomes among 36 dice combinations", () => {
  const f = fixture(),
    e = f.e;
  let wins = 0;
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 6; b++) {
      let dice = [a, b];
      e.rand = () => dice.shift();
      const r = f.act("buyer", "gamble", { game: "seven", stake: 100 });
      if (r.won) wins++;
    }
  assert.equal(wins, 6);
  assert.equal(e.player("buyer").balance, 9640);
  assert.equal(e.player("buyer").earned, 10000);
});
function fixture() {
  const db = new DatabaseSync(":memory:");
  let time = Date.UTC(2026, 9, 24),
    roll = 0;
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
    () => time,
    (n) => (roll++ * 71) % n,
  );
  e.tx(() => {
    e.host("players", {
      players: [
        { id: "seller", name: "Seller" },
        { id: "buyer", name: "Buyer" },
      ],
    });
    e.host("catalog", {
      cards: Array.from({ length: 12 }, (_, i) => ({
        id: (i < 6 ? "mal-character-" : "mal-person-") + (i + 1),
        kind: i < 6 ? "character" : "seiyuu",
        name: "Card " + i,
        series: "Series",
        role: i % 2 ? "main" : "supporting",
      })),
    });
    for (const p of ["seller", "buyer"])
      e.host("grant", {
        player: p,
        amount: 10000,
        reason: "other",
        note: "Test credit",
      });
  });
  return {
    e,
    db,
    tick: (n) => (time += n),
    act: (p, a, b, key = crypto.randomUUID()) =>
      e.mutate(p + ":" + a, key, b, () => e.action(p, a, b)),
  };
}
test("starting grants are once per identity, including existing users", () => {
  const { e } = fixture();
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 11000);
  assert.equal(e.player("buyer").earned, 11000);
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 11000);
  e.tx(() =>
    e.host("reset-player", {
      player: "buyer",
      confirmation: "RESET PLAYER buyer",
    }),
  );
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 0);
});
test("catalogue counts remain accurate across metadata edits, deletes, and rolled-back imports", () => {
  const { e } = fixture();
  const original = e.catalogStore.summary();
  e.host("catalog", {
    cards: [{ id: "mal-person-100", kind: "seiyuu", name: "Actor" }],
  });
  assert.equal(e.catalogStore.summary().seiyuu, original.seiyuu + 1);
  e.host("catalog", {
    cards: [{ id: "mal-person-100", kind: "seiyuu", name: "Renamed Actor" }],
  });
  assert.equal(e.catalogStore.summary().seiyuu, original.seiyuu + 1);
  assert.throws(() =>
    e.tx(() => {
      e.host("catalog", {
        cards: [
          { id: "mal-person-101", kind: "seiyuu", name: "Actor" },
          { id: "bad", kind: "invalid", name: "Bad" },
        ],
      });
    }),
  );
  assert.equal(e.catalogStore.summary().seiyuu, original.seiyuu + 1);
  e.run("DELETE FROM catalog WHERE id='mal-person-100'");
  assert.equal(e.catalogStore.summary().seiyuu, original.seiyuu);
});
test("daily rewards give one mixed pack per KST day and can add a pack after credits were claimed", () => {
  const f = fixture(),
    e = f.e;
  let kindCalls = 0;
  const kinds = [];
  const original = e.catalogStore.draw.bind(e.catalogStore);
  e.catalogStore.draw = (kind, ...args) => {
    kinds.push(kind);
    return original(kind, ...args);
  };
  e.rand = (n) => (n === 12 ? (kindCalls++ % 2 ? 11 : 0) : 0);
  const result = f.act("buyer", "daily", {});
  assert.equal(result.cards.length, 5);
  assert.equal(e.player("buyer").balance, 10100);
  assert.ok(kinds.includes("character") && kinds.includes("seiyuu"));
  assert.equal(e.economy.daily("buyer", true), null);
  assert.throws(() => f.act("buyer", "daily", {}), /already claimed/);
  e.run("UPDATE players SET daily_pack=NULL WHERE id='buyer'");
  const catchup = f.act("buyer", "daily", {});
  assert.equal(catchup.credits, 0);
  assert.equal(catchup.cards.length, 5);
  f.tick(86400000);
  assert.equal(f.act("buyer", "daily", {}).credits, 100);
});
test("buyouts refund a third-party bidder, preserve level, and cannot pay twice", () => {
  const f = fixture(),
    e = f.e;
  e.host("players", { players: [{ id: "third", name: "Third" }] });
  e.wallet("third", 10000, "Test");
  e.addCard("seller", "mal-character-1");
  e.run("UPDATE inventory SET level=7 WHERE player='seller'");
  for (const hours of [0, 169, 1.5])
    assert.throws(
      () =>
        f.act("seller", "list-card", {
          card: "mal-character-1",
          variant: "card",
          venue: "auction",
          price: 300,
          hours,
          buyout: 900,
        }),
      /whole number/,
    );
  assert.throws(
    () =>
      f.act("seller", "list-card", {
        card: "mal-character-1",
        variant: "card",
        venue: "auction",
        price: 300,
        hours: 12,
        buyout: 299,
      }),
    /whole number/,
  );
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "auction",
    price: 300,
    hours: 12,
    buyout: 900,
  });
  const a = e.one("SELECT * FROM auctions");
  assert.equal(a.ends - a.starts, 12 * 3600000);
  f.act("buyer", "bid", { auction: a.id, amount: 400 });
  f.act("third", "buyout", { auction: a.id }, "buyout");
  f.act("third", "buyout", { auction: a.id }, "buyout");
  assert.equal(e.player("buyer").balance, 10000);
  assert.equal(e.player("seller").balance, 10900);
  assert.equal(e.player("third").balance, 9100);
  assert.equal(e.state("third").inventory[0].level, 7);
  assert.throws(
    () => f.act("buyer", "buyout", { auction: a.id }),
    /not available/,
  );
});
test("a leading bidder reaching buyout only pays the remaining difference", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("seller", "mal-character-1");
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "auction",
    price: 100,
    hours: 168,
    buyout: 700,
  });
  const id = e.one("SELECT id FROM auctions").id;
  f.act("buyer", "bid", { auction: id, amount: 200 });
  f.act("buyer", "bid", { auction: id, amount: 900 });
  assert.equal(e.player("buyer").balance, 9300);
  assert.equal(e.player("seller").balance, 10700);
  assert.equal(e.state("buyer").inventory.length, 1);
});
test("anime progress counts unique owned characters, escrow, bilingual titles and primary-series changes", () => {
  const { e } = fixture();
  e.addCard("buyer", "mal-character-1", 3);
  e.addCard("buyer", "mal-character-2");
  let p = e.economy.anime.page("buyer");
  assert.equal(p.series[0].owned, 2);
  assert.equal(p.series[0].total, 6);
  e.host("catalog", {
    cards: [
      {
        id: "mal-character-2",
        kind: "character",
        name: "Card",
        series_romaji: "New Anime",
        series_english: "English Anime",
      },
    ],
  });
  p = e.economy.anime.page("buyer");
  assert.equal(p.series.length, 2);
  assert.equal(
    p.series.find((s) => s.series_romaji === "New Anime").series_english,
    "English Anime",
  );
  e.tx(() =>
    e.action("buyer", "list-card", {
      card: "mal-character-2",
      variant: "card",
      venue: "shop",
      price: 50,
    }),
  );
  assert.equal(e.economy.anime.page("buyer").series.length, 2);
});
test("marketplace escrows a copy, transfers credits/card once, and preserves enhancement correctly", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("seller", "mal-character-1", 3);
  e.run("UPDATE inventory SET level=4 WHERE player='seller'");
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "shop",
    price: 700,
  });
  assert.equal(e.state("seller").inventory[0].level, 1);
  assert.equal(e.state("seller").inventory[0].copies, 2);
  const l = e.one("SELECT * FROM market_listings");
  assert.equal(l.level, 4);
  assert.throws(() => f.act("seller", "buy-listing", { listing: l.id }), /own/);
  f.act("buyer", "buy-listing", { listing: l.id }, "purchase");
  f.act("buyer", "buy-listing", { listing: l.id }, "purchase");
  assert.equal(e.player("buyer").balance, 9300);
  assert.equal(e.player("seller").balance, 10700);
  assert.equal(e.player("seller").earned, 10000);
  assert.equal(e.state("buyer").inventory[0].level, 4);
  assert.throws(
    () => f.act("buyer", "buy-listing", { listing: l.id }),
    /already/,
  );
});
test("listing rollback prevents overselling and cancellation returns an enhanced card", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("seller", "mal-character-1");
  e.run("UPDATE inventory SET level=5 WHERE player='seller'");
  e.tx(() => e.action("seller", "profile", { avatar: "mal-character-1" }));
  f.act("seller", "showcase", { cards: ["mal-character-1"] });
  assert.throws(
    () =>
      f.act("seller", "list-card", {
        card: "mal-character-1",
        variant: "extra",
        venue: "shop",
        price: 100,
      }),
    /extra/,
  );
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "shop",
    price: 100,
  });
  assert.equal(e.player("seller").avatar_card, null);
  assert.equal(e.profile("seller").showcase.length, 0);
  assert.equal(e.profile("seller").completion.character.owned, 1);
  assert.throws(
    () =>
      f.act("seller", "list-card", {
        card: "mal-character-1",
        variant: "card",
        venue: "shop",
        price: 100,
      }),
    /own/,
  );
  const id = e.one("SELECT id FROM market_listings").id;
  f.act("seller", "cancel-listing", { listing: id, venue: "shop" });
  assert.equal(e.state("seller").inventory[0].level, 5);
  assert.throws(
    () => f.act("seller", "cancel-listing", { listing: id, venue: "shop" }),
    /withdrawn/,
  );
});
test("user auctions enforce reserves, refund outbids, pay the seller once and deliver enhanced cards", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("seller", "mal-character-1");
  e.run("UPDATE inventory SET level=3 WHERE player='seller'");
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "auction",
    price: 500,
    days: 1,
  });
  const id = e.one("SELECT id FROM auctions").id;
  assert.throws(
    () => f.act("seller", "bid", { auction: id, amount: 500 }),
    /own/,
  );
  assert.throws(
    () => f.act("buyer", "bid", { auction: id, amount: 499 }),
    /minimum/,
  );
  f.act("buyer", "bid", { auction: id, amount: 500 });
  assert.throws(
    () => f.act("seller", "cancel-listing", { listing: id, venue: "auction" }),
    /first bid/,
  );
  f.tick(86400000);
  e.ensureAuctions();
  assert.equal(e.player("seller").balance, 10500);
  e.ensureAuctions();
  assert.equal(e.player("seller").balance, 10500);
  f.act("buyer", "claim", { auction: id });
  assert.equal(e.state("buyer").inventory[0].level, 3);
  assert.throws(() => f.act("buyer", "claim", { auction: id }), /cannot/);
  assert.equal(e.player("seller").earned, 10000);
});
test("unsold auctions return cards automatically and do not suppress community weekly lots", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("seller", "mal-character-1");
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "auction",
    price: 500,
    days: 1,
  });
  e.ensureAuctions();
  assert.equal(
    e.one("SELECT count(*) AS n FROM auctions WHERE seller IS NULL").n,
    10,
  );
  f.tick(86400000);
  e.ensureAuctions();
  assert.equal(e.state("seller").inventory.length, 1);
  assert.equal(
    e.one("SELECT paid FROM auctions WHERE seller IS NOT NULL").paid,
    1,
  );
});
test("weekly shop has ten unique per-kind slots, one shared stock and atomic affordability checks", () => {
  const f = fixture(),
    e = f.e;
  e.ensureAuctions();
  const slots = e.state("buyer").shop;
  assert.equal(slots.length, 10);
  for (const kind of ["character", "seiyuu"])
    assert.equal(
      new Set(slots.filter((s) => s.kind === kind).map((s) => s.card)).size,
      5,
    );
  const s = slots[0];
  e.run("UPDATE players SET balance=0 WHERE id='buyer'");
  assert.throws(() => f.act("buyer", "shop-buy", { slot: s.id }), /enough/);
  assert.equal(
    e.one("SELECT buyer FROM weekly_shop WHERE id=?", s.id).buyer,
    null,
  );
  f.act("seller", "shop-buy", { slot: s.id });
  assert.throws(() => f.act("buyer", "shop-buy", { slot: s.id }), /sold out/);
  f.tick(WEEK);
  e.ensureAuctions();
  assert.equal(e.state().shop.length, 10);
});
test("gambling payouts, losses and retries cannot inflate earned credits or double-pay", () => {
  const f = fixture(),
    e = f.e;
  e.rand = () => 0;
  let r = f.act(
    "buyer",
    "gamble",
    { game: "coin", choice: "heads", stake: 100 },
    "coin",
  );
  assert.equal(r.payout, 190);
  assert.equal(e.player("buyer").balance, 10090);
  f.act(
    "buyer",
    "gamble",
    { game: "coin", choice: "heads", stake: 100 },
    "coin",
  );
  assert.equal(e.player("buyer").balance, 10090);
  r = f.act("buyer", "gamble", { game: "dice", choice: "high", stake: 100 });
  assert.equal(r.payout, 0);
  assert.equal(e.player("buyer").balance, 9990);
  let rolls = [0, 5];
  e.rand = () => rolls.shift();
  r = f.act("buyer", "gamble", { game: "seven", stake: 100 });
  assert.deepEqual(r.outcome, [1, 6]);
  assert.equal(r.payout, 540);
  assert.equal(e.player("buyer").balance, 10430);
  assert.equal(e.player("buyer").earned, 10000);
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 530);
  assert.equal(e.economy.rankings("gambling_lost").rows[0].value, 100);
  assert.throws(
    () => f.act("buyer", "gamble", { game: "coin", choice: "heads", stake: 0 }),
    /whole number/,
  );
  assert.throws(
    () => f.act("buyer", "gamble", { game: "coin", choice: "bad", stake: 100 }),
    /heads/,
  );
});
test("premium packs charge the premium price and rarity acceptance favors rare cards", () => {
  const f = fixture(),
    e = f.e;
  e.rand = () => 0;
  f.act("buyer", "pack", { kind: "character", premium: true });
  assert.equal(e.player("buyer").balance, 8000);
  assert.equal(e.state("buyer").inventory[0].copies, 5);
  assert.throws(
    () => f.act("buyer", "pack", { kind: "character", premium: "true" }),
    /pack type/,
  );
  const draws = [
      { id: "common", rarity: "D" },
      { id: "rare", rarity: "AG" },
    ],
    saved = e.catalogStore.draw;
  e.catalogStore.draw = () => draws.shift();
  let rolls = [29, 29];
  e.rand = () => rolls.shift();
  assert.equal(e.economy.premiumDraw("character", 80).id, "rare");
  e.catalogStore.draw = saved;
});
test("showcase requires owned unique cards, maintains order and completion ignores duplicates", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("buyer", "mal-character-1", 3);
  e.addCard("buyer", "mal-person-7");
  assert.throws(
    () => f.act("buyer", "showcase", { cards: ["mal-character-2"] }),
    /collection/,
  );
  assert.throws(
    () =>
      f.act("buyer", "showcase", {
        cards: ["mal-character-1", "mal-character-1"],
      }),
    /different/,
  );
  f.act("buyer", "showcase", { cards: ["mal-person-7", "mal-character-1"] });
  const p = e.profile("buyer");
  assert.deepEqual(
    p.showcase.map((c) => c.card),
    ["mal-person-7", "mal-character-1"],
  );
  assert.equal(p.completion.character.owned, 1);
  assert.equal(p.completion.character.total, 6);
  assert.equal(p.completion.seiyuu.owned, 1);
});
test("seller reset refunds bidders, removes open sale inventory, and leaves catalogues intact", () => {
  const f = fixture(),
    e = f.e;
  e.addCard("seller", "mal-character-1");
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "auction",
    price: 500,
    days: 1,
  });
  const id = e.one("SELECT id FROM auctions").id;
  f.act("buyer", "bid", { auction: id, amount: 500 });
  e.tx(() =>
    e.host("reset-player", {
      player: "seller",
      confirmation: "RESET PLAYER seller",
    }),
  );
  assert.equal(e.player("buyer").balance, 10000);
  assert.equal(
    e.one("SELECT count(*) AS n FROM auctions WHERE seller IS NOT NULL").n,
    0,
  );
  assert.equal(e.catalogStore.summary().character, 6);
});
test("sheet aliases group IDs, reject ambiguity and migrate legacy admin identities without losing data", async () => {
  const f = fixture(),
    e = f.e;
  const players = sheetPlayers(
    '"Player Name","Player ID"\n"arpia97","368"\n"two_squirds","368"\n"Other","2.0"',
  );
  assert.equal(players.length, 2);
  assert.equal(players[0].aliases.length, 2);
  assert.throws(
    () => sheetPlayers("Player Name,Player ID\na,1\na,2"),
    /multiple/,
  );
  e.tx(() => {
    e.host("players", { players: [{ id: "arpia97", name: "arpia97" }] });
    e.run(
      "UPDATE players SET is_admin=1,password='test-hash',balance=123 WHERE id='arpia97'",
    );
    e.addCard("arpia97", "mal-character-1");
    e.run("INSERT INTO sessions VALUES('token','arpia97',9999999999999)");
  });
  const sync = new AliasSync(e, async function () {
    assert.equal(
      this,
      undefined,
      "Fetch must be called without a class receiver, as required by Workers",
    );
    return new Response("Player Name,Player ID\narpia97,368\ntwo_squirds,368");
  });
  await sync.step(true);
  assert.equal(sync.status().status, "synced");
  assert.equal(e.player("368").balance, 123);
  assert.equal(e.player("368").is_admin, 1);
  assert.equal(
    e.one("SELECT password FROM players WHERE id='368'").password,
    "test-hash",
  );
  assert.equal(e.profile("arpia97").id, "368");
  assert.equal(e.adminSession("token"), true);
  assert.equal(e.state("368").inventory.length, 1);
  assert.equal(e.resolvePlayer("two_squirds"), "368");
});
