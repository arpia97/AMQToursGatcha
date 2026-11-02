import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { JikanImport } from "../src/jikan-import.js";
import { catalogueTabs, recentCardsView } from "../public/recent-cards-ui.js";
import { SITE_ROUTES } from "../public/site-navigation.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let time = 100000;
  const e = new Engine(
    (sql, ...args) => db.prepare(sql).all(...args),
    (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    () => time,
  );
  return { e, advance: (n) => (time += n) };
}
test("recent cards track actual first imports, omit legacy/manual cards and do not refresh after role, title or favorites changes", (t) => {
  const { e, advance } = fixture(t);
  e.host("catalog", {
    cards: [{ id: "mal-character-1", kind: "character", name: "Existing" }],
  });
  e.tx(() =>
    e.catalogStore.tenrai.upsert([
      {
        id: "mal-character-1",
        kind: "character",
        name: "Existing",
        role: "supporting",
      },
      {
        id: "mal-character-2",
        kind: "character",
        name: "New",
        role: "supporting",
        series: "First",
      },
    ]),
  );
  assert.deepEqual(
    e.catalogStore.recentPage().cards.map((c) => c.id),
    ["mal-character-2"],
  );
  const first = e.catalogStore.recentPage().cards[0].firstImportedAt;
  advance(12 * 3600000);
  e.tx(() =>
    e.catalogStore.tenrai.upsert([
      {
        id: "mal-character-2",
        kind: "character",
        name: "New",
        role: "main",
        series: "New Primary",
      },
    ]),
  );
  e.catalogStore.popularity.sync("character", [["mal-character-2", 999]]);
  assert.equal(e.catalogStore.recentPage().cards[0].firstImportedAt, first);
  assert.equal(e.catalogStore.recentPage().cards[0].series, "New Primary");
  advance(12 * 3600000);
  assert.equal(e.catalogStore.recentPage().total, 0);
  assert.equal(e.catalogStore.recentPage(999).page, 1);
});
test("the real importer records both new seiyuus and characters and rediscovery never re-dates them", async (t) => {
  const { e, advance } = fixture(t),
    job = new JikanImport(e, async (path) =>
      path.startsWith("/anime?")
        ? {
            data: [
              { mal_id: 1, title: "Anime" },
              { mal_id: 2, title: "Other" },
            ],
            pagination: { has_next_page: false, items: { total: 2 } },
          }
        : {
            data: [
              {
                character: {
                  mal_id: 100,
                  name: "Character",
                  images: {
                    jpg: {
                      image_url:
                        "https://cdn.myanimelist.net/images/characters/1/100.jpg",
                    },
                  },
                },
                role: "Main",
                voice_actors: [
                  {
                    language: "Japanese",
                    person: {
                      mal_id: 200,
                      name: "Actor",
                      images: {
                        jpg: {
                          image_url:
                            "https://cdn.myanimelist.net/images/voiceactors/1/200.jpg",
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
    );
  job.enableCharacters();
  advance(1000);
  await job.step();
  advance(30000);
  await job.step();
  const page = e.catalogStore.recentPage();
  assert.equal(page.total, 2);
  assert.deepEqual(
    new Set(page.cards.map((c) => c.kind)),
    new Set(["character", "seiyuu"]),
  );
  advance(30000);
  await job.step();
  assert.deepEqual(
    e.catalogStore.recentPage().cards.map((c) => [c.id, c.firstImportedAt]),
    page.cards.map((c) => [c.id, c.firstImportedAt]),
  );
});
test("recent cards page newest-first deterministically, clamp expired pages and preserve history through gameplay resets", (t) => {
  const { e, advance } = fixture(t);
  for (let i = 1; i <= 45; i++) {
    advance(1000);
    e.tx(() =>
      e.catalogStore.tenrai.upsert([
        {
          id: "mal-character-" + i,
          kind: "character",
          name: "Card " + i,
          role: "main",
        },
      ]),
    );
  }
  const first = e.catalogStore.recentPage(),
    second = e.catalogStore.recentPage(2);
  assert.equal(first.cards[0].id, "mal-character-45");
  assert.equal(first.cards.length, 40);
  assert.equal(second.cards.length, 5);
  assert.equal(
    new Set([...first.cards, ...second.cards].map((c) => c.id)).size,
    45,
  );
  e.tx(() => e.host("reset-all", { confirmation: "RESET ALL GAME DATA" }));
  assert.equal(e.catalogStore.recentPage().total, 45);
  assert.throws(() => e.catalogStore.recentPage(0));
  assert.throws(() =>
    e.tx(() =>
      e.catalogStore.tenrai.upsert([
        { id: "mal-character-999", kind: "character", name: "Rollback" },
        { id: "bad", kind: "character", name: "Invalid" },
      ]),
    ),
  );
  assert.equal(e.catalogStore.recentPage().total, 45);
});
test("New Cards is a mixed catalogue subtab with normal pagination and no additional main navigation item", () => {
  assert.ok(SITE_ROUTES.every(([, label]) => !label.includes("New Cards")));
  assert.match(
    catalogueTabs("seiyuu", true),
    /data-action="catalog-recent" aria-pressed="true">New Cards \(24h\)/,
  );
  assert.match(catalogueTabs("character"), /Characters/);
  const html = recentCardsView(
    {
      cards: [{ id: "character" }, { id: "voice" }],
      total: 2,
      page: 1,
      hasMore: false,
    },
    {
      cardHTML: (c) => "<article>" + c.id + "</article>",
      pager: () => "<nav>Pages</nav>",
      number: String,
      empty: (a, b) => a + b,
    },
  );
  assert.match(html, /<article>character/);
  assert.match(html, /<article>voice/);
  assert.match(html, /Both Card Types/);
  assert.doesNotMatch(html, /Character role/);
});
