import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { creditAuditPanel } from "../public/host-audit-ui.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const now = Date.UTC(2026, 10, 6, 12);
  const e = new Engine(
    (s, ...args) => db.prepare(s).all(...args),
    (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    () => now,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "h", name: "Host" },
    ],
  });
  e.run("UPDATE players SET balance=10000");
  e.run("UPDATE players SET is_admin=1 WHERE id='h'");
  const grant = (key = "grant") =>
    e.creditAudit.asHost("h", () =>
      e.mutate(
        "host:grant",
        key,
        { player: "p", amount: 500, reason: "reporting", event: "Tour A" },
        () =>
          e.host("grant", {
            player: "p",
            amount: 500,
            reason: "reporting",
            event: "Tour A",
          }),
      ),
    );
  return { e, now, grant };
}
test("host attribution is tied to the exact ledger movement, inherited by batches and not duplicated on replay", (t) => {
  const { e, grant } = fixture(t);
  grant();
  grant();
  const data = e.creditAudit.page({ kind: "host" });
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].actor, "h");
  assert.equal(data.rows[0].category, "reporting");
  assert.equal(data.rows[0].event, "Tour A");
  assert.equal(data.totals.host_rewards, 500);
  assert.equal(e.creditAudit.actor, null);
  e.creditAudit.asHost("host-token", () =>
    e.tx(() =>
      e.participation.grant({
        text: "Player (1) Host (2) Player (3) Host (4) | Total = 10 | Guesses = [1111]",
        event: "Batch",
        rewardVersion: 2,
        tourSize: 16,
        maxRounds: 6,
        expectedPlayers: ["h", "p"],
        participants: [
          { player: "h", rounds: 6, count: true, report: false },
          { player: "p", rounds: 6, count: false, report: false },
        ],
      }),
    ),
  );
  const batch = e.creditAudit
    .page({ kind: "host" })
    .rows.filter((r) => r.event === "Batch");
  assert.equal(batch.length, 3);
  assert.ok(batch.every((r) => r.actor === "host-token"));
  assert.throws(
    () =>
      e.creditAudit.asHost("h", () => {
        throw Error("fail");
      }),
    /fail/,
  );
  assert.equal(e.creditAudit.actor, null);
});
test("audit views separate spending, inflows and legacy host rewards, support current-host/player filters and stable paging", (t) => {
  const { e, now, grant } = fixture(t);
  grant();
  e.wallet("p", -200, "Character pack");
  e.wallet("h", -30, "Mahjong draw");
  e.wallet("p", 50, "Outbid refund");
  e.run(
    "INSERT INTO ledger(player,delta,reason,at) VALUES('p',100,'counting: Legacy award',?)",
    now - 1000,
  );
  const spent = e.creditAudit.page({ kind: "spent" });
  assert.equal(spent.rows.length, 2);
  assert.equal(spent.totals.spent, 230);
  assert.equal(
    e.creditAudit.page({ kind: "spent", scope: "hosts" }).rows[0].player,
    "h",
  );
  assert.equal(
    e.creditAudit.page({ kind: "spent", player: "p" }).rows.length,
    1,
  );
  const host = e.creditAudit.page({ kind: "host" });
  assert.equal(host.rows.length, 2);
  assert.equal(host.rows.find((r) => r.reason.includes("Legacy")).actor, null);
  assert.equal(e.creditAudit.page({ kind: "earned" }).rows.length, 3);
  for (let i = 0; i < 120; i++) e.wallet("p", 1, "Extra " + i);
  const first = e.creditAudit.page({ kind: "earned" }),
    second = e.creditAudit.page({
      kind: "earned",
      before: first.next,
      to: first.to,
    });
  assert.equal(first.rows.length, 100);
  assert.equal(first.hasMore, true);
  assert.equal(second.rows.length, 23);
  assert.ok(second.rows.every((r) => r.id < first.next));
});
test("12-hour CSV includes all available rows beyond 100, respects exact boundaries, and escapes formula/CSV cells", (t) => {
  const { e, now } = fixture(t);
  const add = (reason, at) =>
    e.run(
      "INSERT INTO ledger(player,delta,reason,at) VALUES('p',-1,?,?)",
      reason,
      at,
    );
  for (let i = 0; i < 130; i++) add("Recent " + i, now - i);
  add("Boundary", now - 12 * 3600000);
  add("Too old", now - 12 * 3600000 - 1);
  add("Future", now + 1);
  add("=SUM(1,2)", now);
  const csv = e.creditAudit.recentCSV();
  assert.match(csv, /Recent 0/);
  assert.match(csv, /Recent 129/);
  assert.match(csv, /Boundary/);
  assert.doesNotMatch(csv, /Too old|Future/);
  assert.match(csv, /"'=SUM\(1,2\)"/);
  assert.match(csv, /"-1"/);
  assert.match(csv, /Time \(KST\)/);
});
test("credit audit UI exposes filters and does not require owner privileges", () => {
  const html = creditAuditPanel(
    null,
    { kind: "host", scope: "hosts", window: "12h", player: "" },
    [],
    String,
  );
  assert.match(html, /Host Activity Rewards/);
  assert.match(html, /Current Hosts Only/);
  assert.match(html, /Last 12 Hours CSV/);
  assert.doesNotMatch(html, /Only arpia97|canManageHosts/);
});
