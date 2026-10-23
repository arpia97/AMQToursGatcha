import { fail, integer, text } from "./engine.js";
import { TenraiCatalog, characterSearch } from "./tenrai-catalog.js";
import { Popularity } from "./popularity.js";

// ACDB metadata is stored in bounded JSON chunks. A bulk seed writes hundreds
// of SQLite rows instead of hundreds of thousands of individual row/index writes.
export class Catalog {
  constructor(engine) {
    this.e = engine;
    engine.run(
      "CREATE TABLE IF NOT EXISTS catalog_bulk(version TEXT NOT NULL,section TEXT NOT NULL,bucket INTEGER NOT NULL,payload TEXT NOT NULL,search TEXT NOT NULL DEFAULT '',PRIMARY KEY(version,section,bucket))",
    );
    engine.run(
      "CREATE TABLE IF NOT EXISTS catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    );
    this.tenrai = new TenraiCatalog(engine);
    this.popularity = new Popularity(engine);
  }
  manifest() {
    const row = this.e.one("SELECT value FROM catalog_meta WHERE key='acdb'");
    return row ? JSON.parse(row.value) : null;
  }
  chunk(section, bucket, version = this.manifest()?.version) {
    const row =
      version &&
      this.e.one(
        "SELECT payload FROM catalog_bulk WHERE version=? AND section=? AND bucket=?",
        version,
        section,
        bucket,
      );
    return row ? JSON.parse(row.payload) : null;
  }
  bulkCard(id) {
    const mal = this.tenrai.card(id);
    if (mal) return mal;
    const match = /^acdb-character-(\d+)$/.exec(id);
    return match
      ? this.chunk("cards", Math.floor(Number(match[1]) / 500))?.[id]
      : null;
  }
  rawCard(id) {
    return (
      this.e.one("SELECT * FROM catalog WHERE id=?", id) || this.bulkCard(id)
    );
  }
  card(id) {
    const c = this.rawCard(id);
    return c ? this.popularity.decorate([c])[0] : null;
  }
  summary() {
    const m = this.tenrai.manifest() || this.manifest(),
      small = this.e.all(
        "SELECT kind,count(*) AS n FROM catalog WHERE active=1 GROUP BY kind",
      );
    const counts = { character: m?.count || 0, seiyuu: 0 };
    for (const row of small) counts[row.kind] += row.n;
    const overrides = m
      ? this.e.one(
          "SELECT count(*) AS n FROM catalog WHERE bulk_role IS NOT NULL",
        ).n
      : 0;
    counts.character -= overrides;
    return { ...counts, total: counts.character + counts.seiyuu, source: m };
  }
  draw(kind, rand, mainWeight = 100, excluded = new Set()) {
    return this.popularity.decorate([
      this.rawDraw(kind, rand, mainWeight, excluded),
    ])[0];
  }
  rawDraw(kind, rand, mainWeight = 100, excluded = new Set()) {
    if (kind === "character" && this.tenrai.manifest()) {
      const local = this.e
        .all(
          "SELECT * FROM catalog WHERE kind='character' AND active=1 ORDER BY id",
        )
        .filter((c) => !excluded.has(c.id));
      const overrides = this.e.all(
        "SELECT id,bulk_role FROM catalog WHERE bulk_role IS NOT NULL",
      );
      return this.tenrai.draw(rand, mainWeight, excluded, local, overrides);
    }
    const m = kind === "character" ? this.manifest() : null;
    const small = this.e
      .all("SELECT * FROM catalog WHERE kind=? AND active=1 ORDER BY id", kind)
      .filter((c) => !excluded.has(c.id));
    const overridden = m
      ? this.e.all(
          "SELECT id,bulk_role FROM catalog WHERE bulk_role IS NOT NULL",
        )
      : [];
    const blocked = new Set([...excluded, ...overridden.map((c) => c.id)]);
    const groups = ["main", "other"].map((role) => {
      const local = small.filter(
        (c) =>
          (kind === "character" && c.role === "main" ? "main" : "other") ===
          role,
      );
      const original = m?.groups[role] || 0;
      let unavailable = overridden.filter(
        (c) => (c.bulk_role === "main" ? "main" : "other") === role,
      ).length;
      for (const id of excluded) {
        if (overridden.some((c) => c.id === id)) continue;
        const c = this.bulkCard(id);
        if (c && (c.role === "main" ? "main" : "other") === role) unavailable++;
      }
      return {
        role,
        local,
        original,
        available: Math.max(0, original - unavailable),
        weight: kind === "character" && role === "main" ? mainWeight : 100,
      };
    });
    const total = groups.reduce(
      (n, g) => n + (g.local.length + g.available) * g.weight,
      0,
    );
    if (!total) fail("There are no available cards in this pool.");
    let r = rand(total),
      group;
    for (const g of groups) {
      const span = (g.local.length + g.available) * g.weight;
      if (r < span) {
        group = g;
        break;
      }
      r -= span;
    }
    const position = Math.floor(r / group.weight);
    if (position < group.local.length) return group.local[position];
    for (let attempt = 0; attempt < 200; attempt++) {
      const index = blocked.size
        ? rand(group.original)
        : position - group.local.length;
      const id = this.chunk(group.role, Math.floor(index / 500), m.version)?.[
        index % 500
      ];
      if (id && !blocked.has(id)) {
        const card = this.bulkCard(id);
        if (card) return card;
      }
    }
    fail("Could not select a card. Please retry.", 503);
  }
  page(kind = "character", query = "", page = 1, limit = 40) {
    if (!["character", "seiyuu"].includes(kind)) fail("Unknown catalog type.");
    integer(page, 1, 10000);
    integer(limit, 1, 100);
    const q = String(query).trim().toLowerCase().slice(0, 100),
      m = this.manifest(),
      offset = (page - 1) * limit;
    // Local cards and host overrides are usually a small set. Bulk browse rows
    // are already alphabetized and only matching bounded chunks are decoded.
    const local = this.e
      .all(
        "SELECT * FROM catalog WHERE kind=? AND active=1 ORDER BY name COLLATE NOCASE,id",
        kind,
      )
      .filter((c) => characterSearch(c).includes(q));
    const overrides = new Set(
      this.e
        .all("SELECT id FROM catalog WHERE bulk_role IS NOT NULL")
        .map((c) => c.id),
    );
    const cards = [];
    if (kind === "character" && this.tenrai.manifest()) {
      const result = this.tenrai.browse(q, offset, limit, local, overrides);
      return {
        ...result,
        cards: this.popularity.decorate(result.cards),
        page,
        limit,
        total: q ? null : this.summary()[kind],
      };
    }
    let seen = 0,
      more = false;
    const add = (c) => {
      if (seen++ < offset) return false;
      if (cards.length === limit) {
        more = true;
        return true;
      }
      cards.push(c);
      return false;
    };
    for (const c of local) if (add(c)) break;
    if (kind === "character" && m) {
      const buckets = this.e.all(
        "SELECT bucket FROM catalog_bulk WHERE version=? AND section=? AND (?='' OR instr(search,?)>0) ORDER BY bucket",
        m.version,
        "browse",
        q,
        q,
      );
      outer: for (const row of buckets) {
        if (more) break;
        // With no query/overrides, skip whole pages without decoding metadata.
        const count = Math.min(500, m.count - row.bucket * 500);
        if (!q && !overrides.size && seen + count <= offset) {
          seen += count;
          continue;
        }
        for (const c of this.chunk("browse", row.bucket, m.version)) {
          if (
            overrides.has(c.id) ||
            !(c.name + " " + c.series).toLowerCase().includes(q)
          )
            continue;
          if (add(c)) break outer;
        }
      }
    }
    return {
      cards: this.popularity.decorate(cards),
      page,
      limit,
      hasMore: more,
      total: q ? null : this.summary()[kind],
    };
  }
  importChunk(b) {
    if (this.e.one("SELECT key FROM catalog_meta WHERE key='acdb-retired'"))
      fail("ACDB was retired. Use the Tenrai importer.", 409);
    const version = text(b.version, 80),
      section = text(b.section, 20),
      bucket = integer(b.bucket, 0, 10000);
    if (
      !/^[a-f0-9]{16}$/.test(version) ||
      !["cards", "main", "other", "browse"].includes(section)
    )
      fail("Invalid ACDB chunk.");
    if (this.manifest()?.version === version)
      fail(
        "This catalog snapshot is already active; use host overrides for edits.",
        409,
      );
    let payload = b.payload;
    if (section === "cards" || section === "browse") {
      if (
        section === "cards" &&
        (!payload || Array.isArray(payload) || typeof payload !== "object")
      )
        fail("Invalid card bucket.");
      const cards = section === "cards" ? Object.values(payload) : payload;
      if (!Array.isArray(cards) || cards.length > 500)
        fail("A catalog chunk may hold up to 500 cards.");
      for (const c of cards) {
        if (
          !c ||
          !/^acdb-character-\d+$/.test(c.id) ||
          c.kind !== "character" ||
          !["main", "supporting", "unknown"].includes(c.role)
        )
          fail("Invalid ACDB character record.");
        text(c.name, 160);
        text(c.series, 500);
        if (
          typeof c.image !== "string" ||
          typeof c.source !== "string" ||
          !/^https:\/\/(?:www|ami)\.animecharactersdatabase\.com\//.test(
            c.image,
          ) ||
          c.source !==
            "https://www.animecharactersdatabase.com/characters.php?id=" +
              Number(c.id.split("-").at(-1))
        )
          fail("Invalid ACDB source/image URL.");
        if (
          section === "cards" &&
          (Math.floor(Number(c.id.split("-").at(-1)) / 500) !== bucket ||
            payload[c.id]?.id !== c.id)
        )
          fail("ACDB card is in the wrong bucket.");
      }
    } else if (
      !Array.isArray(payload) ||
      payload.length > 500 ||
      payload.some((id) => !/^acdb-character-\d+$/.test(id))
    )
      fail("Invalid ACDB pool chunk.");
    const search =
      section === "browse"
        ? payload.map((c) => (c.name + " " + c.series).toLowerCase()).join("\n")
        : "";
    const serialized = JSON.stringify(payload);
    if (serialized.length > 700000) fail("Catalog chunk is too large.");
    this.e.run(
      "INSERT INTO catalog_bulk VALUES(?,?,?,?,?) ON CONFLICT(version,section,bucket) DO UPDATE SET payload=excluded.payload,search=excluded.search",
      version,
      section,
      bucket,
      serialized,
      search,
    );
    return { message: "Catalog chunk saved.", section, bucket };
  }
  activate(b) {
    if (this.e.one("SELECT key FROM catalog_meta WHERE key='acdb-retired'"))
      fail("ACDB was retired. Use the Tenrai importer.", 409);
    const m = b.manifest;
    if (!m || !/^[a-f0-9]{16}$/.test(m.version) || m.provider !== "ACDB")
      fail("Invalid catalog manifest.");
    integer(m.count, 5, 500000);
    integer(m.groups?.main, 0, 500000);
    integer(m.groups?.other, 0, 500000);
    if (m.groups.main + m.groups.other !== m.count)
      fail("Catalog counts do not match.");
    const counts = { cards: 0, main: 0, other: 0, browse: 0 },
      roles = new Map();
    for (const row of this.e.all(
      "SELECT section,bucket FROM catalog_bulk WHERE version=?",
      m.version,
    )) {
      const data = this.chunk(row.section, row.bucket, m.version);
      counts[row.section] +=
        row.section === "cards" ? Object.keys(data).length : data.length;
      if (row.section === "cards")
        for (const c of Object.values(data)) roles.set(c.id, c.role);
    }
    if (
      counts.cards !== m.count ||
      counts.browse !== m.count ||
      counts.main !== m.groups.main ||
      counts.other !== m.groups.other
    )
      fail("Import is incomplete; catalog was not activated.");
    // Verify ordered, gap-free pool and browse chunks before committing activation.
    for (const section of ["main", "other", "browse"]) {
      const n = section === "browse" ? m.count : m.groups[section];
      for (let i = 0; i < Math.ceil(n / 500); i++) {
        const c = this.chunk(section, i, m.version);
        if (!c || c.length !== Math.min(500, n - i * 500))
          fail("A catalog chunk is missing or out of order.");
      }
    }
    const pooled = new Set(),
      browsed = new Set();
    for (const section of ["main", "other", "browse"]) {
      const n = section === "browse" ? m.count : m.groups[section];
      for (let i = 0; i < Math.ceil(n / 500); i++)
        for (const value of this.chunk(section, i, m.version)) {
          const id = section === "browse" ? value.id : value,
            seen = section === "browse" ? browsed : pooled;
          if (
            !roles.has(id) ||
            seen.has(id) ||
            (section !== "browse" &&
              (roles.get(id) === "main" ? "main" : "other") !== section)
          )
            fail(
              "Catalog indexes contain duplicate, missing or mismatched records.",
            );
          if (section === "browse" && value.role !== roles.get(id))
            fail("Browse role does not match the card record.");
          seen.add(id);
        }
    }
    this.e.run("UPDATE catalog SET bulk_role=NULL WHERE bulk_role IS NOT NULL");
    for (const c of this.e.all(
      "SELECT id FROM catalog WHERE id LIKE 'acdb-character-%'",
    ))
      if (roles.has(c.id))
        this.e.run(
          "UPDATE catalog SET bulk_role=? WHERE id=?",
          roles.get(c.id),
          c.id,
        );
    this.e.run(
      "INSERT OR REPLACE INTO catalog_meta VALUES('acdb',?)",
      JSON.stringify(m),
    );
    return {
      message: `Activated ${m.count} ACDB anime characters.`,
      manifest: m,
    };
  }
  retirementPreview() {
    return {
      at: this.e.now(),
      manifest: this.manifest(),
      inventory: this.e.all(
        "SELECT * FROM inventory WHERE card LIKE 'acdb-character-%'",
      ),
      auctions: this.e.all(
        "SELECT * FROM auctions WHERE card LIKE 'acdb-character-%'",
      ),
      avatars: this.e.all(
        "SELECT id,avatar_card FROM players WHERE avatar_card LIKE 'acdb-character-%'",
      ),
      overrides: this.e.all(
        "SELECT * FROM catalog WHERE id LIKE 'acdb-character-%'",
      ),
    };
  }
  retireAcdb(confirmation) {
    if (confirmation !== "REPLACE ACDB WITH TENRAI")
      fail("Type REPLACE ACDB WITH TENRAI to confirm.");
    if (this.e.one("SELECT key FROM catalog_meta WHERE key='acdb-retired'"))
      return { message: "ACDB has already been replaced." };
    const plan = this.retirementPreview();
    let refunded = 0;
    for (const a of plan.auctions)
      if (a.winner && a.bid > 0 && !a.claimed) {
        this.e.wallet(
          a.winner,
          a.bid,
          "ACDB catalogue replacement: auction refund",
        );
        refunded += a.bid;
      }
    this.e.run("DELETE FROM inventory WHERE card LIKE 'acdb-character-%'");
    this.e.run("DELETE FROM auctions WHERE card LIKE 'acdb-character-%'");
    this.e.run(
      "UPDATE players SET avatar_card=NULL WHERE avatar_card LIKE 'acdb-character-%'",
    );
    this.e.run("DELETE FROM catalog WHERE id LIKE 'acdb-character-%'");
    this.e.run("DELETE FROM catalog_bulk");
    this.e.run("DELETE FROM catalog_meta WHERE key='acdb'");
    // Keep idempotency receipts so old pack requests cannot charge again. Remove
    // their retired card payloads, rather than resurrecting cards on a retry.
    for (const r of this.e.all(
      "SELECT scope,key,result FROM receipts WHERE instr(result,'acdb-character-')>0",
    )) {
      const result = JSON.parse(r.result);
      if (Array.isArray(result.cards))
        result.cards = result.cards.filter(
          (c) => !c.id?.startsWith("acdb-character-"),
        );
      result.message =
        "This action was already completed before the ACDB catalogue was retired.";
      this.e.run(
        "UPDATE receipts SET result=? WHERE scope=? AND key=?",
        JSON.stringify(result),
        r.scope,
        r.key,
      );
    }
    this.tenrai.initialize();
    this.e.run(
      "INSERT INTO catalog_meta VALUES('acdb-retired',?)",
      JSON.stringify({
        at: this.e.now(),
        inventory: plan.inventory.length,
        auctions: plan.auctions.length,
        refunded,
      }),
    );
    return {
      message: "ACDB removed. Tenrai character import enabled.",
      removedInventory: plan.inventory.length,
      removedAuctions: plan.auctions.length,
      clearedAvatars: plan.avatars.length,
      refunded,
    };
  }
}
