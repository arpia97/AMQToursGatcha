import test from "node:test";
import assert from "node:assert/strict";
import { PLAY_MODES, playRoute, playHref } from "../public/play-navigation.js";

test("Play has clean, distinct mode routes and rejects unrelated or nested paths", () => {
  assert.deepEqual(PLAY_MODES.map((mode) => mode.name), ["1v1 Ranked", "NGMC Ranked", "2v2 Arena", "Song/Artist", "Speed Showdown", "Quiz", "Rankings"]);
  assert.equal(playRoute("/play"), "ngmc-ranked");
  assert.equal(playRoute("/play/"), "ngmc-ranked");
  for (const mode of PLAY_MODES) {
    assert.equal(playRoute(playHref(mode.id)), mode.id);
    assert.equal(playRoute(playHref(mode.id) + "/"), mode.id);
  }
  for (const path of ["/gacha/quiz", "/tour", "/playful/quiz", "/play/nope", "/play/quiz/next", "/play//quiz"])
    assert.equal(playRoute(path), null);
});
