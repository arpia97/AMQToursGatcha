import test from "node:test";
import assert from "node:assert/strict";
import { createTourRewardEditor } from "../public/tour-rewards-ui.js";

function createMockRoot() {
  const listeners = { input: [], change: [], click: [], keydown: [] };
  const elements = new Map();
  let html = "";

  const root = {
    get innerHTML() {
      return html;
    },
    set innerHTML(val) {
      html = val;
      // Re-parse elements from html string
      elements.clear();
      // Tour size
      elements.set("[name=tourSize]", { value: "16" });
      // Max rounds
      elements.set("[name=maxRounds]", { value: "5" });
      // Search filter input
      elements.set("[data-reward-filter]", {
        value: "",
        matches(sel) {
          return sel === "[data-reward-filter]";
        },
        focus() {},
      });
      // Clear button
      elements.set("[data-clear-reward-filter]", {
        hidden: true,
        hasAttribute(a) {
          return a === "data-clear-reward-filter";
        },
        closest() {
          return this;
        },
      });
      // Empty hint
      elements.set("[data-reward-filter-empty]", { hidden: true });
      // Summary elements
      elements.set("[data-reward-rate]", { textContent: "" });
      elements.set("[data-reward-summary]", { textContent: "" });
      elements.set("[data-reward-error]", { textContent: "" });
      elements.set("[data-award-tour]", { disabled: false });

      // Parse players from html
      const playerMatches = [...val.matchAll(/data-reward-player="([^"]+)"/g)];
      const playerCards = playerMatches.map((m) => {
        const playerId = m[1];
        const card = {
          dataset: { rewardPlayer: playerId },
          hidden: false,
          querySelector(sel) {
            if (sel === "[name=rounds]") return this._rounds;
            if (sel === "[name=count]") return this._count;
            if (sel === "[name=report]") return this._report;
            if (sel === "[data-reward-total]") return this._total;
            return null;
          },
          _rounds: { value: "5", max: 5 },
          _count: { checked: false },
          _report: { checked: false },
          _total: { textContent: "" },
        };
        return card;
      });
      elements.set("cards", playerCards);
    },
    querySelector(sel) {
      if (elements.has(sel)) return elements.get(sel);
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-reward-player]") return elements.get("cards") || [];
      return [];
    },
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    dispatch(type, event) {
      for (const fn of listeners[type] || []) fn(event);
    },
  };
  return root;
}

test("createTourRewardEditor renders search bar and filters participants in review grid", () => {
  const root = createMockRoot();
  const preview = {
    players: [
      { id: "p1", name: "HaruUrara" },
      { id: "p2", name: "xeyz" },
      { id: "p3", name: "LordGrond" },
    ],
    tourSize: 16,
    maxRounds: 5,
  };
  const meta = { event: "tour-1", note: "Test Note" };
  const state = {
    players: [
      { id: "p1", name: "HaruUrara", aliases: ["Haru"] },
      { id: "p2", name: "xeyz", aliases: ["xyz"] },
      { id: "p3", name: "LordGrond" },
    ],
  };
  const escape = (s) => String(s);

  const editor = createTourRewardEditor(root, preview, meta, state, escape);

  // 1. Search bar and controls are rendered in HTML
  assert.match(root.innerHTML, /data-reward-filter/);
  assert.match(root.innerHTML, /data-clear-reward-filter/);
  assert.match(root.innerHTML, /data-reward-filter-empty/);

  const cards = root.querySelectorAll("[data-reward-player]");
  assert.equal(cards.length, 3);
  assert.equal(cards.every((c) => !c.hidden), true);

  // 2. Filter by name: "Haru"
  const filterInput = root.querySelector("[data-reward-filter]");
  filterInput.value = "Haru";
  root.dispatch("input", { target: filterInput });

  const p1Card = cards.find((c) => c.dataset.rewardPlayer === "p1");
  const p2Card = cards.find((c) => c.dataset.rewardPlayer === "p2");
  const p3Card = cards.find((c) => c.dataset.rewardPlayer === "p3");

  assert.equal(p1Card.hidden, false, "HaruUrara should be visible");
  assert.equal(p2Card.hidden, true, "xeyz should be hidden");
  assert.equal(p3Card.hidden, true, "LordGrond should be hidden");
  assert.equal(root.querySelector("[data-clear-reward-filter]").hidden, false);
  assert.equal(root.querySelector("[data-reward-filter-empty]").hidden, true);

  // Check count and report on the filtered player (HaruUrara)
  p1Card._count.checked = true;
  p1Card._report.checked = true;

  // 3. Filter by alias: "xyz" -> matches xeyz
  filterInput.value = "xyz";
  root.dispatch("input", { target: filterInput });
  assert.equal(p1Card.hidden, true);
  assert.equal(p2Card.hidden, false, "xeyz should match alias xyz");
  assert.equal(p3Card.hidden, true);

  // Check report on xeyz
  p2Card._report.checked = true;

  // 4. Filter with no match
  filterInput.value = "nonexistent";
  root.dispatch("input", { target: filterInput });
  assert.equal(cards.every((c) => c.hidden), true);
  assert.equal(root.querySelector("[data-reward-filter-empty]").hidden, false);

  // 5. Clear filter via clear button click
  const clearBtn = root.querySelector("[data-clear-reward-filter]");
  root.dispatch("click", {
    target: clearBtn,
  });
  assert.equal(cards.every((c) => !c.hidden), true, "All cards visible after clear");
  assert.equal(clearBtn.hidden, true);

  // Verify Haru and xeyz kept their checked state even after filtering and clearing
  assert.equal(p1Card._count.checked, true);
  assert.equal(p1Card._report.checked, true);
  assert.equal(p2Card._report.checked, true);

  // 6. Payload awards all participants correctly
  const payload = editor.payload();
  assert.equal(payload.participants.length, 3);
  const p1Payload = payload.participants.find((p) => p.player === "p1");
  const p2Payload = payload.participants.find((p) => p.player === "p2");
  const p3Payload = payload.participants.find((p) => p.player === "p3");

  assert.equal(p1Payload.count, true);
  assert.equal(p1Payload.report, true);
  assert.equal(p2Payload.count, false);
  assert.equal(p2Payload.report, true);
  assert.equal(p3Payload.count, false);
  assert.equal(p3Payload.report, false);
});
