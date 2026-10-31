import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";

test("shared account identity uses existing IDs and current aliases/permissions without returning secrets or changing gameplay", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine((sql, ...args) => db.prepare(sql).all(...args), (fn) => fn());
  e.host("players", { players: [{ id: "368", name: "arpia97" }, { id: "462", name: "HakoHoka" }] });
  e.run("UPDATE players SET password='private-password-hash',is_admin=1");
  e.run("UPDATE players SET display_name='New Display Name' WHERE id='462'");
  e.run("INSERT OR IGNORE INTO aliases VALUES('new_alias','462')");
  const before = JSON.stringify(e.all("SELECT * FROM players"));
  assert.equal(e.account(null), null);
  const account = e.account("462");
  assert.equal(account.id, "462");
  assert.equal(account.name, "New Display Name");
  assert.ok(account.aliases.includes("hakohoka"));
  assert.ok(account.aliases.includes("new_alias"));
  assert.equal(account.host, false); // An old stray admin flag is insufficient.
  assert.equal(account.owner, false);
  assert.deepEqual(Object.keys(account).sort(), ["aliases", "host", "id", "name", "owner"]);
  e.setHostAccess("368", { player: "462", enabled: true });
  assert.equal(e.account("462").host, true);
  e.setHostAccess("368", { player: "462", enabled: false });
  assert.equal(e.account("462").host, false);
  assert.equal(e.account("368").host, true);
  assert.equal(e.account("368").owner, true);
  // The read itself must not claim daily rewards, open packs or create games.
  const afterPermissions = JSON.stringify(e.all("SELECT * FROM players"));
  e.account("462"); e.account("368");
  assert.equal(JSON.stringify(e.all("SELECT * FROM players")), afterPermissions);
  assert.equal(e.all("SELECT * FROM inventory").length, 0);
  assert.ok(before.includes("private-password-hash"));
  assert.ok(!JSON.stringify(account).includes("private-password-hash"));
});
