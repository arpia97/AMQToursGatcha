import { MAX_CARD_LEVEL, RARITIES } from "../public/card-values.js";

export function cardTitleName(name) {
  return String(name)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse()
    .join(" ");
}
export class CardTitles {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS card_titles(player TEXT NOT NULL,card TEXT NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,at INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),PRIMARY KEY(player,card))",
    );
  }
  award(player, id) {
    const c = this.e.catalogStore.card(id);
    if (!c) throw Error("The card could not be loaded. Refresh and try again.");
    const title = cardTitleName(c.name),
      rarity = RARITIES.includes(c.rarity) ? c.rarity : "Pending";
    this.e.run(
      "INSERT OR IGNORE INTO card_titles(player,card,title,rarity,at) VALUES(?,?,?,?,?)",
      player,
      id,
      title,
      rarity,
      this.e.now(),
    );
    return title;
  }
  // One-time cosmetic catch-up for current MAX owners, including escrowed cards.
  // The marker survives gameplay resets, so old awards never reappear afterward.
  backfill() {
    if (
      this.e.one("SELECT key FROM catalog_meta WHERE key='max-card-titles-v1'")
    )
      return;
    this.e.tx(() => {
      const rows = this.e.all(
        "SELECT player,card FROM inventory WHERE level>=? UNION SELECT seller AS player,card FROM market_listings WHERE status='open' AND level>=? UNION SELECT seller AS player,card FROM auctions WHERE paid=0 AND seller IS NOT NULL AND level>=? UNION SELECT seller AS player,card FROM trade_listings WHERE status='open' AND level>=? UNION SELECT o.proposer AS player,COALESCE(c.card,o.card) AS card FROM trade_offers o LEFT JOIN trade_offer_cards c ON c.offer=o.id WHERE o.status='open' AND COALESCE(c.level,o.level)>=?",
        ...Array(5).fill(MAX_CARD_LEVEL),
      );
      const missing = [];
      for (const r of rows) {
        if (this.e.catalogStore.card(r.card)) this.award(r.player, r.card);
        else missing.push(r);
      }
      this.e.run(
        "INSERT INTO catalog_meta VALUES('max-card-titles-v1',?)",
        JSON.stringify({ at: this.e.now(), owners: rows.length, missing }),
      );
    });
  }
  options(player) {
    return this.e
      .all(
        "SELECT card,title,rarity,hidden FROM card_titles WHERE player=? ORDER BY at,card",
        player,
      )
      .map(({ hidden, ...r }) => ({ ...r, source: "card", equipped: !hidden }));
  }
}
