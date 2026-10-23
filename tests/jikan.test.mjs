import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceCards, fetchJikan } from "../src/jikan.js";

const person = {
  mal_id: 118,
  name: "Kamiya, Hiroshi",
  images: {
    jpg: {
      image_url: "https://cdn.myanimelist.net/images/voiceactors/1/66163.jpg",
    },
  },
};
test("Jikan import selects Japanese voice credits, deduplicates by existing MAL IDs, and ignores character role", () => {
  const data = [
    {
      role: "Main",
      voice_actors: [
        { person, language: "Japanese" },
        { person: { ...person, mal_id: 9 }, language: "English" },
      ],
    },
    { role: "Supporting", voice_actors: [{ person, language: "Japanese" }] },
  ];
  const cards = voiceCards(data, "Anime");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "mal-person-118");
  assert.equal(cards[0].kind, "seiyuu");
  assert.equal(cards[0].role, undefined);
  assert.equal(
    voiceCards(
      [
        {
          voice_actors: [
            { person: { ...person, images: null }, language: "Japanese" },
          ],
        },
      ],
      "Anime",
    ).length,
    0,
  );
});
test("Jikan responses respect Retry-After and reject unusable upstream data", async () => {
  await assert.rejects(
    fetchJikan(
      "/anime/1/characters",
      async () =>
        new Response("{}", { status: 429, headers: { "Retry-After": "90" } }),
    ),
    (e) => e.upstreamStatus === 429 && e.retryMs === 90000,
  );
  await assert.rejects(
    fetchJikan(
      "/anime/1/characters",
      async () => new Response("<html>unavailable</html>"),
    ),
  );
});
