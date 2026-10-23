// Integration check against a local Wrangler dev server. Creates clearly named test players only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = "http://127.0.0.1:8787",
  vars = await readFile(".dev.vars", "utf8"),
  host = vars.match(/^HOST_TOKEN=(.+)$/m)?.[1]?.trim();
if (!host)
  throw new Error(
    "Create an ignored .dev.vars with HOST_TOKEN and start pnpm dev first.",
  );
const suffix = Date.now(),
  alice = "test-a-" + suffix,
  bob = "test-b-" + suffix,
  password = "temporary-integration-" + crypto.randomUUID();
async function call(
  path,
  body,
  { cookie, admin = false, key = crypto.randomUUID(), origin = base } = {},
) {
  const response = await fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body
        ? {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
            Origin: origin,
          }
        : {}),
      ...(admin ? { Authorization: "Bearer " + host } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
assert.equal((await call("host/state")).status, 401);
assert.equal((await call("daily", {})).status, 401);
assert.equal(
  (
    await call(
      "host/players",
      {
        players: [
          { id: alice, name: alice, aliases: ["alias-" + suffix] },
          { id: bob, name: bob },
        ],
      },
      { admin: true },
    )
  ).status,
  200,
);
const cards = JSON.parse(await readFile("public/sample-catalog.json", "utf8"));
assert.equal(
  (await call("host/catalog", { cards }, { admin: true })).status,
  200,
);
async function register(player) {
  const invite = await call("host/invite", { player }, { admin: true });
  assert.equal(invite.status, 200);
  const reg = await call("register", {
    player,
    code: invite.data.code,
    password,
  });
  assert.equal(reg.status, 200);
  assert.ok(reg.cookie);
  return { cookie: reg.cookie, code: invite.data.code };
}
const a = await register(alice),
  b = await register(bob);
assert.equal(
  (await call("register", { player: alice, code: a.code, password })).status,
  401,
);
assert.equal(
  (await call("login", { player: "alias-" + suffix, password })).status,
  200,
);
assert.equal(
  (
    await call(
      "host/grant",
      {
        player: alice,
        amount: 1000,
        reason: "participation",
        event: "tour42",
        note: "Integration test",
      },
      { admin: true, key: "grant-" + alice },
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "host/grant",
      {
        player: alice,
        amount: 1000,
        reason: "participation",
        event: "tour42",
        note: "Integration test",
      },
      { admin: true, key: "grant-" + alice },
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "host/grant",
      {
        player: bob,
        amount: 1000,
        reason: "counting",
        event: "tour42",
        note: "Integration test",
      },
      { admin: true },
    )
  ).status,
  200,
);
const daily = await Promise.all(
  Array.from({ length: 8 }, () => call("daily", {}, a)),
);
assert.equal(daily.filter((x) => x.status === 200).length, 1);
const state = (await call("state", undefined, a)).data;
assert.equal(state.me.balance, 1100);
assert.equal(state.me.earned, 1100);
assert.equal(state.auctions.length, 10);
const auction = state.auctions[0].id;
const bids = await Promise.all([
  call("bid", { auction, amount: 100 }, a),
  call("bid", { auction, amount: 200 }, b),
]);
assert.equal(bids[1].status, 200);
assert.equal((await call("state", undefined, b)).data.me.balance, 800);
assert.equal((await call("state", undefined, a)).data.me.balance, 1100);
const packs = await Promise.all(
  Array.from({ length: 8 }, () => call("pack", { kind: "character" }, a)),
);
assert.equal(packs.filter((x) => x.status === 200).length, 2);
const after = (await call("state", undefined, a)).data;
assert.equal(after.me.balance, 100);
assert.equal(after.me.earned, 1100);
assert.equal(
  after.inventory.reduce((n, i) => n + i.copies, 0),
  10,
);
assert.equal(
  (
    await call(
      "profile",
      { username: "Custom " + suffix, avatar: after.inventory[0].card },
      a,
    )
  ).status,
  200,
);
assert.equal((await call("profile", { username: alice }, b)).status, 409);
const found = await call("profiles?q=" + encodeURIComponent("alias-" + suffix));
assert.equal(found.data.profiles[0].id, alice);
const profile = await call("player?id=" + alice);
assert.equal(profile.data.balance, 100);
assert.equal(profile.data.stats.participation, 1);
assert.equal(profile.data.avatar_card, after.inventory[0].card);
assert.equal(
  (await call("daily", {}, { ...a, origin: "https://untrusted.example" }))
    .status,
  403,
);
assert.equal(
  (
    await call(
      "host/reset-player",
      { player: bob, confirmation: "wrong" },
      { admin: true },
    )
  ).status,
  400,
);
assert.equal(
  (
    await call(
      "host/reset-player",
      { player: bob, confirmation: "RESET PLAYER " + bob },
      { admin: true },
    )
  ).status,
  200,
);
assert.equal((await call("daily", {}, b)).status, 401);
assert.equal(
  (await call("host/reset", { player: alice }, { admin: true })).status,
  200,
);
assert.equal((await call("daily", {}, a)).status, 401);
console.log(
  "Integration passed: host auth, invite reuse, alias login, duplicate grants, concurrent daily claims/packs/bids, profiles, alias protection, origin checks, reset warnings, and session revocation.",
);
