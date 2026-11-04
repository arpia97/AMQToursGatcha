import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("the actual host submit handler saves a draft with a hidden id field instead of falling through to an undefined result", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../public/host.js", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  const handlers = new Map(),
    requests = [],
    nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        textContent: "",
        className: "",
        innerHTML: "",
        hidden: false,
      });
    return nodes.get(id);
  };
  const document = {
    querySelector: (selector) => node(selector),
    querySelectorAll: () => [],
    addEventListener: (type, handler) => {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
  };
  const hostState = {
    players: [],
    aliases: [],
    usernames: [],
    pickems: [],
    pickemEvents: [],
    settings: {},
    catalogSummary: {},
    cards: [],
    ledger: [],
  };
  let saved = false;
  const fetch = async (path, options = {}) => {
    if (path === "api/state")
      return { ok: true, json: async () => ({ me: { is_admin: 1 } }) };
    if (path === "api/host/state")
      return { ok: true, json: async () => hostState };
    if (path === "api/host/quiz-songs?id=saved-quiz")
      return {
        ok: true,
        json: async () => ({ id: "saved-quiz", updated: 1, songs: [] }),
      };
    if (path === "api/host/quizzes")
      return {
        ok: true,
        json: async () => ({
          quizzes: saved
            ? [
                {
                  id: "saved-quiz",
                  name: "Sample Draft",
                  songs: 1,
                  published: 0,
                },
              ]
            : [],
        }),
      };
    if (path === "api/host/quiz-scores-reset") {
      requests.push({ path, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ message: "Quiz scores and titles reset." }),
      };
    }
    if (path === "api/host/quiz-save") {
      const body = JSON.parse(options.body);
      requests.push({ path, body });
      saved = true;
      return {
        ok: true,
        json: async () => ({
          id: "saved-quiz",
          message: "Quiz Draft Saved · 1 matched MP3 songs.",
          songs: 1,
          rejected: [],
        }),
      };
    }
    throw Error("Unexpected request " + path);
  };
  class FormData {
    constructor(form) {
      this.form = form;
    }
    getAll(key) {
      return this.form.values[key] || [];
    }
    *[Symbol.iterator]() {
      yield* Object.entries(this.form.values);
    }
  }
  const context = vm.createContext({
    document,
    fetch,
    FormData,
    crypto,
    console,
    setInterval: () => 0,
    setTimeout,
    clearTimeout,
    Blob,
    URL,
    confirm: () => true,
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  await new Promise((resolve) => setImmediate(resolve));
  await handlers.get("click")[0]({
    target: {
      closest: () => ({ dataset: { tab: "quiz" }, hasAttribute: () => false }),
    },
  });
  const input = [{ annId: 1, audio: "dntpj0.mp3", songName: "Example" }];
  const file = { size: 100, text: async () => JSON.stringify(input) },
    submit = { disabled: false };
  const form = {
    id: { tagName: "INPUT", name: "id", value: "" },
    getAttribute: (key) => (key === "id" ? "quiz-save" : null),
    values: { id: "", name: "Sample Draft", title: "", published: "false" },
    elements: { songsFile: { files: [file] }, coverFile: { files: [] } },
    dataset: {},
    isConnected: false,
    querySelector: () => submit,
  };
  await handlers.get("submit")[0]({ preventDefault() {}, target: form });
  assert.equal(requests.length, 1, node("#result").textContent);
  assert.equal(requests[0].body.name, "Sample Draft");
  assert.equal(requests[0].body.published, false);
  assert.equal(requests[0].body.input[0].audio, "dntpj0.mp3");
  assert.match(node("#result").textContent, /Quiz Draft Saved/);
  assert.equal(submit.disabled, false);
  assert.match(
    node("#host-content").innerHTML,
    /Reset Scores & Completion Titles/,
  );
  const resetForm = {
    getAttribute: (key) => (key === "id" ? "quiz-scores-reset" : null),
    values: { quiz: "saved-quiz", quizName: "Sample Draft" },
    dataset: {},
    isConnected: false,
    querySelector: () => submit,
  };
  await handlers.get("submit")[0]({ preventDefault() {}, target: resetForm });
  assert.equal(requests[1].path, "api/host/quiz-scores-reset");
  assert.equal(requests[1].body.quiz, "saved-quiz");
  assert.equal(requests[1].body.confirmation, "RESET QUIZ SCORES AND TITLES");
});
