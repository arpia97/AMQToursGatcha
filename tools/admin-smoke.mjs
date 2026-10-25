// Local runtime check only. Never points at production or prints passwords/tokens.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = "http://127.0.0.1:8787/api/";
const host = (await readFile(".dev.vars", "utf8"))
  .match(/^HOST_TOKEN=(.+)$/m)[1]
  .trim();
// Use a fresh local store: this check never overwrites an existing owner.
const id = "368",
  ordinary = "test-ordinary-" + Date.now(),
  password = "Test123!";
async function call(path, body, { token = false, cookie = "" } = {}) {
  const r = await fetch(root + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body
        ? {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          }
        : {}),
      ...(token ? { Authorization: "Bearer " + host } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
assert.equal(
  (
    await call(
      "host/admin-account",
      { player: id, name: "arpia97", password },
      { token: true },
    )
  ).status,
  200,
  "Run this smoke check against a fresh local store with an unregistered owner.",
);
assert.equal(
  (
    await call(
      "host/admin-account",
      { player: "not-the-owner", password },
      { token: true },
    )
  ).status,
  403,
);
assert.equal(
  (await call("host/admin-account", { player: id, password }, { token: true }))
    .status,
  409,
);
assert.equal(
  (await call("login", { player: id, password: "wrong123" })).status,
  401,
);
const login = await call("login", { player: id, password });
assert.equal(login.status, 200);
const admin = { cookie: login.cookie };
assert.equal((await call("state", undefined, admin)).data.me.is_admin, 1);
assert.equal((await call("host/state", undefined, admin)).status, 200);
assert.equal(
  (
    await call(
      "host/grant",
      {
        player: id,
        amount: 100,
        reason: "other",
        note: "Admin permission check",
      },
      admin,
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "host/players",
      { players: [{ id: ordinary, name: ordinary, is_admin: 1 }] },
      admin,
    )
  ).status,
  200,
);
const invite = await call("host/invite", { player: ordinary }, admin);
const registration = await call("register", {
  player: ordinary,
  code: invite.data.code,
  password: "ordinary-password-check",
});
assert.equal(registration.status, 200);
const player = { cookie: registration.cookie };
assert.equal((await call("state", undefined, player)).data.me.is_admin, 0);
assert.equal((await call("host/state", undefined, player)).status, 401);
assert.equal(
  (await call("host/admin-account", { player: "attacker", password }, player))
    .status,
  401,
);
assert.equal(
  (
    await call(
      "host/grant",
      { player: ordinary, amount: 100, reason: "other", note: "Forbidden" },
      player,
    )
  ).status,
  401,
);
await call("logout", {}, admin);
assert.equal((await call("host/state", undefined, admin)).status, 401);
assert.equal(
  (await call("host/state", undefined, { token: true })).status,
  200,
);
console.log(
  "Administrator runtime check passed: eight-character password login, full host access, regular-player denial, no role escalation, logout revocation, host token compatibility.",
);
