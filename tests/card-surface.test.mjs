import test from "node:test";
import assert from "node:assert/strict";
import { cardSurface, installCardSurfaces } from "../public/card-surface.js";

test("full-art cards keep level frames and escaped identity, with no nested controls in read-only picker previews", () => {
  const c = { id: "safe-id", name: '<Name "one">', rarity: "AG" };
  const e = (v) =>
    String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const h = {
    escape: e,
    image: () => '<img alt="">',
    gradeBadge: () => "AG",
    series: () => "Source <test>",
  };
  const preview = cardSurface(c, { level: 6, showLevel: true }, h);
  assert.match(preview, /enhancement-level-6/);
  assert.match(preview, /frame-aura/);
  assert.match(preview, /MAX/);
  assert.doesNotMatch(preview, /<button|card-back|data-card-toggle|<Name/);
  assert.match(preview, /Source &lt;test>/);
  const owned = cardSurface(
    c,
    { actions: '<button data-action="protect-toggle">Protect</button>' },
    h,
  );
  assert.match(owned, /aria-label="Actions for &lt;Name &quot;one&quot;>"/);
  assert.match(owned, /aria-expanded="false"/);
  assert.equal((owned.match(/data-action=/g) || []).length, 1);
  assert.doesNotMatch(owned, /<details|<summary/);
});

function fixture() {
  const listeners = {};
  const root = {
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
    querySelectorAll: () =>
      card.classList.contains("is-revealed") ? [card] : [],
  };
  const classes = new Set();
  const attrs = {};
  const toggle = {
    closest: (selector) => (selector === "[data-card-toggle]" ? toggle : card),
    setAttribute: (key, value) => (attrs[key] = value),
    focus: () => {
      root.activeElement = toggle;
      listeners.focusin({ target: toggle });
    },
  };
  const action = { dataset: { action: "protect-toggle" }, closest: () => card };
  const panel = { scrollTop: 24 };
  const card = {
    dataset: { cardSurface: "one" },
    closest: () => card,
    contains: (target) => [card, toggle, action].includes(target),
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, value) =>
        value ? classes.add(name) : classes.delete(name),
    },
    querySelector: (selector) => (selector === ".card-back" ? panel : toggle),
    querySelectorAll: () => [action],
  };
  const api = installCardSurfaces(root);
  return { root, listeners, card, toggle, action, attrs, api };
}

test("hover, keyboard and touch reveal the same controls without dispatching a card mutation; Escape and outside clicks dismiss", () => {
  const f = fixture();
  f.listeners.pointerover({
    target: f.card,
    relatedTarget: null,
    pointerType: "mouse",
  });
  assert.equal(f.attrs["aria-expanded"], "true");
  f.listeners.pointerout({ target: f.card, relatedTarget: null });
  assert.equal(f.attrs["aria-expanded"], "false");
  f.listeners.pointerover({
    target: f.card,
    relatedTarget: null,
    pointerType: "touch",
  });
  assert.equal(f.attrs["aria-expanded"], "false");
  f.listeners.click({ target: f.toggle });
  assert.equal(f.attrs["aria-expanded"], "true");
  f.listeners.click({ target: { closest: () => null } });
  assert.equal(f.attrs["aria-expanded"], "false");
  f.listeners.focusin({ target: f.toggle });
  assert.equal(f.attrs["aria-expanded"], "true");
  let stopped = false;
  f.listeners.keydown({
    target: f.action,
    key: "Escape",
    preventDefault() {},
    stopPropagation() {
      stopped = true;
    },
  });
  assert.ok(stopped);
  assert.equal(f.root.activeElement, f.toggle);
  assert.equal(f.attrs["aria-expanded"], "false");
  f.listeners.click({ target: f.toggle });
  assert.equal(f.attrs["aria-expanded"], "true");
});
