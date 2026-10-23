export const RARITY_BANDS = [
  [0.1, "AG"],
  [0.5, "Ubers"],
  [1, "SSS"],
  [2.5, "SS"],
  [5, "S"],
  [10, "A"],
  [20, "B"],
  [40, "C"],
  [100, "D"],
];
export const validFavorites = (n) => Number.isSafeInteger(n) && n >= 0;
const identity = (id) => /^mal-(character|person)-(\d+)$/.exec(id);

// Sparse histograms avoid sorting/writing every card when one favorite count changes.
export class Popularity {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS catalog_popularity(kind TEXT NOT NULL,bucket INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(kind,bucket))",
    );
  }
  read(kind, bucket) {
    const r = this.e.one(
      "SELECT payload FROM catalog_popularity WHERE kind=? AND bucket=?",
      kind,
      bucket,
    );
    return r ? JSON.parse(r.payload) : {};
  }
  histogram(kind) {
    const r = this.e.one(
      "SELECT value FROM catalog_meta WHERE key=?",
      "popularity-" + kind,
    );
    return r ? JSON.parse(r.value) : {};
  }
  sync(kind, entries) {
    const buckets = new Map(),
      hist = this.histogram(kind),
      known = new Map();
    let changed = 0;
    for (const [id, favorites] of entries) {
      if (!validFavorites(favorites)) continue;
      const match = identity(id);
      if (!match || (match[1] === "person" ? "seiyuu" : "character") !== kind)
        continue;
      if (!known.has(id)) known.set(id, !!this.e.catalogStore.rawCard(id));
      if (!known.get(id)) continue;
      const b = Math.floor(Number(match[2]) / 500);
      if (!buckets.has(b)) buckets.set(b, this.read(kind, b));
      const data = buckets.get(b),
        old = data[id];
      if (
        old?.favorites === favorites &&
        this.e.now() - old.checkedAt < 86400000
      )
        continue;
      if (old?.favorites !== favorites) {
        if (old) {
          hist[old.favorites]--;
          if (!hist[old.favorites]) delete hist[old.favorites];
        }
        hist[favorites] = (hist[favorites] || 0) + 1;
      }
      data[id] = { favorites, checkedAt: this.e.now() };
      changed++;
    }
    if (changed) {
      for (const [b, data] of buckets)
        this.e.run(
          "INSERT OR REPLACE INTO catalog_popularity VALUES(?,?,?)",
          kind,
          b,
          JSON.stringify(data),
        );
      this.e.run(
        "INSERT OR REPLACE INTO catalog_meta VALUES(?,?)",
        "popularity-" + kind,
        JSON.stringify(hist),
      );
    }
    return changed;
  }
  decorate(cards, context = {}) {
    const snapshots = (context.popSnapshots ||= new Map()),
      histograms = (context.popHistograms ||= new Map());
    return cards.map((c) => {
      if (!c) return c;
      const m = identity(c.id);
      if (!m) return { ...c, rarity: null };
      const kind = m[1] === "person" ? "seiyuu" : "character",
        b = Math.floor(Number(m[2]) / 500),
        key = kind + ":" + b;
      if (!snapshots.has(key)) snapshots.set(key, this.read(kind, b));
      const p = snapshots.get(key)[c.id];
      if (!p) return { ...c, rarity: null, favorites: null };
      if (!histograms.has(kind)) {
        let total = 0;
        const counts = this.histogram(kind);
        const ranks = new Map();
        for (const [favorites, n] of Object.entries(counts).sort(
          (a, b) => Number(b[0]) - Number(a[0]),
        )) {
          ranks.set(Number(favorites), total);
          total += n;
        }
        histograms.set(kind, { ranks, total, counts });
      }
      const { ranks, total, counts: hist } = histograms.get(kind);
      // Average tied ranks, so a large zero-favorite tie stays near the bottom
      // rather than granting the entire tie the highest member's percentile.
      const topPercent = total
        ? (((ranks.get(p.favorites) || 0) +
            ((hist[p.favorites] || 1) - 1) / 2) *
            100) /
          total
        : 100;
      const rarity = RARITY_BANDS.find(([cut]) => topPercent < cut)?.[1] || "D";
      return { ...c, ...p, rarity, topPercent, rankedPopulation: total };
    });
  }
}
