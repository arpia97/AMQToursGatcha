import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePage,
  isPlayerRoute,
  routeHref,
  navigationSection,
  SITE_ROUTES,
} from "../public/site-navigation.js";
test("profile subpages and public routes resolve correctly; collection stays nested and Catalogue stays last", () => {
  for (const id of ["catalog", "profile", "collection", "titles"])
    assert.equal(resolvePage("#" + id), id);
  assert.equal(resolvePage("#player/368"), "player");
  assert.equal(resolvePage("#invalid"), "home");
  assert.equal(resolvePage("pickems/114"), "pickems");
  assert.equal(routeHref("pickems/114"), "/pickems/114");
  assert.equal(isPlayerRoute("host"), false);
  assert.equal(isPlayerRoute("api/state"), false);
  assert.equal(isPlayerRoute("pickems/114/extra"), false);
  for (const id of ["collection", "titles"])
    assert.equal(navigationSection(id, "368"), "profile");
  assert.equal(navigationSection("player", "368", "368"), "profile");
  assert.equal(navigationSection("player", "368", "357"), "players");
  assert.deepEqual(SITE_ROUTES.at(-2), ["ranks", "Rankings"]);
  assert.deepEqual(SITE_ROUTES.at(-1), ["catalog", "Catalogue"]);
  assert.ok(!SITE_ROUTES.some(([id]) => ["collection", "titles"].includes(id)));
});
