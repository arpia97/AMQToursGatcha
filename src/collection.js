import { integer } from "./engine.js";

// Only primary anime associations are stored by the catalogue importer.
export class AnimeCollection {
  constructor(e) {
    this.e = e;
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
    };
  }
}
