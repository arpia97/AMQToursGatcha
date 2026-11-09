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
  {
    blocked = false,
    saved = null,
    leaderboardRows = [],
    leaderboardMe = null,
    audioCache,
    transitions = false,
  } = {},
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
    querySelector: (selector) =>
      transitions
        ? selector === ".quiz-play-main > .quiz-question"
          ? node("question")
          : selector === '[data-quiz-action="quiz-next"]'
            ? node("next")
            : selector === '[data-quiz-action="quiz-stop"]'
              ? node("stop")
              : selector === "[data-quiz-skip]"
                ? node("skip")
                : node("play")
        : node("play"),
  };
  t.after(() => (globalThis.document = old));
  let now = 10000,
    interval = null,
    run = null,
    loseAnswerResponse = false,
    finishOnNext = false,
    ui;
  const calls = [],
    audios = [],
    writes = [],
    renders = [],
    gates = new Map();
  const quiz = {
    id: "q",
    name: "Draft Quiz",
    published: 0,
    updated: 1,
    best: 0,
    songs: 20,
  };
  const api = async (path, b, key) => {
    calls.push({ path, b, key });
    if (gates.has(path)) await gates.get(path);
    if (path === "quizzes") return { quizzes: [quiz] };
    if (path.startsWith("quiz-leaderboard"))
      return {
        rows: leaderboardRows,
        me: leaderboardMe,
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
    if (path.startsWith("quiz-songs?"))
      return {
        id: "q",
        name: "Draft Quiz",
        updated: 1,
        songs: [
          {
            id: 0,
            title: "Seishun <Complex>",
            artist: "Kessoku Band",
            anime: "Bocchi the Rock!",
            answers: ["Bocchi the Rock!"],
          },
          {
            id: 1,
            title: "Guitar, Loneliness and Blue Planet",
            artist: "",
            anime: "Bocchi the Rock!",
            answers: ["Bocchi the Rock!"],
          },
        ],
      };
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
    if (path === "quiz-stop") run = null;
    if (path === "quiz-next")
      run = {
        ...run,
        index: run.index + 1,
        answered: false,
        startsAt: null,
        endsAt: null,
        ...(finishOnNext
          ? {
              finished: true,
              reward: {
                best: 1,
                improvement: 50,
                milestones: 0,
                total: 50,
                title: "",
              },
            }
          : {}),
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
    if (path === "quiz-answer" && loseAnswerResponse) {
      loseAnswerResponse = false;
      throw Object.assign(Error("The response was lost"), { retryable: true });
    }
    return { now, run };
  };
  ui = createQuizUI({
    api,
    audioCache,
    escape,
    getState: () => ({ me: { id: "host" } }),
    onRender: (options) => {
      renders.push(options?.questionOnly ? "question" : "page");
      if (transitions && options?.questionOnly && ui.updateQuestion()) return;
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
      quizSongs: value,
      quizRankPage: value,
    },
  });
  return {
    ui,
    calls,
    renders,
    loseAnswerResponse() {
      loseAnswerResponse = true;
    },
    finishNext() {
      finishOnNext = true;
    },
    hold(path) {
      let release, reject;
      gates.set(
        path,
        new Promise((resolve, fail) => {
          release = resolve;
          reject = fail;
        }),
      );
      return {
        release: () => {
          gates.delete(path);
          release();
        },
        reject: (error) => {
          gates.delete(path);
          reject(error);
        },
      };
    },
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
  assert.equal(f.node("quiz-time-progress").style["--quiz-progress"], "0.5");
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

test("quiz sorting covers performance, names, unplayed runs and pool size without mutating source order", async () => {
  const quizzes = [
    {
      id: "mid",
      name: "Middle Quiz",
      best: 10,
      songs: 20,
      played: true,
      published: true,
    },
    {
      id: "low",
      name: "Low Quiz",
      best: 0,
      songs: 50,
      played: true,
      published: true,
    },
    {
      id: "high",
      name: "High Quiz",
      best: 20,
      songs: 30,
      played: true,
      published: true,
    },
    {
      id: "tie",
      name: "Tied Quiz",
      best: 10,
      songs: 20,
      played: false,
      published: false,
    },
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
  ui.setSort("name");
  assert.deepEqual(order(), ["high", "low", "mid", "tie"]);
  ui.setSort("unplayed");
  assert.deepEqual(order(), ["tie", "mid", "low", "high"]);
  ui.setSort("pool-desc");
  assert.deepEqual(order(), ["low", "high", "mid", "tie"]);
  ui.setSort("pool-asc");
  assert.deepEqual(order(), ["mid", "tie", "high", "low"]);
  ui.setSort("best-asc");
  ui.setSort("invalid");
  assert.deepEqual(order(), ["low", "mid", "tie", "high"]);
  ui.setSort("recent");
  assert.deepEqual(order(), ["mid", "low", "high", "tie"]);
  assert.equal(requests, 1);
  assert.equal(renders, 8);
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

test("Quiz transitions patch only the question; readiness keeps the existing form and pending/failing actions unlock safely", async (t) => {
  const f = fixture(t, { transitions: true });
  await f.start();
  const pages = f.renders.filter((x) => x === "page").length;
  assert.equal(
    pages,
    2,
    "open and start only; audio readiness must not rebuild the page",
  );
  await f.advance(2000);
  const focuses = f.node("quiz-answer").focused;
  await f.audios[0].emit("canplay");
  assert.equal(f.node("quiz-answer").focused, focuses);
  const gate = f.hold("quiz-answer");
  const answer = f.ui.submit({
    elements: { answer: { value: "Bocchi the Rock!" } },
  });
  assert.equal(f.node("quiz-lock-answer").textContent, "Locking Answer…");
  assert.equal(f.node("quiz-lock-answer").disabled, true);
  await f.ui.submit({ elements: { answer: { value: "duplicate" } } });
  gate.release();
  await answer;
  assert.match(f.node("question").outerHTML, /Correct!/);
  assert.equal(f.node("next").disabled, false);
  await f.ui.click(f.button("data-quiz-action", "quiz-next"));
  assert.match(f.node("question").outerHTML, /Song 2 of 20/);
  await f.audios.at(-1).emit("loadedmetadata");
  await f.audios.at(-1).emit("canplay");
  await flush();
  assert.equal(f.renders.filter((x) => x === "page").length, pages);
  assert.equal(f.renders.filter((x) => x === "question").length, 2);
  assert.equal(f.calls.filter((c) => c.path === "quiz-answer").length, 1);
  assert.equal(f.calls.filter((c) => c.path === "quiz-ready").length, 2);
  await f.ui.submit({ elements: { answer: { value: "wrong" } } });
  const failing = f.hold("quiz-next");
  const pending = f.ui.click(f.button("data-quiz-action", "quiz-next"));
  assert.equal(f.node("next").disabled, true);
  assert.equal(f.node("next").textContent, "Loading Next Song…");
  failing.reject(Error("Temporarily unavailable"));
  await assert.rejects(pending, /Temporarily unavailable/);
  assert.equal(f.node("next").disabled, false);
  assert.equal(f.node("next").textContent, "Next Song (Enter)");
  assert.match(f.node("question").outerHTML, /Incorrect/);
});

test("answer response loss recovers the saved reveal and unsaved retries retain the request key", async (t) => {
  const f = fixture(t, { transitions: true });
  await f.start();
  await f.advance(2000);
  f.loseAnswerResponse();
  const answer = { elements: { answer: { value: "Bocchi the Rock!" } } };
  await f.ui.submit(answer);
  assert.match(f.node("question").outerHTML, /Correct!/);
  assert.equal(f.calls.filter((c) => c.path === "quiz-answer").length, 1);
  assert.equal(f.node("next").disabled, false);
  await f.ui.click(f.button("data-quiz-action", "quiz-next"));
  await f.audios.at(-1).emit("loadedmetadata");
  await f.audios.at(-1).emit("canplay");
  await f.advance(2000);
  const audio = f.audios.at(-1),
    plays = audio.plays;
  const gate = f.hold("quiz-answer");
  const pending = f.ui.submit(answer);
  assert.ok(audio.paused > 0, "audio stops when the player locks an answer");
  gate.reject(Error("Network unavailable"));
  await assert.rejects(pending, /Network unavailable/);
  assert.equal(f.node("quiz-lock-answer").disabled, false);
  assert.equal(f.node("quiz-lock-answer").textContent, "Lock Answer →");
  assert.ok(audio.plays > plays, "an unsaved answer resumes guessing audio");
  await f.ui.submit(answer);
  const attempts = f.calls.filter((c) => c.path === "quiz-answer");
  assert.equal(attempts.length, 3);
  assert.equal(attempts[1].key, attempts[2].key);
  assert.notEqual(attempts[0].key, attempts[1].key);
  assert.match(f.node("question").outerHTML, /Correct!/);
  f.finishNext();
  const list = f.hold("quizzes"),
    ranks = f.hold("quiz-leaderboard?quiz=q&page=1");
  await f.ui.click(f.button("data-quiz-action", "quiz-next"));
  assert.match(f.ui.render(), /quiz-complete/);
  list.reject(Error("List temporarily unavailable"));
  ranks.reject(Error("Leaderboard temporarily unavailable"));
  await flush();
  assert.match(f.ui.render(), /quiz-complete/);
});

test("Stop Quiz pauses audio immediately, never submits an answer, stays stopped through failure, and retries back to the list", async (t) => {
  const f = fixture(t, { transitions: true });
  await f.start();
  await f.advance(2000);
  assert.match(f.ui.render(), />Stop Quiz<\/button>/);
  const audio = f.audios.at(-1),
    answers = f.calls.filter((c) => c.path === "quiz-answer").length;
  const gate = f.hold("quiz-stop");
  const stopping = f.ui.click(f.button("data-quiz-action", "quiz-stop"));
  assert.ok(audio.paused > 0);
  await f.advance(30000);
  assert.equal(f.calls.filter((c) => c.path === "quiz-answer").length, answers);
  gate.reject(Error("temporarily unavailable"));
  await assert.rejects(stopping, /Audio stopped.*temporarily unavailable/);
  assert.equal(f.node("stop").textContent, "Retry Stop Quiz");
  assert.equal(f.node("quiz-answer").disabled, true);
  const count = f.audios.length;
  f.ui.mount();
  await f.advance(30000);
  assert.equal(f.audios.length, count);
  await f.ui.click(f.button("data-quiz-action", "quiz-stop"));
  assert.match(f.ui.render(), /quiz-list-header/);
  assert.equal(f.ui.active(), false);
  assert.equal(f.calls.filter((c) => c.path === "quiz-answer").length, answers);
  await f.ui.click(f.button("data-quiz-open", "q"));
  assert.match(f.ui.render(), /Start Preview/);
});

test("Song List button next to Play Quiz opens a cached song-list popup and closes via button or Escape", async (t) => {
  const f = fixture(t);
  await f.ui.load();
  const grid = f.ui.render();
  assert.match(
    grid,
    /<div class="quiz-tile-actions"><button class="button mint" data-quiz-open="q">Preview Quiz →<\/button><button type="button" class="button secondary" data-quiz-songs="q">Song List<\/button><\/div>/,
  );
  await f.ui.click(f.button("data-quiz-songs", "q"));
  const popup = f.ui.render();
  assert.match(popup, /Draft Quiz · Song List/);
  assert.match(popup, /Seishun &lt;Complex>/);
  assert.doesNotMatch(popup, /Seishun <Complex>/);
  assert.match(popup, /Kessoku Band/);
  assert.match(popup, /Bocchi the Rock!/);
  assert.equal(
    f.calls.filter((c) => c.path === "quiz-songs?quiz=q").length,
    1,
  );
  await f.ui.click(f.button("data-quiz-songs-close"));
  assert.doesNotMatch(f.ui.render(), /quiz-songs-dialog/);
  await f.ui.click(f.button("data-quiz-leaderboard", "q"));
  assert.match(f.ui.render(), /data-quiz-songs="q">Song List<\/button>/);
  await f.ui.click(f.button("data-quiz-songs", "q"));
  assert.match(f.ui.render(), /quiz-songs-dialog/);
  assert.equal(
    f.calls.filter((c) => c.path === "quiz-songs?quiz=q").length,
    1,
    "reuses cached song list for unchanged quiz version",
  );
  let prevented = 0;
  f.ui.key({
    key: "Escape",
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(prevented, 1);
  assert.doesNotMatch(f.ui.render(), /quiz-songs-dialog/);
});

test("quiz leaderboard highlights the viewer when in Top 20 and appends a highlighted 21st row with placement, score and time when outside Top 20", async (t) => {
  const top20WithMe = fixture(t, {
    leaderboardRows: [
      { id: "p1", name: "Leader", best: 20, bestAt: 1000, durationMs: 35000 },
      { id: "host", name: "Me", best: 18, bestAt: 2000, durationMs: 42500 },
    ],
  });
  await top20WithMe.ui.click(top20WithMe.button("data-quiz-leaderboard", "q"));
  const inTopHtml = top20WithMe.ui.render();
  assert.match(
    inTopHtml,
    /<tr class="is-me" aria-current="true"><td>2<\/td><td><a href="#player\/host">Me<\/a><\/td><td title="Time Set: [^"]+"><strong>18 \/ 20<\/strong><\/td><td class="quiz-duration">0:42\.500<\/td><\/tr>/,
  );
  assert.doesNotMatch(inTopHtml, /is-outside-top/);

  const topRows = Array.from({ length: 20 }, (_, i) => ({
    id: "p" + (i + 1),
    name: "Player " + (i + 1),
    best: 20 - Math.floor(i / 5),
    bestAt: (i + 1) * 1000,
    durationMs: 30000 + i * 1000,
  }));
  const outsideTop20 = fixture(t, {
    leaderboardRows: topRows,
    leaderboardMe: {
      id: "host",
      name: "Me <Outside>",
      best: 14,
      bestAt: 50000,
      durationMs: 61250,
      rank: 24,
    },
  });
  await outsideTop20.ui.click(
    outsideTop20.button("data-quiz-leaderboard", "q"),
  );
  const outsideHtml = outsideTop20.ui.render();
  assert.equal((outsideHtml.match(/<tr/g) || []).length, 22);
  assert.match(
    outsideHtml,
    /<tr class="is-me is-outside-top" aria-current="true"><td>24<\/td><td><a href="#player\/host">Me &lt;Outside><\/a><\/td><td title="Time Set: [^"]+"><strong>14 \/ 20<\/strong><\/td><td class="quiz-duration">1:01\.250<\/td><\/tr>/,
  );
});
