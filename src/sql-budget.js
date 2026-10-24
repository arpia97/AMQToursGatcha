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
  }
  rollDay() {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (this.value.day !== day)
      this.value = { day, rowsRead: 0, rowsWritten: 0 };
  }
  observe(read = 0, written = 0) {
    this.rollDay();
    this.value.rowsRead += read;
    this.value.rowsWritten += written;
  }
  paused() {
    this.rollDay();
    return this.value.rowsRead >= 2000000 || this.value.rowsWritten >= 30000;
  }
  status() {
    const paused = this.paused();
    return {
      ...this.value,
      backgroundPaused: paused,
      nextResumeAt: paused ? nextBudgetDay(this.now()) : null,
    };
  }
  flush() {
    this.rollDay();
    this.save(this.value);
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
