import test from "node:test";
import assert from "node:assert/strict";
import {
  cardFrameClass,
  cardAura,
  enhancementBadge,
  frameLevel,
} from "../public/card-frames.js";
test("card frames keep six distinct enhancement levels and MAX instead of collapsing the highest tiers", () => {
  assert.equal(new Set([1, 2, 3, 4, 5, 6].map(cardFrameClass)).size, 6);
  assert.match(cardFrameClass(6), /enhancement-level-6$/);
  assert.match(enhancementBadge(6), />MAX</);
  assert.doesNotMatch(enhancementBadge(6), /Lv\. 6/);
  assert.equal(cardAura(1), "");
  assert.equal((cardAura(6).match(/aria-hidden="true"/g) || []).length, 2);
  for (const malformed of [null, undefined, NaN, '6" onclick="alert(1)', -10])
    assert.equal(frameLevel(malformed), 1);
  assert.equal(frameLevel(20), 6);
});
