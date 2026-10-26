const DAY = 86400000;
export const nextBudgetDay = (now) => (Math.floor(now / DAY) + 1) * DAY + 1000;

// App-local estimates, not an account-wide billing report. Leave most daily
// free-plan capacity for interactive use and invisible platform/index overhead.
export class SqlBudget {
  constructor(load, save, now = Date.now) {
    this.save = save;
    this.now = now;
    this.value = load() || {};
    this.rollDay();
    if (!this.value.sources) {
      this.value.sources = {
        unattributed: {
          rowsRead: this.value.rowsRead,
          rowsWritten: this.value.rowsWritten,
        },
      };
      this.value.breakdownSince = this.now();
    }
    this.checkpoint = { ...this.value };
    this.lastFlush = this.now();
  }
  rollDay() {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (this.value.day !== day)
      this.value = {
        day,
        rowsRead: 0,
        rowsWritten: 0,
        sources: {},
        breakdownSince: this.now(),
      };
  }
  observe(read = 0, written = 0, source = "requests") {
    this.rollDay();
    this.value.rowsRead += read;
    this.value.rowsWritten += written;
    const usage = (this.value.sources[source] ||= {
      rowsRead: 0,
      rowsWritten: 0,
    });
    usage.rowsRead += read;
    usage.rowsWritten += written;
  }
  paused() {
    this.rollDay();
    return this.value.rowsRead >= 2000000 || this.value.rowsWritten >= 30000;
  }
  status() {
    const paused = this.paused();
    return {
      ...structuredClone(this.value),
      backgroundPaused: paused,
      nextResumeAt: paused ? nextBudgetDay(this.now()) : null,
    };
  }
  flush(force = false) {
    this.rollDay();
    const reads = this.value.rowsRead - (this.checkpoint.rowsRead || 0);
    const writes = this.value.rowsWritten - (this.checkpoint.rowsWritten || 0);
    const newDay = this.value.day !== this.checkpoint.day;
    if (!newDay && reads === 0 && writes === 0) return;
    // Keep conservative import-budget checkpoints without writing a SQL row
    // for every read-only poll. A restart can lose only this small tail.
    const newlyPaused =
      this.paused() &&
      this.checkpoint.rowsRead < 2000000 &&
      this.checkpoint.rowsWritten < 30000;
    if (
      !force &&
      !newDay &&
      !newlyPaused &&
      reads < 1000 &&
      writes < 100 &&
      this.now() - this.lastFlush < 60000
    )
      return;
    this.save(this.value);
    this.checkpoint = { ...this.value };
    this.lastFlush = this.now();
  }
}

export function storageQuotaResponse(err, now = Date.now()) {
  if (
    !/Exceeded allowed rows (?:read|written) in Durable Objects free tier/i.test(
      String(err?.message),
    )
  )
    return null;
  // Enforcement can remain active shortly after the published daily boundary.
  // Offer a bounded retry instead of incorrectly telling clients to wait a day.
  const next = Math.min(nextBudgetDay(now), now + 5 * 60000);
  return new Response(
    JSON.stringify({
      error:
        "Cloudflare is temporarily enforcing the free database limit. Daily limits normally reset at 09:00 KST. Your saved data is retained; please try again in a few minutes.",
      retryAt: next,
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(Math.ceil((next - now) / 1000)),
      },
    },
  );
}
