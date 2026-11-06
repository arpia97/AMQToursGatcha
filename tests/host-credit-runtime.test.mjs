import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
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
  response = await post("register", {
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
  const registeredHost = await post("register", {
    player: "2",
    password: "local-host-password",
  });
  assert.equal(registeredHost.status, 200);
  const hostCookie = registeredHost.headers.get("set-cookie").split(";")[0];
  response = await post(
    "host/permissions",
    { player: "2", enabled: true },
    host,
  );
  assert.equal(response.status, 200);
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
  const publicState = await (
    await mf.dispatchFetch("http://game/api/state")
  ).json();
  assert.equal(
    publicState.catalogSummary.importProgress === null ||
      typeof publicState.catalogSummary.importProgress === "object",
    true,
  );
});
