import { fail } from "./engine.js";

export const characterSearch = (c) =>
  [c.name, c.series, c.series_romaji, c.series_english]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// At most 500 identities per row. Updating one cast never rewrites the full pool.
export class TenraiCatalog {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS tenrai_characters(bucket INTEGER PRIMARY KEY,payload TEXT NOT NULL,main_count INTEGER NOT NULL,other_count INTEGER NOT NULL,search TEXT NOT NULL)",
    );
  }
  manifest() {
    const r = this.e.one(
      "SELECT value FROM catalog_meta WHERE key='tenrai-characters'",
    );
    return r ? JSON.parse(r.value) : null;
  }
  initialize() {
    if (!this.manifest())
      this.saveManifest({
        provider: "Tenrai",
        count: 0,
        groups: { main: 0, other: 0 },
        source: "https://myanimelist.net",
        updatedAt: this.e.now(),
      });
  }
  saveManifest(m) {
    this.e.run(
      "INSERT OR REPLACE INTO catalog_meta VALUES('tenrai-characters',?)",
      JSON.stringify(m),
    );
  }
  bucket(id) {
    const m = /^mal-character-(\d+)$/.exec(id);
    return m ? Math.floor(Number(m[1]) / 500) : null;
  }
  read(bucket) {
    const r = this.e.one(
      "SELECT payload FROM tenrai_characters WHERE bucket=?",
      bucket,
    );
    return r ? JSON.parse(r.payload) : {};
  }
  card(id) {
    const b = this.bucket(id);
    return b === null ? null : this.read(b)[id] || null;
  }
  upsert(cards) {
    this.initialize();
    const m = this.manifest(),
      buckets = new Map();
    let added = 0;
    for (const c of cards) {
      const b = this.bucket(c.id);
      if (b === null) fail("Invalid MAL character identity.");
      if (!buckets.has(b)) buckets.set(b, this.read(b));
      const data = buckets.get(b),
        old = data[c.id];
      if (!old) {
        data[c.id] = c;
        added++;
      }
      // Prefer a Main appearance as the primary series; later Supporting credits
      // cannot demote a character or replace the chosen series unpredictably.
      else if (old.role !== "main" && c.role === "main") data[c.id] = c;
    }
    for (const [b, data] of buckets) {
      const cards = Object.values(data),
        old = this.e.one(
          "SELECT main_count,other_count FROM tenrai_characters WHERE bucket=?",
          b,
        );
      const main = cards.filter((c) => c.role === "main").length,
        other = cards.length - main;
      m.groups.main += main - (old?.main_count || 0);
      m.groups.other += other - (old?.other_count || 0);
      const payload = JSON.stringify(data);
      const previous = this.e.one(
        "SELECT payload FROM tenrai_characters WHERE bucket=?",
        b,
      );
      if (previous?.payload !== payload)
        this.e.run(
          "INSERT OR REPLACE INTO tenrai_characters VALUES(?,?,?,?,?)",
          b,
          payload,
          main,
          other,
          cards.map(characterSearch).join("\n"),
        );
    }
    for (const c of cards) {
      const role = buckets.get(this.bucket(c.id))[c.id].role;
      const override = this.e.one(
        "SELECT bulk_role FROM catalog WHERE id=?",
        c.id,
      );
      if (override && override.bulk_role !== role)
        this.e.run("UPDATE catalog SET bulk_role=? WHERE id=?", role, c.id);
    }
    m.count = m.groups.main + m.groups.other;
    this.e.economy?.anime.index(
      cards.map(
        (c) =>
          this.e.one("SELECT * FROM catalog WHERE id=?", c.id) ||
          buckets.get(this.bucket(c.id))[c.id],
      ),
    );
    m.updatedAt = this.e.now();
    this.saveManifest(m);
    return added;
  }
  draw(rand, mainWeight, excluded, local, overrides, context = {}) {
    const m = this.manifest(),
      blocked = new Set([...excluded, ...overrides.map((c) => c.id)]);
    const groups = ["main", "other"].map((role) => {
      const own = local.filter(
        (c) => (c.role === "main" ? "main" : "other") === role,
      );
      let removed = overrides.filter(
        (c) => (c.bulk_role === "main" ? "main" : "other") === role,
      ).length;
      for (const id of excluded) {
        if (overrides.some((c) => c.id === id)) continue;
        const c = this.card(id);
        if (c && (c.role === "main" ? "main" : "other") === role) removed++;
      }
      return {
        role,
        own,
        original: m.groups[role],
        available: Math.max(0, m.groups[role] - removed),
        weight: role === "main" ? mainWeight : 100,
      };
    });
    const total = groups.reduce(
      (n, g) => n + (g.own.length + g.available) * g.weight,
      0,
    );
    if (!total) fail("There are no available cards in this pool.");
    let roll = rand(total),
      g;
    for (g of groups) {
      const span = (g.own.length + g.available) * g.weight;
      if (roll < span) break;
      roll -= span;
    }
    const index = Math.floor(roll / g.weight);
    if (index < g.own.length) return g.own[index];
    const rows = (context.bucketRows ||= this.e.all(
      "SELECT bucket,main_count,other_count FROM tenrai_characters ORDER BY bucket",
    ));
    for (let attempt = 0; attempt < 200; attempt++) {
      let pos = blocked.size ? rand(g.original) : index - g.own.length;
      for (const row of rows) {
        const count = g.role === "main" ? row.main_count : row.other_count;
        if (pos >= count) {
          pos -= count;
          continue;
        }
        const buckets = (context.buckets ||= new Map()),
          key = row.bucket + ":" + g.role;
        if (!buckets.has(key))
          buckets.set(
            key,
            Object.values(this.read(row.bucket)).filter(
              (c) => (c.role === "main" ? "main" : "other") === g.role,
            ),
          );
        const c = buckets.get(key)[pos];
        if (c && !blocked.has(c.id)) return c;
        break;
      }
    }
    fail("Could not select a card. Please retry.", 503);
  }
  browse(q, offset, limit, local, overrides) {
    const result = [];
    let seen = 0,
      more = false;
    const add = (c) => {
      if (seen++ < offset) return false;
      if (result.length === limit) {
        more = true;
        return true;
      }
      result.push(c);
      return false;
    };
    for (const c of local) if (add(c)) break;
    const rows = this.e.all(
      "SELECT bucket,main_count+other_count AS n FROM tenrai_characters WHERE ?='' OR instr(search,?)>0 ORDER BY bucket",
      q,
      q,
    );
    outer: for (const row of rows) {
      if (more) break;
      if (!q && !overrides.size && seen + row.n <= offset) {
        seen += row.n;
        continue;
      }
      for (const c of Object.values(this.read(row.bucket))) {
        if (overrides.has(c.id) || !characterSearch(c).includes(q)) continue;
        if (add(c)) break outer;
      }
    }
    return { cards: result, hasMore: more };
  }
}
