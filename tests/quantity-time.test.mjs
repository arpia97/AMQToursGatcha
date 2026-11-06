import test from "node:test";
import assert from "node:assert/strict";
import {
  nextQuantity,
  quantityInput,
  installQuantityInputs,
} from "../public/quantity-input.js";
import { quizDuration, quizElapsed } from "../public/quiz-time.js";
import { compactCountdownText } from "../public/countdown.js";
test("quantity bounds, typed values and coarse ticket steps remain valid", () => {
  for (const [value, dir, min, max, step, expected] of [
    [1, -1, 1, 100, 1, 1],
    [100, 1, 1, 100, 1, 100],
    ["", 1, 1, 100, 1, 1],
    [105, 1, 100, 100000, 100, 200],
    [250, -1, 100, 100000, 100, 200],
    [72, 1, 1, 168, 1, 73],
    [100000, 1, 100, 100000, 100, 100000],
  ])
    assert.equal(nextQuantity(value, dir, min, max, step), expected);
  const html = quantityInput({
    id: "count",
    name: "count",
    label: "Packs <unsafe>",
    value: 1,
    min: 1,
    max: 100,
  });
  assert.match(html, /Decrease Packs &lt;unsafe&gt;/);
  assert.equal((html.match(/type="button"/g) || []).length, 2);
  assert.match(html, /name="count"/);
});
test("quantity buttons update the original form input and emit input without submitting", () => {
  const handlers = {},
    root = { addEventListener: (name, fn) => (handlers[name] = fn) },
    minus = { disabled: true },
    plus = { disabled: false };
  let emitted = null,
    prevented = false;
  const box = {
    querySelector: (s) =>
      s === "input" ? input : s.includes("-1") ? minus : plus,
  };
  const input = {
    value: "1",
    min: "1",
    max: "3",
    step: "1",
    disabled: false,
    closest: () => box,
    dispatchEvent: (ev) => {
      emitted = ev;
      handlers.input({ target: input });
    },
    matches: () => true,
  };
  const button = {
    disabled: false,
    dataset: { quantityStep: "1" },
    closest: () => box,
  };
  installQuantityInputs(root);
  handlers.click({
    target: { closest: () => button },
    preventDefault: () => (prevented = true),
  });
  assert.equal(input.value, "2");
  assert.equal(emitted.type, "input");
  assert.equal(emitted.bubbles, true);
  assert.equal(prevented, true);
  assert.equal(minus.disabled, false);
});
test("quiz durations display milliseconds and missing times honestly; auction clocks expire at zero", () => {
  assert.equal(quizElapsed(1000, 2250), 1250);
  assert.equal(quizElapsed(undefined, 1000), null);
  assert.equal(quizElapsed(2000, 1000), null);
  assert.equal(quizDuration(1250), "0:01.250");
  assert.equal(quizDuration(3661005), "1:01:01.005");
  assert.equal(quizDuration(null), "Not Recorded");
  assert.equal(quizDuration(0), "0:00.000");
  assert.equal(compactCountdownText(90061000, 0), "1d 01h 01m 01s");
  assert.equal(compactCountdownText(0, 1000), "00h 00m 00s");
});
