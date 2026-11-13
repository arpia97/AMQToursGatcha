import { DurableObject } from "cloudflare:workers";
import { QuizLibraryCore } from "./quiz-library.js";
export class QuizLibrary extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    const all = (sql, ...args) => [...ctx.storage.sql.exec(sql, ...args)];
    this.core = new QuizLibraryCore(
      {
        all,
        one: (...args) => all(...args)[0],
        run: (...args) => {
          ctx.storage.sql.exec(...args);
        },
        tx: (fn) => ctx.storage.transactionSync(fn),
      },
      env.ASSETS,
    );
  }
  async schedule() {
    const next = this.core.nextAlarm();
    if (next !== null)
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    await this.ctx.storage.setAlarm(Date.now() + 95000);
    try {
      await this.core.step();
    } finally {
      await this.schedule();
    }
  }
  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/status")
        return Response.json(await this.core.status());
      if (request.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const raw = await request.text();
      if (raw.length > 1000000)
        return new Response("Request Too Large", { status: 413 });
      const body = JSON.parse(raw);
      if (path === "/lookup")
        return Response.json(await this.core.lookup(body));
      if (path === "/refresh") {
        const result = await this.core.action(
          body,
          request.headers.get("Idempotency-Key"),
        );
        await this.schedule();
        return Response.json(result);
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      return Response.json(
        {
          error: error.status
            ? error.message
            : "The Song Cache Is Temporarily Unavailable.",
        },
        { status: error.status || 503 },
      );
    }
  }
}
export async function quizLibraryRequest(env, path, body, key) {
  if (!env.QUIZ_LIBRARY) return null;
  const stub = env.QUIZ_LIBRARY.get(
      env.QUIZ_LIBRARY.idFromName("quiz-song-library-v1"),
    ),
    r = await stub.fetch(
      new Request(
        "https://quiz-library.internal" + path,
        body
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(key ? { "Idempotency-Key": key } : {}),
              },
              body: JSON.stringify(body),
            }
          : {},
      ),
    );
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(
      Error(data.error || "Song Cache Is Temporarily Unavailable."),
      { status: r.status },
    );
  return data;
}
