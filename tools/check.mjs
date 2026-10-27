import { readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = resolve(root, "public/vendor");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (path === generated) return [];
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.m?js$/.test(entry.name) ? [path] : [];
  });
}

const files = ["src", "public", "tools", "tests"]
  .flatMap((directory) => sourceFiles(resolve(root, directory)))
  .sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error(`Syntax check failed: ${relative(root, file)}`);
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
console.log(`Syntax checked ${files.length} JavaScript source and test files.`);
