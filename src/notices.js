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
    if (["trade-request","credit-reward","quiz-leader-beaten"].includes(kind) && this.e.one("SELECT json_extract(notice_preferences,?) AS enabled FROM players WHERE id=?", '$."'+kind+'"', player)?.enabled === 0) return null;
    this.e.run(
      "INSERT OR IGNORE INTO player_notices(player,event_key,kind,card,level,credits,created,metadata,seen) VALUES(?,?,?,?,?,?,?,?,?)",
      player,
      key,
      kind,
      card,
      level || 1,
      credits,
      this.e.now(),
      JSON.stringify(metadata),
      Number(kind==="credit-reward" || kind==="quiz-personal-beaten"),
    );
    return this.e.one("SELECT id FROM player_notices WHERE event_key=?", key)
      .id;
  }
  decode(player, {event_key, ...row}) {
    row.metadata = JSON.parse(row.metadata);
    if (row.kind === "outbid" && !row.metadata.auctionSection) {
      const match = /^(?:outbid:(\d+):\d+|buyout-refund:(\d+))$/.exec(event_key);
      if (match?.[2]) row.metadata.auctionSection = "user";
      else if (match) {
        const auction = this.e.one("SELECT seller FROM auctions WHERE id=? AND card=?", Number(match[1]), row.card);
        if (auction) row.metadata.auctionSection = auction.seller ? "user" : "community";
      }
    }
    // Older notices only stored the listing ID in the event key.
    if (!row.metadata.buyerName && (row.kind === "market-sale" || row.kind === "auction-sale")) {
      const id = Number(event_key.slice(row.kind.length + 1));
      if (Number.isSafeInteger(id) && id > 0 && event_key === row.kind + ":" + id) {
        const source = row.kind === "market-sale"
          ? "market_listings s JOIN players p ON p.id=s.buyer"
          : "auctions s JOIN players p ON p.id=s.winner";
        const buyer = this.e.one("SELECT COALESCE(p.display_name,p.name) AS name FROM " + source +
          " WHERE s.id=? AND s.seller=? AND s.card=?", id, player, row.card);
        if (buyer) row.metadata.buyerName = buyer.name;
      }
    }
    return row;
  }
  pending(player) {
    return player
      ? this.e
          .all(
            "SELECT id,event_key,kind,card,level,credits,created,metadata FROM player_notices WHERE player=? AND seen=0 ORDER BY id LIMIT 20",
            player,
          )
          .map((r) => this.decode(player,r))
      : [];
  }
  auctionState(player, ids) {
    const values = ids ? ids.split(',').map(Number) : [];
    if(values.length>64 || values.some(id=>!Number.isSafeInteger(id)||id<1))
      fail('Choose at most 64 auction IDs.');
    const unique=[...new Set(values)];
    return {
      player, now:this.e.now(), balance:this.e.player(player).balance,
      lots:unique.length?this.e.all(`SELECT a.*,COALESCE(s.display_name,s.name) AS seller_name,COALESCE(w.display_name,w.name) AS winner_name FROM auctions a LEFT JOIN players s ON s.id=a.seller LEFT JOIN players w ON w.id=a.winner WHERE a.id IN (${unique.map(()=>'?').join(',')})`,...unique):[],
    };
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
      "DELETE FROM player_notices WHERE player=? AND seen=1 AND inbox_read=1 AND id NOT IN (SELECT id FROM player_notices WHERE player=? AND seen=1 ORDER BY id DESC LIMIT 100)",
      player,
      player,
    );
    return { message: "Notifications marked as seen." };
  }
}
