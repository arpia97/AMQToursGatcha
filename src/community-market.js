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
export class CommunityMarket {
  constructor(e) {
    this.e = e;
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
      flashOpen: window ? now < window.ends : !!shopEnds,
      flashEnds: window && now < window.ends ? window.ends : shopEnds || null,
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
  scheduleFlash(from) {
    const at = from + FLASH_SHOP_MS;
    this.e.run(
      "INSERT INTO settings VALUES('flash_shop_next',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      at,
    );
    this.e.run(
      "INSERT INTO settings VALUES('flash_shop_cycle_anchor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      from - FLASH_SHOP_MS,
    );
  }
  flashWindow(now = this.e.now()) {
    const anchor = this.e.one("SELECT value FROM settings WHERE key='flash_shop_cycle_anchor'")?.value;
    if (anchor === undefined) return null;
    const start = Number(anchor) + Math.floor((now - Number(anchor)) / (2 * FLASH_SHOP_MS)) * 2 * FLASH_SHOP_MS;
    return { start, ends: start + FLASH_SHOP_MS, next: start + 2 * FLASH_SHOP_MS };
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
    let window = this.flashWindow(now);
    if (!window) {
      const recent = e.one(
        "SELECT starts,ends FROM weekly_shop WHERE starts<=? AND ends>? AND ends-starts=? ORDER BY ends DESC LIMIT 1",
        now, now - FLASH_SHOP_MS, FLASH_SHOP_MS,
      );
      const start = recent ? recent.ends - FLASH_SHOP_MS : now;
      this.scheduleFlash(start + FLASH_SHOP_MS);
      window = this.flashWindow(now);
    }
    const isOpen = now < window.ends;
    if (isOpen && !e.one("SELECT id FROM weekly_shop WHERE starts=? AND ends=? LIMIT 1", window.start, window.ends))
      this.refill(window.start, window.ends);
    const scheduled = e.one("SELECT value FROM settings WHERE key='flash_shop_next'")?.value;
    if (Number(scheduled) !== window.next)
      e.run("INSERT INTO settings VALUES('flash_shop_next',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",window.next);
    return Math.min(
      isOpen ? window.ends : window.next,
      e.one("SELECT min(ends) AS ends FROM weekly_shop WHERE ends>?", now)
        ?.ends || Infinity,
      window.next,
      e.one(
        "SELECT min(ends) AS ends FROM auctions WHERE seller IS NULL AND closed=0 AND ends>?",
        now,
      )?.ends || Infinity,
    );
  }
}
