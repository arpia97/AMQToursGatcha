import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
async function fixture(status = "synced") {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../public/host.js", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  const handlers = new Map(),
    nodes = new Map(),
    requests = [];
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        textContent: "",
        innerHTML: "",
        className: "",
        hidden: false,
      });
    return nodes.get(id);
  };
  const state = {
    players: [],
    aliases: [],
    usernames: [],
    pickems: [],
    pickemEvents: [],
    settings: {},
    catalogSummary: {},
    cards: [],
    ledger: [],
    aliasSync: { status: "synced", players: 1, aliases: 1 },
  };
  const mockFetch = async (path, options = {}) => {
    if (["api/host/state?section=rewards", "api/host/state?section=players"].includes(path)) return { ok: true, json: async () => state };
    if (path === "api/host/quizzes")
      return { ok: true, json: async () => ({ quizzes: [] }) };
    if (path === "api/host/aliases-sync") {
      requests.push({ path, options });
      state.aliasSync = {
        status,
        players: 2,
        aliases: 3,
        error: status === "synced" ? null : "Source sheet unavailable",
      };
      return {
        ok: true,
        json: async () => ({
          message: "Alias sync",
          aliasSync: state.aliasSync,
        }),
      };
    }
    throw Error("Unexpected request " + path);
  };
  const fetch = async (path, options) => {
    const result = await mockFetch(path, options);
    return Response.json(await result.json(), {
      status: result.ok ? 200 : result.status || 500,
    });
  };
  const context = vm.createContext({
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      addEventListener: (type, handler) => {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(handler);
      },
    },
    fetch,
    FormData: class {
      *[Symbol.iterator]() {}
    },
    crypto,
    console,
    setInterval: () => 0,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
    confirm: () => false,
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  await new Promise((resolve) => setImmediate(resolve));
  await handlers.get("click")[0]({
    target: {
      closest: () => ({
        dataset: { tab: "players" },
        hasAttribute: () => false,
      }),
    },
  });
  const submit = { disabled: false, textContent: "Scan Aliases →" },
    form = {
      getAttribute: (name) => (name === "id" ? "aliases-sync" : null),
      dataset: {},
      isConnected: false,
      querySelector: () => submit,
    };
  return {
    node,
    requests,
    submit,
    scan: () =>
      handlers.get("submit")[0]({ preventDefault() {}, target: form }),
  };
}
test("host alias scan uses the source sheet endpoint without a file upload and refreshes counts", async () => {
  const f = await fixture();
  assert.match(f.node("#host-content").innerHTML, /Scan Aliases/);
  assert.doesNotMatch(
    f.node("#host-content").innerHTML,
    /players-file|Upload a CSV|type="file"/,
  );
  await f.scan();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.method, "POST");
  assert.equal(f.requests[0].options.body, "{}");
  assert.match(
    f.node("#result").textContent,
    /Alias Scan Complete · 2 players · 3 aliases/,
  );
  assert.equal(f.submit.disabled, false);
});
test("a failed source scan shows the source error rather than claiming new players were imported", async () => {
  const f = await fixture("retrying");
  await f.scan();
  assert.match(f.node("#result").textContent, /Source sheet unavailable/);
  assert.equal(f.node("#result").className, "host-result error");
  assert.doesNotMatch(f.node("#result").textContent, /Scan Complete/);
  assert.equal(f.submit.disabled, false);
});
