import { DurableObject } from "cloudflare:workers";
import { Engine, fail, text } from "./engine.js";
import {
  betaRegistrationEnabled,
  registrationAllowed,
} from "./registration.js";
import { fetchJikan, voiceCards } from "./jikan.js";
import { JikanImport } from "./jikan-import.js";
import { AliasSync } from "./aliases.js";
import { BurstLimits } from "./request-limits.js";
import {
  SqlBudget,
  nextBudgetDay,
  storageQuotaResponse,
} from "./sql-budget.js";

const enc = new TextEncoder();
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
const hex = (buf) =>
  Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
const digest = async (s) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function passwordHash(password, salt = token(), minimum = 12) {
  if (
    typeof password !== "string" ||
    password.length < minimum ||
    password.length > 256
  )
    fail(`Use a password between ${minimum} and 256 characters.`);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return `${salt}:${hex(hash)}`;
}
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
const cookie = (value, secure, age = 2592000) =>
  `amq_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;

export class Game extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.bursts = new BurstLimits();
    const startup = { read: 0, written: 0 };
    this.engine = new Engine(
      (s, ...a) => {
        const cursor = ctx.storage.sql.exec(s, ...a),
          rows = [...cursor];
        if (this.budget)
          this.budget.observe(
            cursor.rowsRead,
            cursor.rowsWritten,
            this.engine.usageSource || "requests",
          );
        else {
          startup.read += cursor.rowsRead;
          startup.written += cursor.rowsWritten;
        }
        return rows;
      },
      (fn) => ctx.storage.transactionSync(fn),
    );
    this.jikan = new JikanImport(this.engine);
    this.aliases = new AliasSync(this.engine);
    this.budget = new SqlBudget(
      () => {
        const row = [
          ...ctx.storage.sql.exec(
            "SELECT value FROM catalog_meta WHERE key='sql-budget'",
          ),
        ][0];
        return row ? JSON.parse(row.value) : null;
      },
      (value) =>
        ctx.storage.sql.exec(
          "INSERT OR REPLACE INTO catalog_meta VALUES('sql-budget',?)",
          JSON.stringify(value),
        ),
    );
    this.budget.observe(startup.read, startup.written, "startup");
  }
  async alarm() {
    // Rescue an interrupted import without losing its checkpoint or racing a lease.
    if (this.jikan.nextAlarm() || this.aliases.nextAlarm())
      await this.ctx.storage.setAlarm(Date.now() + 65000);
    if (!this.budget.paused()) await this.jikan.step();
    await this.aliases.step();
    this.engine.track("maintenance", () =>
      this.engine.tx(() => this.engine.economy.fundStarters()),
    );
    if (!this.budget.paused())
      this.engine.track("indexing", () =>
        this.engine.tx(() => this.engine.economy.anime.step()),
      );
    const next = this.engine.track("maintenance", () =>
      this.engine.ensureAuctions(),
    );
    this.engine.track("maintenance", () => this.cleanup());
    this.budget.flush(true);
    await this.scheduleAlarm(next);
  }
  async scheduleAlarm(auctionEnd = this.engine.ensureAuctions()) {
    const next = Math.min(
      auctionEnd,
      this.budget.paused()
        ? nextBudgetDay(Date.now())
        : this.jikan.nextAlarm() || Infinity,
      this.aliases.nextAlarm() || Infinity,
      this.budget.paused()
        ? Infinity
        : this.engine.economy.anime.nextAlarm() || Infinity,
    );
    if ((await this.ctx.storage.getAlarm()) !== next)
      await this.ctx.storage.setAlarm(next);
  }
  cleanup() {
    const e = this.engine,
      n = Date.now();
    e.run("DELETE FROM sessions WHERE expires<?", n);
    e.run("DELETE FROM throttle WHERE expires<?", n);
    e.run(
      "UPDATE players SET invite=NULL,invite_expires=NULL WHERE invite_expires<?",
      n,
    );
    // Economic receipts are retained so old retries can never repeat a credit award.
  }
  rate(key, limit) {
    const e = this.engine,
      n = Date.now();
    e.tx(() => {
      const r = e.one("SELECT * FROM throttle WHERE key=?", key);
      if (!r || r.expires < n)
        e.run("INSERT OR REPLACE INTO throttle VALUES(?,1,?)", key, n + 900000);
      else {
        if (r.count >= limit)
          fail("Too many attempts. Try again in 15 minutes.", 429);
        e.run("UPDATE throttle SET count=count+1 WHERE key=?", key);
      }
    });
  }
  async fetch(request) {
    try {
      return await this.handle(request);
    } catch (err) {
      const limited = storageQuotaResponse(err);
      if (limited) return limited;
      if (!err.status)
        console.error(
          JSON.stringify({ event: "request_failed", name: err.name }),
        );
      return json(
        {
          error: err.status
            ? err.message
            : "The request could not be completed. Please try again.",
        },
        err.status || 500,
        err.retryAfter ? { "Retry-After": String(err.retryAfter) } : {},
      );
    } finally {
      try {
        this.budget.flush();
      } catch {
        /* The original quota failure must remain visible. */
      }
    }
  }
  async handle(request) {
    const e = this.engine,
      url = new URL(request.url),
      path = url.pathname.slice(5),
      post = request.method === "POST";
    e.tx(() => e.economy.fundStarters());
    if (!["GET", "POST"].includes(request.method))
      fail("Method not allowed.", 405);
    let b = {};
    if (post) {
      // Drain the forwarded body before rejecting so the proxy does not try to
      // transfer a request stream after this object has returned its response.
      const reader = request.body?.getReader();
      let bytes = 0;
      const parts = [];
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1000000) {
            await reader.cancel();
            fail("Request too large.", 413);
          }
          parts.push(value);
        }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const part of parts) {
        buffer.set(part, offset);
        offset += part.byteLength;
      }
      const raw = new TextDecoder().decode(buffer);
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin)
        fail("Cross-origin requests are not allowed.", 403);
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        fail("JSON is required.", 415);
      try {
        b = JSON.parse(raw);
      } catch {
        fail("Invalid JSON.");
      }
      if (!b || Array.isArray(b) || typeof b !== "object")
        fail("A JSON object is required.");
    }
    const secure = url.protocol === "https:",
      ip = request.headers.get("CF-Connecting-IP") || "local";
    const raw = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)amq_session=([a-f0-9]{48})(?:;|$)/)?.[1];
    const sessionHash = raw ? await digest(raw) : null;
    if (path === "health")
      return json({ ok: true, service: "AMQ Tours Gatcha" });
    if (path.startsWith("host/")) {
      const provided = request.headers.get("Authorization") || "";
      const hostTokenValid =
        this.env.HOST_TOKEN?.length >= 32 &&
        equal(
          await digest(provided),
          await digest("Bearer " + this.env.HOST_TOKEN),
        );
      const requireHost = () => {
        if (!hostTokenValid && !e.adminSession(sessionHash)) {
          this.rate("host:" + ip, 20);
          fail(
            "Sign in with an administrator account or supply a valid host token.",
            401,
          );
        }
      };
      requireHost();
      if (path === "host/state" && !post)
        return json({
          players: e.all(
            "SELECT id,COALESCE(display_name,name) AS name,balance,earned,is_admin,password IS NOT NULL AS registered FROM players ORDER BY name",
          ),
          aliases: e.all("SELECT * FROM aliases ORDER BY alias"),
          pickems: e.all("SELECT * FROM pickems ORDER BY id DESC LIMIT 100"),
          settings: Object.fromEntries(
            e.all("SELECT * FROM settings").map((s) => [s.key, s.value]),
          ),
          catalog: Object.entries(e.catalogStore.summary())
            .filter(([kind]) => ["character", "seiyuu"].includes(kind))
            .map(([kind, count]) => ({ kind, count })),
          catalogSummary: e.catalogStore.summary(),
          seiyuuImport: this.jikan.status(),
          aliasSync: this.aliases.status(),
          resourceBudget: this.budget.status(),
          cards: e.catalogStore.page("character", "", 1, 40).cards,
          ledger: e.all("SELECT * FROM ledger ORDER BY id DESC LIMIT 100"),
        });
      if (path === "host/jikan-status" && !post)
        return json(this.jikan.status());
      if (path === "host/acdb-retirement" && !post)
        return json(e.catalogStore.retirementPreview());
      if (!post) fail("POST required.", 405);
      if (path === "host/aliases-sync") {
        const status = await this.aliases.step(true);
        requireHost();
        await this.scheduleAlarm();
        return json({
          message:
            status.status === "synced"
              ? "AMQ Tours aliases synchronized."
              : "Alias sync: " + status.status,
          aliasSync: status,
        });
      }
      if (path === "host/replace-acdb") {
        const result = e.mutate(
          "host:replace-acdb",
          request.headers.get("Idempotency-Key"),
          b,
          () => ({
            ...e.catalogStore.retireAcdb(b.confirmation),
            import: this.jikan.enableCharacters(),
          }),
        );
        await this.scheduleAlarm();
        return json(result);
      }
      if (path === "host/favorites-refresh") {
        const status = e.tx(() =>
          this.jikan.refreshFavorites(b.intervalDays ?? 15),
        );
        await this.scheduleAlarm();
        return json({
          message:
            "Favorites refresh scheduled. Progress and retries are automatic.",
          import: status,
        });
      }
      if (path === "host/jikan-start" || path === "host/jikan-pause") {
        const status = path.endsWith("start")
          ? this.jikan.start()
          : this.jikan.pause();
        await this.scheduleAlarm();
        return json({
          message:
            status.status === "paused"
              ? "Tenrai import and favorites refresh paused."
              : "Tenrai import scheduled. Progress is saved automatically.",
          import: status,
        });
      }
      if (path === "host/admin-account") {
        const id = text(b.player, 100);
        if (id !== "368") fail("Host access belongs only to arpia97.", 403);
        const hash = await passwordHash(b.password, undefined, 8);
        requireHost();
        e.tx(() => {
          if (e.one("SELECT password FROM players WHERE id=?", id)?.password)
            fail(
              "This player already has an account. Existing passwords are not overwritten.",
              409,
            );
          e.host("players", {
            players: [{ id, name: text(b.name || id, 100) }],
          });
          e.run(
            "UPDATE players SET password=?,is_admin=1,invite=NULL,invite_expires=NULL WHERE id=?",
            hash,
            id,
          );
          e.run("DELETE FROM sessions WHERE player=?", id);
        });
        return json({ message: "Administrator account created.", player: id });
      }
      if (path === "host/jikan-probe") {
        const data = await fetchJikan("/anime/1/characters");
        const cards = voiceCards(data.data, "Cowboy Bebop");
        return json({
          available: true,
          provider: "Tenrai",
          actorCount: cards.length,
          examples: cards.slice(0, 3),
        });
      }
      if (path === "host/acdb-chunk")
        return json(e.tx(() => e.catalogStore.importChunk(b)));
      if (path === "host/acdb-chunks") {
        if (
          !Array.isArray(b.chunks) ||
          b.chunks.length < 1 ||
          b.chunks.length > 8
        )
          fail("Send one to eight catalog chunks.");
        return json(
          e.tx(() => ({
            saved: b.chunks.map((c) => e.catalogStore.importChunk(c)),
          })),
        );
      }
      if (path === "host/acdb-activate") {
        const result = e.tx(() => e.catalogStore.activate(b));
        const next = e.ensureAuctions();
        if (!(await this.ctx.storage.getAlarm()))
          await this.ctx.storage.setAlarm(next);
        return json(result);
      }
      if (path === "host/invite") {
        const id = text(b.player, 100),
          p = e.player(id);
        if (e.one("SELECT password FROM players WHERE id=?", id).password)
          fail("This player already registered. Use account reset instead.");
        const code = token(),
          hash = await digest(code);
        requireHost();
        e.run(
          "UPDATE players SET invite=?,invite_expires=? WHERE id=?",
          hash,
          Date.now() + 7 * 86400000,
          p.id,
        );
        return json({
          message: "One-use code created. It expires in seven days.",
          code,
          player: id,
        });
      }
      if (path === "host/reset") {
        const id = text(b.player, 100);
        e.player(id);
        const code = token(),
          hash = await digest(code);
        requireHost();
        e.tx(() => {
          e.run(
            "UPDATE players SET password=NULL,invite=?,invite_expires=?,access_reset=1 WHERE id=?",
            hash,
            Date.now() + 7 * 86400000,
            id,
          );
          e.run("DELETE FROM sessions WHERE player=?", id);
        });
        return json({
          message:
            "Account access reset. Existing sessions revoked; wallet and cards preserved.",
          code,
          player: id,
        });
      }
      const result = e.mutate(
        "host:" + path,
        request.headers.get("Idempotency-Key"),
        b,
        () => e.host(path.slice(5), b),
      );
      const next = e.ensureAuctions();
      await this.scheduleAlarm(next);
      return json(result);
    }
    if (["login", "register"].includes(path) && post) {
      this.rate("auth:" + ip, 20);
      const supplied = text(b.player, 110).toLowerCase(),
        alias = supplied.replace(/^(?:alias|id):/, "");
      const owner = e.one("SELECT player FROM aliases WHERE alias=?", alias);
      const direct = supplied.startsWith("alias:")
        ? null
        : e.one("SELECT * FROM players WHERE id=?", alias);
      const p =
        direct ||
        (!supplied.startsWith("id:") && owner
          ? e.one("SELECT * FROM players WHERE id=?", owner.player)
          : null);
      let expectedPassword;
      if (path === "register") {
        const invite = await digest(String(b.code || "").trim()),
          hash = await passwordHash(b.password);
        const betaMatches =
          !!this.env.BETA_REGISTRATION_CODE &&
          equal(invite, await digest(this.env.BETA_REGISTRATION_CODE));
        e.tx(() => {
          const current = p
            ? e.one("SELECT * FROM players WHERE id=?", p.id)
            : null;
          if (
            !registrationAllowed(
              current,
              equal(current?.invite, invite),
              betaMatches && betaRegistrationEnabled(e, this.env),
              Date.now(),
            )
          )
            fail("Invalid or expired registration code.", 401);
          e.run(
            "UPDATE players SET password=?,invite=NULL,invite_expires=NULL,access_reset=0 WHERE id=?",
            hash,
            p.id,
          );
        });
        expectedPassword = hash;
      } else {
        const salt =
          p?.password?.split(":")[0] || "unregistered-player-placeholder";
        const hash = await passwordHash(b.password, salt, 8);
        if (!p?.password || !equal(p.password, hash))
          fail("Player ID/alias or password is incorrect.", 401);
        // Re-check after the asynchronous hash so a concurrent host reset cannot be bypassed.
        if (
          e.one("SELECT password FROM players WHERE id=?", p.id).password !==
          p.password
        )
          fail("Account access changed. Please try again.", 401);
        expectedPassword = p.password;
      }
      const session = token(),
        hash = await digest(session);
      // Registration and token hashing can yield; a host reset in between must revoke this login too.
      const valid = e.one("SELECT password FROM players WHERE id=?", p.id);
      if (!valid?.password || valid.password !== expectedPassword)
        fail("Account access changed. Please try again.", 401);
      e.run(
        "INSERT INTO sessions VALUES(?,?,?)",
        hash,
        p.id,
        Date.now() + 30 * 86400000,
      );
      return json({ message: "Welcome back." }, 200, {
        "Set-Cookie": cookie(session, secure),
      });
    }
    const session = sessionHash
      ? e.one(
          "SELECT player FROM sessions WHERE token=? AND expires>?",
          sessionHash,
          Date.now(),
        )
      : null;
    if (path === "logout" && post) {
      if (raw) e.run("DELETE FROM sessions WHERE token=?", await digest(raw));
      return json({ message: "Signed out." }, 200, {
        "Set-Cookie": cookie("", secure, 0),
      });
    }
    // Paid game moves never need catalogue, inventory, auction settlement or
    // global rankings. Keep their authoritative wallet/state response small.
    if (
      (path === "game-state" && !post) ||
      (post &&
        (path.startsWith("mahjong-") ||
          path.startsWith("gem-") ||
          path === "gamble"))
    ) {
      if (!session) fail("Sign in to play.", 401);
      this.bursts.take("play:" + session.player);
      if (!post) return json(e.gameState(session.player));
      const result = e.mutate(
        session.player + ":" + path,
        request.headers.get("Idempotency-Key"),
        b,
        () => e.action(session.player, path, b),
      );
      return json({ ...result, gameState: e.gameState(session.player) });
    }
    const next = e.ensureAuctions();
    if (!(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(next);
    if (path === "featured" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json({ cards: e.featuredCards() });
    }
    if (path === "catalog" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.catalogStore.page(
          url.searchParams.get("kind") || "character",
          url.searchParams.get("q") || "",
          Number(url.searchParams.get("page") || 1),
          40,
          {
            rarity: url.searchParams.get("rarity") || "",
            role: url.searchParams.get("role") || "",
            sort: url.searchParams.get("sort") || "",
          },
        ),
      );
    }
    if (path === "rankings" && !post)
      return json(
        e.economy.rankings(
          url.searchParams.get("metric") || "earned",
          Number(url.searchParams.get("page") || 1),
        ),
      );
    if (path === "anime-collection" && !post) {
      if (!session) fail("Sign in to view your anime collection.", 401);
      return json(
        e.economy.anime.page(
          session.player,
          Number(url.searchParams.get("page") || 1),
        ),
      );
    }
    if (path === "anime-search" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.anime.search(url.searchParams.get("q"), session?.player),
      );
    }
    if (path === "pickems" && !post)
      return json(
        e.pickemPage(
          session?.player,
          Number(url.searchParams.get("page") || 1),
        ),
      );
    if (path === "market" && !post)
      return json(
        e.economy.market(
          url.searchParams.get("venue") || "shop",
          url.searchParams.get("kind") || "character",
          Number(url.searchParams.get("page") || 1),
        ),
      );
    if (path === "profiles" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      const result = e.profilesPage(
        url.searchParams.get("q"),
        Number(url.searchParams.get("page") || 1),
      );
      const profiles = result.profiles;
      return json({
        ...result,
        cards: e.catalogStore.cards([
          ...new Set(profiles.map((p) => p.avatar_card).filter(Boolean)),
        ]),
      });
    }
    if (path === "player" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(e.profile(text(url.searchParams.get("id"), 100)));
    }
    if (path === "state" && !post) {
      const loginReward = session
        ? e.tx(() => e.economy.daily(session.player, true))
        : null;
      return json({
        ...e.state(session?.player),
        loginReward,
        betaRegistration: betaRegistrationEnabled(e, this.env),
      });
    }
    if (!session) fail("Sign in to use credits and collect cards.", 401);
    if (
      !e.one(
        "SELECT player FROM sessions WHERE token=? AND expires>?",
        sessionHash,
        Date.now(),
      )
    )
      fail("Your session ended. Please sign in again.", 401);
    if (path === "mahjong-history" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.mahjong.history(
          session.player,
          Number(url.searchParams.get("page") || 1),
        ),
      );
    }
    if (!post) fail("Unknown endpoint.", 404);
    this.bursts.take("play:" + session.player);
    const result = e.mutate(
      session.player + ":" + path,
      request.headers.get("Idempotency-Key"),
      b,
      () => e.action(session.player, path, b),
    );
    await this.scheduleAlarm();
    return json(result);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const size = Number(request.headers.get("Content-Length") || 0);
      if (size > 1000000) return json({ error: "Request too large." }, 413);
      try {
        return await env.GAME.get(
          env.GAME.idFromName("amqtours-economy-v1"),
        ).fetch(request);
      } catch (err) {
        const limited = storageQuotaResponse(err);
        if (limited) return limited;
        throw err;
      }
    }
    const response = await env.ASSETS.fetch(request),
      headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
};
