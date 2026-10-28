import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const [imageDirectory, recordsFile, hallFile] = process.argv.slice(2);
if (!hallFile)
  throw Error(
    "Usage: node tools/import-horse-roster.mjs IMAGE_DIRECTORY GAMETORA_RECORDS_JSON JRA_HALL_HTML",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const records = JSON.parse(await fs.readFile(recordsFile, "utf8"));
const hall = await fs.readFile(hallFile, "utf8");
const honored = new Set(
  [...hall.matchAll(/<h3 class="sub_header">([^<]+)<\/h3>/g)].map((m) =>
    m[1].normalize("NFKC"),
  ),
);
if (honored.size < 30)
  throw Error("JRA Hall of Fame snapshot could not be verified.");
const roster = [];
const staff = new Set([
  "Tazuna Hayakawa",
  "Yayoi Akikawa",
  "Etsuko Otonashi",
  "Aoi Kiryuin",
  "Sasami Anshinzawa",
  "Riko Kashimoto",
  "Mei Satake",
  "Ryoka Tsurugi",
  "Tucker Bryne",
  "Kiyoko Hoshina",
  "Beauty Anshinzawa",
]);
await fs.mkdir(path.join(root, "public/horse-portraits"), { recursive: true });
for (const c of records.filter((c) => !staff.has(c.name_en))) {
  if (
    !/^[a-z0-9-]+$/.test(c.url_name) ||
    typeof c.name_en !== "string" ||
    /[\\/]/.test(c.name_en)
  )
    throw Error("Invalid portrait name or profile slug.");
  const original = path.join(
    imageDirectory,
    c.name_en.replace(/\.+$/, "") + ".png",
  );
  const asset = `horse-portraits/${c.url_name}.png`;
  await fs.copyFile(original, path.join(root, "public", asset));
  const stats = c.fictional ? null : c.rl?.win_stats;
  roster.push({
    id: c.char_id,
    name: c.name_en,
    image: asset,
    color: "#" + c.color_main,
    fictional: c.fictional === true,
    recordKnown: Array.isArray(stats),
    g1Wins: stats?.[0] ?? 0,
    gradedWins: stats?.[2] ?? 0,
    races: c.rl?.races ?? null,
    wins: c.rl?.wins ?? null,
    hallOfFame: honored.has(c.name_ja.normalize("NFKC")),
    source: "https://gametora.com/umamusume/characters/" + c.url_name,
  });
}
roster.sort((a, b) => a.id - b.id);
await fs.writeFile(
  path.join(root, "public/horse-roster.js"),
  "// Career snapshot: GameTora characters.690aa811.json and JRA Hall of Fame, 2026-10-28.\n" +
    "// Portraits remain the original user-provided Cygames/GameTora PNG files.\n" +
    "export const HORSE_ROSTER = " +
    JSON.stringify(roster, null, 2) +
    ";\n",
);
console.log(
  JSON.stringify({
    racers: roster.length,
    fictional: roster.filter((c) => c.fictional).length,
    hallOfFame: roster.filter((c) => c.hallOfFame).length,
    decorated: roster.filter((c) => c.g1Wins >= 3 || c.hallOfFame).length,
    staffExcluded: records.length - roster.length,
  }),
);
