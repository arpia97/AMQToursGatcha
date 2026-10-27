import { DAILY_CREDITS, MAX_SPOTLIGHTS } from "../public/site-defaults.js";
import { fail, integer, text, WEEK } from "./engine.js";
import { AnimeCollection } from "./collection.js";
import { premiumPool, drawPremium } from "../public/pack-odds.js";
import { SHOP_PRICES, instantSalePrice } from "../public/card-values.js";
import { Fusion } from "./fusion.js";
import { Mahjong } from "./mahjong.js";
import { GemFaceting } from "./gem.js";
import { CardManagement } from "./card-management.js";
export { PREMIUM_RULE } from "../public/pack-odds.js";
export { SHOP_PRICES } from "../public/card-values.js";
const MONDAY = Date.UTC(2026, 0, 5);
export class Economy {
  constructor(e) {
    this.e = e;
    for (const sql of SCHEMA.split(";").filter((s) => s.trim())) e.run(sql);
    for (const [column, definition] of [
      ["seller", "TEXT"],
      ["level", "INTEGER NOT NULL DEFAULT 1"],
      ["reserve", "INTEGER NOT NULL DEFAULT 1"],
      ["paid", "INTEGER NOT NULL DEFAULT 0"],
      ["buyout", "INTEGER"],
      ["notified", "INTEGER NOT NULL DEFAULT 0"],
    ])
      if (!e.all("PRAGMA table_info(auctions)").some((c) => c.name === column))
        e.run(`ALTER TABLE auctions ADD COLUMN ${column} ${definition}`);
    e.run(
      "INSERT OR IGNORE INTO settings VALUES('premium_character_price',1000),('premium_seiyuu_price',1000),('premium_price_revision',0)",
    );
    if (
      e.one("SELECT value FROM settings WHERE key='premium_price_revision'")
        .value < 1
    )
      e.tx(() => {
        e.run(
          "UPDATE settings SET value=1000 WHERE key IN ('premium_character_price','premium_seiyuu_price')",
        );
        e.run("UPDATE settings SET value=1 WHERE key='premium_price_revision'");
      });
    e.run("CREATE INDEX IF NOT EXISTS auctions_due ON auctions(closed,ends)");
    e.run(
      "CREATE INDEX IF NOT EXISTS user_auctions_due ON auctions(ends) WHERE seller IS NOT NULL AND paid=0",
    );
    for (const [name, definition] of [
      ["starter_granted", "INTEGER NOT NULL DEFAULT 0"],
      ["starter_amount", "INTEGER NOT NULL DEFAULT 0"],
      ["daily_pack", "TEXT"],
    ])
      if (!e.all("PRAGMA table_info(players)").some((c) => c.name === name))
        e.run(`ALTER TABLE players ADD COLUMN ${name} ${definition}`);
    e.run(
      "CREATE INDEX IF NOT EXISTS starter_pending ON players(starter_granted)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS starter_amount_pending ON players(starter_amount) WHERE starter_amount<5000",
    );
    this.anime = new AnimeCollection(e);
    this.fusion = new Fusion(e);
    this.mahjong = new Mahjong(e);
    this.gem = new GemFaceting(e);
    this.cards = new CardManagement(e);
  }
  fundStarters() {
    for (const p of this.e.all(
      "SELECT id,starter_granted,starter_amount FROM players WHERE starter_amount<5000",
    )) {
      // Old funded identities received 1,000 before the amount marker existed.
      const received = p.starter_amount || (p.starter_granted ? 1000 : 0);
      this.e.wallet(
        p.id,
        5000 - received,
        p.starter_granted ? "Starting credits adjustment" : "Starting credits",
        true,
      );
      this.e.run(
        "UPDATE players SET starter_granted=1,starter_amount=5000 WHERE id=?",
        p.id,
      );
    }
  }
  daily(player, automatic = false) {
    const e = this.e,
      day = new Date(e.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (e.player(player).daily === day) {
      if (automatic) return null;
      fail(
        "You already claimed today’s credits. Come back after midnight KST.",
        409,
      );
    }
    e.wallet(player, DAILY_CREDITS, "Daily login", true);
    e.run("UPDATE players SET daily=? WHERE id=?", day, player);
    return {
      message: `${DAILY_CREDITS} daily credits added.`,
      credits: DAILY_CREDITS,
      cards: [],
    };
  }
  dailyPack(player) {
    const e = this.e,
      day = new Date(e.now() + 9 * 3600000).toISOString().slice(0, 10);
    const p = e.one("SELECT daily,daily_pack FROM players WHERE id=?", player);
    const summary = e.catalogStore.summary(),
      total = summary.character + summary.seiyuu;
    if (p.daily_pack === day)
      fail(
        "You already claimed today’s card pack. Come back after midnight KST.",
        409,
      );
    if (!total)
      fail(
        "The daily pack will be available when the catalogue has cards.",
        409,
      );
    const cards = [];
    if (p.daily_pack !== day && total > 0) {
      const contexts = { character: {}, seiyuu: {} };
      for (let i = 0; i < 5; i++) {
        const kind = e.rand(total) < summary.character ? "character" : "seiyuu";
        cards.push(
          e.catalogStore.draw(kind, e.rand, 100, new Set(), contexts[kind]),
        );
      }
      for (const c of cards) e.addCard(player, c.id);
      e.run("UPDATE players SET daily_pack=? WHERE id=?", day, player);
    }
    return {
      message: "Your daily five-card pack is here!",
      credits: 0,
      cards,
    };
  }
  buyout(player, id) {
    const e = this.e,
      a = e.one("SELECT * FROM auctions WHERE id=?", integer(id, 1));
    if (!a?.seller || !a.buyout || a.closed || a.ends <= e.now() || a.paid)
      fail("This auction is not available for buyout.", 409);
    if (a.seller === player) fail("You cannot buy your own auction.");
    e.wallet(
      player,
      -(a.buyout - (a.winner === player ? a.bid : 0)),
      "Auction buyout: " + a.card,
    );
    if (a.winner && a.winner !== player)
      e.wallet(a.winner, a.bid, "Buyout: auction bid refund");
    e.wallet(a.seller, a.buyout, "Player auction sale: " + a.card);
    this.acquire(player, a.card, a.level);
    e.run(
      "UPDATE auctions SET bid=?,winner=?,ends=?,closed=1,paid=1,claimed=1 WHERE id=?",
      a.buyout,
      player,
      e.now(),
      a.id,
    );
    return {
      message: "Auction bought out. Card added to your collection.",
      cards: [e.catalogStore.card(a.card)],
      level: a.level,
    };
  }
  acquire(player, card, level = 1) {
    this.e.run(
      "INSERT INTO inventory(player,card,copies,level,acquired_at) VALUES(?,?,1,?,?) ON CONFLICT(player,card) DO UPDATE SET copies=copies+1,level=max(level,excluded.level)",
      player,
      card,
      level,
      this.e.now(),
    );
  }
  take(player, id, variant) {
    const e = this.e,
      item = e.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        id,
      );
    if (!item) fail("You do not own that card.");
    if (item.protected)
      fail(
        "This card is protected. Unprotect it before selling, listing or fusion.",
        409,
      );
    if (!["extra", "card"].includes(variant))
      fail("Choose an extra copy or the enhanced card.");
    if (variant === "extra") {
      if (item.copies < 2) fail("No extra copy is available.");
      e.run(
        "UPDATE inventory SET copies=copies-1 WHERE player=? AND card=?",
        player,
        id,
      );
      return 1;
    }
    if (item.copies > 1)
      e.run(
        "UPDATE inventory SET copies=copies-1,level=1 WHERE player=? AND card=?",
        player,
        id,
      );
    else {
      e.run("DELETE FROM inventory WHERE player=? AND card=?", player, id);
      e.run(
        "UPDATE players SET avatar_card=NULL WHERE id=? AND avatar_card=?",
        player,
        id,
      );
      e.run(
        "DELETE FROM profile_showcase WHERE player=? AND card=?",
        player,
        id,
      );
    }
    return item.level;
  }
  tick(start = MONDAY + Math.floor((this.e.now() - MONDAY) / WEEK) * WEEK) {
    const e = this.e,
      now = e.now();
    for (const a of e.all(
      "SELECT * FROM auctions WHERE seller IS NOT NULL AND ends<=? AND paid=0",
      now,
    )) {
      if (a.winner) {
        e.wallet(a.seller, a.bid, "Player auction sale: " + a.card);
        e.run("UPDATE auctions SET paid=1,closed=1 WHERE id=?", a.id);
      } else {
        this.acquire(a.seller, a.card, a.level);
        e.run("UPDATE auctions SET paid=1,closed=1,claimed=1 WHERE id=?", a.id);
      }
    }
    if (!e.one("SELECT id FROM weekly_shop WHERE starts=? LIMIT 1", start))
      this.seedShop(start, start + WEEK);
    else this.refillShop(start, start + WEEK);
    return (
      e.one(
        "SELECT min(ends) AS ends FROM auctions WHERE seller IS NOT NULL AND ends>? AND paid=0",
        now,
      )?.ends || Infinity
    );
  }
  seedShop(start, ends) {
    const e = this.e,
      summary = e.catalogStore.summary(),
      total = summary.character + summary.seiyuu;
    if (total < 10) return;
    const chosen = { character: new Set(), seiyuu: new Set() },
      contexts = { character: {}, seiyuu: {} };
    for (let i = 0; i < 10; i++) {
      const availableCharacters = summary.character - chosen.character.size;
      const kind =
        e.rand(total - i) < availableCharacters ? "character" : "seiyuu";
      const c = e.catalogStore.draw(
        kind,
        e.rand,
        100,
        chosen[kind],
        contexts[kind],
      );
      chosen[kind].add(c.id);
      e.run(
        "INSERT INTO weekly_shop(card,kind,price,starts,ends) VALUES(?,?,?,?,?)",
        c.id,
        kind,
        SHOP_PRICES[c.rarity || "Pending"],
        start,
        ends,
      );
    }
  }
  refillShop(start, ends, avoid = null) {
    const e = this.e;
    const current = e.all(
      "SELECT card FROM weekly_shop WHERE ends>? AND buyer IS NULL ORDER BY id LIMIT 10",
      e.now(),
    );
    const summary = e.catalogStore.summary();
    if (current.length >= 10 || summary.total < 10) return;
    const excluded = new Set(current.map((s) => s.card));
    const chosen = { character: new Set(), seiyuu: new Set() },
      contexts = { character: {}, seiyuu: {} };
    const cards = e.catalogStore.cards([...excluded, avoid]);
    for (const c of cards)
      if (c.active !== 0 && excluded.has(c.id)) chosen[c.kind].add(c.id);
    const skipped = cards.find((c) => c.id === avoid && c.active !== 0);
    while (excluded.size < 10) {
      const blocked = {
        character: new Set(chosen.character),
        seiyuu: new Set(chosen.seiyuu),
      };
      const remaining =
        summary.total - blocked.character.size - blocked.seiyuu.size;
      if (skipped && remaining > 1) blocked[skipped.kind].add(avoid);
      const characters = summary.character - blocked.character.size,
        total = characters + summary.seiyuu - blocked.seiyuu.size;
      if (!total) break;
      const kind = e.rand(total) < characters ? "character" : "seiyuu";
      const c = e.catalogStore.draw(
        kind,
        e.rand,
        100,
        blocked[kind],
        contexts[kind],
      );
      e.run(
        "INSERT INTO weekly_shop(card,kind,price,starts,ends) VALUES(?,?,?,?,?)",
        c.id,
        c.kind,
        SHOP_PRICES[c.rarity || "Pending"],
        start,
        ends,
      );
      excluded.add(c.id);
      chosen[c.kind].add(c.id);
    }
  }
  refreshAuctions() {
    const e = this.e,
      now = e.now(),
      start = MONDAY + Math.floor((now - MONDAY) / WEEK) * WEEK;
    const before = e.catalogStore.summary();
    if (before.character < 5 || before.seiyuu < 5)
      fail(
        "At least five cards of each type are needed to refresh the selections.",
        409,
      );
    const lots = e.all(
      "SELECT * FROM auctions WHERE seller IS NULL AND ends>? AND closed=0",
      now,
    );
    let refunded = 0;
    for (const a of lots) {
      if (a.winner && a.bid) {
        e.wallet(a.winner, a.bid, "Weekly selection refresh: auction refund");
        refunded += a.bid;
      }
      e.run(
        "UPDATE auctions SET closed=1,claimed=1,ends=? WHERE id=?",
        now,
        a.id,
      );
    }
    e.seedCommunityAuctions(start);
    return {
      message:
        "Community auctions refreshed. Active community bids refunded; shop, player listings and owned cards preserved.",
      refunded,
      auctionIds: e
        .all(
          "SELECT id FROM auctions WHERE seller IS NULL AND closed=0 AND ends>? ORDER BY id",
          now,
        )
        .map((x) => x.id),
      shopIds: e
        .all("SELECT id FROM weekly_shop WHERE ends>? ORDER BY id", now)
        .map((x) => x.id),
    };
  }
  refreshWeekly() {
    const result = this.refreshAuctions(),
      e = this.e,
      now = e.now();
    const start = MONDAY + Math.floor((now - MONDAY) / WEEK) * WEEK;
    e.run("UPDATE weekly_shop SET ends=? WHERE ends>?", now, now);
    this.seedShop(start, start + WEEK);
    return {
      ...result,
      message:
        "Weekly community auctions and shop refreshed. Active community bids refunded; player listings and owned cards preserved.",
      shopIds: e
        .all("SELECT id FROM weekly_shop WHERE ends>? ORDER BY id", now)
        .map((x) => x.id),
    };
  }
  premiumDraw(kind, context = {}) {
    context.pool ||= premiumPool(this.e.catalogStore.pool(kind).cards);
    return drawPremium(context.pool, this.e.rand);
  }
  action(player, action, b) {
    const e = this.e,
      now = e.now();
    const managed = this.cards.action(player, action, b);
    if (managed) return managed;
    const gem = this.gem.action(player, action, b);
    if (gem) return gem;
    const mahjong = this.mahjong.action(player, action, b);
    if (mahjong) return mahjong;
    if (action === "auction-notice") {
      const a = e.one(
        "SELECT * FROM auctions WHERE id=?",
        integer(b.auction, 1),
      );
      if (!a || a.winner !== player || a.ends > now || a.claimed)
        fail("This auction win is not available.", 409);
      e.run("UPDATE auctions SET notified=1 WHERE id=?", a.id);
      return { message: "Auction win notification seen." };
    }
    if (action === "fusion") return this.fusion.fuse(player, b);
    if (action === "sell-instant") {
      const id = text(b.card, 100),
        c = e.catalogStore.card(id);
      if (!c) fail("Unknown card.");
      const item = e.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        id,
      );
      if (!item) fail("You do not own that card.");
      const variant = b.variant || "extra";
      if (!["extra", "card"].includes(variant))
        fail("Choose an extra copy or your enhanced card.");
      const level = variant === "extra" ? 1 : item.level;
      const price = instantSalePrice(c, level);
      if (
        b.expectedPrice !== price ||
        b.expectedRarity !== (c.rarity || "Pending") ||
        b.expectedLevel !== level
      )
        fail(
          "This card’s rarity, level or sale value changed. Refresh and review the new price.",
          409,
        );
      this.take(player, id, variant);
      e.wallet(
        player,
        price,
        "Instant card sale: " + c.name + " · Lv. " + level,
      );
      return {
        message: "Card sold for " + price.toLocaleString("en-US") + " credits.",
        price,
        card: id,
        level,
      };
    }
    if (action === "daily-pack") return this.dailyPack(player);
    if (action === "pin-anime") return this.anime.pin(player, b);
    if (action === "buyout") return this.buyout(player, b.auction);
    if (action === "showcase") {
      if (
        !Array.isArray(b.cards) ||
        b.cards.length > MAX_SPOTLIGHTS ||
        new Set(b.cards).size !== b.cards.length
      )
        fail("Choose up to 20 different owned cards.");
      for (const id of b.cards)
        if (
          !e.one(
            "SELECT card FROM inventory WHERE player=? AND card=?",
            player,
            text(id, 100),
          )
        )
          fail("Showcase cards must be in your collection.");
      e.run("DELETE FROM profile_showcase WHERE player=?", player);
      b.cards.forEach((id, i) =>
        e.run("INSERT INTO profile_showcase VALUES(?,?,?)", player, id, i),
      );
      return { message: "Profile showcase updated." };
    }
    if (action === "list-card") {
      const venue = b.venue;
      if (!["auction", "shop"].includes(venue))
        fail("Choose Auction or Marketplace.");
      const active = e.one(
        "SELECT (SELECT count(*) FROM market_listings WHERE seller=? AND status='open')+(SELECT count(*) FROM auctions WHERE seller=? AND paid=0) AS n",
        player,
        player,
      ).n;
      if (active >= 20) fail("You can have up to 20 open listings.");
      const id = text(b.card, 100),
        c = e.catalogStore.card(id);
      if (!c) fail("Unknown card.");
      const price = integer(b.price, 1, 1000000);
      const hours = b.hours ?? (b.days ?? 3) * 24;
      if (venue === "auction") integer(hours, 1, 168);
      const buyout =
        venue !== "auction" || b.buyout == null || b.buyout === ""
          ? null
          : integer(b.buyout, price, 1000000);
      const level = this.take(player, id, b.variant || "extra");
      if (venue === "shop")
        e.run(
          "INSERT INTO market_listings(seller,card,kind,level,price,created) VALUES(?,?,?,?,?,?)",
          player,
          id,
          c.kind,
          level,
          price,
          now,
        );
      else
        e.run(
          "INSERT INTO auctions(card,kind,starts,ends,seller,level,reserve,buyout) VALUES(?,?,?,?,?,?,?,?)",
          id,
          c.kind,
          now,
          now + hours * 3600000,
          player,
          level,
          price,
          buyout,
        );
      return {
        message:
          venue === "shop"
            ? "Card listed in the User Marketplace."
            : "Card listed in User Auctions.",
      };
    }
    if (action === "cancel-listing") {
      const id = integer(b.listing, 1);
      if (b.venue === "shop") {
        const l = e.one(
          "SELECT * FROM market_listings WHERE id=? AND seller=? AND status='open'",
          id,
          player,
        );
        if (!l) fail("This listing cannot be withdrawn.", 409);
        this.acquire(player, l.card, l.level);
        e.run("UPDATE market_listings SET status='cancelled' WHERE id=?", id);
      } else if (b.venue === "auction") {
        const a = e.one(
          "SELECT * FROM auctions WHERE id=? AND seller=? AND ends>? AND paid=0",
          id,
          player,
          now,
        );
        if (!a || a.winner)
          fail("An auction can only be withdrawn before its first bid.", 409);
        this.acquire(player, a.card, a.level);
        e.run(
          "UPDATE auctions SET closed=1,claimed=1,paid=1,ends=? WHERE id=?",
          now,
          id,
        );
      } else fail("Unknown listing type.");
      return {
        message: "Listing withdrawn. Card returned to your collection.",
      };
    }
    if (action === "buy-listing") {
      const l = e.one(
        "SELECT * FROM market_listings WHERE id=? AND status='open'",
        integer(b.listing, 1),
      );
      if (!l) fail("This card has already sold or been withdrawn.", 409);
      if (l.seller === player) fail("You cannot buy your own listing.");
      e.wallet(player, -l.price, "Marketplace purchase: " + l.card);
      e.wallet(l.seller, l.price, "Marketplace sale: " + l.card);
      this.acquire(player, l.card, l.level);
      e.run(
        "UPDATE market_listings SET status='sold',buyer=?,sold_at=? WHERE id=?",
        player,
        now,
        l.id,
      );
      return {
        message: "Card purchased and added to your collection.",
        cards: [e.catalogStore.card(l.card)],
        level: l.level,
      };
    }
    if (action === "shop-buy") {
      const s = e.one(
        "SELECT * FROM weekly_shop WHERE id=? AND ends>? AND buyer IS NULL",
        integer(b.slot, 1),
        now,
      );
      if (!s) fail("This weekly card is sold out or expired.", 409);
      e.wallet(player, -s.price, "Weekly shop: " + s.card);
      this.acquire(player, s.card);
      e.run("UPDATE weekly_shop SET buyer=? WHERE id=?", player, s.id);
      this.refillShop(s.starts, s.ends, s.card);
      return {
        message: "Weekly shop card added to your collection.",
        cards: [e.catalogStore.card(s.card)],
        level: 1,
      };
    }
    if (action === "gamble") {
      if (b.game !== "coin")
        fail("This game has been retired. Visit Pachinko instead.", 410);
      const stake = integer(b.stake, 1, 1000000);
      if (!["heads", "tails"].includes(b.choice))
        fail("Choose heads or tails.");
      e.wallet(player, -stake, "Coin flip: bet");
      const outcome = e.rand(2) === 0 ? "heads" : "tails",
        won = outcome === b.choice,
        payout = won ? Math.floor(stake * 1.75) : 0;
      if (payout) e.wallet(player, payout, "Coin flip: win");
      e.run(
        "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'coin',?,?,?,?,?)",
        player,
        stake,
        payout,
        payout - stake,
        JSON.stringify(outcome),
        now,
      );
      return {
        message: won
          ? "You won " +
            payout.toLocaleString("en-US") +
            " credits (including your bet)."
          : "The coin landed " + outcome + ". No payout.",
        game: "coin",
        outcome,
        won,
        stake,
        payout,
        net: payout - stake,
      };
    }
    return null;
  }
  market(venue = "shop", kind = "character", page = 1) {
    integer(page, 1, 10000);
    if (
      !["shop", "auction"].includes(venue) ||
      !["character", "seiyuu"].includes(kind)
    )
      fail("Unknown marketplace filter.");
    const e = this.e,
      rows =
        venue === "shop"
          ? e.all(
              "SELECT l.*,COALESCE(p.display_name,p.name) AS seller_name FROM market_listings l JOIN players p ON p.id=l.seller WHERE l.status='open' AND l.kind=? ORDER BY l.id DESC LIMIT 41 OFFSET ?",
              kind,
              (page - 1) * 40,
            )
          : e.all(
              "SELECT a.*,COALESCE(p.display_name,p.name) AS seller_name,COALESCE(w.display_name,w.name) AS winner_name FROM auctions a JOIN players p ON p.id=a.seller LEFT JOIN players w ON w.id=a.winner WHERE a.closed=0 AND a.ends>? AND a.kind=? ORDER BY a.id DESC LIMIT 41 OFFSET ?",
              e.now(),
              kind,
              (page - 1) * 40,
            );
    const items = rows.slice(0, 40);
    return {
      items,
      page,
      hasMore: rows.length > 40,
      cards: e.catalogStore.cards([...new Set(items.map((i) => i.card))]),
    };
  }
  rankings(metric = "earned", page = 1) {
    integer(page, 1, 10000);
    if (
      !["earned", "balance", "gambling_won", "gambling_lost"].includes(metric)
    )
      fail("Unknown ranking.");
    const expression = {
      earned: "p.earned",
      balance: "p.balance",
      gambling_won: "COALESCE(g.net,0)",
      gambling_lost: "COALESCE(g.net,0)",
    }[metric];
    const gambling = metric.startsWith("gambling_");
    const direction = metric === "gambling_lost" ? "ASC" : "DESC";
    const rows = this.e.all(
      `SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_card,p.earned,p.balance,${expression} AS value,RANK() OVER (ORDER BY ${expression} ${direction}) AS rank,COALESCE(g.net,0) AS gambling_net FROM players p LEFT JOIN (SELECT player,sum(payout-stake) AS net,count(*) AS rounds FROM gambling_rounds WHERE stake>0 AND game!='mahjong-reverted' GROUP BY player) g ON g.player=p.id WHERE ${gambling ? "g.rounds>0" : expression + ">0"} ORDER BY value ${direction},p.id LIMIT 51 OFFSET ?`,
      (page - 1) * 50,
    );
    return { metric, page, rows: rows.slice(0, 50), hasMore: rows.length > 50 };
  }
  completion(player) {
    const e = this.e,
      rows = e.all(
        "SELECT card FROM inventory WHERE player=? UNION SELECT card FROM market_listings WHERE seller=? AND status='open' UNION SELECT card FROM auctions WHERE seller=? AND paid=0",
        player,
        player,
        player,
      );
    const counts = { character: 0, seiyuu: 0 };
    const localKinds = new Map();
    for (let i = 0; i < rows.length; i += 80) {
      const ids = rows.slice(i, i + 80).map((r) => r.card);
      for (const c of e.all(
        `SELECT id,kind FROM catalog WHERE id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      ))
        localKinds.set(c.id, c.kind);
    }
    for (const { card } of rows) {
      const kind =
        localKinds.get(card) ||
        (card.startsWith("mal-person-") ? "seiyuu" : "character");
      counts[kind]++;
    }
    const summary = e.catalogStore.summary(),
      out = {};
    for (const kind of ["character", "seiyuu"])
      out[kind] = {
        owned: counts[kind],
        total: summary[kind],
        percent: summary[kind]
          ? Math.min(100, (counts[kind] * 100) / summary[kind])
          : 0,
      };
    return out;
  }
  resetPlayer(player) {
    const e = this.e;
    for (const a of e.all(
      "SELECT * FROM auctions WHERE seller=? AND paid=0",
      player,
    )) {
      if (a.winner && a.winner !== player)
        e.wallet(a.winner, a.bid, "Seller reset: auction refund");
      e.run("DELETE FROM auctions WHERE id=?", a.id);
    }
    e.run(
      "UPDATE market_listings SET status='cancelled' WHERE seller=? AND status='open'",
      player,
    );
    e.run("DELETE FROM gambling_rounds WHERE player=?", player);
    e.run("DELETE FROM mahjong_games WHERE player=?", player);
    e.run("DELETE FROM gem_games WHERE player=?", player);
    e.run("DELETE FROM profile_showcase WHERE player=?", player);
    e.run("DELETE FROM profile_anime WHERE player=?", player);
  }
}
const SCHEMA = `
CREATE TABLE IF NOT EXISTS market_listings(id INTEGER PRIMARY KEY AUTOINCREMENT,seller TEXT NOT NULL,card TEXT NOT NULL,kind TEXT NOT NULL,level INTEGER NOT NULL,price INTEGER NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',buyer TEXT,sold_at INTEGER);
CREATE INDEX IF NOT EXISTS listings_open ON market_listings(status,kind,id);
CREATE INDEX IF NOT EXISTS listings_seller ON market_listings(seller,status);
CREATE TABLE IF NOT EXISTS weekly_shop(id INTEGER PRIMARY KEY AUTOINCREMENT,card TEXT NOT NULL,kind TEXT NOT NULL,price INTEGER NOT NULL,starts INTEGER NOT NULL,ends INTEGER NOT NULL,buyer TEXT);
CREATE INDEX IF NOT EXISTS shop_week ON weekly_shop(starts,kind);
CREATE INDEX IF NOT EXISTS shop_open ON weekly_shop(ends,id) WHERE buyer IS NULL;
CREATE TABLE IF NOT EXISTS gambling_rounds(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,game TEXT NOT NULL,stake INTEGER NOT NULL,payout INTEGER NOT NULL,net INTEGER NOT NULL,outcome TEXT NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS gambling_player ON gambling_rounds(player,id);
CREATE TABLE IF NOT EXISTS profile_showcase(player TEXT NOT NULL,card TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(player,card));
`;
