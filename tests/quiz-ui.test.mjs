import test from "node:test";
import assert from "node:assert/strict";
import { createQuizUI } from "../public/quiz-ui.js";
import { quizAnswerOptions } from "../public/quiz-autocomplete.js";
const escape = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function fixture(
  t,
  { blocked = false, saved = null, leaderboardRows = [], audioCache } = {},
) {
  const old = globalThis.document,
    nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        id,
        value: "",
        disabled: false,
        hidden: false,
        innerHTML: "",
        textContent: "",
        attrs: {},
        style: {
          setProperty(key, value) {
            this[key] = value;
          },
        },
        classList: { toggle() {} },
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        removeAttribute(k) {
          delete this.attrs[k];
        },
        scrollIntoView() {},
        focused: 0,
        focus() {
          this.focused++;
        },
      });
    return nodes.get(id);
  };
  globalThis.document = {
    getElementById: node,
    querySelector: () => node("play"),
  };
  t.after(() => (globalThis.document = old));
  let now = 10000,
    interval = null,
    run = null,
    ui;
  const calls = [],
    audios = [],
    writes = [];
  const quiz = {
    id: "q",
    name: "Draft Quiz",
    published: 0,
    updated: 1,
    best: 0,
    songs: 20,
  };
  const api = async (path, b) => {
    calls.push({ path, b });
    if (path === "quizzes") return { quizzes: [quiz] };
    if (path.startsWith("quiz-leaderboard"))
      return {
        rows: leaderboardRows,
        page: 1,
        total: leaderboardRows.length,
        hasMore: leaderboardRows.length > 20,
      };
    if (path.startsWith("quiz-answers"))
      return {
        answers: [
          "Bocchi the Rock!",
          "Boku no Hero Academia",
          "ぼっち・ざ・ろっく！",
        ],
        version: 1,
        hasMore: false,
      };
    if (path.startsWith("quiz-audio?"))
      return { version: 1, audio: ["https://example.com/a.mp3"] };
    if (path.startsWith("quiz-run")) return { now, run };
    if (path === "quiz-start")
      run = {
        id: "run",
        startedAt: now,
        index: 0,
        score: 0,
        preview: true,
        startsAt: null,
        endsAt: null,
        audio: "https://example.com/a.mp3",
        sample: 0.5,
      };
    if (path === "quiz-next")
      run = {
        ...run,
        index: run.index + 1,
        answered: false,
        startsAt: null,
        endsAt: null,
      };
    if (path === "quiz-restart")
      run = {
        ...run,
        id: "restarted",
        startedAt: now,
        index: 0,
        score: 0,
        answered: false,
        startsAt: null,
        endsAt: null,
      };
    if (path === "quiz-ready")
      run = { ...run, startsAt: now + 2000, endsAt: now + 22000 };
    if (path === "quiz-answer")
      run = {
        ...run,
        answered: true,
        answer: "Bocchi the Rock!",
        submittedAnswer: b.skip ? "" : b.answer || "",
        correct: b.answer === "Bocchi the Rock!",
        score: b.answer === "Bocchi the Rock!" ? 1 : 0,
      };
    return { now, run };
  };
  ui = createQuizUI({
    api,
    audioCache,
    escape,
    getState: () => ({ me: { id: "host" } }),
    onRender: () => {
      ui.render();
      ui.mount();
    },
    onWallet: () => {},
    storage: { getItem: () => saved, setItem: (...a) => writes.push(a) },
    clock: {
      now: () => now,
      every: (fn) => ((interval = fn), 1),
      cancel: () => {
        interval = null;
      },
    },
    audioFactory: (src) => {
      const listeners = {};
      const audio = {
        src,
        volume: 0,
        duration: 120,
        currentTime: 0,
        seeking: false,
        readyState: 4,
        plays: 0,
        paused: 0,
        addEventListener: (event, fn) => (listeners[event] = fn),
        pause() {
          this.paused++;
        },
        play() {
          this.plays++;
          return blocked ? Promise.reject(Error("gesture")) : Promise.resolve();
        },
        emit: async (event) => {
          await listeners[event]?.();
        },
      };
      audios.push(audio);
      return audio;
    },
  });
  t.after(() => ui.stop());
  const button = (name, value = "") => ({
    hasAttribute: (k) => k === name,
    dataset: {
      quizOpen: value,
      quizAction: value,
      quizAnswerOption: value,
      quizLeaderboard: value,
      quizRankPage: value,
    },
  });
  return {
    ui,
    calls,
    audios,
    writes,
    node,
    button,
    advance: async (ms) => {
      now += ms;
      interval?.();
      await flush();
    },
    start: async () => {
      await ui.load();
      assert.match(ui.render(), /Draft · Hosts Only/);
      await ui.click(button("data-quiz-open", "q"));
      await ui.click(button("data-quiz-action", "quiz-start"));
      await audios.at(-1).emit("loadedmetadata");
      await audios.at(-1).emit("canplay");
      await flush();
    },
  };
}
test("title suggestions rank immediate prefix matches and normalize accents without dropping native titles", () => {
  assert.deepEqual(
    quizAnswerOptions(
      ["My Hero Academia", "Boku no Hero Academia", "Bocchi the Rock!"],
      "bo",
    ),
    ["Boku no Hero Academia", "Bocchi the Rock!"],
  );
  assert.deepEqual(
    quizAnswerOptions(["Pokémon", "ぼっち・ざ・ろっく！"], "pokemon"),
    ["Pokémon"],
  );
  assert.deepEqual(quizAnswerOptions(["ぼっち・ざ・ろっく！"], "ぼっち"), [
    "ぼっち・ざ・ろっく！",
  ]);
});
test("quiz starts at 30% volume, waits two seconds, autoplays, and submits the typed answer once after20 seconds", async (t) => {
  const f = fixture(t);
  await f.start();
  assert.equal(f.audios[0].volume, 0.3);
  assert.equal(f.audios[0].plays, 0);
  assert.match(f.node("quiz-time-left").textContent, /Starts in 2s/);
  assert.equal(f.node("quiz-answer").disabled, true);
  await f.advance(2000);
  assert.equal(f.audios[0].plays, 1);
  assert.equal(f.node("quiz-answer").disabled, false);
  f.node("quiz-answer").value = "Bocchi the Rock!";
  await f.advance(20000);
  await f.advance(1000);
  const answers = f.calls.filter((c) => c.path === "quiz-answer");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].b.answer, "Bocchi the Rock!");
  assert.match(f.ui.render(), /Score<\/span><strong>1 \/ 20/);
});
test("dropdown filters without per-keystroke requests, Enter locks the selected title, and volume persists including mute", async (t) => {
  const f = fixture(t, { saved: "0" });
  await f.start();
  assert.equal(f.audios[0].volume, 0);
  await f.advance(2000);
  const input = f.node("quiz-answer");
  input.value = "bo";
  const before = f.calls.length;
  await f.ui.input(input);
  assert.equal(f.calls.length, before);
  assert.equal(f.node("quiz-suggestions").hidden, false);
  assert.match(f.node("quiz-suggestions").innerHTML, /role="option"/);
  assert.match(f.node("quiz-suggestions").innerHTML, /Bocchi/);
  f.ui.setVolume(65);
  assert.equal(f.audios[0].volume, 0.65);
  assert.deepEqual(f.writes.at(-1), ["amqtours-quiz-volume", "65"]);
  let prevented = 0;
  f.ui.key({
    target: input,
    key: "ArrowDown",
    preventDefault() {
      prevented++;
    },
  });
  f.ui.key({
    target: input,
    key: "Enter",
    preventDefault() {
      prevented++;
    },
  });
  await flush();
  assert.equal(input.value, "Bocchi the Rock!");
  assert.equal(prevented, 2);
  assert.equal(f.calls.filter((c) => c.path === "quiz-answer").length, 1);
});
test("blocked autoplay exposes an explicit audio control and readiness does not repeatedly hit the server", async (t) => {
  const f = fixture(t, { blocked: true });
  await f.start();
  await f.audios[0].emit("canplay");
  await f.audios[0].emit("seeked");
  assert.equal(f.calls.filter((c) => c.path === "quiz-ready").length, 1);
  await f.advance(2000);
  assert.equal(f.node("play").hidden, false);
  assert.equal(f.node("play").textContent, "Enable Audio");
  assert.equal(f.audios[0].plays, 1);
  await f.advance(200);
  assert.equal(f.audios[0].plays, 1);
});

test("the countdown panel drains with the clock, contains its numeric time, and hides routine playback text", async (t) => {
  const f = fixture(t);
  await f.start();
  await f.advance(12000);
  assert.equal(f.node("quiz-time-left").textContent, "10s");
  assert.equal(f.node("quiz-time-progress").style["--quiz-time"], "50%");
  assert.equal(f.node("quiz-time-progress").attrs["aria-valuenow"], "10.0");
  assert.equal(f.node("quiz-audio-status").hidden, true);
  const html = f.ui.render();
  assert.match(html, /quiz-countdown-meter/);
  assert.doesNotMatch(html, /quiz-sound-symbol|100% Title:|20 Songs ·/);
  assert.equal((html.match(/id="quiz-volume"/g) || []).length, 1);
});

test("new songs autofocus once, Enter advances the revealed answer once, and Restart is available before and after answering", async (t) => {
  const f = fixture(t);
  await f.start();
  assert.equal(f.node("quiz-answer").focused, 0);
  await f.advance(2000);
  assert.equal(f.node("quiz-answer").focused, 1);
  await f.advance(400);
  assert.equal(f.node("quiz-answer").focused, 1);
  assert.match(f.ui.render(), /Restart Quiz/);
  await f.ui.submit({ elements: { answer: { value: "Bocchi the Rock!" } } });
  assert.match(f.ui.render(), /Next Song \(Enter\)/);
  assert.match(f.ui.render(), /Restart Quiz/);
  let prevented = 0;
  f.ui.key({
    key: "Enter",
    target: { closest: () => null },
    preventDefault() {
      prevented++;
    },
  });
  await flush();
  assert.equal(prevented, 1);
  assert.equal(f.calls.filter((c) => c.path === "quiz-next").length, 1);
  assert.match(f.ui.render(), /Song 2 of 20/);
  await f.ui.click(f.button("data-quiz-action", "quiz-restart"));
  assert.match(f.ui.render(), /Song 1 of 20/);
});
test("leaderboard-only navigation never starts or resumes audio or a quiz run", async (t) => {
  const f = fixture(t);
  await f.ui.load();
  await f.ui.click(f.button("data-quiz-leaderboard", "q"));
  assert.match(f.ui.render(), /Leaderboard/);
  assert.equal(f.audios.length, 0);
  assert.equal(
    f.calls.filter(
      (c) => c.path.startsWith("quiz-run") || c.path === "quiz-start",
    ).length,
    0,
  );
});

test("Enter locks the first match by default and the arrow-highlighted match when explicitly selected", async (t) => {
  const f = fixture(t);
  await f.start();
  await f.advance(2000);
  const input = f.node("quiz-answer");
  input.value = "bo";
  await f.ui.input(input);
  const press = (key) => f.ui.key({ key, target: input, preventDefault() {} });
  press("Enter");
  await flush();
  assert.equal(
    f.calls.filter((c) => c.path === "quiz-answer").at(-1).b.answer,
    "Bocchi the Rock!",
  );
  await f.ui.click(f.button("data-quiz-action", "quiz-restart"));
  await f.audios.at(-1).emit("loadedmetadata");
  await f.audios.at(-1).emit("canplay");
  await flush();
  await f.advance(2000);
  input.value = "bo";
  await f.ui.input(input);
  const beforeArrows = f.calls.length;
  press("ArrowDown");
  assert.equal(input.value, "Bocchi the Rock!");
  press("ArrowDown");
  assert.equal(input.value, "Boku no Hero Academia");
  press("ArrowUp");
  assert.equal(input.value, "Bocchi the Rock!");
  assert.equal(f.calls.length, beforeArrows);
  assert.match(f.node("quiz-suggestions").innerHTML, /Boku no Hero Academia/);
  press("ArrowDown");
  press("Enter");
  await flush();
  const answers = f.calls.filter((c) => c.path === "quiz-answer");
  assert.equal(answers.length, 2);
  assert.equal(answers.at(-1).b.answer, "Boku no Hero Academia");
});

test("answer reveals distinguish correct and incorrect glow states and escape the submitted text", async (t) => {
  const f = fixture(t);
  await f.start();
  await f.advance(2000);
  await f.ui.submit({ elements: { answer: { value: "Bocchi the Rock!" } } });
  let html = f.ui.render();
  assert.match(html, /quiz-question is-correct/);
  assert.match(html, /Your Answer/);
  assert.match(html, /Correct Answer/);
  assert.match(html, /Bocchi the Rock!/);
  await f.ui.click(f.button("data-quiz-action", "quiz-restart"));
  await f.audios.at(-1).emit("loadedmetadata");
  await f.audios.at(-1).emit("canplay");
  await flush();
  await f.advance(2000);
  await f.ui.submit({ elements: { answer: { value: "<My & Guess>" } } });
  html = f.ui.render();
  assert.match(html, /quiz-question is-incorrect/);
  assert.ok(html.includes("&lt;My &amp; Guess>"));
  assert.ok(!html.includes("<My & Guess>"));
});

test("quiz performance sorting uses personal best, keeps ties stable and preserves source order", async () => {
  const quizzes = [
    { id: "mid", name: "Middle Quiz", best: 10, songs: 20, published: true },
    { id: "low", name: "Low Quiz", best: 0, songs: 20, published: true },
    { id: "high", name: "High Quiz", best: 20, songs: 20, published: true },
    { id: "tie", name: "Tied Quiz", best: 10, songs: 20, published: false },
  ];
  let requests = 0,
    renders = 0;
  const ui = createQuizUI({
    api: async () => {
      requests++;
      return { quizzes };
    },
    escape,
    getState: () => ({ me: { id: "player" } }),
    onRender: () => renders++,
    storage: { getItem: () => null },
  });
  await ui.load();
  const order = () =>
    [...ui.render().matchAll(/data-quiz-open="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order(), ["mid", "low", "high", "tie"]);
  assert.match(ui.render(), /Sort By<select id="quiz-sort">/);
  ui.setSort("best-desc");
  assert.deepEqual(order(), ["high", "mid", "tie", "low"]);
  assert.match(ui.render(), /value="best-desc" selected/);
  ui.setSort("best-asc");
  assert.deepEqual(order(), ["low", "mid", "tie", "high"]);
  ui.setSort("invalid");
  assert.deepEqual(order(), ["low", "mid", "tie", "high"]);
  ui.setSort("recent");
  assert.deepEqual(order(), ["mid", "low", "high", "tie"]);
  assert.equal(requests, 1);
  assert.equal(renders, 3);
  assert.deepEqual(
    quizzes.map((q) => q.id),
    ["mid", "low", "high", "tie"],
  );
});

test("Singers and Composers tabs filter identical-format quiz tiles without extra requests", async () => {
  const list = [
    { id: "s", name: "Singer Tile", songs: 20, best: 4, published: 1 },
    {
      id: "c",
      name: "Composer Tile",
      category: "composers",
      songs: 20,
      best: 9,
      published: 1,
    },
  ];
  let calls = 0;
  const ui = createQuizUI({
    api: async () => {
      calls++;
      return { quizzes: list };
    },
    escape,
    getState: () => ({ me: { id: "p" } }),
    onRender: () => {},
    onWallet: () => {},
  });
  await ui.load();
  assert.match(ui.render(), /Singer Tile/);
  assert.doesNotMatch(ui.render(), /Composer Tile/);
  await ui.click({
    hasAttribute: (k) => k === "data-quiz-category",
    dataset: { quizCategory: "composers" },
  });
  assert.match(ui.render(), /Composer Tile/);
  assert.doesNotMatch(ui.render(), /Singer Tile/);
  assert.equal(calls, 1);
  ui.stop();
});

test("leaderboards show precise completion times and explicitly label missing legacy timings", async (t) => {
  const f = fixture(t, {
    leaderboardRows: [
      { id: "p", name: "Fast <Player>", best: 20, bestAt: 1, durationMs: 1250 },
      { id: "q", name: "Legacy", best: 20, bestAt: 2, durationMs: null },
    ],
  });
  await f.ui.load();
  await f.ui.click(f.button("data-quiz-leaderboard", "q"));
  const html = f.ui.render();
  assert.match(html, /<th>Time Taken<\/th>/);
  assert.match(html, /0:01.250/);
  assert.match(html, /Not Recorded/);
  assert.match(html, /Fast &lt;Player>/);
  assert.doesNotMatch(html, /Fast <Player>/);
});

test("elapsed quiz clock advances through guesses and answer review, survives reload, and resets on restart", async (t) => {
  const f = fixture(t);
  await f.start();
  assert.match(f.ui.render(), /Elapsed Quiz Time/);
  await f.advance(5000);
  assert.equal(f.node("quiz-elapsed").textContent, "0:05");
  await f.ui.click(f.button("data-quiz-answer-option", "0"));
  await f.advance(3000);
  assert.equal(f.node("quiz-elapsed").textContent, "0:08");
  await f.ui.load();
  f.ui.mount();
  await f.advance(2000);
  assert.equal(f.node("quiz-elapsed").textContent, "0:10");
  await f.ui.click(f.button("data-quiz-action", "quiz-restart"));
  assert.equal(f.node("quiz-elapsed").textContent, "0:00");
});

test("Competitive loading completes before starting the scored clock and cancellation never starts a run", async (t) => {
  let done, signal;
  const cached = {
    url: () => "blob:cached",
    prepare: async (sources, server, options) => {
      signal = options.signal;
      options.onProgress({ loaded: 0, total: 1, bytes: 0 });
      await new Promise((resolve) => (done = resolve));
      signal.throwIfAborted();
    },
  };
  const f = fixture(t, { audioCache: cached });
  await f.ui.load();
  await f.ui.click(f.button("data-quiz-open", "q"));
  f.ui.setServer("NAW");
  assert.ok(
    f.writes.some(
      ([key, value]) => key === "amqtours-quiz-server" && value === "NAW",
    ),
  );
  f.ui.setCompetitive(true);
  const start = f.ui.click(f.button("data-quiz-action", "quiz-start"));
  await flush();
  assert.match(f.ui.render(), /Loading Quiz Audio/);
  assert.equal(f.calls.filter((c) => c.path === "quiz-start").length, 0);
  done();
  await start;
  assert.equal(f.calls.filter((c) => c.path === "quiz-start").length, 1);
  assert.equal(f.audios.at(-1).src, "blob:cached");
  const restart = f.ui.click(f.button("data-quiz-action", "quiz-restart"));
  await flush();
  await f.ui.click(f.button("data-quiz-download-cancel"));
  done();
  await restart;
  assert.equal(signal.aborted, true);
  assert.equal(f.calls.filter((c) => c.path === "quiz-restart").length, 0);
});
