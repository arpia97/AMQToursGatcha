import test from "node:test";
import assert from "node:assert/strict";
import { cardSurface, installCardSurfaces } from "../public/card-surface.js";
import {
  installCardSize,
  cardSizeControl,
} from "../public/card-preferences.js";

test("full-art cards have no actions toggle, escape identities and show independent owner status icons", () => {
  const c = { id: "safe", name: '<Name "one">', rarity: "AG" };
  const e = (v) => String(v).replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const h = {
    escape: e,
    image: () => '<img alt="">',
    gradeBadge: () => "AG",
    series: () => "Source",
    cardFlags: () => ({ protectedCard: true, wishlisted: true, forTrade: true }),
  };
  const preview = cardSurface(
    c,
    { level: 6, showLevel: true, protectedCard: false, wishlisted: false, forTrade: false },
    h,
  );
  assert.match(preview, /enhancement-level-6/);
  assert.match(preview, /MAX/);
  assert.doesNotMatch(
    preview,
    /<button|card-back|card-state-icons|data-card-interactive|<Name/,
  );
  const owned = cardSurface(
    c,
    {
      showLevel: true,
      actions: '<button data-action="protect-toggle">Protect</button>',
    },
    h,
  );
  assert.match(owned, /data-card-interactive tabindex="0"/);
  assert.match(owned, /card-back" inert/);
  assert.match(owned, /aria-label="Protected"/);
  assert.match(owned, /aria-label="Wishlisted"/);
  assert.match(owned, /aria-label="For Trade"/);
  assert.match(owned, /⚖️/);
  assert.equal((owned.match(/data-action=/g) || []).length, 1);
  assert.doesNotMatch(
    owned,
    /data-card-toggle|Hide card actions|<details|<summary/,
  );
});
function fixture() {
  const listeners = {},
    classes = new Set(),
    panel = { inert: true };
  let keyboard = false;
  const root = {
    addEventListener: (name, cb) => (listeners[name] = cb),
    querySelectorAll: () => (classes.has("is-revealed") ? [card] : []),
  };
  const card = {
    dataset: { cardSurface: "one" },
    closest: (s) => (s === "[data-card-interactive]" ? card : null),
    matches: () => keyboard,
    contains: (t) => [card, action].includes(t),
    classList: {
      contains: (n) => classes.has(n),
      toggle: (n, v) => (v ? classes.add(n) : classes.delete(n)),
    },
    querySelector: (s) => (s === ".card-back" ? panel : action),
    querySelectorAll: () => [action],
    focus: () => {
      root.activeElement = card;
      listeners.focusin({ target: card });
    },
  };
  const action = {
    dataset: { action: "protect-toggle" },
    matches: () => keyboard,
    closest: (s) => (s === "[data-card-interactive]" ? card : action),
    focus: () => (root.activeElement = action),
  };
  installCardSurfaces(root);
  return {
    listeners,
    card,
    action,
    panel,
    root,
    keyboard: (v) => (keyboard = v),
  };
}
test("first touch only reveals, controls remain actionable on a second tap, and tapping the card or outside hides it", () => {
  const f = fixture();
  let prevented = false;
  f.listeners.pointerdown({ target: f.card, pointerType: "touch" });
  f.listeners.click({
    target: f.card,
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {},
  });
  assert.ok(prevented);
  assert.equal(f.panel.inert, false);
  f.listeners.pointerdown({ target: f.action, pointerType: "touch" });
  f.listeners.click({
    target: f.action,
    preventDefault() {
      throw Error("must allow the intended action");
    },
  });
  assert.equal(f.panel.inert, false);
  f.listeners.pointerdown({ target: f.card, pointerType: "touch" });
  f.listeners.click({ target: f.card });
  assert.equal(f.panel.inert, true);
  f.listeners.pointerdown({ target: f.card, pointerType: "touch" });
  f.listeners.click({
    target: f.card,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  f.listeners.click({ target: { closest: () => null } });
  assert.equal(f.panel.inert, true);
});
test("mouse hover fades in/out, keyboard focus opens controls and Escape returns to the card without invoking an action", () => {
  const f = fixture();
  f.listeners.pointerover({
    target: f.card,
    relatedTarget: null,
    pointerType: "mouse",
  });
  assert.equal(f.panel.inert, false);
  f.listeners.pointerout({ target: f.card, relatedTarget: null });
  assert.equal(f.panel.inert, true);
  f.keyboard(true);
  f.card.focus();
  assert.equal(f.panel.inert, false);
  f.listeners.keydown({ target: f.card, key: "Enter", preventDefault() {} });
  assert.equal(f.root.activeElement, f.action);
  f.listeners.keydown({
    target: f.action,
    key: "Escape",
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(f.root.activeElement, f.card);
  assert.equal(f.panel.inert, true);
});
test("card size is a saved local preference, rejects invalid values and synchronizes all controls", () => {
  const listeners = {},
    saved = [],
    selects = [{}, {}];
  const root = {
    documentElement: { dataset: {} },
    addEventListener: (n, cb) => (listeners[n] = cb),
    querySelectorAll: () => selects,
  };
  const get = installCardSize(root, {
    getItem: () => "small",
    setItem: (...v) => saved.push(v),
  });
  assert.equal(get(), "small");
  listeners.change({ target: { matches: () => true, value: "large" } });
  assert.equal(get(), "large");
  assert.equal(root.documentElement.dataset.cardSize, "large");
  assert.ok(selects.every((s) => s.value === "large"));
  assert.equal(saved.length, 1);
  listeners.change({ target: { matches: () => true, value: "broken" } });
  assert.equal(get(), "large");
  assert.equal(saved.length, 1);
  assert.match(cardSizeControl(get()), /value="large" selected/);
});
