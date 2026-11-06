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
  assert.equal(e.one("SELECT count(*) AS n FROM card_titles").n, 1);
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
  assert.match(settings, /name="card" value="community-00"/);
  assert.match(settings, /MAX Card · AG/);
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
