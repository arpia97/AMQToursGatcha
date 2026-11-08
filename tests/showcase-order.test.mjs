import test from "node:test";
import assert from "node:assert/strict";
import { createShowcaseEditor } from "../public/showcase-order.js";
import { createWishlistEditor } from "../public/wishlist-order.js";
import { createFeatures } from "../public/features.js";
const cards = [
  { id: "a", name: "Zeta", kind: "character", rarity: "D", series: "One" },
  { id: "b", name: "Voice 10", kind: "seiyuu", rarity: "AG", series: "Two" },
  { id: "c", name: "Voice 2", kind: "seiyuu", rarity: "AG", series: "Three" },
  {
    id: "d",
    name: "<Unknown>",
    kind: "character",
    rarity: null,
    series: "Four",
  },
];
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const helpers = {
  escape,
  cardBy: (id) => cards.find((c) => c.id === id),
  image: () => '<img alt="">',
  gradeBadge: () => "",
  series: (c) => c.series,
};
const profile = {
  id: "p",
  showcase: cards.map((c, i) => ({ card: c.id, level: [4, 2, 6, 1][i] })),
};
test("manual moves and position selection preserve all showcase cards and leave the saved profile untouched", () => {
  const editor = createShowcaseEditor(helpers),
    saved = structuredClone(profile);
  assert.throws(() => editor.open(profile, "other"), /own showcase/);
  editor.open(profile, "p");
  assert.equal(editor.move("a", -1), false);
  assert.equal(editor.move("missing", 1), false);
  editor.move("a", 3);
  assert.deepEqual(editor.payload("p").cards, ["b", "c", "d", "a"]);
  editor.move("d", 0);
  assert.deepEqual(editor.payload("p").cards, ["d", "b", "c", "a"]);
  assert.deepEqual(editor.payload("p").expectedCards, ["a", "b", "c", "d"]);
  assert.deepEqual(profile, saved);
  assert.throws(() => editor.payload("other"), /same account/);
  editor.sortBy("original");
  assert.deepEqual(editor.payload("p").cards, ["a", "b", "c", "d"]);
});
test("rarity, natural alphabetical and enhancement sorts include both card types and put Pending below D", () => {
  const editor = createShowcaseEditor(helpers);
  editor.open(profile, "p");
  editor.sortBy("rarity");
  assert.deepEqual(editor.payload("p").cards, ["c", "b", "a", "d"]);
  editor.sortBy("level");
  assert.deepEqual(editor.payload("p").cards, ["c", "a", "b", "d"]);
  editor.sortBy("name");
  assert.deepEqual(editor.payload("p").cards, ["d", "c", "b", "a"]);
  editor.sortBy("invalid");
  assert.deepEqual(editor.payload("p").cards, ["d", "c", "b", "a"]);
});
test("editor escapes card names, labels keyboard controls and enables saving only after an order change; editing controls are owner-only", () => {
  const editor = createShowcaseEditor(helpers);
  editor.open(profile, "p");
  assert.match(editor.render(), /Save Order<\/button>/);
  assert.match(editor.render(), /type="submit" class="button mint" disabled/);
  assert.match(editor.render(), /Position for &lt;Unknown&gt;/);
  assert.doesNotMatch(editor.render(), /<Unknown>/);
  assert.match(editor.render(), /data-showcase-handle="a"/);
  assert.doesNotMatch(editor.render(), /dialog|showcase-move/);
  assert.match(editor.render(), /has-card-level/);
  editor.move("a", 1);
  assert.doesNotMatch(
    editor.render(),
    /type="submit" class="button mint" disabled/,
  );
  const feature = createFeatures(
    {
      ...helpers,
      rarityClass: () => "",
      rarity: () => "",
      number: String,
      empty: () => "",
      getState: () => ({}),
      profileURL: () => "",
    },
    {},
  );
  assert.match(
    feature.profileExtras(profile, true),
    /data-action="showcase-arrange"/,
  );
  assert.doesNotMatch(
    feature.profileExtras(profile, false),
    /data-action="showcase-arrange"/,
  );
  assert.doesNotMatch(
    feature.profileExtras(
      { ...profile, showcase: profile.showcase.slice(0, 1) },
      true,
    ),
    /data-action="showcase-arrange"/,
  );
});

test("Inline Showcase and Wishlist editors preserve all pages, support drops/global positions, and cancel without changing saved data", () => {
  const all = Array.from({ length: 30 }, (_, i) => ({
    id: "w" + i,
    name: "Card " + i,
    kind: i % 2 ? "seiyuu" : "character",
    rarity: "S",
    series: "One",
  }));
  for (const mode of ["showcase", "wishlist"]) {
    const factory =
        mode === "showcase" ? createShowcaseEditor : createWishlistEditor,
      editor = factory({
        ...helpers,
        cardBy: (id) => all.find((c) => c.id === id),
      }),
      profile = {
        id: "p",
        wishlist: all.map((c) => c.id),
        showcase: all.map((c) => ({ card: c.id, level: 2, protected: 1 })),
      },
      saved = structuredClone(profile);
    assert.throws(() => editor.open(profile, "q"));
    editor.open(profile, "p", 1);
    assert.equal(editor.activeFor("p"), true);
    assert.equal(editor.activeFor("q"), false);
    assert.equal(
      (
        editor
          .render()
          .match(new RegExp("data-" + mode + "-sort-card=", "g")) || []
      ).length,
      24,
    );
    assert.doesNotMatch(editor.render(), /modal|dialog/);
    editor.drop("w0", "w2", true);
    assert.deepEqual(editor.cards().slice(0, 3), ["w1", "w2", "w0"]);
    editor.move("w0", 29, true);
    assert.equal(editor.currentPage(), 2);
    assert.equal(editor.cards()[29], "w0");
    assert.equal(
      (
        editor
          .render()
          .match(new RegExp("data-" + mode + "-sort-card=", "g")) || []
      ).length,
      6,
    );
    editor.drop("w0", "w24");
    assert.equal(editor.cards()[23], "w0");
    assert.equal(new Set(editor.cards()).size, 30);
    assert.deepEqual(editor.payload("p").expectedCards, saved.wishlist);
    assert.throws(() => editor.payload("q"), /same account/);
    editor.setPage(999);
    assert.equal(editor.currentPage(), 2);
    editor.close();
    assert.equal(editor.activeFor("p"), false);
    assert.deepEqual(profile, saved);
    editor.open(profile, "p");
    assert.deepEqual(editor.cards(), saved.wishlist);
    if (mode === "showcase") {
      assert.match(editor.render(), /Protected/);
      assert.match(editor.render(), /Lv. 2/);
    }
  }
});
