import { registerWithHostCode } from "./host-registered-account.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { Miniflare, Response: RuntimeResponse } = createRequire(
    require.resolve("wrangler/package.json"),
  )("miniflare");
test("Worker quiz endpoints protect imports and answers, match AMQ, hide answer keys and award once", async (t) => {
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      contents: `
        import worker, { Game as OriginalGame } from './src/worker.js';
        export {QuizLibrary} from './src/worker.js';
        import {QuizSession as OriginalQuizSession} from './src/worker.js';
        export class QuizSession extends OriginalQuizSession {
          move(hash,body,key,receivedAt){
            const result=super.move(hash,body,key,receivedAt);
            if(key==='fast-lock-0'&&!this.lostReply){
              this.lostReply=true;throw Error('Network connection lost.');
            }
            return result;
          }
          expireForTest() {
            const state=this.read(),end=Date.now()-2000;
            state.run.timing={index:state.run.index,startsAt:end-20000,endsAt:end};
            this.write(state);
            return end;
          }
        }
        export class Game extends OriginalGame {
          constructor(ctx,env) {
            super(ctx,env);
            this.probe = { sql: 0, market: 0, schedule: 0, starters: 0 };
            const db=this.engine.db, fund=this.engine.economy.fundStarters.bind(this.engine.economy);
            this.engine.db=(...args)=>{this.probe.sql++;return db(...args);};
            this.engine.economy.fundStarters=(...args)=>{this.probe.starters++;return fund(...args);};
          }
          maintainMarket(...args) { this.probe.market++; return super.maintainMarket(...args); }
          scheduleAlarm(...args) { this.probe.schedule++; return super.scheduleAlarm(...args); }
          async handle(request) {
            if(new URL(request.url).pathname==='/api/__fast-expire') {
              const {run}=await request.json();
              return Response.json({end:await this.env.QUIZ_SESSIONS.get(this.env.QUIZ_SESSIONS.idFromName('quiz:'+run)).expireForTest()});
            }
            if(new URL(request.url).pathname==='/api/__quiz-probe') {
              if(request.method==='POST') this.probe={sql:0,market:0,schedule:0,starters:0};
              return Response.json(this.probe);
            }
            if(new URL(request.url).pathname==='/api/__retirement-seed') {
              const e=this.engine,id='3817093a-993e-47c8-88be-2804df54ef56';
              e.tx(()=>{
                e.run("INSERT INTO quizzes(id,name,cover,title,published,source,updated) VALUES(?,'AKINO','','AKINO',1,'fixture',1)",id);
                e.wallet('1',1000,'Quiz: AKINO · 12/20',true);
                e.wallet('1',-(e.player('1').balance-50),'Local test spend');
              });
              return Response.json({seeded:true});
            }
            if(new URL(request.url).pathname==='/api/__quiz-deadline-probe') {
              const e=this.engine,run=e.quiz.run('1','test');
              const b=await request.json(),end=Date.now()+(b.expired?-2000:100);
              run.timing={index:run.index,startsAt:end-20000,endsAt:end};
              e.quiz.persist('1','test',run);
              return Response.json({endsAt:end});
            }
            if(new URL(request.url).pathname==='/api/quiz-answer' && request.headers.get('X-Test-Processing-Delay'))
              await new Promise(resolve=>setTimeout(resolve,1500));
            return super.handle(request);
          }
        }
        export default worker;
      `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
  });
  let audioLookups = 0,
    failAudioLookup = false;
  const mf = new Miniflare({
    workers: [
      {
        config: {
          name: "quiz-runtime-test",
          compatibilityDate: "2026-10-01",
          manifest: {
            mainModule: "worker.js",
            modules: {
              "worker.js": {
                type: "esm",
                contents: bundle.outputFiles[0].text,
              },
            },
          },
          exports: {
            QuizLibrary:{type:'durable-object',storage:'sqlite',state:'created'},
            QuizSession:{type:'durable-object',storage:'sqlite',state:'created'},
            Game: {
              type: "durable-object",
              storage: "sqlite",
              state: "created",
            },
          },
          env: {
            QUIZ_LIBRARY:{type:'durable-object',worker:'quiz-runtime-test',exportName:'QuizLibrary'},
            QUIZ_SESSIONS:{type:'durable-object',worker:'quiz-runtime-test',exportName:'QuizSession'},
            ASSETS:{type:'fetcher',handler:async request=>{
              if(new URL(request.url).pathname==='/quiz-library/master-answers.json')return RuntimeResponse.json({version:'test-master',records:[[1,'Export Title','Export Alias']],keys:{'f:sheet-example.mp3':0}});
              if(new URL(request.url).pathname==='/play/') return new RuntimeResponse(await readFile(new URL('../public/play/index.html',import.meta.url),'utf8'),{headers:{'Content-Type':'text/html'}});
              const manifest={schema:1,version:'runtime-seed',source:'Fixture',generatedAt:'2026-11-01T00:00:00Z',count:1,requested:1,missing:[],shards:[97],amq:{90001:[50001]}};
              const data=new URL(request.url).pathname.endsWith('manifest.json')?manifest:{50001:{annSongId:50001,amqSongId:90001,annId:1,title:'Cached Song',artist:'Artist',audio:'https://example.com/cached.mp3',titles:['Cached Alternative']}};
              return new RuntimeResponse(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
            }},
            GAME: {
              type: "durable-object",
              worker: "quiz-runtime-test",
              exportName: "Game",
            },
            HOST_TOKEN: {
              type: "json",
              value: "isolated-host-token-only-for-tests-12345678",
            },
          },
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: async (request) => {
              if (new URL(request.url).pathname.includes("broken.mp3"))
                return new RuntimeResponse(null, { status: 404 });
              if (new URL(request.url).pathname.endsWith(".mp3"))
                return new RuntimeResponse(null, {
                  headers: {
                    "Content-Type": "audio/mpeg",
                    "Content-Length": "1024",
                  },
                });
              if (
                new URL(request.url).pathname === "/api/ann_song_ids_request"
              ) {
                audioLookups++;
                if (failAudioLookup)
                  return new RuntimeResponse("Unavailable", { status: 503 });
                const body = await request.json();
                return new RuntimeResponse(
                  JSON.stringify(
                    body.ann_song_ids.map((id) => ({
                      annId: 1,
                      annSongId: id,
                      audio: "amq-" + id + ".mp3",
                    })),
                  ),
                  { headers: { "Content-Type": "application/json" } },
                );
              }
              return new RuntimeResponse(
                JSON.stringify({
                  masterListId: "test",
                  animeMap: {
                    1: {
                      mainNames: { EN: "Anime Test", JA: "Alternative Test" },
                      songLinks: { OP: [] },
                    },
                  },
                }),
                { headers: { "Content-Type": "application/json" } },
              );
            },
          },
        },
      },
    ],
  });
  t.after(() => mf.dispose());
  for(const route of ['/play/','/play/1v1-ranked','/play/ngmc-ranked','/play/2v2-arena','/play/song-artist','/play/speed-showdown','/play/quiz']){
    const response=await mf.dispatchFetch('https://amqtours.app'+route);
    assert.equal(response.status,200);
    const html=await response.text();assert.match(html,/<base href="\/gacha\/">/);assert.match(html,/play\/app.js/);
  }
  const localPlay=await mf.dispatchFetch('http://game/play/quiz');assert.match(await localPlay.text(),/<base href="\/">/);
  assert.equal((await mf.dispatchFetch('http://game/play/unknown')).status,404);
  assert.equal((await mf.dispatchFetch('http://game/play/index.html',{redirect:'manual'})).status,308);
  const legacyQuiz=await mf.dispatchFetch('http://game/quiz?quiz=op-quiz',{redirect:'manual'});
  assert.equal(legacyQuiz.status,308);
  assert.equal(legacyQuiz.headers.get('location'),'http://game/play/quiz?quiz=op-quiz');
  const guestPlay=await mf.dispatchFetch('http://game/api/play-state');assert.equal((await guestPlay.json()).me,null);
  const post = (path, body, headers = {}) =>
      mf.dispatchFetch("http://game/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    host = {
      Authorization: "Bearer isolated-host-token-only-for-tests-12345678",
    };

  assert.equal((await mf.dispatchFetch('http://game/api/host/quiz-master')).status,401);
  assert.equal((await post('host/quiz-master-refresh',{action:'start'})).status,401);
  const sourceStatus=await mf.dispatchFetch('http://game/api/host/quiz-master',{headers:host});assert.equal(sourceStatus.status,200);assert.equal((await sourceStatus.json()).current.songs,1);
  let controlled=await post('host/quiz-master-refresh',{action:'start'},host);assert.equal(controlled.status,200);assert.equal((await controlled.json()).job.status,'running');
  controlled=await post('host/quiz-master-refresh',{action:'pause'},host);assert.equal(controlled.status,200);assert.equal((await controlled.json()).job.status,'paused');
  let response = await post(
    "host/players",
    { players: [{ id: "1", name: "Local User" }] },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  response = await registerWithHostCode(post, host, {
    player: "1",
    password: "local-only-password",
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("Set-Cookie").split(";")[0];
  const auth = { Cookie: cookie };
  await mf.dispatchFetch('http://game/api/__quiz-probe',{method:'POST'});
  const sharedPlay=await mf.dispatchFetch('http://game/api/play-state',{headers:auth});
  assert.equal(sharedPlay.status,200);
  const playAccount=await sharedPlay.json();assert.equal(playAccount.me.id,'1');assert.equal(playAccount.me.password,undefined);assert.equal(playAccount.me.invite,undefined);assert.equal(playAccount.avatar,null);assert.ok(Array.isArray(playAccount.titles));assert.equal(playAccount.inventory,undefined);
  const playProbe=await (await mf.dispatchFetch('http://game/api/__quiz-probe')).json();assert.equal(playProbe.market,0);assert.equal(playProbe.schedule,0);assert.equal(playProbe.starters,0);
  assert.equal((await mf.dispatchFetch('http://game/api/notices?auctions=1')).status,401);
  const liveNotice=await mf.dispatchFetch('http://game/api/notices?auctions=1',{headers:auth});
  assert.equal(liveNotice.status,200);
  const liveAuctions=(await liveNotice.json()).auctionState;
  assert.equal(liveAuctions.player,'1');assert.ok(Array.isArray(liveAuctions.lots));
  assert.equal(typeof liveAuctions.balance,'number');
  assert.equal((await mf.dispatchFetch('http://game/api/notices?auctions=1.5',{headers:auth})).status,400);
  const input = Array.from({ length: 20 }, (_, i) => ({
    annId: 1,
    audio: "fixture-song-" + i + ".mp3",
    songName: "Song " + i,
  }));
  response = await post("host/quiz-save", {
    name: "Test",
    input,
    published: true,
  });
  assert.equal(response.status, 401);
  response = await post("quiz-answer", {
    quiz: "test",
    run: "unknown",
    index: 0,
  });
  assert.equal(response.status, 401);
  response = await post("host/quiz-preview", { input });
  assert.equal(response.status, 401);
  response = await post("host/quiz-preview", { input }, auth);
  assert.equal(response.status, 401);
  response = await post(
    "host/quiz-preview",
    { input: [...input, input[0], { annId: 1, HQ: "video.webm" }] },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const review = await response.json();
  assert.equal(review.songs.length, 20);
  assert.equal(review.songs[0].title, "Song 0");
  assert.equal(review.songs[0].answers[0], "Anime Test");
  assert.match(review.songs[0].audio, /fixture-song-0.mp3$/);
  response = await post("host/quiz-audio-check", {
    songs: review.songs.slice(0, 1),
  });
  assert.equal(response.status, 401);
  response = await post(
    "host/quiz-save",
    { id: "unchecked", name: "Unchecked", input, published: true },
    host,
  );
  assert.equal(response.status, 409);
  for (let n = 0; n < review.songs.length; n += 8) {
    response = await post(
      "host/quiz-audio-check",
      { songs: review.songs.slice(n, n + 8) },
      host,
    );
    assert.equal(response.status, 200);
    assert.ok((await response.json()).checks.every((c) => c.working));
  }
  assert.equal(review.rejected.length, 1);
  response = await mf.dispatchFetch("http://game/api/host/quizzes", {
    headers: host,
  });
  assert.equal((await response.json()).quizzes.length, 0);
  response = await post(
    "host/quiz-preview",
    { input: [{ annId: 1, HQ: "video.webm" }] },
    host,
  );
  assert.equal((await response.json()).songs.length, 0);
  response = await post("host/quiz-preview", {}, host);
  assert.equal(response.status, 400);
  const primaryPreview=await post("host/quiz-preview",{input:[
    {songLinks:{primary:'https://eudist.animemusicquiz.com/sheet-example.mp3'},songInfo:{songName:'Sheet Song',artist:'Artist',animeNames:{romaji:'Stale Title'}}},
    {audio:'https://eudist.animemusicquiz.com/sheet-example.mp3',annSongId:50001},
  ]},host);
  assert.equal(primaryPreview.status,200,await primaryPreview.clone().text());
  const primarySongs=(await primaryPreview.json()).songs;
  assert.equal(primarySongs.length,1);
  assert.deepEqual(primarySongs[0].answers,['Export Title','Export Alias']);
  assert.equal(primarySongs[0].answerSource,'amq-master-sheet');
  response = await post(
    "host/quiz-save",
    {
      id: "test",
      name: "Test",
      input,
      published: true,
      title: "Perfect",
      cover:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 20);
  const publishedPreview=await post('host/quiz-preview',{input:[{
    audio:input[0].audio,annSongId:50001,songInfo:{animeNames:{romaji:'Conflicting upload'}}
  }]},host);
  assert.equal(publishedPreview.status,200,await publishedPreview.clone().text());
  const reused=(await publishedPreview.json()).songs[0];
  assert.equal(reused.answerSource,'published-quiz');
  assert.ok(reused.answers.includes('Anime Test'));
  assert.ok(!reused.answers.includes('Cached Alternative')&&!reused.answers.includes('Conflicting upload'));
  const tile = (
    await (await mf.dispatchFetch("http://game/api/quizzes")).json()
  ).quizzes.find((q) => q.id === "test");
  assert.equal(tile.favorited, 0);
  assert.ok(!Object.hasOwn(tile, "uploadedBy") && !Object.hasOwn(tile, "updatedBy"));
  assert.equal((await post("quiz-favorite",{quiz:"test",favorited:true})).status,401);
  await post("__quiz-probe",{});
  const favoriteKey=crypto.randomUUID();
  for(let i=0;i<2;i++){
    const favorite=await post("quiz-favorite",{quiz:"test",favorited:true},{...auth,"Idempotency-Key":favoriteKey});
    assert.equal(favorite.status,200,await favorite.clone().text());
    assert.deepEqual(await favorite.json(),{quiz:"test",favorited:true});
  }
  const favoriteProbe=await (await mf.dispatchFetch("http://game/api/__quiz-probe")).json();
  assert.equal(favoriteProbe.market,0);assert.equal(favoriteProbe.schedule,0);assert.equal(favoriteProbe.starters,0);
  const savedFavorites=await (await mf.dispatchFetch("http://game/api/quizzes",{headers:auth})).json();
  assert.equal(savedFavorites.quizzes.find(q=>q.id==="test").favorited,1);
  assert.equal(savedFavorites.quizzes.find(q=>q.id==="test").played,0);
  assert.equal((await post("quiz-favorite",{quiz:"test",favorited:false},auth)).status,200);
  assert.equal((await post('friend-set',{player:'1',added:true})).status,401);
  await post('host/players',{players:[{id:'2',name:'Local Friend'}]},host);
  await post('__quiz-probe',{});
  const friendKey=crypto.randomUUID();
  for(let i=0;i<2;i++)assert.equal((await post('friend-set',{player:'2',added:true},{...auth,'Idempotency-Key':friendKey})).status,200);
  const friendList=await mf.dispatchFetch('http://game/api/friends',{headers:auth});
  assert.equal(friendList.status,200);assert.deepEqual((await friendList.json()).rows.map(p=>p.id),['2']);
  const socialProbe=await (await mf.dispatchFetch('http://game/api/__quiz-probe')).json();
  assert.equal(socialProbe.market,0);assert.equal(socialProbe.schedule,0);assert.equal(socialProbe.starters,0);
  for(const url of ['friends','rankings?friends=1','quiz-leaderboard?quiz=test&friends=1'])assert.equal((await mf.dispatchFetch('http://game/api/'+url)).status,401);
  assert.match(tile.cover, /^api\/quiz-cover/);
  const imageResponse = await mf.dispatchFetch("http://game/" + tile.cover);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("Content-Type"), "image/png");
  assert.match(imageResponse.headers.get("Cache-Control"), /^public/);
  assert.ok((await imageResponse.arrayBuffer()).byteLength > 0);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test");
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test", {
    headers: auth,
  });
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test", {
    headers: host,
  });
  let editing = await response.json();
  assert.equal(editing.uploadedBy, "Host API");
  assert.equal(editing.updatedBy, "Host API");
  assert.equal(editing.uploadedAt, editing.updated);
  response = await post(
    "host/quiz-audio-check",
    {
      songs: [
        { audio: "https://naedist.animemusicquiz.com/fixture-song-20.mp3" },
      ],
    },
    host,
  );
  assert.equal(response.status, 200);
  assert.equal(editing.songs.length, 20);
  response = await post(
    "host/quiz-save",
    {
      id: "test",
      name: "Test",
      published: true,
      title: "Perfect",
      expectedUpdated: editing.updated,
      songMode: "append",
      input: [
        { annId: 1, audio: "fixture-song-20.mp3", songName: "Added Song" },
      ],
    },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 21);
  response = await mf.dispatchFetch("http://game/api/host/quiz-songs?id=test", {
    headers: host,
  });
  editing = await response.json();
  response = await post(
    "host/quiz-save",
    {
      id: "test",
      name: "Test",
      published: true,
      title: "Perfect",
      expectedUpdated: editing.updated,
      removeSongIds: [0],
    },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 20);
  response = await post(
    "host/quiz-save",
    { id: "draft", name: "Draft", input: input.slice(0, 1), published: false },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 1);
  response = await post(
    "host/quiz-save",
    {
      id: "invalid",
      name: "Invalid",
      input: [{ annId: 1, HQ: "video.webm" }],
      published: false,
    },
    host,
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /No playable MP3 songs/);
  const amqBody = {
    id: "amq",
    name: "AMQ Export",
    published: false,
    input: {
      roomName: "Local",
      songs: [501, 502].map((id) => ({
        songInfo: {
          annId: 1,
          annSongId: id,
          songName: "AMQ " + id,
          artist: "Artist",
        },
        answer: "Ignore player guess",
      })),
    },
  };
  response = await post("host/quiz-preview", { input: amqBody.input }, host);
  assert.equal(response.status, 200, await response.clone().text());
  const amqReview = await response.json();
  assert.equal(amqReview.songs.length, 2);
  response = await post(
    "host/quiz-audio-check",
    { songs: amqReview.songs },
    host,
  );
  assert.equal(response.status, 200);
  assert.equal(audioLookups, 1);
  const importKey = "amq-test-import";
  response = await post("host/quiz-save", amqBody, {
    ...host,
    "Idempotency-Key": importKey,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).songs, 2);
  assert.equal(audioLookups, 1);
  response = await post("host/quiz-save", amqBody, {
    ...host,
    "Idempotency-Key": importKey,
  });
  assert.equal(response.status, 200);
  assert.equal(audioLookups, 1);
  response = await post("host/quiz-save", amqBody, host);
  assert.equal(response.status, 200);
  assert.equal(audioLookups, 1);
  response = await post(
    "host/quiz-audio-check",
    {
      songs: [{ audio: "https://naedist.animemusicquiz.com/replacement.mp3" }],
    },
    host,
  );
  assert.equal(response.status, 200);
  response = await post(
    "host/quiz-save",
    {
      ...amqBody,
      input: {
        songs: [
          {
            songInfo: {
              annId: 1,
              annSongId: 501,
              songName: "Replacement",
              audio: "replacement.mp3",
            },
          },
        ],
      },
    },
    host,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).songs, 1);
  failAudioLookup = true;
  response = await post(
    "host/quiz-save",
    {
      ...amqBody,
      input: {
        songs: [
          { songInfo: { annId: 1, annSongId: 503, songName: "Unavailable" } },
        ],
      },
    },
    host,
  );
  assert.equal(response.status, 502, await response.clone().text());
  assert.match((await response.json()).error, /No pool was changed/);
  response = await mf.dispatchFetch("http://game/api/host/quizzes", {
    headers: host,
  });
  assert.equal(
    (await response.json()).quizzes.find((q) => q.id === "amq").songs,
    1,
  );
  failAudioLookup = false;
  const badAudio = "https://example.com/broken.mp3",
    replacement = "https://example.com/repaired.mp3";
  response = await post(
    "host/quiz-audio-check",
    { songs: [{ audio: badAudio }] },
    host,
  );
  assert.equal((await response.json()).checks[0].working, false);
  const brokenBody = {
    id: "repaired-draft",
    name: "Repaired Draft",
    published: false,
    input: [{ annId: 1, audio: badAudio, songName: "Repaired" }],
  };
  response = await post("host/quiz-save", brokenBody, host);
  assert.equal(response.status, 409);
  response = await post(
    "host/quiz-audio-check",
    { songs: [{ audio: replacement }] },
    host,
  );
  assert.equal((await response.json()).checks[0].working, true);
  response = await post(
    "host/quiz-save",
    { ...brokenBody, audioOverrides: { [badAudio]: replacement } },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  response = await mf.dispatchFetch(
    "http://game/api/host/quiz-songs?id=repaired-draft",
    { headers: host },
  );
  assert.equal((await response.json()).songs[0].audio, replacement);
  response = await mf.dispatchFetch(
    "http://game/api/host/enhancement-migration?audit=1",
    { headers: host },
  );
  assert.equal(response.status, 200);
  assert.ok(Array.isArray((await response.json()).rows));
  response = await mf.dispatchFetch(
    "http://game/api/host/enhancement-migration?audit=1",
    { headers: auth },
  );
  assert.equal(response.status, 401);
  const visible = await mf.dispatchFetch("http://game/api/quizzes");
  assert.deepEqual(
    (await visible.json()).quizzes.map((q) => q.id),
    ["test"],
  );
  response = await mf.dispatchFetch("http://game/api/quiz-run?quiz=test");
  assert.equal(response.status, 401);
  response = await post("quiz-start", { quiz: "test" }, auth);
  assert.equal(response.status, 200);
  let run = (await response.json()).run;
  const oldRunId = run.id;
  response = await post(
    "quiz-restart",
    { quiz: "test", run: run.id, index: 0 },
    auth,
  );
  assert.equal(response.status, 200);
  run = (await response.json()).run;
  assert.notEqual(run.id, oldRunId);
  assert.equal(run.index, 0);
  assert.ok(
    run.audio.startsWith("https://naedist.animemusicquiz.com/fixture-song-"),
  );
  assert.equal(run.answer, undefined);
  assert.equal(run.submittedAnswer, undefined);
  response = await mf.dispatchFetch(
    "http://game/api/quiz-answers?quiz=test&q=Alt",
  );
  assert.deepEqual((await response.json()).answers, ["Alternative Test"]);
  response = await post("quiz-stop", { quiz: "test", run: run.id, index: 0 });
  assert.equal(response.status, 401);
  response = await post(
    "quiz-stop",
    { quiz: "test", run: oldRunId, index: 0 },
    auth,
  );
  assert.equal(response.status, 409);
  const stoppedRunId = run.id;
  response = await post(
    "quiz-stop",
    { quiz: "test", run: run.id, index: 0 },
    auth,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).run, null);
  response = await mf.dispatchFetch("http://game/api/quiz-run?quiz=test", {
    headers: auth,
  });
  assert.equal((await response.json()).run, null);
  response = await post("quiz-start", { quiz: "test" }, auth);
  assert.equal(response.status, 200);
  run = (await response.json()).run;
  assert.notEqual(run.id, stoppedRunId);
  assert.equal(run.index, 0);
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    response = await post(
      "quiz-ready",
      { quiz: "test", run: run.id, index: i },
      auth,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const ready = (await response.json()).run;
    if (ready.startsAt > Date.now())
      await new Promise((resolve) =>
        setTimeout(resolve, ready.startsAt - Date.now() + 10),
      );
    await mf.dispatchFetch("http://game/api/__quiz-probe", { method: "POST" });
    const answerKey = crypto.randomUUID();
    const answerBody = {
      quiz: "test",
      run: run.id,
      index: i,
      answer: "Alternative Test",
      score: 0,
    };
    response = await post("quiz-answer", answerBody, {
      ...auth,
      "Idempotency-Key": answerKey,
    });
    assert.equal(response.status, 200, await response.clone().text());
    const answered = (await response.json()).run;
    assert.equal(answered.submittedAnswer, "Alternative Test");
    assert.equal(answered.answer, "Anime Test");
    assert.equal(answered.correct, true);
    if (i === 0) {
      const probe = await (
        await mf.dispatchFetch("http://game/api/__quiz-probe")
      ).json();
      assert.equal(probe.market, 0);
      assert.equal(probe.schedule, 0);
      assert.equal(probe.starters, 0);
      // One indexed player read enforces the persistent account lock.
      assert.ok(probe.sql <= 7, JSON.stringify(probe));
      t.diagnostic("Quiz answer hot path: " + JSON.stringify(probe));
      const retry = await post("quiz-answer", answerBody, {
        ...auth,
        "Idempotency-Key": answerKey,
      });
      assert.deepEqual((await retry.json()).run, answered);
      const lostResponse = await mf.dispatchFetch(
        "http://game/api/quiz-run?quiz=test",
        { headers: auth },
      );
      const recovered = (await lostResponse.json()).run;
      assert.ok(recovered.elapsedMs >= answered.elapsedMs);
      const { elapsedMs: recoveredMs, progressDetails, ...savedAnswer } = recovered;
      assert.equal(progressDetails.length, 1);
      assert.equal(progressDetails[0].submittedAnswer, answered.submittedAnswer);
      assert.equal(progressDetails[0].title, answered.songTitle);
      assert.ok(!("audio" in progressDetails[0]) && !("answers" in progressDetails[0]));
      assert.equal(answered.progressDetails, undefined);
      const { elapsedMs: answeredMs, ...originalAnswer } = answered;
      assert.deepEqual(savedAnswer, originalAnswer);
    }
    const b = { quiz: "test", run: run.id, index: i },
      key = crypto.randomUUID(),
      headers = { ...auth, "Idempotency-Key": key };
    response = await post("quiz-next", b, headers);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    run = result.run;
    const retry = await post("quiz-next", b, headers);
    const { now: retryNow, ...retryResult } = await retry.json();
    const { now: originalNow, ...originalResult } = result;
    assert.deepEqual(retryResult, originalResult);
    assert.ok(retryNow >= originalNow);
  }
  assert.equal(run.score, 20);
  assert.equal(run.reward.total, 2900);
  assert.deepEqual(run.results, Array(20).fill(true));
  assert.equal(run.history.length, 20);
  assert.ok(run.history.every((s) => s.correct && Number.isSafeInteger(s.elapsedMs)));
  assert.ok(run.history.every((s) => !("audio" in s) && !("answers" in s)));
  const quizStatsResponse = await mf.dispatchFetch("http://game/api/quizzes", { headers: auth });
  const quizStats = (await quizStatsResponse.json()).quizzes.find((q) => q.id === "test");
  assert.ok(quizStats.completedRuns >= 1);
  assert.equal(quizStats.scoreCount, quizStats.completedRuns);
  assert.equal(quizStats.averageScore, 20);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  const profile = await response.json();
  assert.equal(profile.titles[0].title, "Perfect");
  assert.equal(profile.balance, 7900);
  response = await mf.dispatchFetch("http://game/api/my-titles");
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch("http://game/api/my-titles", {
    headers: auth,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).titles[0].equipped, true);
  response = await post("equip-titles", { quizzes: ["not-earned"] }, auth);
  assert.equal(response.status, 400);
  response = await post("equip-titles", { quizzes: [] }, auth);
  assert.equal(response.status, 200);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  const hidden = await response.json();
  assert.equal(hidden.titles.length, 0);
  assert.equal(hidden.balance, 7900);
  response = await post("equip-titles", { quizzes: ["test"] }, auth);
  assert.equal(response.status, 200);
  response = await post(
    "equip-titles",
    {
      quizzes: ["test"],
      awards: [],
      order: ["quiz:test"],
      expectedOrder: ["quiz:test"],
    },
    auth,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).titles[0].quiz, "test");
  response = await post(
    "equip-titles",
    {
      quizzes: ["test"],
      awards: [],
      order: ["quiz:test"],
      expectedOrder: [],
    },
    auth,
  );
  assert.equal(response.status, 409);
  response = await post(
    "host/quiz-save",
    { id: "test", name: "Test", title: "Renamed Title", published: true },
    host,
  );
  assert.equal(response.status, 200);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  assert.equal((await response.json()).titles[0].title, "Renamed Title");
  response = await mf.dispatchFetch(
    "http://game/api/quiz-leaderboard?quiz=test",
  );
  const board = await response.json();
  assert.equal(board.rows[0].id, "1");
  assert.equal(board.rows[0].best, 20);
  assert(board.rows[0].bestAt > 0);
  const quizRankings = await (await mf.dispatchFetch("http://game/api/quiz-play-rankings")).json();
  assert.equal(quizRankings.rows[0].id, "1");
  const quizFriendsPath = "http://game/api/quiz-play-rankings?friends=1";
  assert.equal((await mf.dispatchFetch(quizFriendsPath)).status,401);
  const quizFriends = await mf.dispatchFetch(quizFriendsPath,{headers:auth});
  assert.equal(quizFriends.status,200,await quizFriends.clone().text());
  assert.deepEqual(await quizFriends.json(),{rows:[quizRankings.rows[0]],own:quizRankings.rows[0],more:false,friendsOnly:true});
  response = await post("host/quiz-scores-reset", {
    quiz: "test",
    confirmation: "RESET QUIZ SCORES AND TITLES",
  });
  assert.equal(response.status, 401);
  response = await post(
    "host/quiz-scores-reset",
    { quiz: "test", confirmation: "RESET QUIZ SCORES AND TITLES" },
    host,
  );
  assert.equal(response.status, 200);
  response = await mf.dispatchFetch(
    "http://game/api/quiz-leaderboard?quiz=test",
  );
  assert.equal((await response.json()).total, 0);
  response = await mf.dispatchFetch("http://game/api/player?id=1");
  const resetProfile = await response.json();
  assert.equal(resetProfile.titles.length, 0);
  assert.equal(resetProfile.balance, 7900);
  await post("__retirement-seed",{});
  assert.equal((await mf.dispatchFetch("http://game/api/host/quiz-retirement-preview")).status,401);
  response=await post("host/permissions",{player:"1",enabled:true},host);
  assert.equal(response.status,200);
  for(const endpoint of ["quiz-retirement-preview","quiz-retirement-receipt"])
    assert.equal((await mf.dispatchFetch("http://game/api/host/"+endpoint,{headers:auth})).status,403);
  response=await mf.dispatchFetch("http://game/api/host/quiz-retirement-preview",{headers:host});
  assert.equal(response.status,200);
  const retirement=await response.json();
  const removalBody={confirmation:"REMOVE AKINO AND RECLAIM ALL REWARDS",expected:retirement.expected};
  const removalHeaders={...host,"Idempotency-Key":"akino-removal-2026-11-15-v1"};
  assert.equal((await post("host/quiz-retirement",removalBody,auth)).status,403);
  response=await post("host/quiz-retirement",removalBody,removalHeaders);
  assert.equal(response.status,200,await response.clone().text());
  const removed=await response.json();
  assert.equal(removed.credits,1000);
  assert.equal(removed.players[0].balanceAfter,-950);
  assert.equal(removed.signedWalletMigration,true);
  assert.ok(removed.bookmark);
  response=await post("host/quiz-retirement",removalBody,removalHeaders);
  assert.deepEqual(await response.json(),removed);
  response=await mf.dispatchFetch("http://game/api/host/quiz-retirement-receipt",{headers:host});
  assert.deepEqual((await response.json()).result,removed);
  response=await mf.dispatchFetch("http://game/api/player?id=1");
  assert.equal((await response.json()).balance,-950);

  response=await post("quiz-start",{quiz:"test"},auth);
  let timedRun=(await response.json()).run;
  await post("__quiz-deadline-probe",{});
  const queuedBody = {quiz:"test",run:timedRun.id,index:0,answer:"Anime Test"};
  const queuedKey = "queued-answer-retry";
  response=await post("quiz-answer",queuedBody,{...auth,"X-Test-Processing-Delay":"1","Idempotency-Key":queuedKey});
  assert.equal(response.status,200,await response.clone().text());
  const firstQueued = await response.json();
  let timedAnswer=firstQueued.run;
  await new Promise(resolve => setTimeout(resolve, 20));
  response = await post("quiz-answer", queuedBody, {...auth, "Idempotency-Key":queuedKey});
  const replayed = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(replayed.run, firstQueued.run);
  assert.ok(replayed.now > firstQueued.now, "a cached result must carry a fresh server clock");
  assert.equal(timedAnswer.correct,true,"database delay must not expire an on-time answer");
  assert.equal(timedAnswer.timedOut,false);
  response=await post("quiz-restart",{quiz:"test",run:timedRun.id,index:0},auth);
  timedRun=(await response.json()).run;
  response=await post("__quiz-deadline-probe",{expired:true});
  const expired=(await response.json()).endsAt;
  response=await post("quiz-answer",{quiz:"test",run:timedRun.id,index:0,answer:"Anime Test",now:expired-1,quizAnswerReceivedAt:expired-1},{...auth,"X-AMQ-Answer-Received-At":String(expired-1)});
  assert.equal(response.status,200);
  timedAnswer=(await response.json()).run;
  assert.equal(timedAnswer.correct,false,"client body/header timestamps cannot backdate a late answer");
  assert.equal(timedAnswer.timedOut,true);

  // Normal playback can use the same isolated session without downloading the pool.
  // All 20 moves below must bypass Game; Competitive setup/restart is covered after settlement.
  response = await post("quiz-restart", {quiz:"test",run:timedRun.id,index:0,fastSession:true}, auth);
  assert.equal(response.status,200,await response.clone().text());
  let fast = (await response.json()).run;
  assert.equal(fast.transport,"session");
  assert.equal(fast.startedAt,null,"loading must not count toward completion time");
  const endpoint = "quiz-session?run="+fast.id;
  const fastAuth = {...auth, "X-Quiz-Session":fast.sessionTicket};
  assert.equal((await post(endpoint,{run:fast.id,index:0,action:"quiz-ready"})).status,401);
  assert.equal((await post(endpoint,{run:fast.id,index:0,action:"quiz-ready"},{...auth,Origin:"https://other.example"})).status,403);
  assert.equal((await post(endpoint,{run:fast.id,index:0,action:"quiz-ready"},{Cookie:"amq_session="+"b".repeat(48)})).status,401);
  assert.equal((await post(endpoint,{run:fast.id,index:0,action:"quiz-ready"},{...auth,"X-Quiz-Session":"invalid"})).status,401);
  const getFast=async()=> (await mf.dispatchFetch("http://game/api/"+endpoint,{headers:fastAuth})).json();
  const fastMove=async(action,extra={},key=crypto.randomUUID())=>{
    const res=await post(endpoint,{run:fast.id,index:fast.index,action,...extra},{...fastAuth,"Idempotency-Key":key});
    assert.equal(res.status,200,await res.clone().text());
    fast=(await res.json()).run;
    return fast;
  };
  await fastMove("quiz-ready");
  const startedAt=fast.startsAt;
  assert.equal(fast.startedAt,startedAt);
  assert.equal(fast.endsAt-fast.startsAt,20000);
  assert.equal(fast.answer,undefined);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,fast.startsAt-Date.now()+5)));
  await post("__quiz-probe",{});
  for(let i=0;i<20;i++){
    assert.equal(fast.index,i);
    assert.deepEqual(fast.results, Array(i).fill(true));
    assert.equal(fast.answer,undefined,"future/current keys are absent until the lock is durable");
    const body={run:fast.id,index:i,action:"quiz-answer",answer:"Anime Test"};
    const key="fast-lock-"+i;
    await fastMove("quiz-answer",{answer:"Anime Test"},key);
    assert.equal(fast.correct,true);
    assert.deepEqual(fast.results, Array(i + 1).fill(true));
    assert.equal(fast.answer,"Anime Test");
    response=await post(endpoint,body,{...fastAuth,"Idempotency-Key":key});
    assert.equal(response.status,200);
    assert.equal((await response.json()).run.score,i+1);
    assert.equal((await post(endpoint,{...body,answer:"Changed"},{...fastAuth,"Idempotency-Key":key})).status,409);
    assert.equal((await post(endpoint,{...body,answer:"Changed"},fastAuth)).status,409);
    if(i<19) await fastMove("quiz-next",{ready:true});
    if(i===0){
      const resumed=(await getFast()).run;
      assert.equal(resumed.index,1);
      assert.equal(resumed.answer,undefined);
      assert.equal(resumed.progressDetails.length,1);
      assert.equal(resumed.progressDetails[0].index,0);
      assert.equal(resumed.progressDetails[0].submittedAnswer,"Anime Test");
      assert.ok(!("audio" in resumed.progressDetails[0]) && !("answers" in resumed.progressDetails[0]));
      assert.equal(fast.progressDetails,undefined);
    }
  }
  const probeFast=await (await mf.dispatchFetch("http://game/api/__quiz-probe")).json();
  assert.deepEqual(probeFast,{sql:0,market:0,schedule:0,starters:0},"no shared-engine calls during all 20 questions");
  assert.equal((await getFast()).run.index,19);
  // Reopening resumes the isolated actor rather than its initial economy snapshot.
  response=await mf.dispatchFetch("http://game/api/quiz-run?quiz=test",{headers:auth});
  assert.equal((await response.json()).run.score,20);
  const settleBody={quiz:"test",run:fast.id,index:19,fastSession:true,answer:"forged",score:0,answers:[]};
  const settleHeaders={...auth,"Idempotency-Key":"fast-final-settlement"};
  response=await post("quiz-next",settleBody,settleHeaders);
  assert.equal(response.status,200,await response.clone().text());
  const settled=await response.json();
  assert.equal(settled.run.score,20,"settlement trusts only the actor snapshot");
  assert.deepEqual(settled.run.results, Array(20).fill(true));
  assert.equal(settled.run.startedAt,startedAt);
  assert.ok(settled.run.durationMs>=0);
  const balance=settled.me.balance;
  response=await post("quiz-next",settleBody,settleHeaders);
  assert.equal((await response.json()).me.balance,balance,"reward settlement is retry-safe");
  // Stop/restart invalidate old actors, and their receipts remain retryable.
  response=await post("quiz-start",{quiz:"test",competitive:true},auth);
  fast=(await response.json()).run;
  const oldEndpoint="quiz-session?run="+fast.id;
  const restartBody={quiz:"test",run:fast.id,index:0,competitive:true,fastSession:true};
  const restartHeaders={...auth,"Idempotency-Key":"fast-restart-repeat"};
  response=await post("quiz-restart",restartBody,restartHeaders);
  assert.equal(response.status,200,await response.clone().text());
  const restarted=(await response.json()).run;
  response=await post("quiz-restart",restartBody,restartHeaders);
  assert.equal((await response.json()).run.id,restarted.id);
  assert.equal((await mf.dispatchFetch("http://game/api/"+oldEndpoint,{headers:auth})).status,401);
  const stopBody={quiz:"test",run:restarted.id,index:0,fastSession:true};
  const stopHeaders={...auth,"Idempotency-Key":"fast-stop-repeat"};
  response=await post("quiz-stop",stopBody,stopHeaders);
  assert.equal(response.status,200,await response.clone().text());
  response=await post("quiz-stop",stopBody,stopHeaders);
  assert.equal((await response.json()).run,null);

  response=await post("quiz-start",{quiz:"test",competitive:true},auth);
  fast=(await response.json()).run;
  const lateEndpoint="quiz-session?run="+fast.id;
  response=await post("__fast-expire",{run:fast.id});
  const fastExpired=(await response.json()).end;
  response=await post(lateEndpoint,{action:"quiz-answer",run:fast.id,index:0,answer:"Anime Test",now:fastExpired-1,quizAnswerReceivedAt:fastExpired-1},
    {...auth,"X-Quiz-Session":fast.sessionTicket,"X-AMQ-Answer-Received-At":String(fastExpired-1)});
  assert.equal(response.status,200);
  const late=(await response.json()).run;
  assert.equal(late.timedOut,true,"the isolated path also ignores forged arrival timestamps");
  assert.equal(late.correct,false);
  assert.equal((await post("quiz-answer",{quiz:"test",run:fast.id,index:0,answer:"Anime Test"},auth)).status,409,
    "legacy endpoints cannot bypass a competitive session");
  // Revoking the login also revokes direct access to the actor.
  assert.equal((await post("logout",{},auth)).status,200);
  assert.equal((await mf.dispatchFetch("http://game/api/"+lateEndpoint,{headers:{...auth,"X-Quiz-Session":fast.sessionTicket}})).status,401);
  assert.equal((await post("quiz-next",{quiz:"test",run:fast.id,index:19,fastSession:true},auth)).status,401);

  assert.equal(
    (await post("host/quiz-delete", { quiz: "test", confirmation: "DELETE QUIZ" })).status,
    401,
  );
  response = await post(
    "host/quiz-delete",
    { quiz: "test", confirmation: "DELETE QUIZ" },
    host,
  );
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /deleted/);
  response = await mf.dispatchFetch("http://game/api/host/quizzes", { headers: host });
  assert.equal(
    (await response.json()).quizzes.some((q) => q.id === "test"),
    false,
  );
  assert.equal(
    (await post("host/quiz-delete", { quiz: "test", confirmation: "DELETE QUIZ" }, host)).status,
    404,
  );
  const countdown = "http://game/api/host/quiz-countdown?after=1";
  assert.equal((await mf.dispatchFetch(countdown)).status, 401);
  response = await mf.dispatchFetch(countdown, { headers: host });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { changes: [], verified: 0, missing: [], next: null });

});
