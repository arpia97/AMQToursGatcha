import { quizRarity, QUIZ_SONG_MS } from "./quiz-rules.js";
import { quizAnswerOptions } from "./quiz-autocomplete.js";
import { rarityClass } from "./card-display.js";

export function createQuizUI({
  api,
  escape: e,
  getState,
  onRender,
  onWallet,
  storage,
  audioFactory,
  clock,
}) {
  const time = clock || {
    now: () => Date.now(),
    every: (fn, ms) => setInterval(fn, ms),
    cancel: (id) => clearInterval(id),
  };
  const makeAudio = audioFactory || ((src) => new Audio(src));
  const banks = new Map();
  let quizzes = [],
    selected = null,
    run = null,
    working = false,
    audio = null,
    audioKey = "",
    generation = 0,
    leaderboardOnly = false,
    leaderboardData = null,
    quizSort = "recent",
    category = "singers";
  let sampleStart = 0,
    audioState = "loading",
    playAttempted = false,
    arming = false,
    timer = null,
    serverOffset = 0,
    answerFocused = false;
  let draft = "",
    draftKey = "",
    options = [],
    highlight = -1,
    suggestionsOpen = false,
    bank = null,
    timeoutAttempted = false,
    errorMessage = "";
  let volume = 30;
  try {
    storage = storage || globalThis.localStorage;
    const saved = storage?.getItem("amqtours-quiz-volume");
    if (saved !== null && saved !== undefined && Number.isFinite(Number(saved)))
      volume = Math.min(100, Math.max(0, Math.round(Number(saved))));
  } catch {}
  const serverNow = () => time.now() + serverOffset;
  async function call(path, body) {
    const sent = time.now(),
      result = await api(path, body),
      received = time.now();
    if (Number.isFinite(result.now))
      serverOffset = result.now - (sent + received) / 2;
    return result;
  }
  function useRun(value) {
    run = value;
    const key = run ? run.id + ":" + run.index : "";
    if (key !== draftKey) {
      draftKey = key;
      draft = "";
      options = [];
      highlight = -1;
      suggestionsOpen = false;
      errorMessage = "";
      answerFocused = false;
    }
  }
  function stop() {
    generation++;
    audio?.pause();
    audio = null;
    audioKey = "";
    arming = false;
    if (timer !== null) time.cancel(timer);
    timer = null;
  }
  async function loadBank(q) {
    const key = q.id + ":" + q.updated;
    if (banks.has(key)) {
      bank = banks.get(key);
      return;
    }
    const entry = { answers: [], complete: false, error: "" };
    banks.set(key, entry);
    bank = entry;
    try {
      let page = 1,
        version = null;
      for (;;) {
        const data = await call(
          "quiz-answers?bank=1&quiz=" +
            encodeURIComponent(q.id) +
            "&page=" +
            page,
        );
        if (version !== null && data.version !== version)
          throw Error("The quiz pool changed. Reopen it to refresh titles.");
        version = data.version;
        entry.answers.push(...data.answers);
        if (!data.hasMore) break;
        page++;
      }
      entry.answers = [...new Set(entry.answers)];
      entry.complete = true;
    } catch (err) {
      entry.error = err.message;
      banks.delete(key);
    }
  }
  async function load() {
    quizzes = (await call("quizzes")).quizzes;
    if (selected && !quizzes.some((q) => q.id === selected)) {
      selected = null;
      useRun(null);
      stop();
    }
    if (selected) {
      if (!leaderboardOnly) {
        if (getState().me)
          useRun(
            (await call("quiz-run?quiz=" + encodeURIComponent(selected))).run,
          );
        else useRun(null);
        await loadBank(quizzes.find((q) => q.id === selected));
      } else {
        useRun(null);
        stop();
      }
      leaderboardData = await call(
        "quiz-leaderboard?quiz=" + encodeURIComponent(selected) + "&page=1",
      );
    }
  }

  const volumeControl = () =>
    '<label class="quiz-volume-control">Volume<input id="quiz-volume" type="range" min="0" max="100" step="1" value="' +
    volume +
    '" aria-label="Quiz Volume"><output id="quiz-volume-value">' +
    volume +
    "%</output></label>";
  const guide =
    '<details class="rarity-guide"><summary>Quiz Rewards</summary><h3>Personal-Best Payouts</h3><ul><li><strong>Per-Point Bonus:</strong> Earn 50 credits for every new personal-best point scored (capped at 1,000 credits per quiz).</li><li><strong>No Repeats:</strong> Reaching or repeating an existing high score awards 0 credits.</li></ul><h3>One-Time Milestones</h3><ul><li><strong>5 / 20:</strong> 100 credits</li><li><strong>10 / 20:</strong> 300 credits</li><li><strong>15 / 20:</strong> 500 credits</li><li><strong>20 / 20:</strong> 1,000 credits</li></ul><h3>Game Setup</h3><ul><li><strong>Format:</strong> Each quiz run consists of 20 random songs drawn from the pool, with 20 seconds per song.</li></ul></details>';
  function leaderboardHTML() {
    const rows = (leaderboardData?.rows || [])
      .slice(0, 20)
      .map((p, i) => {
        const achieved =
          new Date(p.bestAt).toLocaleString("en-GB", {
            timeZone: "Asia/Seoul",
          }) + " KST";
        return (
          "<tr><td>" +
          (i + 1) +
          '</td><td><a href="#player/' +
          encodeURIComponent(p.id) +
          '">' +
          e(p.name) +
          '</a></td><td title="First Achieved: ' +
          e(achieved) +
          '"><strong>' +
          p.best +
          " / 20</strong></td></tr>"
        );
      })
      .join("");
    return (
      '<aside class="quiz-leaderboard" aria-label="Quiz Leaderboard"><div class="section-head"><h2>Leaderboard</h2><span class="subtext">Top 20</span></div>' +
      (rows
        ? '<div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Best Score</th></tr></thead><tbody>' +
          rows +
          "</tbody></table></div>"
        : '<p class="notice">No completed scores yet.</p>') +
      "</aside>"
    );
  }
  function render() {
    if (!selected) {
      stop();
      const visibleQuizzes = quizzes.filter(
        (q) => (q.category || "singers") === category,
      );
      const sortControl = quizzes.length
        ? '<label class="quiz-sort-control">Sort By<select id="quiz-sort">' +
          [
            ["recent", "Recently Updated"],
            ["best-desc", "Performance · Highest First"],
            ["best-asc", "Performance · Lowest First"],
          ]
            .map(
              ([value, label]) =>
                '<option value="' +
                value +
                '"' +
                (quizSort === value ? " selected" : "") +
                ">" +
                label +
                "</option>",
            )
            .join("") +
          "</select></label>"
        : "";
      return (
        '<div class="page-intro quiz-list-header"><h1>Quiz</h1>' +
        sortControl +
        "</div>" +
        `<div class="tabs quiz-categories" role="group" aria-label="Quiz Categories">${["singers", "composers"].map((c) => `<button type="button" class="tab ${category === c ? "active" : ""}" data-quiz-category="${c}" aria-pressed="${category === c}">${c === "singers" ? "Singers" : "Composers"}</button>`).join("")}</div>` +
        (visibleQuizzes.length
          ? '<div class="quiz-grid">' +
            [...visibleQuizzes]
              .sort((a, b) =>
                quizSort === "best-desc"
                  ? b.best - a.best
                  : quizSort === "best-asc"
                    ? a.best - b.best
                    : 0,
              )
              .map(
                (q) =>
                  '<article class="collect-card quiz-tile tier-' +
                  rarityClass(quizRarity(q.best)) +
                  '">' +
                  (q.cover
                    ? '<img src="' +
                      e(q.cover) +
                      '" alt="' +
                      e(q.name) +
                      ' Cover">'
                    : '<div class="quiz-cover-placeholder" aria-hidden="true">♫</div>') +
                  '<div class="card-body">' +
                  (!q.published
                    ? '<span class="quiz-draft-badge">Draft · Hosts Only</span>'
                    : "") +
                  "<h2>" +
                  e(q.name) +
                  "</h2><p>Personal Best " +
                  q.best +
                  "/20</p><p>" +
                  q.songs +
                  " Songs in Pool</p>" +
                  '<button class="button mint" data-quiz-open="' +
                  e(q.id) +
                  '">' +
                  (!getState().me
                    ? "Sign In to Play"
                    : q.published
                      ? "Play Quiz →"
                      : "Preview Quiz →") +
                  '</button><button class="text-button quiz-leaderboard-link" data-quiz-leaderboard="' +
                  e(q.id) +
                  '">Leaderboard ↗</button></div></article>',
              )
              .join("") +
            "</div>"
          : '<section class="quiz-coming-soon"><span aria-hidden="true">♫</span><h2>Coming Soon</h2><p>Anime music quizzes are on the way.</p></section>') +
        guide
      );
    }
    const q = quizzes.find((q) => q.id === selected);
    if (!q) return "";
    const preview = !q.published || run?.preview;
    let top =
      '<div class="section-head"><div><h1>' +
      e(q.name) +
      "</h1>" +
      (preview
        ? '<p class="quiz-preview-note">Host Preview · No Rewards or Personal-Best Changes</p>'
        : "") +
      '</div><div class="quiz-top-controls">' +
      (!leaderboardOnly ? volumeControl() : "") +
      (!leaderboardOnly && run && !run.finished
        ? '<button type="button" class="button secondary" data-quiz-action="quiz-restart">Restart Quiz ↻</button>'
        : "") +
      '<button class="button secondary" data-quiz-back>All Quizzes ←</button></div></div>';
    if (leaderboardOnly)
      return (
        top +
        leaderboardHTML() +
        '<button class="button mint space-top" data-quiz-enter>Play Quiz →</button>'
      );
    const withLeaderboard = (content) =>
      top +
      '<div class="quiz-play-layout"><div class="quiz-play-main">' +
      content +
      "</div>" +
      leaderboardHTML() +
      "</div>";
    if (!getState().me)
      return withLeaderboard(
        '<p>Sign in to play quizzes and keep your progress.</p><button class="button" data-action="account">Sign In →</button>',
      );
    if (!run) {
      stop();
      return withLeaderboard(
        "<p>20 Seconds Per Song · Two-Second Starting Countdown</p>" +
          (q.songs < 20
            ? '<p class="notice space-top">Add at least 20 songs before previewing this quiz.</p>'
            : '<button class="button mint space-top" data-quiz-action="quiz-start">' +
              (preview ? "Start Preview →" : "Start Quiz →") +
              "</button>"),
      );
    }
    if (run.finished) {
      stop();
      return withLeaderboard(
        '<section class="quiz-complete tier-' +
          rarityClass(quizRarity(run.score)) +
          '"><h2>' +
          (preview ? "Preview Complete" : "Quiz Complete") +
          " · " +
          run.score +
          "/20</h2>" +
          (preview
            ? "<p>Test Score Only · No Credits Awarded</p>"
            : "<p>Personal Best: " +
              run.reward.best +
              "/20</p><p>New Best Bonus: ✦ " +
              run.reward.improvement +
              " · Milestones: ✦ " +
              run.reward.milestones +
              '</p><strong class="quiz-credit-gain">+' +
              run.reward.total +
              " Credits</strong>") +
          (run.reward.title
            ? "<p>Title Unlocked: " + e(run.reward.title) + "</p>"
            : "") +
          '<div class="quiz-complete-actions"><button class="button mint" data-quiz-action="quiz-start">Play Again →</button></div></section>',
      );
    }
    const answerForm =
      '<form id="quiz-answer-form" class="stack"><div class="quiz-answer-field"><label for="quiz-answer">Anime Title</label><input id="quiz-answer" class="search" name="answer" value="' +
      e(draft) +
      '" role="combobox" aria-autocomplete="list" aria-controls="quiz-suggestions" aria-expanded="false" autocomplete="off" maxlength="300" placeholder="Start typing an anime title…" disabled><ul id="quiz-suggestions" class="quiz-suggestions" role="listbox" aria-label="Anime Titles" hidden></ul></div><button id="quiz-lock-answer" class="button mint" type="submit" disabled>Lock Answer →</button><button type="button" class="text-button" data-quiz-skip>Skip Song</button></form>';
    const result =
      '<div class="notice quiz-answer-result" role="status"><strong>' +
      (run.correct ? "Correct!" : run.timedOut ? "Time’s Up" : "Incorrect") +
      '</strong><div class="quiz-answer-comparison"><div><span>Your Answer</span><p>' +
      e(run.submittedAnswer?.trim() ? run.submittedAnswer : "No Answer") +
      "</p></div><div><span>Correct Answer</span><p>" +
      e(run.answer || "") +
      "</p></div></div><small>" +
      e(run.songTitle || "") +
      " · " +
      e(run.artist || "") +
      '</small></div><button class="button mint space-top" data-quiz-action="quiz-next">' +
      (run.index === 19 ? "Finish Quiz (Enter)" : "Next Song (Enter)") +
      "</button>";
    return withLeaderboard(
      '<section class="quiz-question' +
        (run.answered ? (run.correct ? " is-correct" : " is-incorrect") : "") +
        '"><div class="quiz-question-heading"><h2>Song ' +
        (run.index + 1) +
        ' of 20</h2><div class="quiz-score tier-' +
        rarityClass(quizRarity(run.score)) +
        '"><span>Score</span><strong>' +
        run.score +
        " / 20</strong></div></div>" +
        (!preview
          ? '<p class="form-hint">Personal Best: ' + q.best + " / 20</p>"
          : "") +
        (!run.answered
          ? '<div class="quiz-countdown-meter" id="quiz-time-progress" role="progressbar" aria-label="Seconds Remaining" aria-valuemin="0" aria-valuemax="20" aria-valuenow="20"><div class="quiz-countdown-fill" aria-hidden="true"></div><span id="quiz-time-left" role="timer">Loading Audio…</span></div>'
          : "") +
        '<div class="quiz-audio-line">' +
        (!run.answered
          ? '<span class="form-hint" id="quiz-audio-status" hidden>Preparing Audio…</span><button type="button" class="button secondary" data-quiz-play hidden>Enable Audio</button>'
          : "") +
        "</div>" +
        (run.answered ? result : answerForm) +
        '<p id="quiz-inline-error" class="form-error" role="alert">' +
        e(errorMessage) +
        "</p></section>",
    );
  }
  function closeSuggestions() {
    suggestionsOpen = false;
    highlight = -1;
    const list = document.getElementById("quiz-suggestions"),
      input = document.getElementById("quiz-answer");
    if (list) list.hidden = true;
    input?.setAttribute("aria-expanded", "false");
    input?.removeAttribute("aria-activedescendant");
  }
  function drawSuggestions(input) {
    const list = document.getElementById("quiz-suggestions");
    if (!list) return;
    const show = suggestionsOpen && !!input.value.trim();
    list.hidden = !show;
    input.setAttribute("aria-expanded", String(show));
    list.innerHTML = options.length
      ? options
          .map(
            (o, i) =>
              '<li role="option" id="quiz-option-' +
              i +
              '" aria-selected="' +
              (highlight === i) +
              '" data-quiz-answer-option="' +
              i +
              '" title="' +
              e(o) +
              '">' +
              e(o) +
              "</li>",
          )
          .join("")
      : '<li role="option" aria-disabled="true">' +
        (bank?.error
          ? "Titles Unavailable · Type Your Answer"
          : bank?.complete
            ? "No Matching Titles"
            : "Loading Titles…") +
        "</li>";
    if (highlight >= 0) {
      input.setAttribute("aria-activedescendant", "quiz-option-" + highlight);
      document
        .getElementById("quiz-option-" + highlight)
        ?.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function updateInput(input) {
    draft = input.value;
    suggestionsOpen = true;
    options = quizAnswerOptions(bank?.answers || [], draft);
    highlight = -1;
    drawSuggestions(input);
  }
  function setVolume(value) {
    volume = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    if (audio) audio.volume = volume / 100;
    const label = document.getElementById("quiz-volume-value");
    if (label) label.textContent = volume + "%";
    try {
      storage?.setItem("amqtours-quiz-volume", String(volume));
    } catch {}
  }
  function showError(error) {
    errorMessage = error.message || String(error);
    const el = document.getElementById("quiz-inline-error");
    if (el) el.textContent = errorMessage;
  }
  async function mutate(action, answer, skip = false) {
    if (working) return;
    working = true;
    closeSuggestions();
    tick();
    try {
      const result = await call(action, {
        quiz: selected,
        ...(run ? { run: run.id, index: run.index } : {}),
        ...(answer !== undefined ? { answer } : {}),
        ...(skip ? { skip: true } : {}),
      });
      useRun(result.run);
      if (result.me) onWallet(result.me);
      if (run?.finished) {
        quizzes = (await call("quizzes")).quizzes;
        leaderboardData = await call(
          "quiz-leaderboard?quiz=" + encodeURIComponent(selected) + "&page=1",
        );
      }
      onRender();
    } finally {
      working = false;
      tick();
    }
  }
  function attemptPlay() {
    if (!audio || playAttempted) return;
    const current = audio,
      token = generation;
    playAttempted = true;
    current
      .play()
      .then(() => {
        if (token === generation) {
          audioState = "playing";
          tick();
        }
      })
      .catch(() => {
        if (token === generation) {
          audioState = "blocked";
          tick();
        }
      });
  }
  function tick() {
    if (!run || run.finished || run.answered) return;
    const now = serverNow(),
      started =
        run.startsAt !== null &&
        run.startsAt !== undefined &&
        now >= run.startsAt;
    const remaining = run.endsAt ? Math.max(0, (run.endsAt - now) / 1000) : 20;
    const lead = run.startsAt
      ? Math.max(0, Math.ceil((run.startsAt - now) / 1000))
      : 0;
    const input = document.getElementById("quiz-answer"),
      lock = document.getElementById("quiz-lock-answer");
    if (input) input.disabled = !started || working;
    if (lock) lock.disabled = !started || working;
    if (started && remaining > 0 && !working && input && !answerFocused) {
      answerFocused = true;
      input.focus({ preventScroll: true });
    }
    const left = document.getElementById("quiz-time-left"),
      bar = document.getElementById("quiz-time-progress");
    if (left)
      left.textContent = lead
        ? "Starts in " + lead + "s"
        : run.endsAt
          ? Math.ceil(remaining) + "s"
          : "Loading Audio…";
    if (bar) {
      bar.style.setProperty("--quiz-time", (remaining / 20) * 100 + "%");
      bar.setAttribute("aria-valuenow", remaining.toFixed(1));
      bar.classList.toggle("is-urgent", !!run.endsAt && remaining <= 5);
    }
    const status = document.getElementById("quiz-audio-status"),
      play = document.querySelector("[data-quiz-play]");
    if (status)
      status.textContent =
        audioState === "error"
          ? "Audio Could Not Load"
          : audioState === "blocked"
            ? "Click Enable Audio to Start Sound"
            : lead
              ? "Get Ready…"
              : started
                ? ""
                : "Preparing Audio…";
    if (status) status.hidden = !["error", "blocked"].includes(audioState);
    if (play) {
      play.hidden = !["blocked", "error"].includes(audioState);
      play.textContent =
        audioState === "error" ? "Retry Audio" : "Enable Audio";
    }
    if (run.endsAt && remaining <= 0) {
      audio?.pause();
      if (!working && !timeoutAttempted) {
        timeoutAttempted = true;
        mutate("quiz-answer", input?.value ?? draft).catch(showError);
      }
      return;
    }
    if (started && audio && audioState !== "loading" && audioState !== "error")
      attemptPlay();
  }
  function mount() {
    if (!selected || !run || run.finished || run.answered) {
      stop();
      return;
    }
    const key = run.id + ":" + run.index;
    if (key === audioKey) {
      tick();
      return;
    }
    stop();
    audioKey = key;
    audioState = "loading";
    playAttempted = false;
    timeoutAttempted = false;
    const token = generation;
    timer = time.every(tick, 200);
    if (run.endsAt && serverNow() >= run.endsAt) {
      tick();
      return;
    }
    audio = makeAudio(run.audio);
    audio.preload = "auto";
    audio.volume = volume / 100;
    const current = audio;
    const ready = async () => {
      if (token !== generation || arming || current.seeking) return;
      if (current.readyState !== undefined && current.readyState < 2) return;
      if (run.startsAt) {
        audioState = "ready";
        tick();
        return;
      }
      arming = true;
      try {
        const result = await call("quiz-ready", {
          quiz: selected,
          run: run.id,
          index: run.index,
        });
        if (token !== generation) return;
        useRun(result.run);
        audioState = "ready";
        onRender();
        tick();
      } catch (err) {
        if (token === generation) {
          audioState = "error";
          showError(err);
          tick();
        }
      } finally {
        if (token === generation) arming = false;
      }
    };
    current.addEventListener("loadedmetadata", () => {
      if (token !== generation) return;
      sampleStart = Number.isFinite(current.duration)
        ? Math.max(0, (current.duration - QUIZ_SONG_MS / 1000) * run.sample)
        : 0;
      const elapsed = run.startsAt
        ? Math.max(0, Math.min(20, (serverNow() - run.startsAt) / 1000))
        : 0;
      current.currentTime = sampleStart + elapsed;
    });
    current.addEventListener("canplay", ready);
    current.addEventListener("seeked", ready);
    current.addEventListener("timeupdate", () => {
      if (token === generation && current.currentTime >= sampleStart + 20)
        current.pause();
    });
    current.addEventListener("error", () => {
      if (token === generation) {
        audioState = "error";
        tick();
      }
    });
    tick();
  }
  return {
    load,
    render,
    mount,
    stop,
    setVolume,
    setSort(value) {
      if (!["recent", "best-desc", "best-asc"].includes(value)) return;
      quizSort = value;
      onRender();
    },
    closeSuggestions,
    async click(button) {
      if (button.hasAttribute("data-quiz-category")) {
        const next = button.dataset.quizCategory;
        if (!["singers", "composers"].includes(next)) return true;
        category = next;
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-leaderboard")) {
        if (working) return true;
        selected = button.dataset.quizLeaderboard;
        leaderboardOnly = true;
        useRun(null);
        stop();
        await load();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-enter")) {
        leaderboardOnly = false;
        await load();
        onRender();
        return true;
      }
      if (
        working &&
        (button.hasAttribute("data-quiz-open") ||
          button.hasAttribute("data-quiz-back"))
      )
        throw Error("Wait for the current answer to finish saving.");
      if (button.hasAttribute("data-quiz-open")) {
        selected = button.dataset.quizOpen;
        leaderboardOnly = false;
        useRun(null);
        await load();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-back")) {
        selected = null;
        useRun(null);
        stop();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-action")) {
        await mutate(button.dataset.quizAction);
        return true;
      }
      if (button.hasAttribute("data-quiz-skip")) {
        await mutate("quiz-answer", "", true);
        return true;
      }
      if (button.hasAttribute("data-quiz-play")) {
        if (audioState === "error" && audio) {
          audioState = "loading";
          playAttempted = false;
          arming = false;
          audio.load();
          tick();
        } else {
          playAttempted = false;
          attemptPlay();
        }
        return true;
      }
      if (button.hasAttribute("data-quiz-answer-option")) {
        const input = document.getElementById("quiz-answer");
        if (!input || input.disabled) return true;
        draft = options[Number(button.dataset.quizAnswerOption)] || input.value;
        input.value = draft;
        closeSuggestions();
        input.focus();
        return true;
      }
      return false;
    },
    async input(input) {
      updateInput(input);
    },
    focus(input) {
      if (!input.disabled) updateInput(input);
    },
    key(event) {
      if (event.key === "Enter" && (event.repeat || event.isComposing)) {
        event.preventDefault();
        return;
      }
      if (
        run?.answered &&
        !run.finished &&
        event.key === "Enter" &&
        !working &&
        !event.target.closest?.(
          "button,a,input,select,textarea,[contenteditable=true]",
        )
      ) {
        event.preventDefault();
        mutate("quiz-next").catch(showError);
        return;
      }
      if (event.target.id !== "quiz-answer") return;
      if (
        !run ||
        run.finished ||
        run.answered ||
        working ||
        event.target.disabled
      )
        return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        suggestionsOpen = true;
        if (options.length) {
          highlight =
            highlight < 0
              ? event.key === "ArrowDown"
                ? 0
                : options.length - 1
              : (highlight +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length;
          draft = options[highlight];
          event.target.value = draft;
        }
        drawSuggestions(event.target);
      }
      if (event.key === "Escape") closeSuggestions();
      if (event.key === "Enter" && suggestionsOpen && options.length) {
        event.preventDefault();
        draft = options[highlight >= 0 ? highlight : 0];
        event.target.value = draft;
        closeSuggestions();
        mutate("quiz-answer", draft).catch(showError);
      }
    },
    submit: (form) => mutate("quiz-answer", form.elements.answer.value),
  };
}
