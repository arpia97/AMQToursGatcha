// Short-lived abuse protection, scoped to this object. Credential throttles
// remain persistent in SQLite; gameplay limits do not spend database writes.
export class BurstLimits {
  constructor(now = Date.now, maxKeys = 4096) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }
  take(key, capacity = 30, perSecond = 6) {
    const now = this.now();
    const previous = this.buckets.get(key);
    const tokens = previous
      ? Math.min(
          capacity,
          previous.tokens + (Math.max(0, now - previous.at) * perSecond) / 1000,
        )
      : capacity;
    if (tokens < 1) {
      const retryAfter = Math.max(1, Math.ceil((1 - tokens) / perSecond));
      throw Object.assign(
        new Error(
          `Too many requests at once. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
        ),
        { status: 429, retryAfter },
      );
    }
    // Refresh insertion order so a bounded map evicts the least recently used key.
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    if (this.buckets.size > this.maxKeys)
      this.buckets.delete(this.buckets.keys().next().value);
  }
}
