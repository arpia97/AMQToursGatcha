import { DurableObject } from "cloudflare:workers";
import { Engine, fail, text } from "./engine.js";

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
async function passwordHash(password, salt = token()) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    fail("Use a password between 12 and 256 characters.");
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
    this.engine = new Engine(
      (s, ...a) => [...ctx.storage.sql.exec(s, ...a)],
      (fn) => ctx.storage.transactionSync(fn),
    );
  }
  async alarm() {
    const next = this.engine.ensureAuctions();
    this.cleanup();
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
      if (!err.status) console.error("Request failed", err.name);
      return json(
        {
          error: err.status
            ? err.message
            : "The request could not be completed. Please try again.",
        },
        err.status || 500,
      );
    }
  }
  async handle(request) {
    const e = this.engine,
      url = new URL(request.url),
      path = url.pathname.slice(5),
      post = request.method === "POST";
    if (!["GET", "POST"].includes(request.method))
      fail("Method not allowed.", 405);
    let b = {};
    if (post) {
      // Drain the forwarded body before rejecting so the proxy does not try to
      // transfer a request stream after this object has returned its response.
      const raw = await request.text();
      if (raw.length > 1000000) fail("Request too large.", 413);
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
    if (path === "health")
      return json({ ok: true, service: "AMQ Tours Gatcha" });
    if (path.startsWith("host/")) {
      this.rate("host:" + ip, 150);
      if (!this.env.HOST_TOKEN || this.env.HOST_TOKEN.length < 32)
        fail(
          "Host access is not configured. Set HOST_TOKEN using Wrangler secrets.",
          503,
        );
      const provided = request.headers.get("Authorization") || "";
      if (
        !equal(
          await digest(provided),
          await digest("Bearer " + this.env.HOST_TOKEN),
        )
      )
        fail("Invalid host token.", 401);
      if (path === "host/state" && !post)
        return json({
          players: e.all(
            "SELECT id,COALESCE(display_name,name) AS name,balance,earned,password IS NOT NULL AS registered FROM players ORDER BY name",
          ),
          aliases: e.all("SELECT * FROM aliases ORDER BY alias"),
          pickems: e.all("SELECT * FROM pickems ORDER BY id DESC LIMIT 100"),
          settings: Object.fromEntries(
            e.all("SELECT * FROM settings").map((s) => [s.key, s.value]),
          ),
          catalog: e.all(
            "SELECT kind,count(*) AS count FROM catalog WHERE active=1 GROUP BY kind",
          ),
          cards: e.all("SELECT * FROM catalog ORDER BY kind,name"),
          ledger: e.all("SELECT * FROM ledger ORDER BY id DESC LIMIT 100"),
        });
      if (!post) fail("POST required.", 405);
      if (path === "host/invite") {
        const id = text(b.player, 100),
          p = e.player(id);
        if (e.one("SELECT password FROM players WHERE id=?", id).password)
          fail("This player already registered. Use account reset instead.");
        const code = token(),
          hash = await digest(code);
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
        e.tx(() => {
          e.run(
            "UPDATE players SET password=NULL,invite=?,invite_expires=? WHERE id=?",
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
      if (!(await this.ctx.storage.getAlarm()))
        await this.ctx.storage.setAlarm(next);
      return json(result);
    }
    if (["login", "register"].includes(path) && post) {
      this.rate("auth:" + ip, 20);
      const alias = text(b.player, 100).toLowerCase(),
        owner = e.one("SELECT player FROM aliases WHERE alias=?", alias);
      const p = owner
        ? e.one("SELECT * FROM players WHERE id=?", owner.player)
        : null;
      let expectedPassword;
      if (path === "register") {
        const invite = await digest(String(b.code || "")),
          hash = await passwordHash(b.password);
        e.tx(() => {
          const current = p
            ? e.one("SELECT * FROM players WHERE id=?", p.id)
            : null;
          if (
            !current ||
            current.password ||
            !equal(current.invite, invite) ||
            current.invite_expires < Date.now()
          )
            fail("Invalid or expired registration code.", 401);
          e.run(
            "UPDATE players SET password=?,invite=NULL,invite_expires=NULL WHERE id=?",
            hash,
            p.id,
          );
        });
        expectedPassword = hash;
      } else {
        const salt =
          p?.password?.split(":")[0] || "unregistered-player-placeholder";
        const hash = await passwordHash(b.password, salt);
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
    const raw = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)amq_session=([a-f0-9]{48})(?:;|$)/)?.[1];
    const sessionHash = raw ? await digest(raw) : null;
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
    const next = e.ensureAuctions();
    if (!(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(next);
    if (path === "profiles" && !post) {
      this.rate("search:" + ip, 150);
      return json({ profiles: e.searchProfiles(url.searchParams.get("q")) });
    }
    if (path === "player" && !post) {
      this.rate("search:" + ip, 150);
      return json(e.profile(text(url.searchParams.get("id"), 100)));
    }
    if (path === "state" && !post) return json(e.state(session?.player));
    if (!session) fail("Sign in to use credits and collect cards.", 401);
    if (
      !e.one(
        "SELECT player FROM sessions WHERE token=? AND expires>?",
        sessionHash,
        Date.now(),
      )
    )
      fail("Your session ended. Please sign in again.", 401);
    if (!post) fail("Unknown endpoint.", 404);
    this.rate("player:" + session.player, 120);
    return json(
      e.mutate(
        session.player + ":" + path,
        request.headers.get("Idempotency-Key"),
        b,
        () => e.action(session.player, path, b),
      ),
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const size = Number(request.headers.get("Content-Length") || 0);
      if (size > 1000000) return json({ error: "Request too large." }, 413);
      return env.GAME.get(env.GAME.idFromName("amqtours-economy-v1")).fetch(
        request,
      );
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
