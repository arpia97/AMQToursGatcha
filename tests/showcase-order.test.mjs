import test from "node:test";
import assert from "node:assert/strict";
import { createShowcaseEditor } from "../public/showcase-order.js";
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
  showcase: cards.map((c, i) => ({ card: c.id, level: [4, 2, 8, 1][i] })),
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
  assert.match(editor.render(), /Move Zeta Earlier" disabled/);
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
