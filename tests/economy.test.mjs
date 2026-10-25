import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SHOP_PRICES } from "../src/economy.js";
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

test("collectors paginate without omission and alias searches retain a matching total", () => {
  const { e } = fixture();
  e.host("players", {
    players: Array.from({ length: 121 }, (_, i) => ({
      id: "p" + i,
      name: "Player " + i,
      aliases: ["alias-" + i],
    })),
  });
  const pages = [1, 2, 3].map((p) => e.profilesPage("", p));
  assert.deepEqual(
    pages.map((p) => p.profiles.length),
    [50, 50, 23],
  );
  assert.equal(
    new Set(pages.flatMap((p) => p.profiles.map((x) => x.id))).size,
    123,
  );
  assert.deepEqual(
    pages.map((p) => p.hasMore),
    [true, true, false],
  );
  assert.ok(pages.every((p) => p.total === 123));
  assert.equal(e.profilesPage("alias-120").profiles[0].id, "p120");
  assert.equal(e.profilesPage("alias-120").total, 1);
  assert.throws(() => e.profilesPage("", 0), /whole number/);
});
test("global sorted catalogue pages include bulk cards, preserve filters, and invalidate on source changes", () => {
  const { e } = fixture();
  e.catalogStore.tenrai.upsert([
    {
      id: "mal-character-999",
      kind: "character",
      name: "Zebra",
      role: "supporting",
      series: "Bulk",
    },
    {
      id: "mal-character-2000",
      kind: "character",
      name: "Aardvark",
      role: "main",
      series: "Bulk",
    },
  ]);
  const page = (sort, p = 1, extra = {}) =>
    e.catalogStore.page("character", "", p, 2, { sort, ...extra });
  assert.equal(page("name").cards[0].name, "Aardvark");
  assert.equal(page("name-desc").cards[0].name, "Zebra");
  assert.equal(page("name").total, 8);
  const all = [1, 2, 3, 4].flatMap((p) => page("name", p).cards);
  assert.equal(new Set(all.map((c) => c.id)).size, 8);
  e.catalogStore.popularity.sync("character", [
    ["mal-character-999", 1000],
    ["mal-character-2000", 0],
  ]);
  assert.equal(page("rarity").cards[0].id, "mal-character-999");
  assert.equal(page("favorites").cards[0].id, "mal-character-999");
  assert.equal(page("newest").cards[0].id, "mal-character-2000");
  assert.ok(
    page("role", 1, { role: "main" }).cards.every((c) => c.role === "main"),
  );
  e.host("catalog", {
    cards: [
      {
        id: "mal-character-2000",
        kind: "character",
        name: "ZZZ override",
        role: "main",
      },
    ],
  });
  assert.equal(page("name-desc").cards[0].name, "ZZZ override");
  assert.throws(() => page("__proto__"), /sort/);
  assert.throws(
    () => e.catalogStore.page("seiyuu", "", 1, 40, { sort: "role" }),
    /sort/,
  );
});
test("anime pins track unowned series, escrow progress, public profiles, limits, and reset scopes", () => {
  const f = fixture(),
    { e } = f;
  e.host("catalog", {
    cards: Array.from({ length: 14 }, (_, i) => ({
      id: "mal-character-" + (3000 + i),
      kind: "character",
      name: "New " + i,
      series: "Anime " + i,
      series_english: "English " + i,
    })),
  });
  assert.equal(
    e.economy.anime.search("English 0", "seller").series[0].owned,
    0,
  );
  const pin = (key, pinned = true) =>
    f.act("seller", "pin-anime", { series: key, pinned });
  pin("anime 0");
  pin("anime 0");
  assert.equal(e.profile("seller").pinnedAnime.length, 1);
  assert.equal(e.profile("seller").pinnedAnime[0].owned, 0);
  e.addCard("seller", "mal-character-3000");
  assert.equal(e.profile("seller").pinnedAnime[0].owned, 1);
  f.act("seller", "list-card", {
    card: "mal-character-3000",
    variant: "card",
    venue: "shop",
    price: 20,
  });
  assert.equal(e.profile("seller").pinnedAnime[0].owned, 1);
  f.act("buyer", "buy-listing", { listing: e.economy.market().items[0].id });
  assert.equal(e.profile("seller").pinnedAnime[0].owned, 0);
  for (let i = 1; i < 12; i++) pin("anime " + i);
  assert.throws(() => pin("anime 12"), /12 anime/);
  assert.throws(() => pin("not imported"), /catalogue/);
  pin("anime 0", false);
  pin("anime 12");
  assert.equal(e.economy.anime.page("seller").pinned.length, 12);
  assert.equal(e.profile("buyer").pinnedAnime.length, 0);
  e.host("reset-player", {
    player: "seller",
    confirmation: "RESET PLAYER seller",
  });
  assert.equal(e.profile("seller").pinnedAnime.length, 0);
  assert.ok(e.economy.anime.search("English 0").series.length);
});
test("collection dates preserve first ownership across duplicate pulls and stamp transfers", () => {
  const f = fixture(),
    { e } = f;
  e.addCard("seller", "mal-character-1");
  const first = e.profile("seller").inventory[0].acquired_at;
  f.tick(10000);
  e.addCard("seller", "mal-character-1");
  assert.equal(e.profile("seller").inventory[0].acquired_at, first);
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "extra",
    venue: "shop",
    price: 10,
  });
  const id = e.economy.market().items[0].id;
  assert.equal(e.state("seller").myListings[0].id, id);
  f.act("buyer", "buy-listing", { listing: id });
  assert.equal(e.profile("buyer").inventory[0].acquired_at, first + 10000);
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

test("net gambling rankings include losses, gains and zero, reverse direction, ties and global pagination", () => {
  const { e } = fixture();
  e.host("players", {
    players: Array.from({ length: 55 }, (_, i) => ({
      id: "g" + i,
      name: "Gambler " + i,
    })),
  });
  for (let i = 0; i < 55; i++)
    e.run(
      "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'coin',100,?,?, '{}',0)",
      "g" + i,
      i * 10,
      i * 10 - 100,
    );
  const best = e.economy.rankings("gambling_won"),
    worst = e.economy.rankings("gambling_lost");
  assert.equal(best.rows[0].id, "g54");
  assert.equal(best.rows[0].value, 440);
  assert.equal(worst.rows[0].id, "g0");
  assert.equal(worst.rows[0].value, -100);
  assert.ok(best.hasMore && worst.hasMore);
  assert.equal(e.economy.rankings("gambling_won", 2).rows.length, 5);
  assert.equal(e.economy.rankings("gambling_won", 2).rows[0].rank, 51);
  assert.ok(best.rows.some((p) => p.value === 0));
  assert.ok(worst.rows.some((p) => p.value === 0));
  assert.ok(!best.rows.some((p) => p.id === "seller"));
  e.run("DELETE FROM gambling_rounds");
  for (const [id, stake, payout] of [
    ["g0", 100, 0],
    ["g1", 50, 0],
    ["g2", 50, 0],
  ])
    e.run(
      "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'coin',?,?,?,'{}',0)",
      id,
      stake,
      payout,
      payout - stake,
    );
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, -50);
  assert.deepEqual(
    e.economy.rankings("gambling_won").rows.map((p) => p.rank),
    [1, 1, 3],
  );
  assert.equal(e.economy.rankings("gambling_lost").rows[0].value, -100);
  e.run("UPDATE gambling_rounds SET payout=stake*3,net=stake*2");
  assert.equal(e.economy.rankings("gambling_lost").rows[0].value, 100);
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 200);
});

test("anime progress prioritizes pins and sorts by percentage globally before pagination", () => {
  const { e } = fixture();
  const cards = [];
  for (let anime = 1; anime <= 30; anime++)
    for (let i = 0; i < anime; i++)
      cards.push({
        id: `pct-${anime}-${i}`,
        kind: "character",
        name: `Card ${anime}-${i}`,
        series: `Anime ${String(anime).padStart(2, "0")}`,
      });
  e.host("catalog", { cards });
  for (let anime = 1; anime <= 30; anime++)
    e.addCard("seller", `pct-${anime}-0`);
  e.economy.anime.pin("seller", { series: "anime 30", pinned: true });
  const first = e.economy.anime.page("seller"),
    second = e.economy.anime.page("seller", 2);
  assert.equal(first.series[0].series_key, "anime 30");
  assert.equal(first.series[1].series_key, "anime 01");
  assert.equal(first.series[2].series_key, "anime 02");
  assert.equal(first.series.length, 24);
  assert.equal(second.series.length, 6);
  const rest = [...first.series.slice(1), ...second.series];
  assert.ok(
    rest.every(
      (s, i) =>
        !i || rest[i - 1].owned / rest[i - 1].total >= s.owned / s.total,
    ),
  );
  assert.equal(
    new Set([...first.series, ...second.series].map((s) => s.series_key)).size,
    30,
  );
  e.economy.anime.pin("seller", { series: "anime 01", pinned: true });
  assert.equal(e.economy.anime.pinned("seller")[0].series_key, "anime 01");
});
test("starting grants are once per identity, including existing users", () => {
  const { e } = fixture();
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 15000);
  assert.equal(e.player("buyer").earned, 15000);
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 15000);
  e.tx(() =>
    e.host("reset-player", {
      player: "buyer",
      confirmation: "RESET PLAYER buyer",
    }),
  );
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 0);
});
test("starter upgrade tops up the old grant once and survives restart, alias sync and reset", () => {
  const { e } = fixture();
  e.run(
    "UPDATE players SET balance=42,earned=1000,starter_granted=1 WHERE id='buyer'",
  );
  e.tx(() => e.economy.fundStarters());
  assert.equal(e.player("buyer").balance, 4042);
  assert.equal(e.player("buyer").earned, 5000);
  assert.equal(
    e.one("SELECT starter_amount FROM players WHERE id='buyer'").starter_amount,
    5000,
  );
  const restarted = new Engine(e.db, e.transaction, e.now, e.rand);
  restarted.tx(() => restarted.economy.fundStarters());
  assert.equal(restarted.player("buyer").balance, 4042);
  restarted.host("players", {
    players: [{ id: "buyer", name: "Renamed", aliases: ["newalias"] }],
  });
  restarted.tx(() => restarted.economy.fundStarters());
  assert.equal(restarted.player("buyer").balance, 4042);
  restarted.host("reset-player", {
    player: "buyer",
    confirmation: "RESET PLAYER buyer",
  });
  restarted.tx(() => restarted.economy.fundStarters());
  assert.equal(restarted.player("buyer").balance, 0);
});
test("premium prices migrate to 1000 once while later host edits survive restarts", () => {
  const { e } = fixture();
  e.run(
    "UPDATE settings SET value=2000 WHERE key IN ('premium_character_price','premium_seiyuu_price')",
  );
  e.run("UPDATE settings SET value=0 WHERE key='premium_price_revision'");
  const migrated = new Engine(e.db, e.transaction, e.now, e.rand);
  for (const kind of ["character", "seiyuu"])
    assert.equal(
      migrated.one(
        "SELECT value FROM settings WHERE key=?",
        `premium_${kind}_price`,
      ).value,
      1000,
    );
  migrated.run(
    "UPDATE settings SET value=777 WHERE key='premium_character_price'",
  );
  const restarted = new Engine(e.db, e.transaction, e.now, e.rand);
  assert.equal(
    restarted.one(
      "SELECT value FROM settings WHERE key='premium_character_price'",
    ).value,
    777,
  );
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
test("daily credits and manually claimed mixed packs are independent and once per KST day", () => {
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
  assert.equal(result.cards.length, 0);
  assert.equal(e.all("SELECT * FROM inventory WHERE player='buyer'").length, 0);
  assert.equal(e.player("buyer").balance, 10100);
  assert.equal(e.economy.daily("buyer", true), null);
  assert.throws(() => f.act("buyer", "daily", {}), /already claimed/);
  const catchup = f.act("buyer", "daily-pack", {}, "daily-key");
  assert.equal(catchup.credits, 0);
  assert.equal(catchup.cards.length, 5);
  assert.ok(kinds.includes("character") && kinds.includes("seiyuu"));
  assert.deepEqual(f.act("buyer", "daily-pack", {}, "daily-key"), catchup);
  assert.throws(() => f.act("buyer", "daily-pack", {}), /already claimed/);
  assert.equal(e.player("buyer").balance, 10100);
  f.tick(86400000);
  assert.equal(f.act("buyer", "daily-pack", {}).cards.length, 5);
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
test("weekly shop has ten unique mixed-pool slots, one shared stock and atomic affordability checks", () => {
  const f = fixture(),
    e = f.e;
  e.ensureAuctions();
  const slots = e.state("buyer").shop;
  assert.equal(slots.length, 10);
  assert.equal(new Set(slots.map((s) => s.card)).size, 10);
  assert.equal(slots.filter((s) => s.kind === "character").length, 4);
  assert.equal(slots.filter((s) => s.kind === "seiyuu").length, 6);
  assert.deepEqual(
    ["D", "C", "B", "A", "S", "SS", "SSS", "Ubers", "AG"].map(
      (r) => SHOP_PRICES[r],
    ),
    [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600],
  );
  const s = slots[0];
  e.run("UPDATE players SET balance=0 WHERE id='buyer'");
  assert.throws(() => f.act("buyer", "shop-buy", { slot: s.id }), /enough/);
  assert.equal(
    e.one("SELECT buyer FROM weekly_shop WHERE id=?", s.id).buyer,
    null,
  );
  f.act("seller", "shop-buy", { slot: s.id });
  const refilled = e.state().shop;
  assert.equal(refilled.length, 10);
  assert.equal(new Set(refilled.map((x) => x.card)).size, 10);
  const replacement = refilled.find((x) => !slots.some((y) => y.id === x.id));
  assert.ok(replacement);
  assert.notEqual(replacement.card, s.card);
  assert.equal(replacement.ends, s.ends);
  assert.equal(
    replacement.price,
    SHOP_PRICES[e.catalogStore.card(replacement.card).rarity || "Pending"],
  );
  assert.throws(() => f.act("buyer", "shop-buy", { slot: s.id }), /sold out/);
  f.tick(WEEK);
  e.ensureAuctions();
  assert.equal(e.state().shop.length, 10);
});
test("shop refill is atomic, idempotent, preserves other slots and repairs old sold gaps", () => {
  const f = fixture(),
    { e } = f;
  e.ensureAuctions();
  const before = e.state().shop,
    slot = before[0],
    balance = e.player("buyer").balance;
  const body = { slot: slot.id };
  const result = f.act("buyer", "shop-buy", body, "refill-once");
  assert.deepEqual(f.act("buyer", "shop-buy", body, "refill-once"), result);
  const after = e.state().shop;
  assert.equal(after.length, 10);
  assert.equal(e.player("buyer").balance, balance - slot.price);
  assert.deepEqual(
    after.filter((x) => before.slice(1).some((y) => y.id === x.id)),
    before.slice(1),
  );
  assert.equal(e.one("SELECT count(*) AS n FROM weekly_shop").n, 11);
  assert.equal(
    e.one("SELECT buyer FROM weekly_shop WHERE id=?", slot.id).buyer,
    "buyer",
  );
  e.run("UPDATE weekly_shop SET buyer='seller' WHERE id=?", after[0].id);
  e.ensureAuctions();
  assert.equal(e.state().shop.length, 10);
  assert.equal(e.one("SELECT count(*) AS n FROM weekly_shop").n, 12);
});
test("weekly selection refresh refunds community bids once and preserves owned cards and user listings", () => {
  const f = fixture(),
    { e } = f;
  e.ensureAuctions();
  const oldShop = e.state().shop.map((s) => s.id),
    oldLots = e
      .state()
      .auctions.filter((a) => !a.seller)
      .map((a) => a.id);
  f.act("buyer", "bid", { auction: oldLots[0], amount: 200 });
  e.addCard("seller", "mal-character-1", 2);
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "extra",
    venue: "auction",
    price: 10,
    hours: 5,
  });
  f.act("seller", "list-card", {
    card: "mal-character-1",
    variant: "card",
    venue: "shop",
    price: 25,
  });
  const bought = oldShop[0];
  f.act("buyer", "shop-buy", { slot: bought });
  const inventory = e.state("buyer").inventory,
    balance = e.player("buyer").balance,
    earned = e.player("buyer").earned;
  const b = { confirmation: "REFRESH WEEKLY SELECTIONS" },
    key = "weekly-reset";
  assert.throws(
    () => e.tx(() => e.host("refresh-weekly", {})),
    /REFRESH WEEKLY/,
  );
  const refresh = () =>
    e.mutate("host:host/refresh-weekly", key, b, () =>
      e.host("refresh-weekly", b),
    );
  const r = refresh();
  assert.equal(r.refunded, 200);
  assert.deepEqual(refresh(), r);
  assert.equal(e.player("buyer").balance, balance + 200);
  assert.equal(e.player("buyer").earned, earned);
  assert.deepEqual(e.state("buyer").inventory, inventory);
  assert.equal(r.auctionIds.length, 10);
  assert.equal(r.shopIds.length, 10);
  assert.ok(r.auctionIds.every((id) => !oldLots.includes(id)));
  assert.ok(r.shopIds.every((id) => !oldShop.includes(id)));
  assert.equal(e.economy.market("auction").items.length, 1);
  assert.equal(e.economy.market("shop").items.length, 1);
  e.ensureAuctions();
  assert.equal(e.state().shop.length, 10);
  assert.equal(
    e.one(
      "SELECT count(*) AS n FROM auctions WHERE seller IS NULL AND closed=0",
    ).n,
    10,
  );
  assert.throws(
    () => f.act("buyer", "claim", { auction: oldLots[0] }),
    /cannot/,
  );
});
test("an impossible premium boost rolls back the price and inventory", () => {
  const f = fixture(),
    { e } = f,
    before = e.player("buyer").balance;
  const saved = e.catalogStore.pool;
  e.catalogStore.pool = () => ({ cards: [{ id: "a", rarity: "AG" }] });
  assert.throws(
    () => f.act("buyer", "pack", { kind: "character", premium: true }),
    /not enough D/,
  );
  assert.equal(e.player("buyer").balance, before);
  assert.equal(e.state("buyer").inventory.length, 0);
  e.catalogStore.pool = saved;
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
  assert.equal(e.economy.rankings("gambling_won").rows[0].value, 430);
  assert.equal(e.economy.rankings("gambling_lost").rows[0].value, 430);
  assert.throws(
    () => f.act("buyer", "gamble", { game: "coin", choice: "heads", stake: 0 }),
    /whole number/,
  );
  assert.throws(
    () => f.act("buyer", "gamble", { game: "coin", choice: "bad", stake: 100 }),
    /heads/,
  );
});
test("premium packs charge the premium price and validate the chosen pack type", () => {
  const f = fixture(),
    e = f.e;
  e.rand = () => 0;
  f.act("buyer", "pack", { kind: "character", premium: true });
  assert.equal(e.player("buyer").balance, 9000);
  assert.equal(e.state("buyer").inventory[0].copies, 5);
  assert.throws(
    () => f.act("buyer", "pack", { kind: "character", premium: "true" }),
    /pack type/,
  );
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
