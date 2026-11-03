import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8",
);
const render = source.slice(
  source.indexOf("function renderFusionPicker("),
  source.indexOf("async function openFusionPicker("),
);
const begin = source.indexOf(
  'document.addEventListener("input", async (ev) => {\n  if (ev.target.id !== "fusion-search")',
);
const handler = source.slice(
  begin,
  source.indexOf('document.addEventListener("change", async (ev) => {', begin),
);
function fixture() {
  let handle,
    input,
    query = "",
    count = 0;
  const pending = [],
    document = {
      activeElement: null,
      addEventListener: (_, fn) => (handle = fn),
    };
  const make = () => ({
    id: "fusion-search",
    value: query,
    isConnected: true,
    selectionStart: query.length,
    selectionEnd: query.length,
    selectionDirection: "none",
    focus() {
      document.activeElement = this;
    },
    setSelectionRange(a, b, d) {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = d;
    },
  });
  input = make();
  document.activeElement = input;
  const dialog = { scrollTop: 73 };
  const results = {
    set innerHTML(value) {
      count++;
    },
  };
  const overlay = {
    querySelector: (s) =>
      s === "#fusion-search"
        ? input
        : s === "#alchemy-picker-results"
          ? results
          : dialog,
    set innerHTML(v) {
      input.isConnected = false;
      input = make();
      count++;
    },
    hidden: false,
  };
  const alchemyUI = {
    renderPicker: () => "",
    filter: (_, v) => (query = v),
    pickerMode: () => "target",
    pickerOpen: () => true,
    loadTargets: () => new Promise((resolve) => pending.push(resolve)),
  };
  const context = vm.createContext({
    document,
    alchemyUI,
    api: () => {},
    toast: () => assert.fail("No error expected"),
    $: (s) => (s === "#fusion-picker" ? overlay : input),
  });
  vm.runInContext(render + handler, context);
  return {
    get input() {
      return input;
    },
    get count() {
      return count;
    },
    pending,
    document,
    dialog,
    handle,
  };
}
test("an older target response cannot redraw with an earlier caret; latest preserves current selection and scroll", async () => {
  const f = fixture(),
    input = f.input;
  input.value = "a";
  input.selectionStart = input.selectionEnd = 1;
  const old = f.handle({ target: input });
  input.value = "abc";
  input.selectionStart = input.selectionEnd = 3;
  const latest = f.handle({ target: input });
  f.pending[0](null);
  await old;
  assert.equal(f.count, 0);
  input.selectionStart = 1;
  input.selectionEnd = 2;
  input.selectionDirection = "backward";
  f.pending[1]({ cards: [] });
  await latest;
  assert.equal(f.count, 1);
  assert.equal(f.input, input);
  assert.equal(f.input.value, "abc");
  assert.equal(f.input.selectionStart, 1);
  assert.equal(f.input.selectionEnd, 2);
  assert.equal(f.input.selectionDirection, "backward");
  assert.equal(f.dialog.scrollTop, 73);
  assert.equal(f.document.activeElement, f.input);
});
test("a completed lookup does not steal focus after the user leaves search", async () => {
  const f = fixture();
  f.input.value = "ab";
  const pending = f.handle({ target: f.input });
  const button = {};
  f.document.activeElement = button;
  f.pending[0]({ cards: [] });
  await pending;
  assert.equal(f.count, 1);
  assert.equal(f.document.activeElement, button);
});
