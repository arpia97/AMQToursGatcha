import {
  convertLegacyLevel,
  ENHANCEMENT_REVISION,
} from "../public/card-values.js";
const TABLES = [
  "auctions",
  "market_listings",
  "trade_listings",
  "trade_offers",
  "trade_offer_cards",
];
export function migrateEnhancements(e) {
  for (const table of TABLES)
    if (
      !e
        .all("PRAGMA table_info(" + table + ")")
        .some((c) => c.name === "extra_copies")
    )
      e.run(
        "ALTER TABLE " +
          table +
          " ADD COLUMN extra_copies INTEGER NOT NULL DEFAULT 0",
      );
  e.run(
    "CREATE TABLE IF NOT EXISTS enhancement_migrations(revision INTEGER PRIMARY KEY,at INTEGER NOT NULL,summary TEXT NOT NULL)",
  );
  e.run(
    "CREATE TABLE IF NOT EXISTS enhancement_migration_rows(location TEXT NOT NULL,record_key TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,PRIMARY KEY(location,record_key))",
  );
  if (
    e.one(
      "SELECT revision FROM enhancement_migrations WHERE revision=?",
      ENHANCEMENT_REVISION,
    )
  )
    return;
  e.tx(() => {
    const summary = {
      inventory: 0,
      held: 0,
      returnedSpareCopies: 0,
      heldSpareCopies: 0,
    };
    const audit = (table, key, before, after) =>
      e.run(
        "INSERT INTO enhancement_migration_rows VALUES(?,?,?,?)",
        table,
        key,
        JSON.stringify(before),
        JSON.stringify(after),
      );
    for (const row of e.all("SELECT * FROM inventory WHERE level>1")) {
      const next = convertLegacyLevel(row.level),
        after = { level: next.level, copies: row.copies + next.extraCopies };
      audit("inventory", JSON.stringify([row.player, row.card]), row, after);
      e.run(
        "UPDATE inventory SET level=?,copies=? WHERE player=? AND card=?",
        after.level,
        after.copies,
        row.player,
        row.card,
      );
      summary.inventory++;
      summary.returnedSpareCopies += next.extraCopies;
    }
    const held = (table, where, keys = ["id"]) => {
      for (const row of e.all(
        "SELECT * FROM " + table + " WHERE level>1 AND (" + where + ")",
      )) {
        const next = convertLegacyLevel(row.level);
        audit(table, JSON.stringify(keys.map((k) => row[k])), row, next);
        e.run(
          "UPDATE " +
            table +
            " SET level=?,extra_copies=? WHERE " +
            keys.map((k) => k + "=?").join(" AND "),
          next.level,
          next.extraCopies,
          ...keys.map((k) => row[k]),
        );
        summary.held++;
        summary.heldSpareCopies += next.extraCopies;
      }
    };
    held("auctions", "claimed=0");
    held("market_listings", "status='open'");
    held("trade_listings", "status='open'");
    held(
      "trade_offer_cards",
      "offer IN (SELECT id FROM trade_offers WHERE status='open')",
      ["offer", "position"],
    );
    held(
      "trade_offers",
      "status='open' AND NOT EXISTS(SELECT 1 FROM trade_offer_cards c WHERE c.offer=trade_offers.id)",
    );
    e.run(
      "UPDATE trade_offers SET level=(SELECT level FROM trade_offer_cards c WHERE c.offer=trade_offers.id ORDER BY position LIMIT 1) WHERE status='open' AND EXISTS(SELECT 1 FROM trade_offer_cards c WHERE c.offer=trade_offers.id)",
    );
    for (const n of e.all(
      "SELECT id,level FROM player_notices WHERE seen=0 AND level>1",
    ))
      e.run(
        "UPDATE player_notices SET level=? WHERE id=?",
        convertLegacyLevel(n.level).level,
        n.id,
      );
    e.run("UPDATE card_alchemy SET version=version+1");
    e.run(
      "INSERT INTO enhancement_migrations VALUES(?,?,?)",
      ENHANCEMENT_REVISION,
      e.now(),
      JSON.stringify(summary),
    );
  });
}
