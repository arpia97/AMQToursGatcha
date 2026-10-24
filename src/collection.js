import { integer, text, fail } from "./engine.js";

// Only primary anime associations are stored by the catalogue importer.
export class AnimeCollection {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS profile_anime(player TEXT NOT NULL,series_key TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(player,series_key))",
    );
    e.run(
      "CREATE TABLE IF NOT EXISTS character_series(card TEXT PRIMARY KEY,series_key TEXT NOT NULL,romaji TEXT NOT NULL,english TEXT NOT NULL)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS character_series_key ON character_series(series_key)",
    );
    if (!e.one("SELECT key FROM catalog_meta WHERE key='series-backfill'"))
      this.save({ bucket: -1, local: 0, phase: "buckets" });
  }
  read() {
    return JSON.parse(
      this.e.one("SELECT value FROM catalog_meta WHERE key='series-backfill'")
        .value,
    );
  }
  save(value) {
    this.e.run(
      "INSERT OR REPLACE INTO catalog_meta VALUES('series-backfill',?)",
      JSON.stringify(value),
    );
  }
  index(cards) {
    for (const c of cards) {
      if (c.kind !== "character") continue;
      const romaji = c.series_romaji || c.series || "",
        english = c.series_english || "";
      if (!romaji && !english) {
        this.e.run("DELETE FROM character_series WHERE card=?", c.id);
        continue;
      }
      const key = (romaji || english).trim().toLowerCase();
      const old = this.e.one(
        "SELECT * FROM character_series WHERE card=?",
        c.id,
      );
      if (
        old?.series_key === key &&
        old.romaji === romaji &&
        old.english === english
      )
        continue;
      this.e.run(
        "INSERT OR REPLACE INTO character_series VALUES(?,?,?,?)",
        c.id,
        key,
        romaji,
        english,
      );
    }
  }
  step() {
    const e = this.e,
      s = this.read();
    if (s.phase === "done") return;
    if (s.phase === "buckets") {
      const row = e.one(
        "SELECT bucket,payload FROM tenrai_characters WHERE bucket>? ORDER BY bucket LIMIT 1",
        s.bucket,
      );
      if (row) {
        this.index(
          Object.values(JSON.parse(row.payload)).map(
            (c) => e.one("SELECT * FROM catalog WHERE id=?", c.id) || c,
          ),
        );
        s.bucket = row.bucket;
      } else s.phase = "local";
    } else {
      const rows = e.all(
        "SELECT * FROM catalog WHERE kind='character' AND active=1 ORDER BY id LIMIT 500 OFFSET ?",
        s.local,
      );
      this.index(rows);
      s.local += rows.length;
      if (rows.length < 500) s.phase = "done";
    }
    this.save(s);
  }
  nextAlarm() {
    return this.read().phase === "done" ? null : this.e.now() + 1000;
  }
  pin(player, b) {
    const key = text(b.series, 1000);
    if (typeof b.pinned !== "boolean")
      fail("Choose whether to pin this anime.");
    if (!b.pinned)
      this.e.run(
        "DELETE FROM profile_anime WHERE player=? AND series_key=?",
        player,
        key,
      );
    else {
      if (
        !this.e.one(
          "SELECT card FROM character_series WHERE series_key=? LIMIT 1",
          key,
        )
      )
        fail("This anime is not in the catalogue yet.");
      if (
        !this.e.one(
          "SELECT series_key FROM profile_anime WHERE player=? AND series_key=?",
          player,
          key,
        ) &&
        this.e.one(
          "SELECT count(*) AS n FROM profile_anime WHERE player=?",
          player,
        ).n >= 12
      )
        fail("You can pin up to 12 anime. Unpin one first.");
      this.e.run(
        "INSERT OR IGNORE INTO profile_anime VALUES(?,?,?)",
        player,
        key,
        this.e.now(),
      );
    }
    return {
      message: b.pinned
        ? "Anime pinned to your profile and progress board."
        : "Anime unpinned.",
    };
  }
  progress(player, key) {
    return this.e.one(
      `SELECT series_key,min(romaji) AS series_romaji,max(english) AS series_english,count(*) AS total,(SELECT count(*) FROM character_series s WHERE s.series_key=? AND s.card IN (SELECT card FROM inventory WHERE player=? UNION SELECT card FROM market_listings WHERE seller=? AND status='open' UNION SELECT card FROM auctions WHERE seller=? AND paid=0)) AS owned FROM character_series WHERE series_key=? GROUP BY series_key`,
      key,
      player,
      player,
      player,
      key,
    );
  }
  pinned(player) {
    return this.e
      .all(
        "SELECT series_key FROM profile_anime WHERE player=? ORDER BY at,series_key",
        player,
      )
      .map(({ series_key }) => this.progress(player, series_key))
      .filter(Boolean);
  }
  search(query, player) {
    const q = String(query || "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    if (q.length < 2) return { series: [] };
    const rows = this.e.all(
      "SELECT series_key,min(romaji) AS series_romaji,max(english) AS series_english,count(*) AS total FROM character_series WHERE instr(lower(romaji||' '||english),?)>0 GROUP BY series_key ORDER BY series_romaji LIMIT 20",
      q,
    );
    return {
      series: player
        ? rows.map((c) => this.progress(player, c.series_key))
        : rows,
    };
  }
  page(player, page = 1) {
    integer(page, 1, 10000);
    const e = this.e;
    const rows = e.all(
      `WITH owned AS (SELECT card FROM inventory WHERE player=? UNION SELECT card FROM market_listings WHERE seller=? AND status='open' UNION SELECT card FROM auctions WHERE seller=? AND paid=0), progress AS (SELECT s.series_key,min(s.romaji) AS series_romaji,max(s.english) AS series_english,count(*) AS owned FROM owned o JOIN character_series s ON s.card=o.card GROUP BY s.series_key) SELECT p.*,(SELECT count(*) FROM character_series c WHERE c.series_key=p.series_key) AS total FROM progress p ORDER BY owned DESC,series_romaji LIMIT 25 OFFSET ?`,
      player,
      player,
      player,
      (page - 1) * 24,
    );
    return {
      series: rows.slice(0, 24),
      page,
      hasMore: rows.length > 24,
      indexing: this.read().phase !== "done",
      pinned: this.pinned(player),
    };
  }
}
