import { fail, integer, text } from "./engine.js";
import { collectionView } from "../public/card-display.js";
export class Wishlist {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS card_wishlist(player TEXT NOT NULL,card TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(player,card))",
    );
    if (
      !e
        .all("PRAGMA table_info(card_wishlist)")
        .some((c) => c.name === "position")
    )
      e.run("ALTER TABLE card_wishlist ADD COLUMN position INTEGER");
    e.run(
      "CREATE INDEX IF NOT EXISTS wishlist_card_players ON card_wishlist(card,player)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS inventory_card_players ON inventory(card,player)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS wishlist_order ON card_wishlist(player,created DESC,card)",
    );
  }
  read(player) {
    return this.e
      .all(
        "SELECT card FROM card_wishlist WHERE player=? ORDER BY position IS NULL,position,created DESC,card",
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
        "INSERT OR IGNORE INTO card_wishlist(player,card,created,position) VALUES(?,?,?,?)",
        player,
        card,
        e.now(),
        (e.one(
          "SELECT min(position) AS first FROM card_wishlist WHERE player=?",
          player,
        )?.first ?? 0) - 1,
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
  reorder(player, b) {
    const current = this.read(player);
    if (
      !Array.isArray(b.cards) ||
      !Array.isArray(b.expectedCards) ||
      b.cards.length !== current.length ||
      new Set(b.cards).size !== current.length ||
      b.cards.some((id) => !current.includes(id))
    )
      fail("Arrange the cards already on your wishlist.");
    if (JSON.stringify(current) !== JSON.stringify(b.expectedCards))
      fail(
        "Your wishlist changed. Close this window and reopen it before arranging again.",
        409,
      );
    b.cards.forEach((card, position) =>
      this.e.run(
        "UPDATE card_wishlist SET position=? WHERE player=? AND card=?",
        position,
        player,
        card,
      ),
    );
    return { message: "Wishlist order saved.", wishlist: this.read(player) };
  }
  readCollection(player) {
    return this.e.all(
      "SELECT card,level,copies,COALESCE(protected,0) AS protected,COALESCE(for_trade,0) AS for_trade,acquired_at,position FROM inventory WHERE player=? AND copies>0 ORDER BY position IS NULL,position,acquired_at DESC,card",
      player,
    );
  }
  reorderCollection(player, b) {
    const rows = this.readCollection(player),
      current = rows.map((r) => r.card);
    if (
      !Array.isArray(b.cards) ||
      !Array.isArray(b.expectedCards) ||
      b.cards.length !== current.length ||
      new Set(b.cards).size !== current.length ||
      b.cards.some((id) => !current.includes(id))
    )
      fail("Arrange the cards already in your collection.");
    if (JSON.stringify(current) !== JSON.stringify(b.expectedCards))
      fail(
        "Your collection changed. Close this window and reopen it before arranging again.",
        409,
      );
    b.cards.forEach((card, position) =>
      this.e.run(
        "UPDATE inventory SET position=? WHERE player=? AND card=?",
        position,
        player,
        card,
      ),
    );
    return {
      message: "Collection order saved.",
      inventory: this.readCollection(player),
    };
  }
  withCounts(cards) {
    if (!cards.length) return cards;
    const e = this.e,
      ids = JSON.stringify([...new Set(cards.map((c) => c.id))]);
    // Bind the page once as JSON. Each nested compound SELECT stays below the
    // Workers five-term limit; duplicate ownership across escrow counts once.
    const owners = e.all(
      `WITH requested AS (SELECT value AS card FROM json_each(?)), held AS (
      SELECT card,player FROM (
        SELECT card,player FROM inventory WHERE card IN (SELECT card FROM requested) AND copies>0
        UNION SELECT card,seller FROM market_listings WHERE card IN (SELECT card FROM requested) AND status='open'
        UNION SELECT card,seller FROM auctions WHERE card IN (SELECT card FROM requested) AND seller IS NOT NULL AND paid=0
        UNION SELECT card,winner FROM auctions WHERE card IN (SELECT card FROM requested) AND winner IS NOT NULL AND ends<=? AND claimed=0
        UNION SELECT card,seller FROM trade_listings WHERE card IN (SELECT card FROM requested) AND status='open'
      ) UNION SELECT c.card,o.proposer FROM trade_offer_cards c JOIN trade_offers o ON o.id=c.offer WHERE c.card IN (SELECT card FROM requested) AND o.status='open'
      UNION SELECT o.card,o.proposer FROM trade_offers o WHERE o.card IN (SELECT card FROM requested) AND o.status='open' AND NOT EXISTS(SELECT 1 FROM trade_offer_cards c WHERE c.offer=o.id)
    ) SELECT card,count(*) AS owned FROM held GROUP BY card`,
      ids,
      e.now(),
    );
    const wanted = e.all(
      "SELECT card,count(*) AS wanted FROM card_wishlist WHERE card IN (SELECT value FROM json_each(?)) GROUP BY card",
      ids,
    );
    const ownedBy = new Map(owners.map((r) => [r.card, r.owned])),
      wantedBy = new Map(wanted.map((r) => [r.card, r.wanted]));
    return cards.map((c) => ({
      ...c,
      collectors: {
        owned: ownedBy.get(c.id) || 0,
        wanted: wantedBy.get(c.id) || 0,
      },
    }));
  }
  collectors(card, view = "owned", page = 1) {
    const e = this.e;
    card = text(card, 100);
    integer(page, 1, 10000);
    const catalogCard = e.catalogStore.card(card);
    if (!catalogCard) fail("Unknown card.", 404);
    if (!["owned", "wanted"].includes(view))
      fail("Choose owners or wishlist collectors.");
    // Cloudflare limits each compound SELECT to five terms. Nest the first
    // group so held trade offers and unclaimed wins can both be included.
    const ownership = `SELECT player FROM (SELECT player FROM inventory WHERE card=? AND copies>0
      UNION SELECT seller FROM market_listings WHERE card=? AND status='open'
      UNION SELECT seller FROM auctions WHERE card=? AND seller IS NOT NULL AND paid=0
      UNION SELECT winner FROM auctions WHERE card=? AND winner IS NOT NULL AND ends<=? AND claimed=0
      UNION SELECT seller FROM trade_listings WHERE card=? AND status='open')
      UNION SELECT o.proposer FROM trade_offers o LEFT JOIN trade_offer_cards c ON c.offer=o.id WHERE COALESCE(c.card,o.card)=? AND o.status='open'`;
    const ownerArgs = [card, card, card, card, e.now(), card, card];
    const counts = {
      owned: e.one(
        "SELECT count(*) AS n FROM (" + ownership + ")",
        ...ownerArgs,
      ).n,
      wanted: e.one(
        "SELECT count(*) AS n FROM card_wishlist WHERE card=?",
        card,
      ).n,
    };
    const source =
      view === "owned"
        ? ownership
        : "SELECT player FROM card_wishlist WHERE card=?";
    const rows = e.all(
      "SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_card,p.avatar_crop,(SELECT level FROM inventory i WHERE i.player=p.id AND i.card=p.avatar_card) AS avatar_level FROM (" +
        source +
        ") c JOIN players p ON p.id=c.player ORDER BY name COLLATE NOCASE,p.id LIMIT 26 OFFSET ?",
      ...(view === "owned" ? ownerArgs : [card]),
      (page - 1) * 25,
    );
    return {
      card,
      rarity: catalogCard.rarity || "Pending",
      view,
      page,
      counts,
      rows: rows.slice(0, 25),
      hasMore: rows.length > 25,
      cards: e.catalogStore.cards(
        rows
          .slice(0, 25)
          .map((p) => p.avatar_card)
          .filter(Boolean),
      ),
    };
  }
  page(id, view, page = 1, options = {}) {
    const e = this.e;
    id = e.resolvePlayer(text(id, 100));
    e.player(id);
    integer(page, 1, 10000);
    let rows, total;
    if (view === "wishlist")
      rows = e.all(
        "SELECT w.card,w.created,COALESCE(i.protected,0) AS protected FROM card_wishlist w LEFT JOIN inventory i ON i.player=w.player AND i.card=w.card WHERE w.player=? ORDER BY w.position IS NULL,w.position,w.created DESC,w.card LIMIT 25 OFFSET ?",
        id,
        (page - 1) * 24,
      );
    else if (view === "collection") {
      const kind = ["both", "character", "seiyuu"].includes(options.kind)
          ? options.kind
          : "both",
        query = String(options.query || "").slice(0, 100),
        rarity = String(options.rarity || ""),
        role = kind === "character" ? String(options.role || "") : "",
        sort = [
          "custom",
          "collected",
          "rarity",
          "level",
          "copies",
          "name",
          "name-desc",
          "role",
        ].includes(options.sort)
          ? options.sort
          : "custom";
      let allRows = this.readCollection(id);
      if (options.wishlist && options.viewer) {
        const wanted = new Set(
          e
            .all(
              "SELECT card FROM card_wishlist WHERE player=?",
              options.viewer,
            )
            .map((r) => r.card),
        );
        allRows = allRows.filter((r) => wanted.has(r.card));
      }
      total = allRows.length;
      const sourceRows =
        kind === "both" && !query.trim() && !rarity && !role && sort === "custom"
          ? allRows
          : (() => {
              const byId = new Map(
                e.catalogStore
                  .cards(allRows.map((r) => r.card))
                  .map((c) => [c.id, c]),
              );
              return collectionView(allRows, (cid) => byId.get(cid), {
                kind,
                query,
                rarity,
                role,
                sort,
              });
            })();
      rows = sourceRows
        .slice((page - 1) * 24, page * 24 + 1)
        .map((row) => ({
          card: row.card,
          level: row.level,
          copies: row.copies,
          protected: row.protected,
          for_trade: row.for_trade,
        }));
    } else if (view === "listings")
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
    else fail("Choose collection, wishlist or listings.");
    const visible = rows.slice(0, 24);
    const wanted =
      view === "wishlist"
        ? new Set(visible.map((r) => r.card))
        : new Set(
            visible.length
              ? e
                  .all(
                    "SELECT card FROM card_wishlist WHERE player=? AND card IN (" +
                      visible.map(() => "?").join(",") +
                      ")",
                    id,
                    ...visible.map((r) => r.card),
                  )
                  .map((r) => r.card)
              : [],
          );
    return {
      player: id,
      view,
      page,
      ...(total !== undefined ? { total } : {}),
      hasMore: rows.length > 24,
      rows: visible.map((row) => ({
        ...row,
        wishlisted: wanted.has(row.card),
      })),
      cards: e.catalogStore.cards(visible.map((r) => r.card)),
    };
  }
}
