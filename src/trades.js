import { fail, integer, text } from "./engine.js";

// Both sides escrow one physical copy. Actions run in Engine.mutate's transaction.
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
  returnOffer(o, status = "returned") {
    this.e.economy.acquire(o.proposer, o.card, o.level);
    this.e.run(
      "UPDATE trade_offers SET status=?,updated_at=? WHERE id=?",
      status,
      this.e.now(),
      o.id,
    );
  }
  close(l, skipPlayer = null) {
    if (l.seller !== skipPlayer)
      this.e.economy.acquire(l.seller, l.card, l.level);
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
    if (!action.startsWith("trade-")) return null;
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
      const c = this.take(player, b);
      e.run(
        "INSERT INTO trade_offers(listing,proposer,card,level,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        l.id,
        player,
        c.card,
        c.level,
        e.now(),
        e.now(),
      );
      return {
        message:
          "Trade offer sent. Your card is held until accepted, declined or withdrawn.",
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
      e.economy.acquire(l.seller, o.card, o.level);
      e.economy.acquire(o.proposer, l.card, l.level);
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
        message:
          "Trade completed. Both cards are now in their new collections.",
      };
    }
    fail("Unknown trade action.", 404);
  }
  page(player, { view = "browse", page = 1 } = {}) {
    integer(page, 1, 10000);
    if (!["browse", "listings", "offers"].includes(view))
      fail("Unknown trade view.");
    if (view !== "browse" && !player) fail("Sign in to see your trades.", 401);
    const where =
      view === "listings"
        ? "l.seller=?"
        : view === "offers"
          ? "EXISTS(SELECT 1 FROM trade_offers mine WHERE mine.listing=l.id AND mine.proposer=?)"
          : "l.status='open'";
    const args = view === "browse" ? [] : [player];
    const rows = this.e.all(
      `SELECT l.*,COALESCE(p.display_name,p.name,l.seller) seller_name,(SELECT count(*) FROM trade_offers o WHERE o.listing=l.id AND o.status='open') offer_count FROM trade_listings l LEFT JOIN players p ON p.id=l.seller WHERE ${where} ORDER BY l.id DESC LIMIT 13 OFFSET ?`,
      ...args,
      (page - 1) * 12,
    );
    const items = rows
      .slice(0, 12)
      .map((l) => ({
        ...l,
        offers: player
          ? this.e.all(
              `SELECT o.*,COALESCE(p.display_name,p.name,o.proposer) proposer_name FROM trade_offers o LEFT JOIN players p ON p.id=o.proposer WHERE o.listing=? AND ${l.seller === player ? "o.status IN ('open','accepted')" : "o.proposer=?"} ORDER BY o.id DESC LIMIT 20`,
              l.id,
              ...(l.seller === player ? [] : [player]),
            )
          : [],
      }));
    return {
      items,
      page,
      hasMore: rows.length > 12,
      cards: this.e.catalogStore.cards([
        ...new Set(
          items.flatMap((l) => [l.card, ...l.offers.map((o) => o.card)]),
        ),
      ]),
    };
  }
}
const SCHEMA = `
CREATE TABLE IF NOT EXISTS trade_listings(id INTEGER PRIMARY KEY AUTOINCREMENT,seller TEXT NOT NULL,card TEXT NOT NULL,level INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',accepted_offer INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trade_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,listing INTEGER NOT NULL,proposer TEXT NOT NULL,card TEXT NOT NULL,level INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS trade_browse ON trade_listings(status,id);
CREATE INDEX IF NOT EXISTS trade_seller ON trade_listings(seller,id);
CREATE INDEX IF NOT EXISTS trade_seller_open ON trade_listings(seller) WHERE status='open';
CREATE INDEX IF NOT EXISTS trade_proposer_open ON trade_offers(proposer) WHERE status='open';
CREATE INDEX IF NOT EXISTS trade_offer_listing ON trade_offers(listing,status,id);
CREATE INDEX IF NOT EXISTS trade_offer_player ON trade_offers(proposer,id);
CREATE UNIQUE INDEX IF NOT EXISTS trade_one_offer ON trade_offers(listing,proposer) WHERE status='open';
`;
