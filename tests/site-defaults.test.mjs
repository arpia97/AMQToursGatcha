import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  DAILY_CREDITS,
  MAX_SPOTLIGHTS,
  MAX_PINNED_ANIME,
  PICKEM_WINDOW,
} from "../public/site-defaults.js";
import { roleBadge } from "../public/role-label.js";
import {
  deadlineFields,
  updateRewardDefaults,
} from "../public/host-defaults.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = Date.UTC(2026, 9, 27, 12);
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
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
      { id: "368", name: "arpia97" },
      { id: "p", name: "Player" },
      { id: "q", name: "Host" },
    ],
  });
  return {
    e,
    now: () => now,
    advance: (ms) => (now += ms),
    host: (a, b) => e.tx(() => e.host(a, b)),
  };
}
test("twenty unique owned spotlights are allowed and a twenty-first cannot replace the saved list", (t) => {
  const { e } = fixture(t),
    cards = Array.from({ length: 21 }, (_, i) => ({
      id: "c" + i,
      kind: "character",
      name: "Card " + i,
      series: "Anime " + i,
    }));
  assert.equal(MAX_SPOTLIGHTS, 20);
  assert.equal(MAX_PINNED_ANIME, 20);
  e.host("catalog", { cards });
  for (const c of cards) e.addCard("p", c.id);
  const chosen = cards.slice(0, 20).map((c) => c.id);
  e.tx(() => e.action("p", "showcase", { cards: chosen }));
  assert.equal(e.profile("p").showcase.length, 20);
  assert.throws(
    () =>
      e.tx(() => e.action("p", "showcase", { cards: cards.map((c) => c.id) })),
    /20/,
  );
  assert.deepEqual(
    e.profile("p").showcase.map((c) => c.card),
    chosen,
  );
  assert.throws(
    () => e.tx(() => e.action("q", "showcase", { cards: chosen })),
    /collection/,
  );
});
test("daily credits are 300 once per KST day, with no regrant to a player who already claimed the old amount", (t) => {
  const { e, advance, now } = fixture(t);
  assert.equal(DAILY_CREDITS, 300);
  e.wallet("p", 100, "Daily login", true);
  e.run(
    "UPDATE players SET daily=? WHERE id='p'",
    new Date(now() + 9 * 3600000).toISOString().slice(0, 10),
  );
  assert.throws(() => e.economy.daily("p"), /already claimed/);
  assert.equal(e.player("p").balance, 100);
  advance(86400000);
  assert.equal(e.tx(() => e.action("p", "daily", {})).credits, 300);
  assert.equal(e.player("p").balance, 400);
  assert.equal(e.player("p").earned, 400);
  assert.throws(
    () => e.tx(() => e.action("p", "daily", {})),
    /already claimed/,
  );
});
test("host reward defaults use 1000 participation, 300 per counted game and 500 per reported game, while explicit amounts stay editable", (t) => {
  const { e, host } = fixture(t);
  host("grant", {
    player: "p",
    reason: "participation",
    note: "Tour",
    event: "t1",
  });
  host("grant", {
    player: "p",
    reason: "counting",
    games: 3,
    note: "Tour",
    event: "t1",
  });
  host("grant", {
    player: "p",
    reason: "reporting",
    games: 3,
    note: "Tour",
    event: "t1",
  });
  assert.equal(e.player("p").balance, 3400);
  host("grant", {
    player: "p",
    reason: "reporting",
    games: 3,
    amount: 42,
    note: "Custom",
    event: "t2",
  });
  assert.equal(e.player("p").balance, 3442);
  assert.throws(
    () =>
      host("grant", {
        player: "p",
        reason: "reporting",
        games: 0,
        note: "Bad",
      }),
    /whole number/,
  );
  const preview = e.participation.preview("Player (98.893) | Total = 98.893");
  host("participation-batch", {
    text: "Player (98.893)",
    event: "t3",
    note: "Default batch",
    expectedPlayers: preview.players.map((p) => p.id),
  });
  assert.equal(e.player("p").balance, 4442);
});
test("default pickem deadlines are exactly ten minutes after actual posting, including generated rounds, and explicit deadlines remain editable", (t) => {
  const { e, host, advance, now } = fixture(t);
  advance(240000);
  host("pickem", { title: "Match", tour: "Tour", teamA: "A", teamB: "B" });
  assert.equal(
    e.one("SELECT ends FROM pickems WHERE id=1").ends,
    now() + PICKEM_WINDOW,
  );
  const chosen = now() + 3600000;
  host("pickem", {
    title: "Later",
    tour: "Tour",
    teamA: "A",
    teamB: "B",
    ends: chosen,
  });
  assert.equal(e.one("SELECT ends FROM pickems WHERE id=2").ends, chosen);
  const ev = host("pickem-event", {
    name: "Four",
    format: "double-4",
    teams: ["A", "B", "C", "D"],
  });
  assert.ok(
    e.pickemEvents
      .read(ev.event)
      .matches.every((m) => m.ends === now() + 600000),
  );
  const automatic = host("pickem-event", {
    name: "Six",
    format: "single-6",
    teams: ["A", "B", "C", "D", "E", "F"],
    deadlines: [null, null, null, null, null],
  });
  assert.equal(e.pickemEvents.read(automatic.event).matches.length, 15);
  assert.match(
    deadlineFields("ends", "Voting closes", now()),
    /name="endsAutomatic"[^>]*checked/,
  );
});
test("Host titles follow effective owner/delegated roles and disappear immediately on revocation; names and rogue flags cannot confer titles", (t) => {
  const { e } = fixture(t);
  e.run("UPDATE players SET password='hash',is_admin=1");
  assert.deepEqual(e.publicRoles(), { 368: "Host" });
  assert.equal(e.profile("p").role, null);
  assert.equal(e.profile("q").role, null);
  e.tx(() => e.setHostAccess("368", { player: "p", enabled: true }));
  assert.equal(e.publicRoles().p, "Host");
  assert.equal(e.profile("p").role, "Host");
  assert.match(roleBadge(e.profile("p").role), />Host</);
  e.tx(() => e.setHostAccess("368", { player: "p", enabled: false }));
  assert.equal(e.publicRoles().p, undefined);
  assert.equal(e.profile("p").role, null);
  assert.equal(roleBadge("<script>"), "");
});
test("host reward form switches defaults and multiplies reporting games without disabling custom amount edits", () => {
  const fields = {
      reason: { value: "reporting" },
      games: { value: "4", disabled: false },
      amount: { value: "" },
    },
    label = { hidden: false };
  const form = {
    elements: { namedItem: (k) => fields[k] },
    querySelector: () => label,
  };
  updateRewardDefaults(form);
  assert.equal(fields.amount.value, 2000);
  fields.reason.value = "counting";
  updateRewardDefaults(form);
  assert.equal(fields.amount.value, 1200);
  assert.equal(fields.games.disabled, false);
  assert.equal(label.hidden, false);
  fields.reason.value = "participation";
  updateRewardDefaults(form);
  assert.equal(fields.amount.value, 1000);
});
