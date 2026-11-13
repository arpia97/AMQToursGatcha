import { registerWithHostCode } from "./host-registered-account.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { SPECIALPACK_ROLLBACK_ID } from "../src/specialpack-rollback.js";
const require = createRequire(import.meta.url),
  { Miniflare, Response: RuntimeResponse } = createRequire(
    require.resolve("wrangler/package.json"),
  )("miniflare");
test("live Worker routes protect credit previews/deductions, preserve earned credits and replay deductions once", async (t) => {
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
          name: "host-credit-test",
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
              worker: "host-credit-test",
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
            handler: () =>
              new RuntimeResponse("Isolated test: outbound disabled", {
                status: 503,
              }),
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
    { players: [{ id: "1", name: "Local User" }] },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const missingCode = await post("register",{player:"1",password:"local-only-password"});
  assert.equal(missingCode.status,401);
  response = await registerWithHostCode(post, host, {
    player: "1",
    password: "local-only-password",
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("set-cookie").split(";")[0];
  for (const path of ["host/deduction-preview", "host/deduct"]) {
    response = await post(path, { player: "1", amount: 100, note: "Reason" });
    assert.equal(response.status, 401);
    response = await post(
      path,
      { player: "1", amount: 100, note: "Reason" },
      { Cookie: cookie },
    );
    assert.equal(response.status, 401);
  }
  response = await post(
    "host/deduction-preview",
    { player: "1", amount: 100, note: "Correction" },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const quote = await response.json();
  const read = async () => {
    const r = await mf.dispatchFetch("http://game/api/player?id=1");
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const before = await read();
  assert.equal(before.balance, quote.expectedBalance);
  const headers = { ...host, "Idempotency-Key": "deduct-once" };
  response = await post("host/deduct", quote, headers);
  assert.equal(response.status, 200, await response.clone().text());
  response = await post("host/deduct", quote, headers);
  assert.equal(response.status, 200);
  const after = await read();
  assert.equal(after.balance, before.balance - 100);
  assert.equal(after.earned, before.earned);
  response = await post("host/deduct", quote, {
    ...host,
    "Idempotency-Key": "stale-review",
  });
  assert.equal(response.status, 409);
  assert.equal((await read()).balance, after.balance);
  // Delegated hosts share read-only credit audits, without owner-only access.
  await post(
    "host/players",
    { players: [{ id: "2", name: "Delegated Host" }] },
    host,
  );
  const registeredHost = await registerWithHostCode(post, host, {
    player: "2",
    password: "local-host-password",
  });
  assert.equal(registeredHost.status, 200);
  const hostCookie = registeredHost.headers.get("set-cookie").split(";")[0];
  const entryUrl = "http://game/api/host/state?section=rewards";
  assert.equal((await mf.dispatchFetch(entryUrl)).status, 401);
  assert.equal((await mf.dispatchFetch(entryUrl, { headers: { Cookie: cookie } })).status, 401);
  response = await post(
    "host/permissions",
    { player: "2", enabled: true },
    host,
  );
  assert.equal(response.status, 200);
  const entry = await mf.dispatchFetch(entryUrl, { headers: { Cookie: hostCookie } });
  assert.equal(entry.status, 200);
  assert.deepEqual(Object.keys(await entry.json()).sort(), ["aliases", "players", "usernames"]);
  for (const path of ["host/account-rollback-preview", "host/account-rollback"]) {
    assert.equal((await post(path, {})).status, 401);
    assert.equal((await post(path, {}, { Cookie: cookie })).status, 401);
    assert.equal((await post(path, {}, { Cookie: hostCookie })).status, 403);
    const invalid = await post(path, { digest:"changed" }, host);
    assert.equal(invalid.status, 409);
    const unreviewed = { repairId:SPECIALPACK_ROLLBACK_ID, scope:{targets:["1"]} };
    const bodyDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(unreviewed)))),b=>b.toString(16).padStart(2,"0")).join("");
    const rejectedScope = await post(path,{...unreviewed,digest:bodyDigest},host);
    assert.equal(rejectedScope.status,409);
    assert.match((await rejectedScope.json()).error,/scope/);
  }
  assert.equal((await mf.dispatchFetch("http://game/api/host/account-rollback-receipt?id=test", {
    headers:{Cookie:hostCookie},
  })).status,403);
  const missingRollback = await mf.dispatchFetch("http://game/api/host/account-rollback-receipt?id=test", {headers:host});
  assert.equal(missingRollback.status,200);
  assert.deepEqual(await missingRollback.json(),{result:null});
  for (const path of ["host/credit-audit", "host/activity-csv"]) {
    assert.equal(
      (await mf.dispatchFetch("http://game/api/" + path)).status,
      401,
    );
    assert.equal(
      (
        await mf.dispatchFetch("http://game/api/" + path, {
          headers: { Cookie: cookie },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await mf.dispatchFetch("http://game/api/" + path, {
          headers: { Cookie: hostCookie },
        })
      ).status,
      200,
    );
  }
  response = await post(
    "host/grant",
    {
      player: "1",
      amount: 200,
      reason: "reporting",
      note: "Delegated audit award",
      event: "Runtime tour",
    },
    { Cookie: hostCookie },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const audit = await (
    await mf.dispatchFetch("http://game/api/host/credit-audit?kind=host", {
      headers: { Cookie: hostCookie },
    })
  ).json();
  const award = audit.rows.find((r) =>
    r.reason.includes("Delegated audit award"),
  );
  assert.equal(award.actor, "2");
  assert.equal(award.category, "reporting");
  response = await mf.dispatchFetch("http://game/api/host/activity-csv", {
    headers: { Cookie: hostCookie },
  });
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.match(await response.text(), /Delegated audit award/);
  assert.equal(
    (
      await post(
        "host/permissions",
        { player: "1", enabled: true },
        { Cookie: hostCookie },
      )
    ).status,
    403,
  );
  response = await post(
    "host/catalog",
    {
      cards: Array.from({ length: 5 }, (_, i) => ({
        id: "community-runtime-search-" + i,
        kind: "character",
        name: "Iwami, Manaka",
        series: "Runtime Search",
        fixedRarity: "A",
      })),
    },
    host,
  );
  assert.equal(response.status, 200, await response.clone().text());
  response = await post(
    "pack",
    { kind: "character", premium: false, count: 1 },
    { Cookie: cookie },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const pulled = (await response.json()).cards[0].id;
  response = await post(
    "list-card",
    { card: pulled, variant: "card", venue: "shop", price: 100 },
    { Cookie: cookie },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const matched = await mf.dispatchFetch(
    "http://game/api/market?venue=shop&kind=character&q=Manaka%20Iwami&sort=rarity",
  );
  assert.equal(matched.status, 200);
  const found = await matched.json();
  assert.equal(found.query, "Manaka Iwami");
  assert.equal(found.items.length, 1);
  const noMatch = await mf.dispatchFetch(
    "http://game/api/market?venue=shop&kind=character&q=DefinitelyMissing",
  );
  assert.equal(noMatch.status, 200);
  assert.deepEqual((await noMatch.json()).items, []);
  const searched = await mf.dispatchFetch(
    "http://game/api/market?venue=auction&q=Missing%20Card&sort=rarity",
  );
  assert.equal(searched.status, 200);
  assert.deepEqual((await searched.json()).items, []);
  // Personal listing filters derive identity from the session, never query input.
  assert.equal(
    (await mf.dispatchFetch("http://game/api/market?sort=wishlist&player=1"))
      .status,
    401,
  );
  assert.equal(
    (
      await mf.dispatchFetch("http://game/api/market?sort=wishlist", {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (await post("profile", { crop: { x: 0.5, y: 0.5, zoom: 2 } })).status,
    401,
  );

  const checklistPath =
    "http://game/api/anime-checklist?series=runtime%20search";
  assert.equal((await mf.dispatchFetch(checklistPath)).status, 401);
  const checklistResponse = await mf.dispatchFetch(checklistPath, {
    headers: { Cookie: cookie },
  });
  assert.equal(checklistResponse.status, 200);
  const checklist = await checklistResponse.json();
  assert.equal(checklist.total, 5);
  assert.equal(checklist.cards.length, 5);
  assert.ok(checklist.owned > 0);
  assert.equal(checklist.cards.filter((c) => c.owned).length, checklist.owned);
  const otherChecklist = await (
    await mf.dispatchFetch(checklistPath + "&player=1", {
      headers: { Cookie: hostCookie },
    })
  ).json();
  assert.equal(otherChecklist.owned, 0);
  assert.equal(
    (
      await mf.dispatchFetch(checklistPath + "&page=0", {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
  const publicState = await (
    await mf.dispatchFetch("http://game/api/state")
  ).json();
  assert.equal(
    publicState.catalogSummary.importProgress === null ||
      typeof publicState.catalogSummary.importProgress === "object",
    true,
  );
  await post("host/players",{players:[{id:"3",name:"Code Test"},{id:"4",name:"Other Identity"}]},host);
  const issued=await post("host/invite",{player:"3"},host),oneUse=(await issued.json()).code;
  assert.equal((await post("register",{player:"3",password:"local-test-password",code:"wrong-code"})).status,401);
  const joined=await post("register",{player:"3",password:"local-test-password",code:oneUse});
  assert.equal(joined.status,200);
  assert.equal((await post("register",{player:"3",password:"new-local-password",code:oneUse})).status,401);
  assert.equal((await post("register",{player:"4",password:"local-test-password",code:oneUse})).status,401);
  assert.equal((await post("host/account-lock",{player:"3",locked:true},{Cookie:hostCookie})).status,403);
  const locked=await post("host/account-lock",{player:"3",locked:true},host);
  assert.equal(locked.status,200,await locked.clone().text());
  assert.equal((await post("login",{player:"3",password:"local-test-password"})).status,403);
  assert.equal((await post("daily",{},{Cookie:joined.headers.get("set-cookie").split(";")[0]})).status,401);
  assert.equal((await post("host/grant",{player:"3",amount:100,reason:"other"},host)).status,403);
});
