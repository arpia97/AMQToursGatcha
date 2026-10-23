import { fetchJikan, voiceCards, VOICE_SOURCE } from "./jikan.js";

const KEY = "jikan-import",
  INTERVAL = 10000,
  LEASE = 60000;
const active = (s) => s && ["running", "waiting"].includes(s.status);

// One persisted request per alarm. A lease prevents overlapping fetches; a
// generation/lease check discards results after pause, reset or replacement.
export class JikanImport {
  constructor(engine, get = fetchJikan) {
    this.e = engine;
    this.get = get;
  }
  read() {
    const row = this.e.one("SELECT value FROM catalog_meta WHERE key=?", KEY);
    return row ? JSON.parse(row.value) : null;
  }
  save(s) {
    this.e.run(
      "INSERT OR REPLACE INTO catalog_meta VALUES(?,?)",
      KEY,
      JSON.stringify(s),
    );
  }
  status() {
    const s = this.read();
    if (!s) return { status: "idle", importedActors: 0, scannedTitles: 0 };
    const { queue, generation, leaseId, leaseUntil, ...publicState } = s;
    return publicState;
  }
  nextAlarm() {
    const s = this.read();
    return active(s)
      ? Math.max(this.e.now() + 1000, s.nextAt || 0, s.leaseUntil || 0)
      : null;
  }
  start() {
    return this.e.tx(() => {
      const old = this.read();
      if (
        (active(old) && old.provider === VOICE_SOURCE.name) ||
        old?.status === "completed"
      )
        return this.status();
      const now = this.e.now();
      const s = old || {
        page: 1,
        queue: [],
        hasMore: true,
        scannedTitles: 0,
        importedActors: 0,
        requests: 0,
        failures: 0,
        skippedTitles: 0,
        startedAt: now,
      };
      // A provider migration keeps the queue and collectible IDs, but clears
      // backoff that belongs to the retired service.
      if (s.provider !== VOICE_SOURCE.name) {
        s.failures = 0;
        s.retryUntil = 0;
        s.lastError = null;
        s.lastStatus = null;
      }
      s.provider = VOICE_SOURCE.name;
      s.generation = crypto.randomUUID();
      s.leaseId = null;
      s.leaseUntil = 0;
      s.nextAt = Math.max(now + 1000, s.retryUntil || 0);
      s.status = s.nextAt > now + 1000 ? "waiting" : "running";
      s.updatedAt = now;
      this.save(s);
      return this.status();
    });
  }
  pause() {
    return this.e.tx(() => {
      const s = this.read();
      if (!s) return this.status();
      s.status = "paused";
      s.generation = crypto.randomUUID();
      s.leaseUntil = 0;
      s.leaseId = null;
      s.updatedAt = this.e.now();
      this.save(s);
      return this.status();
    });
  }
  async step() {
    const claimed = this.e.tx(() => {
      const s = this.read(),
        now = this.e.now();
      if (!active(s) || s.nextAt > now || s.leaseUntil > now) return null;
      s.leaseId = crypto.randomUUID();
      s.leaseUntil = now + LEASE;
      s.nextAt = now + INTERVAL;
      s.requests++;
      this.save(s);
      return s;
    });
    if (!claimed) return this.status();
    const title = claimed.queue[0];
    let data, error;
    try {
      data = await this.get(
        title
          ? `/anime/${title.id}/characters`
          : `/anime?order_by=mal_id&sort=asc&limit=25&page=${claimed.page}`,
      );
    } catch (err) {
      error = err;
    }
    return this.e.tx(() => {
      const s = this.read(),
        now = this.e.now();
      if (
        !active(s) ||
        s.generation !== claimed.generation ||
        s.leaseId !== claimed.leaseId
      )
        return this.status();
      s.leaseId = null;
      s.leaseUntil = 0;
      s.updatedAt = now;
      try {
        if (error && !(title && error.upstreamStatus === 404)) throw error;
        if (title) {
          if (error) s.skippedTitles++;
          else {
            const cards = voiceCards(data.data, "Voice actor");
            // Preserve existing actor identities, host edits and starter metadata.
            const fresh = cards.filter(
              (c) => !this.e.one("SELECT id FROM catalog WHERE id=?", c.id),
            );
            for (let i = 0; i < fresh.length; i += 500)
              this.e.host("catalog", { cards: fresh.slice(i, i + 500) });
            s.importedActors += fresh.length;
          }
          s.queue.shift();
          s.scannedTitles++;
          if (!s.queue.length) {
            if (s.hasMore) s.page++;
            else s.status = "completed";
          }
        } else {
          if (
            !Array.isArray(data?.data) ||
            data.data.length > 25 ||
            typeof data.pagination?.has_next_page !== "boolean"
          )
            throw new Error("Invalid voice source anime pagination.");
          s.queue = data.data
            .map((t) => ({ id: t.mal_id, title: t.title }))
            .filter((t) => Number.isSafeInteger(t.id) && t.id > 0);
          s.hasMore = data.pagination.has_next_page;
          if (Number.isSafeInteger(data.pagination.items?.total))
            s.totalTitles = data.pagination.items.total;
          if (!s.queue.length) {
            if (s.hasMore) s.page++;
            else s.status = "completed";
          }
        }
        s.failures = 0;
        s.lastError = null;
        s.lastErrorType = null;
        s.lastStatus = null;
        s.retryUntil = 0;
        s.nextAt = now + INTERVAL;
        if (s.status !== "completed") s.status = "running";
      } catch (err) {
        s.failures++;
        s.lastStatus = err.upstreamStatus || 0;
        s.lastError = s.lastStatus
          ? (s.provider || VOICE_SOURCE.name) +
            " returned HTTP " +
            s.lastStatus +
            "."
          : error?.errorCode === "UPSTREAM_TIMEOUT"
            ? "Tenrai request timed out after 20 seconds."
            : error?.errorCode === "UPSTREAM_NETWORK"
              ? "Could not connect to Tenrai."
              : "Voice source returned invalid data.";
        s.lastErrorType = error?.errorCode || "UPSTREAM_RESPONSE";
        s.nextAt =
          now +
          Math.max(
            err.retryMs || 0,
            Math.min(21600000, 300000 * 2 ** Math.min(s.failures - 1, 7)),
          );
        s.retryUntil = s.nextAt;
        s.status =
          s.lastStatus === 403 || s.lastStatus === 400 ? "paused" : "waiting";
      }
      this.save(s);
      return this.status();
    });
  }
}
