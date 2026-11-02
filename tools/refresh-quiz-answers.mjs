import fs from "node:fs/promises";
const source = "https://animemusicquiz.com/libraryMasterList";
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error("AMQ returned HTTP " + response.status);
const data = await response.json();
if (
  typeof data.masterListId !== "string" ||
  !data.animeMap ||
  Object.keys(data.animeMap).length < 1000
)
  throw Error("Invalid AMQ master list; existing fallback was kept.");
const compact = {
  masterListId: data.masterListId,
  animeMap: Object.fromEntries(
    Object.entries(data.animeMap).map(([id, a]) => [
      id,
      {
        mainNames: a.mainNames,
        names: (a.names || []).map((n) => ({ name: n.name })),
        songLinks: Object.fromEntries(
          Object.entries(a.songLinks || {}).map(([kind, links]) => [
            kind,
            links.map((s) => ({ songId: s.songId, annSongId: s.annSongId })),
          ]),
        ),
      },
    ]),
  ),
};
const file = new URL("../public/quiz-amq-master.json", import.meta.url);
await fs.writeFile(file, JSON.stringify(compact) + String.fromCharCode(10));
console.log(
  JSON.stringify({
    masterListId: compact.masterListId,
    anime: Object.keys(compact.animeMap).length,
    bytes: JSON.stringify(compact).length,
  }),
);
