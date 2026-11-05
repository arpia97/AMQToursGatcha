import { fail, integer } from "./engine.js";

export class PlayerNotices {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS player_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,event_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,card TEXT NOT NULL,level INTEGER NOT NULL,credits INTEGER NOT NULL,created INTEGER NOT NULL,seen INTEGER NOT NULL DEFAULT 0)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS notices_pending ON player_notices(player,seen,id)",
    );
    if (
      !e
        .all("PRAGMA table_info(player_notices)")
        .some((c) => c.name === "metadata")
    )
      e.run(
        "ALTER TABLE player_notices ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'",
      );
  }
  add(player, key, kind, card, level, credits, metadata = {}) {
    this.e.run(
      "INSERT OR IGNORE INTO player_notices(player,event_key,kind,card,level,credits,created,metadata) VALUES(?,?,?,?,?,?,?,?)",
      player,
      key,
      kind,
      card,
      level || 1,
      credits,
      this.e.now(),
      JSON.stringify(metadata),
    );
    return this.e.one("SELECT id FROM player_notices WHERE event_key=?", key)
      .id;
  }
  pending(player) {
    return player
      ? this.e
          .all(
            "SELECT id,kind,card,level,credits,created,metadata FROM player_notices WHERE player=? AND seen=0 ORDER BY id LIMIT 20",
            player,
          )
          .map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }))
      : [];
  }
  seen(player, ids) {
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 20 ||
      new Set(ids).size !== ids.length
    )
      fail("Choose between 1 and 20 notifications.");
    ids.forEach((id) => integer(id, 1));
    const rows = this.e.all(
      `SELECT id,player FROM player_notices WHERE id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    if (rows.length !== ids.length || rows.some((r) => r.player !== player))
      fail("These notifications are not available.", 404);
    this.e.run(
      `UPDATE player_notices SET seen=1 WHERE player=? AND id IN (${ids.map(() => "?").join(",")})`,
      player,
      ...ids,
    );
    this.e.run(
      "DELETE FROM player_notices WHERE player=? AND seen=1 AND id NOT IN (SELECT id FROM player_notices WHERE player=? AND seen=1 ORDER BY id DESC LIMIT 100)",
      player,
      player,
    );
    return { message: "Notifications marked as seen." };
  }
}
