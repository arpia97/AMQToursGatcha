// Terminal companion for integration with an AMQ host script. Token is read only from environment.
// node tools/host.mjs grant grant.json --url https://your-worker.workers.dev --key tour42-reporting-amq123
import { readFile } from "node:fs/promises";
const [action, file, ...flags] = process.argv.slice(2);
const option = (name) => {
  const i = flags.indexOf(name);
  return i >= 0 ? flags[i + 1] : undefined;
};
if (!action || !file || !process.env.AMQ_HOST_TOKEN) {
  console.error(
    "Usage: node tools/host.mjs <action> <body.json> --url <site-url> [--key <unique-request-id>]\nSet AMQ_HOST_TOKEN in the environment. Never put it in source files.",
  );
  process.exit(1);
}
const base = option("--url");
if (
  !base ||
  (!base.startsWith("https://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))
)
  throw new Error("Use HTTPS, or localhost for development.");
const body = JSON.parse(await readFile(file, "utf8")),
  key = option("--key") || crypto.randomUUID();
console.log("Request ID:", key, "(reuse this same key for a retry)");
const r = await fetch(new URL("/api/host/" + action, base), {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.AMQ_HOST_TOKEN,
    "Content-Type": "application/json",
    "Idempotency-Key": key,
  },
  body: JSON.stringify(body),
});
const result = await r.json();
if (!r.ok) {
  console.error(result.error);
  process.exitCode = 1;
} else console.log(JSON.stringify(result, null, 2));
