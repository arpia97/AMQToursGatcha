import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import {
  avatarCrop,
  avatarCropStyle,
  validateAvatarCrop,
  panAvatarCrop,
} from "../public/avatar-crop.js";
import {
  catalogProgress,
  catalogProgressHTML,
} from "../public/catalog-progress.js";
import { marketSortControl } from "../public/market-sort.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const now = Date.UTC(2026, 10, 6);
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
      () => now,
    );
  const e = make();
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  e.run("UPDATE players SET earned=5000,balance=5000");
  e.host("catalog", {
    cards: [
      ["d", "D", "Zed"],
      ["ag", "AG", "Alpha"],
      ["s", "S", "Middle"],
    ].map(([id, rarity, name]) => ({
      id: "community-" + id,
      kind: "character",
      name,
      series: "Test",
      fixedRarity: rarity,
    })),
  });
  const act = (b, key = crypto.randomUUID()) =>
    e.mutate("p:profile", key, b, () => e.action("p", "profile", b));
  return { db, e, act, make, now };
}
test("crop geometry clamps pan/zoom, retains legacy framing, and cannot inject styles", () => {
  assert.deepEqual(avatarCrop(null), { x: 0.5, y: 0.2, zoom: 1 });
  assert.deepEqual(avatarCrop("{bad"), avatarCrop(null));
  for (const bad of [
    null,
    [],
    {},
    { x: NaN, y: 0.5, zoom: 1 },
    { x: 0.5, y: Infinity, zoom: 1 },
    { x: -0.1, y: 0, zoom: 1 },
    { x: 0, y: 1.1, zoom: 1 },
    { x: 0, y: 0, zoom: 3.1 },
    { x: "0;display:none", y: 0, zoom: 1 },
  ])
    assert.throws(() => validateAvatarCrop(bad));
  assert.equal(
    avatarCropStyle({ x: 0.25, y: 0.75, zoom: 2 }),
    "--avatar-x:25%;--avatar-y:75%;--avatar-zoom:2",
  );
  assert.deepEqual(
    panAvatarCrop({ x: 0.5, y: 0.5, zoom: 2 }, 50, -50, 100, 100, 100),
    { x: 0, y: 1, zoom: 2 },
  );
  assert.deepEqual(
    panAvatarCrop({ x: 0.5, y: 0.5, zoom: 1 }, 999, 50, 100, 100, 200),
    { x: 0.5, y: 0, zoom: 1 },
  );
});
test("owned avatar crops persist through restart and all public profile surfaces; invalid changes are atomic", (t) => {
  const { e, act, make } = fixture(t);
  e.addCard("p", "community-ag");
  e.addCard("p", "community-d");
  const crop = { x: 0.31, y: 0.66, zoom: 1.8 },
    body = { avatar: "community-ag", crop };
  const first = act(body, "same");
  assert.deepEqual(act(body, "same"), first);
  for (const p of [
    e.player("p"),
    e.profile("p"),
    e.profilesPage("").profiles.find((p) => p.id === "p"),
    e.economy.rankings("earned").rows.find((p) => p.id === "p"),
    make().player("p"),
  ])
    assert.deepEqual(JSON.parse(p.avatar_crop), crop);
  act({ username: "Renamed" });
  act({ avatar: "community-ag" });
  assert.deepEqual(JSON.parse(e.player("p").avatar_crop), crop);
  assert.throws(
    () => act({ username: "Bad Change", avatar: "community-s", crop }),
    /inventory/,
  );
  assert.equal(e.player("p").name, "Renamed");
  assert.throws(() => act({ crop: { ...crop, zoom: 99 } }), /crop/);
  assert.deepEqual(JSON.parse(e.player("p").avatar_crop), crop);
  act({ avatar: "community-d" });
  assert.equal(e.player("p").avatar_crop, null);
  act({ avatar: null });
  assert.equal(e.player("p").avatar_card, null);
  assert.throws(() => act({ crop }), /Choose a card/);
});
function listings(f) {
  for (let i = 0; i < 90; i++)
    f.e.run(
      "INSERT INTO market_listings(seller,card,kind,level,price,created) VALUES('q',?,'character',?,?,?)",
      i === 0 ? "community-ag" : i === 1 ? "community-s" : "community-d",
      1 + (i % 6),
      100 + i,
      f.now + i,
    );
  f.e.run(
    "INSERT INTO market_listings(seller,card,kind,level,price,created,status) VALUES('q','community-ag','character',6,1,0,'sold')",
  );
  f.e.economy.wishlist.change("p", { card: "community-ag", wanted: true });
}
test("market sorts globally before paging, uses only listed metadata, and keeps stable ties", (t) => {
  const f = fixture(t);
  listings(f);
  const e = f.e;
  const before = e.one("SELECT count(*) n FROM ledger").n;
  const pool = e.catalogStore.pool;
  e.catalogStore.pool = () => {
    throw Error("Full catalogue scan");
  };
  assert.equal(
    e.economy.market("shop", "character", 1, { sort: "rarity" }).items[0].id,
    1,
  );
  assert.equal(
    e.economy.market("shop", "character", 1, { sort: "rarity-low" }).items[0]
      .id,
    90,
  );
  assert.equal(
    e.economy.market("shop", "character", 1, { sort: "name" }).items[0].id,
    1,
  );
  const pages = [1, 2, 3].map((page) =>
    e.economy.market("shop", "character", page, { sort: "rarity" }),
  );
  assert.deepEqual(
    pages.map((p) => p.items.length),
    [40, 40, 10],
  );
  assert.deepEqual(
    pages.map((p) => p.hasMore),
    [true, true, false],
  );
  assert.equal(
    new Set(pages.flatMap((p) => p.items.map((x) => x.id))).size,
    90,
  );
  for (const [sort, id] of [
    ["newest", 90],
    ["oldest", 1],
    ["price-low", 1],
    ["price-high", 90],
    ["level", 90],
  ])
    assert.equal(
      e.economy.market("shop", "character", 1, { sort }).items[0].id,
      id,
    );
  assert.equal(e.one("SELECT count(*) n FROM ledger").n, before);
  e.run(
    "INSERT INTO catalog(id,kind,name,fixed_rarity) VALUES('community-voice','seiyuu','Voice','S')",
  );
  e.run(
    "INSERT INTO market_listings(seller,card,kind,level,price,created) VALUES('q','community-voice','seiyuu',1,500,?)",
    f.now,
  );
  const both = [1, 2, 3].map((page) =>
    e.economy.market("shop", "both", page, { sort: "newest" }),
  );
  assert.deepEqual(
    both.map((p) => p.items.length),
    [40, 40, 11],
  );
  assert.equal(both[0].items[0].kind, "seiyuu");
  assert.equal(new Set(both.flatMap((p) => p.items.map((i) => i.id))).size, 91);
  assert.equal(e.economy.market("shop", "seiyuu", 1).items.length, 1);
  e.catalogStore.pool = pool;
});
test("personal wishlist filters belong only to the authenticated player and apply before pagination", (t) => {
  const f = fixture(t);
  listings(f);
  const e = f.e;
  assert.throws(
    () => e.economy.market("shop", "character", 1, { sort: "wishlist" }),
    (x) => x.status === 401,
  );
  assert.throws(
    () => e.economy.market("shop", "character", 1, { wishlistOnly: true }),
    (x) => x.status === 401,
  );
  assert.equal(
    e.economy.market("shop", "character", 1, { sort: "wishlist" }, "p").items[0]
      .id,
    1,
  );
  assert.deepEqual(
    e.economy
      .market("shop", "character", 1, { wishlistOnly: true }, "p")
      .items.map((x) => x.id),
    [1],
  );
  assert.equal(
    e.economy.market("shop", "character", 1, { wishlistOnly: true }, "q").items
      .length,
    0,
  );
  assert.throws(
    () => e.economy.market("shop", "character", 1, { sort: "bad" }),
    /filter/,
  );
  assert.throws(
    () => e.economy.market("shop", "character", 1, { sort: "ending" }),
    /filter/,
  );
});
test("auction sorts respect active user-only scope, current bid price, and ending time", (t) => {
  const { e, now } = fixture(t);
  for (const [card, bid, reserve, ends, seller] of [
    ["community-ag", 0, 900, now + 5000, "q"],
    ["community-d", 500, 100, now + 1000, "q"],
    ["community-s", 0, 1, now - 1, "q"],
    ["community-ag", 0, 1, now + 100, null],
  ])
    e.run(
      "INSERT INTO auctions(card,kind,starts,ends,bid,reserve,seller,level) VALUES(?,'character',?,?,?,?,?,1)",
      card,
      now - 100,
      ends,
      bid,
      reserve,
      seller,
    );
  assert.equal(
    e.economy.market("auction", "character", 1, { sort: "ending" }).items[0]
      .card,
    "community-d",
  );
  assert.equal(
    e.economy.market("auction", "character", 1, { sort: "price-low" }).items[0]
      .bid,
    500,
  );
  assert.equal(
    e.economy.market("auction", "character", 1, { sort: "rarity" }).items
      .length,
    2,
  );
});
test("catalogue progress uses only persisted scan counters, handles unknown totals and never exposes private status", (t) => {
  const { e } = fixture(t);
  const state = {
    status: "waiting",
    scannedTitles: 22474,
    totalTitles: 30747,
    skippedTitles: 0,
    queue: [{ secret: "x" }],
    generation: "private",
    lastRequestPath: "private",
    updatedAt: 123,
  };
  const p = catalogProgress(state);
  assert.equal(p.percent, 73.09);
  assert.equal(p.total, 30747);
  assert.equal("queue" in p, false);
  assert.equal("lastRequestPath" in p, false);
  assert.equal(catalogProgress({ scannedTitles: 2 }).percent, null);
  assert.equal(
    catalogProgress({ ...state, scannedTitles: 40000 }).percent,
    99.99,
  );
  assert.equal(
    catalogProgress({ ...state, discoveryComplete: true }).percent,
    100,
  );
  assert.equal(catalogProgress(null), null);
  e.run(
    "INSERT OR REPLACE INTO catalog_meta VALUES('jikan-import',?)",
    JSON.stringify(state),
  );
  assert.deepEqual(e.catalogStore.summary().importProgress, p);
  assert.match(catalogProgressHTML(p), /73.09%/);
  assert.match(catalogProgressHTML(p), /cast pages, not the final number/);
  assert.doesNotMatch(catalogProgressHTML(p), /private/);
  assert.equal(
    catalogProgressHTML({ ...p, complete: true, percent: 100 }),
    "",
  );
  assert.match(marketSortControl("wishlist", true, true, true), /Ending Soon/);
  assert.doesNotMatch(marketSortControl(), /Ending Soon/);
});

test("market searches card names in either order, anime and sellers before sorting/paging and keeps filters private", (t) => {
  const f = fixture(t);
  listings(f);
  const e = f.e;
  e.run(
    "UPDATE catalog SET name='Iwami, Manaka',series='Voice Actor' WHERE id='community-ag'",
  );
  e.catalogStore.invalidate();
  e.host("players", { players: [{ id: "q", name: "Rare Seller" }] });
  for (const query of ["Iwami Manaka", "Manaka Iwami", "Voice Actor"]) {
    const r = e.economy.market("shop", "character", 1, { query });
    assert.deepEqual(
      r.items.map((l) => l.id),
      [1],
    );
    assert.equal(r.hasMore, false);
  }
  assert.equal(
    e.economy.market("shop", "character", 1, { query: "Rare Seller" }).items
      .length,
    40,
  );
  assert.equal(
    e.economy.market(
      "shop",
      "character",
      1,
      { query: "Manaka", wishlistOnly: true },
      "q",
    ).items.length,
    0,
  );
  assert.equal(
    e.economy.market(
      "shop",
      "character",
      1,
      { query: "Manaka", wishlistOnly: true },
      "p",
    ).items.length,
    1,
  );
  assert.equal(
    e.economy.market("shop", "character", 1, { query: "%' OR 1=1 --" }).items
      .length,
    0,
  );
  for (let i = 0; i < 60; i++)
    e.run(
      "INSERT INTO auctions(card,kind,starts,ends,bid,reserve,seller,level) VALUES(?,'character',0,?,0,100,'q',1)",
      i < 45 ? "community-ag" : "community-d",
      f.now + 1000 + i,
    );
  const pages = [1, 2].map((page) =>
    e.economy.market("auction", "character", page, {
      query: "Manaka Iwami",
      sort: "ending",
    }),
  );
  assert.deepEqual(
    pages.map((p) => p.items.length),
    [40, 5],
  );
  assert.equal(pages[0].items[0].ends, f.now + 1000);
  assert.match(
    marketSortControl("newest", false, false, false, '<b>"'),
    /&lt;b&gt;&quot;/,
  );
});
