import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AliasSync } from "../src/aliases.js";
import { cardTitleName } from "../src/card-titles.js";
import { ENHANCEMENT_REVISION } from "../public/card-values.js";
import { titleBadges, titleSettingsPanel } from "../public/title-ui.js";
import { animeChecklist } from "../public/anime-checklist-ui.js";
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const make = () =>
    new Engine(
      (s, ...a) => db.prepare(s).all(...a),
      (fn) => {
        db.exec("BEGIN");
        try {
          const r = fn();
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
      () => 1794000000000,
      () => 0,
    );
  const e = make();
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.host("catalog", {
    cards: Array.from({ length: 30 }, (_, i) => ({
      id: "community-" + String(i).padStart(2, "0"),
      kind: "character",
      name: i === 0 ? "Miyafuji, Yoshika" : "Character " + i,
      series: "Anime",
      series_english: "English Anime",
      fixedRarity: i === 0 ? "AG" : "SSS",
    })),
  });
  const act = (a, b, key = crypto.randomUUID()) =>
    e.mutate("p:" + a, key, b, () => e.action("p", a, b));
  return { db, e, make, act };
}
test("MAX enhancement awards a rarity title atomically, once, and keeps it after the card leaves", (t) => {
  const { e, act, make } = fixture(t);
  e.addCard("p", "community-00");
  e.run("UPDATE inventory SET level=5,copies=6 WHERE player='p'");
  const body = {
    card: "community-00",
    expectedLevel: 5,
    enhancementRevision: ENHANCEMENT_REVISION,
  };
  const result = act("enhance", body, "max-once");
  assert.match(result.message, /Yoshika Miyafuji/);
  assert.deepEqual(act("enhance", body, "max-once"), result);
  assert.equal(e.one("SELECT count(*) AS n FROM card_title_awards").n, 1);
  assert.equal(e.quiz.titles("p")[0].rarity, "AG");
  assert.equal(e.quiz.titles("p")[0].title, "Yoshika Miyafuji");
  assert.equal(
    e.one("SELECT copies FROM inventory WHERE player='p'").copies,
    1,
  );
  e.run("DELETE FROM inventory WHERE player='p'");
  assert.equal(make().quiz.titles("p")[0].title, "Yoshika Miyafuji");
  assert.equal(e.quiz.titles("q").length, 0);
  assert.equal(cardTitleName("Iwami, Manaka"), "Manaka Iwami");
  assert.equal(cardTitleName("No Comma"), "No Comma");
  assert.equal(cardTitleName(" Last, First,  "), "First Last");
});
test("failed enhancement cannot award a title or consume copies", (t) => {
  const { e, act } = fixture(t);
  e.addCard("p", "community-00");
  e.run("UPDATE inventory SET level=5,copies=5 WHERE player='p'");
  assert.throws(
    () =>
      act("enhance", {
        card: "community-00",
        expectedLevel: 5,
        enhancementRevision: ENHANCEMENT_REVISION,
      }),
    /5 extra/,
  );
  assert.equal(e.cardTitles.options("p").length, 0);
  assert.equal(
    e.one("SELECT copies FROM inventory WHERE player='p'").copies,
    5,
  );
});
test("MAX catch-up includes held/escrowed cards once and gameplay reset clears awards permanently", (t) => {
  const { e, make } = fixture(t);
  for (let i = 0; i < 5; i++) e.addCard("p", "community-0" + i);
  e.run("UPDATE inventory SET level=6 WHERE player='p'");
  e.action("p", "list-card", {
    card: "community-01",
    variant: "card",
    venue: "shop",
    price: 100,
  });
  e.action("p", "list-card", {
    card: "community-02",
    variant: "card",
    venue: "auction",
    price: 100,
    days: 1,
  });
  e.economy.trades.action("p", "trade-list", {
    card: "community-03",
    variant: "card",
    expectedLevel: 6,
  });
  e.addCard("q", "community-29");
  const listing = e.economy.trades.action("q", "trade-list", {
    card: "community-29",
    variant: "card",
    expectedLevel: 1,
  }).listing;
  e.economy.trades.action("p", "trade-offer", {
    listing,
    cards: [{ card: "community-04", variant: "card", expectedLevel: 6 }],
  });
  // The new feature catches up only once; reconstruct the pre-feature marker state locally.
  e.run("DELETE FROM catalog_meta WHERE key='max-card-titles-v1'");
  const restored = make();
  assert.equal(restored.cardTitles.options("p").length, 5);
  assert.equal(make().cardTitles.options("p").length, 5);
  restored.tx(() =>
    restored.host("reset-player", {
      player: "p",
      confirmation: "RESET PLAYER p",
    }),
  );
  assert.equal(make().cardTitles.options("p").length, 0);
  assert.ok(e.catalogStore.card("community-00"));
});
test("card title equipment is independent of quiz titles, host titles and alias migrations", (t) => {
  const { e, act, make } = fixture(t);
  e.cardTitles.award("p", "community-00");
  e.run(
    "INSERT INTO quizzes(id,name,cover,title,published,source,updated) VALUES('quiz','Quiz','','Listener',1,'',1)",
  );
  e.run(
    "INSERT INTO quiz_progress(player,quiz,best,at) VALUES('p','quiz',20,1)",
  );
  act("equip-titles", { quizzes: ["quiz"], cards: [] });
  assert.deepEqual(e.quiz.titles("p"), [{ quiz: "quiz", title: "Listener" }]);
  assert.equal(make().cardTitles.options("p")[0].equipped, false);
  assert.throws(
    () => act("equip-titles", { quizzes: ["quiz"], cards: ["community-01"] }),
    /earned/,
  );
  act("equip-titles", { quizzes: [], cards: ["community-00"] });
  const html = titleBadges(
    { role: "Host", titles: e.quiz.titles("p") },
    escape,
  );
  assert.ok(html.indexOf("Host") < html.indexOf("Yoshika Miyafuji"));
  assert.match(html, /card-earned-title tier-ag/);
  const settings = titleSettingsPanel(e.quiz.titleSettings("p"), escape);
  assert.match(settings, /name="award"/);
  assert.match(settings, /MAX Character Card/);
  assert.doesNotMatch(settings, /MAX Card · AG/);
  e.quiz.resetScores({
    quiz: "quiz",
    confirmation: "RESET QUIZ SCORES AND TITLES",
  });
  assert.equal(e.quiz.titles("p").length, 1);
  e.tx(() => new AliasSync(e).renamePlayer("p", "12345"));
  assert.equal(e.quiz.titles("12345")[0].title, "Yoshika Miyafuji");
  assert.equal(e.cardTitles.options("p").length, 0);
});
test("anime checklists paginate primary-series cards with unique escrow ownership and independent wishlists", (t) => {
  const { e, act } = fixture(t);
  for (let i = 0; i < 4; i++) e.addCard("p", "community-0" + i);
  e.action("p", "list-card", {
    card: "community-01",
    variant: "card",
    venue: "shop",
    price: 100,
  });
  e.action("p", "list-card", {
    card: "community-02",
    variant: "card",
    venue: "auction",
    price: 100,
    days: 1,
  });
  e.economy.trades.action("p", "trade-list", {
    card: "community-03",
    variant: "card",
    expectedLevel: 1,
  });
  const first = e.economy.anime.checklist("p", "anime"),
    last = e.economy.anime.checklist("p", "anime", 2);
  assert.equal(first.total, 30);
  assert.equal(first.owned, 4);
  assert.equal(first.cards.length, 24);
  assert.equal(first.hasMore, true);
  assert.equal(last.cards.length, 6);
  assert.equal(last.hasMore, false);
  assert.equal(
    new Set([...first.cards, ...last.cards].map((c) => c.id)).size,
    30,
  );
  assert.equal(first.cards.filter((c) => c.owned).length, 4);
  assert.equal(e.economy.anime.checklist("q", "anime").owned, 0);
  act("wishlist", { card: "community-29", wanted: true });
  assert.ok(e.economy.wishlist.read("p").includes("community-29"));
  assert.equal(e.economy.wishlist.read("q").length, 0);
  const html = animeChecklist(last, {
    escape,
    cardHTML: (c) => "<article>" + escape(c.name) + "</article>",
    wishlist: e.economy.wishlist.read("p"),
    titleMode: "english",
  });
  assert.match(html, /English Anime/);
  assert.match(html, /is-missing/);
  assert.match(html, /♥ Wishlisted/);
  assert.throws(
    () => e.economy.anime.checklist("p", "absent"),
    /not in the catalogue/,
  );
  assert.throws(
    () => e.economy.anime.checklist("p", "anime", 0),
    /whole number/,
  );
});

test("each separate MAX enhancement earns a distinct title, retries do not, and matching quiz names remain independent", (t) => {
  const { e, act, make } = fixture(t);
  const card = "community-actor";
  e.host("catalog", {
    cards: [
      { id: card, kind: "seiyuu", name: "Touyama, Nao", fixedRarity: "Ubers" },
    ],
  });
  function max(key) {
    e.addCard("p", card, 16);
    for (let level = 1; level < 6; level++) {
      const b = {
        card,
        expectedLevel: level,
        enhancementRevision: ENHANCEMENT_REVISION,
      };
      const result = act("enhance", b, key + "-" + level);
      assert.deepEqual(act("enhance", b, key + "-" + level), result);
    }
  }
  max("first");
  e.action("p", "list-card", {
    card,
    variant: "card",
    venue: "shop",
    price: 100,
  });
  max("second");
  const awards = e.cardTitles.options("p");
  assert.equal(awards.length, 2);
  assert.notEqual(awards[0].award, awards[1].award);
  assert.ok(
    awards.every(
      (a) =>
        a.title === "Nao Touyama" &&
        a.rarity === "Ubers" &&
        a.kind === "seiyuu",
    ),
  );
  e.run(
    "INSERT INTO quizzes(id,name,cover,title,published,source,updated) VALUES('same','Nao Touyama','','Nao Touyama',1,'',1)",
  );
  e.run(
    "INSERT INTO quiz_progress(player,quiz,best,at) VALUES('p','same',20,1)",
  );
  act("equip-titles", { quizzes: ["same"], awards: [awards[0].award] });
  let shown = e.quiz.titles("p");
  assert.equal(shown.length, 2);
  assert.equal(shown.filter((t) => t.source === "card").length, 1);
  assert.ok(shown.every((t) => t.title === "Nao Touyama"));
  const html = titleBadges({ role: "Host", titles: shown }, escape);
  assert.match(html, /quiz-earned-title/);
  assert.match(html, /card-earned-title tier-ubers/);
  assert.equal((html.match(/>Nao Touyama<\/span>/g) || []).length, 2);
  const panel = titleSettingsPanel(e.quiz.titleSettings("p"), escape);
  assert.match(panel, /Award 1 of 2/);
  assert.match(panel, /Award 2 of 2/);
  assert.doesNotMatch(panel, />Ubers<|>QUIZ<|♫|♬|✧/);
  assert.throws(
    () => act("equip-titles", { quizzes: [], awards: ["foreign"] }),
    /earned/,
  );
  // Old clients preserve per-award settings when omitting cards, or select all copies by card ID.
  act("equip-titles", { quizzes: [] });
  assert.equal(e.quiz.titles("p").length, 1);
  act("equip-titles", { quizzes: [], cards: [card] });
  assert.equal(e.quiz.titles("p").length, 2);
  const restarted = make();
  assert.equal(restarted.cardTitles.options("p").length, 2);
  assert.equal(restarted.quiz.titles("p").length, 2);
  e.host("catalog", {
    cards: [
      { id: card, kind: "seiyuu", name: "Touyama, Nao", fixedRarity: "SSS" },
    ],
  });
  assert.ok(e.cardTitles.options("p").every((a) => a.rarity === "SSS"));
  // Cosmetic rarity refreshes never affect existing cards, listings, credits or quizzes.
  assert.equal(
    e.one("SELECT level FROM inventory WHERE player='p' AND card=?", card)
      .level,
    6,
  );
  assert.equal(
    e.one("SELECT level FROM market_listings WHERE seller='p'").level,
    6,
  );
});
test("title-award migration preserves visibility, recovers only evidenced repeats, and runs once across reset/restart", (t) => {
  const { e, make } = fixture(t);
  e.run(
    "INSERT INTO card_titles VALUES('p','community-00','Yoshika Miyafuji','AG',100,1)",
  );
  for (const [key, card, at, expectedLevel, message] of [
    ["before", "community-00", 50, 5, "Enhanced to MAX."],
    [
      "first",
      "community-00",
      100,
      5,
      "Enhanced to MAX. Title Unlocked: Yoshika Miyafuji.",
    ],
    [
      "repeat",
      "community-00",
      200,
      5,
      "Enhanced to MAX. Title Unlocked: Yoshika Miyafuji.",
    ],
    ["not-max", "community-00", 300, 4, "Enhanced to level 5."],
    ["other", "community-01", 400, 5, "Enhanced to MAX."],
  ])
    e.run(
      "INSERT INTO receipts VALUES(?,?,?,?,?)",
      "p:enhance",
      key,
      JSON.stringify({ card, expectedLevel }),
      JSON.stringify({ message }),
      at,
    );
  // A player's old receipts without a retained award are outside this migration's evidence.
  e.run(
    "INSERT INTO receipts VALUES(?,?,?,?,?)",
    "q:enhance",
    "old-reset",
    JSON.stringify({ card: "community-00", expectedLevel: 5 }),
    JSON.stringify({ message: "Enhanced to MAX." }),
    200,
  );
  e.run("DELETE FROM catalog_meta WHERE key='card-title-awards-v2'");
  const upgraded = make(),
    awards = upgraded.cardTitles.options("p");
  assert.equal(awards.length, 2);
  assert.ok(awards.every((a) => !a.equipped));
  assert.deepEqual(
    awards.map((a) => a.award),
    ["legacy:community-00", "receipt:repeat"],
  );
  assert.equal(upgraded.cardTitles.options("q").length, 0);
  assert.equal(make().cardTitles.options("p").length, 2);
  const marker = JSON.parse(
    upgraded.one(
      "SELECT value FROM catalog_meta WHERE key='card-title-awards-v2'",
    ).value,
  );
  assert.equal(marker.preserved, 1);
  assert.equal(marker.recovered, 1);
  upgraded.tx(() =>
    upgraded.host("reset-player", {
      player: "p",
      confirmation: "RESET PLAYER p",
    }),
  );
  assert.equal(make().cardTitles.options("p").length, 0);
});
test("same text from distinct card IDs keeps each rarity, and award IDs survive canonical migration", (t) => {
  const { e } = fixture(t);
  e.host("catalog", {
    cards: [
      {
        id: "community-01",
        kind: "character",
        name: "Miyafuji, Yoshika",
        series: "Other Anime",
        fixedRarity: "C",
      },
    ],
  });
  e.cardTitles.award("p", "community-00");
  e.cardTitles.award("p", "community-01");
  const before = e.cardTitles.options("p");
  assert.deepEqual(
    before.map((t) => t.title),
    ["Yoshika Miyafuji", "Yoshika Miyafuji"],
  );
  assert.deepEqual(new Set(before.map((t) => t.rarity)), new Set(["AG", "C"]));
  e.tx(() => new AliasSync(e).renamePlayer("p", "12345"));
  assert.deepEqual(
    new Set(e.cardTitles.options("12345").map((t) => t.award)),
    new Set(before.map((t) => t.award)),
  );
  assert.equal(e.cardTitles.options("p").length, 0);
});
