import {
  fetchJikan,
  voiceCards,
  characterCards,
  animeTitles,
  VOICE_SOURCE,
} from "./jikan.js";

const KEY = "jikan-import",
  INTERVAL = 10000,
  LEASE = 60000;
const active = (s) =>
  s &&
  (["running", "waiting"].includes(s.status) ||
    (s.status === "completed" && s.favorites));

// One persisted request per alarm. A lease prevents overlapping fetches; a
// generation/lease check discards results after pause, reset or replacement.
export class JikanImport {
  constructor(engine, get = fetchJikan) {
    this.e = engine;
    this.get = get;
  }
  tx(fn) {
    return this.e.track("catalogImport", () => this.e.tx(fn));
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
  enableCharacters() {
    const old = this.read();
    if (old?.includeCharacters) return this.status();
    const now = this.e.now();
    this.save({
      ...old,
      page: 1,
      queue: [],
      hasMore: true,
      scannedTitles: 0,
      importedActors: old?.importedActors || 0,
      importedCharacters: 0,
      requests: old?.requests || 0,
      failures: 0,
      skippedTitles: 0,
      startedAt: now,
      provider: VOICE_SOURCE.name,
      includeCharacters: true,
      discoveryComplete: false,
      favorites: {
        status: "running",
        kind: "character",
        page: 1,
        scannedEntries: 0,
        requests: 0,
        intervalDays: 15,
      },
      generation: crypto.randomUUID(),
      leaseId: null,
      leaseUntil: 0,
      retryUntil: 0,
      lastError: null,
      lastStatus: null,
      nextAt: now + 1000,
      status: "running",
      updatedAt: now,
    });
    return this.status();
  }
  refreshFavorites(days = 15) {
    if (!Number.isSafeInteger(days) || days < 1 || days > 90)
      throw Object.assign(
        new Error("Choose a refresh interval from 1 to 90 days."),
        { status: 400 },
      );
    const s = this.read();
    if (!s?.includeCharacters)
      throw Object.assign(
        new Error("Enable the Tenrai character catalogue first."),
        { status: 409 },
      );
    if (s.favorites?.status === "running") {
      s.favorites.intervalDays = days;
      this.save(s);
      return this.status();
    }
    s.favorites = {
      ...s.favorites,
      status: "running",
      kind: "character",
      page: 1,
      scannedEntries: 0,
      requests: 0,
      intervalDays: days,
    };
    s.generation = crypto.randomUUID();
    s.leaseUntil = 0;
    s.leaseId = null;
    s.nextAt = Math.max(this.e.now() + 1000, s.retryUntil || 0);
    s.status = s.nextAt > this.e.now() + 1000 ? "waiting" : "running";
    this.save(s);
    return this.status();
  }
  start() {
    return this.tx(() => {
      const old = this.read();
      if (
        (active(old) && old.provider === VOICE_SOURCE.name) ||
        (old?.status === "completed" && !old.favorites)
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
      const sleeping = s.discoveryComplete && s.favorites?.status === "idle";
      s.nextAt = Math.max(
        now + 1000,
        s.retryUntil || 0,
        sleeping ? s.favorites.nextRefreshAt || 0 : 0,
      );
      s.status = sleeping
        ? "completed"
        : s.nextAt > now + 1000
          ? "waiting"
          : "running";
      s.updatedAt = now;
      this.save(s);
      return this.status();
    });
  }
  pause() {
    return this.tx(() => {
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
    const claimed = this.tx(() => {
      const s = this.read(),
        now = this.e.now();
      if (!active(s) || s.nextAt > now || s.leaseUntil > now) return null;
      s.leaseId = crypto.randomUUID();
      s.leaseUntil = now + LEASE;
      s.nextAt = now + INTERVAL;
      if (s.favorites?.status === "idle" && s.favorites.nextRefreshAt <= now) {
        s.favorites = {
          ...s.favorites,
          status: "running",
          kind: "character",
          page: 1,
          scannedEntries: 0,
          requests: 0,
        };
      }
      s.task =
        s.favorites?.status === "running" &&
        (s.discoveryComplete || s.requests % 5 === 4)
          ? "favorites"
          : "discovery";
      s.requests++;
      this.save(s);
      return s;
    });
    if (!claimed) return this.status();
    const title = claimed.queue[0];
    let data, error;
    try {
      data = await this.get(
        claimed.task === "favorites"
          ? `/${claimed.favorites.kind === "character" ? "characters" : "people"}?order_by=mal_id&sort=asc&limit=100&page=${claimed.favorites.page}`
          : title
            ? `/anime/${title.id}/characters`
            : `/anime?order_by=mal_id&sort=asc&limit=25&page=${claimed.page}`,
      );
    } catch (err) {
      error = err;
    }
    return this.tx(() => {
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
        if (
          error &&
          !(
            claimed.task !== "favorites" &&
            title &&
            error.upstreamStatus === 404
          )
        )
          throw error;
        if (claimed.task === "favorites") {
          if (
            !Array.isArray(data?.data) ||
            data.data.length > 100 ||
            typeof data.pagination?.has_next_page !== "boolean"
          )
            throw new Error("Invalid favorites pagination.");
          const f = s.favorites,
            prefix = f.kind === "character" ? "mal-character-" : "mal-person-";
          this.e.catalogStore.popularity.sync(
            f.kind,
            data.data
              .filter((p) => Number.isSafeInteger(p.mal_id) && p.mal_id > 0)
              .map((p) => [prefix + p.mal_id, p.favorites]),
          );
          f.scannedEntries += data.data.length;
          f.requests++;
          if (data.pagination.has_next_page) f.page++;
          else if (f.kind === "character") {
            f.kind = "seiyuu";
            f.page = 1;
          } else {
            f.status = "idle";
            f.lastCompletedAt = now;
            f.nextRefreshAt = now + f.intervalDays * 86400000;
          }
        } else if (title) {
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
            if (s.includeCharacters) {
              const characters = characterCards(data.data, title);
              s.importedCharacters =
                (s.importedCharacters || 0) +
                this.e.catalogStore.tenrai.upsert(characters);
              this.e.catalogStore.popularity.sync(
                "character",
                data.data.map((c) => [
                  "mal-character-" + c.character?.mal_id,
                  c.favorites,
                ]),
              );
              this.e.catalogStore.popularity.sync(
                "seiyuu",
                cards.map((c) => [c.id, c.favorites]),
              );
            }
          }
          s.queue.shift();
          s.scannedTitles++;
          if (!s.queue.length) {
            if (s.hasMore) s.page++;
            else {
              s.status = "completed";
              s.discoveryComplete = true;
            }
          }
        } else {
          if (
            !Array.isArray(data?.data) ||
            data.data.length > 25 ||
            typeof data.pagination?.has_next_page !== "boolean"
          )
            throw new Error("Invalid voice source anime pagination.");
          s.queue = data.data
            .map((t) => ({
              id: t.mal_id,
              title: t.title,
              title_english: animeTitles(t).series_english,
            }))
            .filter((t) => Number.isSafeInteger(t.id) && t.id > 0);
          s.hasMore = data.pagination.has_next_page;
          if (Number.isSafeInteger(data.pagination.items?.total))
            s.totalTitles = data.pagination.items.total;
          if (!s.queue.length) {
            if (s.hasMore) s.page++;
            else {
              s.status = "completed";
              s.discoveryComplete = true;
            }
          }
        }
        s.failures = 0;
        s.lastError = null;
        s.lastErrorType = null;
        s.lastStatus = null;
        s.retryUntil = 0;
        s.nextAt = now + INTERVAL;
        if (s.discoveryComplete && s.favorites?.status === "idle") {
          s.status = "completed";
          s.nextAt = s.favorites.nextRefreshAt;
        } else if (s.discoveryComplete && s.favorites?.status === "running")
          s.status = "running";
        else if (s.status !== "completed") s.status = "running";
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
