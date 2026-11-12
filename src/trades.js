import { fail, integer, text } from "./engine.js";
import { searchMatcher, cardSearchText } from "../public/search.js";

// Listings escrow one copy; offers escrow a bundle. All changes share one transaction.
export class Trades {
  constructor(e) {
    this.e = e;
    for (const sql of SCHEMA.split(";").filter((s) => s.trim())) e.run(sql);
  }
  listing(id) {
    const row = this.e.one(
      "SELECT * FROM trade_listings WHERE id=?",
      integer(id, 1),
    );
    if (!row) fail("This trade listing does not exist.", 404);
    return row;
  }
  open(id) {
    const row = this.listing(id);
    if (row.status !== "open") fail("This trade listing has closed.", 409);
    return row;
  }
  offer(id) {
    const row = this.e.one(
      "SELECT * FROM trade_offers WHERE id=?",
      integer(id, 1),
    );
    if (!row || row.status !== "open")
      fail("This offer is no longer available.", 409);
    return row;
  }
  take(player, b) {
    const card = text(b.card, 100),
      variant = b.variant;
    if (!this.e.catalogStore.card(card)) fail("Unknown card.");
    if (!["extra", "card"].includes(variant))
      fail("Choose a spare copy or your base card.");
    const item = this.e.one(
      "SELECT * FROM inventory WHERE player=? AND card=?",
      player,
      card,
    );
    const level = variant === "extra" ? 1 : item?.level;
    if (b.expectedLevel !== level)
      fail("This card changed. Choose it again before trading.", 409);
    return { card, level: this.e.economy.take(player, card, variant) };
  }
  offerCards(o) {
    const rows = this.e.all(
      "SELECT card,level,extra_copies FROM trade_offer_cards WHERE offer=? ORDER BY position",
      o.id,
    );
    return rows.length
      ? rows.map((r) => ({
          card: r.card,
          level: r.level,
          ...(r.extra_copies ? { extra_copies: r.extra_copies } : {}),
        }))
      : [
          {
            card: o.card,
            level: o.level,
            ...(o.extra_copies ? { extra_copies: o.extra_copies } : {}),
          },
        ];
  }
  takeBundle(player, b) {
    const rows = b.cards === undefined ? [b] : b.cards;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10)
      fail("Offer between 1 and 10 card copies.");
    const groups = new Map();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        fail("Choose valid offer cards.");
      const id = text(row.card, 100);
      if (!["extra", "card"].includes(row.variant))
        fail("Choose a spare copy or your base card.");
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
    }
    // Validate against the original inventory before consuming any copy. Extras
    // are consumed before the enhanced base so its level cannot be downgraded.
    for (const [id, copies] of groups) {
      const item = this.e.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        id,
      );
      if (!item) fail("You do not own that card.");
      if (item.protected)
        fail("This card is protected. Unprotect it before trading.", 409);
      if (
        copies.length > item.copies ||
        copies.filter((c) => c.variant === "extra").length > item.copies - 1 ||
        copies.filter((c) => c.variant === "card").length > 1
      )
        fail("There are not enough available copies for this offer.", 409);
      if (
        copies.some(
          (c) => c.expectedLevel !== (c.variant === "extra" ? 1 : item.level),
        )
      )
        fail("This card changed. Choose it again before trading.", 409);
    }
    const result = new Array(rows.length);
    for (const variant of ["extra", "card"])
      rows.forEach((row, index) => {
        if (row.variant === variant) result[index] = this.take(player, row);
      });
    return result;
  }
  returnOffer(o, status = "returned") {
    for (const c of this.offerCards(o))
      this.e.economy.acquire(o.proposer, c.card, c.level, c.extra_copies);
    this.e.run(
      "UPDATE trade_offers SET status=?,updated_at=? WHERE id=?",
      status,
      this.e.now(),
      o.id,
    );
  }
  close(l, skipPlayer = null) {
    if (l.seller !== skipPlayer)
      this.e.economy.acquire(l.seller, l.card, l.level, l.extra_copies);
    for (const o of this.e.all(
      "SELECT * FROM trade_offers WHERE listing=? AND status='open'",
      l.id,
    )) {
      if (o.proposer === skipPlayer)
        this.e.run(
          "UPDATE trade_offers SET status='cancelled',updated_at=? WHERE id=?",
          this.e.now(),
          o.id,
        );
      else this.returnOffer(o);
    }
    this.e.run(
      "UPDATE trade_listings SET status='cancelled',updated_at=? WHERE id=?",
      this.e.now(),
      l.id,
    );
  }
  resetPlayer(player) {
    for (const l of this.e.all(
      "SELECT * FROM trade_listings WHERE seller=? AND status='open'",
      player,
    ))
      this.close(l, player);
    // A reset removes that player's offers while preserving everybody else's cards.
    this.e.run(
      "UPDATE trade_offers SET status='cancelled',updated_at=? WHERE proposer=? AND status='open'",
      this.e.now(),
      player,
    );
  }
  action(player, action, b) {
    if (!action.startsWith("trade-") || action === "trade-card") return null;
    const e = this.e;
    if (action === "trade-list") {
      if (
        e.one(
          "SELECT count(*) n FROM trade_listings WHERE seller=? AND status='open'",
          player,
        ).n >= 20
      )
        fail("You can have up to 20 open trade listings.");
      const c = this.take(player, b);
      e.run(
        "INSERT INTO trade_listings(seller,card,level,created_at,updated_at) VALUES(?,?,?,?,?)",
        player,
        c.card,
        c.level,
        e.now(),
        e.now(),
      );
      return {
        message: "Card listed for trade.",
        listing: e.one("SELECT last_insert_rowid() id").id,
      };
    }
    if (action === "trade-offer") {
      const l = this.open(b.listing);
      if (l.seller === player) fail("You cannot offer on your own trade.");
      e.assertAccountUnlocked(l.seller);
      if (
        e.one(
          "SELECT id FROM trade_offers WHERE listing=? AND proposer=? AND status='open'",
          l.id,
          player,
        )
      )
        fail("Withdraw your current offer before offering another card.", 409);
      if (
        e.one(
          "SELECT count(*) n FROM trade_offers WHERE proposer=? AND status='open'",
          player,
        ).n >= 20
      )
        fail("You can have up to 20 open offers.");
      if (
        e.one(
          "SELECT count(*) n FROM trade_offers WHERE listing=? AND status='open'",
          l.id,
        ).n >= 20
      )
        fail("This listing already has 20 offers.", 409);
      const cards = this.takeBundle(player, b),
        c = cards[0];
      e.run(
        "INSERT INTO trade_offers(listing,proposer,card,level,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        l.id,
        player,
        c.card,
        c.level,
        e.now(),
        e.now(),
      );
      const offer = e.one("SELECT last_insert_rowid() id").id;
      cards.forEach((c, position) =>
        e.run(
          "INSERT INTO trade_offer_cards(offer,position,card,level) VALUES(?,?,?,?)",
          offer,
          position,
          c.card,
          c.level,
        ),
      );
      e.economy.notices.add(
        l.seller,
        "trade-offer:" + offer,
        "trade-request",
        l.card,
        l.level,
        0,
        {
          listing: l.id,
          offer,
          proposer: player,
          name: e.player(player).name,
          count: cards.length,
        },
      );
      return {
        message:
          "Trade offer sent. Your cards are held until accepted, declined or withdrawn.",
      };
    }
    if (action === "trade-cancel") {
      const l = this.open(b.listing);
      if (l.seller !== player)
        fail("Only the listing owner can cancel this trade.", 403);
      this.close(l);
      return { message: "Trade cancelled. All held cards were returned." };
    }
    if (["trade-withdraw", "trade-decline", "trade-accept"].includes(action)) {
      const o = this.offer(b.offer),
        l = this.open(o.listing);
      if (action === "trade-withdraw") {
        if (o.proposer !== player)
          fail("You can only withdraw your own offer.", 403);
        this.returnOffer(o, "withdrawn");
        return { message: "Offer withdrawn. Your card was returned." };
      }
      if (l.seller !== player)
        fail("Only the listing owner can choose an offer.", 403);
      if (action === "trade-decline") {
        this.returnOffer(o, "declined");
        return { message: "Offer declined. The offered card was returned." };
      }
      // Acceptance must also respect a locked proposer, including old offers.
      e.assertAccountUnlocked(o.proposer);
      for (const c of this.offerCards(o))
        e.economy.acquire(l.seller, c.card, c.level, c.extra_copies);
      e.economy.acquire(o.proposer, l.card, l.level, l.extra_copies);
      e.run(
        "UPDATE trade_offers SET status='accepted',updated_at=? WHERE id=?",
        e.now(),
        o.id,
      );
      for (const other of e.all(
        "SELECT * FROM trade_offers WHERE listing=? AND status='open'",
        l.id,
      ))
        this.returnOffer(other);
      e.run(
        "UPDATE trade_listings SET status='completed',accepted_offer=?,updated_at=? WHERE id=?",
        o.id,
        e.now(),
        l.id,
      );
      return {
        message: "Trade completed. All cards are now in their new collections.",
      };
    }
    fail("Unknown trade action.", 404);
  }
  page(
    player,
    {
      view = "browse",
      page = 1,
      query = "",
      wishlistOnly = false,
      hideCompleted = false,
    } = {},
  ) {
    integer(page, 1, 10000);
    if (!["browse", "listings", "offers"].includes(view))
      fail("Unknown trade view.");
    if (view !== "browse" && !player) fail("Sign in to see your trades.", 401);
    if (wishlistOnly && !player) fail("Sign in to use your wishlist.", 401);
    let where =
      view === "listings"
        ? hideCompleted
          ? "l.seller=? AND l.status='open'"
          : "l.seller=?"
        : view === "offers"
          ? hideCompleted
            ? "l.status='open' AND EXISTS(SELECT 1 FROM trade_offers mine WHERE mine.listing=l.id AND mine.proposer=? AND mine.status='open')"
            : "EXISTS(SELECT 1 FROM trade_offers mine WHERE mine.listing=l.id AND mine.proposer=?)"
          : "l.status='open'";
    const args = view === "browse" ? [] : [player];
    if (wishlistOnly) {
      where +=
        " AND EXISTS(SELECT 1 FROM card_wishlist w WHERE w.player=? AND w.card=l.card)";
      args.push(player);
    }
    query = String(query || "")
      .trim()
      .slice(0, 100);
    const select = `SELECT l.*,COALESCE(p.display_name,p.name,l.seller) seller_name,(SELECT count(*) FROM trade_offers o WHERE o.listing=l.id AND o.status='open') offer_count FROM trade_listings l LEFT JOIN players p ON p.id=l.seller WHERE ${where}`;
    let rows;
    if (!query)
      rows = this.e.all(
        `${select} ORDER BY l.id DESC LIMIT 13 OFFSET ?`,
        ...args,
        (page - 1) * 12,
      );
    else {
      // Search visible listings before pagination, resolving only their card IDs.
      // Never scan the full catalogue or expose another collector's private offers.
      const matches = searchMatcher(query),
        offset = (page - 1) * 12;
      rows = [];
      let cursor = Number.MAX_SAFE_INTEGER,
        skipped = 0;
      while (rows.length < 13) {
        const batch = this.e.all(
          `${select} AND l.id<? ORDER BY l.id DESC LIMIT 100`,
          ...args,
          cursor,
        );
        if (!batch.length) break;
        const cards = new Map(
          this.e.catalogStore
            .cards([...new Set(batch.map((l) => l.card))])
            .map((c) => [c.id, c]),
        );
        for (const l of batch) {
          const c = cards.get(l.card);
          if (!matches([c ? cardSearchText(c) : "", l.seller_name])) continue;
          if (skipped++ < offset) continue;
          rows.push(l);
          if (rows.length === 13) break;
        }
        if (batch.length < 100) break;
        cursor = batch.at(-1).id;
      }
    }
    const items = rows.slice(0, 12).map((l) => ({
      ...l,
      offers: player
        ? this.e
            .all(
              `SELECT o.*,COALESCE(p.display_name,p.name,o.proposer) proposer_name FROM trade_offers o LEFT JOIN players p ON p.id=o.proposer WHERE o.listing=? AND ${l.seller === player ? "o.status IN ('open','accepted')" : "o.proposer=?"} ORDER BY o.id DESC LIMIT 20`,
              l.id,
              ...(l.seller === player ? [] : [player]),
            )
            .map((o) => ({ ...o, cards: this.offerCards(o) }))
        : [],
    }));
    return {
      items,
      page,
      query,
      wishlistOnly,
      hideCompleted,
      hasMore: rows.length > 12,
      cards: this.e.catalogStore.cards([
        ...new Set(
          items.flatMap((l) => [
            l.card,
            ...l.offers.flatMap((o) => o.cards.map((c) => c.card)),
          ]),
        ),
      ]),
    };
  }
}
const SCHEMA = `
CREATE TABLE IF NOT EXISTS trade_listings(id INTEGER PRIMARY KEY AUTOINCREMENT,seller TEXT NOT NULL,card TEXT NOT NULL,level INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',accepted_offer INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trade_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,listing INTEGER NOT NULL,proposer TEXT NOT NULL,card TEXT NOT NULL,level INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trade_offer_cards(offer INTEGER NOT NULL,position INTEGER NOT NULL,card TEXT NOT NULL,level INTEGER NOT NULL,PRIMARY KEY(offer,position));
CREATE INDEX IF NOT EXISTS trade_browse ON trade_listings(status,id);
CREATE INDEX IF NOT EXISTS trade_seller ON trade_listings(seller,id);
CREATE INDEX IF NOT EXISTS trade_seller_open ON trade_listings(seller) WHERE status='open';
CREATE INDEX IF NOT EXISTS trade_proposer_open ON trade_offers(proposer) WHERE status='open';
CREATE INDEX IF NOT EXISTS trade_offer_listing ON trade_offers(listing,status,id);
CREATE INDEX IF NOT EXISTS trade_offer_player ON trade_offers(proposer,id);
CREATE UNIQUE INDEX IF NOT EXISTS trade_one_offer ON trade_offers(listing,proposer) WHERE status='open';
`;
