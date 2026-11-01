import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceCards, fetchJikan, VOICE_SOURCE } from "../src/jikan.js";

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

test("voice requests use the live Tenrai replacement and report network timeouts distinctly", async () => {
  let requested;
  await fetchJikan("/anime/1/characters", async (url) => {
    requested = url;
    return new Response('{"data":[]}');
  });
  assert.equal(requested, "https://api.tenrai.org/v1/anime/1/characters");
  assert.equal(VOICE_SOURCE.name, "Tenrai");
  await assert.rejects(
    fetchJikan("/anime/1/characters", async () => {
      throw new DOMException("request timed out", "TimeoutError");
    }),
    (e) => e.errorCode === "UPSTREAM_TIMEOUT" && e.status === 502,
  );
});

test("server keys use the official header only on fixed Tenrai requests, block redirects and are redacted from errors", async () => {
  let request;
  const key = "private-test-server-key";
  await fetchJikan(
    "/anime/1/characters",
    async (url, init) => {
      request = { url, init };
      return Response.json({ data: [] });
    },
    { serverKey: key },
  );
  assert.equal(request.init.headers["X-Server-Key"], key);
  assert.equal(request.init.headers.Authorization, undefined);
  assert.equal(request.init.redirect, "manual");
  await assert.rejects(
    fetchJikan("//other.test/people", async () => assert.fail("No Request"), {
      serverKey: key,
    }),
    /Invalid Tenrai/,
  );
  await assert.rejects(
    fetchJikan(
      "/people?page=356",
      async () =>
        Response.json(
          { message: "Limited " + key },
          {
            status: 429,
            headers: { "Retry-After": "120", "X-RateLimit-Remaining": "0" },
          },
        ),
      { serverKey: key },
    ),
    (error) => {
      assert.equal(error.errorCode, "UPSTREAM_RATE_LIMIT");
      assert.equal(error.retryMs, 120000);
      assert.equal(error.upstreamMessage, "Limited [redacted]");
      assert.equal(error.rateLimit["x-ratelimit-remaining"], "0");
      assert.ok(!JSON.stringify(error).includes(key));
      return true;
    },
  );
});
test("large denial bodies are bounded and failed denial streams retain the original HTTP status", async () => {
  await assert.rejects(
    fetchJikan(
      "/anime",
      async () => new Response("x".repeat(10000), { status: 429 }),
    ),
    (e) => e.upstreamStatus === 429 && e.upstreamMessage === null,
  );
  await assert.rejects(
    fetchJikan(
      "/anime",
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(Error("Stream Broken"));
            },
          }),
          { status: 503 },
        ),
    ),
    (e) => e.upstreamStatus === 503,
  );
});

test("connection diagnostics redact server keys before host status persistence", async () => {
  const key = "private-network-test-key";
  await assert.rejects(
    fetchJikan(
      "/anime/1/characters",
      async () => {
        throw Error("Connection refused " + key);
      },
      { serverKey: key },
    ),
    (err) =>
      err.upstreamMessage === "Connection refused [redacted]" &&
      !JSON.stringify(err).includes(key),
  );
});
