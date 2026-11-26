import test from "node:test";
import assert from "node:assert/strict";
import { PLAY_MODES, playRoute, playHref, playQuizHref } from "../public/play-navigation.js";

test("Play has clean, distinct mode routes and rejects unrelated or nested paths", () => {
  assert.deepEqual(PLAY_MODES.map((mode) => mode.name), ["Overview", "1v1 Ranked", "NGMC Ranked", "Song/Artist", "1-Team", "Variety", "Custom Lobby", "Quiz", "Rankings"]);
  assert.equal(playQuizHref(), "/play/quiz");
  const id = "quiz + &#1";
  assert.equal(new URL(playQuizHref(id), "https://amqtours.app").searchParams.get("quiz"), id);
  assert.equal(playRoute("/play"), "overview");
  assert.equal(playRoute("/play/"), "overview");
  for (const mode of PLAY_MODES) {
    assert.equal(playRoute(playHref(mode.id)), mode.id);
    assert.equal(playRoute(playHref(mode.id) + "/"), mode.id);
  }
  for (const path of ["/play/2v2-arena", "/play/speed-showdown", "/gacha/quiz", "/tour", "/playful/quiz", "/play/nope", "/play/quiz/next", "/play//quiz"])
    assert.equal(playRoute(path), null);
});
