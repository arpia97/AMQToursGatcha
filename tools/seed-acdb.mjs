// Upload a prepared ACDB snapshot to the game's authenticated host API.
// Provider downloads happen in acdb.py; this step never contacts ACDB.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--bundle") || !args.includes("--url"))
  throw new Error(
    "Usage: node tools/seed-acdb.mjs --bundle PATH --url https://GAME.workers.dev [--token-file ignored.env]",
  );
const dir = resolve(option("--bundle")),
  base = new URL(option("--url"));
if (
  base.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(base.hostname)
)
  throw new Error("Use HTTPS outside local development.");
let secret = process.env.AMQ_HOST_TOKEN;
if (args.includes("--token-file"))
  secret = (await readFile(resolve(option("--token-file")), "utf8"))
    .match(/^HOST_TOKEN=(.+)$/m)?.[1]
    ?.trim();
if (!secret)
  throw new Error(
    "Set AMQ_HOST_TOKEN or supply an ignored local --token-file.",
  );
const bundle = JSON.parse(await readFile(join(dir, "bundle.json"), "utf8"));
const checkpoint = join(dir, "uploaded-" + base.hostname + ".json");
let completed = new Set();
try {
  const previous = JSON.parse(await readFile(checkpoint, "utf8"));
  if (previous.version === bundle.manifest.version)
    completed = new Set(previous.files);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
async function api(path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(new URL("/api/host/" + path, base), {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + secret,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (response.ok) return result;
    if (response.status === 429 || response.status >= 500) {
      await delay(Math.min(60000, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(
      result.error || "Catalog upload failed: " + response.status,
    );
  }
  throw new Error("Catalog upload paused after retries. Rerun to resume.");
}
const initial = await api("state");
if (initial.catalogSummary?.source?.version === bundle.manifest.version) {
  console.log("This ACDB snapshot is already active.");
  process.exit(0);
}
let batch = [],
  names = [],
  size = 20;
async function flush() {
  if (!batch.length) return;
  await api("acdb-chunks", { chunks: batch });
  names.forEach((name) => completed.add(name));
  const temp = JSON.stringify({
    version: bundle.manifest.version,
    files: [...completed],
  });
  await writeFile(checkpoint, temp);
  console.log(
    `Saved ${completed.size}/${bundle.chunks.length} catalog chunks.`,
  );
  batch = [];
  names = [];
  size = 20;
  await delay(1000);
}
for (const name of bundle.chunks) {
  if (completed.has(name)) continue;
  if (!/^[a-z]+-\d+\.json$/.test(name)) throw new Error("Invalid bundle path.");
  const raw = await readFile(join(dir, "chunks", name), "utf8"),
    bytes = Buffer.byteLength(raw);
  if (bytes > 850000) throw new Error("A catalog chunk exceeds upload limits.");
  if (batch.length >= 8 || size + bytes + 1 > 850000) await flush();
  batch.push(JSON.parse(raw));
  names.push(name);
  size += bytes + 1;
}
await flush();
const result = await api("acdb-activate", { manifest: bundle.manifest });
console.log(result.message);
