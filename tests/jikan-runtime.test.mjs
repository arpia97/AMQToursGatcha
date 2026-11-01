import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const { Miniflare, Response: RuntimeResponse } = createRequire(
  require.resolve("wrangler/package.json"),
)("miniflare");

test("real Workers runtime sends keyed requests and refuses redirects without forwarding the key", async (t) => {
  const bundle = await build({
    stdin: {
      contents: `import {fetchJikan} from './src/jikan.js';export default {async fetch(request){try{return Response.json(await fetchJikan(new URL(request.url).pathname,fetch,{serverKey:'test-only-key'}));}catch(error){return Response.json({status:error.upstreamStatus,message:error.message},{status:502});}}};`,
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  const paths = [];
  const mf = new Miniflare({
    workers: [
      {
        config: {
          name: "tenrai-test",
          compatibilityDate: "2026-10-01",
          manifest: {
            mainModule: "worker.js",
            modules: {
              "worker.js": {
                type: "esm",
                contents: bundle.outputFiles[0].text,
              },
            },
          },
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: (request) => {
              const url = new URL(request.url);
              assert.equal(url.origin, "https://api.tenrai.org");
              assert.equal(
                request.headers.get("x-server-key"),
                "test-only-key",
              );
              paths.push(url.pathname);
              return url.pathname === "/v1/anime/1/characters"
                ? new RuntimeResponse(JSON.stringify({ data: [] }), {
                    headers: { "Content-Type": "application/json" },
                  })
                : new RuntimeResponse("", {
                    status: 302,
                    headers: { Location: "https://other.example/secret" },
                  });
            },
          },
        },
      },
    ],
  });
  t.after(() => mf.dispose());
  let response = await mf.dispatchFetch("http://test/anime/1/characters");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [] });
  response = await mf.dispatchFetch("http://test/anime/2/characters");
  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, 302);
  assert.deepEqual(paths, ["/v1/anime/1/characters", "/v1/anime/2/characters"]);
});
