import { validateAvatarCrop } from "../public/avatar-crop.js";
import { CreditAudit } from "./credit-audit.js";
import { setAccountLock } from "./account-lock.js";
import { migrateTradeDefaults } from "./trade-defaults.js";
import { profileSearchSql } from "./search.js";
import { migrateEnhancements } from "./enhancement-migration.js";
import {
  MAX_CARD_LEVEL,
  enhancementCost,
  ENHANCEMENT_REVISION,
} from "../public/card-values.js";
import { validFavorites } from "./popularity.js";
import { CardTitles } from "./card-titles.js";
import { Quiz } from "./quiz.js";
import {
  PICKEM_WINNER_REWARD,
  PICKEM_WINDOW,
  defaultReward,
} from "../public/site-defaults.js";
import { Catalog } from "./catalog.js";
import { Economy, PREMIUM_RULE } from "./economy.js";
import { drawAuction, drawFeatured } from "../public/auction-odds.js";
import { PickemEvents } from "./pickem-events.js";
import { pickemOutcome } from "../public/pickem-formats.js";
import { Participation } from "./participation.js";
import { RARITIES } from "../public/card-values.js";
import {
  minimumBid,
  COMMUNITY_AUCTION_MS,
} from "../public/community-market-rules.js";
// All economic operations run inside one synchronous SQLite transaction.
// The same engine is exercised against real SQLite in tests and Durable Objects in production.
export const WEEK = 7 * 86400000;
const MONDAY = Date.UTC(2026, 0, 5);
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function integer(n, min = 0, max = 100000000) {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(`Enter a whole number from ${min} to ${max}.`);
  return n;
}
export function text(s, max = 160) {
  if (typeof s !== "string" || !s.trim() || s.length > max)
    fail("A valid text value is required.");
  return s.trim();
}
export function randomInt(n) {
  integer(n, 1, 100000000);
  const limit = Math.floor(4294967296 / n) * n;
  let v;
  do {
    v = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (v >= limit);
  return v % n;
}
export class Engine {
  constructor(db, transaction, now = () => Date.now(), rand = randomInt) {
    this.db = db;
    this.transaction = transaction;
    this.now = now;
    this.rand = rand;
    for (const statement of SCHEMA.split(";").filter((s) => s.trim()))
      this.run(statement);
    for (const [table, column, definition] of [
      ["players", "display_name", "TEXT"],
      ["players", "avatar_card", "TEXT"],
      ["players", "avatar_crop", "TEXT"],
      ["players", "is_admin", "INTEGER NOT NULL DEFAULT 0"],
      ["players", "access_reset", "INTEGER NOT NULL DEFAULT 0"],
      ["players", "account_locked", "INTEGER NOT NULL DEFAULT 0"],
      ["inventory", "acquired_at", "INTEGER NOT NULL DEFAULT 0"],
      ["inventory", "protected", "INTEGER NOT NULL DEFAULT 0"],
      ["inventory", "for_trade", "INTEGER NOT NULL DEFAULT 0"],
      ["inventory", "position", "INTEGER"],
      ["catalog", "role", "TEXT NOT NULL DEFAULT 'supporting'"],
      ["catalog", "bulk_role", "TEXT"],
      ["catalog", "series_romaji", "TEXT NOT NULL DEFAULT ''"],
      ["catalog", "searchText", "TEXT NOT NULL DEFAULT ''"],
      ["catalog", "series_english", "TEXT NOT NULL DEFAULT ''"],
      ["catalog", "fixed_rarity", "TEXT"],
    ]) {
      if (
        !this.all(`PRAGMA table_info(${table})`).some((c) => c.name === column)
      )
        this.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    this.run(
      "INSERT OR IGNORE INTO settings VALUES ('character_price',500),('seiyuu_price',500)",
    );
    this.run("INSERT OR IGNORE INTO settings VALUES ('main_weight',100)");
    this.run(
      "INSERT OR IGNORE INTO settings VALUES ('beta_registration_enabled',1)",
    );
    this.run(
      "UPDATE settings SET value=100 WHERE key='main_weight' AND value!=100",
    );
    for (const sql of [
      "CREATE INDEX IF NOT EXISTS catalog_kind_name ON catalog(kind,active,name COLLATE NOCASE,id)",
      "CREATE INDEX IF NOT EXISTS catalog_kind_id ON catalog(kind,active,id)",
      "CREATE INDEX IF NOT EXISTS catalog_bulk_overrides ON catalog(bulk_role) WHERE bulk_role IS NOT NULL",
      "CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires)",
      "CREATE INDEX IF NOT EXISTS throttle_expiry ON throttle(expires)",
      "CREATE INDEX IF NOT EXISTS players_invite_expiry ON players(invite_expires)",
      "CREATE INDEX IF NOT EXISTS player_earned ON players(earned DESC,id)",
      "CREATE INDEX IF NOT EXISTS inventory_order ON inventory(player,position IS NULL,position,acquired_at DESC,card)",
    ])
      this.run(sql);
    this.catalogStore = new Catalog(this);
    this.economy = new Economy(this);
    this.pickemEvents = new PickemEvents(this);
    this.participation = new Participation(this);
    this.quiz = new Quiz(this);
    this.creditAudit = new CreditAudit(this);
    this.cardTitles = new CardTitles(this);
    migrateEnhancements(this);
    this.cardTitles.backfill();
    migrateTradeDefaults(this);
    this.run(
      "CREATE INDEX IF NOT EXISTS players_admin ON players(is_admin,id)",
    );
    this.run(
      "UPDATE players SET is_admin=0 WHERE is_admin!=0 AND id!='368' AND id NOT IN (SELECT player FROM host_delegations)",
    );
  }
  all(sql, ...args) {
    return this.db(sql, ...args);
  }
  one(sql, ...args) {
    return this.all(sql, ...args)[0];
  }
  run(sql, ...args) {
    this.db(sql, ...args);
    const metaOnly =
      /\bcatalog_meta\b/i.test(sql) &&
      !/\b(catalog|catalog_popularity|tenrai_characters|catalog_bulk)\b/i.test(
        sql,
      );
    const housekeeping =
      metaOnly &&
      ["jikan-import", "alias-sync", "series-backfill", "sql-budget"].some(
        (key) => args[0] === key || sql.includes("'" + key + "'"),
      );
    if (
      /\b(catalog|catalog_meta|catalog_popularity|tenrai_characters|catalog_bulk)\b/i.test(
        sql,
      ) &&
      this.catalogStore &&
      !housekeeping
    )
      this.catalogStore.invalidate();
  }
  tx(fn) {
    const catalogRevision = this.catalogStore?.revision || 0;
    try {
      return this.transaction(fn);
    } catch (err) {
      if ((this.catalogStore?.revision || 0) !== catalogRevision)
        this.catalogStore?.invalidate();
      throw err;
    }
  }
  track(source, fn) {
    // The scope is synchronous. Never hold it across an upstream await: another
    // player's request can run while an importer fetch is in flight.
    const previous = this.usageSource;
    this.usageSource = source;
    try {
      return fn();
    } finally {
      this.usageSource = previous;
    }
  }
  player(id) {
    const p = this.one(
      "SELECT id,COALESCE(display_name,name) AS name,balance,earned,daily,daily_pack,avatar_card,avatar_crop,account_locked,COALESCE((SELECT slots FROM showcase_capacity WHERE player=players.id),30) AS showcase_slots,CASE WHEN id='368' OR id IN (SELECT player FROM host_delegations) THEN is_admin ELSE 0 END AS is_admin FROM players WHERE id=?",
      id,
    );
    if (!p) fail("Unknown AMQ player ID.", 404);
    return { ...p, role: p.is_admin ? "Host" : null };
  }
  assertAccountUnlocked(id) {
    const p=this.one("SELECT account_locked FROM players WHERE id=?",id);
    if(!p) fail("Unknown AMQ player ID.",404);
    if(p.account_locked) fail("This account is locked. Contact the host.",403);
  }
  account(id) {
    if (!id) return null;
    const player = this.player(id);
    return {
      id: player.id,
      name: player.name,
      host: !!player.is_admin,
      owner: player.id === "368",
      locked: !!player.account_locked,
      aliases: this.all(
        "SELECT alias FROM aliases WHERE player=? ORDER BY alias",
        id,
      ).map((row) => row.alias),
    };
  }
  hostIdentity(hash) {
    return (
      this.one(
        "SELECT p.id FROM sessions s JOIN players p ON p.id=s.player WHERE s.token=? AND s.expires>? AND p.is_admin=1 AND (p.id='368' OR p.id IN (SELECT player FROM host_delegations))",
        hash,
        this.now(),
      )?.id || null
    );
  }
  adminSession(hash) {
    return !!this.hostIdentity(hash);
  }
  setHostAccess(actor, b) {
    if (actor !== "368") fail("Only arpia97 can manage host permissions.", 403);
    const id = text(b.player, 100);
    if (typeof b.enabled !== "boolean") fail("Choose grant or revoke.");
    if (id === "368") fail("The owner’s host access cannot be changed.", 403);
    const p = this.one("SELECT password FROM players WHERE id=?", id);
    if (!p) fail("Unknown AMQ player ID.", 404);
    if (b.enabled && !p.password)
      fail("The player must register before receiving host access.");
    this.run("UPDATE players SET is_admin=? WHERE id=?", b.enabled ? 1 : 0, id);
    if (b.enabled)
      this.run(
        "INSERT OR REPLACE INTO host_delegations(player,granted_by) VALUES(?,'368')",
        id,
      );
    else this.run("DELETE FROM host_delegations WHERE player=?", id);
    this.run(
      "INSERT INTO host_access_log(actor,player,enabled,at) VALUES(?,?,?,?)",
      actor,
      id,
      b.enabled ? 1 : 0,
      this.now(),
    );
    return {
      message: b.enabled
        ? "Host access granted."
        : "Host access revoked immediately.",
    };
  }
  deductionQuote(b) {
    const player = text(b.player, 100),
      p = this.player(player),
      amount = integer(b.amount, 1, 1000000),
      note = text(b.note?.trim() || "Host credit deduction", 240);
    if (amount > p.balance)
      fail("This player does not have enough available credits.");
    return {
      player,
      name: p.name,
      amount,
      note,
      expectedBalance: p.balance,
      remaining: p.balance - amount,
    };
  }
  wallet(id, delta, reason, earned = false) {
    const p = this.player(id);
    // Bulk settlements must continue paying other players when one is locked.
    if(p.account_locked && earned && delta>0) return false;
    const balance = p.balance + delta;
    if (balance < 0) fail("Not enough available credits.");
    if (!Number.isSafeInteger(balance) || balance > 1000000000000)
      fail("Wallet limit exceeded.");
    this.run(
      "UPDATE players SET balance=?,earned=earned+? WHERE id=?",
      balance,
      earned ? delta : 0,
      id,
    );
    this.run(
      "INSERT INTO ledger(player,delta,reason,at) VALUES(?,?,?,?)",
      id,
      delta,
      reason,
      this.now(),
    );
  }
  addCard(player, card, count = 1) {
    this.run(
      "INSERT INTO inventory(player,card,copies,level,acquired_at) VALUES(?,?,?,1,?) ON CONFLICT(player,card) DO UPDATE SET copies=copies+excluded.copies",
      player,
      card,
      count,
      this.now(),
    );
  }
  mutate(scope, key, body, fn) {
    text(key, 100);
    const fingerprint = JSON.stringify(body);
    return this.tx(() => {
      const old = this.one(
        "SELECT * FROM receipts WHERE scope=? AND key=?",
        scope,
        key,
      );
      if (old) {
        if (old.input !== fingerprint)
          fail("This request ID was used for a different action.", 409);
        return JSON.parse(old.result);
      }
      const result = fn();
      this.run(
        "INSERT INTO receipts VALUES(?,?,?,?,?)",
        scope,
        key,
        fingerprint,
        JSON.stringify(result),
        this.now(),
      );
      return result;
    });
  }
  seedCommunityAuctions(start, onlyKind) {
    for (const kind of onlyKind ? [onlyKind] : ["character", "seiyuu"]) {
      const selected = new Set();
      const pool = this.catalogStore.pool(kind).cards;
      for (let i = 0; i < 5; i++) {
        const card = drawAuction(pool, this.rand, selected);
        selected.add(card.id);
        this.run(
          "INSERT INTO auctions(card,kind,starts,ends) VALUES(?,?,?,?)",
          card.id,
          kind,
          start,
          start + WEEK,
        );
      }
    }
  }
  ensureAuctions() {
    return this.tx(() => {
      const now = this.now();
      this.run("UPDATE auctions SET closed=1 WHERE ends<=? AND closed=0", now);
      const start = MONDAY + Math.floor((now - MONDAY) / WEEK) * WEEK;
      if (this.economy.community.active()) return this.economy.tick(start);
      for (const kind of ["character", "seiyuu"]) {
        if (
          this.one(
            "SELECT id FROM auctions WHERE starts=? AND kind=? AND seller IS NULL",
            start,
            kind,
          )
        )
          continue;
        if (this.catalogStore.summary()[kind] < 5) continue;
        this.seedCommunityAuctions(start, kind);
      }
      return Math.min(start + WEEK, this.economy.tick(start));
    });
  }
  action(player, action, b) {
    const now = this.now();
    this.assertAccountUnlocked(player);
    if (
      ["quiz-ready", "quiz-answer", "quiz-next"].includes(action)
    )
      return this.quiz.action(player, action, b);
    this.player(player);
    if (action === "equip-titles") return this.quiz.equipTitles(player, b);
    if (["quiz-start", "quiz-restart", "quiz-stop"].includes(action))
      return this.quiz.action(player, action, b);
    const additional = this.economy.action(player, action, b);
    if (additional) return additional;
    if (action === "daily") {
      return this.economy.daily(player);
    }
    if (action === "pack") {
      if (!["character", "seiyuu"].includes(b.kind))
        fail("Choose a pack type.");
      if (this.catalogStore.summary()[b.kind] < 5)
        fail("The host needs to add at least five cards to this catalog.");
      if (b.premium !== undefined && typeof b.premium !== "boolean")
        fail("Invalid pack type.");
      const premium = b.premium === true;
      const count = integer(b.count ?? 1, 1, 100);
      const price = this.one(
        "SELECT value FROM settings WHERE key=?",
        (premium ? "premium_" : "") + b.kind + "_price",
      ).value;
      this.wallet(
        player,
        -price * count,
        `${premium ? "Premium " : ""}${b.kind} pack${count > 1 ? " × " + count : ""}`,
      );
      const weight = 100;
      const drawContext = {};
      const selected = Array.from({ length: 5 * count }, () =>
        premium
          ? this.economy.premiumDraw(b.kind, drawContext)
          : this.catalogStore.draw(
              b.kind,
              this.rand,
              weight,
              new Set(),
              drawContext,
            ),
      );
      const pulls = this.catalogStore.cards(selected.map((c) => c.id));
      for (const card of pulls) this.addCard(player, card.id);
      return {
        message: pulls.length + " new cards for your collection.",
        cards: pulls,
        packCount: count,
        cost: price * count,
      };
    }
    if (action === "enhance") {
      const item = this.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        text(b.card),
      );
      if (!item) fail("You do not own this card.");
      if (
        b.enhancementRevision !== ENHANCEMENT_REVISION ||
        b.expectedLevel !== item.level
      )
        fail(
          "Enhancement rules or card level changed. Refresh and review again.",
          409,
        );
      if (item.level >= MAX_CARD_LEVEL) fail("Maximum level reached.");
      const cost = enhancementCost(item.level);
      if (item.copies - 1 < cost)
        fail(`You need ${cost} extra copies to reach level ${item.level + 1}.`);
      this.run(
        "UPDATE inventory SET copies=copies-?,level=level+1 WHERE player=? AND card=?",
        cost,
        player,
        b.card,
      );
      const title =
        item.level + 1 === MAX_CARD_LEVEL
          ? this.cardTitles.award(player, b.card)
          : null;
      return {
        message:
          item.level + 1 === MAX_CARD_LEVEL
            ? "Enhanced to MAX. Title Unlocked: " + title + "."
            : `Enhanced to level ${item.level + 1}.`,
      };
    }
    if (action === "bid") {
      const a = this.one(
        "SELECT * FROM auctions WHERE id=?",
        integer(b.auction, 1),
      );
      if (!a || a.closed || now >= a.ends) fail("This auction has ended.", 409);
      if (a.seller === player) fail("You cannot bid on your own auction.");
      if(a.seller) this.assertAccountUnlocked(a.seller);
      const amount = integer(b.amount, 1);
      if (a.buyout && amount >= a.buyout)
        return this.economy.buyout(player, a.id);
      if (amount < minimumBid(a))
        fail(`The minimum bid is ${minimumBid(a)} credits.`);
      if (a.winner === player)
        this.wallet(player, -(amount - a.bid), "Auction bid increase");
      else {
        this.wallet(player, -amount, "Auction bid held");
        if (a.winner) {
          this.wallet(a.winner, a.bid, "Outbid refund");
          this.economy.notices.add(
            a.winner,
            `outbid:${a.id}:${a.bid}`,
            "outbid",
            a.card,
            a.level,
            a.bid,
          );
        }
      }
      this.run(
        "UPDATE auctions SET bid=?,winner=?,ends=? WHERE id=?",
        amount,
        player,
        a.rolling ? now + COMMUNITY_AUCTION_MS : a.ends,
        a.id,
      );
      return {
        message:
          "You’re the highest bidder. Credits are held until you win or are outbid.",
      };
    }
    if (action === "claim") {
      const a = this.one(
        "SELECT * FROM auctions WHERE id=?",
        integer(b.auction, 1),
      );
      if (!a || now < a.ends || a.winner !== player || a.claimed)
        fail("This auction cannot be claimed.", 409);
      this.economy.acquire(player, a.card, a.level, a.extra_copies);
      if (a.seller && !a.paid) {
        this.wallet(a.seller, a.bid, "Player auction sale: " + a.card);
        this.economy.notices.add(
          a.seller,
          `auction-sale:${a.id}`,
          "auction-sale",
          a.card,
          a.level,
          a.bid,
        );
        this.run("UPDATE auctions SET paid=1 WHERE id=?", a.id);
      }
      this.run("UPDATE auctions SET claimed=1,closed=1 WHERE id=?", a.id);
      return {
        message: "Auction card added to your collection.",
        cards: [this.catalogStore.card(a.card)],
        level: a.level,
      };
    }
    if (action === "predict") {
      const p = this.one(
        "SELECT * FROM pickems WHERE id=?",
        integer(b.pickem, 1),
      );
      if (!p || now >= p.ends || p.settled)
        fail("Predictions are closed.", 409);
      if (p.mode === "tour")
        return this.pickemEvents.predictWinner(player, p, b);
      const a = integer(b.scoreA, 0, 1000),
        c = integer(b.scoreB, 0, 1000);
      if (b.winner !== pickemOutcome(a, c, p.mode))
        fail("Scores must agree with the selected outcome.");
      this.run(
        "INSERT INTO predictions VALUES(?,?,?,?,?) ON CONFLICT(pickem,player) DO UPDATE SET winner=excluded.winner,score_a=excluded.score_a,score_b=excluded.score_b",
        p.id,
        player,
        b.winner,
        a,
        c,
      );
      return {
        message: "Prediction saved. You can edit it until the deadline.",
      };
    }
    if (action === "profile") {
      if (b.username !== undefined) {
        const name = text(b.username, 32),
          normalized = name.toLowerCase();
        if (!/^[\p{L}\p{N}_ .-]+$/u.test(name))
          fail("Use letters, numbers, spaces, underscores, dots, or hyphens.");
        for (const row of [
          this.one("SELECT player FROM aliases WHERE alias=?", normalized),
          this.one("SELECT player FROM usernames WHERE username=?", normalized),
        ])
          if (row && row.player !== player)
            fail(
              "That name is reserved by an AMQ Tours alias or another player.",
              409,
            );
        this.run(
          "INSERT OR IGNORE INTO usernames VALUES(?,?,?,?)",
          normalized,
          player,
          name,
          now,
        );
        this.run("UPDATE players SET display_name=? WHERE id=?", name, player);
      }
      if (b.avatar !== undefined || b.crop !== undefined) {
        const previous = this.player(player),
          avatar = b.avatar === undefined ? previous.avatar_card : b.avatar;
        if (
          avatar !== null &&
          !this.one(
            "SELECT card FROM inventory WHERE player=? AND card=?",
            player,
            text(avatar, 100),
          )
        )
          fail("Choose a card from your inventory.");
        let crop =
          avatar === previous.avatar_card ? previous.avatar_crop : null;
        if (b.crop !== undefined) {
          if (!avatar) fail("Choose a card before cropping a profile picture.");
          try {
            crop = JSON.stringify(validateAvatarCrop(b.crop));
          } catch (error) {
            fail(error.message);
          }
        }
        this.run(
          "UPDATE players SET avatar_card=?,avatar_crop=? WHERE id=?",
          avatar,
          avatar ? crop : null,
          player,
        );
      }
      return {
        message: "Profile updated. Your previous usernames remain searchable.",
      };
    }
    fail("Unknown action.", 404);
  }
  host(action, b) {
    if(action === "account-lock") return setAccountLock(this,b);
    if (action === "participation-batch") return this.participation.grant(b);
    const pickemEvent = this.pickemEvents.action(action, b);
    if (pickemEvent) return pickemEvent;
    if (action === "refresh-auctions") {
      if (b.confirmation !== "REFRESH COMMUNITY AUCTIONS")
        fail("Type REFRESH COMMUNITY AUCTIONS to confirm.");
      return this.economy.refreshAuctions();
    }
    if (action === "refresh-weekly") {
      if (b.confirmation !== "REFRESH WEEKLY SELECTIONS")
        fail("Type REFRESH WEEKLY SELECTIONS to confirm.");
      return this.economy.refreshWeekly();
    }
    if (action === "mahjong-revert") return this.economy.mahjong.reverse(b);
    if (action === "players") {
      if (!Array.isArray(b.players) || b.players.length > 5000)
        fail("Import up to 5,000 player rows.");
      for (const p of b.players) {
        const id = text(p.id, 100),
          name = text(p.name, 100);
        const existing = this.one("SELECT id,name FROM players WHERE id=?", id);
        if (!existing)
          this.run("INSERT INTO players(id,name) VALUES(?,?)", id, name);
        else if (existing.name !== name)
          this.run("UPDATE players SET name=? WHERE id=?", name, id);
        if (p.aliases !== undefined && !Array.isArray(p.aliases))
          fail("Aliases must be a list.");
        const aliases = [
          ...(b.reserveIds === false ? [] : [id]),
          name,
          ...(p.aliases || []),
        ].map((a) => text(a, 100).toLowerCase());
        // Old aliases are deliberately retained: imports must not strand existing logins.
        for (const alias of new Set(aliases)) {
          const owner = this.one(
            "SELECT player FROM aliases WHERE alias=?",
            alias,
          );
          if (owner && owner.player !== id)
            fail(
              `Alias “${alias}” belongs to another player. Import rolled back.`,
            );
          const username = this.one(
            "SELECT player FROM usernames WHERE username=?",
            alias,
          );
          if (username && username.player !== id)
            fail(
              `Alias “${alias}” conflicts with another player’s username history. Resolve this identity conflict before importing.`,
            );
          if (!owner) this.run("INSERT INTO aliases VALUES(?,?)", alias, id);
        }
      }
      return { message: `Imported ${b.players.length} players.` };
    }
    if (action === "deduct") {
      const quote = this.deductionQuote(b);
      if (b.expectedBalance !== quote.expectedBalance)
        fail(
          "The player balance changed. Review this deduction again before confirming.",
          409,
        );
      this.wallet(quote.player, -quote.amount, "Host deduction: " + quote.note);
      this.creditAudit.record("deduction");
      return {
        message:
          "Deducted " + quote.amount + " credits from " + quote.name + ".",
        player: quote.player,
        balance: quote.remaining,
      };
    }
    if (action === "grant") {
      if (
        !["reporting", "counting", "participation", "other"].includes(b.reason)
      )
        fail("Choose a grant category.");
      const id = text(b.player, 100),
        amount = integer(
          b.amount ??
            defaultReward(
              b.reason,
              b.reason === "participation" ? integer(b.games ?? 1, 1, 2000) : 1,
              b.tourSize === undefined ? 16 : integer(b.tourSize, 1, 500),
            ),
          1,
          1000000,
        ),
        note = text(
          b.note?.trim() ||
            {
              reporting: "Tour reporting",
              counting: "Tour counting",
              participation: "Tour participation",
              other: "Host credit reward",
            }[b.reason],
          240,
        );
      this.assertAccountUnlocked(id);
      this.wallet(id, amount, `${b.reason}: ${note}`, true);
      this.creditAudit.record(b.reason, b.event || note);
      if (["participation", "reporting", "counting"].includes(b.reason))
        this.run(
          "INSERT OR IGNORE INTO tour_events VALUES(?,?,?)",
          id,
          b.reason,
          text(b.event || note, 240),
        );
      return {
        message: `Granted ${amount} credits to ${this.player(id).name}.`,
      };
    }
    if (action === "pickem") {
      const end = integer(
        b.ends ?? this.now() + PICKEM_WINDOW,
        this.now() + 60000,
        this.now() + 90 * 86400000,
      );
      const rewards = [
        integer(b.winnerReward ?? PICKEM_WINNER_REWARD, 0, 100000),
        integer(b.scoreReward ?? 500, 0, 100000),
      ];
      this.run(
        "INSERT INTO pickems(title,tour,team_a,team_b,ends,winner_reward,score_reward) VALUES(?,?,?,?,?,?,?)",
        text(b.title),
        text(b.tour),
        text(b.teamA, 100),
        text(b.teamB, 100),
        end,
        ...rewards,
      );
      return { message: "Pick’em published." };
    }
    if (action === "settle") {
      const p = this.one(
        "SELECT * FROM pickems WHERE id=?",
        integer(b.pickem, 1),
      );
      if (!p || p.settled)
        fail("This pick’em is unavailable or already settled.", 409);
      if (this.now() < p.ends)
        fail("Wait until predictions close before settling.");
      if (p.mode === "tour") return this.pickemEvents.settleWinner(p, b);
      const a = integer(b.scoreA, 0, 1000),
        c = integer(b.scoreB, 0, 1000);
      const winner = pickemOutcome(a, c, p.mode);
      for (const v of this.all(
        "SELECT * FROM predictions WHERE pickem=?",
        p.id,
      )) {
        const reward =
          (v.winner === winner ? p.winner_reward : 0) +
          (v.score_a === a ? p.score_reward : 0) +
          (v.score_b === c ? p.score_reward : 0);
        if (reward) this.wallet(v.player, reward, `Pick’em: ${p.title}`, true);
      }
      this.run(
        "UPDATE pickems SET settled=1,result_a=?,result_b=? WHERE id=?",
        a,
        c,
        p.id,
      );
      return { message: "Results published and rewards distributed." };
    }
    if (action === "beta-registration")
      fail(
        "Registration codes are no longer required. Refresh the host console.",
      );
    if (action === "settings") {
      for (const kind of ["character", "seiyuu"])
        if (b["premium_" + kind] !== undefined)
          this.run(
            "UPDATE settings SET value=? WHERE key=?",
            integer(b["premium_" + kind], 1, 1000000),
            "premium_" + kind + "_price",
          );
      for (const kind of ["character", "seiyuu"])
        this.run(
          "UPDATE settings SET value=? WHERE key=?",
          integer(b[kind], 1, 1000000),
          kind + "_price",
        );
      // Legacy clients may still send mainWeight; current packs stay uniform.
      if (b.mainWeight !== undefined) {
        integer(b.mainWeight, 1, 100);
        this.run("UPDATE settings SET value=100 WHERE key='main_weight'");
      }
      return { message: "Pack prices updated." };
    }
    if (action === "catalog") {
      if (!Array.isArray(b.cards) || b.cards.length > 500)
        fail("Import up to 500 cards per request.");
      for (const c of b.cards) {
        if (
          c.id?.startsWith("acdb-character-") &&
          this.one("SELECT key FROM catalog_meta WHERE key='acdb-retired'")
        )
          fail("ACDB was retired. Use MAL character IDs.", 409);
        if (!["character", "seiyuu"].includes(c.kind))
          fail("Invalid catalog type.");
        const image = c.image || "",
          source = c.source || "";
        for (const u of [image, source])
          if (u && !/^https:\/\//.test(u))
            fail("Image and source URLs must use HTTPS.");
        const role =
          c.kind === "seiyuu" ? "supporting" : c.role || "supporting";
        if (!["main", "supporting", "unknown"].includes(role))
          fail("Character role must be main, supporting, or unknown.");
        const old = this.catalogStore.rawCard(text(c.id, 100));
        const fixedRarity =
          c.fixedRarity === undefined
            ? (old?.fixed_rarity ?? null)
            : c.fixedRarity;
        if (
          fixedRarity !== null &&
          (!c.id.startsWith("community-") || !RARITIES.includes(fixedRarity))
        )
          fail(
            "Fixed rarity requires a community- card ID and a valid rarity from D to AG.",
          );
        if (
          (c.id.startsWith("mal-person-") && c.kind !== "seiyuu") ||
          (c.id.startsWith("mal-character-") && c.kind !== "character")
        )
          fail("MAL IDs must retain their character or person card type.");
        if (old && old.kind !== c.kind)
          fail("A catalog ID cannot change card type.");
        this.run(
          "INSERT INTO catalog(id,kind,name,series,image,source,role,bulk_role,series_romaji,series_english,fixed_rarity,searchText) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,series=excluded.series,image=excluded.image,source=excluded.source,role=excluded.role,bulk_role=excluded.bulk_role,series_romaji=excluded.series_romaji,series_english=excluded.series_english,fixed_rarity=excluded.fixed_rarity,searchText=excluded.searchText",
          c.id,
          c.kind,
          text(c.name),
          String(c.series || "").slice(0, 180),
          image.slice(0, 1000),
          source.slice(0, 1000),
          role,
          this.catalogStore.bulkCard(c.id)?.role || null,
          String(c.series_romaji || c.series || "").slice(0, 500),
          String(c.series_english || "").slice(0, 500),
          fixedRarity,
          this.catalogStore.bulkCard(c.id)?.searchText || "",
        );
      }
      for (const kind of ["character", "seiyuu"]) {
        const entries = b.cards.filter(
          (c) =>
            c.kind === kind &&
            /^mal-(character|person)-[0-9]+$/.test(c.id) &&
            c.favorites != null,
        );
        for (const card of entries)
          if (!validFavorites(card.favorites))
            fail("MAL favorites must be a non-negative whole number.");
        if (entries.length)
          this.catalogStore.popularity.sync(
            kind,
            entries.map((c) => [c.id, c.favorites]),
          );
      }
      this.economy.anime.index(
        b.cards.map((c) => this.one("SELECT * FROM catalog WHERE id=?", c.id)),
      );
      return { message: `Imported ${b.cards.length} catalog cards.` };
    }
    if (action === "beta-reset") {
      if (b.confirmation !== "START CLEAN BETA")
        fail("Type START CLEAN BETA to confirm.");
      this.host("reset-all", {
        deleteRegistry: false,
        confirmation: "RESET ALL GAME DATA",
      });
      this.run("DELETE FROM receipts WHERE scope NOT LIKE 'host:%'");
      this.run(
        "UPDATE players SET balance=5000,earned=5000,starter_granted=1,starter_amount=5000",
      );
      const now = this.now();
      for (const p of this.all("SELECT id FROM players"))
        this.run(
          "INSERT INTO ledger(player,delta,reason,at) VALUES(?,5000,'Beta starting credits',?)",
          p.id,
          now,
        );
      return {
        message:
          "Clean beta started. Gameplay cleared, everyone starts with5000credits, and weekly auctions/shop refreshed. Accounts and catalogue retained.",
        players: this.one("SELECT count(*) AS n FROM players").n,
      };
    }
    if (action === "reset-player") {
      const id = text(b.player, 100);
      this.player(id);
      if (b.confirmation !== `RESET PLAYER ${id}`)
        fail(`Type RESET PLAYER ${id} to confirm.`);
      this.economy.resetPlayer(id);
      this.run("DELETE FROM quiz_runs WHERE player=?", id);
      this.run("DELETE FROM quiz_progress WHERE player=?", id);
      this.run("DELETE FROM quiz_reward_history WHERE player=?", id);
      this.run("DELETE FROM profile_title_preferences WHERE player=?", id);
      this.run("DELETE FROM profile_title_order WHERE player=?", id);
      this.run("DELETE FROM card_titles WHERE player=?", id);
      this.run("DELETE FROM card_title_awards WHERE player=?", id);
      this.run(
        "DELETE FROM host_credit_issues WHERE ledger IN (SELECT id FROM ledger WHERE player=?)",
        id,
      );
      for (const table of [
        "inventory",
        "ledger",
        "predictions",
        "tour_events",
        "sessions",
        "special_packs",
      ])
        this.run(`DELETE FROM ${table} WHERE player=?`, id);
      this.run(
        "UPDATE players SET balance=5000,earned=5000,starter_granted=1,starter_amount=5000,daily=NULL,daily_pack=NULL,avatar_card=NULL,avatar_crop=NULL WHERE id=?",
        id,
      );
      this.run(
        "INSERT INTO ledger(player,delta,reason,at) VALUES(?,5000,'Starting credits after player reset',?)",
        id,
        this.now(),
      );
      this.run("UPDATE auctions SET winner=NULL,bid=0 WHERE winner=?", id);
      return {
        message: `Reset gameplay for ${id} to 5,000 starting credits. Identity and username history retained; sessions revoked.`,
      };
    }
    if (action === "reset-all") {
      const full = b.deleteRegistry === true;
      if (
        b.confirmation !== (full ? "DELETE EVERYTHING" : "RESET ALL GAME DATA")
      )
        fail("The confirmation phrase does not match the selected reset.");
      for (const table of [
        "inventory",
        "host_credit_issues",
        "ledger",
        "predictions",
        "tour_events",
        "sessions",
        "pickems",
        "pickem_events",
        "pickem_byes",
        "auctions",
        "weekly_shop",
        "market_listings",
        "trade_offer_cards",
        "trade_offers",
        "trade_listings",
        "gambling_rounds",
        "mahjong_games",
        "gem_games",
        "horse_games",
        "pachinko_games",
        "player_notices",
        "profile_showcase",
        "showcase_slots",
        "showcase_capacity",
        "profile_anime",
        "quiz_runs",
        "quiz_progress",
        "quiz_reward_history",
        "profile_title_preferences",
        "profile_title_order",
        "card_titles",
        "card_title_awards",
        "card_alchemy",
        "alchemy_targets",
        "card_wishlist",
        "special_packs",
      ])
        this.run(`DELETE FROM ${table}`);
      this.run(
        "UPDATE players SET balance=5000,earned=5000,starter_granted=1,starter_amount=5000,daily=NULL,daily_pack=NULL,avatar_card=NULL,avatar_crop=NULL",
      );
      if (!full)
        this.run(
          "INSERT INTO ledger(player,delta,reason,at) SELECT id,5000,'Starting credits after gameplay reset',? FROM players",
          this.now(),
        );
      if (full) {
        for (const table of [
          "players",
          "aliases",
          "usernames",
          "receipts",
          "throttle",
          "host_delegations",
        ])
          this.run(`DELETE FROM ${table}`);
        this.run(
          "UPDATE settings SET value=CASE WHEN key='main_weight' THEN 100 WHEN key LIKE 'premium_%' THEN 2000 ELSE 500 END WHERE key!='beta_registration_enabled'",
        );
        const registry = this.one(
          "SELECT value FROM catalog_meta WHERE key='alias-sync'",
        );
        if (registry) {
          const sync = JSON.parse(registry.value);
          Object.assign(sync, {
            status: "pending",
            nextAt: this.now() + 1000,
            lease: 0,
            players: 0,
            aliases: 0,
          });
          this.run(
            "UPDATE catalog_meta SET value=? WHERE key='alias-sync'",
            JSON.stringify(sync),
          );
        }
      }
      return {
        message: full
          ? "All players, aliases, usernames, passwords, and gameplay data deleted. Character and seiyuu catalogues, import progress, and rarity data retained. Host token remains configured."
          : "All gameplay reset. AMQ identities, usernames, account passwords, catalog, and prices retained. Everyone must sign in again.",
      };
    }
    fail("Unknown host action.", 404);
  }
  gameState(id) {
    const now = this.now();
    const notices = this.economy.notices.pending(id);
    const auctionWins = this.all(
      "SELECT a.*,COALESCE(p.display_name,p.name) AS winner_name FROM auctions a LEFT JOIN players p ON p.id=a.winner WHERE a.winner=? AND a.ends<=? AND a.claimed=0 AND a.notified=0 ORDER BY a.ends,a.id",
      id,
      now,
    );
    return {
      now,
      me: this.player(id),
      mahjong: this.economy.mahjong.state(id),
      gem: this.economy.gem.read(id),
      horseRace: this.economy.horse.view(id),
      ...this.economy.pachinko.view(id),
      notices,
      ledger: this.all(
        "SELECT * FROM ledger WHERE player=? ORDER BY id DESC LIMIT 50",
        id,
      ),
      auctionWins,
      cards: this.catalogStore.cards([
        ...new Set([
          ...auctionWins.map((a) => a.card),
          ...notices.map((n) => n.card),
        ]),
      ]),
    };
  }
  state(id) {
    const now = this.now(),
      me = id ? this.player(id) : null;
    const summary = this.catalogStore.summary();
    const auctions = this.all(
      "SELECT a.*,COALESCE(p.display_name,p.name) AS winner_name FROM auctions a LEFT JOIN players p ON p.id=a.winner WHERE (a.seller IS NULL AND a.ends>?) OR (a.winner=? AND a.claimed=0) ORDER BY a.ends,a.id",
      now,
      id || "",
    );
    const pickems = this.all(
      "SELECT p.*,v.winner AS prediction,v.score_a AS prediction_a,v.score_b AS prediction_b FROM pickems p LEFT JOIN predictions v ON v.pickem=p.id AND v.player=? ORDER BY p.id DESC LIMIT 100",
      id || "",
    );
    const specialPack = id ? this.economy.specialPack.pendingPopup(id) : null;
    const inventory = id
      ? this.all(
          "SELECT * FROM inventory WHERE player=? ORDER BY position IS NULL,position",
          id,
        )
      : [];
    const ranks = this.all(
      "SELECT id,COALESCE(display_name,name) AS name,earned,avatar_card,avatar_crop FROM players WHERE earned>0 ORDER BY earned DESC,name COLLATE NOCASE,id LIMIT 100",
    );
    const references = new Set([
      ...auctions.map((a) => a.card),
      ...inventory.map((i) => i.card),
      ...ranks.map((p) => p.avatar_card),
      me?.avatar_card,
    ]);
    const notices = this.economy.notices.pending(id);
    for (const notice of notices) if (notice.card) references.add(notice.card);
    const myListings = id
      ? [
          ...this.all(
            "SELECT *, 'shop' AS venue FROM market_listings WHERE seller=? AND status='open' ORDER BY id DESC LIMIT 20",
            id,
          ),
          ...this.all(
            "SELECT *, 'auction' AS venue FROM auctions WHERE seller=? AND paid=0 AND closed=0 ORDER BY id DESC LIMIT 20",
            id,
          ),
        ]
      : [];
    for (const listing of myListings) references.add(listing.card);
    const shop = this.all(
      "SELECT * FROM weekly_shop WHERE starts<=? AND ends>? AND buyer IS NULL ORDER BY id",
      now,
      now,
    );
    const showcase = id
      ? this.all(
          "SELECT card FROM profile_showcase WHERE player=? ORDER BY position",
          id,
        ).map((c) => c.card)
      : [];
    for (const s of shop) references.add(s.card);
    for (const c of showcase) references.add(c);
    if (specialPack) {
      for (const c of specialPack.cards) references.add(c.id);
    }
    if (summary.source?.provider === "ACDB")
      for (const id of [
        "acdb-character-76951",
        "acdb-character-130626",
        "acdb-character-7841",
      ])
        references.add(id);
    else
      for (const c of this.catalogStore.page("character", "", 1, 12).cards)
        references.add(c.id);
    const catalog = this.catalogStore.cards([...references]);
    return {
      now,
      me,
      mahjong: this.economy.mahjong.state(id),
      gem: id ? this.economy.gem.read(id) : null,
      horseRace: id ? this.economy.horse.view(id) : null,
      ...this.economy.pachinko.view(id),
      notices,
      catalog,
      specialPack,
      auctions,
      auctionWins: auctions.filter(
        (a) => a.winner === id && a.ends <= now && !a.claimed && !a.notified,
      ),
      pickems,
      settings: Object.fromEntries(
        this.all("SELECT * FROM settings").map((s) => [s.key, s.value]),
      ),
      inventory,
      wishlist: id ? this.economy.wishlist.read(id) : [],
      roles: this.publicRoles(),
      myListings,
      ledger: id
        ? this.all(
            "SELECT * FROM ledger WHERE player=? ORDER BY id DESC LIMIT 50",
            id,
          )
        : [],
      ranks,
      shop,
      communityMarket: this.economy.community.info(),
      showcase,
      activePickem:
        this.one(
          "SELECT * FROM pickems WHERE settled=0 AND ends>? ORDER BY id DESC LIMIT 1",
          now,
        ) || null,
      premiumRule: PREMIUM_RULE,
      catalogSummary: summary,
      counts: {
        players: this.one("SELECT count(*) AS n FROM players").n,
        cards: summary.total,
      },
    };
  }
  featuredCards() {
    return this.catalogStore.cards(
      drawFeatured(
        ["character", "seiyuu"].flatMap(
          (kind) => this.catalogStore.pool(kind).cards,
        ),
        this.rand,
      ).map((c) => c.id),
    );
  }
  publicRoles() {
    return Object.fromEntries(
      this.all(
        "SELECT id FROM players WHERE is_admin=1 AND (id='368' OR id IN (SELECT player FROM host_delegations))",
      ).map((p) => [p.id, "Host"]),
    );
  }
  searchProfiles(query, page = 1, limit = 50) {
    integer(page, 1, 10000);
    integer(limit, 1, 100);
    const search = profileSearchSql(typeof query === "string" ? query : "");
    return this.all(
      `SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_card,p.avatar_crop,p.earned,(SELECT level FROM inventory i WHERE i.player=p.id AND i.card=p.avatar_card) AS avatar_level FROM players p WHERE ${search.where} ORDER BY p.earned DESC,p.id LIMIT ? OFFSET ?`,
      ...search.args,
      limit,
      (page - 1) * 50,
    );
  }
  profilesPage(query, page = 1) {
    const rows = this.searchProfiles(query, page, 51);
    const search = profileSearchSql(query);
    const total = this.one(
      `SELECT count(*) AS n FROM players p WHERE ${search.where}`,
      ...search.args,
    ).n;
    return {
      profiles: rows.slice(0, 50),
      page,
      total,
      limit: 50,
      hasMore: rows.length > 50,
    };
  }
  profile(id) {
    id = this.resolvePlayer(id);
    const p = this.player(id);
    const stats = Object.fromEntries(
      this.all(
        "SELECT category,count(*) AS n FROM tour_events WHERE player=? GROUP BY category",
        id,
      ).map((r) => [r.category, r.n]),
    );
    const picks = this.one(
      "SELECT count(*) AS total,COALESCE(sum(CASE WHEN (p.mode='tour' AND v.winner=p.result_winner) OR (p.mode!='tour' AND ((v.winner='a' AND p.result_a>p.result_b) OR (v.winner='b' AND p.result_b>p.result_a) OR (v.winner='draw' AND p.mode='pair' AND p.result_a=p.result_b))) THEN 1 ELSE 0 END),0) AS correct FROM predictions v JOIN pickems p ON p.id=v.pickem WHERE v.player=? AND p.settled=1",
      id,
    );
    const showcase = this.all(
      "SELECT s.card,i.level,i.copies,i.protected,COALESCE(i.for_trade,0) AS for_trade FROM profile_showcase s JOIN inventory i ON i.player=s.player AND i.card=s.card WHERE s.player=? ORDER BY s.position",
      id,
    );
    return {
      ...p,
      titles: this.quiz.titles(id),
      aliases: this.all(
        "SELECT alias FROM aliases WHERE player=? ORDER BY alias",
        id,
      ).map((a) => a.alias),
      usernames: this.all(
        "SELECT label FROM usernames WHERE player=? ORDER BY at",
        id,
      ).map((a) => a.label),
      stats: {
        participation: stats.participation || 0,
        counting: stats.counting || 0,
        reporting: stats.reporting || 0,
        pickems: picks,
      },
      showcase,
      wishlist: this.economy.wishlist.read(id),
      pinnedAnime: this.economy.anime.pinned(id),
      completion: this.economy.completion(id),
      inventory: this.all(
        "SELECT * FROM inventory WHERE player=? ORDER BY position IS NULL,position",
        id,
      ),
      cards: this.catalogStore.cards([
        ...new Set([
          ...this.all(
            "SELECT card FROM inventory WHERE player=? ORDER BY position IS NULL,position LIMIT 20",
            id,
          ).map((i) => i.card),
          p.avatar_card,
          ...showcase.map((c) => c.card),
        ]),
      ]),
    };
  }
  resolvePlayer(value) {
    return (
      this.one("SELECT id FROM players WHERE id=?", value)?.id ||
      this.one(
        "SELECT player FROM aliases WHERE alias=?",
        String(value).trim().toLowerCase(),
      )?.player ||
      value
    );
  }
  playerActivity(query) {
    const q = String(query || "").trim();
    if (!q) fail("Enter a player ID or username.");
    const resolved = this.resolvePlayer(q);
    const playerRow =
      this.one(
        "SELECT id,name,balance,earned,is_admin FROM players WHERE id=?",
        resolved,
      ) ||
      this.one(
        "SELECT id,name,balance,earned,is_admin FROM players WHERE lower(name)=lower(?)",
        q,
      ) ||
      this.one(
        "SELECT p.id,p.name,p.balance,p.earned,p.is_admin FROM usernames u JOIN players p ON p.id=u.player WHERE lower(u.username)=lower(?)",
        q,
      );
    if (!playerRow) fail("Player not found.", 404);
    const id = playerRow.id;
    const usernames = this.all(
      "SELECT username,label,at FROM usernames WHERE player=? ORDER BY at DESC",
      id,
    );
    const cardIds = new Set();
    const offerCardsFor = (offerId) => {
      const rows = this.all(
        "SELECT card,level FROM trade_offer_cards WHERE offer=? ORDER BY position",
        offerId,
      );
      for (const r of rows) cardIds.add(r.card);
      return rows;
    };
    const listings = this.all(
      "SELECT id,seller,card,level,status,accepted_offer,created_at,updated_at FROM trade_listings WHERE seller=? ORDER BY updated_at DESC,id DESC LIMIT 100",
      id,
    ).map((l) => {
      cardIds.add(l.card);
      const offers = this.all(
        "SELECT o.id,o.proposer,p.name AS proposer_name,o.card,o.level,o.credits,o.status,o.created_at,o.updated_at FROM trade_offers o LEFT JOIN players p ON p.id=o.proposer WHERE o.listing=? ORDER BY o.id DESC",
        l.id,
      ).map((o) => {
        const cards = offerCardsFor(o.id);
        if (!cards.length && o.card) cardIds.add(o.card);
        return {
          ...o,
          cards: cards.length
            ? cards
            : o.card
              ? [{ card: o.card, level: o.level }]
              : [],
        };
      });
      return { ...l, offers };
    });
    const sentOffers = this.all(
      "SELECT o.id,o.listing,o.proposer,o.card,o.level,o.credits,o.status,o.created_at,o.updated_at,l.seller,p.name AS seller_name,l.card AS listing_card,l.level AS listing_level,l.status AS listing_status,l.accepted_offer FROM trade_offers o JOIN trade_listings l ON l.id=o.listing LEFT JOIN players p ON p.id=l.seller WHERE o.proposer=? ORDER BY o.updated_at DESC,o.id DESC LIMIT 100",
      id,
    ).map((o) => {
      cardIds.add(o.listing_card);
      const cards = offerCardsFor(o.id);
      if (!cards.length && o.card) cardIds.add(o.card);
      return {
        ...o,
        cards: cards.length
          ? cards
          : o.card
            ? [{ card: o.card, level: o.level }]
            : [],
      };
    });
    const ledger = this.all(
      "SELECT id,delta,reason,at FROM ledger WHERE player=? ORDER BY id DESC LIMIT 200",
      id,
    );
    const cards = Object.fromEntries(
      this.catalogStore.cards([...cardIds]).map((c) => [c.id, c]),
    );
    return { player: playerRow, usernames, listings, sentOffers, ledger, cards };
  }
  pickemPage(player, page = 1) {
    integer(page, 1, 10000);
    const rows = this.all(
      "SELECT p.*,v.winner AS prediction,v.score_a AS prediction_a,v.score_b AS prediction_b FROM pickems p LEFT JOIN predictions v ON v.pickem=p.id AND v.player=? ORDER BY p.id DESC LIMIT 21 OFFSET ?",
      player || "",
      (page - 1) * 20,
    );
    return { pickems: rows.slice(0, 20), page, hasMore: rows.length > 20 };
  }
}
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),earned INTEGER NOT NULL DEFAULT 0,daily TEXT,password TEXT,invite TEXT,invite_expires INTEGER);
CREATE TABLE IF NOT EXISTS account_lock_log(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,locked INTEGER NOT NULL,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS aliases(alias TEXT PRIMARY KEY,player TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usernames(username TEXT PRIMARY KEY,player TEXT NOT NULL,label TEXT NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS usernames_player ON usernames(player);
CREATE TABLE IF NOT EXISTS tour_events(player TEXT NOT NULL,category TEXT NOT NULL,event TEXT NOT NULL,PRIMARY KEY(player,category,event));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,player TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS host_access_log(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,player TEXT NOT NULL,enabled INTEGER NOT NULL,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS host_delegations(player TEXT PRIMARY KEY,granted_by TEXT NOT NULL CHECK(granted_by='368'));
CREATE TABLE IF NOT EXISTS throttle(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS catalog(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,series TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS inventory(player TEXT NOT NULL,card TEXT NOT NULL,copies INTEGER NOT NULL CHECK(copies>=1),level INTEGER NOT NULL,PRIMARY KEY(player,card));
CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,delta INTEGER NOT NULL,reason TEXT NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_player ON ledger(player,id);
CREATE TABLE IF NOT EXISTS auctions(id INTEGER PRIMARY KEY AUTOINCREMENT,card TEXT NOT NULL,kind TEXT NOT NULL,starts INTEGER NOT NULL,ends INTEGER NOT NULL,bid INTEGER NOT NULL DEFAULT 0,winner TEXT,closed INTEGER NOT NULL DEFAULT 0,claimed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS auction_week ON auctions(starts,kind);
CREATE INDEX IF NOT EXISTS auction_winner ON auctions(winner,ends);
CREATE TABLE IF NOT EXISTS pickems(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,tour TEXT NOT NULL,team_a TEXT NOT NULL,team_b TEXT NOT NULL,ends INTEGER NOT NULL,winner_reward INTEGER NOT NULL,score_reward INTEGER NOT NULL,settled INTEGER NOT NULL DEFAULT 0,result_a INTEGER,result_b INTEGER);
CREATE TABLE IF NOT EXISTS predictions(pickem INTEGER NOT NULL,player TEXT NOT NULL,winner TEXT NOT NULL,score_a INTEGER NOT NULL,score_b INTEGER NOT NULL,PRIMARY KEY(pickem,player));
CREATE TABLE IF NOT EXISTS receipts(scope TEXT NOT NULL,key TEXT NOT NULL,input TEXT NOT NULL,result TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(scope,key));
`;
