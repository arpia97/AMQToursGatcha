import { fail, integer, text } from "./engine.js";
export class Wishlist {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS card_wishlist(player TEXT NOT NULL,card TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(player,card))",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS wishlist_order ON card_wishlist(player,created DESC,card)",
    );
  }
  read(player) {
    return this.e
      .all(
        "SELECT card FROM card_wishlist WHERE player=? ORDER BY created DESC,card",
        player,
      )
      .map((r) => r.card);
  }
  change(player, b) {
    const e = this.e,
      card = text(b.card, 100);
    if (typeof b.wanted !== "boolean")
      fail("Choose whether to save this card.");
    if (b.wanted) {
      if (!e.catalogStore.card(card)) fail("Unknown card.");
      if (
        !e.one(
          "SELECT card FROM card_wishlist WHERE player=? AND card=?",
          player,
          card,
        ) &&
        this.read(player).length >= 500
      )
        fail("Your wishlist can hold up to 500 cards.");
      e.run(
        "INSERT OR IGNORE INTO card_wishlist VALUES(?,?,?)",
        player,
        card,
        e.now(),
      );
    } else
      e.run(
        "DELETE FROM card_wishlist WHERE player=? AND card=?",
        player,
        card,
      );
    return {
      message: b.wanted
        ? "Card saved to wishlist."
        : "Card removed from wishlist.",
      wishlist: this.read(player),
    };
  }
  page(id, view, page = 1) {
    const e = this.e;
    id = e.resolvePlayer(text(id, 100));
    e.player(id);
    integer(page, 1, 10000);
    let rows;
    if (view === "wishlist")
      rows = e.all(
        "SELECT card,created FROM card_wishlist WHERE player=? ORDER BY created DESC,card LIMIT 25 OFFSET ?",
        id,
        (page - 1) * 24,
      );
    else if (view === "listings")
      rows = e.all(
        `SELECT * FROM (
 SELECT id,card,level,extra_copies,price,'sale' AS venue,created AS at FROM market_listings WHERE seller=? AND status='open'
 UNION ALL SELECT id,card,level,extra_copies,CASE WHEN bid>0 THEN bid ELSE reserve END AS price,'auction' AS venue,ends AS at FROM auctions WHERE seller=? AND closed=0 AND paid=0 AND ends>?
 UNION ALL SELECT id,card,level,extra_copies,NULL AS price,'trade' AS venue,created_at AS at FROM trade_listings WHERE seller=? AND status='open'
 ) ORDER BY at DESC,venue,id DESC LIMIT 25 OFFSET ?`,
        id,
        id,
        e.now(),
        id,
        (page - 1) * 24,
      );
    else fail("Choose wishlist or listings.");
    const visible = rows.slice(0, 24);
    return {
      player: id,
      view,
      page,
      hasMore: rows.length > 24,
      rows: visible,
      cards: e.catalogStore.cards(visible.map((r) => r.card)),
    };
  }
}
