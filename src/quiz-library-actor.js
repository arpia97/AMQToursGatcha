import { DurableObject } from "cloudflare:workers";
import { QuizLibraryCore } from "./quiz-library.js";
import { PlayLibrary } from './play-library.js';
import {SheetRefresh,currentSheet} from "./play-sheet.js";
export class QuizLibrary extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.selections = new Map();
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
    this.sheetSource=currentSheet(env);
    this.play = new PlayLibrary(this.core,undefined,version=>
      env.GAME.getByName('amqtours-economy-v1').publishedQuizSongs(version),this.sheetSource);
  }
  sheetManager(){return this.sheet??=new SheetRefresh(this.ctx,this.core.assets);}
  selectionProgress(id){
    const job=this.selections.get(id);
    if(!job)return null;
    const {done,total}=job.stage==='catalog'?(job.catalog||{}):job;
    return {stage:job.stage,done,total};
  }
  sheetStatus(){return this.sheetManager().status();}
  sheetSnapshot(version){return this.sheetManager().snapshot(version);}
  async startSheetRefresh(){
    this.core.set("sheet-actor",true);
    return this.sheetManager().start();
  }
  async schedule() {
    const next = this.core.nextAlarm();
    if (next !== null)
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    if(this.core.get("sheet-actor"))return this.sheetManager().step();
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
      if(request.method==='GET' && path==='/play-catalog')return Response.json(await this.play.catalog());
      if (request.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const raw = await request.text();
      if (raw.length > 1000000)
        return new Response("Request Too Large", { status: 413 });
      const body = JSON.parse(raw);
      if(path==='/play-ballot-catalog'){
        const catalog=await this.play.catalog();
        const fields=['anime','song','artist'].filter(field=>body.fields?.includes(field));
        return Response.json(Object.fromEntries(fields.map(field=>[field,catalog[field]])));
      }
      if(path==='/play-watched-count')
        return Response.json({eligible:await this.play.watchedAnimeCount(body.lists,body.ranked)});
      if(path==='/play-sample'){
        const job=body.matchId?{stage:'catalog'}:null;
        if(job)this.selections.set(body.matchId,job);
        try{return Response.json(await this.play.sample(body.mode,body.count,body.exclude,body.watched,body.excludeAnime,job));}
        finally{if(job&&this.selections.get(body.matchId)===job)this.selections.delete(body.matchId);}
      }
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
