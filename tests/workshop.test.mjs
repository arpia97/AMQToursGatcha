import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  RARITIES,
  cardInvestment,
  instantSalePrice,
} from "../public/card-values.js";
import {
  fusionContribution,
  fusionQuote,
  rollFusion,
  FUSION_ROLL_SCALE,
} from "../public/fusion-rules.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  const e = new Engine(
    (sql, ...a) => db.prepare(sql).all(...a),
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
    () => Date.UTC(2026, 9, 24),
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  const cards = new Map(
    [...RARITIES, "Pending"].map((rarity, i) => [
      rarity,
      {
        id: rarity,
        kind: i % 2 ? "seiyuu" : "character",
        rarity: rarity === "Pending" ? null : rarity,
        name: rarity + " card",
        series: "Anime",
        active: 1,
      },
    ]),
  );
  for (const card of [...cards.values()]) {
    const other = {
      ...card,
      id: card.id + "-other",
      kind: card.kind === "character" ? "seiyuu" : "character",
    };
    cards.set(other.id, other);
  }
  e.host("catalog", { cards: [...cards.values()] });
  // Model a deterministic classified source while keeping real SQLite ownership,
  // wallet, escrow, receipt and rollback behaviour under test.
  e.catalogStore.card = (id) => cards.get(id) || null;
  e.catalogStore.pool = (kind) => ({
    cards: [...cards.values()].filter((c) => c.kind === kind),
  });
  const act = (action, b, key = crypto.randomUUID()) =>
    e.mutate("p:" + action, key, b, () => e.action("p", action, b));
  const add = (id, copies = 1, level = 1) => {
    e.addCard("p", id, copies);
    e.run(
      "UPDATE inventory SET level=? WHERE player='p' AND card=?",
      level,
      id,
    );
  };
  const material = (id, variant = "card") => ({
    card: id,
    variant,
    expectedRarity: cards.get(id).rarity || "Pending",
    expectedLevel:
      variant === "extra"
        ? 1
        : e.one("SELECT level FROM inventory WHERE player='p' AND card=?", id)
            ?.level,
  });
  const body = (rows) => ({
    cards: rows,
    expectedOdds: fusionQuote(
      rows.map((r) => ({
        rarity: cards.get(r.card).rarity,
        level: r.expectedLevel,
      })),
    ),
  });
  const sell = (id, variant = "card", key) => {
    const m = material(id, variant);
    return act(
      "sell-instant",
      { ...m, expectedPrice: instantSalePrice(cards.get(id), m.expectedLevel) },
      key,
    );
  };
  return { e, act, add, material, body, sell, cards };
}

test("sale values use half the shop tier price times the exact enhancement investment", () => {
  assert.deepEqual([1, 2, 3, 4, 20].map(cardInvestment), [1, 2, 4, 8, 524288]);
  for (let i = 0; i < RARITIES.length; i++)
    for (const level of [1, 2, 4, 20])
      assert.equal(
        instantSalePrice({ rarity: RARITIES[i] }, level),
        25 * 2 ** i * 2 ** (level - 1),
      );
  assert.equal(instantSalePrice({ rarity: null }), 25);
  assert.throws(() => instantSalePrice({ rarity: "__proto__" }), /sale price/);
  assert.throws(() => cardInvestment(21), /level/);
});
test("instant sale preserves extra levels correctly, excludes earned rankings, and cannot pay twice", () => {
  const f = fixture(),
    { e } = f;
  f.add("D", 3, 4);
  const m = f.material("D"),
    b = { ...m, expectedPrice: 200 };
  const r = f.act("sell-instant", b, "sale");
  assert.equal(r.price, 200);
  assert.deepEqual(f.act("sell-instant", b, "sale"), r);
  assert.equal(e.player("p").balance, 200);
  assert.equal(e.player("p").earned, 0);
  assert.deepEqual(
    {
      ...e.one(
        "SELECT copies,level FROM inventory WHERE player='p' AND card='D'",
      ),
    },
    { copies: 2, level: 1 },
  );
  assert.equal(f.sell("D", "extra").price, 25);
  assert.throws(() => f.sell("D", "extra"), /extra copy/);
  assert.equal(e.player("p").balance, 225);
});
test("selling a last copy cleans profile references and rejects stale quotes, foreign cards and wallet overflow atomically", () => {
  const f = fixture(),
    { e } = f;
  f.add("D");
  e.action("p", "profile", { avatar: "D" });
  e.action("p", "showcase", { cards: ["D"] });
  const b = { ...f.material("D"), expectedPrice: 25 };
  f.cards.get("D").rarity = "C";
  assert.throws(() => f.act("sell-instant", b), /changed/);
  assert.equal(e.state("p").inventory.length, 1);
  f.cards.get("D").rarity = "D";
  e.run("UPDATE players SET balance=1000000000000 WHERE id='p'");
  assert.throws(() => f.act("sell-instant", b), /limit/);
  assert.equal(e.player("p").avatar_card, "D");
  e.run("UPDATE players SET balance=0 WHERE id='p'");
  f.act("sell-instant", b);
  assert.equal(e.player("p").avatar_card, null);
  assert.equal(e.profile("p").showcase.length, 0);
  assert.throws(() => e.tx(() => e.action("q", "sell-instant", b)), /own/);
});
test("high-level AG sale values fit the wallet without truncating the invested-card payout", () => {
  const f = fixture();
  f.add("AG", 1, 20);
  assert.equal(f.sell("AG").price, 3355443200);
  assert.equal(f.e.player("p").balance, 3355443200);
});
const m = (rarity, level = 1) => ({ rarity, level });
test("fusion reserves one baseline copy, halves each lower tier and counts exact enhancement investment", () => {
  assert.equal(fusionQuote([m("S")]).upgrade, 0);
  assert.equal(fusionQuote([m("S"), m("S")]).upgrade, 5000);
  assert.equal(fusionQuote([m("S"), m("A")]).upgrade, 2500);
  assert.equal(fusionQuote([m("S"), m("B")]).upgrade, 1250);
  assert.equal(fusionQuote([m("Ubers"), m("D")]).upgrade, 39.0625);
  assert.deepEqual(fusionContribution(m("D"), 3, "B"), {
    upgrade: 5000,
    copies: 4,
  });
  assert.equal(fusionQuote([m("S", 2)]).upgrade, 5000);
  assert.equal(fusionQuote([m("S", 3)]).upgrade, 10000);
  assert.equal(fusionQuote([m("D"), m("S", 2)]).upgrade, 5312.5);
  for (const rows of [
    [m("S", 2), m("S")],
    [m("S"), m("S", 2)],
  ])
    assert.equal(fusionQuote(rows).upgrade, 10000);
  const full = fusionQuote(Array(5).fill(m("Ubers", 20)));
  assert.equal(full.upgrade, 10000);
  assert.equal(full.stay, 0);
  assert.ok(full.rawUpgrade > 10000);
  assert.equal(full.investment, 5 * 524288);
  for (const rarity of ["AG", null, "Pending"])
    assert.throws(() => fusionQuote([m(rarity)]), /AG|Pending/);
  assert.throws(() => fusionQuote(Array(6).fill(m("D"))), /five/);
});
test("conditional success split is exactly90/9/1, failures reroll baseline and top tiers cap at AG", () => {
  const q = fusionQuote([m("S"), m("S")]);
  assert.deepEqual(
    q.outcomes.map((o) => [o.rarity, o.chance]),
    [
      ["SS", 4500],
      ["SSS", 450],
      ["Ubers", 50],
    ],
  );
  const counts = {};
  for (let i = 0; i < 10000; i++) {
    const rolls = [0, i];
    const result = rollFusion(q, () => rolls.shift());
    counts[result.outcome] = (counts[result.outcome] || 0) + 1;
  }
  assert.deepEqual(counts, { upgrade: 9000, great: 900, erig: 100 });
  for (const [quality, outcome, grade] of [
    [8999, "upgrade", "SS"],
    [9000, "great", "SSS"],
    [9899, "great", "SSS"],
    [9900, "erig", "Ubers"],
    [9999, "erig", "Ubers"],
  ]) {
    const values = [0, quality];
    const result = rollFusion(q, () => values.shift());
    assert.equal(result.outcome, outcome);
    assert.equal(result.grade, grade);
  }
  assert.equal(rollFusion(q, () => 640000).outcome, "stay");
  assert.equal(rollFusion(q, () => FUSION_ROLL_SCALE - 1).grade, "S");
  assert.deepEqual(
    fusionQuote([m("SSS", 2)]).outcomes.map((o) => o.rarity),
    ["Ubers", "AG", "AG"],
  );
  assert.deepEqual(
    fusionQuote([m("Ubers", 2)]).outcomes.map((o) => o.rarity),
    ["AG", "AG", "AG"],
  );
  const fractional = fusionQuote([m("Ubers"), m("D")]);
  assert.equal(
    rollFusion(fractional, (n) => (n === FUSION_ROLL_SCALE ? 4999 : 0)).outcome,
    "upgrade",
  );
  assert.equal(rollFusion(fractional, () => 5000).outcome, "stay");
});
test("all four fusion outcomes consume materials once, grant exactly one Lv1 result and preserve credits", () => {
  for (const [roll, quality, outcome, grade] of [
    [640000, 0, "stay", "S"],
    [639999, 8999, "upgrade", "SS"],
    [0, 9000, "great", "SSS"],
    [0, 9900, "erig", "Ubers"],
  ]) {
    const f = fixture();
    f.add("S", 2);
    const values = [roll, ...(outcome === "stay" ? [] : [quality]), 0];
    f.e.rand = () => values.shift();
    const b = f.body([f.material("S"), f.material("S", "extra")]);
    const result = f.act("fusion", b, "once");
    assert.equal(result.outcome, outcome);
    assert.equal(result.cards[0].rarity, grade);
    assert.deepEqual(f.act("fusion", b, "once"), result);
    assert.equal(
      f.e.state("p").inventory.reduce((sum, i) => sum + i.copies, 0),
      1,
    );
    assert.equal(f.e.state("p").inventory[0].level, 1);
    assert.equal(f.e.player("p").balance, 0);
  }
});
test("enhanced bases contribute invested copies, spare copies stay Lv1 and consumption orders extras first", () => {
  const f = fixture();
  f.add("D", 4, 6);
  let rolls = [FUSION_ROLL_SCALE - 1, 0];
  f.e.rand = () => rolls.shift();
  f.act("fusion", f.body([f.material("D", "extra"), f.material("D", "extra")]));
  assert.deepEqual(
    {
      ...f.e.one(
        "SELECT copies,level FROM inventory WHERE player='p' AND card='D'",
      ),
    },
    { copies: 3, level: 6 },
  );
  const b = f.body([
    f.material("D"),
    f.material("D", "extra"),
    f.material("D", "extra"),
  ]);
  assert.equal(b.expectedOdds.upgrade, 10000);
  rolls = [0, 9000, 0];
  const result = f.act("fusion", b);
  assert.equal(result.cards[0].rarity, "B");
  assert.equal(
    f.e.state("p").inventory.reduce((sum, i) => sum + i.copies, 0),
    1,
  );
});
test("target draw preserves tier odds, shares exactly half within its tier and replays without consumption", () => {
  for (const coin of [0, 1]) {
    const f = fixture();
    f.cards.set("AG-second", { ...f.cards.get("AG-other"), id: "AG-second" });
    f.add("Ubers", 2);
    const b = {
      ...f.body([f.material("Ubers"), f.material("Ubers", "extra")]),
      targetCard: "AG-second",
    };
    const rolls = [0, 9900, coin, 0];
    f.e.rand = () => rolls.shift();
    const result = f.act("fusion", b, "target");
    assert.equal(result.outcome, "erig");
    assert.equal(result.cards[0].id, coin === 0 ? "AG-second" : "AG-other");
    assert.equal(result.targetHit, coin === 0);
    assert.deepEqual(f.act("fusion", b, "target"), result);
  }
  const f = fixture();
  f.cards.set("SS-second", { ...f.cards.get("SS-other"), id: "SS-second" });
  f.add("S", 2);
  const values = [0, 9900, 0];
  f.e.rand = () => values.shift();
  const result = f.act("fusion", {
    ...f.body([f.material("S"), f.material("S", "extra")]),
    targetCard: "SS-second",
  });
  assert.equal(result.outcome, "erig");
  assert.equal(result.cards[0].rarity, "Ubers");
  assert.equal(result.targetHit, false);
});
test("invalid ownership, duplicate copies, protected, stale rules/rarity/level, escrow and unavailable outcomes reject atomically", () => {
  const f = fixture();
  f.add("D", 3);
  f.add("AG");
  f.add("Pending");
  const valid = f.body([f.material("D"), f.material("D", "extra")]);
  const before = f.e.state("p").inventory;
  const attempts = [
    { cards: [f.material("D"), f.material("D")], expectedOdds: {} },
    { cards: Array(3).fill(f.material("D", "extra")), expectedOdds: {} },
    { cards: [f.material("AG")], expectedOdds: {} },
    { cards: [f.material("Pending")], expectedOdds: {} },
    { ...valid, expectedOdds: { ...valid.expectedOdds, revision: 1 } },
    { ...valid, expectedOdds: { ...valid.expectedOdds, upgrade: 9999 } },
    { ...valid, cards: valid.cards.map((x) => ({ ...x, expectedLevel: 20 })) },
    { cards: [{ card: "foreign", variant: "card" }], expectedOdds: {} },
  ];
  f.e.rand = () => {
    throw Error("Must validate before rolling");
  };
  for (const b of attempts) {
    assert.throws(() => f.act("fusion", b));
    assert.deepEqual(f.e.state("p").inventory, before);
  }
  for (const rarity of ["D", "C", "B", "A"]) {
    const pool = f.e.catalogStore.pool;
    f.e.catalogStore.pool = (kind) => ({
      cards: pool(kind).cards.filter((c) => c.rarity !== rarity),
    });
    assert.throws(
      () => f.act("fusion", valid),
      new RegExp("No " + rarity + " result"),
    );
    assert.deepEqual(f.e.state("p").inventory, before);
    f.e.catalogStore.pool = pool;
  }
  f.e.action("p", "protect-card", { card: "D", protected: true });
  assert.throws(() => f.act("fusion", valid), /protected/);
  f.e.action("p", "protect-card", { card: "D", protected: false });
  f.add("SS");
  f.act("list-card", { card: "SS", variant: "card", venue: "shop", price: 1 });
  assert.throws(
    () => f.act("fusion", { cards: [f.material("SS")], expectedOdds: {} }),
    /no longer/,
  );
});
test("invalid or singleton targets reject before rolling, same-tier reroll never uses target", () => {
  const f = fixture();
  f.add("Ubers", 2);
  const b = f.body([f.material("Ubers"), f.material("Ubers", "extra")]);
  const before = f.e.state("p").inventory;
  f.e.rand = () => {
    throw Error("Must validate before rolling");
  };
  for (const targetCard of ["missing", "AG", "SSS", "AG-other", 42, {}]) {
    assert.throws(
      () => f.act("fusion", { ...b, targetCard }),
      /target|eligible|only one/i,
    );
    assert.deepEqual(f.e.state("p").inventory, before);
  }
  f.cards.set("AG-second", { ...f.cards.get("AG-other"), id: "AG-second" });
  const rolls = [640000, 0];
  f.e.rand = () => rolls.shift();
  const result = f.act("fusion", { ...b, targetCard: "AG-second" });
  assert.equal(result.outcome, "stay");
  assert.equal(result.cards[0].rarity, "Ubers");
  assert.equal(result.targetHit, false);
});
test("fusion follows material types for every result tier and mixed boards may draw either", () => {
  for (const kind of ["character", "seiyuu"]) {
    for (const [quality, grade] of [
      [0, "C"],
      [9000, "B"],
      [9900, "A"],
    ]) {
      const f = fixture(),
        id = kind === "character" ? "D" : "D-other";
      f.add(id, 2);
      const values = [0, quality, 0];
      f.e.rand = () => values.shift();
      const result = f.act(
        "fusion",
        f.body([f.material(id), f.material(id, "extra")]),
      );
      assert.equal(result.cards[0].kind, kind);
      assert.equal(result.cards[0].rarity, grade);
    }
  }
  for (const kind of ["character", "seiyuu"]) {
    const f = fixture();
    f.add("D");
    f.add("D-other");
    let n = 0;
    f.e.rand = (max) => (n++ < 2 ? 0 : kind === "character" ? 0 : max - 1);
    const result = f.act(
      "fusion",
      f.body([f.material("D"), f.material("D-other")]),
    );
    assert.equal(result.cards[0].kind, kind);
  }
});
