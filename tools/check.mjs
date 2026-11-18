import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

// Parse with the same Node module grammar as --check, without launching Node
// once for every file. A direct invocation still works without loader flags.
if (!vm.SourceTextModule) {
  const result = spawnSync(process.execPath, [
    "--experimental-vm-modules", "--disable-warning=ExperimentalWarning",
    fileURLToPath(import.meta.url),
  ], { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

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
  const identifier = relative(root, file);
  try {
    new vm.SourceTextModule(readFileSync(file, "utf8"), { identifier });
  } catch (error) {
    console.error(`Syntax check failed: ${identifier}\n${error.message}`);
    process.exit(1);
  }
}
console.log(`Syntax checked ${files.length} JavaScript source and test files.`);
