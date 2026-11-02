import { quizRarity } from "./quiz-rules.js";
import { rarityClass } from "./card-display.js";
export function createQuizUI({ api, escape: e, getState, onRender, onWallet }) {
  let quizzes = [],
    selected = null,
    run = null,
    working = false,
    audio = null,
    audioKey = "",
    sampleStart = 0,
    queryVersion = 0,
    options = [],
    highlight = -1;
  function stop() {
    audio?.pause();
    audio = null;
    audioKey = "";
  }
  async function load() {
    quizzes = (await api("quizzes")).quizzes;
    if (selected && !quizzes.some((q) => q.id === selected)) {
      selected = null;
      run = null;
      stop();
    }
    if (selected && getState().me)
      run = (await api("quiz-run?quiz=" + encodeURIComponent(selected))).run;
  }
  function render() {
    if (!selected) {
      stop();
      return (
        '<div class="page-intro"><div><h1>Quiz</h1></div></div>' +
        (quizzes.length
          ? '<div class="quiz-grid">' +
            quizzes
              .map(
                (q) =>
                  `<article class="collect-card quiz-tile tier-${rarityClass(quizRarity(q.best))}">${q.cover ? `<img src="${e(q.cover)}" alt="${e(q.name)} Cover">` : '<div class="quiz-cover-placeholder" aria-hidden="true">♫</div>'}<div class="card-body"><h2>${e(q.name)}</h2><p>20 Songs · Personal Best ${q.best}/20</p><p>${q.songs} Songs in Pool</p>${q.title ? `<p class="form-hint">100% Title: ${e(q.title)}</p>` : ""}<button class="button mint" data-quiz-open="${e(q.id)}">${getState().me ? "Play Quiz →" : "Sign In to Play"}</button></div></article>`,
              )
              .join("") +
            "</div>"
          : '<section class="quiz-coming-soon"><span aria-hidden="true">♫</span><h2>Coming Soon</h2><p>Anime music quizzes are on the way.</p></section>') +
        '<details class="rarity-guide"><summary>Quiz Rewards</summary><h3>Personal-Best Payouts</h3><ul><li><strong>Per-Point Bonus:</strong> Earn 50 credits for every new personal-best point scored (capped at 1,000 credits per quiz).</li><li><strong>No Repeats:</strong> Reaching or repeating an existing high score awards 0 credits.</li></ul><h3>One-Time Milestones</h3><ul><li><strong>5 / 20:</strong> 100 credits</li><li><strong>10 / 20:</strong> 300 credits</li><li><strong>15 / 20:</strong> 500 credits</li><li><strong>20 / 20:</strong> 1,000 credits</li></ul><h3>Game Setup</h3><ul><li><strong>Format:</strong> Each quiz run consists of 20 random songs drawn from the pool.</li></ul></details>'
      );
    }
    const q = quizzes.find((q) => q.id === selected);
    if (!q) return "";
    const top = `<div class="section-head"><h1>${e(q.name)}</h1><button class="text-button" data-quiz-back>All Quizzes ←</button></div>`;
    if (!getState().me)
      return (
        top +
        '<p>Sign in to play quizzes and keep your progress.</p><button class="button" data-action="account">Sign In →</button>'
      );
    if (!run)
      return (
        top +
        '<p>20 random songs. Choose the anime title for each sample.</p><button class="button mint" data-quiz-action="quiz-start">Start Quiz →</button>'
      );
    if (run.finished) {
      stop();
      return (
        top +
        `<section class="quiz-complete tier-${rarityClass(quizRarity(run.score))}"><h2>Quiz Complete · ${run.score}/20</h2><p>Personal Best: ${run.reward.best}/20</p><p>New Best Bonus: ✦ ${run.reward.improvement} · Milestones: ✦ ${run.reward.milestones}</p><strong>+${run.reward.total} Credits</strong>${run.reward.title ? `<p>Title Unlocked: ${e(run.reward.title)}</p>` : ""}<p><button class="button mint" data-quiz-action="quiz-start">Play Again →</button></p></section>`
      );
    }
    return (
      top +
      `<section class="quiz-question"><div class="section-head"><h2>Song ${run.index + 1} of 20</h2><span>${run.score} Correct</span></div><div class="quiz-sound" aria-hidden="true">♫</div>${!run.answered ? '<button class="button secondary" data-quiz-play>Play Sample ▶</button><p class="form-hint" id="quiz-audio-status">25-Second Audio Sample</p>' : ""}${run.answered ? `<div class="notice"><strong>${run.correct ? "Correct!" : "Incorrect"}</strong><p>${e(run.answer)}</p><small>${e(run.songTitle)} · ${e(run.artist)}</small></div><button class="button mint space-top" data-quiz-action="quiz-next">${run.index === 19 ? "Finish Quiz →" : "Next Song →"}</button>` : `<form id="quiz-answer-form" class="stack"><label>Anime Title<input id="quiz-answer" class="search" name="answer" role="combobox" aria-autocomplete="list" aria-controls="quiz-suggestions" aria-expanded="false" autocomplete="off" maxlength="300" placeholder="Start typing an anime title…"></label><ul id="quiz-suggestions" class="quiz-suggestions" role="listbox"></ul><button class="button mint" type="submit">Lock Answer →</button><button type="button" class="text-button" data-quiz-skip>Skip Song</button></form>`}</section>`
    );
  }
  function mount() {
    if (!selected || !run || run.finished || run.answered) {
      stop();
      return;
    }
    const key = run.id + ":" + run.index;
    if (key === audioKey) return;
    stop();
    audioKey = key;
    audio = new Audio(run.audio);
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      if (!audio || audioKey !== key) return;
      sampleStart = Number.isFinite(audio.duration)
        ? Math.max(0, (audio.duration - 25) * run.sample)
        : 0;
      audio.currentTime = sampleStart;
    });
    audio.addEventListener("timeupdate", () => {
      if (audio && audio.currentTime >= sampleStart + 25) audio.pause();
    });
    audio.addEventListener("error", () => {
      const el = document.getElementById("quiz-audio-status");
      if (el)
        el.textContent = "Audio could not load. Try playing the sample again.";
    });
    audio.play().catch(() => {});
  }
  async function mutate(action, answer) {
    if (working) return;
    working = true;
    const button = document.querySelector(
      "#quiz-answer-form button[type=submit]",
    );
    if (button) button.disabled = true;
    try {
      const result = await api(action, {
        quiz: selected,
        ...(run ? { run: run.id, index: run.index } : {}),
        ...(answer !== undefined ? { answer } : {}),
      });
      run = result.run;
      if (result.me) onWallet(result.me);
      if (run.finished) quizzes = (await api("quizzes")).quizzes;
      options = [];
      highlight = -1;
      onRender();
      mount();
    } finally {
      working = false;
      if (button?.isConnected) button.disabled = false;
    }
  }
  function drawSuggestions(input) {
    const list = document.getElementById("quiz-suggestions");
    if (!list) return;
    list.innerHTML = options
      .map(
        (o, i) =>
          `<li role="option" id="quiz-option-${i}" aria-selected="${highlight === i}"><button type="button" data-quiz-answer-option="${i}">${e(o)}</button></li>`,
      )
      .join("");
    input.setAttribute("aria-expanded", String(!!options.length));
    if (highlight >= 0)
      input.setAttribute("aria-activedescendant", "quiz-option-" + highlight);
    else input.removeAttribute("aria-activedescendant");
  }
  return {
    load,
    render,
    mount,
    stop,
    async click(button) {
      if (
        working &&
        (button.hasAttribute("data-quiz-open") ||
          button.hasAttribute("data-quiz-back"))
      )
        throw Error("Wait for the current answer to finish saving.");
      if (button.hasAttribute("data-quiz-open")) {
        selected = button.dataset.quizOpen;
        run = null;
        await load();
        onRender();
        mount();
        return true;
      }
      if (button.hasAttribute("data-quiz-back")) {
        selected = null;
        run = null;
        stop();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-action")) {
        await mutate(button.dataset.quizAction);
        return true;
      }
      if (button.hasAttribute("data-quiz-skip")) {
        await mutate("quiz-answer", "");
        return true;
      }
      if (button.hasAttribute("data-quiz-play")) {
        if (audio) {
          audio.currentTime = sampleStart;
          await audio.play();
        }
        return true;
      }
      if (button.hasAttribute("data-quiz-answer-option")) {
        const input = document.getElementById("quiz-answer");
        input.value = options[Number(button.dataset.quizAnswerOption)];
        options = [];
        highlight = -1;
        drawSuggestions(input);
        input.focus();
        return true;
      }
      return false;
    },
    async input(input) {
      const version = ++queryVersion,
        value = input.value;
      if (value.trim().length < 2) {
        options = [];
        highlight = -1;
        drawSuggestions(input);
        return;
      }
      const data = await api(
        "quiz-answers?quiz=" +
          encodeURIComponent(selected) +
          "&q=" +
          encodeURIComponent(value),
      );
      if (
        version !== queryVersion ||
        !input.isConnected ||
        input.value !== value
      )
        return;
      options = data.answers;
      highlight = -1;
      drawSuggestions(input);
    },
    key(event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (options.length)
          highlight =
            highlight < 0
              ? event.key === "ArrowDown"
                ? 0
                : options.length - 1
              : (highlight +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length;
        drawSuggestions(event.target);
      }
      if (event.key === "Escape") {
        options = [];
        highlight = -1;
        drawSuggestions(event.target);
      }
      if (event.key === "Enter" && highlight >= 0) {
        event.preventDefault();
        event.target.value = options[highlight];
        options = [];
        highlight = -1;
        drawSuggestions(event.target);
      }
    },
    submit: (form) => mutate("quiz-answer", form.elements.answer.value),
  };
}
