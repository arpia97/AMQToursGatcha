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
    // Retain the original table as migration evidence; new awards have their own IDs.
    e.run(
      "CREATE TABLE IF NOT EXISTS card_titles(player TEXT NOT NULL,card TEXT NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,at INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),PRIMARY KEY(player,card))",
    );
    e.run(
      "CREATE TABLE IF NOT EXISTS card_title_awards(player TEXT NOT NULL,award TEXT NOT NULL,card TEXT NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,at INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),PRIMARY KEY(player,award))",
    );
    this.migrate();
  }
  migrate() {
    const e = this.e;
    if (e.one("SELECT key FROM catalog_meta WHERE key='card-title-awards-v2'"))
      return;
    e.tx(() => {
      const old = e.all("SELECT * FROM card_titles ORDER BY player,at,card"),
        histories = new Map();
      let recovered = 0;
      for (const t of old) {
        this.insert(
          t.player,
          t.card,
          t.title,
          t.rarity,
          t.at,
          t.hidden,
          "legacy:" + t.card,
        );
        if (!histories.has(t.player)) {
          histories.set(
            t.player,
            e
              .all(
                "SELECT key,input,result,at FROM receipts WHERE scope=? AND at>=? ORDER BY at,key",
                t.player + ":enhance",
                t.at,
              )
              .flatMap((r) => {
                try {
                  const input = JSON.parse(r.input),
                    result = JSON.parse(r.result);
                  return input.expectedLevel === 5 &&
                    String(result.message || "").startsWith("Enhanced to MAX.")
                    ? [{ ...r, input }]
                    : [];
                } catch {
                  return [];
                }
              }),
          );
        }
        const matches = histories
          .get(t.player)
          .filter((r) => r.input.card === t.card && r.at >= t.at);
        // The original award already covers its first enhancement receipt.
        if (matches[0]?.at === t.at) matches.shift();
        for (const r of matches) {
          this.insert(
            t.player,
            t.card,
            t.title,
            t.rarity,
            r.at,
            t.hidden,
            "receipt:" + r.key,
          );
          recovered++;
        }
      }
      e.run(
        "INSERT INTO catalog_meta VALUES('card-title-awards-v2',?)",
        JSON.stringify({ at: e.now(), preserved: old.length, recovered }),
      );
    });
  }
  insert(
    player,
    card,
    title,
    rarity,
    at,
    hidden = 0,
    award = crypto.randomUUID(),
  ) {
    this.e.run(
      "INSERT OR IGNORE INTO card_title_awards(player,award,card,title,rarity,at,hidden) VALUES(?,?,?,?,?,?,?)",
      player,
      award,
      card,
      title,
      rarity,
      at,
      hidden,
    );
  }
  award(player, id) {
    const c = this.e.catalogStore.card(id);
    if (!c) throw Error("The card could not be loaded. Refresh and try again.");
    const title = cardTitleName(c.name),
      rarity = RARITIES.includes(c.rarity) ? c.rarity : "Pending";
    this.insert(player, id, title, rarity, this.e.now());
    return title;
  }
  // Existing MAX owners were caught up once; never rerun that historical award.
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
    const rows = this.e.all(
      "SELECT award,card,title,rarity,hidden FROM card_title_awards WHERE player=? ORDER BY at,award",
      player,
    );
    const cards = new Map(
      this.e.catalogStore
        .cards([...new Set(rows.map((r) => r.card))])
        .map((c) => [c.id, c]),
    );
    return rows.map(({ hidden, ...r }) => {
      const c = cards.get(r.card);
      return {
        ...r,
        rarity: c ? c.rarity || "Pending" : r.rarity,
        kind: c?.kind,
        source: "card",
        equipped: !hidden,
      };
    });
  }
}
