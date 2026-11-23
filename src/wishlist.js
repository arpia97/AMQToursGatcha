import { fail, integer, text } from "./engine.js";
import { collectionView, WISHLIST_SORTS, COLLECTION_SORTS } from "../public/card-display.js";
import { MAX_WISHLIST } from "../public/site-defaults.js";
import { activeFavorites, ownedCardCopies } from "./card-ownership.js";
export { MAX_WISHLIST };
export class Wishlist {
  constructor(e) {
    this.e = e;
    e.run("CREATE TABLE IF NOT EXISTS card_favorites(player TEXT NOT NULL,card TEXT NOT NULL,PRIMARY KEY(player,card))");
    e.run("CREATE INDEX IF NOT EXISTS card_favorites_card ON card_favorites(card)");
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
  sellWishlistCounts(player) {
    const rows = this.e.all(`SELECT i.card,COUNT(*) AS wanted FROM inventory i
      JOIN card_wishlist w ON w.card=i.card
      WHERE i.player=? AND i.copies>0 GROUP BY i.card`, player);
    return Object.fromEntries(rows.map(row => [row.card, row.wanted]));
  }
  favorites(player) {
    return activeFavorites(this.e,player);
  }
  setFavorite(player, b) {
    const card = text(b.card, 100);
    if (typeof b.favorite !== "boolean") fail("Choose whether to favorite this card.");
    if (b.favorite) {
      if (!this.e.one(`SELECT 1 FROM ${ownedCardCopies} WHERE player=? AND card=? AND available_at<=? LIMIT 1`,player,card,this.e.now()))
        fail("You can only favorite a card you own.",409);
      this.e.run("INSERT OR IGNORE INTO card_favorites(player,card) VALUES(?,?)", player, card);
    } else {
      this.e.run("DELETE FROM card_favorites WHERE player=? AND card=?", player, card);
    }
    return {card, favorite: b.favorite, message: b.favorite ? "Card favorited." : "Card removed from favorites."};
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
        this.read(player).length >= MAX_WISHLIST
      )
        fail(`Your wishlist can hold up to ${MAX_WISHLIST} cards.`);
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
    ) SELECT h.card,count(*) AS owned FROM held h JOIN players p ON p.id=h.player WHERE COALESCE(p.private_collection,0)=0 GROUP BY h.card`,
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
  collectors(card, view = "owned", page = 1, viewer = null, friendsOnly = false) {
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
    const scope = e.friends.filter("p.id",viewer,friendsOnly);
    const visibleOwnership = `SELECT c.player FROM (${ownership}) c JOIN players p ON p.id=c.player WHERE COALESCE(p.private_collection,0)=0${scope.sql}`;
    const ownerArgs = [card, card, card, card, e.now(), card, card];
    const counts = {
      owned: e.one(
        "SELECT count(*) AS n FROM (" + visibleOwnership + ")",
        ...ownerArgs, ...scope.args,
      ).n,
      wanted: e.one(
        "SELECT count(*) AS n FROM card_wishlist w JOIN players p ON p.id=w.player WHERE w.card=?" + scope.sql,
        card, ...scope.args,
      ).n,
    };
    const source =
      view === "owned"
        ? visibleOwnership
        : "SELECT w.player FROM card_wishlist w JOIN players p ON p.id=w.player WHERE w.card=?" + scope.sql;
    const rows = e.all(
      "SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_card,p.avatar_crop,(SELECT level FROM inventory i WHERE i.player=p.id AND i.card=p.avatar_card) AS avatar_level FROM (" +
        source +
        ") c JOIN players p ON p.id=c.player ORDER BY name COLLATE NOCASE,p.id LIMIT 26 OFFSET ?",
      ...(view === "owned" ? ownerArgs : [card]), ...scope.args,
      (page - 1) * 25,
    );
    return {
      card,
      rarity: catalogCard.rarity || "Pending",
      view,
      page,
      counts,
      friendsOnly,
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
    const owner = e.player(id);
    integer(page, 1, 10000);
    if (options.favoritesOnly && !options.viewer)
      fail("Sign in to filter by favorites.", 401);
    const favoriteIds = options.favoritesOnly && view !== "listings"
      ? new Set(this.favorites(options.viewer)) : null;
    let rows, total, wishlistKind, ownershipHidden;
    if (view === "wishlist") {
      const ownershipVisible = !owner.private_collection || options.viewer === id;
      ownershipHidden = !ownershipVisible;
      const ownership = options.excludeOwned ? "unowned" : options.ownership;
      const filterOwnership = ownership === "owned" || ownership === "unowned";
      if (ownership === "owned" && !options.viewer) fail("Sign in to filter by the cards you own.", 401);
      if (ownership === "unowned" && !ownershipVisible) fail("This collection is private.", 403);
      const ownershipColumn = ownershipVisible ? "COALESCE(i.protected,0)" : "NULL";
      const ownershipJoin = ownershipVisible
        ? "LEFT JOIN inventory i ON i.player=w.player AND i.card=w.card"
        : "";
      wishlistKind = ["both", "character", "seiyuu"].includes(options.kind)
        ? options.kind
        : "both";
      const sort = WISHLIST_SORTS.includes(options.sort)
        ? options.sort : "custom";
      const query=String(options.query||"").slice(0,100), rarity=String(options.rarity||""), role=wishlistKind==="character"?String(options.role||""):"";
      if (wishlistKind === "both" && sort === "custom" && !query.trim() && !rarity && !role && !filterOwnership && !favoriteIds) {
        rows = e.all(
          `SELECT w.card,w.created,${ownershipColumn} AS protected FROM card_wishlist w ${ownershipJoin} WHERE w.player=? ORDER BY w.position IS NULL,w.position,w.created DESC,w.card LIMIT 25 OFFSET ?`,
          id, (page - 1) * 24,
        );
        total = e.one("SELECT count(*) AS n FROM card_wishlist WHERE player=?", id).n;
      } else {
        let allWish = e.all(
          `SELECT w.card,w.created,w.position,${ownershipColumn} AS protected FROM card_wishlist w ${ownershipJoin} WHERE w.player=?`, id,
        );
        if (favoriteIds) allWish = allWish.filter(w => favoriteIds.has(w.card));
        if (filterOwnership) {
          const collectionPlayer = ownership === "owned" ? options.viewer : id;
          const owned = new Set(e.all(
            `SELECT DISTINCT card FROM ${ownedCardCopies} WHERE player=? AND available_at<=?`,
            collectionPlayer, e.now(),
          ).map(r => r.card));
          allWish = allWish.filter(w => owned.has(w.card) === (ownership === "owned"));
        }
        const cardMap = new Map(e.catalogStore.cards(allWish.map((w) => w.card)).map((c) => [c.id, c]));
        const sorted = collectionView(allWish.map((w) => ({ ...w, acquired_at: w.created })),
          (cid) => cardMap.get(cid), { kind: wishlistKind, sort, query, strict: options.strict, rarity, role });
        total = sorted.length;
        rows = sorted.slice((page - 1) * 24, page * 24 + 1)
          .map(({ c, acquired_at, position, ...w }) => w);
      }
    } else if (view === "collection" || view === "favorites") {
      if (owner.private_collection && options.viewer !== id) {
        return {
          player: id,
          view,
          page: 1,
          total: 0,
          hasMore: false,
          hidden: true,
          rows: [],
          cards: [],
        };
      }
      const kind = ["both", "character", "seiyuu"].includes(options.kind)
          ? options.kind
          : "both",
        query = String(options.query || "").slice(0, 100),
        rarity = String(options.rarity || ""),
        role = kind === "character" ? String(options.role || "") : "",
        sort = COLLECTION_SORTS.includes(options.sort)
          ? options.sort
          : "custom";
      let allRows = view === "favorites" ? e.all(`SELECT h.card,MAX(h.level) AS level,SUM(h.copies) AS copies,
        MAX(h.protected) AS protected,MAX(h.for_trade) AS for_trade,MIN(NULLIF(h.acquired_at,0)) AS acquired_at,MIN(h.position) AS position
        FROM card_favorites f JOIN ${ownedCardCopies} h ON h.player=f.player AND h.card=f.card
        WHERE f.player=? AND h.available_at<=? GROUP BY h.card`,id,e.now()) : this.readCollection(id);
      if (favoriteIds) allRows = allRows.filter(row => favoriteIds.has(row.card));
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
      if (options.tradeable) {
        allRows = owner.account_locked ? [] : allRows.filter((r) => !!r.for_trade || !r.protected);
      }
      const sourceRows =
        view === "collection" && kind === "both" && !query.trim() && !rarity && !role && sort === "custom"
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
                strict: options.strict,
                rarity,
                role,
                sort,
              });
            })();
      total = sourceRows.length;
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
    else fail("Choose collection, favorites, wishlist or listings.");
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
      ...(wishlistKind !== undefined ? { kind: wishlistKind, ownershipHidden } : {}),
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
