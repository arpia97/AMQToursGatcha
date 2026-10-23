// Generates catalog JSON; never changes production data. Import the output in the host console.
import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2),
  get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i < 0 ? fallback : args[i + 1];
  };
const kind = get("--kind", "character"),
  start = Number(get("--start", "1")),
  pages = Number(get("--pages", "1")),
  out = get("--out", "catalog-import.json");
if (
  !["character", "seiyuu"].includes(kind) ||
  !Number.isInteger(start) ||
  start < 1 ||
  !Number.isInteger(pages) ||
  pages < 1
)
  throw new Error(
    "Use --kind character|seiyuu --start 1 --pages 1 --out catalog-import.json",
  );
const field =
  kind === "character"
    ? "characters(sort:ID) { id name { full } image { large } siteUrl media(perPage:1,type:ANIME,sort:POPULARITY_DESC) { edges { characterRole node { title { romaji } } } } }"
    : "staff(sort:ID) { id name { full } image { large } siteUrl primaryOccupations }";
let cards = [];
try {
  cards = JSON.parse(await readFile(out, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const map = new Map(cards.map((c) => [c.id, c]));
for (let page = start; page < start + pages; page++) {
  if (page > start) await new Promise((r) => setTimeout(r, 2200));
  const query = `query ($page:Int) { Page(page:$page,perPage:50) { pageInfo { hasNextPage } ${field} } }`;
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AMQToursGatcha/0.1",
      },
      body: JSON.stringify({ query, variables: { page } }),
    });
    if (response.status !== 429) break;
    const wait = Math.min(
      120,
      Number(response.headers.get("Retry-After") || 60),
    );
    console.log(`Rate limited; waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!response.ok)
    throw new Error(
      `AniList returned HTTP ${response.status} on page ${page}. Saved previous pages in ${out}; resume with --start ${page}.`,
    );
  const data = await response.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  const result = data.data.Page;
  for (const row of result[kind === "character" ? "characters" : "staff"]) {
    if (
      kind === "seiyuu" &&
      !row.primaryOccupations?.some((x) =>
        x.toLowerCase().includes("voice actor"),
      )
    )
      continue;
    if (kind === "character" && !row.media.edges.length) continue;
    const card = {
      id: `anilist-${kind}-${row.id}`,
      kind,
      name: row.name.full,
      series:
        kind === "character"
          ? row.media.edges[0].node.title.romaji
          : "Voice actor",
      image: row.image.large,
      source: row.siteUrl,
    };
    if (kind === "character")
      card.role =
        row.media.edges[0].characterRole === "MAIN" ? "main" : "supporting";
    map.set(card.id, card);
  }
  await writeFile(out, JSON.stringify([...map.values()], null, 2));
  console.log(`Page ${page}: ${map.size} saved cards`);
  if (!result.pageInfo.hasNextPage) break;
}
