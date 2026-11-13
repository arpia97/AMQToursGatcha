import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePage,
  navigationSection,
  SITE_ROUTES,
} from "../public/site-navigation.js";
test("profile subpages and public routes resolve correctly; collection stays nested and Rankings stays last", () => {
  for (const id of ["catalog", "profile", "collection", "titles"])
    assert.equal(resolvePage("#" + id), id);
  assert.equal(resolvePage("#player/368"), "player");
  assert.equal(resolvePage("#invalid"), "home");
  for (const id of ["collection", "titles"])
    assert.equal(navigationSection(id, "368"), "profile");
  assert.equal(navigationSection("player", "368", "368"), "profile");
  assert.equal(navigationSection("player", "368", "357"), "players");
  assert.equal(SITE_ROUTES.at(-1)[0], "ranks");
  assert.ok(!SITE_ROUTES.some(([id]) => ["collection", "titles"].includes(id)));
});
