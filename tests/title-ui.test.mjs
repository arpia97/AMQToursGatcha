import test from "node:test";
import assert from "node:assert/strict";
import { titleBadges, titleSettingsPanel } from "../public/title-ui.js";
import {
  resolvePage,
  navigationSection,
  SITE_ROUTES,
} from "../public/site-navigation.js";
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
test("Host stays above earned titles as an AG badge and its settings control is permanently equipped", () => {
  const html = titleBadges(
    { role: "Host", titles: [{ title: "LiSA" }] },
    escape,
  );
  assert(html.indexOf(">Host</span>") < html.indexOf(">LiSA</span>"));
  assert.match(html, /data-rarity="AG"/);
  const panel = titleSettingsPanel(
    {
      role: "Host",
      titles: [
        { quiz: "q", title: "<Title>", quizName: "Quiz", equipped: false },
      ],
    },
    escape,
  );
  assert.match(panel, /checked disabled aria-label="Host Is Always Equipped"/);
  assert.match(panel, /&lt;Title>/);
  assert.doesNotMatch(panel, /value="q" checked/);
  assert.doesNotMatch(
    titleBadges({ role: "Player", titles: [] }, escape),
    />Host</,
  );
});
test("My Titles is nested under My Profile rather than adding a main menu item", () => {
  assert.equal(resolvePage("#titles"), "titles");
  assert.equal(navigationSection("titles", "368"), "profile");
  assert.equal(
    SITE_ROUTES.some(([id]) => id === "titles"),
    false,
  );
});

test("identical quiz and title labels appear once while different quiz names remain useful context", () => {
  const panel = titleSettingsPanel(
    {
      titles: [
        { quiz: "e", title: "EGOIST", quizName: "EGOIST", equipped: true },
      ],
    },
    escape,
  );
  assert.equal(panel.split("EGOIST").length - 1, 1);
  assert.doesNotMatch(panel, /<small>EGOIST/);
});
