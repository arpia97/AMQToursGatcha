import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler/package.json"))(
    "miniflare",
  );
test("Workers SQLite loads profiles and pinned/anime completion with marketplace and multi-card trade escrow", async (t) => {
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      contents: `
 import {DurableObject} from 'cloudflare:workers';import {Engine} from './src/engine.js';
 export class ProfileQA extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.e=new Engine((sql,...args)=>[...ctx.storage.sql.exec(sql,...args)],fn=>ctx.storage.transactionSync(fn));const e=this.e;
 e.tx(()=>{e.host('players',{players:[{id:'lister',name:'Lister'},{id:'offerer',name:'Offerer'}]});e.host('catalog',{cards:[{id:'c1',kind:'character',name:'One',series:'Anime'},{id:'c2',kind:'character',name:'Two',series:'Anime'},{id:'p1',kind:'seiyuu',name:'Voice'}]});
 e.addCard('lister','c1');for(const id of ['c1','c2','p1'])e.addCard('offerer',id);
 e.action('offerer','list-card',{card:'c1',variant:'card',venue:'shop',price:100});
 const listing=e.action('lister','trade-list',{card:'c1',variant:'card',expectedLevel:1}).listing;
 e.action('offerer','trade-offer',{listing,cards:[{card:'c2',variant:'card',expectedLevel:1},{card:'p1',variant:'card',expectedLevel:1}]});
 e.economy.anime.pin('offerer',{series:'anime',pinned:true});e.action('lister','wishlist',{card:'p1',wanted:true});e.action('offerer','wishlist',{card:'p1',wanted:true});});}
 async fetch(){try{return Response.json({profile:this.e.profile('offerer'),anime:this.e.economy.anime.page('offerer'),collectors:this.e.economy.wishlist.collectors('c1'),offered:this.e.economy.wishlist.collectors('c2'),wanted:this.e.economy.wishlist.collectors('p1','wanted')});}catch(error){return Response.json({error:error.message},{status:500});}}}
 export default {fetch(request,env){return env.GAME.getByName('isolated-profile').fetch(request);}};
 `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
  });
  const mf = new Miniflare({
    workers: [
      {
        config: {
          name: "profile-test",
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
            ProfileQA: {
              type: "durable-object",
              storage: "sqlite",
              state: "created",
            },
          },
          env: {
            GAME: {
              type: "durable-object",
              worker: "profile-test",
              exportName: "ProfileQA",
            },
          },
        },
      },
    ],
  });
  t.after(() => mf.dispose());
  const response = await mf.dispatchFetch("http://test/profile"),
    data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.profile.id, "offerer");
  assert.equal(data.profile.completion.character.owned, 2);
  assert.equal(data.profile.completion.seiyuu.owned, 1);
  assert.equal(data.profile.pinnedAnime[0].owned, 2);
  assert.equal(data.anime.series[0].owned, 2);
  assert.equal(data.profile.inventory.length, 0);
  assert.equal(data.collectors.counts.owned, 2);
  assert.deepEqual(
    new Set(data.collectors.rows.map((p) => p.id)),
    new Set(["lister", "offerer"]),
  );
  assert.deepEqual(
    data.offered.rows.map((p) => p.id),
    ["offerer"],
  );
  assert.deepEqual(data.wanted.counts, { owned: 1, wanted: 2 });
  assert.ok(data.wanted.rows.every((p) => !Object.hasOwn(p, "balance")));
});
