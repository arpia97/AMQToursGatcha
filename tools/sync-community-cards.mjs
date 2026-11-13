// Syncs community cards from public/community-cards.json into the catalog via the host endpoint.
// Usage: node tools/sync-community-cards.mjs --url https://play.amqtours-gatcha.workers.dev
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const base = option("--url") || "https://play.amqtours-gatcha.workers.dev";
const token = process.env.AMQ_HOST_TOKEN;
if (!token) {
  console.error("Set AMQ_HOST_TOKEN in the environment before running.");
  process.exit(1);
}

const cards = JSON.parse(
  await readFile(path.join(root, "public/community-cards.json"), "utf8"),
);

const key = option("--key") || crypto.randomUUID();
console.log(`Syncing ${cards.length} community cards to ${base} (key: ${key})...`);

const r = await fetch(new URL("/api/host/catalog", base), {
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    "Idempotency-Key": key,
  },
  body: JSON.stringify({ cards }),
});

const result = await r.json();
if (!r.ok) {
  console.error("Sync failed:", result.error || result);
  process.exitCode = 1;
} else {
  console.log("Success:", JSON.stringify(result, null, 2));
}
