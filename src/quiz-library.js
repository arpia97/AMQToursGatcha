import {
  compactLibrarySong,
  libraryBucket,
  libraryId,
  libraryTitles,
} from "../public/quiz-library-data.js";
export const WORKING_TITLES_URL =
  "https://raw.githubusercontent.com/4Lajf/amq-plus/main/src/lib/server/working-titles.json";
const SONG_URL = "https://anisongdb.com/api/ann_song_ids_request",
  ASSET = "https://quiz-assets.invalid/quiz-library/",
  INTERVAL = 30000,
  BATCH = 400;
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export async function libraryJSON(response, limit = 12000000) {
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const error = Object.assign(
      Error("Song source returned HTTP " + response.status),
      { status: 502 },
    );
    if (retry) {
      const seconds = Number(retry);
      error.retryMs = Number.isFinite(seconds)
        ? seconds * 1000
        : Math.max(0, Date.parse(retry) - Date.now());
    }
    throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Song source is empty.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw Error("Song source exceeds the safe refresh size.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const value of chunks) {
    bytes.set(value, offset);
    offset += value.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
// Separate metadata-only actor: no wallets, accounts, quiz attempts or reward state.
export class QuizLibraryCore {
  constructor(db, assets, fetcher = fetch, now = Date.now) {
    this.db = db;
    this.assets = assets;
    this.fetcher = fetcher;
    this.now = now;
    this.cache = new Map();
    db.run(
      "CREATE TABLE IF NOT EXISTS library_meta(key TEXT PRIMARY KEY,data TEXT NOT NULL)",
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS library_shards(version TEXT NOT NULL,bucket INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(version,bucket))",
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS library_receipts(key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,result TEXT NOT NULL)",
    );
  }
  get(key) {
    const r = this.db.one("SELECT data FROM library_meta WHERE key=?", key);
    return r ? JSON.parse(r.data) : null;
  }
  set(key, value) {
    this.db.run(
      "INSERT INTO library_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      key,
      JSON.stringify(value),
    );
  }
  async seed() {
    if (!this.seedData) {
      const m = await libraryJSON(
        await this.assets.fetch(new Request(ASSET + "manifest.json")),
        1500000,
      );
      if (
        m.schema !== 1 ||
        typeof m.version !== "string" ||
        !Number.isInteger(m.count) ||
        !Array.isArray(m.shards) ||
        !m.amq
      )
        throw Error("Invalid bundled song manifest.");
      this.seedData = m;
    }
    return this.seedData;
  }
  async active() {
    const version = this.get("active");
    return version ? this.get("manifest:" + version) : this.seed();
  }
  async shard(manifest, bucket) {
    const key = manifest.version + ":" + bucket;
    if (this.cache.has(key)) {
      const v = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, v);
      return v;
    }
    const row = this.db.one(
      "SELECT data FROM library_shards WHERE version=? AND bucket=?",
      manifest.version,
      bucket,
    );
    let value;
    if (row) value = JSON.parse(row.data);
    else if (
      manifest.version === (await this.seed()).version &&
      manifest.shards.includes(bucket)
    )
      value = await libraryJSON(
        await this.assets.fetch(new Request(ASSET + bucket + ".json")),
        1800000,
      );
    else value = {};
    this.cache.set(key, value);
    while (this.cache.size > 8)
      this.cache.delete(this.cache.keys().next().value);
    return value;
  }
  async lookup(query) {
    const manifest = await this.active(),
      anns = query.annSongIds || [],
      amqs = query.amqSongIds || [];
    if (
      !Array.isArray(anns) ||
      !Array.isArray(amqs) ||
      anns.length + amqs.length > 12000 ||
      [...anns, ...amqs].some((v) => !libraryId(v))
    )
      fail("Use Valid Song IDs.");
    const ids = new Set([
      ...anns.map(Number),
      ...amqs.flatMap((id) => manifest.amq[id] || []),
    ]);
    if (ids.size > 20000) fail("Song lookup is too large.");
    const grouped = new Map();
    for (const id of ids) {
      const b = libraryBucket(id);
      if (!grouped.has(b)) grouped.set(b, []);
      grouped.get(b).push(id);
    }
    const songs = [];
    for (const [b, values] of grouped) {
      const rows = await this.shard(manifest, b);
      for (const id of values) if (rows[id]) songs.push(rows[id]);
    }
    return { version: manifest.version, songs };
  }
  async status() {
    const m = await this.active(),
      j = this.get("job");
    return {
      current: {
        version: m.version,
        songs: m.count,
        requested: m.requested,
        missing: m.missing,
        updated: m.generatedAt,
        source: m.source,
        seed: m.version === (await this.seed()).version,
      },
      job: j
        ? {
            id: j.id,
            status: j.status,
            phase: j.phase,
            total: j.total || 0,
            processed: j.cursor || 0,
            percent:
              j.status === "completed"
                ? 100
                : j.phase === "finalize"
                  ? 90 +
                    Math.floor(
                      (9 * (j.finalIndex || 0)) / (j.shards?.length || 1),
                    )
                  : j.total
                    ? Math.floor((90 * j.cursor) / j.total)
                    : 0,
            missing: j.missing?.length || 0,
            retained: j.retained || 0,
            next: j.next || null,
            error: j.error || null,
          }
        : null,
      intervalSeconds: 30,
      batchSize: BATCH,
    };
  }
  async action(body, key) {
    if (typeof key !== "string" || key.length < 8 || key.length > 100)
      fail("A Refresh Request ID Is Required.");
    const fingerprint = JSON.stringify(body),
      old = this.db.one("SELECT * FROM library_receipts WHERE key=?", key);
    if (old) {
      if (old.fingerprint !== fingerprint)
        fail("This request ID was already used.", 409);
      return JSON.parse(old.result);
    }
    await this.seed();
    const now = this.now(),
      job = this.get("job");
    let value;
    this.db.tx(() => {
      if (body.action === "start") {
        if (job && !["completed", "cancelled"].includes(job.status)) {
          value = {
            message:
              "A refresh is already available. Resume or cancel it first.",
          };
          return;
        }
        if (job && now - job.started < 600000)
          fail("Wait ten minutes before starting another full refresh.", 429);
        this.set("job", {
          id: "refresh-" + crypto.randomUUID(),
          status: "running",
          phase: "titles",
          started: now,
          next: now,
          cursor: 0,
          total: 0,
          count: 0,
          missing: [],
          retained: 0,
          failures: 0,
        });
        value = {
          message:
            "Masterlist refresh started. The current list stays available.",
        };
      } else if (["pause", "resume", "cancel"].includes(body.action)) {
        if (!job || ["completed", "cancelled"].includes(job.status))
          fail("There is no active refresh.");
        if (body.action === "pause") job.status = "paused";
        if (body.action === "cancel") job.status = "cancelled";
        if (body.action === "resume") {
          job.status = "running";
          job.next = Math.max(job.next || now, now);
          job.failures = 0;
        }
        job.lease = null;
        this.set("job", job);
        value = {
          message:
            "Masterlist refresh " +
            { pause: "paused", resume: "resumed", cancel: "cancelled" }[
              body.action
            ] +
            ".",
        };
      } else fail("Choose a Masterlist Action.");
      this.db.run(
        "INSERT INTO library_receipts VALUES(?,?,?)",
        key,
        fingerprint,
        JSON.stringify(value),
      );
    });
    return { ...value, ...(await this.status()) };
  }
  nextAlarm() {
    const j = this.get("job");
    return j?.status === "running"
      ? Math.max(
          j.next || this.now(),
          j.leaseUntil && j.lease ? j.leaseUntil : 0,
        )
      : null;
  }
  writeShard(version, bucket, rows) {
    const data = JSON.stringify(rows);
    if (new TextEncoder().encode(data).byteLength > 1800000)
      throw Error("A song shard exceeds the storage bound.");
    this.db.run(
      "INSERT INTO library_shards VALUES(?,?,?) ON CONFLICT(version,bucket) DO UPDATE SET data=excluded.data",
      version,
      bucket,
      data,
    );
  }
  staged(version, bucket) {
    const r = this.db.one(
      "SELECT data FROM library_shards WHERE version=? AND bucket=?",
      version,
      bucket,
    );
    return r ? JSON.parse(r.data) : {};
  }
  async step() {
    let job = this.get("job");
    if (
      !job ||
      job.status !== "running" ||
      job.next > this.now() ||
      (job.lease && job.leaseUntil > this.now())
    )
      return;
    const lease = crypto.randomUUID();
    job.lease = lease;
    job.leaseUntil = this.now() + 90000;
    job.next = job.leaseUntil;
    this.set("job", job);
    const owns = () => {
      const current = this.get("job");
      return (
        current?.id === job.id &&
        current.status === "running" &&
        current.lease === lease
      );
    };
    try {
      if (job.phase === "titles") {
        const titleResponse = await this.fetcher(WORKING_TITLES_URL, {
            signal: AbortSignal.timeout(20000),
          }),
          titles = await libraryJSON(titleResponse, 16000000),
          active = await this.active();
        job.workingTitlesETag = titleResponse.headers.get("etag");
        if (!titles || Array.isArray(titles) || typeof titles !== "object")
          throw Error("Invalid working-title map.");
        const ids = Object.keys(titles)
          .map(Number)
          .sort((a, b) => a - b);
        if (
          ids.length < Math.max(1, Math.floor(active.requested * 0.9)) ||
          ids.length > 80000 ||
          ids.some(
            (id) =>
              !libraryId(id) ||
              !Array.isArray(titles[id]) ||
              !libraryTitles([titles[id]]).length,
          )
        )
          throw Error(
            "Working-title map is incomplete or exceeds the safe index size; the current list was kept.",
          );
        const shards = new Map();
        for (const id of ids) {
          const b = libraryBucket(id);
          if (!shards.has(b)) shards.set(b, {});
          shards.get(b)[id] = libraryTitles([titles[id]]);
        }
        if (!owns()) return;
        this.db.tx(() => {
          for (const [b, rows] of shards)
            this.writeShard(job.id + ":titles", b, rows);
        });
        job = {
          ...job,
          ids,
          total: ids.length,
          phase: "songs",
          shards: [...shards.keys()],
          cursor: 0,
        };
      } else if (job.phase === "songs") {
        const ids = job.ids.slice(job.cursor, job.cursor + BATCH),
          wanted = new Set(ids),
          response = await this.fetcher(SONG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ann_song_ids: ids,
              ignore_duplicate: false,
            }),
            signal: AbortSignal.timeout(20000),
          }),
          data = await libraryJSON(response);
        if (!Array.isArray(data) || data.length > ids.length)
          throw Error("Invalid song batch.");
        const found = new Map();
        for (const row of data) {
          const id = libraryId(row?.annSongId);
          if (!wanted.has(id) || found.has(id))
            throw Error("Unexpected or duplicate song ID in refresh.");
          found.set(id, row);
        }
        const old = new Map(
            (await this.lookup({ annSongIds: ids })).songs.map((s) => [
              s.annSongId,
              s,
            ]),
          ),
          buckets = new Map(),
          titleBuckets = new Map();
        for (const id of ids) {
          const b = libraryBucket(id);
          if (!titleBuckets.has(b))
            titleBuckets.set(b, this.staged(job.id + ":titles", b));
          const fresh = compactLibrarySong(
              found.get(id),
              titleBuckets.get(b)[id],
            ),
            song =
              fresh || compactLibrarySong(old.get(id), titleBuckets.get(b)[id]);
          if (!song) {
            job.missing.push(id);
            continue;
          }
          if (!fresh) job.retained++;
          if (!song.audio && old.get(id)?.audio) song.audio = old.get(id).audio;
          if (!buckets.has(b)) buckets.set(b, this.staged(job.id, b));
          buckets.get(b)[id] = song;
          job.count++;
        }
        if (!owns()) return;
        this.db.tx(() => {
          for (const [b, rows] of buckets) this.writeShard(job.id, b, rows);
        });
        job.cursor += ids.length;
        if (job.cursor === job.total) {
          job.phase = "finalize";
          job.finalIndex = 0;
          job.amq = {};
          job.validatedCount = 0;
          delete job.ids;
        }
      } else if (job.phase === "finalize") {
        for (const b of job.shards.slice(job.finalIndex, job.finalIndex + 8)) {
          for (const [id, s] of Object.entries(this.staged(job.id, b))) {
            if (
              Number(id) !== s.annSongId ||
              libraryBucket(id) !== b ||
              !s.titles?.length
            )
              throw Error("Song cache validation failed.");
            job.validatedCount++;
            if (s.amqSongId) (job.amq[s.amqSongId] ||= []).push(s.annSongId);
          }
        }
        job.finalIndex = Math.min(job.shards.length, job.finalIndex + 8);
        if (job.finalIndex === job.shards.length) {
          if (
            job.validatedCount !== job.count ||
            job.count < Math.floor((await this.active()).count * 0.9)
          )
            throw Error(
              "Refreshed song cache is incomplete; the current list was kept.",
            );
          const previous = await this.active(),
            manifest = {
              schema: 1,
              version: job.id,
              source: "AMQ Plus / AnisongDB",
              workingTitlesURL: WORKING_TITLES_URL,
              workingTitlesETag: job.workingTitlesETag,
              generatedAt: new Date(this.now()).toISOString(),
              count: job.count,
              requested: job.total,
              missing: job.missing,
              retained: job.retained,
              shards: job.shards,
              amq: job.amq,
            };
          if (!owns()) return;
          this.db.tx(() => {
            this.set("manifest:" + job.id, manifest);
            this.set("active", job.id);
            job.status = "completed";
            job.finished = this.now();
            delete job.ids;
            delete job.amq;
            job.lease = null;
            this.set("job", job);
            this.db.run(
              "DELETE FROM library_shards WHERE version NOT IN (?,?)",
              job.id,
              previous.version,
            );
            this.db.run(
              "DELETE FROM library_meta WHERE key LIKE 'manifest:%' AND key NOT IN (?,?)",
              "manifest:" + job.id,
              "manifest:" + previous.version,
            );
          });
          this.cache.clear();
          return;
        }
      } else throw Error("Unknown refresh phase.");
      if (owns()) {
        job.lease = null;
        job.failures = 0;
        job.error = null;
        job.next = this.now() + INTERVAL;
        this.set("job", job);
      }
    } catch (error) {
      if (!owns()) return;
      job = this.get("job");
      job.lease = null;
      job.failures = (job.failures || 0) + 1;
      job.error = String(error.message || "Refresh failed.").slice(0, 300);
      job.next =
        this.now() +
        Math.max(
          INTERVAL,
          Math.min(86400000, error.retryMs || 0),
          Math.min(1800000, INTERVAL * 2 ** (job.failures - 1)),
        );
      if (job.failures >= 6) job.status = "paused";
      this.set("job", job);
    }
  }
}
