import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { SpecialPack, S_AND_UP_RARITIES } from "../src/special-pack.js";
import { createPackReveal } from "../public/pack-reveal.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  let time = Date.UTC(2026, 10, 10),
    seed = 1234567;
  const rand = (n) => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
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
    () => time,
    rand,
  );

  e.host("players", {
    players: [
      { id: "player1", name: "Player One" },
      { id: "player2", name: "Player Two" },
    ],
  });

  // Seed catalogue with characters and seiyuus across various rarities
  const cards = [];
  const rarities = ["AG", "Ubers", "SSS", "SS", "S", "A", "B", "C", "D"];
  for (let i = 0; i < 40; i++) {
    const rarity = rarities[i % rarities.length];
    cards.push({
      id: "community-character-" + i,
      kind: "character",
      name: "Char " + i,
      series: "Series A",
      fixedRarity: rarity,
    });
  }
  for (let i = 0; i < 40; i++) {
    const rarity = rarities[i % rarities.length];
    cards.push({
      id: "community-person-" + i,
      kind: "seiyuu",
      name: "Seiyuu " + i,
      series: "Series B",
      fixedRarity: rarity,
    });
  }
  e.host("catalog", { cards });
  return { e, db };
}

test("special pack draws 1 AG and 4 cards S-and-up with 50/50 kind split", () => {
  const { e } = fixture();
  const pack = new SpecialPack(e);

  const draws = pack.drawFive();
  assert.equal(draws.length, 5);

  // Card 1 must be AG
  assert.equal(draws[0].rarity, "AG");

  // Cards 2-5 must be S and up
  for (let i = 1; i < 5; i++) {
    assert.ok(
      S_AND_UP_RARITIES.includes(draws[i].rarity),
      `Card ${i} rarity was ${draws[i].rarity}, expected one of ${S_AND_UP_RARITIES.join(",")}`,
    );
  }

  // Over many random draws, verify 50% character / 50% seiyuu distribution
  let charCount = 0;
  let seiyuuCount = 0;
  const trials = 1000;
  for (let t = 0; t < trials; t++) {
    const card = pack.drawCard(S_AND_UP_RARITIES, new Set());
    if (card.kind === "character") charCount++;
    else if (card.kind === "seiyuu") seiyuuCount++;
  }
  const charPct = (charCount / trials) * 100;
  // Should be close to 50%
  assert.ok(charPct >= 40 && charPct <= 60, `Character % was ${charPct}%`);
});

test("special pack is granted once per registered player and updates inventory and state", () => {
  const { e } = fixture();

  // Guest has no state special pack
  const guestState = e.state(null);
  assert.equal(guestState.specialPack, null);

  // Player 1 has special pack granted (e.g. by worker on refresh / login)
  e.economy.specialPack.ensureGranted("player1");
  const state1 = e.state("player1");
  assert.ok(state1.specialPack);
  assert.equal(state1.specialPack.cards.length, 5);
  assert.equal(state1.specialPack.cards[0].rarity, "AG");
  for (let i = 1; i < 5; i++) {
    assert.ok(S_AND_UP_RARITIES.includes(state1.specialPack.cards[i].rarity));
  }

  // Inventory has all 5 cards
  const inv = state1.inventory;
  const grantedIds = state1.specialPack.cards.map((c) => c.id);
  assert.equal(inv.length, 5);
  for (const id of grantedIds) {
    assert.ok(inv.some((i) => i.card === id));
  }

  // Second state request before marking seen still returns the popup
  const state1Repeat = e.state("player1");
  assert.ok(state1Repeat.specialPack);
  assert.equal(state1Repeat.inventory.length, 5); // Cards were NOT granted again!

  // Player marks pack seen
  const seenRes = e.action("player1", "special-pack-seen", {});
  assert.equal(seenRes.ok, true);

  // Subsequent state requests do not return specialPack
  const state1Seen = e.state("player1");
  assert.equal(state1Seen.specialPack, null);
  assert.equal(state1Seen.inventory.length, 5); // Inventory still has cards
});

test("player reset clears special_packs table for that player", () => {
  const { e } = fixture();

  // Grant to player1
  e.economy.specialPack.ensureGranted("player1");
  e.state("player1");
  e.action("player1", "special-pack-seen", {});
  assert.equal(e.state("player1").specialPack, null);

  // Reset player1
  e.host("reset-player", {
    player: "player1",
    confirmation: "RESET PLAYER player1",
  });

  // Now player1 gets special pack again on new lifecycle
  e.economy.specialPack.ensureGranted("player1");
  const resetState = e.state("player1");
  assert.ok(resetState.specialPack);
  assert.equal(resetState.specialPack.cards.length, 5);
});

test("pack reveal renders special pack cinematic and results with collection button", () => {
  const views = [];
  const cards = [
    { id: "ag-card", name: "AG Hero", rarity: "AG" },
    { id: "s-card-1", name: "S Card 1", rarity: "S" },
    { id: "s-card-2", name: "S Card 2", rarity: "SS" },
    { id: "s-card-3", name: "S Card 3", rarity: "SSS" },
    { id: "s-card-4", name: "S Card 4", rarity: "Ubers" },
  ];
  const state = {
    settings: {},
    inventory: cards.map((c) => ({
      card: c.id,
      copies: 1,
      level: 1,
      protected: false,
    })),
    showcase: [],
  };

  const reveal = createPackReveal({
    modal: (html) => views.push(html),
    cardHTML: (c, a, b, actions) => `<article id="${c.id}">${c.name}${actions}</article>`,
    escape: String,
    number: String,
    getState: () => state,
    motionControl: () => "<label>Animations</label>",
  });

  reveal.show({ cards }, { special: true });
  // Sealed cinematic
  assert.match(views.at(-1), /aura-ag/);
  assert.match(views.at(-1), /SPECIAL BONUS PACK/);
  assert.match(views.at(-1), /A Special Gift For You/);
  assert.match(views.at(-1), /1 AG guaranteed/);

  // Reveal results
  reveal.reveal();
  assert.match(views.at(-1), /SPECIAL BONUS PACK/);
  assert.match(views.at(-1), /href="#collection"/);
  assert.match(views.at(-1), /Continue/);
  assert.equal((views.at(-1).match(/<article id=/g) || []).length, 5);
});
