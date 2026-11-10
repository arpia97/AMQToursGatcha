import { searchSql } from "./search.js";
import { MAX_PINNED_ANIME } from "../public/site-defaults.js";
import { integer, text, fail } from "./engine.js";
import { animeProgressComparator } from "../public/card-display.js";

// Primary titles remain compatible with old cards; explicit cast links add every appearance.
export class AnimeCollection {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS profile_anime(player TEXT NOT NULL,series_key TEXT NOT NULL,at INTEGER NOT NULL,position INTEGER,PRIMARY KEY(player,series_key))",
    );
    if (
      !e
        .all("PRAGMA table_info(profile_anime)")
        .some((c) => c.name === "position")
    )
      e.run("ALTER TABLE profile_anime ADD COLUMN position INTEGER");
    e.run(
      "CREATE INDEX IF NOT EXISTS profile_anime_order ON profile_anime(player,position IS NULL,position,at,series_key)",
    );
    e.run(
      "CREATE TABLE IF NOT EXISTS character_series(card TEXT PRIMARY KEY,series_key TEXT NOT NULL,romaji TEXT NOT NULL,english TEXT NOT NULL)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS character_series_key ON character_series(series_key)",
    );
    e.run(
      "CREATE TABLE IF NOT EXISTS character_appearances(card TEXT NOT NULL,series_key TEXT NOT NULL,romaji TEXT NOT NULL,english TEXT NOT NULL,anime_id INTEGER NOT NULL,role TEXT NOT NULL,members INTEGER NOT NULL,PRIMARY KEY(card,series_key))",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS character_appearances_series ON character_appearances(series_key,card)",
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
  appearance(card, old) {
    const a = card.appearance;
    if (!a || !Number.isSafeInteger(a.id) || a.id < 1) return null;
    const romaji = a.series_romaji || a.series || "",
      english = a.series_english || "";
    if (!romaji && !english) return null;
    const key = (romaji || english).trim().toLowerCase();
    if (old?.series || old?.series_romaji) {
      const title = old.series_romaji || old.series;
      this.e.run(
        "INSERT OR IGNORE INTO character_appearances VALUES(?,?,?,?,?,?,?)",
        card.id,
        title.trim().toLowerCase(),
        title,
        old.series_english || "",
        0,
        old.role,
        0,
      );
    }
    this.e.run(
      "INSERT INTO character_appearances VALUES(?,?,?,?,?,?,?) ON CONFLICT(card,series_key) DO UPDATE SET romaji=excluded.romaji,english=excluded.english,role=excluded.role,members=excluded.members,anime_id=excluded.anime_id",
      card.id,
      key,
      romaji,
      english,
      a.id,
      card.role,
      Number.isSafeInteger(a.members) && a.members >= 0 ? a.members : 0,
    );
    const rows = this.e.all(
      "SELECT * FROM character_appearances WHERE card=? ORDER BY CASE role WHEN 'main' THEN 0 ELSE 1 END,members DESC,CASE anime_id WHEN 0 THEN 1 ELSE 0 END,anime_id,series_key",
      card.id,
    );
    const primary = rows[0];
    return {
      series: primary.romaji || primary.english,
      series_romaji: primary.romaji,
      series_english: primary.english,
      primaryAnimeId: primary.anime_id,
      role: primary.role,
      searchText: [card.name, ...rows.flatMap((r) => [r.romaji, r.english])]
        .join(" ")
        .toLowerCase(),
    };
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
          "SELECT card FROM character_appearances WHERE series_key=? UNION ALL SELECT card FROM character_series WHERE series_key=? LIMIT 1",
          key,
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
        ).n >= MAX_PINNED_ANIME
      )
        fail("You can pin up to 20 anime. Unpin one first.");
      const maxPos = this.e.one(
        "SELECT max(position) AS maxPos FROM profile_anime WHERE player=?",
        player,
      )?.maxPos;
      const nextPos = maxPos != null ? maxPos + 1 : null;
      this.e.run(
        "INSERT OR IGNORE INTO profile_anime(player,series_key,at,position) VALUES(?,?,?,?)",
        player,
        key,
        this.e.now(),
        nextPos,
      );
    }
    return {
      message: b.pinned
        ? "Anime pinned to your profile and progress board."
        : "Anime unpinned.",
    };
  }
  reorderPinned(player, b) {
    if (!Array.isArray(b.order)) fail("Provide the ordered pinned anime.");
    const current = this.e
      .all("SELECT series_key FROM profile_anime WHERE player=?", player)
      .map((r) => r.series_key);
    if (
      b.order.length !== current.length ||
      new Set(b.order).size !== current.length ||
      b.order.some((key) => !current.includes(key))
    )
      fail("Arrange the anime already pinned to your profile.");
    if (
      b.expectedOrder &&
      JSON.stringify(this.pinned(player).map((a) => a.series_key)) !==
        JSON.stringify(b.expectedOrder)
    )
      fail("Your pinned anime changed. Refresh before arranging.", 409);
    b.order.forEach((key, position) => {
      this.e.run(
        "UPDATE profile_anime SET position=? WHERE player=? AND series_key=?",
        position,
        player,
        key,
      );
    });
    return {
      message: "Pinned anime order saved.",
      pinned: this.pinned(player),
    };
  }
  progress(player, key) {
    return this.e.one(
      `WITH associated AS (${animeLinks("s.series_key=?")}), owned AS (${ownedCards}) SELECT series_key,min(romaji) AS series_romaji,max(english) AS series_english,count(*) AS total,sum(card IN (SELECT card FROM owned)) AS owned FROM associated GROUP BY series_key`,
      key,
      key,
      ...Array(5).fill(player),
    );
  }
  pinned(player) {
    const rows = this.e.all(
      "SELECT series_key,position FROM profile_anime WHERE player=? ORDER BY position IS NULL,position,at,series_key",
      player,
    );
    const hasCustomOrder = rows.some((r) => r.position != null);
    const list = rows
      .map(({ series_key }) => this.progress(player, series_key))
      .filter(Boolean);
    if (!hasCustomOrder) {
      return list.sort(animeProgressComparator);
    }
    const posMap = new Map(
      rows.map((r, idx) => [r.series_key, r.position ?? 1000 + idx]),
    );
    return list.sort(
      (a, b) =>
        (posMap.get(a.series_key) ?? 1000) -
        (posMap.get(b.series_key) ?? 1000),
    );
  }
  search(query, player) {
    const q = String(query || "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    if (q.length < 2) return { series: [] };
    const search = searchSql("s.romaji||' '||s.english", q);
    const rows = this.e.all(
      `WITH matched AS (${animeLinks(search.where)}) SELECT series_key,min(romaji) AS series_romaji,max(english) AS series_english,count(*) AS total FROM matched GROUP BY series_key ORDER BY series_romaji LIMIT 20`,
      ...search.args,
      ...search.args,
    );
    return {
      series: player
        ? rows.map((c) => this.progress(player, c.series_key))
        : rows,
    };
  }
  checklist(player, series, page = 1) {
    const key = text(series, 1000);
    integer(page, 1, 10000);
    const progress = this.progress(player, key);
    if (!progress) fail("This anime is not in the catalogue yet.", 404);
    const rows = this.e.all(
      `WITH associated AS (${animeLinks("s.series_key=?")}), owned AS (${ownedCards}) SELECT card,card IN(SELECT card FROM owned) AS owned FROM associated ORDER BY card LIMIT 25 OFFSET ?`,
      key,
      key,
      ...Array(5).fill(player),
      (page - 1) * 24,
    );
    const states = new Map(rows.slice(0, 24).map((r) => [r.card, !!r.owned]));
    return {
      ...progress,
      page,
      hasMore: rows.length > 24,
      cards: this.e.catalogStore
        .cards([...states.keys()])
        .map((c) => ({ ...c, owned: states.get(c.id) })),
    };
  }
  page(player, page = 1) {
    integer(page, 1, 10000);
    const rows = this.e.all(
      `WITH owned AS (${ownedCards}), associated AS (${animeLinks("s.card IN(SELECT card FROM owned)")}), progress AS (SELECT series_key,min(romaji) AS series_romaji,max(english) AS series_english,count(*) AS owned FROM associated GROUP BY series_key), totals AS (SELECT p.*,(SELECT count(*) FROM character_appearances a WHERE a.series_key=p.series_key)+(SELECT count(*) FROM character_series s WHERE s.series_key=p.series_key AND NOT EXISTS(SELECT 1 FROM character_appearances a WHERE a.card=s.card AND a.series_key=s.series_key)) AS total,EXISTS(SELECT 1 FROM profile_anime f WHERE f.player=? AND f.series_key=p.series_key) AS pinned FROM progress p) SELECT * FROM totals ORDER BY pinned DESC,1.0*owned/total DESC,series_romaji,series_key LIMIT 25 OFFSET ?`,
      ...Array(5).fill(player),
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

// Push card/series filters inside each branch: materializing a whole union on
// every profile request would scan the complete catalogue for one collector.
function animeLinks(where) {
  return (
    "SELECT s.card,s.series_key,s.romaji,s.english FROM character_appearances s WHERE (" +
    where +
    ") UNION ALL SELECT s.card,s.series_key,s.romaji,s.english FROM character_series s WHERE (" +
    where +
    ") AND NOT EXISTS(SELECT 1 FROM character_appearances a WHERE a.card=s.card AND a.series_key=s.series_key)"
  );
}
const ownedCards =
  "SELECT card FROM inventory WHERE player=? UNION SELECT card FROM market_listings WHERE seller=? AND status='open' UNION SELECT card FROM auctions WHERE seller=? AND paid=0 UNION SELECT card FROM trade_listings WHERE seller=? AND status='open' UNION SELECT COALESCE(c.card,o.card) AS card FROM trade_offers o LEFT JOIN trade_offer_cards c ON c.offer=o.id WHERE o.proposer=? AND o.status='open'";
