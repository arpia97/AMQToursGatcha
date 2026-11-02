import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadQuizMaster } from "../src/quiz-source.js";
import { prepareQuizSongs } from "../public/quiz-rules.js";
const master = {
  masterListId: "test-live",
  animeMap: { 1: { mainNames: { EN: "Anime" }, songLinks: {} } },
};
test("AMQ source uses a validated live response without requesting fallback", async () => {
  const source = await loadQuizMaster(async () => Response.json(master), {
    fetch: () => {
      throw Error("No fallback needed");
    },
  });
  assert.equal(source.mode, "live");
  assert.equal(source.data.masterListId, "test-live");
});
test("AMQ access denial, invalid JSON and network failures use the packaged index", async () => {
  const fallback = { ...master, masterListId: "snapshot" };
  for (const fetcher of [
    async () => new Response("Blocked", { status: 403 }),
    async () => new Response("not-json"),
    async () => {
      throw Error("Network failed");
    },
    async () => Response.json({ masterListId: "invalid", animeMap: [] }),
  ]) {
    let requested;
    const source = await loadQuizMaster(fetcher, {
      fetch: async (request) => {
        requested = new URL(request.url).pathname;
        return Response.json(fallback);
      },
    });
    assert.equal(source.mode, "bundled");
    assert.equal(source.data.masterListId, "snapshot");
    assert.equal(requested, "/quiz-amq-master.json");
  }
});
test("missing or invalid fallback fails clearly without a replacement pool", async () => {
  await assert.rejects(
    loadQuizMaster(async () => new Response("", { status: 403 }), {
      fetch: async () => new Response("", { status: 404 }),
    }),
    (e) => e.status === 502 && /No pool was changed/.test(e.message),
  );
});
test("packaged AMQ data retains accepted aliases and song IDs for ordinary AnisongDB filename exports", async () => {
  const snapshot = JSON.parse(
    await fs.readFile(
      new URL("../public/quiz-amq-master.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(Object.keys(snapshot.animeMap).length > 1000);
  const prepared = prepareQuizSongs(
    [
      {
        annId: 10885,
        annSongId: 10315,
        amqSongId: 7689,
        audio: "dntpj0.mp3",
        songName: "My Soul,Your Beats!",
      },
    ],
    snapshot,
  );
  assert.equal(prepared.songs.length, 1);
  assert.ok(prepared.songs[0].answers.includes("Angel Beats!"));
});
