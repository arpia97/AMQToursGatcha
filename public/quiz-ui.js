import {songLoadingBar,updateSongLoadingBar} from './song-loading.js';
import { routeHref } from "./site-navigation.js";
import {
  QUIZ_SERVERS,
  quizAudioUrl,
  createQuizAudioCache,
} from "./quiz-audio-cache.js";
import { quizDuration, quizElapsed } from "./quiz-time.js";
import { quizRarity, QUIZ_SONG_MS, QUIZ_CATEGORIES, quizCategoryLabel } from "./quiz-rules.js";
import { quizAnswerOptions } from "./quiz-autocomplete.js";
import { rarityClass } from "./card-display.js";
import {
  DEFAULT_QUIZ_HOTKEYS,
  QUIZ_HOTKEY_ACTIONS,
  normalizeQuizHotkeys,
  hotkeyActionForEvent,
} from "./quiz-hotkeys.js";

// Case-, accent- and punctuation-insensitive key for quiz name search.
function searchKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function createQuizUI({
  api,
  escape: e,
  getState,
  onRender,
  onWallet,
  storage,
  audioFactory,
  clock,
  audioCache,
  getHotkeys,
  prepareTitles = async () => {},
  animeTitle = (song) => song.anime || song.answer || song.answers?.[0] || "",
}) {
  const hotkeys = () =>
    normalizeQuizHotkeys(
      getHotkeys
        ? getHotkeys()
        : getState()?.me?.quiz_hotkeys || DEFAULT_QUIZ_HOTKEYS,
    );
  const hotkeyTitle = (id, base) => {
    const key = hotkeys()[id];
    return key ? `${base} (Hotkey: ${key})` : base;
  };
  const hotkeyHintBar = () => {
    const map = hotkeys();
    const items = ['<span><kbd>Enter</kbd> Next / Finish Song</span>', ...QUIZ_HOTKEY_ACTIONS.filter((a) => map[a.id]).map(
      (a) =>
        `<span><kbd>${e(map[a.id])}</kbd> ${e(a.label)}</span>`,
    )];
    return items.length
      ? `<p class="quiz-hotkey-hints form-hint">${items.join(" · ")} · Customize in Settings</p>`
      : "";
  };
  const time = clock || {
    now: () => Date.now(),
    monotonicNow: () => performance.now(),
    every: (fn, ms) => setInterval(fn, ms),
    cancel: (id) => clearInterval(id),
  };
  const makeAudio = audioFactory || ((src) => new Audio(src));
  const banks = new Map();
  const songLists = new Map();
  const songCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const cache = audioCache || createQuizAudioCache();
  let server = "EU",
    competitive = false,
    preparing = null,
    download = null;
  let quizzes = [],
    selected = null,
    run = null,
    working = false,
    pendingAction = "",
    pendingMove = null,
    queuedAnswer = null,
    locallyStopped = false,
    audio = null,
    audioKey = "",
    recoveredAudioKey = "",
    recoverAudio = null,
    generation = 0,
    leaderboardOnly = false,
    leaderboardData = null,
    friendsOnly = false,
    leaderboardFilterVersion = 0,
    songListQuiz = null,
    songListData = null,
    songListLoading = false,
    songListError = "",
    songListIsRecap = false,
    songListSort = "index",
    songListSortAscending = true,
    quizSort = "recent",
    quizSearch = "",
    favoritesFirst = false,
    hidePerfect = false,
    category = "singers";
  const favoritePending = new Set();
  let sampleStart = 0,
    audioState = "loading",
    playAttempted = false,
    arming = false,
    timer = null,
    serverAnchor = null,
    bestRoundTrip = Infinity,
    answerFocusedInput = null,
    answerFocusPaused = false;
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
    favoritesFirst = storage?.getItem("amqtours-quiz-favorites-first") === "1";
    hidePerfect = storage?.getItem("amqtours-quiz-hide-perfect") === "1";
    const savedServer = storage?.getItem("amqtours-quiz-server");
    if (QUIZ_SERVERS.includes(savedServer)) server = savedServer;
    const saved = storage?.getItem("amqtours-quiz-volume");
    if (saved !== null && saved !== undefined && Number.isFinite(Number(saved)))
      volume = Math.min(100, Math.max(0, Math.round(Number(saved))));
  } catch {}
  const monotonicNow = () => (time.monotonicNow || time.now)();
  const serverNow = () => serverAnchor
    ? serverAnchor.server + monotonicNow() - serverAnchor.local
    : time.now();
  const elapsed = () =>
    run?.index === 19 && run?.answered
      ? run.elapsedMs
      : quizElapsed(run?.startedAt, Math.round(serverNow()));
  const elapsedControl = () =>
    run && !run.finished && (Number.isSafeInteger(run.startedAt) || run.transport === "session")
      ? '<span class="quiz-elapsed">Elapsed <strong id="quiz-elapsed" role="timer" aria-label="Elapsed Quiz Time">' +
        quizDuration(elapsed() ?? (run?.transport === "session" ? 0 : null), false) +
        "</strong></span>"
      : "";
  async function call(path, body, key) {
    if (run?.transport === "session" && ["quiz-ready", "quiz-answer", "quiz-next"].includes(path)
        && !(path === "quiz-next" && body.index === 19)) {
      body = { ...body, action: path };
      path = "quiz-session?run=" + encodeURIComponent(body.run);
      key ||= crypto.randomUUID();
    }
    const sent = monotonicNow(),
      controller = new AbortController(),
      deadline = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await api(path, body, key, {
        signal: controller.signal,
        ...(path.startsWith("quiz-session?") && run?.sessionTicket
          ? { headers: { "X-Quiz-Session": run.sessionTicket } } : {}),
      }),
        received = monotonicNow();
      if (Number.isFinite(result.now)) {
        const roundTrip = Math.max(0, received - sent);
        const estimate = serverNow();
        // Slow/out-of-order responses have wider uncertainty. Keep the best
        // sample instead of letting them pull a running timer backwards.
        // Resync after a suspended clock falls outside the server's bounds.
        const drifted = serverAnchor &&
          (estimate < result.now - 1000 || estimate > result.now + roundTrip + 1000);
        if (!serverAnchor || roundTrip <= bestRoundTrip || drifted) {
          bestRoundTrip = roundTrip;
          serverAnchor = { server: result.now + roundTrip / 2, local: received };
        }
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted)
        throw Object.assign(
          new Error(
            "The quiz server took too long to respond. Retry to check your saved progress.",
          ),
          { retryable: true },
        );
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }
  function useRun(value) {
    // Older responses during rollout still retain outcomes seen this visit.
    if (value && !Array.isArray(value.results)) {
      const results = value.finished && value.history
        ? value.history.map((song) => !!song.correct)
        : value.id === run?.id ? (run.results || []).slice(0, value.index) : [];
      if (!value.finished && value.answered) results[value.index] = !!value.correct;
      value = { ...value, results };
    }
    if (value?.transport === "session" && value.id === run?.id && !value.sessionTicket)
      value = { ...value, sessionTicket: run.sessionTicket };
    run = value;
    const key = run ? run.id + ":" + run.index : "";
    if (key !== draftKey) {
      draftKey = key;
      draft = "";
      options = [];
      highlight = -1;
      suggestionsOpen = false;
      errorMessage = "";
      answerFocusedInput = null;
      answerFocusPaused = false;
      locallyStopped = false;
    }
  }
  // The next song is buffered (and seeked to its sample) while the reveal is
  // shown, so pressing Next reuses a ready element instead of downloading.
  let upcoming = null;
  const audioListeners = new WeakMap();
  function listen(element, event, listener) {
    element.addEventListener(event, listener);
    const listeners = audioListeners.get(element) || [];
    listeners.push([event, listener]);
    audioListeners.set(element, listeners);
  }
  function detachAudio(element) {
    for (const [event, listener] of audioListeners.get(element) || [])
      element.removeEventListener?.(event, listener);
    audioListeners.delete(element);
  }
  function releaseAudio(element) {
    if (!element) return;
    detachAudio(element);
    element.pause?.();
    // pause() alone keeps the source/decoder alive on mobile browsers.
    element.removeAttribute?.("src");
    element.load?.();
  }
  const prefetchReady = () => !!(
    upcoming?.ready && !upcoming.failed &&
    !upcoming.element.error && !upcoming.element.seeking &&
    (upcoming.element.readyState === undefined || upcoming.element.readyState >= 3)
  );

  function dropPrefetch() {
    if (upcoming && !upcoming.claimed) releaseAudio(upcoming.element);
    upcoming = null;
  }
  function stop({ keepPrefetch = false } = {}) {
    generation++;
    releaseAudio(audio);
    audio = null;
    recoverAudio = null;
    audioKey = "";
    arming = false;
    answerFocusedInput = null;
    answerFocusPaused = false;
    if (!keepPrefetch) dropPrefetch();
    if (timer !== null) time.cancel(timer);
    timer = null;
  }
  function prefetchNext() {
    if (!run?.answered || run.finished || !run.nextAudio || run.index >= 19)
      return;
    const key = run.id + ":" + (run.index + 1);
    if (upcoming?.key === key) return;
    dropPrefetch();
    let src;
    try {
      src =
        cache.url(run.nextAudio, server) ||
        quizAudioUrl(run.nextAudio, server);
    } catch {
      return;
    }
    const element = makeAudio(src),
      entry = {
        key,
        element,
        sample: run.nextSample,
        sampleStart: 0,
        ready: false,
        failed: false,
        claimed: false,
      };
    upcoming = entry;
    element.preload = "auto";
    element.volume = volume / 100;
    const settle = () => {
      if (
        entry.claimed ||
        entry.failed ||
        element.seeking ||
        (element.readyState !== undefined && element.readyState < 3)
      )
        return;
      entry.ready = true;
    };
    listen(element, "loadedmetadata", () => {
      if (entry.claimed) return;
      entry.sampleStart = Number.isFinite(element.duration)
        ? Math.max(
            0,
            (element.duration - QUIZ_SONG_MS / 1000) * (entry.sample || 0),
          )
        : 0;
      try { element.currentTime = entry.sampleStart; }
      catch {
        entry.failed = true;
        entry.ready = false;
        releaseAudio(element);
      }
    });
    listen(element, "canplay", settle);
    listen(element, "canplaythrough", settle);
    listen(element, "seeked", settle);
    for (const event of ["seeking", "waiting", "stalled"])
      listen(element, event, () => { entry.ready = false; });
    listen(element, "error", () => {
      if (entry.claimed) return;
      entry.failed = true;
      entry.ready = false;
      releaseAudio(element);
    });
    element.load?.();
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
    const [data] = await Promise.all([call("quizzes"), prepareTitles()]);
    quizzes = data.quizzes;
    if (!getState().me) friendsOnly = false;
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
        "quiz-leaderboard?quiz=" + encodeURIComponent(selected) + "&page=1" + (friendsOnly ? "&friends=1" : ""),
      );
    }
  }

  const serverControl = () =>
    '<label class="quiz-server-control">Server<select id="quiz-server" aria-label="Quiz Audio Server" ' +
    (working || preparing || (run && !run.finished) ? "disabled" : "") +
    ">" +
    QUIZ_SERVERS.map(
      (s) =>
        "<option " + (s === server ? "selected" : "") + ">" + s + "</option>",
    ).join("") +
    "</select></label>";
  const competitiveControl = () =>
    '<label class="quiz-competitive"><input id="quiz-competitive" type="checkbox" ' +
    (competitive ? "checked" : "") +
    " " +
    (working || preparing ? "disabled" : "") +
    ">Competitive</label>";
  function downloadHTML() {
    return preparing
      ? '<section class="quiz-download" role="status"><strong>Loading Quiz Audio…</strong>' +
          songLoadingBar({id:'quiz-download-progress',label:'Quiz Audio Download',loaded:download?.loaded,total:download?.total}) +
          '<span id="quiz-download-label">' +
          downloadLabel() +
          '</span><button type="button" class="button secondary" data-quiz-download-cancel>Cancel Loading</button></section>'
      : "";
  }
  const downloadLabel = () =>
    download
      ? download.loaded +
        " / " +
        download.total +
        " Songs · " +
        (download.bytes / 1048576).toFixed(1) +
        " MB"
      : "Preparing Download…";
  const startControls = (label) =>
    '<div class="quiz-start-controls"><button class="button mint" data-quiz-action="quiz-start" ' +
    (preparing ? "disabled" : "") +
    ">" +
    label +
    "</button>" +
    competitiveControl() +
    '</div><p class="form-hint">Competitive preloads the entire song pool before starting. Audio stays in this tab until it is closed or reloaded.</p>' +
    downloadHTML() +
    '<p class="form-error" id="quiz-inline-error" role="alert">' +
    e(errorMessage) +
    "</p>";
  async function start(action) {
    if (preparing || working) return;
    const q = quizzes.find((q) => q.id === selected);
    if (competitive) {
      const controller = new AbortController();
      preparing = controller;
      download = null;
      errorMessage = "";
      onRender();
      try {
        const manifest = await call(
          "quiz-audio?quiz=" + encodeURIComponent(selected),
        );
        if (manifest.version !== q.updated)
          throw Error(
            "The quiz pool changed. Reopen the quiz to load the latest songs.",
          );
        await cache.prepare(manifest.audio, server, {
          signal: controller.signal,
          onProgress: (p) => {
            download = p;
            const label = document.getElementById("quiz-download-label"),
              bar = document.getElementById("quiz-download-progress");
            if (label) label.textContent = downloadLabel();
            updateSongLoadingBar(bar,p.loaded,p.total);
          },
        });
      } catch (error) {
        if (error.name !== "AbortError")
          errorMessage =
            "Competitive loading failed: " +
            error.message +
            " Try again or turn Competitive off.";
        return;
      } finally {
        if (preparing === controller) {
          preparing = null;
          onRender();
        }
      }
      if (controller.signal.aborted) return;
    }
    await mutate(action);
  }
  const volumeControl = () =>
    '<label class="quiz-volume-control">Volume<input id="quiz-volume" type="range" min="0" max="100" step="1" value="' +
    volume +
    '" aria-label="Quiz Volume"><output id="quiz-volume-value">' +
    volume +
    "%</output></label>";
  const guide =
    '<details class="rarity-guide"><summary>Quiz Rewards</summary><h3>Personal-Best Payouts</h3><ul><li><strong>Per-Point Bonus:</strong> Earn 50 credits for every new personal-best point scored (capped at 1,000 credits per quiz).</li><li><strong>No Repeats:</strong> Reaching or repeating an existing high score awards 0 credits.</li></ul><h3>One-Time Milestones</h3><ul><li><strong>5 / 20:</strong> 100 credits</li><li><strong>10 / 20:</strong> 300 credits</li><li><strong>15 / 20:</strong> 500 credits</li><li><strong>20 / 20:</strong> 1,000 credits</li></ul><h3>Game Setup</h3><ul><li><strong>Format:</strong> Each quiz run consists of 20 random songs drawn from the pool, with 20 seconds per song.</li></ul></details>';
  function leaderboardRowHTML(
    p,
    rank,
    { isMe = false, outsideTop = false } = {},
  ) {
    const achieved =
      new Date(p.bestAt).toLocaleString("en-GB", {
        timeZone: "Asia/Seoul",
      }) + " KST";
    const classes = [isMe ? "is-me" : "", outsideTop ? "is-outside-top" : ""]
      .filter(Boolean)
      .join(" ");
    return (
      "<tr" +
      (classes ? ' class="' + classes + '"' : "") +
      (isMe ? ' aria-current="true"' : "") +
      "><td>" +
      rank +
      '</td><td><a href="' +
      routeHref("player/" + encodeURIComponent(p.id)) +
      '">' +
      e(p.name) +
      '</a></td><td title="Time Set: ' +
      e(achieved) +
      '"><strong>' +
      p.best +
      ' / 20</strong></td><td class="quiz-duration">' +
      e(quizDuration(p.durationMs)) +
      "</td></tr>"
    );
  }
  function leaderboardHTML() {
    const allRows = leaderboardData?.rows || [],
      topRows = allRows.slice(0, 20),
      meId = getState()?.me?.id || leaderboardData?.me?.id || null;
    let extraMe = null;
    if (meId && !topRows.some((p) => p.id === meId)) {
      if (leaderboardData?.me && leaderboardData.me.id === meId) {
        extraMe = {
          ...leaderboardData.me,
          rank: leaderboardData.me.rank ?? 21,
        };
      } else {
        const idx = allRows.findIndex((p) => p.id === meId);
        if (idx >= 20) extraMe = { ...allRows[idx], rank: idx + 1 };
      }
    }
    const rows =
      topRows
        .map((p, i) =>
          leaderboardRowHTML(p, i + 1, { isMe: !!meId && p.id === meId }),
        )
        .join("") +
      (extraMe
        ? leaderboardRowHTML(extraMe, extraMe.rank, {
            isMe: true,
            outsideTop: true,
          })
        : "");
    return (
      '<aside class="quiz-leaderboard" aria-label="Quiz Leaderboard"><div class="section-head"><h2>Leaderboard</h2><span class="subtext">Top 20</span></div>' +
      '<label class="check-label quiz-friends-filter"><input type="checkbox" id="quiz-friends-only" ' + (friendsOnly ? 'checked' : '') + ' ' + (!getState().me ? 'disabled' : '') + '> Friends Only</label>' +
      (rows
        ? '<div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Best Score</th><th>Time Taken</th></tr></thead><tbody>' +
          rows +
          "</tbody></table></div>"
        : '<p class="notice">No completed scores yet.</p>') +
      "</aside>"
    );
  }
  function closeSongList() {
    songListQuiz = null;
    songListData = null;
    songListLoading = false;
    songListError = "";
    songListIsRecap = false;
    songListSort = "index";
    songListSortAscending = true;
  }
  const songResult = s => s.correct ? "Correct" : s.timedOut ? "Timed Out" : s.skipped ? "Skipped" : "Incorrect";
  function songListColumns() {
    return [["index", "#"], ...(songListIsRecap
      ? [["result", "Result"], ["title", "Song / Artist"], ["anime", "Anime"], ["answer", "Your Answer"], ["elapsed", "Elapsed"], ["response", "Answer Time"]]
      : [["title", "Song"], ["artist", "Artist"], ["anime", "Anime"]])];
  }
  function sortedSongEntries(songs) {
    const value = ({ song, index }) => ({ index, title: song.title || "Unknown Song", artist: song.artist || "",
      anime: animeTitle(song) || "", result: songResult(song), answer: song.submittedAnswer || "",
      elapsed: song.elapsedMs, response: song.responseMs })[songListSort];
    return songs.map((song, index) => ({ song, index, sortValue: value({ song, index }) })).sort((a, b) => {
      const av = a.sortValue, bv = b.sortValue, missingA = av == null || av === "", missingB = bv == null || bv === "";
      // Missing metadata stays last in either direction; ties keep original song order.
      if (missingA !== missingB) return missingA ? 1 : -1;
      const compared = missingA ? 0 : typeof av === "number" && typeof bv === "number" ? av - bv : songCollator.compare(String(av), String(bv));
      return (songListSortAscending ? compared : -compared) || a.index - b.index;
    });
  }
  function songListHeaders() {
    return songListColumns().map(([key, label]) => {
      const active = songListSort === key;
      return '<th scope="col" aria-sort="' + (active ? songListSortAscending ? "ascending" : "descending" : "none") +
        '"><button type="button" class="quiz-song-sort" data-quiz-song-sort="' + key + '" aria-label="' +
        e('Sort by ' + (key === "index" ? "Song Number" : label) + ', ' + (active && songListSortAscending ? "Descending" : "Ascending")) +
        '">' + e(label) + '<span aria-hidden="true">' + (active ? songListSortAscending ? "↑" : "↓" : "↕") + '</span></button></th>';
    }).join("");
  }
  function songAnimeLabel(song) {
    const titles = [...new Set([...(song.answers || []), ...(song.workingTitles || [])])].filter(Boolean);
    return '<button type="button" class="quiz-working-titles" data-detail-popup="' +
      e("All Working Titles\n" + (titles.length ? titles.join("\n") : animeTitle(song))) +
      '" aria-expanded="false">' + e(animeTitle(song) || "—") + '</button>';
  }
  function recapRows(entries) {
    return entries.map(({ song: s, index: i }) => {
      const result = songResult(s);
      return '<tr class="quiz-recap-' + (s.correct ? "correct" : "incorrect") + '"><td>' +
        (i + 1) + '</td><td><span class="quiz-recap-result">' +
        (s.correct ? "✓ " : "✕ ") + result + '</span></td><td><strong>' +
        e(s.title || "Unknown Song") + '</strong><small>' + e(s.artist || "—") +
        '</small></td><td>' + songAnimeLabel(s) + '</td><td>' +
        e(s.submittedAnswer || "—") + '</td><td class="quiz-recap-time">' +
        e(quizDuration(s.elapsedMs)) + '</td><td class="quiz-recap-time">' +
        e(quizDuration(s.responseMs)) + '</td></tr>';
    }).join("");
  }
  function songListModalHTML() {
    if (!songListQuiz) return "";
    const q = quizzes.find((x) => x.id === songListQuiz);
    const name = songListData?.name || q?.name || "Quiz";
    const songs = songListData?.songs || [];
    const count = songs.length || q?.songs || 0;
    const entries = sortedSongEntries(songs);
    const rows = songListIsRecap ? recapRows(entries) : entries
      .map(
        ({ song: s, index: i }) =>
          "<tr><td>" +
          (i + 1) +
          "</td><td>" +
          e(s.title || "Unknown Song") +
          "</td><td>" +
          e(s.artist || "—") +
          "</td><td>" +
          songAnimeLabel(s) +
          "</td></tr>",
      )
      .join("");
    return (
      '<div class="fusion-picker-backdrop quiz-songs-backdrop" data-quiz-songs-close>' +
      '<section class="fusion-picker-dialog quiz-songs-dialog' + (songListIsRecap ? ' quiz-recap-dialog' : '') + '" role="dialog" aria-modal="true" aria-labelledby="quiz-songs-title">' +
      '<div class="section-head"><div><h2 id="quiz-songs-title">' +
      e(name) +
      (songListIsRecap ? ' · Songs Played' : ' · Song List') + '</h2><p class="subtext">' +
      count +
      " " +
      (count === 1 ? "Song" : "Songs") +
      (songListIsRecap ? ' · Elapsed from Quiz Start</p></div>' : " in Pool</p></div>") +
      '<button type="button" class="button secondary" data-quiz-songs-close>Close</button></div>' +
      (songListLoading
        ? '<p class="notice" role="status">Loading Song List…</p>'
        : songListError
          ? '<p class="notice warm" role="alert">' + e(songListError) + "</p>"
          : rows
            ? '<div class="table-wrap quiz-song-list"><table><thead><tr>' + songListHeaders() + '</tr></thead><tbody>' +
              rows +
              "</tbody></table></div>"
            : '<p class="notice">No songs in this quiz pool yet.</p>') +
      "</section></div>"
    );
  }
  function render() {
    if (!selected) {
      stop();
      const visibleQuizzes = quizzes.filter(
        (q) => (q.category || "singers") === category,
      );
      const progressPool = visibleQuizzes.filter((q) => q.published);
      const played = progressPool.filter((q) => q.played).length;
      const completion = `<span class="quiz-completion-status">${played}/${progressPool.length} Played · ${progressPool.length ? ((played * 100) / progressPool.length).toFixed(1) : "0.0"}%</span>`;
      const sortControl = quizzes.length
        ? '<label class="quiz-sort-control">Sort By<select id="quiz-sort">' +
          [
            ["recent", "Recently Updated"],
            ["recent-oldest", "Oldest Updated"],
            ["name", "Alphabetical · A–Z"],
            ["name-desc", "Alphabetical · Z–A"],
            ["unplayed", "Unplayed First"],
            ["played", "Played First"],
            ["pool-desc", "Song Pool · Largest First"],
            ["pool-asc", "Song Pool · Smallest First"],
            ["best-desc", "Performance · Highest First"],
            ["best-asc", "Performance · Lowest First"],
            ["average-desc", "Difficulty · Highest Average First"],
            ["average-asc", "Difficulty · Lowest Average First"],
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
      const needle = searchKey(quizSearch);
      const matchingQuizzes = visibleQuizzes.filter(q =>
        (!hidePerfect || q.best !== 20) && (!needle || searchKey(q.name).includes(needle)));
      const searchState = !needle
        ? ""
        : matchingQuizzes.length
          ? " is-match"
          : " is-no-match";
      const searchControl = quizzes.length
        ? '<label class="quiz-search-control"><input type="search" id="quiz-search" class="quiz-search-input' +
          searchState +
          '" aria-label="Search Quizzes" placeholder="Search Quizzes…" autocomplete="off" spellcheck="false" maxlength="100" value="' +
          e(quizSearch) +
          '"></label>'
        : "";
      return (
        '<div class="page-intro quiz-list-header"><div class="quiz-list-title"><h1>Quiz</h1>' +
        completion +
        "</div>" +
        '<div class="quiz-list-controls">' +
        serverControl() +
        "</div>" +
        "</div>" +
        '<div class="quiz-toolbar">' +
        `<div class="tabs quiz-categories" role="group" aria-label="Quiz Categories">${QUIZ_CATEGORIES.map((c) => `<button type="button" class="tab ${category === c ? "active" : ""}" data-quiz-category="${c}" aria-pressed="${category === c}">${quizCategoryLabel(c)}</button>`).join("")}</div>` +
        '<div class="quiz-toolbar-filters">' +
        searchControl +
        '<div class="quiz-browse-toggles"><label class="check-label quiz-favorites-filter"><input type="checkbox" id="quiz-favorites-first" ' + (favoritesFirst ? 'checked' : '') + '> Favorites First</label>' +
        '<label class="check-label quiz-hide-perfect"><input type="checkbox" id="quiz-hide-perfect" ' + (hidePerfect ? 'checked' : '') + '> Hide 20/20</label></div>' +
        sortControl +
        "</div>" +
        "</div>" +
        (visibleQuizzes.length && !matchingQuizzes.length
          ? !needle ? '<p class="notice quiz-search-empty" role="status">No Quizzes Match These Filters.</p>' : '<p class="notice quiz-search-empty" role="status">No Quizzes Match “' +
            e(quizSearch.trim()) +
            "”.</p>"
          : matchingQuizzes.length
          ? '<div class="quiz-grid">' +
            [...matchingQuizzes]
              .sort((a, b) => {
                if (favoritesFirst && !!a.favorited !== !!b.favorited)
                  return Number(!!b.favorited) - Number(!!a.favorited);
                switch (quizSort) {
                  case "recent-oldest": return (a.updated||0)-(b.updated||0);
                  case "name-desc":
                  case "name":
                    return (quizSort === "name-desc" ? -1 : 1) * a.name.localeCompare(b.name, "en", {
                      sensitivity: "base",
                      numeric: true,
                    });
                  case "played":
                  case "unplayed":
                    return (Number(!!a.played) - Number(!!b.played)) * (quizSort === "played" ? -1 : 1);
                  case "pool-desc":
                    return b.songs - a.songs;
                  case "pool-asc":
                    return a.songs - b.songs;
                  case "best-desc":
                    return b.best - a.best;
                  case "best-asc":
                    return a.best - b.best;
                  case "average-desc":
                  case "average-asc": {
                    const aHas = Number.isFinite(a.averageScore),
                      bHas = Number.isFinite(b.averageScore);
                    if (aHas !== bHas) return aHas ? -1 : 1;
                    if (!aHas) return 0;
                    return quizSort === "average-desc"
                      ? b.averageScore - a.averageScore
                      : a.averageScore - b.averageScore;
                  }
                  default:
                    return 0;
                }
              })
              .map(
                (q) =>
                  '<article class="collect-card quiz-tile tier-' +
                  rarityClass(quizRarity(q.best)) +
                  '">' +
                  '<button type="button" class="quiz-favorite' + (q.favorited ? ' is-selected' : '') + '" ' +
                  (getState().me ? 'data-quiz-favorite="' + e(q.id) + '"' : 'data-action="account"') +
                  ' aria-pressed="' + !!q.favorited + '" aria-label="' + e((q.favorited ? 'Unfavorite ' : 'Favorite ') + q.name) +
                  '" title="' + (q.favorited ? 'Remove From Favorites' : 'Add to Favorites') + '" ' +
                  (favoritePending.has(q.id) ? 'disabled' : '') + '><svg viewBox="0 0 40 40" aria-hidden="true"><path class="quiz-favorite-heart" d="m20 28-8.4-7.9a5 5 0 0 1 7-7.1l1.4 1.4 1.4-1.4a5 5 0 0 1 7 7.1Z"/></svg></button>' +
                  (q.cover
                    ? '<img src="' +
                      e(q.cover) +
                      '" loading="lazy" decoding="async" alt="' +
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
                  (Number.isFinite(q.averageScore) ? '<p class="quiz-average">Average ' + q.averageScore.toFixed(1) + '/20 · ' + q.completedRuns + (q.completedRuns === 1 ? ' Score</p>' : ' Scores</p>') : '') +
                  '<div class="quiz-tile-actions"><button class="button mint" data-quiz-open="' +
                  e(q.id) +
                  '">' +
                  (!getState().me
                    ? "Sign In to Play"
                    : q.published
                      ? "Play Quiz →"
                      : "Preview Quiz →") +
                  '</button><button type="button" class="button secondary" data-quiz-songs="' +
                  e(q.id) +
                  '">Song List</button></div><button class="text-button quiz-leaderboard-link" data-quiz-leaderboard="' +
                  e(q.id) +
                  '">Leaderboard ↗</button></div></article>',
              )
              .join("") +
            "</div>"
          : '<section class="quiz-coming-soon"><span aria-hidden="true">♫</span><h2>Coming Soon</h2><p>Anime music quizzes are on the way.</p></section>') +
        (category === "franchise" ? "" : guide) +
        songListModalHTML()
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
      (!leaderboardOnly
        ? elapsedControl() + serverControl() + volumeControl()
        : "") +
      (!leaderboardOnly && run && !run.finished
        ? '<button type="button" class="button secondary" data-quiz-action="quiz-restart" title="' +
          e(hotkeyTitle("restart", "Restart this quiz from Song 1")) +
          '">Restart Quiz ↻</button><button type="button" class="button secondary" data-quiz-action="quiz-stop" title="' +
          e(hotkeyTitle("stop", "End This Attempt and Return to All Quizzes")) +
          '">Stop Quiz</button>'
        : "") +
      '<button class="button secondary" data-quiz-back>All Quizzes ←</button></div></div>';
    if (preparing && run && !run.finished) top += downloadHTML();
    if (leaderboardOnly)
      return (
        top +
        leaderboardHTML() +
        '<div class="quiz-tile-actions space-top"><button class="button mint" data-quiz-enter>Play Quiz →</button><button type="button" class="button secondary" data-quiz-songs="' +
        e(q.id) +
        '">Song List</button></div>' +
        songListModalHTML()
      );
    const withLeaderboard = (content) =>
      top +
      '<div class="quiz-play-layout"><div class="quiz-play-main">' +
      content +
      "</div>" +
      leaderboardHTML() +
      "</div>" + songListModalHTML();
    if (!getState().me)
      return withLeaderboard(
        '<p>Sign in to play quizzes and keep your progress.</p><button class="button" data-action="account">Sign In →</button>',
      );
    if (!run) {
      stop();
      return withLeaderboard(
        "<p>20 Seconds Per Song · Two-Second Starting Countdown</p>" +
          (q.category === "franchise" ? '<p class="form-hint">Franchise Quiz · No Credit Rewards</p>' : "") +
          (q.songs < 20
            ? '<p class="notice space-top">Add at least 20 songs before previewing this quiz.</p>'
            : startControls(preview ? "Start Preview →" : "Start Quiz →")),
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
          '/20</h2><p class="quiz-completion-time">Time Taken: ' +
          e(quizDuration(run.durationMs)) +
          "</p>" +
          (preview
            ? "<p>Test Score Only · No Credits Awarded</p>"
            : "<p>Personal Best: " +
              run.reward.best +
              '/20</p>' + (q.category === "franchise"
              ? '<p>Franchise Quiz · No Credit Rewards</p>'
              : "<p>New Best Bonus: ✦ " +
              run.reward.improvement +
              " · Milestones: ✦ " +
              run.reward.milestones +
              '</p><strong class="quiz-credit-gain">+' +
              run.reward.total +
              " Credits</strong>")) +
          (run.reward.title
            ? "<p>Title Unlocked: " + e(run.reward.title) + "</p>"
            : "") +
          '<div class="quiz-complete-actions">' +
          (run.history?.length ? '<button type="button" class="button secondary" data-quiz-recap>Songs Played →</button>' : '') +
          startControls("Play Again →") +
          "</div>" + songProgressHTML() + "</section>",
      );
    }
    return withLeaderboard(questionHTML(q));
  }
  function songProgressHTML() {
    return '<section class="quiz-song-progress" aria-label="Song Progress"><ol class="quiz-song-progress-track">' +
      Array.from({ length: 20 }, (_, index) => {
        const result = run.results?.[index];
        const state = typeof result === "boolean" ? result ? "correct" : "incorrect"
          : !run.finished && index === run.index ? "current" : "upcoming";
        const label = "Song " + (index + 1) + ": " +
          ({ correct: "Correct", incorrect: "Incorrect", current: "Current Song", upcoming: index < run.index ? "Result Not Recorded" : "Upcoming" })[state];
        return '<li class="quiz-progress-square is-' + state + '" aria-label="' + label +
          '" title="' + label + '"' + (state === "current" ? ' aria-current="step"' : '') + '></li>';
      }).join("") + '</ol></section>';
  }
  function questionHTML(q) {
    const preview = !q.published || run?.preview;
    const answerForm =
      '<form id="quiz-answer-form" class="stack"><div class="quiz-answer-field"><label for="quiz-answer">Anime Title</label><input id="quiz-answer" class="search" name="answer" value="' +
      e(draft) +
      '" role="combobox" aria-autocomplete="list" aria-controls="quiz-suggestions" aria-expanded="false" autocomplete="off" maxlength="300" placeholder="Start typing an anime title…" disabled><ul id="quiz-suggestions" class="quiz-suggestions" role="listbox" aria-label="Anime Titles" hidden></ul></div><button id="quiz-lock-answer" class="button mint" type="submit" disabled>Lock Answer →</button><button type="button" class="text-button" data-quiz-skip title="' +
      e(hotkeyTitle("skip", "Skip the current song")) +
      '">Skip Song</button></form>';
    const result =
      '<div class="notice quiz-answer-result" role="status"><strong>' +
      (run.correct ? "Correct!" : run.timedOut ? "Time’s Up" : "Incorrect") +
      '</strong><div class="quiz-answer-comparison"><div><span>Your Answer</span><p>' +
      e(run.submittedAnswer?.trim() ? run.submittedAnswer : "No Answer") +
      "</p></div><div><span>Correct Answer</span><p>" +
      e(animeTitle(run)) +
      "</p></div></div><small>" +
      e(run.songTitle || "") +
      " · " +
      e(run.artist || "") +
      '</small></div><button class="button mint space-top" data-quiz-action="quiz-next">' +
      (run.index === 19 ? "Finish Quiz" : "Next Song") +
      " (Enter)" +
      "</button>";
    return (
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
      (!Number.isSafeInteger(run.startedAt)
        ? '<p class="form-hint">This run predates completion timing. Restart Quiz to record a time.</p>'
        : "") +
      (!run.answered
        ? '<div class="quiz-countdown-meter" id="quiz-time-progress" role="progressbar" aria-label="Seconds Remaining" aria-valuemin="0" aria-valuemax="20" aria-valuenow="20"><div class="quiz-countdown-fill" aria-hidden="true"></div><span id="quiz-time-left" role="timer">Loading Audio…</span></div>'
        : "") +
      (!run.answered ? '<div id="quiz-audio-loading" class="quiz-audio-loading"'+(run.endsAt?' hidden':'')+'>'+songLoadingBar({label:'Preparing Quiz Audio'})+'</div>' : '') +
      '<div class="quiz-audio-line">' +
      (!run.answered
        ? '<span class="form-hint" id="quiz-audio-status" hidden>Preparing Audio…</span><button type="button" class="button secondary" data-quiz-play hidden>Enable Audio</button>'
        : "") +
      "</div>" +
      (run.answered ? result : answerForm) +
      songProgressHTML() +
      hotkeyHintBar() +
      '<p id="quiz-inline-error" class="form-error" role="alert">' +
      e(errorMessage) +
      "</p></section>"
    );
  }
  function updateQuestion() {
    const section = document.querySelector(".quiz-play-main > .quiz-question");
    const q = quizzes.find((q) => q.id === selected);
    if (!section || !q || !run || run.finished || leaderboardOnly) return false;
    section.outerHTML = questionHTML(q);
    mount();
    return true;
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
    if (upcoming?.element) upcoming.element.volume = volume / 100;
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
  const nextPending = () => working && pendingAction === "quiz-next" && run?.transport === "session" && !run.answered && !run.finished;
  const answerPending = () => !!queuedAnswer || (working && !nextPending());
  async function mutate(action, answer, skip = false) {
    if (working) {
      if (action === "quiz-answer" && nextPending() && !queuedAnswer) {
        queuedAnswer = { answer, skip };
        audio?.pause();
        closeSuggestions();
        tick();
      }
      return;
    }
    working = true;
    pendingAction = action;
    errorMessage = "";
    const body = {
      quiz: selected,
      ...(["quiz-start", "quiz-restart"].includes(action) && competitive ? { competitive: true } : {}),
      ...(run ? { run: run.id, index: run.index } : {}),
      ...(["quiz-start", "quiz-restart"].includes(action) || run?.transport === "session" ? { fastSession: true } : {}),
      ...(answer !== undefined ? { answer } : {}),
      ...(skip ? { skip: true } : {}),
      ...(action === "quiz-next" &&
      run &&
      upcoming?.key === run.id + ":" + (run.index + 1) &&
      prefetchReady()
        ? { ready: true }
        : {}),
    };
    if (action === "quiz-next" && pendingMove?.body?.run === body.run &&
        pendingMove.body.index === body.index && pendingMove.action === action)
      body.ready = pendingMove.body.ready;
    const signature = JSON.stringify([action, body]);
    if (pendingMove?.signature !== signature)
      pendingMove = { signature, key: crypto.randomUUID(), body, action };
    const move = pendingMove;
    const previousRun = run;
    const instantNext = action === "quiz-next" && run?.transport === "session" && run.index < 19 && body.ready && prefetchReady();
    if (action === "quiz-answer") audio?.pause();
    if (action === "quiz-stop") {
      locallyStopped = true;
      stop();
      dropPrefetch();
    }
    closeSuggestions();
    if (instantNext) {
      const startsAt = Math.round(serverNow());
      useRun({ ...run, index: run.index + 1, answered: false,
        audio: run.nextAudio, sample: run.nextSample, startsAt, endsAt: startsAt + QUIZ_SONG_MS,
        nextAudio: undefined, nextSample: undefined,
        answer: undefined, correct: undefined, submittedAnswer: undefined,
      });
      onRender({ questionOnly: true });
    }
    tick();
    try {
      let result;
      try {
        result = await call(action, body, move.key);
      } catch (error) {
        // A lost response does not mean the answer failed to save. Read the
        // authoritative reveal instead of posting another answer or guessing.
        if (
          (!["quiz-answer", "quiz-next"].includes(action) || (action === "quiz-next" && !instantNext)) ||
          (error.status && !error.retryable && error.status !== 409)
        )
          throw error;
        const saved = await call(
          previousRun?.transport === "session"
            ? "quiz-session?run=" + encodeURIComponent(body.run)
            : "quiz-run?quiz=" + encodeURIComponent(body.quiz),
        ).catch(() => null);
        if (
          !saved?.run ||
          saved.run.id !== body.run ||
          (instantNext ? saved.run.index !== body.index + 1
            : !saved.run.answered || saved.run.index !== body.index)
        )
          throw error;
        result = saved;
      }
      if (pendingMove === move) pendingMove = null;
      if (selected !== body.quiz) return;
      useRun(result.run);
      if (action === "quiz-stop") {
        selected = null;
        leaderboardOnly = false;
      }
      if (result.me) onWallet(result.me);
      if (run?.finished) {
        const quiz = selected,
          completed = run.id;
        if (!run.preview)
          quizzes = quizzes.map((q) =>
            q.id === quiz ? { ...q, best: run.reward.best, played: true } : q,
          );
        // The scored result is already durable. Optional list/ranking refreshes
        // must not keep the result screen locked or hide it on a read failure.
        const filterVersion=leaderboardFilterVersion;
        Promise.allSettled([
          call("quizzes"),
          call("quiz-leaderboard?quiz=" + encodeURIComponent(quiz) + "&page=1" + (friendsOnly ? "&friends=1" : "")),
        ])
          .then(([list, ranks]) => {
            if (selected !== quiz || run?.id !== completed || !run.finished)
              return;
            if (list.status === "fulfilled") quizzes = list.value.quizzes;
            if (ranks.status === "fulfilled" && filterVersion===leaderboardFilterVersion) leaderboardData = ranks.value;
            onRender();
          })
          .catch(() => {});
      }
      if (!instantNext || run?.answered || run?.finished || run?.index !== body.index + 1) onRender({
        questionOnly: action === "quiz-answer" || action === "quiz-next",
      });
    } catch (error) {
      if (instantNext) {
        queuedAnswer = null;
        useRun(previousRun);
        stop();
        onRender({ questionOnly: true });
        error.message = "The next song could not be confirmed. Retry Next Song. " + error.message;
      }
      if (action === "quiz-answer" && !run?.answered) playAttempted = false;
      if (action === "quiz-stop") {
        error.message =
          "Audio stopped, but the attempt could not be ended: " +
          error.message +
          " Retry Stop Quiz.";
        showError(error);
      }
      throw error;
    } finally {
      working = false;
      pendingAction = "";
      tick();
      const queued = queuedAnswer;
      queuedAnswer = null;
      if (queued) mutate("quiz-answer", queued.answer, queued.skip).catch(showError);
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
      .catch((error) => {
        if (token !== generation || pendingAction === "quiz-answer" || run?.answered || locallyStopped) return;
        if (error?.name === "NotAllowedError") {
          audioState = "blocked";
          tick();
        } else recoverAudio?.();
      });
  }
  function text(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }
  function tick() {
    const stopButton = document.querySelector('[data-quiz-action="quiz-stop"]');
    if (stopButton) {
      stopButton.disabled =
        working || !!preparing || (run?.index === 19 && run.answered);
      text(
        stopButton,
        pendingAction === "quiz-stop"
          ? "Stopping…"
          : locallyStopped
            ? "Retry Stop Quiz"
            : "Stop Quiz",
      );
    }
    const next = document.querySelector('[data-quiz-action="quiz-next"]');
    if (next) {
      next.disabled = working || locallyStopped;
      text(
        next,
        working && pendingAction === "quiz-next"
          ? run?.index === 19
            ? "Finishing Quiz…"
            : "Loading Next Song…"
          : (run?.index === 19 ? "Finish Quiz" : "Next Song") +
              " (Enter)",
      );
    }
    const clock = document.getElementById("quiz-elapsed");
    if (clock && run && !run.finished)
      text(clock, quizDuration(elapsed() ?? (run?.transport === "session" ? 0 : null), false));
    if (locallyStopped) {
      for (const id of ["quiz-answer", "quiz-lock-answer"]) {
        const control = document.getElementById(id);
        if (control) control.disabled = true;
      }
      const skip = document.querySelector("[data-quiz-skip]");
      if (skip) skip.disabled = true;
      return;
    }
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
    if (input) input.disabled = !started || answerPending();
    if (lock) {
      lock.disabled = !started || answerPending();
      text(
        lock,
        pendingAction === "quiz-answer" || queuedAnswer ? "Locking Answer…" : "Lock Answer →",
      );
    }
    const skip = document.querySelector("[data-quiz-skip]");
    if (skip) skip.disabled = answerPending();
    const active = document.activeElement;
    const focusFellToPage = !active || active === document.body ||
      active === document.documentElement || active.isConnected === false;
    if (started && remaining > 0 && input && !input.disabled && !answerFocusPaused &&
        document.visibilityState !== "hidden" && (!document.hasFocus || document.hasFocus()) &&
        !songListQuiz && !document.getElementById("modal")?.open &&
        (input !== answerFocusedInput || focusFellToPage)) {
      // Disabling a focused input or a late browser blur can lose focus without
      // replacing the node. Recover on the existing clock tick, unless the
      // player deliberately tabbed away or is using another control/dialog.
      input.focus({ preventScroll: true });
      if (document.activeElement === input) answerFocusedInput = input;
    }
    const audioLoading=document.getElementById('quiz-audio-loading');
    if(audioLoading)audioLoading.hidden=!!run.endsAt||audioState==='error';
    const left = document.getElementById("quiz-time-left"),
      bar = document.getElementById("quiz-time-progress");
    text(
      left,
      lead
        ? "Starts in " + lead + "s"
        : run.endsAt
          ? Math.ceil(remaining) + "s"
          : "Loading Audio…",
    );
    if (bar) {
      bar.style.setProperty("--quiz-progress", String(remaining / 20));
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
      if (!answerPending() && !timeoutAttempted) {
        timeoutAttempted = true;
        mutate("quiz-answer", input?.value ?? draft).catch(showError);
      }
      return;
    }
    if (started && !queuedAnswer && audio && audioState !== "loading" && audioState !== "error")
      attemptPlay();
  }
  function mount({ direct = false } = {}) {
    if (!selected || !run || run.finished) {
      stop();
      return;
    }
    if (locallyStopped) {
      stop();
      tick();
      return;
    }
    if (run.answered) {
      stop({ keepPrefetch: true });
      prefetchNext();
      tick();
      if (run.index < 19) timer = time.every(tick, 200);
      return;
    }
    const key = run.id + ":" + run.index;
    if (key === audioKey) {
      tick();
      return;
    }
    const prefetched =
      !direct && upcoming?.key === key && !upcoming.failed ? upcoming : null;
    if (prefetched) {
      prefetched.claimed = true;
      detachAudio(prefetched.element);
      upcoming = null;
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
    if (prefetched) {
      audio = prefetched.element;
      sampleStart = prefetched.sampleStart;
    } else {
      audio = makeAudio(
        (!direct && cache.url(run.audio, server)) || quizAudioUrl(run.audio, server),
      );
      audio.preload = "auto";
    }
    audio.volume = volume / 100;
    const current = audio;
    recoverAudio = () => {
      if (token !== generation || pendingAction === "quiz-answer" || run?.answered || locallyStopped) return;
      if (recoveredAudioKey !== key) {
        recoveredAudioKey = key;
        audioKey = "";
        // Discard a failed prefetched/blob decoder once, without re-arming
        // or extending an already running server deadline.
        mount({ direct: true });
      } else {
        audioState = "error";
        tick();
      }
    };
    const ready = async () => {
      if (token !== generation || arming || current.seeking) return;
      if (current.readyState !== undefined && current.readyState < 3) return;
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
    listen(current, "loadedmetadata", () => {
      if (token !== generation) return;
      sampleStart = Number.isFinite(current.duration)
        ? Math.max(0, (current.duration - QUIZ_SONG_MS / 1000) * run.sample)
        : 0;
      const elapsed = run.startsAt
        ? Math.max(0, Math.min(20, (serverNow() - run.startsAt) / 1000))
        : 0;
      try {
        if (Math.abs(current.currentTime - sampleStart - elapsed) > 0.05)
          current.currentTime = sampleStart + elapsed;
      } catch { recoverAudio?.(); }
    });
    listen(current, "canplay", ready);
    listen(current, "seeked", ready);
    listen(current, "timeupdate", () => {
      if (token === generation && current.currentTime >= sampleStart + 20)
        current.pause();
    });
    listen(current, "error", () => {
      if (token === generation) recoverAudio?.();
    });
    if (prefetched && !current.seeking && current.readyState >= 3) ready();
    else tick();
  }
  async function openSongListModal(id) {
    if (!id || working) return true;
    songListIsRecap = false;
    songListSort = "index";
    songListSortAscending = true;
    const q = quizzes.find((x) => x.id === id);
    const cacheKey = q ? q.id + ":" + q.updated : null;
    songListQuiz = id;
    songListError = "";
    if (cacheKey && songLists.has(cacheKey)) {
      songListData = songLists.get(cacheKey);
      songListLoading = false;
      onRender();
      return true;
    }
    songListData = null;
    songListLoading = true;
    onRender();
    try {
      const data = await call("quiz-songs?quiz=" + encodeURIComponent(id));
      if (songListQuiz !== id) return true;
      songLists.set(data.id + ":" + data.updated, data);
      songListData = data;
    } catch (err) {
      if (songListQuiz === id)
        songListError = err.message || String(err);
      throw err;
    } finally {
      if (songListQuiz === id) {
        songListLoading = false;
        onRender();
      }
    }
    return true;
  }
  return {
    load,
    render,
    mount,
    updateQuestion,
    stop,
    leave() {
      preparing?.abort();
      closeSongList();
      stop();
    },
    setVolume,
    active: () => !!preparing || !!(selected && run && !run.finished),
    openLeaderboard(id) {
      if (!id || working || preparing) return;
      closeSongList();
      selected = id;
      leaderboardOnly = true;
      useRun(null);
      stop();
    },
    setServer(value) {
      if (!QUIZ_SERVERS.includes(value) || working || preparing) return;
      server = value;
      try {
        storage?.setItem("amqtours-quiz-server", value);
      } catch {}
      stop();
      onRender();
    },
    setCompetitive(value) {
      if (!preparing && !working) {
        competitive = !!value;
        onRender();
      }
    },
    async setFriendsOnly(value) {
      if (!selected || !getState().me) return;
      const previous = friendsOnly, version = ++leaderboardFilterVersion, quiz = selected, player = getState().me.id;
      friendsOnly = !!value;
      const update = () => {
        const panel = document.querySelector('.quiz-leaderboard');
        if (panel) panel.outerHTML = leaderboardHTML(); else onRender();
        document.getElementById('quiz-friends-only')?.focus({preventScroll:true});
      };
      try {
        const data = await call('quiz-leaderboard?quiz=' + encodeURIComponent(quiz) + '&page=1' + (friendsOnly ? '&friends=1' : ''));
        if (version !== leaderboardFilterVersion || selected !== quiz || getState().me?.id !== player) return;
        leaderboardData = data;update();
      } catch(error) {
        if (version === leaderboardFilterVersion && selected === quiz && getState().me?.id === player) {friendsOnly = previous;update();}
        throw error;
      }
    },
    setFavoritesFirst(value) {
      favoritesFirst = !!value;
      try { storage?.setItem("amqtours-quiz-favorites-first", favoritesFirst ? "1" : "0"); } catch {}
      onRender();
    },
    setHidePerfect(value) {
      hidePerfect = !!value;
      try { storage?.setItem("amqtours-quiz-hide-perfect", hidePerfect ? "1" : "0"); } catch {}
      onRender();
    },
    setSort(value) {
      if (
        ![
          "recent", "recent-oldest",
          "name", "name-desc",
          "unplayed", "played",
          "pool-desc",
          "pool-asc",
          "best-desc",
          "best-asc",
          "average-desc",
          "average-asc",
        ].includes(value)
      )
        return;
      quizSort = value;
      onRender();
    },
    setSearch(value) {
      const next = String(value ?? "").slice(0, 100);
      if (next === quizSearch) return;
      quizSearch = next;
      onRender();
    },
    closeSuggestions,
    async click(button) {
      if (button.hasAttribute("data-quiz-download-cancel")) {
        preparing?.abort();
        return true;
      }
      if (preparing) return true;
      if (button.hasAttribute("data-quiz-favorite")) {
        const id = button.dataset.quizFavorite, player = getState().me?.id;
        const quiz = quizzes.find((q) => q.id === id);
        if (!player || !quiz || favoritePending.has(id)) return true;
        favoritePending.add(id);
        onRender();
        try {
          const result = await call("quiz-favorite", { quiz: id, favorited: !quiz.favorited }, crypto.randomUUID());
          if (getState().me?.id === player) {
            const current = quizzes.find((q) => q.id === id);
            if (current) current.favorited = result.favorited;
          }
        } finally {
          favoritePending.delete(id);
          onRender();
          if (globalThis.CSS?.escape)
            document.querySelector('[data-quiz-favorite="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true });
        }
        return true;
      }
      if (button.hasAttribute("data-quiz-category")) {
        const next = button.dataset.quizCategory;
        if (!QUIZ_CATEGORIES.includes(next)) return true;
        category = next;
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-songs-close")) {
        closeSongList();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-song-sort")) {
        const key = button.dataset.quizSongSort;
        if (!songListQuiz || !songListColumns().some(([column]) => column === key)) return true;
        songListSortAscending = key === songListSort ? !songListSortAscending : true;
        songListSort = key;
        onRender();
        document.querySelector('[data-quiz-song-sort="' + key + '"]')?.focus({ preventScroll: true });
        return true;
      }
      if (button.hasAttribute("data-quiz-recap")) {
        if (!run?.finished || !run.history?.length) return true;
        closeSongList();
        songListQuiz = selected;
        songListIsRecap = true;
        songListData = {
          name: quizzes.find((q) => q.id === selected)?.name,
          songs: run.history,
        };
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-songs")) {
        return openSongListModal(button.dataset.quizSongs);
      }
      if (button.hasAttribute("data-quiz-leaderboard")) {
        if (working) return true;
        closeSongList();
        selected = button.dataset.quizLeaderboard;
        leaderboardOnly = true;
        useRun(null);
        stop();
        await load();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-enter")) {
        closeSongList();
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
        closeSongList();
        selected = button.dataset.quizOpen;
        leaderboardOnly = false;
        useRun(null);
        await load();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-back")) {
        closeSongList();
        selected = null;
        useRun(null);
        stop();
        onRender();
        return true;
      }
      if (button.hasAttribute("data-quiz-action")) {
        const action = button.dataset.quizAction;
        if (action === "quiz-start" || action === "quiz-restart")
          await start(action);
        else await mutate(action);
        return true;
      }
      if (button.hasAttribute("data-quiz-skip")) {
        await mutate("quiz-answer", "", true);
        return true;
      }
      if (button.hasAttribute("data-quiz-play")) {
        answerFocusedInput = null;
        answerFocusPaused = false;
        if (audioState === "error" && audio) {
          audioKey = "";
          mount({ direct: true });
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
      answerFocusPaused = false;
      if (document.activeElement === input) answerFocusedInput = input;
      if (!input.disabled) updateInput(input);
    },
    key(event) {
      if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey)
        answerFocusPaused = true;
      if (songListQuiz && event.key === "Escape") {
        event.preventDefault?.();
        closeSongList();
        onRender();
        return;
      }
      if (locallyStopped) return;
      if (event.key === "Enter" && (event.repeat || event.isComposing)) {
        event.preventDefault?.();
        return;
      }
      const isEditable = Boolean(
        event.target?.closest?.(
          "input,select,textarea,[contenteditable=true]",
        ) || event.target?.id === "quiz-answer",
      );
      const isInteractiveControl = Boolean(
        event.target?.closest?.(
          "button,a,input,select,textarea,[contenteditable=true]",
        ),
      );
      const hotkeyAction = !event.repeat
        ? hotkeyActionForEvent(event, hotkeys(), { isEditable })
        : null;
      if (
        event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
        run?.answered && !run.finished && !working && !isInteractiveControl
      ) {
        event.preventDefault?.();
        mutate("quiz-next").catch(showError);
        return;
      }
      if (hotkeyAction) {
        if (
          hotkeyAction === "skip" &&
          selected &&
          run &&
          !run.finished &&
          !run.answered &&
          !answerPending() &&
          !leaderboardOnly
        ) {
          event.preventDefault?.();
          mutate("quiz-answer", "", true).catch(showError);
          return;
        }
        if (
          hotkeyAction === "restart" &&
          selected &&
          run &&
          !run.finished &&
          !working &&
          !leaderboardOnly
        ) {
          event.preventDefault?.();
          start("quiz-restart").catch(showError);
          return;
        }
        if (
          hotkeyAction === "stop" &&
          selected &&
          run &&
          !run.finished &&
          !working &&
          !leaderboardOnly
        ) {
          event.preventDefault?.();
          mutate("quiz-stop").catch(showError);
          return;
        }
        if (
          hotkeyAction === "play" &&
          selected &&
          run &&
          !run.finished &&
          !run.answered &&
          !leaderboardOnly
        ) {
          event.preventDefault?.();
          if (audioState === "error" && audio) {
            audioKey = "";
            mount({ direct: true });
          } else {
            playAttempted = false;
            attemptPlay();
          }
          return;
        }
        if (
          hotkeyAction === "focus" &&
          selected &&
          run &&
          !run.finished &&
          !run.answered &&
          !leaderboardOnly
        ) {
          const input = document.getElementById("quiz-answer");
          if (input && !input.disabled) {
            event.preventDefault?.();
            input.focus();
          }
          return;
        }
        if (
          hotkeyAction === "songs" &&
          selected &&
          (!run || run.finished || leaderboardOnly)
        ) {
          event.preventDefault?.();
          if (songListQuiz === selected) {
            closeSongList();
            onRender();
          } else {
            openSongListModal(selected).catch(showError);
          }
          return;
        }
      }
      if (event.target?.id !== "quiz-answer") return;
      if (
        !run ||
        run.finished ||
        run.answered ||
        answerPending() ||
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
