import { fail, integer, text } from "./engine.js";

// This endpoint is restricted to the canonical owner in worker.js. It accepts
// row patches, never SQL, and cannot touch credentials, aliases or the catalogue.
const TABLES = {
  players: {
    keys: ["id"],
    columns: [
      "balance",
      "earned",
      "daily",
      "daily_pack",
      "avatar_card",
      "display_name",
    ],
  },
  inventory: {
    keys: ["player", "card"],
    columns: ["player", "card", "copies", "level", "acquired_at", "protected"],
  },
  gambling_rounds: {
    keys: ["id"],
    columns: [
      "id",
      "player",
      "game",
      "stake",
      "payout",
      "net",
      "outcome",
      "at",
    ],
  },
  mahjong_games: { keys: ["player"], columns: ["player", "data"] },
  gem_games: { keys: ["player"], columns: ["player", "data"] },
  horse_games: { keys: ["player"], columns: ["player", "data"] },
  pachinko_games: { keys: ["player"], columns: ["player", "data"] },
  tour_events: {
    keys: ["player", "category", "event"],
    columns: ["player", "category", "event"],
  },
  auctions: {
    keys: ["id"],
    columns: [
      "id",
      "card",
      "kind",
      "starts",
      "ends",
      "bid",
      "winner",
      "closed",
      "claimed",
      "seller",
      "level",
      "reserve",
      "paid",
      "buyout",
      "notified",
    ],
  },
  market_listings: {
    keys: ["id"],
    columns: [
      "id",
      "seller",
      "card",
      "kind",
      "level",
      "price",
      "created",
      "status",
      "buyer",
      "sold_at",
    ],
  },
  profile_showcase: {
    keys: ["player", "card"],
    columns: ["player", "card", "position"],
  },
  profile_anime: {
    keys: ["player", "series_key"],
    columns: ["player", "series_key", "at"],
  },
  player_notices: {
    keys: ["id"],
    columns: [
      "id",
      "player",
      "event_key",
      "kind",
      "card",
      "level",
      "credits",
      "created",
      "seen",
    ],
  },
};
export const REPAIR_RECEIPT_ACTIONS = [
  "pack",
  "daily-pack",
  "fusion",
  "enhance",
  "sell-instant",
  "sell-batch",
  "list-card",
  "cancel-listing",
  "shop-buy",
  "buyout",
  "bid",
  "protect-card",
  "showcase",
  "profile",
  "pin-anime",
  "daily",
];
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const stable = (value) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );

export function inspectEconomyRepair(e, plan) {
  text(plan.repairId, 100);
  if (
    !/^[a-z0-9-]+$/.test(plan.repairId) ||
    plan.confirmation !== "ROLL BACK HAKOHOKA AWARDS 2026-10-30"
  )
    fail("Invalid repair confirmation.");
  if (
    !Array.isArray(plan.guards) ||
    !plan.guards.length ||
    plan.guards.length > 500 ||
    !Array.isArray(plan.changes) ||
    plan.changes.length > 5000
  )
    fail("Invalid repair manifest.");
  integer(plan.start, 1, Number.MAX_SAFE_INTEGER);
  if (
    plan.start !== 1793345617731 ||
    plan.end !== 1793361600000 ||
    !plan.originalReplayVerified
  )
    fail("The reviewed rollback scope does not match.");
  const allowedPlayers = new Set();
  for (const guard of plan.guards) {
    const player = text(guard.player, 100);
    if (player === "30") fail("Revel's completed reset must not be repeated.");
    allowedPlayers.add(player);
    integer(guard.ledgerMax, 0, Number.MAX_SAFE_INTEGER);
    integer(guard.receiptCount, 0, 10000000);
    if (!e.one("SELECT id FROM players WHERE id=?", player))
      fail("Repair player no longer exists.", 409);
    const max = e.one(
      "SELECT COALESCE(MAX(id),0) AS n FROM ledger WHERE player=?",
      player,
    ).n;
    const count = e.one(
      `SELECT count(*) AS n FROM receipts WHERE at>=? AND scope IN (${REPAIR_RECEIPT_ACTIONS.map(() => "?").join(",")})`,
      plan.start,
      ...REPAIR_RECEIPT_ACTIONS.map((a) => player + ":" + a),
    ).n;
    if (max !== guard.ledgerMax || count !== guard.receiptCount)
      fail(
        "Player activity changed since the repair snapshot: " +
          player +
          ". Rebuild the plan.",
        409,
      );
  }
  const touched = new Set();
  for (const change of plan.changes) {
    const schema = Object.hasOwn(TABLES, change.table) && TABLES[change.table];
    if (
      !schema ||
      !object(change.key) ||
      Object.keys(change.key).length !== schema.keys.length ||
      schema.keys.some((k) => !Object.hasOwn(change.key, k))
    )
      fail("Unsupported repair table or key.");
    const unique = change.table + ":" + stable(change.key);
    if (touched.has(unique)) fail("Duplicate repair row.");
    touched.add(unique);
    if (change.before === null && change.after === null)
      fail("Empty repair change.");
    for (const row of [change.before, change.after]) {
      if (row === null) continue;
      if (
        !object(row) ||
        !Object.keys(row).length ||
        Object.keys(row).some((c) => !schema.columns.includes(c))
      )
        fail("Unsupported repair column.");
      for (const [column, value] of Object.entries(row))
        if (!(
          value === null ||
          (typeof value === "string" && value.length <= 200000) ||
          (typeof value === "number" && Number.isSafeInteger(value))
        ))
          fail("Invalid repair value: " + column);
      for (const column of schema.keys)
        if (Object.hasOwn(row, column) && row[column] !== change.key[column])
          fail("Repair cannot change a primary key.");
    }
    const before = change.before;
    const where = schema.keys.map((k) => k + "=?").join(" AND ");
    const live = e.one(
      `SELECT * FROM ${change.table} WHERE ${where}`,
      ...schema.keys.map((k) => change.key[k]),
    );
    if (
      before === null
        ? !!live
        : !live ||
          stable(
            Object.fromEntries(Object.keys(before).map((k) => [k, live[k]])),
          ) !== stable(before)
    )
      fail("Repair row changed: " + unique, 409);
    const owner =
      change.table === "players"
        ? change.key.id
        : (live?.player ??
          change.after?.player ??
          live?.seller ??
          change.after?.seller);
    if (owner && !allowedPlayers.has(owner))
      fail("Repair row is outside the player scope.");
    if (change.table === "players") {
      if (!before || !change.after)
        fail("Repair cannot add or delete accounts.");
      integer(change.after.balance, 0, Number.MAX_SAFE_INTEGER);
      integer(change.after.earned, 0, Number.MAX_SAFE_INTEGER);
    }
    if (change.table === "inventory" && change.after) {
      integer(change.after.copies, 1, 10000000);
      integer(change.after.level, 1, 20);
    }
  }
  if (
    !Array.isArray(plan.sourceLedgerIds) ||
    plan.sourceLedgerIds.length > 20000
  )
    fail("Invalid source ledger IDs.");
  for (const id of plan.sourceLedgerIds)
    integer(id, 1, Number.MAX_SAFE_INTEGER);
  return {
    repairId: plan.repairId,
    players: allowedPlayers.size,
    rows: plan.changes.length,
    walletDelta: plan.changes
      .filter((c) => c.table === "players")
      .reduce((s, c) => s + c.after.balance - c.before.balance, 0),
  };
}

// Caller wraps this in Engine.mutate/transactionSync, including the receipt.
export function applyEconomyRepair(e, plan, digest, bookmark = null) {
  const summary = inspectEconomyRepair(e, plan);
  e.run(
    "CREATE TABLE IF NOT EXISTS economy_repairs(id TEXT PRIMARY KEY,digest TEXT NOT NULL,source_ledger_ids TEXT NOT NULL,result TEXT NOT NULL,at INTEGER NOT NULL)",
  );
  if (e.one("SELECT id FROM economy_repairs WHERE id=?", plan.repairId))
    fail(
      "This repair already exists. Read its receipt; do not apply it again.",
      409,
    );
  for (const change of plan.changes) {
    const schema = TABLES[change.table],
      where = schema.keys.map((k) => k + "=?").join(" AND "),
      args = schema.keys.map((k) => change.key[k]);
    if (change.after === null)
      e.run(`DELETE FROM ${change.table} WHERE ${where}`, ...args);
    else if (change.before === null) {
      const columns = Object.keys(change.after);
      e.run(
        `INSERT INTO ${change.table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
        ...columns.map((c) => change.after[c]),
      );
    } else {
      const columns = Object.keys(change.after).filter(
        (c) => !schema.keys.includes(c),
      );
      e.run(
        `UPDATE ${change.table} SET ${columns.map((c) => c + "=?").join(",")} WHERE ${where}`,
        ...columns.map((c) => change.after[c]),
        ...args,
      );
    }
    if (
      change.table === "players" &&
      change.after.balance !== change.before.balance
    )
      e.run(
        "INSERT INTO ledger(player,delta,reason,at) VALUES(?,?,?,?)",
        change.key.id,
        change.after.balance - change.before.balance,
        "Administrative rollback: HakoHoka awards (2026-10-30)",
        e.now(),
      );
  }
  const result = {
    ...summary,
    digest,
    bookmark,
    appliedAt: e.now(),
    message:
      "Reviewed economy rollback applied atomically. Original financial history retained.",
  };
  e.run(
    "INSERT INTO economy_repairs VALUES(?,?,?,?,?)",
    plan.repairId,
    digest,
    JSON.stringify(plan.sourceLedgerIds),
    JSON.stringify(result),
    e.now(),
  );
  return result;
}
