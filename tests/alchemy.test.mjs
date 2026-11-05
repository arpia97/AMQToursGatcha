import { ENHANCEMENT_REVISION } from "../public/card-values.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import {
  ALCHEMY_TIERS,
  refinementQuote,
  rollRefinement,
  drawAlchemyCard,
  applyAlchemyPatch,
} from "../public/alchemy-rules.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let now = 1000;
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
    () => now,
    () => 0,
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  const cards = new Map(
    ALCHEMY_TIERS.flatMap((t) =>
      [1, 2, 3].map((i) => ({
        id: t.rarity + i,
        name: t.rarity + " " + i,
        kind: i === 2 ? "seiyuu" : "character",
        rarity: t.rarity,
        series: "Local",
      })),
    ).map((c) => [c.id, c]),
  );
  e.host("catalog", { cards: [...cards.values()] });
  e.catalogStore.card = (id) => cards.get(id);
  e.catalogStore.cards = (ids) =>
    ids.map((id) => cards.get(id)).filter(Boolean);
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
  const feed = (id, variant = "card") => ({
    card: id,
    enhancementRevision: ENHANCEMENT_REVISION,
    variant,
    expectedRarity: cards.get(id).rarity,
    expectedLevel:
      variant === "extra"
        ? 1
        : e.one("SELECT level FROM inventory WHERE player='p' AND card=?", id)
            ?.level,
    expectedVersion: e.economy.alchemy.read("p").version,
    confirmed: true,
  });
  const seed = (xp, refinements = 0) =>
    e.economy.alchemy.save("p", { xp, refinements, version: 0 });
  return { e, cards, act, add, feed, seed, advance: (n) => (now += n) };
}
test("XP and draw costs double from D to AG; normal and lucky rolls have exact requested distributions", () => {
  assert.deepEqual(
    ALCHEMY_TIERS.map((t) => t.cost),
    [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800],
  );
  assert.deepEqual(
    ALCHEMY_TIERS.map((t) => t.xp),
    [15, 30, 60, 120, 240, 480, 960, 1920, 3840],
  );
  for (const [count, expected] of [
    [0, [90, 9, 1]],
    [5, [50, 45, 5]],
  ]) {
    const q = refinementQuote("D", 1, count),
      counts = [0, 0, 0];
    for (let i = 0; i < 100; i++) {
      const o = rollRefinement(q, () => i);
      counts[["success", "great", "erig"].indexOf(o.outcome)]++;
      assert.equal(o.xp, 15 * o.multiplier);
    }
    assert.deepEqual(counts, expected);
  }
  assert.equal(refinementQuote("AG", 6).baseXP, 3840 * 16);
  assert.throws(() => refinementQuote("Pending"), /classified/);
});
test("refinement consumes one physical card, credits exact XP once, and sixth glow repeats per player across restarts", (t) => {
  const f = fixture(t);
  f.add("D1", 8);
  for (let i = 0; i < 5; i++) {
    const b = f.feed("D1", "extra"),
      r = f.act("alchemy-feed", b, "feed" + i);
    assert.equal(r.lucky, false);
    assert.equal(r.xpGained, 15);
    assert.deepEqual(f.act("alchemy-feed", b, "feed" + i), r);
  }
  const restarted = new Engine(f.e.db, f.e.transaction, f.e.now, () => 50);
  restarted.catalogStore.card = (id) => f.cards.get(id);
  restarted.catalogStore.cards = (ids) => ids.map((id) => f.cards.get(id));
  const b = f.feed("D1", "extra");
  const result = restarted.mutate("p:alchemy-feed", "sixth", b, () =>
    restarted.action("p", "alchemy-feed", b),
  );
  assert.equal(result.lucky, true);
  assert.equal(result.label, "Great Success");
  assert.equal(result.xpGained, 30);
  assert.equal(result.alchemyState.xp, 105);
  assert.equal(result.alchemyState.refinements, 6);
  assert.equal(result.alchemyState.nextLucky, false);
  assert.equal(f.e.player("p").balance, 0);
  assert.equal(f.e.player("p").earned, 0);
  assert.equal(f.e.economy.alchemy.read("q").xp, 0);
  assert.equal(
    f.e.one("SELECT copies FROM inventory WHERE player='p' AND card='D1'")
      .copies,
    2,
  );
});
test("enhanced bases contribute invested XP, spare copies drop to Lv1, extras retain enhanced base, and patches update only touched cards", (t) => {
  const f = fixture(t);
  f.add("AG1", 3, 4);
  f.add("B1");
  let r = f.act("alchemy-feed", f.feed("AG1", "extra"));
  assert.equal(r.xpGained, 3840);
  assert.equal(
    f.e.one("SELECT level FROM inventory WHERE player='p' AND card='AG1'")
      .level,
    4,
  );
  f.e.rand = () => 99;
  r = f.act("alchemy-feed", f.feed("AG1"));
  assert.equal(r.xpGained, 3840 * 7 * 5);
  assert.equal(r.material.investment, 7);
  const item = f.e.one(
    "SELECT * FROM inventory WHERE player='p' AND card='AG1'",
  );
  assert.equal(item.level, 1);
  assert.equal(item.copies, 1);
  const state = {
    me: f.e.player("p"),
    inventory: [
      { card: "AG1", copies: 2, level: 4 },
      { card: "B1", copies: 1, level: 1 },
    ],
    showcase: [],
    roles: {},
  };
  const next = applyAlchemyPatch(state, r);
  assert.equal(next.inventory.find((i) => i.card === "AG1").level, 1);
  assert.equal(next.inventory.find((i) => i.card === "B1").copies, 1);
  assert.equal(next.me.balance, state.me.balance);
});
test("unconfirmed, protected, stale, duplicate, unavailable and overflowing refinements reject without card or XP changes", (t) => {
  const f = fixture(t);
  f.add("D1", 2);
  const snapshot = () =>
    JSON.stringify({
      inventory: f.e.all("SELECT * FROM inventory"),
      xp: f.e.economy.alchemy.read("p"),
    });
  const b = f.feed("D1", "extra");
  for (const wrong of [
    { ...b, confirmed: false },
    { ...b, expectedVersion: 9 },
    { ...b, expectedRarity: "AG" },
    { ...b, expectedLevel: 2 },
    { ...b, card: "D2" },
    { ...b, variant: "wrong" },
  ]) {
    const before = snapshot();
    assert.throws(() => f.act("alchemy-feed", wrong));
    assert.equal(snapshot(), before);
  }
  f.e.run("UPDATE inventory SET protected=1 WHERE player='p'");
  assert.throws(() => f.act("alchemy-feed", b), /protected/);
  f.e.run("UPDATE inventory SET protected=0 WHERE player='p'");
  f.seed(Number.MAX_SAFE_INTEGER - 1);
  const before = snapshot();
  assert.throws(
    () => f.act("alchemy-feed", f.feed("D1", "extra")),
    /Spend some/,
  );
  assert.equal(snapshot(), before);
  f.seed(0);
  const old = f.feed("D1", "extra");
  f.act("alchemy-feed", old);
  assert.throws(() => f.act("alchemy-feed", old), /changed/);
  assert.equal(f.e.economy.alchemy.read("p").xp, 15);
});
test("each tier saves its own target and cash-outs spend only required XP with exactly half target mass", (t) => {
  const f = fixture(t);
  f.seed(20000, 5);
  for (const tier of ALCHEMY_TIERS)
    f.act("alchemy-target", {
      rarity: tier.rarity,
      card: tier.rarity + "2",
      expectedVersion: f.e.economy.alchemy.read("p").version,
    });
  assert.equal(Object.keys(f.e.economy.alchemy.state("p").targets).length, 9);
  const b = {
    rarity: "AG",
    targetCard: "AG2",
    expectedVersion: f.e.economy.alchemy.read("p").version,
    confirmed: true,
  };
  const r = f.act("alchemy-draw", b, "draw");
  assert.equal(r.cards[0].id, "AG2");
  assert.equal(r.targetHit, true);
  assert.equal(r.alchemyState.xp, 7200);
  assert.equal(r.alchemyState.refinements, 5);
  assert.equal(r.alchemyState.nextLucky, true);
  assert.deepEqual(f.act("alchemy-draw", b, "draw"), r);
  assert.equal(
    f.e.one("SELECT copies FROM inventory WHERE player='p' AND card='AG2'")
      .copies,
    1,
  );
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }],
    mass = { a: 0, b: 0, c: 0 };
  for (let first = 0; first < 2; first++)
    for (let second = 0; second < 2; second++) {
      let count = 0;
      mass[
        drawAlchemyCard(pool, pool[0], () => (count++ === 0 ? first : second))
          .id
      ]++;
    }
  assert.deepEqual(mass, { a: 2, b: 1, c: 1 });
});
test("draws support random combined pools, stale target protection and missing pools without XP loss", (t) => {
  const f = fixture(t);
  f.seed(100);
  const target = f.act("alchemy-target", {
    rarity: "D",
    card: "D2",
    expectedVersion: 0,
  });
  const b = {
    rarity: "D",
    targetCard: "D2",
    expectedVersion: target.alchemyState.version,
    confirmed: true,
  };
  f.cards.get("D2").rarity = "C";
  assert.throws(() => f.act("alchemy-draw", b), /target changed/);
  assert.equal(f.e.economy.alchemy.read("p").xp, 100);
  f.act("alchemy-target", {
    rarity: "D",
    card: null,
    expectedVersion: b.expectedVersion,
  });
  f.e.rand = (n) => n - 1;
  const r = f.act("alchemy-draw", {
    rarity: "D",
    targetCard: null,
    expectedVersion: f.e.economy.alchemy.read("p").version,
    confirmed: true,
  });
  assert.equal(r.xpSpent, 50);
  assert.equal(r.alchemyState.xp, 50);
  for (const c of f.cards.values()) if (c.rarity === "D") c.rarity = "C";
  assert.throws(
    () =>
      f.act("alchemy-draw", {
        rarity: "D",
        targetCard: null,
        expectedVersion: r.alchemyState.version,
        confirmed: true,
      }),
    /no available/,
  );
  assert.equal(f.e.economy.alchemy.read("p").xp, 50);
});
test("alchemy progress and targets migrate with canonical identity and gameplay resets clear only that player", (t) => {
  const f = fixture(t);
  f.seed(500, 5);
  f.act("alchemy-target", { rarity: "A", card: "A1", expectedVersion: 0 });
  new AliasSync(f.e).renamePlayer("p", "90001");
  assert.equal(f.e.economy.alchemy.state("90001").xp, 500);
  assert.equal(f.e.economy.alchemy.state("90001").targets.A, "A1");
  f.e.tx(() =>
    f.e.host("reset-player", {
      player: "90001",
      confirmation: "RESET PLAYER 90001",
    }),
  );
  assert.equal(f.e.economy.alchemy.state("90001").xp, 0);
  assert.equal(f.e.economy.alchemy.state("90001").refinements, 0);
  assert.deepEqual(f.e.economy.alchemy.state("90001").targets, {});
  assert.equal(f.e.player("90001").balance, 5000);
  assert.equal(f.e.catalogStore.pool("character").cards.length, 18);
});

test("ordered batch refinements roll each card at its own position, retain enhanced copy values and replay once", (t) => {
  const f = fixture(t);
  f.seed(0, 4);
  f.add("D1", 3, 3);
  f.e.rand = () => 50;
  const b = {
    confirmed: true,
    expectedVersion: 0,
    enhancementRevision: ENHANCEMENT_REVISION,
    materials: [
      { card: "D1", variant: "card", expectedRarity: "D", expectedLevel: 3 },
      { card: "D1", variant: "extra", expectedRarity: "D", expectedLevel: 1 },
      { card: "D1", variant: "card", expectedRarity: "D", expectedLevel: 1 },
    ],
  };
  const r = f.act("alchemy-feed", b, "batch");
  assert.deepEqual(
    r.refinements.map((x) => x.lucky),
    [false, true, false],
  );
  assert.deepEqual(
    r.refinements.map((x) => x.xpGained),
    [60, 30, 15],
  );
  assert.equal(r.xpGained, 105);
  assert.equal(r.alchemyState.refinements, 7);
  assert.equal(r.alchemyState.version, 3);
  assert.equal(
    f.e.one("SELECT * FROM inventory WHERE player='p' AND card='D1'"),
    undefined,
  );
  assert.deepEqual(f.act("alchemy-feed", b, "batch"), r);
  assert.equal(r.collectionPatch.inventory.length, 1);
});
test("a failure later in an alchemy batch rolls back all earlier consumption, XP and lucky progression", (t) => {
  const f = fixture(t);
  f.add("D1", 2);
  f.add("D2");
  f.e.run("UPDATE inventory SET protected=1 WHERE player='p' AND card='D2'");
  const b = {
    confirmed: true,
    expectedVersion: 0,
    enhancementRevision: ENHANCEMENT_REVISION,
    materials: [
      { card: "D1", variant: "extra", expectedRarity: "D", expectedLevel: 1 },
      { card: "D2", variant: "card", expectedRarity: "D", expectedLevel: 1 },
    ],
  };
  assert.throws(() => f.act("alchemy-feed", b), /protected/);
  assert.equal(
    f.e.one("SELECT copies FROM inventory WHERE player='p' AND card='D1'")
      .copies,
    2,
  );
  assert.equal(f.e.economy.alchemy.read("p").xp, 0);
  assert.equal(f.e.economy.alchemy.read("p").refinements, 0);
  assert.throws(
    () => f.act("alchemy-feed", { ...b, confirmed: false }),
    /confirm/,
  );
});

test("wishlist targets use only the signed-in player's active cards before type, search and pagination; draw odds remain unchanged", (t) => {
  const f = fixture(t),
    alchemy = f.e.economy.alchemy;
  for (let i = 0; i < 16; i++) {
    const c = {
      id: "wish" + i,
      name: "Wish " + String(i).padStart(2, "0"),
      rarity: "D",
      kind: i === 15 ? "seiyuu" : "character",
    };
    f.cards.set(c.id, c);
    f.e.economy.wishlist.change("p", { card: c.id, wanted: true });
  }
  f.e.economy.wishlist.change("q", { card: "D1", wanted: true });
  f.cards.set("inactive", {
    id: "inactive",
    name: "Inactive",
    rarity: "D",
    kind: "character",
    active: 0,
  });
  f.e.economy.wishlist.change("p", { card: "inactive", wanted: true });
  f.e.economy.wishlist.change("p", { card: "C1", wanted: true });
  const options = { rarity: "D", wishlistOnly: true };
  assert.throws(() => alchemy.targetsPage(options), { status: 401 });
  const before = alchemy.pool("D").length;
  const pool = f.e.catalogStore.pool;
  f.e.catalogStore.pool = () => {
    throw Error("Wishlist search should not scan the full pool");
  };
  let result = alchemy.targetsPage(options, "p");
  assert.equal(result.total, 16);
  assert.equal(result.cards.length, 12);
  assert.equal(result.hasMore, true);
  assert.ok(result.cards.every((c) => c.id.startsWith("wish")));
  result = alchemy.targetsPage({ ...options, page: 2 }, "p");
  assert.equal(result.cards.length, 4);
  assert.equal(result.hasMore, false);
  assert.equal(
    alchemy.targetsPage({ ...options, kind: "seiyuu" }, "p").total,
    1,
  );
  assert.equal(
    alchemy.targetsPage({ ...options, query: "Wish 03" }, "p").cards[0].id,
    "wish3",
  );
  assert.deepEqual(
    alchemy.targetsPage(options, "q").cards.map((c) => c.id),
    ["D1"],
  );
  f.e.economy.wishlist.change("p", { card: "wish3", wanted: false });
  assert.equal(
    alchemy.targetsPage({ ...options, query: "Wish 03" }, "p").total,
    0,
  );
  assert.equal(
    alchemy.targetsPage({ rarity: "AG", wishlistOnly: true }, "p").total,
    0,
  );
  f.e.catalogStore.pool = pool;
  assert.equal(alchemy.pool("D").length, before);
  assert.ok(alchemy.targetsPage({ rarity: "D" }).total > 16);
});
