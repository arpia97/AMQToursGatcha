import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  matchingCreditPlayers,
  creditPlayerOptions,
  creditPlayerPicker,
  deductionPanel,
  deductionReview,
} from "../public/host-credit-ui.js";
import { pageErrorHTML } from "../public/page-error.js";
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine(
    (sql, ...args) => db.prepare(sql).all(...args),
    (fn) => {
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  );
  e.host("players", {
    players: [
      { id: "1", name: "One" },
      { id: "2", name: "Two" },
    ],
  });
  e.host("grant", {
    player: "1",
    amount: 5000,
    note: "Initial",
    reason: "other",
  });
  return {
    e,
    act: (body, key = crypto.randomUUID()) =>
      e.mutate("host:host/deduct", key, body, () => e.host("deduct", body)),
  };
}
test("host deductions preview without writes, debit only available balance, record a reason and replay once", (t) => {
  const { e, act } = fixture(t),
    before = e.player("1"),
    ledger = e.one("SELECT count(*) n FROM ledger").n;
  const quote = e.deductionQuote({
    player: "1",
    amount: 1500,
    note: "Correct an award",
  });
  assert.equal(quote.remaining, 3500);
  assert.equal(e.player("1").balance, 5000);
  assert.equal(e.one("SELECT count(*) n FROM ledger").n, ledger);
  const result = act(quote, "deduction");
  assert.deepEqual(act(quote, "deduction"), result);
  assert.equal(e.player("1").balance, 3500);
  assert.equal(e.player("1").earned, before.earned);
  assert.equal(e.player("2").balance, 0);
  const entry = e.one("SELECT * FROM ledger ORDER BY id DESC LIMIT 1");
  assert.equal(entry.delta, -1500);
  assert.equal(entry.reason, "Host deduction: Correct an award");
  assert.equal(e.one("SELECT count(*) n FROM ledger").n, ledger + 1);
});
test("deductions reject changed balances, insufficient credits, missing players, invalid amounts and blank notes atomically", (t) => {
  const { e, act } = fixture(t);
  for (const amount of [0, -1, 1.1, 1000001, "100"])
    assert.throws(() =>
      e.deductionQuote({ player: "1", amount, note: "Reason" }),
    );
  assert.throws(() =>
    e.deductionQuote({ player: "missing", amount: 1, note: "Reason" }),
  );
  assert.throws(() => e.deductionQuote({ player: "1", amount: 1, note: "  " }));
  const quote = e.deductionQuote({ player: "1", amount: 1500, note: "Reason" });
  e.wallet("1", -100, "Other action");
  assert.throws(
    () => act(quote),
    (error) => error.status === 409,
  );
  assert.equal(e.player("1").balance, 4900);
  assert.throws(() => act({ ...quote, amount: 999999 }));
  assert.throws(
    () => act({ player: "1", amount: 5, note: "Reason" }),
    (error) => error.status === 409,
  );
  assert.equal(e.player("1").balance, 4900);
  const fresh = e.deductionQuote({
    player: "1",
    amount: 4900,
    note: "Clear available balance",
  });
  act(fresh);
  assert.equal(e.player("1").balance, 0);
  assert.equal(e.player("1").earned, 5000);
});
test("credit recipient search covers current names, canonical IDs, aliases and historical usernames without interpreting markup or patterns", () => {
  const state = {
    players: [
      { id: "1", name: "<New Name>", balance: 100 },
      { id: "21", name: "Other", balance: 200 },
    ],
    aliases: [{ player: "1", alias: "OldAlias" }],
    usernames: [{ player: "1", label: "Retired Name" }],
  };
  for (const q of ["<new", "oldalias", "RETIRED", "  retired  "])
    assert.deepEqual(
      matchingCreditPlayers(state, q).map((p) => p.id),
      ["1"],
    );
  assert.equal(matchingCreditPlayers(state, "21")[0].name, "Other");
  assert.equal(matchingCreditPlayers(state, "[").length, 0);
  assert.match(
    creditPlayerPicker(state, "grant", escape),
    /Search Players to Reward/,
  );
  assert.match(deductionPanel(state, escape), /Review Deduction/);
  assert.doesNotMatch(creditPlayerOptions(state.players, escape), /<New Name>/);
  assert.match(
    creditPlayerOptions(state.players, escape, "21"),
    /value="21" selected/,
  );
  assert.match(
    deductionReview(
      {
        player: "1",
        name: "<Name>",
        amount: 5,
        note: "<Reason>",
        expectedBalance: 10,
        remaining: 5,
      },
      escape,
    ),
    /&lt;Reason&gt;/,
  );
});
test("only a missing collector uses not-found copy; profile and other route failures offer a retry without disguising server errors", () => {
  assert.match(
    pageErrorHTML({ status: 404, message: "Missing" }, "player", escape),
    /That Collector Could Not Be Found/,
  );
  assert.doesNotMatch(
    pageErrorHTML({ status: 500, message: "<Failure>" }, "profile", escape),
    /Collector Could Not Be Found/,
  );
  assert.match(
    pageErrorHTML({ status: 500, message: "<Failure>" }, "profile", escape),
    /This Profile Could Not Be Loaded/,
  );
  assert.match(
    pageErrorHTML({ status: 500, message: "<Failure>" }, "profile", escape),
    /&lt;Failure&gt;/,
  );
  assert.match(
    pageErrorHTML({ status: 500 }, "shop", escape),
    /This Page Could Not Be Loaded/,
  );
  assert.match(
    pageErrorHTML({ status: 500 }, "profile", escape),
    /data-action="retry-page"/,
  );
});
