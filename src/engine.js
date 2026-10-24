import { Catalog } from "./catalog.js";
import { Economy, PREMIUM_WEIGHTS } from "./economy.js";
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
      ["players", "is_admin", "INTEGER NOT NULL DEFAULT 0"],
      ["inventory", "acquired_at", "INTEGER NOT NULL DEFAULT 0"],
      ["catalog", "role", "TEXT NOT NULL DEFAULT 'supporting'"],
      ["catalog", "bulk_role", "TEXT"],
      ["catalog", "series_romaji", "TEXT NOT NULL DEFAULT ''"],
      ["catalog", "series_english", "TEXT NOT NULL DEFAULT ''"],
    ]) {
      if (
        !this.all(`PRAGMA table_info(${table})`).some((c) => c.name === column)
      )
        this.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    this.run(
      "INSERT OR IGNORE INTO settings VALUES ('character_price',500),('seiyuu_price',500)",
    );
    this.run("INSERT OR IGNORE INTO settings VALUES ('main_weight',80)");
    for (const sql of [
      "CREATE INDEX IF NOT EXISTS catalog_kind_name ON catalog(kind,active,name COLLATE NOCASE,id)",
      "CREATE INDEX IF NOT EXISTS catalog_kind_id ON catalog(kind,active,id)",
      "CREATE INDEX IF NOT EXISTS catalog_bulk_overrides ON catalog(bulk_role) WHERE bulk_role IS NOT NULL",
      "CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires)",
      "CREATE INDEX IF NOT EXISTS throttle_expiry ON throttle(expires)",
      "CREATE INDEX IF NOT EXISTS players_invite_expiry ON players(invite_expires)",
      "CREATE INDEX IF NOT EXISTS player_earned ON players(earned DESC,id)",
    ])
      this.run(sql);
    this.catalogStore = new Catalog(this);
    this.economy = new Economy(this);
  }
  all(sql, ...args) {
    return this.db(sql, ...args);
  }
  one(sql, ...args) {
    return this.all(sql, ...args)[0];
  }
  run(sql, ...args) {
    this.db(sql, ...args);
    if (
      /\b(catalog|catalog_meta|catalog_popularity|tenrai_characters|catalog_bulk)\b/i.test(
        sql,
      ) &&
      this.catalogStore
    )
      this.catalogStore.browseCache = null;
  }
  tx(fn) {
    return this.transaction(fn);
  }
  player(id) {
    const p = this.one(
      "SELECT id,COALESCE(display_name,name) AS name,balance,earned,daily,daily_pack,avatar_card,is_admin FROM players WHERE id=?",
      id,
    );
    if (!p) fail("Unknown AMQ player ID.", 404);
    return p;
  }
  adminSession(hash) {
    return !!this.one(
      "SELECT p.id FROM sessions s JOIN players p ON p.id=s.player WHERE s.token=? AND s.expires>? AND p.is_admin=1",
      hash,
      this.now(),
    );
  }
  wallet(id, delta, reason, earned = false) {
    const p = this.player(id);
    const balance = p.balance + delta;
    if (balance < 0) fail("Not enough available credits.");
    if (!Number.isSafeInteger(balance) || balance > 1000000000)
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
  ensureAuctions() {
    return this.tx(() => {
      const now = this.now();
      this.run("UPDATE auctions SET closed=1 WHERE ends<=? AND closed=0", now);
      const start = MONDAY + Math.floor((now - MONDAY) / WEEK) * WEEK;
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
        const selected = new Set();
        for (let i = 0; i < 5; i++) {
          const card = this.catalogStore.draw(kind, this.rand, 100, selected);
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
      return Math.min(start + WEEK, this.economy.tick(start));
    });
  }
  action(player, action, b) {
    const now = this.now();
    this.player(player);
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
      const price = this.one(
        "SELECT value FROM settings WHERE key=?",
        (premium ? "premium_" : "") + b.kind + "_price",
      ).value;
      this.wallet(player, -price, `${premium ? "Premium " : ""}${b.kind} pack`);
      const weight = this.one(
        "SELECT value FROM settings WHERE key='main_weight'",
      ).value;
      const drawContext = {};
      const pulls = Array.from({ length: 5 }, () =>
        premium
          ? this.economy.premiumDraw(b.kind, weight, drawContext)
          : this.catalogStore.draw(
              b.kind,
              this.rand,
              weight,
              new Set(),
              drawContext,
            ),
      );
      for (const card of pulls) this.addCard(player, card.id);
      return { message: "Five new cards for your collection.", cards: pulls };
    }
    if (action === "enhance") {
      const item = this.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        text(b.card),
      );
      if (!item) fail("You do not own this card.");
      if (item.level >= 20) fail("Maximum level reached.");
      const cost = 2 ** (item.level - 1); // Extra copies, preserving the base card.
      if (item.copies - 1 < cost)
        fail(`You need ${cost} extra copies to reach level ${item.level + 1}.`);
      this.run(
        "UPDATE inventory SET copies=copies-?,level=level+1 WHERE player=? AND card=?",
        cost,
        player,
        b.card,
      );
      return { message: `Enhanced to level ${item.level + 1}.` };
    }
    if (action === "bid") {
      const a = this.one(
        "SELECT * FROM auctions WHERE id=?",
        integer(b.auction, 1),
      );
      if (!a || a.closed || now >= a.ends) fail("This auction has ended.", 409);
      if (a.seller === player) fail("You cannot bid on your own auction.");
      const amount = integer(b.amount, 1);
      if (a.buyout && amount >= a.buyout)
        return this.economy.buyout(player, a.id);
      if (amount < (a.bid ? a.bid + 1 : a.reserve))
        fail(`The minimum bid is ${a.bid ? a.bid + 1 : a.reserve} credits.`);
      if (a.winner === player)
        this.wallet(player, -(amount - a.bid), "Auction bid increase");
      else {
        this.wallet(player, -amount, "Auction bid held");
        if (a.winner) this.wallet(a.winner, a.bid, "Outbid refund");
      }
      this.run(
        "UPDATE auctions SET bid=?,winner=? WHERE id=?",
        amount,
        player,
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
      this.economy.acquire(player, a.card, a.level);
      if (a.seller && !a.paid) {
        this.wallet(a.seller, a.bid, "Player auction sale: " + a.card);
        this.run("UPDATE auctions SET paid=1 WHERE id=?", a.id);
      }
      this.run("UPDATE auctions SET claimed=1,closed=1 WHERE id=?", a.id);
      return { message: "Auction card added to your collection." };
    }
    if (action === "predict") {
      const p = this.one(
        "SELECT * FROM pickems WHERE id=?",
        integer(b.pickem, 1),
      );
      if (!p || now >= p.ends || p.settled)
        fail("Predictions are closed.", 409);
      if (!["a", "b"].includes(b.winner)) fail("Choose a winner.");
      const a = integer(b.scoreA, 0, 1000),
        c = integer(b.scoreB, 0, 1000);
      if (a === c || (b.winner === "a" && a < c) || (b.winner === "b" && c < a))
        fail(
          "Scores must agree with the selected winner; draws are not supported.",
        );
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
      if (b.avatar !== undefined) {
        if (
          b.avatar !== null &&
          !this.one(
            "SELECT card FROM inventory WHERE player=? AND card=?",
            player,
            text(b.avatar, 100),
          )
        )
          fail("Choose a card from your inventory.");
        this.run(
          "UPDATE players SET avatar_card=? WHERE id=?",
          b.avatar,
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
    if (action === "players") {
      if (!Array.isArray(b.players) || b.players.length > 5000)
        fail("Import up to 5,000 player rows.");
      for (const p of b.players) {
        const id = text(p.id, 100),
          name = text(p.name, 100);
        const existing = this.one("SELECT id FROM players WHERE id=?", id);
        if (!existing)
          this.run("INSERT INTO players(id,name) VALUES(?,?)", id, name);
        else this.run("UPDATE players SET name=? WHERE id=?", name, id);
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
          this.run("INSERT OR IGNORE INTO aliases VALUES(?,?)", alias, id);
        }
      }
      return { message: `Imported ${b.players.length} players.` };
    }
    if (action === "grant") {
      if (
        !["reporting", "counting", "participation", "other"].includes(b.reason)
      )
        fail("Choose a grant category.");
      const id = text(b.player, 100),
        amount = integer(b.amount, 1, 1000000),
        note = text(b.note, 240);
      this.wallet(id, amount, `${b.reason}: ${note}`, true);
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
        b.ends,
        this.now() + 60000,
        this.now() + 90 * 86400000,
      );
      const rewards = [
        integer(b.winnerReward, 0, 100000),
        integer(b.scoreReward, 0, 100000),
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
      const a = integer(b.scoreA, 0, 1000),
        c = integer(b.scoreB, 0, 1000);
      if (a === c) fail("A winning team is required.");
      const winner = a > c ? "a" : "b";
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
      if (b.mainWeight !== undefined)
        this.run(
          "UPDATE settings SET value=? WHERE key='main_weight'",
          integer(b.mainWeight, 1, 99),
        );
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
        if (
          (c.id.startsWith("mal-person-") && c.kind !== "seiyuu") ||
          (c.id.startsWith("mal-character-") && c.kind !== "character")
        )
          fail("MAL IDs must retain their character or person card type.");
        if (old && old.kind !== c.kind)
          fail("A catalog ID cannot change card type.");
        this.run(
          "INSERT INTO catalog(id,kind,name,series,image,source,role,bulk_role,series_romaji,series_english) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,series=excluded.series,image=excluded.image,source=excluded.source,role=excluded.role,bulk_role=excluded.bulk_role,series_romaji=excluded.series_romaji,series_english=excluded.series_english",
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
        );
      }
      this.economy.anime.index(
        b.cards.map((c) => this.one("SELECT * FROM catalog WHERE id=?", c.id)),
      );
      return { message: `Imported ${b.cards.length} catalog cards.` };
    }
    if (action === "reset-player") {
      const id = text(b.player, 100);
      this.player(id);
      if (b.confirmation !== `RESET PLAYER ${id}`)
        fail(`Type RESET PLAYER ${id} to confirm.`);
      this.economy.resetPlayer(id);
      for (const table of [
        "inventory",
        "ledger",
        "predictions",
        "tour_events",
        "sessions",
      ])
        this.run(`DELETE FROM ${table} WHERE player=?`, id);
      this.run(
        "UPDATE players SET balance=0,earned=0,daily=NULL,daily_pack=NULL,avatar_card=NULL WHERE id=?",
        id,
      );
      this.run("UPDATE auctions SET winner=NULL,bid=0 WHERE winner=?", id);
      return {
        message: `Reset gameplay for ${id}. Identity and username history retained; sessions revoked.`,
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
        "ledger",
        "predictions",
        "tour_events",
        "sessions",
        "pickems",
        "auctions",
        "weekly_shop",
        "market_listings",
        "gambling_rounds",
        "profile_showcase",
        "profile_anime",
      ])
        this.run(`DELETE FROM ${table}`);
      this.run(
        "UPDATE players SET balance=0,earned=0,daily=NULL,daily_pack=NULL,avatar_card=NULL",
      );
      if (full) {
        for (const table of [
          "players",
          "aliases",
          "usernames",
          "receipts",
          "throttle",
        ])
          this.run(`DELETE FROM ${table}`);
        this.run(
          "UPDATE settings SET value=CASE WHEN key='main_weight' THEN 80 WHEN key LIKE 'premium_%' THEN 2000 ELSE 500 END",
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
    const inventory = id
      ? this.all("SELECT * FROM inventory WHERE player=?", id)
      : [];
    const ranks = this.all(
      "SELECT id,COALESCE(display_name,name) AS name,earned,avatar_card FROM players WHERE earned>0 ORDER BY earned DESC,name COLLATE NOCASE,id LIMIT 100",
    );
    const references = new Set([
      ...auctions.map((a) => a.card),
      ...inventory.map((i) => i.card),
      ...ranks.map((p) => p.avatar_card),
      me?.avatar_card,
    ]);
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
      "SELECT * FROM weekly_shop WHERE ends>? ORDER BY id",
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
    const catalog = [...references]
      .filter(Boolean)
      .map((id) => this.catalogStore.card(id))
      .filter(Boolean);
    return {
      now,
      me,
      catalog,
      auctions,
      pickems,
      settings: Object.fromEntries(
        this.all("SELECT * FROM settings").map((s) => [s.key, s.value]),
      ),
      inventory,
      myListings,
      ledger: id
        ? this.all(
            "SELECT * FROM ledger WHERE player=? ORDER BY id DESC LIMIT 50",
            id,
          )
        : [],
      ranks,
      shop,
      showcase,
      activePickem:
        this.one(
          "SELECT * FROM pickems WHERE settled=0 AND ends>? ORDER BY id DESC LIMIT 1",
          now,
        ) || null,
      premiumWeights: PREMIUM_WEIGHTS,
      catalogSummary: summary,
      counts: {
        players: this.one("SELECT count(*) AS n FROM players").n,
        cards: summary.total,
      },
    };
  }
  searchProfiles(query, page = 1, limit = 50) {
    integer(page, 1, 10000);
    integer(limit, 1, 100);
    const q =
      typeof query === "string" ? query.trim().toLowerCase().slice(0, 100) : "";
    return this.all(
      `SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_card,p.earned,(SELECT level FROM inventory i WHERE i.player=p.id AND i.card=p.avatar_card) AS avatar_level FROM players p WHERE ?='' OR instr(lower(p.id),?)>0 OR instr(lower(p.name),?)>0 OR instr(lower(COALESCE(p.display_name,'')),?)>0 OR EXISTS(SELECT 1 FROM aliases a WHERE a.player=p.id AND instr(a.alias,?)>0) OR EXISTS(SELECT 1 FROM usernames u WHERE u.player=p.id AND instr(u.username,?)>0) ORDER BY p.earned DESC,p.id LIMIT ? OFFSET ?`,
      q,
      q,
      q,
      q,
      q,
      q,
      limit,
      (page - 1) * 50,
    );
  }
  profilesPage(query, page = 1) {
    const rows = this.searchProfiles(query, page, 51);
    const q = String(query || "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    const total = this.one(
      `SELECT count(*) AS n FROM players p WHERE ?='' OR instr(lower(p.id),?)>0 OR instr(lower(p.name),?)>0 OR instr(lower(COALESCE(p.display_name,'')),?)>0 OR EXISTS(SELECT 1 FROM aliases a WHERE a.player=p.id AND instr(a.alias,?)>0) OR EXISTS(SELECT 1 FROM usernames u WHERE u.player=p.id AND instr(u.username,?)>0)`,
      q,
      q,
      q,
      q,
      q,
      q,
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
      "SELECT count(*) AS total,COALESCE(sum(CASE WHEN (v.winner='a' AND p.result_a>p.result_b) OR (v.winner='b' AND p.result_b>p.result_a) THEN 1 ELSE 0 END),0) AS correct FROM predictions v JOIN pickems p ON p.id=v.pickem WHERE v.player=? AND p.settled=1",
      id,
    );
    const showcase = this.all(
      "SELECT s.card,i.level,i.copies FROM profile_showcase s JOIN inventory i ON i.player=s.player AND i.card=s.card WHERE s.player=? ORDER BY s.position",
      id,
    );
    return {
      ...p,
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
      pinnedAnime: this.economy.anime.pinned(id),
      completion: this.economy.completion(id),
      inventory: this.all("SELECT * FROM inventory WHERE player=?", id),
      cards: [
        ...new Set([
          ...this.all(
            "SELECT card FROM inventory WHERE player=? LIMIT 20",
            id,
          ).map((i) => i.card),
          p.avatar_card,
          ...showcase.map((c) => c.card),
        ]),
      ]
        .filter(Boolean)
        .map((card) => this.catalogStore.card(card))
        .filter(Boolean),
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
CREATE TABLE IF NOT EXISTS aliases(alias TEXT PRIMARY KEY,player TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usernames(username TEXT PRIMARY KEY,player TEXT NOT NULL,label TEXT NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS usernames_player ON usernames(player);
CREATE TABLE IF NOT EXISTS tour_events(player TEXT NOT NULL,category TEXT NOT NULL,event TEXT NOT NULL,PRIMARY KEY(player,category,event));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,player TEXT NOT NULL,expires INTEGER NOT NULL);
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
