import { WEEK } from "./engine.js";
import { SHOP_PRICES } from "../public/card-values.js";
import { drawAuction } from "../public/auction-odds.js";
import {
  COMMUNITY_AUCTION_MS,
  FLASH_SHOP_MS,
  FLASH_WEIGHTS,
  flashDiscount,
} from "../public/community-market-rules.js";
const MONDAY = Date.UTC(2026, 0, 5);
const HOUR = 3_600_000;
const hourAtOrAfter = time => Math.ceil(time / HOUR) * HOUR;
export class CommunityMarket {
  constructor(e) {
    this.e = e;
    e.run("CREATE INDEX IF NOT EXISTS shop_end_time ON weekly_shop(ends,starts)");
    const shopColumns = e.all("PRAGMA table_info(weekly_shop)");
    if (!shopColumns.some(c => c.name === "base_price"))
      e.run("ALTER TABLE weekly_shop ADD COLUMN base_price INTEGER");
    if (!shopColumns.some(c => c.name === "discount_percent"))
      e.run("ALTER TABLE weekly_shop ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0");
    if (!e.all("PRAGMA table_info(auctions)").some((c) => c.name === "rolling"))
      e.run(
        "ALTER TABLE auctions ADD COLUMN rolling INTEGER NOT NULL DEFAULT 0",
      );
    if (!e.one("SELECT value FROM settings WHERE key='community_reform_at'")) {
      const boundary =
        MONDAY + (Math.floor((e.now() - MONDAY) / WEEK) + 1) * WEEK;
      const lastAuction =
        e.one(
          "SELECT max(ends) AS ends FROM auctions WHERE seller IS NULL AND closed=0",
        )?.ends || 0;
      const lastShop =
        e.one("SELECT max(ends) AS ends FROM weekly_shop")?.ends || 0;
      e.run(
        "INSERT INTO settings VALUES('community_reform_at',?)",
        Math.max(boundary, lastAuction, lastShop),
      );
    }
    e.run(
      "CREATE INDEX IF NOT EXISTS community_auction_due ON auctions(ends) WHERE seller IS NULL AND closed=0",
    );
  }
  activation() {
    return this.e.one(
      "SELECT value FROM settings WHERE key='community_reform_at'",
    ).value;
  }
  active() {
    return this.e.now() >= this.activation();
  }
  info() {
    const active = this.active(),
      now = this.e.now();
    const shopEnds = active
      ? this.e.one(
          "SELECT max(ends) AS ends FROM weekly_shop WHERE starts<=? AND ends>?",
          now,
          now,
        )?.ends
      : null;
    const window = active ? this.flashWindow(now) : null;
    return {
      active,
      activatesAt: this.activation(),
      auctionHours: 12,
      flashOpen: !!(window?.open || shopEnds),
      flashEnds: window?.open ? window.ends : shopEnds || null,
      flashNext: window ? window.next : null,
    };
  }
  auctions() {
    const e = this.e,
      now = e.now();
    for (const kind of ["character", "seiyuu"]) {
      const live = e.all(
        "SELECT card FROM auctions WHERE seller IS NULL AND kind=? AND closed=0 AND ends>?",
        kind,
        now,
      );
      if (live.length >= 5 || e.catalogStore.summary()[kind] < 5) continue;
      const pool = e.catalogStore.pool(kind).cards,
        selected = new Set(live.map((a) => a.card));
      for (let i = live.length; i < 5; i++) {
        const card = drawAuction(pool, e.rand, selected);
        selected.add(card.id);
        e.run(
          "INSERT INTO auctions(card,kind,starts,ends,rolling) VALUES(?,?,?,?,1)",
          card.id,
          kind,
          now,
          now + COMMUNITY_AUCTION_MS,
        );
      }
    }
  }
  flashAnchor() {
    return this.e.one("SELECT value FROM settings WHERE key='flash_shop_cycle_anchor'")?.value;
  }
  flashWindow(now, anchor = this.flashAnchor()) {
    if (anchor === undefined) return null;
    if (now < anchor) return { open: false, next: anchor };
    const cycle = 2 * FLASH_SHOP_MS;
    const start = anchor + Math.floor((now - anchor) / cycle) * cycle;
    const ends = start + FLASH_SHOP_MS;
    return { start, ends, next: start + cycle, open: now < ends };
  }
  activeFlashStock(now) {
    return this.e.one(
      "SELECT starts AS start,ends FROM weekly_shop WHERE starts<=? AND ends>? AND ends-starts=? ORDER BY ends DESC LIMIT 1",
      now, now, FLASH_SHOP_MS,
    );
  }
  ensureFlashSchedule(now) {
    let anchor = this.flashAnchor();
    if (anchor === undefined || anchor % HOUR !== 0) {
      const stock = this.activeFlashStock(now);
      if (stock) {
        // Preserve offers that are already live and align their next opening.
        anchor = stock.start % HOUR === 0 ? stock.start : hourAtOrAfter(stock.ends + FLASH_SHOP_MS);
      } else {
        const previous = this.flashWindow(now, anchor);
        const opening = hourAtOrAfter(previous?.open ? previous.start : previous?.next ?? now);
        anchor = opening >= now ? opening : hourAtOrAfter(previous.next);
      }
      this.e.run(
        "INSERT INTO settings VALUES('flash_shop_cycle_anchor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        anchor,
      );
    }
    return this.flashWindow(now, anchor);
  }
  refreshFlashStock(now) {
    const window = this.ensureFlashSchedule(now);
    const current = window.open ? window : this.activeFlashStock(now);
    if (!current) return;
    this.e.run("UPDATE weekly_shop SET ends=? WHERE starts=? AND ends=?", now, current.start, current.ends);
    this.refill(current.start, current.ends);
  }
  refill(start, ends, avoid = null) {
    const e = this.e;
    const current = e.all(
      "SELECT card FROM weekly_shop WHERE starts=? AND ends>? AND buyer IS NULL",
      start,
      e.now(),
    );
    const excluded = new Set(current.map((s) => s.card));
    if (excluded.size >= 10) return;
    const pool = ["character", "seiyuu"]
      .flatMap((kind) => e.catalogStore.pool(kind).cards)
      .filter((c) => FLASH_WEIGHTS[c.rarity] && !excluded.has(c.id));
    // Never dilute flash stock with low-tier cards when a catalogue is small.
    while (excluded.size < 10 && pool.length) {
      let available = pool.filter((c) => c.id !== avoid);
      if (!available.length) available = pool;
      const tiers = Object.entries(FLASH_WEIGHTS)
        .map(([rarity, weight]) => ({
          weight,
          cards: available.filter((c) => c.rarity === rarity),
        }))
        .filter((t) => t.cards.length);
      let roll = e.rand(tiers.reduce((n, t) => n + t.weight, 0));
      const tier = tiers.find((t) => (roll -= t.weight) < 0);
      const c = tier.cards[e.rand(tier.cards.length)];
      const discount = flashDiscount(e.rand);
      const original = SHOP_PRICES[c.rarity];
      e.run(
        "INSERT INTO weekly_shop(card,kind,price,starts,ends,base_price,discount_percent) VALUES(?,?,?,?,?,?,?)",
        c.id,
        c.kind,
        Math.max(1, Math.ceil(original * (100 - discount) / 100)),
        start,
        ends,
        original,
        discount,
      );
      excluded.add(c.id);
      pool.splice(
        pool.findIndex((x) => x.id === c.id),
        1,
      );
    }
  }
  tick() {
    const e = this.e,
      now = e.now();
    this.auctions();
    const window = this.ensureFlashSchedule(now);
    if (window.open && !e.one("SELECT id FROM weekly_shop WHERE starts=? AND ends=? LIMIT 1", window.start, window.ends))
      this.refill(window.start, window.ends);
    const scheduled = e.one("SELECT value FROM settings WHERE key='flash_shop_next'")?.value;
    if (Number(scheduled) !== window.next)
      e.run("INSERT INTO settings VALUES('flash_shop_next',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",window.next);
    return Math.min(
      window.open ? window.ends : window.next,
      e.one("SELECT min(ends) AS ends FROM weekly_shop WHERE ends>?", now)
        ?.ends || Infinity,
      e.one(
        "SELECT min(ends) AS ends FROM auctions WHERE seller IS NULL AND closed=0 AND ends>?",
        now,
      )?.ends || Infinity,
    );
  }
}
