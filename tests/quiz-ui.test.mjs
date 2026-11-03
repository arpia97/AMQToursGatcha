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
  { blocked = false, saved = null, leaderboardRows = [] } = {},
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
    if (path.startsWith("quiz-run")) return { now, run };
    if (path === "quiz-start")
      run = {
        id: "run",
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
        answer: b.answer,
        correct: b.answer === "Bocchi the Rock!",
        score: b.answer === "Bocchi the Rock!" ? 1 : 0,
      };
    return { now, run };
  };
  ui = createQuizUI({
    api,
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
    setScore: (score) => (run.score = score),
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
test("dropdown filters without per-keystroke requests, keyboard chooses without submitting, and volume persists including mute", async (t) => {
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
  assert.equal(input.value, "Bocchi the Rock!");
  assert.equal(prevented, 2);
  assert.equal(f.calls.filter((c) => c.path === "quiz-answer").length, 0);
  f.ui.setVolume(65);
  assert.equal(f.audios[0].volume, 0.65);
  assert.deepEqual(f.writes.at(-1), ["amqtours-quiz-volume", "65"]);
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

test("the live score badge follows every established quiz rarity threshold", async (t) => {
  const f = fixture(t);
  await f.start();
  for (const [score, tier] of [
    [0, "d"],
    [3, "c"],
    [5, "b"],
    [8, "a"],
    [10, "s"],
    [13, "ss"],
    [15, "sss"],
    [18, "ubers"],
    [20, "ag"],
  ]) {
    f.setScore(score);
    assert.match(f.ui.render(), new RegExp("quiz-score tier-" + tier + '"'));
  }
});

test("quiz keeps a visible top-20 sidebar and button controls without dropdowns, paging or ranking prose", async (t) => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: "p" + i,
    name: "Collector " + (i + 1),
    best: 20 - Math.floor(i / 2),
    bestAt: 1000 + i,
  }));
  const f = fixture(t, { leaderboardRows: rows });
  await f.start();
  const html = f.ui.render();
  assert.match(html, /quiz-play-layout/);
  assert.match(html, /<aside class="quiz-leaderboard"/);
  assert.match(html, /Top 20/);
  assert.ok(html.includes("Collector 20</a>"));
  assert.ok(!html.includes("Collector 21</a>"));
  assert.doesNotMatch(
    html,
    /Highest score first|Ties go to|data-quiz-rank-page|<details class="quiz-leaderboard"/,
  );
  assert.match(
    html,
    /class="button secondary" data-quiz-action="quiz-restart"/,
  );
  assert.match(html, /class="button secondary" data-quiz-back/);
  assert.equal(
    f.calls.filter((c) => c.path.startsWith("quiz-leaderboard")).length,
    1,
  );
});

test("Enter locks the only dropdown answer once without arrow selection or submitting the typed prefix", async (t) => {
  const f = fixture(t);
  await f.start();
  await f.advance(2000);
  const input = f.node("quiz-answer");
  input.value = "boc";
  await f.ui.input(input);
  let prevented = 0;
  const key = {
    key: "Enter",
    target: input,
    preventDefault() {
      prevented++;
    },
  };
  f.ui.key(key);
  f.ui.key({ ...key, repeat: true });
  await flush();
  assert.equal(input.value, "Bocchi the Rock!");
  assert.equal(prevented, 2);
  const answers = f.calls.filter((c) => c.path === "quiz-answer");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].b.answer, "Bocchi the Rock!");
  assert.equal(f.node("quiz-suggestions").hidden, true);
  assert.match(f.ui.render(), /Correct!/);
});
test("arrow navigation previews each option in the input while retaining the original matches", async (t) => {
  const f = fixture(t);
  await f.start();
  await f.advance(2000);
  const input = f.node("quiz-answer");
  input.value = "bo";
  await f.ui.input(input);
  const before = f.calls.length;
  const arrow = (key) => f.ui.key({ key, target: input, preventDefault() {} });
  arrow("ArrowDown");
  assert.equal(input.value, "Bocchi the Rock!");
  arrow("ArrowDown");
  assert.equal(input.value, "Boku no Hero Academia");
  assert.equal(input.attrs["aria-activedescendant"], "quiz-option-1");
  arrow("ArrowUp");
  assert.equal(input.value, "Bocchi the Rock!");
  assert.equal(f.calls.length, before);
  assert.match(f.node("quiz-suggestions").innerHTML, /Boku no Hero Academia/);
});
