import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { searchTerms, searchMatcher } from "../public/search.js";
import { searchSql } from "../src/search.js";
import { collectionView } from "../public/card-display.js";
import { batchSaleQuote } from "../public/card-management.js";
import { matchingCreditPlayers } from "../public/host-credit-ui.js";
import { fusionOutcomesPage } from "../public/fusion-outcomes.js";
import { quizAnswerOptions } from "../public/quiz-autocomplete.js";

const queries = [
  "Iwami, Manaka",
  "Iwami Manaka",
  "Manaka Iwami",
  "Manaka, Iwami",
  "  MANAKA ,  Iwami ",
  "mana iwa",
];
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
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
  );
  const actor = {
    id: "mal-person-1",
    kind: "seiyuu",
    name: "Iwami, Manaka",
    series: "Anime, Example",
    rarity: "A",
    image: "https://example.com/a.jpg",
  };
  const character = {
    ...actor,
    id: "mal-character-1",
    kind: "character",
    role: "main",
  };
  e.host("players", {
    players: [
      { id: "p", name: "Iwami, Manaka", aliases: ["Old, Name"] },
      { id: "q", name: "Someone Else" },
    ],
  });
  e.host("catalog", { cards: [actor] });
  e.catalogStore.tenrai.upsert([character]);
  return { e, actor, character };
}
test("comma-separated names match either order with partial words, case and whitespace, while punctuation remains literal", () => {
  const match = searchMatcher("Manaka, Iwami");
  assert.equal(match("Iwami,Manaka"), true);
  assert.equal(match("Iwami, Other"), false);
  assert.equal(searchMatcher(" , ")("anything"), true);
  assert.deepEqual(searchTerms("Iwami, Iwami Manaka"), ["iwami", "manaka"]);
  for (const q of queries)
    assert.equal(searchMatcher(q)("Iwami, Manaka"), true, q);
  assert.equal(searchMatcher("%_")("ordinary name"), false);
  assert.equal(searchMatcher("%_")("literal %_ name"), true);
  assert.equal(searchMatcher("王 小明")("小明, 王"), true);
  const sql = searchSql("name", "' OR 1=1 --");
  assert.equal(sql.where.includes("OR 1=1"), false);
  assert.ok(sql.args.includes("'"));
});
test("SQL and JavaScript searches agree without rewriting stored names", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE cards(name TEXT)");
  for (const name of [
    "Iwami, Manaka",
    "Manaka Iwami",
    "Someone Else",
    "literal %_ name",
    "王, 小明",
  ])
    db.prepare("INSERT INTO cards VALUES(?)").run(name);
  for (const q of [...queries, "%_", "王 小明", "' OR 1=1 --", ""]) {
    const s = searchSql("name", q);
    assert.deepEqual(
      db
        .prepare("SELECT name FROM cards WHERE " + s.where)
        .all(...s.args)
        .map((r) => r.name),
      db
        .prepare("SELECT name FROM cards")
        .all()
        .map((r) => r.name)
        .filter(searchMatcher(q)),
      q,
    );
  }
  db.close();
});
test("catalogue searches cover SQL actors, existing Tenrai bucket indexes, filters, sorting and pagination", (t) => {
  const { e, actor } = fixture(t);
  for (const q of queries) {
    assert.deepEqual(
      e.catalogStore.page("seiyuu", q).cards.map((c) => c.id),
      [actor.id],
      q,
    );
    assert.deepEqual(
      e.catalogStore.page("character", q).cards.map((c) => c.id),
      ["mal-character-1"],
      q,
    );
    assert.equal(
      e.catalogStore.page("character", q, 1, 40, { role: "main" }).cards.length,
      1,
      q,
    );
    assert.equal(
      e.catalogStore.page("seiyuu", q, 1, 40, { sort: "name" }).total,
      1,
      q,
    );
    assert.equal(
      e.catalogStore.page("character", q, 1, 40, { sort: "name" }).total,
      1,
      q,
    );
  }
  assert.equal(
    e.catalogStore.page("character", "Nobody Iwami").cards.length,
    0,
  );
  assert.equal(
    e.catalogStore.page("seiyuu", "Iwami Manaka", 2, 1).cards.length,
    0,
  );
  assert.equal(e.catalogStore.card(actor.id).name, actor.name);
});
test("collection, shop quotes, Alchemy targets and host player search use consistent comma-free matching", (t) => {
  const { e, actor } = fixture(t);
  const inventory = [{ card: actor.id, level: 1, copies: 3 }];
  const cardBy = () => actor;
  for (const query of queries) {
    assert.equal(
      collectionView(inventory, cardBy, { kind: "seiyuu", query }).length,
      1,
    );
    assert.equal(
      batchSaleQuote(inventory, cardBy, { kind: "seiyuu", query }).items.length,
      1,
    );
    assert.equal(fusionOutcomesPage([actor], { rarity: "A", query }).total, 1);
    assert.equal(
      matchingCreditPlayers({ players: [{ id: "p", name: actor.name }] }, query)
        .length,
      1,
    );
  }
  assert.equal(
    matchingCreditPlayers(
      {
        players: [{ id: "p", name: "Display" }],
        aliases: [{ player: "p", alias: "Iwami, Manaka" }],
      },
      "Manaka Iwami",
    ).length,
    1,
  );
  assert.equal(
    batchSaleQuote([{ ...inventory[0], protected: 1 }], cardBy, {
      kind: "seiyuu",
      query: "Manaka Iwami",
    }).items.length,
    0,
  );
});
test("player aliases, previous usernames, profile totals and anime search support either name order", (t) => {
  const { e } = fixture(t);
  for (const q of queries) {
    assert.equal(e.profilesPage(q).total, 1);
    assert.equal(e.searchProfiles(q)[0].id, "p");
  }
  assert.equal(e.profilesPage("Name Old").profiles[0].id, "p");
  e.run("INSERT INTO usernames VALUES('family, given','q','Family, Given',1)");
  assert.equal(e.profilesPage("Given Family").profiles[0].id, "q");
  assert.equal(e.profilesPage("unmatched, name").total, 0);
  assert.equal(e.economy.anime.search("Example Anime").series.length, 1);
  assert.equal(e.economy.anime.search("Anime, Example").series.length, 1);
});
test("quiz suggestions support reordered comma names without changing stored answers or grading", (t) => {
  const { e } = fixture(t);
  e.quiz.save({
    id: "names",
    name: "Names",
    published: false,
    songs: [
      { audio: "https://example.com/song.mp3", answers: ["Iwami, Manaka"] },
    ],
  });
  e.run("UPDATE players SET is_admin=1 WHERE id='p'");
  e.run("INSERT INTO host_delegations VALUES('p','368')");
  for (const q of queries) {
    assert.deepEqual(e.quiz.suggestions("names", q, "p").answers, [
      "Iwami, Manaka",
    ]);
    assert.deepEqual(quizAnswerOptions(["Iwami, Manaka"], q), [
      "Iwami, Manaka",
    ]);
  }
  assert.equal(e.quiz.suggestions("names", "%_", "p").answers.length, 0);
});
