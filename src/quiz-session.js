import { retryDurableOperation } from "./durable-recovery.js";
import { DurableObject } from "cloudflare:workers";
import { advanceQuizRun, quizRunView } from "./quiz-run-state.js";

// One small actor per run. No catalogue, market, importer, wallet or leaderboard
// work occurs between songs. Only Game can initialize or settle these actors.
export class QuizSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS moves(key TEXT PRIMARY KEY,input TEXT NOT NULL)");
  }
  read() {
    const row = [...this.ctx.storage.sql.exec("SELECT data FROM state WHERE id=1")][0];
    return row ? JSON.parse(row.data) : null;
  }
  write(state) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO state VALUES(1,?)", JSON.stringify(state));
  }
  async initialize({ player, sessionHash, expires, q, run }) {
    let state = this.read();
    if (state && (state.player !== player || state.run.id !== run.id || state.cancelled))
      throw Object.assign(new Error("This quiz session changed."), { status: 409 });
    state ||= { player, q: { id: q.id, published: q.published }, run };
    state.sessionHash = sessionHash;
    state.expires = expires;
    this.write(state);
    if (!(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(Date.now() + 30 * 86400000);
    return quizRunView(state.q, state.run, Date.now(), true);
  }
  authorize(state, sessionHash) {
    if (!state || state.cancelled || !sessionHash || state.sessionHash !== sessionHash || !Number.isSafeInteger(state.expires) || state.expires <= Date.now())
      throw Object.assign(new Error("Reopen the quiz to renew your session."), { status: 401 });
  }
  view(sessionHash) {
    const state = this.read();
    this.authorize(state, sessionHash);
    return quizRunView(state.q, state.run, Date.now(), true);
  }
  move(sessionHash, b, key, receivedAt) {
    const state = this.read();
    this.authorize(state, sessionHash);
    if (!["quiz-ready", "quiz-answer", "quiz-next"].includes(b.action) || (b.action === "quiz-next" && b.index === 19))
      throw Object.assign(new Error("Use the reward server to finish this quiz."), { status: 400 });
    if (typeof key !== "string" || key.length < 8 || key.length > 100)
      throw Object.assign(new Error("A retry key is required."), { status: 400 });
    const input = JSON.stringify(b);
    const prior = [...this.ctx.storage.sql.exec("SELECT input FROM moves WHERE key=?", key)][0];
    if (prior) {
      if (prior.input !== input)
        throw Object.assign(new Error("This retry key was already used."), { status: 409 });
      return { ...quizRunView(state.q, state.run, Date.now()), message: "Saved Move Resumed" };
    }
    if ([...this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM moves")][0].count >= 100)
      throw Object.assign(new Error("Too many quiz moves. Reopen the quiz."), { status: 429 });
    advanceQuizRun(state.run, b.action, b, Date.now(), receivedAt);
    const result = { ...quizRunView(state.q, state.run, Date.now()), message: "Answer Updated" };
    this.ctx.storage.transactionSync(() => {
      this.write(state);
      this.ctx.storage.sql.exec("INSERT INTO moves VALUES(?,?)", key, input);
    });
    return result;
  }
  snapshot(player, sessionHash) {
    const state = this.read();
    this.authorize(state, sessionHash);
    if (state.player !== player)
      throw Object.assign(new Error("This quiz belongs to another player."), { status: 403 });
    return state.run;
  }
  revoke(player, sessionHash = null) {
    const state = this.read();
    if (state && state.player === player && (!sessionHash || state.sessionHash === sessionHash)) {
      state.sessionHash = "";
      this.write(state);
    }
  }
  cancel(player, sessionHash = null) {
    const state = this.read();
    if (state && state.player === player && (!sessionHash || state.sessionHash === sessionHash)) {
      state.cancelled = true;
      this.write(state);
    }
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
export const quizSessionStub = (env, run) =>
  env.QUIZ_SESSIONS.get(env.QUIZ_SESSIONS.idFromName("quiz:" + run));

const encoder = new TextEncoder();
async function ticketKey(env) {
  if (!env.HOST_TOKEN || env.HOST_TOKEN.length < 32) throw Error("Quiz authorization is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(env.HOST_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const ticketMessage = (run, sessionHash, expires) =>
  encoder.encode(JSON.stringify(["quiz-session:v1", run, sessionHash, expires]));
export async function quizSessionTicket(env, run, sessionHash, expires) {
  const until = Math.min(expires, Date.now() + 12 * 3600000);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await ticketKey(env), ticketMessage(run, sessionHash, until)));
  return until + "." + [...signature].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function validTicket(env, ticket, run, sessionHash) {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 2 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  const expires = Number(parts[0]);
  if (expires <= Date.now()) return false;
  const signature = Uint8Array.from(parts[1].match(/../g), x => parseInt(x,16));
  return crypto.subtle.verify("HMAC", await ticketKey(env), signature, ticketMessage(run, sessionHash, expires));
}
export async function quizSessionRequest(request, env) {
  const url = new URL(request.url);
  const json = (data, status = 200) => Response.json(data, {
    status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
  try {
    if (!env.QUIZ_SESSIONS) return json({ error: "Fast quizzes are updating. Reopen the quiz." }, 503);
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
    const raw = request.headers.get("Cookie")?.match(/(?:^|;\s*)amq_session=([a-f0-9]{48})(?:;|$)/)?.[1];
    if (!raw) return json({ error: "Sign in to play quizzes." }, 401);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(raw)))]
      .map(x => x.toString(16).padStart(2, "0")).join("");
    const run = url.searchParams.get("run");
    if (!/^[a-f0-9-]{36}$/.test(run || "")) return json({ error: "Choose a valid quiz run." }, 400);
    // Verify a cookie-bound server ticket before creating/looking up any actor.
    // A made-up UUID and syntactically valid cookie must not allocate storage.
    if (!(await validTicket(env, request.headers.get("X-Quiz-Session"), run, hash)))
      return json({ error: "Reopen the quiz to authorize this session." }, 401);
    if (request.method === "GET") return json(await retryDurableOperation(()=>quizSessionStub(env,run).view(hash)));
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return json({ error: "JSON is required." }, 415);
    // Bound actual bytes, not an attacker-controlled Content-Length.
    const reader = request.body?.getReader(), chunks = [];
    let length = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); return json({ error: "Request too large." }, 413); }
      chunks.push(value);
    }
    const receivedAt = Date.now(), buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(buffer)); }
    catch { return json({ error: "Invalid JSON." }, 400); }
    if (!body || Array.isArray(body) || typeof body !== "object" || body.run !== run)
      return json({ error: "Choose a valid quiz move." }, 400);
    const key=request.headers.get("Idempotency-Key");
    return json(await retryDurableOperation(()=>quizSessionStub(env,run).move(hash,body,key,receivedAt)));
  } catch (error) {
    // Do not log cookies, submitted answers, or hidden song metadata.
    return json({ error: error.status ? error.message : "The quiz session is temporarily unavailable. Retry your saved move.",
      retryable: !error.status || error.status >= 500 }, error.status || 503);
  }
}
