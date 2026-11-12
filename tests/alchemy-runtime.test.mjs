import { registerWithHostCode } from "./host-registered-account.mjs";
import { ENHANCEMENT_REVISION } from "../public/card-values.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const require = createRequire(import.meta.url),
  { Miniflare, Response: RuntimeResponse } = createRequire(
    require.resolve("wrangler/package.json"),
  )("miniflare");
test("Worker alchemy endpoints protect one-card refinements, preserve XP and reject retired fusion clients", async (t) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/worker.js", import.meta.url))],
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
          name: "alchemy-runtime-test",
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
            Game: {
              type: "durable-object",
              storage: "sqlite",
              state: "created",
            },
          },
          env: {
            GAME: {
              type: "durable-object",
              worker: "alchemy-runtime-test",
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
            handler: (request) =>
              new RuntimeResponse(
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
              ),
          },
        },
      },
    ],
  });
  t.after(() => mf.dispose());
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

  let response = await post(
    "host/players",
    { players: [{ id: "1", name: "Local Alchemist" }] },
    host,
  );
  assert.equal(response.status, 200);
  const cards = ["character", "seiyuu"].flatMap((kind) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: "community-" + kind + i,
      name: kind + i,
      kind,
      fixedRarity: "D",
    })),
  );
  response = await post("host/catalog", { cards }, host);
  assert.equal(response.status, 200, await response.clone().text());
  response = await registerWithHostCode(post, host, {
    player: "1",
    password: "local-only-password",
  });
  assert.equal(response.status, 200);
  const auth = { Cookie: response.headers.get("Set-Cookie").split(";")[0] };
  response = await mf.dispatchFetch("http://game/api/alchemy");
  assert.equal(response.status, 401);
  for (let i = 0; i < 2; i++) {
    response = await post("pack", { kind: "character" }, auth);
    assert.equal(response.status, 200, await response.clone().text());
  }
  let progress = (
    await (
      await mf.dispatchFetch("http://game/api/alchemy", { headers: auth })
    ).json()
  ).alchemyState;
  assert.equal(progress.xp, 0);
  response = await post("wishlist", { card: cards[0].id, wanted: true });
  assert.equal(response.status, 401);
  response = await post("wishlist", { card: cards[0].id, wanted: true }, auth);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).wishlist, [cards[0].id]);
  response = await mf.dispatchFetch(
    "http://game/api/player-cards?id=1&view=wishlist",
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].card, cards[0].id);
  response = await mf.dispatchFetch(
    "http://game/api/player-cards?id=1&view=listings",
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows.length, 0);

  response = await mf.dispatchFetch(
    "http://game/api/player-cards?id=1&view=collection",
  );
  assert.equal(response.status, 200);
  const publicCollection = await response.json();
  assert.ok(
    publicCollection.rows.length > 0 && publicCollection.rows.length <= 24,
  );
  assert.equal(publicCollection.cards.length, publicCollection.rows.length);
  assert.ok(
    publicCollection.rows.every((row) =>
      Object.keys(row).every((key) =>
        [
          "card",
          "level",
          "copies",
          "protected",
          "wishlisted",
          "for_trade",
        ].includes(key),
      ),
    ),
  );
  response = await mf.dispatchFetch(
    "http://game/api/player-cards?id=missing&view=collection",
  );
  assert.equal(response.status, 404);

  response = await mf.dispatchFetch(
    "http://game/api/alchemy-targets?rarity=D&wishlist=1",
  );
  assert.equal(response.status, 401);
  response = await mf.dispatchFetch(
    "http://game/api/alchemy-targets?rarity=D&wishlist=1&player=another-player",
    { headers: auth },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).cards.map((c) => c.id),
    [cards[0].id],
  );
  response = await mf.dispatchFetch(
    "http://game/api/alchemy-targets?rarity=D&wishlist=1&kind=seiyuu",
    { headers: auth },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 0);
  response = await mf.dispatchFetch("http://game/api/alchemy-targets?rarity=D");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 10);

  for (let i = 0; i < 6; i++) {
    const state = await (
        await mf.dispatchFetch("http://game/api/state", { headers: auth })
      ).json(),
      item = state.inventory[0],
      body = {
        card: item.card,
        variant: item.copies > 1 ? "extra" : "card",
        expectedRarity: "D",
        expectedLevel: 1,
        expectedVersion: progress.version,
        confirmed: true,
        enhancementRevision: ENHANCEMENT_REVISION,
      },
      key = crypto.randomUUID();
    response = await post("alchemy-feed", { ...body, confirmed: false }, auth);
    assert.equal(response.status, 409);
    response = await post("alchemy-feed", body, {
      ...auth,
      "Idempotency-Key": key,
    });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.lucky, i === 5);
    assert.equal(result.collectionPatch.inventory.length, 1);
    assert.equal(result.gameState, undefined);
    const retry = await post("alchemy-feed", body, {
      ...auth,
      "Idempotency-Key": key,
    });
    assert.deepEqual(await retry.json(), result);
    progress = result.alchemyState;
  }
  assert(progress.xp >= 60);
  assert.equal(progress.refinements, 6);
  response = await post(
    "alchemy-target",
    { rarity: "D", card: cards[0].id, expectedVersion: progress.version },
    auth,
  );
  assert.equal(response.status, 200);
  progress = (await response.json()).alchemyState;
  const before = progress.xp;
  response = await post(
    "alchemy-draw",
    {
      rarity: "D",
      targetCard: cards[0].id,
      expectedVersion: progress.version,
      confirmed: true,
    },
    auth,
  );
  assert.equal(response.status, 200);
  const draw = await response.json();
  assert.equal(draw.alchemyState.xp, before - 50);
  assert.equal(draw.cards[0].rarity, "D");
  assert.equal(draw.collectionPatch.me.balance, 4000);
  assert.equal(draw.collectionPatch.me.earned, 5000);
  response = await post("fusion", { confirmed: true }, auth);
  assert.equal(response.status, 410);
});
