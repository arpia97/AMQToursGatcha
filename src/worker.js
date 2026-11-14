import { isPlayerRoute } from "../public/site-navigation.js";
import { cachedQuizCover } from "./quiz-cover-cache.js";
import { ENHANCEMENT_REVISION } from "../public/card-values.js";
import { alchemyCompensation } from "./alchemy-compensation.js";
import { repairQuizAnswers } from "./quiz-answer-repair.js";
import { checkQuizAudio, applyQuizAudioReview } from "./quiz-audio.js";
import { loadQuizMaster } from "./quiz-source.js";
import { resolveQuizImport } from "./quiz-import.js";
import { prepareQuizSongs,quizImportRows } from "../public/quiz-rules.js";
import {libraryQuery} from '../public/quiz-library-data.js';
import {quizLibraryRequest} from './quiz-library-actor.js';
import {syncQuizLibraryAnswers} from './quiz-library-sync.js';
export {QuizLibrary} from './quiz-library-actor.js';
import { durableRead, storageUnavailableResponse } from "./durable-recovery.js";
import { DurableObject } from "cloudflare:workers";
import { Engine, fail, text, integer } from "./engine.js";
import { registrationAllowed } from "./registration.js";
import { inspectEconomyRepair, applyEconomyRepair } from "./economy-repair.js";
import { inspectAccountRollback, applyAccountRollback } from "./account-rollback.js";
import { TARGETED_RECOVERY_ID, TARGETED_RECOVERY_DIGEST, inspectTargetedRecovery, applyTargetedRecovery } from "./targeted-recovery.js";
import { SPECIALPACK_ROLLBACK_ID, SPECIALPACK_SCOPE_DIGEST, inspectSpecialPackRollback, applySpecialPackRollback } from "./specialpack-rollback.js";
import {
  registrationForwarding,
  registrationPolicy,
} from "./registration-forwarding.js";
import { fetchJikan, voiceCards } from "./jikan.js";
import { JikanImport } from "./jikan-import.js";
import { AliasSync } from "./aliases.js";
import { BurstLimits } from "./request-limits.js";
import {
  SqlBudget,
  nextBudgetDay,
  storageQuotaResponse,
} from "./sql-budget.js";
import communityCards from "../public/community-cards.json" with { type: "json" };

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
    this.fetchVoiceSource = (path) =>
      fetchJikan(path, fetch, { serverKey: env.TENRAI_SERVER_KEY });
    this.jikan = new JikanImport(this.engine, this.fetchVoiceSource, {
      accessMode: env.TENRAI_SERVER_KEY?.trim() ? "server-key" : "public",
    });
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
      Date.now,
      { mode: env.BACKGROUND_IMPORT_MODE },
    );
    this.budget.observe(startup.read, startup.written, "startup");
  }
  syncCommunityCards() {
    if (this._communitySynced) return;
    this._communitySynced = true;
    const hasSeed = this.engine.one(
      "SELECT id FROM catalog WHERE id='community-ggius-arronchu'",
    );
    const missingCards = hasSeed
      ? communityCards.filter(
          (c) => !this.engine.one("SELECT id FROM catalog WHERE id=?", c.id),
        )
      : [];
    if (missingCards.length) {
      this.engine.tx(() => {
        this.engine.host("catalog", { cards: missingCards });
      });
    }
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
  async quizAnswersMaster(){
    if(!this.quizMaster||Date.now()-this.quizMaster.at>86400000){
      try{this.quizMaster={at:Date.now(),...await loadQuizMaster(fetch,this.env.ASSETS)};}
      catch{this.quizMaster={at:Date.now()-86400000+60000,data:{masterListId:'export-or-song-cache',animeMap:{}},mode:'export-or-song-cache'};}
    }return this.quizMaster;
  }
  maintainMarket(force = false) {
    const now = this.engine.now();
    if (!force && now < this.marketCheckedAt + 5000 && now < this.marketNext)
      return this.marketNext;
    this.marketNext = this.engine.ensureAuctions();
    this.marketCheckedAt = now;
    return this.marketNext;
  }
  async scheduleAlarm(auctionEnd = this.maintainMarket(true)) {
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
      const limited =
        storageQuotaResponse(err) || storageUnavailableResponse(err);
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
    this.syncCommunityCards();
    const e = this.engine,
      url = new URL(request.url),
      path = url.pathname.slice(5),
      post = request.method === "POST";
    // Timed quiz moves do not award starters or alter market/import alarms.
    // Leave shared housekeeping to normal requests and the existing alarm.
    const quizMove = [
      "quiz-start",
      "quiz-restart",
      "quiz-stop",
      "quiz-ready",
      "quiz-answer",
      "quiz-next",
    ].includes(path);
    const quizRun = path === "quiz-run" && !post;
    if(path==="registration-policy-actor" && !post) return json(registrationPolicy);
    if (!quizMove && !quizRun && !path.startsWith('host/quiz-master')) e.tx(() => e.economy.fundStarters());
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
          if (
            bytes >
            (["host/quiz-save", "host/quiz-preview"].includes(path)
              ? 5000000
              : 1000000)
          ) {
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
          // Opening a signed-out console is a normal session check.
          const checkingSession = path === "host/state" && !post && !provided && !raw &&
            url.searchParams.get("section") === "rewards";
          if (!checkingSession) this.rate("host:" + ip, 20);
          fail(
            "Sign in with an administrator account or supply a valid host token.",
            401,
          );
        }
      };
      requireHost();
      const requireOwner = () => {
        requireHost();
        if (!hostTokenValid && e.hostIdentity(sessionHash) !== "368")
          fail(
            "Only arpia97 can manage host permissions or privileged accounts.",
            403,
          );
      };
      if (
        [
          "host/permissions",
          "host/account-lock",
          "host/fusion-revert-preview",
          "host/fusion-revert",
          "host/fusion-revert-receipt",
          "host/admin-account",
          "host/mahjong-revert",
          "host/mahjong-reversal-preview",
          "host/mahjong-reversal-receipt",
          "host/economy-repair-preview",
          "host/economy-repair",
          "host/economy-repair-receipt",
          "host/account-rollback-preview",
          "host/account-rollback",
          "host/account-rollback-receipt",
        ].includes(path) ||
        (path === "host/reset-all" && b.deleteRegistry) ||
        (["host/reset", "host/invite"].includes(path) &&
          e.one("SELECT is_admin FROM players WHERE id=?", b.player || "")
            ?.is_admin)
      )
        requireOwner();
      if (path === "host/fusion-revert-preview" && !post)
        return json(
          e.economy.fusion.reversalPreview(
            url.searchParams.get("player"),
            url.searchParams.get("key"),
          ),
        );
      if (path === "host/fusion-revert-receipt" && !post) {
        const receipt = e.one(
          "SELECT result FROM receipts WHERE scope='host:fusion-revert' AND key=?",
          text(url.searchParams.get("key"), 100),
        );
        return json({ result: receipt ? JSON.parse(receipt.result) : null });
      }
      if (path === "host/fusion-revert" && post) {
        if (b.confirmation !== "REVERT FUSION")
          fail("Confirm the reviewed fusion restoration.");
        const key = text(request.headers.get("Idempotency-Key"), 100);
        if (key !== b.sourceKey)
          fail("Use the original fusion key for this restoration.");
        return json(
          e.mutate("host:fusion-revert", key, b, () =>
            e.economy.fusion.reverse(
              text(b.player, 100),
              text(b.sourceKey, 100),
            ),
          ),
        );
      }
      if (path === "host/quiz-scores-reset" && post)
        return json(
          e.mutate(
            "host:quiz-scores-reset",
            request.headers.get("Idempotency-Key"),
            b,
            () => e.quiz.resetScores(b),
          ),
        );
      if (path === "host/permissions" && post) {
        return json(
          e.mutate(
            "host:permissions",
            request.headers.get("Idempotency-Key"),
            b,
            () => e.setHostAccess("368", b),
          ),
        );
      }
      if (["host/account-rollback-preview", "host/account-rollback"].includes(path) && post) {
        const { digest: expected,...plan } = b;
        const actual = await digest(JSON.stringify(plan));
        if (actual !== expected) fail("Rollback manifest digest changed.",409);
        requireOwner();
        const targeted = plan.repairId === TARGETED_RECOVERY_ID;
        if (targeted && actual !== TARGETED_RECOVERY_DIGEST)
          fail("The recovery manifest is not the reviewed correction.", 409);
        let scopeDigest = null;
        const group = plan.repairId === SPECIALPACK_ROLLBACK_ID;
        if (group) {
          scopeDigest = await digest(JSON.stringify(plan.scope));
          if (scopeDigest !== SPECIALPACK_SCOPE_DIGEST)
            fail("The rollback scope is not the reviewed correction.", 409);
          requireOwner();
        }
        if (path.endsWith("-preview"))
          return json(e.tx(() => targeted ? inspectTargetedRecovery(e,plan,actual) : group ? inspectSpecialPackRollback(e,plan,scopeDigest) : inspectAccountRollback(e,plan)));
        const key = text(request.headers.get("Idempotency-Key"),100);
        if (key !== plan.repairId) fail("Use the rollback ID as the request key.");
        const bookmark = await this.ctx.storage.getCurrentBookmark();
        requireOwner();
        return json(e.mutate("host:account-rollback",key,b,() => targeted ? applyTargetedRecovery(e,plan,actual,bookmark) : group ? applySpecialPackRollback(e,plan,actual,bookmark,scopeDigest) : applyAccountRollback(e,plan,actual,bookmark)));
      }
      if (path === "host/account-rollback-receipt" && !post) {
        const saved = e.one("SELECT result FROM receipts WHERE scope='host:account-rollback' AND key=?",text(url.searchParams.get("id"),100));
        return json({result:saved ? JSON.parse(saved.result) : null});
      }
      if (
        ["host/economy-repair-preview", "host/economy-repair"].includes(path) &&
        post
      ) {
        const { digest: expected, ...plan } = b;
        const actual = await digest(JSON.stringify(plan));
        if (actual !== expected)
          fail("Repair digest does not match the reviewed manifest.", 409);
        requireOwner();
        if (path.endsWith("-preview"))
          return json(e.tx(() => inspectEconomyRepair(e, plan)));
        const key = text(request.headers.get("Idempotency-Key"), 100);
        if (key !== plan.repairId)
          fail("Use the repair ID as the idempotency key.");
        const bookmark = await this.ctx.storage.getCurrentBookmark();
        requireOwner();
        return json(
          e.mutate("host:economy-repair", key, b, () =>
            applyEconomyRepair(e, plan, actual, bookmark),
          ),
        );
      }
      if (path === "host/economy-repair-receipt" && !post) {
        const saved = e.one(
          "SELECT result FROM receipts WHERE scope='host:economy-repair' AND key=?",
          text(url.searchParams.get("id"), 100),
        );
        return json({ result: saved ? JSON.parse(saved.result) : null });
      }
      if (path === "host/mahjong-reversal-preview" && !post)
        return json(
          e.economy.mahjong.reversalPreview(
            url.searchParams.get("player"),
            Number(url.searchParams.get("limit") || 100),
          ),
        );
      if (path === "host/mahjong-reversal-receipt" && !post) {
        const r = e.one(
          "SELECT result FROM receipts WHERE scope='host:host/mahjong-revert' AND key=?",
          text(url.searchParams.get("key"), 100),
        );
        return json({ result: r ? JSON.parse(r.result) : null });
      }
      if (path === "host/enhancement-migration" && !post) {
        const requestedRevision = url.searchParams.get("revision");
        const migration = requestedRevision
          ? e.one(
              "SELECT * FROM enhancement_migrations WHERE revision=?",
              integer(Number(requestedRevision), 2, ENHANCEMENT_REVISION),
            )
          : e.one(
              "SELECT * FROM enhancement_migrations ORDER BY revision DESC LIMIT 1",
            );
        if (!migration) fail("Enhancement migration receipt not found.", 404);
        const result = {
          ...migration,
          invalidInventoryLevels: e.one(
            "SELECT count(*) AS n FROM inventory WHERE level<1 OR level>6",
          ).n,
        };
        if (url.searchParams.get("audit") === "1") {
          requireOwner();
          result.rows = (
            migration.revision >= 3
              ? e.all(
                  "SELECT * FROM enhancement_revision_rows WHERE revision=? ORDER BY location,record_key",
                  migration.revision,
                )
              : e.all(
                  "SELECT * FROM enhancement_migration_rows ORDER BY location,record_key",
                )
          ).map((r) => ({
            ...r,
            before: JSON.parse(r.before_json),
            after: JSON.parse(r.after_json),
          }));
          result.enhancements = e
            .all(
              "SELECT scope,key,input,result,at FROM receipts WHERE scope LIKE '%:enhance' AND at<=? ORDER BY at,key",
              migration?.at || 0,
            )
            .map((r) => ({
              scope: r.scope,
              key: r.key,
              at: r.at,
              input: JSON.parse(r.input),
              result: JSON.parse(r.result),
            }));
          const auditPlayer = url.searchParams.get("player");
          if (auditPlayer) {
            const player = text(auditPlayer, 100);
            const actions = [
              "pack",
              "daily-pack",
              "enhance",
              "sell-instant",
              "sell-batch",
              "alchemy-feed",
              "alchemy-draw",
              "shop-buy",
              "buyout",
              "claim",
              "trade-list",
              "trade-offer",
              "trade-accept",
              "trade-withdraw",
              "list-card",
              "cancel-listing",
              "fusion",
            ];
            result.history = e
              .all(
                "SELECT scope,key,input,result,at FROM receipts WHERE scope IN (" +
                  actions.map(() => "?").join(",") +
                  ") AND at<=? ORDER BY at,key LIMIT 3000",
                ...actions.map((a) => player + ":" + a),
                migration.at,
              )
              .map((r) => ({
                ...r,
                input: JSON.parse(r.input),
                result: JSON.parse(r.result),
              }));
            result.playerLedger = e.all(
              "SELECT * FROM ledger WHERE player=? AND at<=? ORDER BY id",
              player,
              migration.at,
            );
            const card = url.searchParams.get("card");
            if (card)
              result.cardTransactions = {
                market: e.all(
                  "SELECT * FROM market_listings WHERE card=?",
                  card,
                ),
                auctions: e.all("SELECT * FROM auctions WHERE card=?", card),
                tradeListings: e.all(
                  "SELECT * FROM trade_listings WHERE card=?",
                  card,
                ),
                tradeOffers: e.all(
                  "SELECT * FROM trade_offer_cards WHERE card=?",
                  card,
                ),
              };
          }

          result.current = result.rows
            .filter((r) => r.location === "inventory")
            .map((r) => ({
              player: r.before.player,
              card: r.before.card,
              inventory:
                e.one(
                  "SELECT * FROM inventory WHERE player=? AND card=?",
                  r.before.player,
                  r.before.card,
                ) || null,
            }));
        }
        return json(result);
      }
      if (path === "host/alchemy-compensation") {
        requireOwner();
        if (post && b.confirmed !== true)
          fail("Confirm the Alchemy XP compensation.");
        return json(e.tx(() => alchemyCompensation(e, post)));
      }
      if (path === "host/quiz-answer-repair") {
        requireOwner();
        if (post && b.confirmed !== true)
          fail("Confirm the quiz answer repair.");
        const saved = e.tx(() => repairQuizAnswers(e, null));
        if (saved) return json(saved);
        const master = await loadQuizMaster(fetch, this.env.ASSETS, true);
        requireOwner();
        return json(
          e.tx(() => repairQuizAnswers(e, master.data, post, b.signature)),
        );
      }
      if (path === "host/quiz-songs" && !post)
        return json(e.quiz.hostSongs(url.searchParams.get("id")));
      if(path==='host/quiz-master'&&!post){const result=await quizLibraryRequest(this.env,'/status');requireHost();if(!result)fail('The Song Cache Is Not Configured.',503);return json(result);}
      if(path==='host/quiz-master-refresh'&&post){const result=await quizLibraryRequest(this.env,'/refresh',b,text(request.headers.get('Idempotency-Key'),100));requireHost();if(!result)fail('The Song Cache Is Not Configured.',503);if(b.action==='start')this.quizMaster=null;return json(result);}
      if(path==='host/quiz-master-sync'&&post){
        const id=text(b.quiz,100),key=text(request.headers.get('Idempotency-Key'),100),fingerprint={digest:await digest(JSON.stringify(b))};
        const before=e.all('SELECT id,data FROM quiz_songs WHERE quiz=? ORDER BY id',id);if(!before.length)fail('Choose a Saved Quiz.');
        const library=await quizLibraryRequest(this.env,'/lookup',libraryQuery(before.map(row=>JSON.parse(row.data))));if(!library)fail('The Song Cache Is Not Configured.',503);
        const master=await this.quizAnswersMaster();requireHost();return json(e.mutate('host:quiz-master-sync',key,fingerprint,()=>syncQuizLibraryAnswers(e,id,before,master.data,library)));
      }
      if (path === "host/quizzes" && !post)
        return json({ quizzes: e.quiz.list(null, true) });
      if (path === "host/quiz-audio-check" && post) {
        this.quizLinkCache ||= new Map();
        const result = await checkQuizAudio(
          b.songs,
          fetch,
          this.quizLinkCache,
          Date.now(),
          b.force === true,
        );
        requireHost();
        return json(result);
      }
      if (["host/quiz-save", "host/quiz-preview"].includes(path) && post) {
        const preview = path === "host/quiz-preview";
        const key = text(request.headers.get("Idempotency-Key"), 100);
        const fingerprint = { digest: await digest(JSON.stringify(b)) };
        const saved =
          !preview &&
          e.one(
            "SELECT input,result FROM receipts WHERE scope='host:quiz-save' AND key=?",
            key,
          );
        if (saved) {
          if (saved.input !== JSON.stringify(fingerprint))
            fail("This request ID was used for a different action.", 409);
          return json(JSON.parse(saved.result));
        }
        if (b.input !== undefined) {
          await this.quizAnswersMaster();
          let prepared;
          try {
            const importedRows=quizImportRows(b.input);
            let library={songs:[]};try{library=await quizLibraryRequest(this.env,'/lookup',libraryQuery(importedRows))||library;}catch{ /* AMQ/export matching remains available if the cache is restarting. */ }
            this.quizAudioCache ||= new Map();
            const rows = await resolveQuizImport(
              importedRows,
              fetch,
              this.quizAudioCache,
              Date.now(),
              library.songs,
            );
            prepared = prepareQuizSongs(rows, this.quizMaster.data,library);
          } catch (err) {
            fail(err.message, err.status || 400);
          }
          if (preview) {
            requireHost();
            return json({
              songs: prepared.songs,
              rejected: prepared.rejected,
            });
          }
          prepared = applyQuizAudioReview(
            prepared,
            b,
            this.quizLinkCache || new Map(),
          );
          if (!prepared.songs.length)
            fail(
              "No playable MP3 songs matched AMQ. " +
                (prepared.rejected
                  .slice(0, 3)
                  .map((r) => "Row " + r.row + ": " + r.reason)
                  .join("; ") || "The uploaded song list is empty."),
            );
          b = {
            ...b,
            songs: prepared.songs,
            rejected: prepared.rejected,
            source: prepared.masterListId,
          };
          delete b.input;
        } else {
          if (preview) fail("Select a song JSON to review.");
          delete b.songs;
        }
        requireHost();
        return json(
          e.mutate("host:quiz-save", key, fingerprint, () => ({
            ...e.quiz.save(b),
            answerSource: this.quizMaster?.mode || "saved",
            answerVersion: b.source,
          })),
        );
      }
      if (path === "host/credit-audit" && !post)
        return json(e.creditAudit.page(Object.fromEntries(url.searchParams)));
      if (path === "host/activity-csv" && !post)
        return new Response(e.creditAudit.recentCSV(), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="amqtours-recent-activity-12h.csv"',
            "Cache-Control": "no-store",
          },
        });
      if (path === "host/state" && !post) {
        // Older clients request the full overview. The console requests one section.
        const section = url.searchParams.get("section");
        const needs = (...sections) => !section || sections.includes(section);
        const data = {};
        if (needs("rewards", "players", "credit-audit", "resets")) {
          const fields = needs("players") ? ",earned,is_admin,account_locked,password IS NOT NULL AS registered" : "";
          data.players = e.all("SELECT id,COALESCE(display_name,name) AS name,balance" + fields + " FROM players ORDER BY name");
        }
        if (needs("players", "rewards")) data.aliases = e.all("SELECT player,alias FROM aliases ORDER BY alias");
        if (needs("rewards")) data.usernames = e.all("SELECT player,label FROM usernames ORDER BY player,at");
        if (needs("players")) {
          data.canManageHosts = hostTokenValid || e.hostIdentity(sessionHash) === "368";
          data.aliasSync = this.aliases.status();
        }
        if (needs("pickems")) {
          data.pickems = e.all("SELECT * FROM pickems ORDER BY id DESC LIMIT 100");
          data.pickemEvents = e.all("SELECT * FROM pickem_events ORDER BY id DESC LIMIT 30")
            .map(event => ({ ...event, teams: JSON.parse(event.teams) }));
        }
        if (needs("catalog")) {
          data.settings = Object.fromEntries(e.all("SELECT * FROM settings").map(s => [s.key, s.value]));
          data.catalogSummary = e.catalogStore.summary();
          data.catalog = ["character", "seiyuu"].map(kind => ({ kind, count: data.catalogSummary[kind] }));
          data.seiyuuImport = this.jikan.status();
          data.resourceBudget = this.budget.status();
          data.cards = e.catalogStore.page("character", "", 1, 40).cards;
        }
        if (needs("activity")) data.ledger = e.all("SELECT * FROM ledger ORDER BY id DESC LIMIT 100");
        return json(data);
      }
      if (path === "host/jikan-status" && !post)
        return json(this.jikan.status());
      if (path === "host/pickem-event" && !post)
        return json(e.pickemEvents.read(Number(url.searchParams.get("event"))));
      if (path === "host/pickem-match" && !post)
        return json(
          e.pickemEvents.match(Number(url.searchParams.get("pickem"))),
        );
      if (path === "host/acdb-retirement" && !post)
        return json(e.catalogStore.retirementPreview());
      if (!post) fail("POST required.", 405);
      if (path === "host/deduction-preview") return json(e.deductionQuote(b));
      if (path === "host/participation-preview")
        return json(e.participation.preview(b.text));
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
      if (path === "host/anime-appearances-start") {
        const status = e.mutate(
          "host:anime-appearances-start",
          request.headers.get("Idempotency-Key"),
          b,
          () => this.jikan.startAppearances(b.priority || []),
        );
        await this.scheduleAlarm();
        return json({
          message:
            "Anime appearance enrichment scheduled. Existing cards and discovery checkpoints are preserved.",
          import: status,
        });
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
        requireOwner();
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
        const data = await this.fetchVoiceSource("/anime/1/characters");
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
        e.assertAccountUnlocked(id);
        if (e.one("SELECT password FROM players WHERE id=?", id).password)
          fail("This player already registered. Use account reset instead.");
        const code = token(),
          hash = await digest(code);
        requireHost();
        if (e.player(id).is_admin) requireOwner();
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
        if (e.player(id).is_admin) requireOwner();
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
        () =>
          e.creditAudit.asHost(
            hostTokenValid ? "host-token" : e.hostIdentity(sessionHash),
            () => e.host(path.slice(5), b),
          ),
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
      if(p?.account_locked) fail("This account is locked. Contact the host.",403);
      if (path === "register") {
        const invite = await digest(String(b.code || "").trim()),
          hash = await passwordHash(b.password);

        e.tx(() => {
          const current = p
            ? e.one("SELECT * FROM players WHERE id=?", p.id)
            : null;
          if (
            !registrationAllowed(
              current,
              equal(current?.invite, invite),
              Date.now(),
            )
          )
            fail(
              !current
                ? "Choose a registered AMQ Tours player ID or alias."
                : current.password
                  ? "This player already has an account. Sign in or recover account access."
                  : "A valid one-use recovery code is required for this account.",
              401,
            );
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
      const valid = e.one("SELECT password,account_locked FROM players WHERE id=?", p.id);
      if(valid?.account_locked) fail("This account is locked. Contact the host.",403);
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
    // Shared identity only: the tour portal must not load games, claim rewards,
    // settle auctions or scan the catalogue just to verify an account.
    if (path === "account" && !post) {
      return json({ account: e.account(session?.player) });
    }
    if (path === "quiz-cover" && !post) {
      const cover = e.quiz.cover(
        url.searchParams.get("quiz"),
        session?.player,
        url.searchParams.get("v"),
      );
      return new Response(
        Uint8Array.from(atob(cover.base64), (c) => c.charCodeAt(0)),
        {
          headers: {
            "Content-Type": cover.type,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": cover.published
              ? "public, max-age=86400, immutable"
              : "private, no-store",
          },
        },
      );
    }
    if (quizMove || quizRun) {
      if (!session) fail("Sign in to play quizzes.", 401);
      if (!post) {
        if (path !== "quiz-run") fail("Unknown endpoint.", 404);
        this.bursts.take("read:" + session.player, 60, 5);
        return json(e.quiz.view(session.player, url.searchParams.get("quiz")));
      }
      this.bursts.take("play:" + session.player);
      const result = e.mutate(
        session.player + ":" + path,
        request.headers.get("Idempotency-Key"),
        b,
        () => e.action(session.player, path, b),
      );
      return json(result);
    }
    // Paid game moves never need catalogue, inventory, auction settlement or
    // global rankings. Keep their authoritative wallet/state response small.
    if (
      (path === "game-state" && !post) ||
      (post &&
        (path.startsWith("mahjong-") ||
          path.startsWith("gem-") ||
          path.startsWith("horse-") ||
          path.startsWith("roulette-") ||
          path.startsWith("blackjack-") ||
          path.startsWith("climb-") ||
          path === "notice-seen" ||
          path === "gamble"))
    ) {
      if (!session) fail("Sign in to play.", 401);
      this.bursts.take("play:" + session.player);
      if (!post) {
        e.tx(() => {
          e.economy.horse.settleDue(session.player);
          e.economy.pachinko.settleDue(session.player);
        });
        return json(e.gameState(session.player));
      }
      const result = e.mutate(
        session.player + ":" + path,
        request.headers.get("Idempotency-Key"),
        b,
        () => e.action(session.player, path, b),
      );
      return json({ ...result, gameState: e.gameState(session.player) });
    }
    const next = this.maintainMarket();
    if (!(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(next);
    if (path === "featured" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json({ cards: e.featuredCards() });
    }
    if (path === "fusion-outcomes" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.fusion.outcomes({
          rarity: url.searchParams.get("rarity") || "",
          kind: url.searchParams.get("kind") || "mixed",
          query: url.searchParams.get("q") || "",
          page: Number(url.searchParams.get("page") || 1),
        }),
      );
    }
    if (path === "alchemy-targets" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.alchemy.targetsPage(
          {
            rarity: url.searchParams.get("rarity") || "",
            kind: url.searchParams.get("kind") || "mixed",
            query: url.searchParams.get("q") || "",
            page: Number(url.searchParams.get("page") || 1),
            wishlistOnly: url.searchParams.get("wishlist") === "1",
          },
          session?.player || null,
        ),
      );
    }
    if (path === "card-counts" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      let ids;
      try {
        ids = JSON.parse(url.searchParams.get("cards") || "[]");
      } catch {
        fail("Choose a valid card list.");
      }
      if (
        !Array.isArray(ids) ||
        ids.length > 50 ||
        ids.some((id) => typeof id !== "string" || !id || id.length > 100)
      )
        fail("Choose up to 50 card IDs.");
      return json({
        cards: e.economy.wishlist.withCounts(
          e.catalogStore.cards([...new Set(ids)]),
        ),
      });
    }
    if (path === "card-collectors" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.wishlist.collectors(
          url.searchParams.get("card"),
          url.searchParams.get("view") || "owned",
          Number(url.searchParams.get("page") || 1),
        ),
      );
    }
    if ((path === "catalog-recent" || path === "catalog") && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      const result =
        path === "catalog-recent"
          ? e.catalogStore.recentPage(Number(url.searchParams.get("page") || 1))
          : e.catalogStore.page(
              url.searchParams.get("kind") || "character",
              url.searchParams.get("q") || "",
              Number(url.searchParams.get("page") || 1),
              40,
              {
                rarity: url.searchParams.get("rarity") || "",
                role: url.searchParams.get("role") || "",
                sort: url.searchParams.get("sort") || "",
              },
            );
      return json({
        ...result,
        cards: e.economy.wishlist.withCounts(result.cards),
      });
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
    if (path === "anime-checklist" && !post) {
      if (!session) fail("Sign in to view your anime checklist.", 401);
      this.bursts.take("read:" + session.player, 60, 5);
      return json(
        e.economy.anime.checklist(
          session.player,
          url.searchParams.get("series"),
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
    if (path === "pickem-tours" && !post)
      return json(
        e.pickemEvents.page(
          Number(url.searchParams.get("page") || 1),
          session?.player,
        ),
      );
    if (path === "pickem-tour" && !post)
      return json(
        e.pickemEvents.detail(
          Number(url.searchParams.get("id") ?? url.searchParams.get("key")),
          session?.player,
          url.searchParams.has("id"),
        ),
      );
    if (path === "pickems" && !post)
      return json(
        e.pickemPage(
          session?.player,
          Number(url.searchParams.get("page") || 1),
        ),
      );
    if (path === "notices" && !post) {
      if (!session) fail("Sign in to view notifications.", 401);
      const notices = e.economy.notices.pending(session.player);
      return json({
        notices,
        cards: e.catalogStore.cards(notices.map((n) => n.card).filter(Boolean)),
      });
    }
    if (path === "trades" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.trades.page(session?.player, {
          view: url.searchParams.get("view") || "browse",
          page: Number(url.searchParams.get("page") || 1),
          query: url.searchParams.get("q") || "",
          wishlistOnly: url.searchParams.get("wishlist") === "1",
          hideCompleted: url.searchParams.get("hide_completed") === "1",
        }),
      );
    }
    if (path === "market" && !post)
      return json(
        e.economy.market(
          url.searchParams.get("venue") || "shop",
          url.searchParams.get("kind") || "character",
          Number(url.searchParams.get("page") || 1),
          {
            sort: url.searchParams.get("sort") || "newest",
            wishlistOnly: url.searchParams.get("wishlist") === "1",
            query: url.searchParams.get("q") || "",
          },
          session?.player,
        ),
      );
    if (path === "quizzes" && !post)
      return json({ quizzes: e.quiz.list(session?.player) });
    if (path === "quiz-songs" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.quiz.songs(url.searchParams.get("quiz"), session?.player),
      );
    }
    if (path === "quiz-leaderboard" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.quiz.leaderboard(
          url.searchParams.get("quiz"),
          session?.player,
          Number(url.searchParams.get("page") || 1),
        ),
      );
    }
    if (path === "quiz-answers" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        url.searchParams.get("bank") === "1"
          ? e.quiz.answerBank(
              url.searchParams.get("quiz"),
              session?.player,
              Number(url.searchParams.get("page") || 1),
            )
          : e.quiz.suggestions(
              url.searchParams.get("quiz"),
              url.searchParams.get("q"),
              session?.player,
            ),
      );
    }
    if (path === "player-cards" && !post) {
      const result = e.economy.wishlist.page(
        url.searchParams.get("id"),
        url.searchParams.get("view"),
        Number(url.searchParams.get("page") || 1),
        {
          kind: url.searchParams.get("kind") || "both",
          query: url.searchParams.get("q") || "",
          rarity: url.searchParams.get("rarity") || "",
          role: url.searchParams.get("role") || "",
          sort: url.searchParams.get("sort") || "custom",
          wishlist: url.searchParams.get("wishlist") === "1",
          tradeable: url.searchParams.get("tradeable") === "1",
          viewer: session?.player,
        },
      );
      return json({
        ...result,
        cards: e.economy.wishlist.withCounts(result.cards),
      });
    }
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
      if (session)
        e.tx(() => {
          e.economy.horse.settleDue(session.player);
          e.economy.pachinko.settleDue(session.player);
          e.economy.specialPack.ensureGranted(session.player);
        });
      return json({
        ...e.state(session?.player),
        betaRegistration: false,
        openRegistration: true,
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
    if (path === "quiz-audio" && !post) {
      this.bursts.take("read:" + session.player, 60, 5);
      return json(
        e.quiz.audioManifest(url.searchParams.get("quiz"), session.player),
      );
    }
    if (path === "wishlist-order" && !post) {
      const wishlist = e.economy.wishlist.read(session.player);
      return json({ wishlist, cards: e.catalogStore.cards(wishlist) });
    }
    if (path === "collection-order" && !post) {
      const collection = e.economy.wishlist.readCollection(session.player);
      return json({
        collection,
        cards: e.catalogStore.cards(collection.map((r) => r.card)),
      });
    }
    if (path === "my-titles" && !post)
      return json(e.quiz.titleSettings(session.player));
    if (path === "alchemy" && !post)
      return json({ alchemyState: e.economy.alchemy.state(session.player) });
    if (path === "gambling-history" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.pachinko.history(
          session.player,
          url.searchParams.get("game") || "",
          Number(url.searchParams.get("page") || 1),
        ),
      );
    }
    if (path === "mahjong-history" && !post) {
      this.bursts.take("read:" + (session?.player || ip), 60, 5);
      return json(
        e.economy.mahjong.history(
          session.player,
          Number(url.searchParams.get("page") || 1),
        ),
      );
    }
    if (path === "special-pack-seen") {
      e.economy.specialPack.markSeen(session.player);
      return json({ ok: true });
    }
    if (!post) fail("Unknown endpoint.", 404);
    if (path === "fusion")
      fail(
        "Card Fusion has been replaced by Card Alchemy. Refresh the page to use refinements and XP.",
        410,
      );
    this.bursts.take("play:" + session.player);
    const result = e.mutate(
      session.player + ":" + path,
      request.headers.get("Idempotency-Key"),
      b,
      () => e.action(session.player, path, b),
    );
    await this.scheduleAlarm(
      this.maintainMarket(
        [
          "bid",
          "buyout",
          "list-card",
          "cancel-listing",
          "buy-listing",
          "shop-buy",
        ].includes(path),
      ),
    );
    return json(result);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (
        url.pathname === "/api/registration-policy" &&
        request.method === "GET"
      )
        return json(registrationPolicy);
      const size = Number(request.headers.get("Content-Length") || 0);
      if (
        size >
        (["/api/host/quiz-save", "/api/host/quiz-preview"].includes(
          url.pathname,
        )
          ? 5000000
          : 1000000)
      )
        return json({ error: "Request too large." }, 413);
      const forwarded = await registrationForwarding(request, env);
      if (forwarded instanceof Response) return forwarded;
      try {
        // Do not permit registrations through an older, still-updating actor
        // whose policy allowed code-free signup during the deployment window.
        if(url.pathname==="/api/register" && request.method==="POST") {
          const policyResponse=await durableRead(env.GAME,new Request(url.origin+"/api/registration-policy-actor"));
          if(!policyResponse.ok || !(await policyResponse.json()).hostIssuedSingleUse)
            return json({error:"Registration is updating. Please try again shortly."},503);
        }
        if (url.pathname === "/api/quiz-cover")
          return await cachedQuizCover(
            forwarded,
            () => durableRead(env.GAME, forwarded),
            typeof caches === "undefined" ? null : caches.default,
            ctx?.waitUntil?.bind(ctx),
          );
        return await durableRead(env.GAME, forwarded);
      } catch (err) {
        const limited =
          storageQuotaResponse(err) || storageUnavailableResponse(err);
        if (limited) return limited;
        console.error(
          JSON.stringify({ event: "durable_forward_failed", name: err.name }),
        );
        return json(
          {
            error:
              "The request could not be completed. Please try again shortly.",
          },
          500,
        );
      }
    }
    const route = url.pathname.slice(1).replace(/\/$/, "");
    if (["GET", "HEAD"].includes(request.method) && isPlayerRoute(route)) {
      const shell = await env.ASSETS.fetch(new Request(new URL("/", url), request));
      // Relative to the requested document, including when served behind /gacha/.
      const base = "../".repeat(url.pathname.split("/").length - 2) || "./";
      return new HTMLRewriter().on("head", {
        element(head) { head.prepend(`<base href="${base}">`, { html: true }); },
      }).transform(shell);
    }
    const response = await env.ASSETS.fetch(request),
      headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self' https:; media-src 'self' https: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
};
