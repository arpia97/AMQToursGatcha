// Run with node tools/query-reads/benchmark.mjs. No remote bindings or production data.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler/package.json"))("miniflare");
// Optionally benchmark a Git revision with the same fixture and installed runtime.
const root = fileURLToPath(new URL("../../", import.meta.url));
const revision = process.argv[2];
const plugins = [];
if (revision) {
  const git = (...args) => execFileSync("git", args, {cwd:root, encoding:"utf8"});
  const commit = git("rev-parse","--verify","--end-of-options",revision + "^{commit}").trim();
  const changed = new Set(git("diff","--name-only","-z",commit,"--","src","public").split("\0"));
  plugins.push({name:"baseline", setup(builder) {
    builder.onLoad({filter:/\.js$/}, ({path: file}) => {
      const rel = path.relative(root,file).split(path.sep).join("/");
      if (changed.has(rel)) return {contents:git("show",commit + ":" + rel),loader:"js"};
    });
  }});
}
const bundle = await build({
  plugins,
  entryPoints: [fileURLToPath(new URL("./worker.js", import.meta.url))], bundle: true,
  write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"],
});
const mf = new Miniflare({workers:[{config:{
  name:"query-benchmark", compatibilityDate:"2026-10-01",
  manifest:{mainModule:"worker.js",modules:{"worker.js":{type:"esm",contents:bundle.outputFiles[0].text}}},
  exports:{ReadBenchmark:{type:"durable-object",storage:"sqlite",state:"created"}},
  env:{GAME:{type:"durable-object",worker:"query-benchmark",exportName:"ReadBenchmark"}},
}}]});
try {
  const response = await mf.dispatchFetch("http://local/benchmark");
  if (!response.ok) throw Error(await response.text());
  const rows = await response.json();
  for (const {label,reads,writes,pickReads,result} of rows) {
    // Ignore object key order. Preserve array order to catch pagination and tie-order changes.
    const json = JSON.stringify(result, (_,v) => v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
    console.log(label, {reads:label === "profile pick'em" ? pickReads : reads,writes,hash:createHash("sha256").update(json).digest("hex").slice(0,16)});
  }
} finally { await mf.dispose(); }
