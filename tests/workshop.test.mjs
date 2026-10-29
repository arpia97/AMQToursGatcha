import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  RARITIES,
  cardInvestment,
  instantSalePrice,
} from "../public/card-values.js";
import { fusionContribution, fusionQuote } from "../public/fusion-rules.js";

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
test("fusion uses the approved spread, half-tier enhancement interpolation, and continued doubling beyond Ubers", () => {
  assert.deepEqual(
    RARITIES.slice(0, -1).map((r) => fusionContribution({ rarity: r }).stay),
    [100, 200, 400, 800, 1200, 1600, 2400, 3200],
  );
  assert.deepEqual(fusionContribution({ rarity: "D" }, 2), {
    stay: 150,
    upgrade: 75,
  });
  assert.deepEqual(fusionContribution({ rarity: "D" }, 3), {
    stay: 200,
    upgrade: 100,
  });
  assert.deepEqual(fusionContribution({ rarity: "Ubers" }, 2), {
    stay: 4800,
    upgrade: 2400,
  });
  assert.deepEqual(fusionContribution({ rarity: "Ubers" }, 3), {
    stay: 6400,
    upgrade: 3200,
  });
  assert.deepEqual(fusionContribution({ rarity: "Ubers" }, 4), {
    stay: 9600,
    upgrade: 4800,
  });
  const q = fusionQuote([
    { rarity: "D", level: 5 },
    { rarity: "C", level: 1 },
  ]);
  assert.equal(q.baseline, "C");
  assert.equal(q.upgraded, "B");
  assert.equal(q.stay, 600);
  assert.equal(q.upgrade, 300);
  assert.equal(fusionQuote([{ rarity: "Ubers", level: 3 }]).upgrade, 0);
  assert.equal(fusionQuote([{ rarity: "Ubers", level: 3 }]).break, 3600);
  assert.throws(
    () =>
      fusionQuote([
        { rarity: "Ubers", level: 4 },
        { rarity: "D", level: 1 },
      ]),
    /100%/,
  );
  assert.throws(() => fusionQuote([{ rarity: "AG", level: 1 }]), /AG/);
  assert.throws(() => fusionQuote([{ rarity: null, level: 1 }]), /Pending/);
  assert.throws(
    () => fusionQuote(Array(6).fill({ rarity: "D", level: 1 })),
    /five/,
  );
});
test("fusion boundary rolls consume all copies once and return only the rolled rarity at Lv. 1", () => {
  for (const [roll, outcome, grade] of [
    [0, "stay", "Ubers"],
    [6399, "stay", "Ubers"],
    [6400, "upgrade", "AG"],
    [9599, "upgrade", "AG"],
    [9600, "break", null],
    [9999, "break", null],
  ]) {
    const f = fixture(),
      { e } = f;
    f.add("Ubers", 2);
    let rolls = [roll, 0];
    e.rand = () => rolls.shift();
    const b = f.body([f.material("Ubers"), f.material("Ubers", "extra")]);
    const r = f.act("fusion", b, "fuse");
    assert.equal(r.outcome, outcome);
    assert.equal(r.cards[0]?.rarity || null, grade);
    assert.deepEqual(f.act("fusion", b, "fuse"), r);
    assert.equal(
      e.state("p").inventory.reduce((n, c) => n + c.copies, 0),
      grade ? 1 : 0,
    );
    if (grade) assert.equal(e.state("p").inventory[0].level, 1);
    assert.equal(e.player("p").balance, 0);
  }
});
test("targeted upgrades use a separate50% draw, exclude the target from alternatives and replay without consuming again", () => {
  for (const coin of [0, 1]) {
    const f = fixture();
    f.cards.set("AG-second", {
      ...f.cards.get("AG-other"),
      id: "AG-second",
      name: "Second AG",
    });
    f.add("Ubers", 2);
    const b = {
      ...f.body([f.material("Ubers"), f.material("Ubers", "extra")]),
      targetCard: "AG-second",
    };
    const rolls = [6400, coin, 0];
    f.e.rand = () => rolls.shift();
    const result = f.act("fusion", b, "targeted");
    assert.equal(result.outcome, "upgrade");
    assert.equal(result.cards[0].id, coin === 0 ? "AG-second" : "AG-other");
    assert.equal(result.targetHit, coin === 0);
    assert.deepEqual(f.act("fusion", b, "targeted"), result);
    assert.equal(
      f.e.state("p").inventory.reduce((n, i) => n + i.copies, 0),
      1,
    );
  }
});
test("invalid, foreign-type, stale and singleton fusion targets reject before any random roll or material consumption", () => {
  const f = fixture();
  f.add("Ubers", 2);
  const b = f.body([f.material("Ubers"), f.material("Ubers", "extra")]);
  const before = f.e.state("p").inventory;
  f.e.rand = () => {
    throw Error("Must validate target before rolling");
  };
  for (const targetCard of ["missing", "AG", "SSS", "AG-other", 42, {}]) {
    assert.throws(
      () => f.act("fusion", { ...b, targetCard }),
      /target|eligible|only one/i,
    );
    assert.deepEqual(f.e.state("p").inventory, before);
  }
  const single = f.body([f.material("Ubers")]);
  assert.throws(
    () => f.act("fusion", { ...single, targetCard: "AG-other" }),
    /two materials/,
  );
});
test("target selection does not change baseline stays or break probability", () => {
  for (const roll of [0, 9600]) {
    const f = fixture();
    f.cards.set("AG-second", { ...f.cards.get("AG-other"), id: "AG-second" });
    f.add("Ubers", 2);
    const values = [roll, 0];
    f.e.rand = () => values.shift();
    const result = f.act("fusion", {
      ...f.body([f.material("Ubers"), f.material("Ubers", "extra")]),
      targetCard: "AG-second",
    });
    assert.equal(result.outcome, roll === 0 ? "stay" : "break");
    assert.equal(result.targetHit, false);
    assert.equal(result.cards[0]?.id || null, roll === 0 ? "Ubers" : null);
  }
});
test("fusion permits one-card stays, mixed types, and duplicate extras but preserves unused enhanced bases", () => {
  const f = fixture(),
    { e } = f;
  f.add("D", 4, 6);
  e.rand = () => 0;
  const b = f.body([f.material("D", "extra"), f.material("D", "extra")]);
  f.act("fusion", b);
  assert.deepEqual(
    {
      ...e.one(
        "SELECT copies,level FROM inventory WHERE player='p' AND card='D'",
      ),
    },
    { copies: 3, level: 6 },
  );
  // Two extras consumed, one Lv. 1 D replacement joins the still-enhanced base.
  const single = f.body([f.material("D", "extra")]);
  const r = f.act("fusion", single);
  assert.equal(r.odds.upgrade, 0);
  f.add("C");
  const mixed = f.act(
    "fusion",
    f.body([f.material("D", "extra"), f.material("C")]),
  );
  assert.equal(mixed.odds.baseline, "C");
  assert.equal(mixed.cards[0].kind, "character");
});
test("invalid fusion ownership, stale terms, excessive odds, missing result pools and escrow fail before consuming", () => {
  const f = fixture(),
    { e } = f;
  f.add("SSS", 2, 4);
  f.add("D", 3);
  f.add("Pending");
  f.add("AG");
  const valid = f.body([f.material("D"), f.material("D", "extra")]),
    before = e.state("p").inventory;
  const attempts = [
    {
      cards: [f.material("SSS"), f.material("SSS", "extra")],
      expectedOdds: {},
    },
    { cards: [f.material("SSS"), f.material("SSS")], expectedOdds: {} },
    {
      cards: [
        f.material("D", "extra"),
        f.material("D", "extra"),
        f.material("D", "extra"),
      ],
      expectedOdds: {},
    },
    { cards: [f.material("AG")], expectedOdds: {} },
    { cards: [f.material("Pending")], expectedOdds: {} },
    { ...valid, expectedOdds: { ...valid.expectedOdds, upgrade: 9999 } },
    { ...valid, cards: valid.cards.map((x) => ({ ...x, expectedLevel: 20 })) },
    { cards: [{ card: "foreign", variant: "card" }], expectedOdds: {} },
  ];
  for (const b of attempts) {
    assert.throws(() => f.act("fusion", b));
    assert.deepEqual(e.state("p").inventory, before);
  }
  const saved = e.catalogStore.pool;
  e.catalogStore.pool = (kind) => ({
    cards: [...f.cards.values()].filter(
      (c) => c.kind === kind && c.rarity !== "C",
    ),
  });
  assert.throws(() => f.act("fusion", valid), /No C result/);
  assert.deepEqual(e.state("p").inventory, before);
  e.catalogStore.pool = saved;
  f.add("SS");
  f.act("list-card", { card: "SS", variant: "card", venue: "shop", price: 1 });
  assert.throws(
    () =>
      f.act("fusion", {
        cards: [{ card: "SS", variant: "card" }],
        expectedOdds: {},
      }),
    /no longer/,
  );
  assert.equal(e.economy.market("shop", "seiyuu").items.length, 1);
});

test("fusion result type follows single-type materials and mixed materials can draw either type", () => {
  for (const type of ["character", "seiyuu"])
    for (const upgrade of [false, true]) {
      const f = fixture(),
        id = type === "character" ? "D" : "D-other";
      f.add(id, 2);
      let rolls = [upgrade ? 200 : 0, 0];
      f.e.rand = () => rolls.shift();
      const r = f.act(
        "fusion",
        f.body([f.material(id), f.material(id, "extra")]),
      );
      assert.equal(r.cards[0].kind, type);
      assert.equal(r.cards[0].rarity, upgrade ? "C" : "D");
    }
  for (const type of ["character", "seiyuu"]) {
    const f = fixture();
    f.add("D");
    f.add("D-other");
    let n = 0;
    f.e.rand = (max) => (n++ === 0 ? 200 : type === "character" ? 0 : max - 1);
    const r = f.act("fusion", f.body([f.material("D"), f.material("D-other")]));
    assert.equal(r.cards[0].kind, type);
    assert.equal(r.cards[0].rarity, "C");
  }
});
test("fusion never substitutes a different type if a required result tier is missing", () => {
  const f = fixture();
  f.add("D", 2);
  const before = f.e.state("p").inventory;
  const pool = f.e.catalogStore.pool;
  f.e.catalogStore.pool = (kind) => ({
    cards: pool(kind).cards.filter(
      (c) => kind !== "character" || c.rarity !== "C",
    ),
  });
  assert.throws(
    () => f.act("fusion", f.body([f.material("D"), f.material("D", "extra")])),
    /No C result/,
  );
  assert.deepEqual(f.e.state("p").inventory, before);
});
