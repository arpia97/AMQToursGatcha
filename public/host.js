import { routeHref } from "./site-navigation.js";
import {playReviewPanel,mountPlayReview} from './play-review-ui.js?v=player-flags';
import { readApiResponse } from "./api-response.js";
import { creditAuditPanel } from "./host-audit-ui.js";
import { formIdentifier } from "./form-actions.js";
import { quizLibraryPanel } from "./quiz-library-host-ui.js";
import {
  quizHostPanel,
  quizPickerOptions,
  quizHostBody,
  previewQuizFile,
  handleQuizAudioReview,
  quizPoolEditor,
  handleQuizReviewSort,
  refreshQuizReviewWarnings,
  refreshQuizNameWarnings,
  checkQuizPoolLinks,
} from "./quiz-host-ui.js?v=quiz-source-picker";
import { TOUR_SIZES } from "./tour-rewards.js";
import { createTourRewardEditor } from "./tour-rewards-ui.js";
import {
  updateCreditPlayerSearch,
  creditPlayerPicker,
  deductionPanel,
  deductionReview,
} from "./host-credit-ui.js";
import { winnerCreatePanel, syncWinnerRewardDefault } from "./tour-winner-ui.js?v=pickem-vote-visibility";
import {
  settlementPanel,
  settlementDraft,
  settlementBody,
} from "./pickem-settlement.js";
import {
  pickemManagement,
  tourManager,
  matchEditor,
  localDeadline,
} from "./pickem-management.js?v=pickem-vote-visibility";
import { updateRewardDefaults } from "./host-defaults.js";
import { accessPanel, participationPanel, rewardWorkspace, organizeHostTools } from "./host-panels.js";
let deductionDraft = null,
  quizSelection = null,
  quizSearch = "",
  quizPool = null;
let quizLibraryStatus = null;
let quizLibraryPolling = false;
let participationDraft = null,
  matchDraft = null,
  managedTour = null,
  settlementTour = null;
const settlementDrafts = {};
let auditData = null,
  auditFilters = { kind: "spent", scope: "all", window: "12h", player: "" },
  auditHistory = [];
async function loadCreditAudit(reset = false) {
  if (reset) {
    delete auditFilters.before;
    delete auditFilters.to;
    auditHistory = [];
  }
  auditData = await api("credit-audit?" + new URLSearchParams(auditFilters));
  auditFilters.to = auditData.to;
}
const importActive = (j) =>
  ["running", "waiting"].includes(j.status) ||
  (j.status === "completed" && !!j.favorites);
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let adminSession = false,
  state,
  tab = "rewards",
  rewardTool = "tour",
  working = false;
function report(message, error = false, form = null) {
  $("#result").textContent = message;
  $("#result").className = "host-result" + (error ? " error" : "");
  if (form?.isConnected) {
    let feedback = form.querySelector("[data-host-feedback]");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.dataset.hostFeedback = "";
      feedback.tabIndex = -1;
      form.append(feedback);
    }
    feedback.className = "host-result" + (error ? " error" : "");
    feedback.setAttribute("role", error ? "alert" : "status");
    feedback.textContent = message;
    if (error) {
      feedback.focus({ preventScroll: true });
      feedback.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}
async function api(path, body, key) {
  const r = await fetch("api/host/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body
        ? {
            "Content-Type": "application/json",
            "Idempotency-Key": key || crypto.randomUUID(),
          }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return readApiResponse(r);
}
const players = (filter = () => true) =>
  state.players
    .filter(filter)
    .map(
      (p) =>
        `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)}) · ${p.balance} credits</option>`,
    )
    .join("");
const input = (label, name, type = "text", attrs = "") =>
  `<label>${label}<input name="${name}" type="${type}" ${name === "note" ? "" : "required"} ${attrs}></label>`;
const hostSection = $("#host-section");
async function openConsole() {
  const {role} = await api("console-access");
  const quizOnly = role === "Quiz Maker";
  hostSection.replaceChildren();
  for (const group of document.querySelectorAll(".host-tabs > div")) {
    const options = document.createElement("optgroup");
    options.label = group.querySelector("h2").textContent;
    for (const button of group.querySelectorAll("[data-tab]")) {
      button.hidden = quizOnly && button.dataset.tab !== "quiz";
      if (!button.hidden) options.append(new Option(button.textContent, button.dataset.tab));
    }
    group.hidden = !options.children.length;
    if (!group.hidden) hostSection.append(options);
  }
  return load(quizOnly ? "quiz" : "rewards");
}
function render() {
  hostSection.value = tab;
  deductionDraft = null;
  document
    .querySelectorAll(".host-tabs button")
    .forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  let html = "";
  if(tab==='play-review')html=playReviewPanel();
  if (tab === "quiz")
    html = quizHostPanel(state.quizzes || [], esc, quizSelection, quizPool,quizLibraryStatus,quizSearch);
  if (tab === "rewards")
    html = `<section class="host-panel"><h2>Individual Grant</h2><form id="grant" class="stack">${creditPlayerPicker(state, "grant", esc)}<div class="form-grid"><label>Category<select name="reason"><option value="reporting">Reporting</option><option value="counting">Counting</option><option value="participation">Tour participation</option><option value="other">Other</option></select></label>${input("Credit amount", "amount", "number", 'min="1" max="1000000" step="1" value="750"')}</div><label class="reporting-games"><span class="reward-games-label">Rounds played</span><input name="games" type="number" min="1" max="2000" step="1" value="1" required></label><label class="reward-tour-size">Tour Size<select name="tourSize">${TOUR_SIZES.map((size) => `<option value="${size}" ${size === 16 ? "selected" : ""}>${size} Players</option>`).join("")}</select></label><p class="form-hint">Participation: 200 per round for up to 16 players, 300 for 24, 400 for 32 or more. Counting and reporting: a flat 750 each per tour. Custom credit amounts remain editable.</p>${input("Tour identifier (used once per activity count)", "event", "text", 'maxlength="240" placeholder="usual-2026-10-24-42"')}${input("Tour / explanation (audit note)", "note", "text", 'maxlength="240" placeholder="Tour reporting"')}<button class="button" type="submit">Grant credits →</button></form></section>`;
  if (tab === "players")
    html = `<section class="host-panel"><h2>New Account Codes</h2><p>Issue an individual one-use code for a new player. It expires in seven days and is consumed when they set their password.</p><form id="registration-code" class="stack"><label>Player<select name="player" required><option value="">Choose an unregistered player</option>${players(p => !p.registered && !p.account_locked)}</select></label><button class="button secondary" type="submit">Issue One-Use Code →</button></form></section><section class="host-panel"><h2>Recover Account Access</h2><p>Reset an existing account’s access while preserving its credits and cards. Existing sessions are revoked. The replacement recovery code can be used once and expires in seven days.</p><form id="access" class="stack"><label>Player<select name="player" required><option value="">Choose a player</option>${players()}</select></label><button class="button secondary" type="submit">Reset Account Access →</button></form></section><div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Access</th><th>Aliases</th></tr></thead><tbody>${state.players
      .map(
        (p) =>
          `<tr><td>${esc(p.id)}</td><td>${esc(p.name)}</td><td>${p.account_locked ? "Locked" : p.registered ? "Registered" : "Awaiting registration"}</td><td>${state.aliases
            .filter((a) => a.player === p.id)
            .map((a) => esc(a.alias))
            .join(", ")}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  if (tab === "players") {
    if(state.canManageHosts) html += `<section class="host-panel"><h2>Account Lock</h2><p>Locked accounts cannot register, sign in, earn rewards or perform economic actions. Locking closes open listings and returns held cards and bids. Unlocking does not restore revoked access.</p><form id="account-lock" class="stack"><label>Player<select name="player" required><option value="">Choose a player</option>${players(p=>p.id!=="368")}</select></label><label>Action<select name="locked"><option value="true">Lock Account</option><option value="false">Unlock Account</option></select></label><button class="button secondary" type="submit">Apply Account Lock →</button></form></section>`;
    const a = state.aliasSync || {};
    html =
      `<section class="host-panel"><h2>AMQ Tours Alias Sheet</h2><p>Scan the AMQ Tours IDs worksheet to reconcile its aliases. A scan adds aliases and applies sheet removals and moves recorded since the first scan. Automatic scans run every six hours. Every new account needs an individual one-use code issued by a host.</p><p>Status: <strong>${esc(a.status || "pending")}</strong> · ${a.players || 0} player IDs · ${a.aliases || 0} sheet aliases · ${a.removed || 0} removed · ${a.moved || 0} moved${a.lastAt ? " · Last synchronized " + esc(new Date(a.lastAt).toLocaleString()) : ""}</p>${a.error ? '<p class="host-warning">' + esc(a.error) + "</p>" : ""}<form id="aliases-sync"><button class="button secondary" type="submit">Scan Aliases →</button></form><a class="text-button" href="https://docs.google.com/spreadsheets/d/1xsBfuz1v-gYgv5KEbEFlyQBoz_R5aJ84W6gscUF0-Hc/edit?gid=2012584445#gid=2012584445" target="_blank" rel="noopener">Open Tour Sheet ↗</a> <a class="text-button" href="https://docs.google.com/spreadsheets/d/1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA/edit?gid=1903970832#gid=1903970832" target="_blank" rel="noopener">Open IDs Worksheet ↗</a><p class="form-hint space-top">Numeric usernames can overlap player IDs. Sign-in prioritizes an exact ID; use alias:NAME to explicitly sign in by alias. Existing accounts and collections are preserved during canonical-ID migration.</p></section>` +
      html;
  }
  if (tab === "pickems") {
    const legacy = state.pickems.filter((p) => p.mode !== "tour");
    html = legacy.length
      ? `<details class="host-panel"><summary>Previous Match Pick’ems</summary><div class="table-wrap"><table><thead><tr><th>Match</th><th>Result</th><th>Manage</th></tr></thead><tbody>${legacy.map((p) => `<tr><td>${esc(p.title)}</td><td>${p.settled ? p.result_a + " : " + p.result_b : "Pending"}</td><td>${p.settled ? "Final" : `<button type="button" class="text-button" data-pickem-edit="${p.id}">Edit / delete</button>`}</td></tr>`).join("")}</tbody></table></div></details>`
      : "";
  }
  if (tab === "catalog")
    html = `<section class="host-panel"><h2>Pack Prices</h2><p>Normal packs are uniform within each card type, regardless of role or rarity. Premium doubles the chances S and above, taking the additional probability only from D. Daily login rewards are 300 credits. Enhancing cards consumes duplicates with no additional credit fee.</p><form id="settings" class="stack"><div class="form-grid">${input("Character pack (five cards)", "character", "number", `min="1" max="1000000" value="${state.settings.character_price}"`)}${input("Seiyuu pack (five cards)", "seiyuu", "number", `min="1" max="1000000" value="${state.settings.seiyuu_price}"`)}</div><div class="form-grid">${input("Premium character pack (five cards)", "premium_character", "number", `min="1" max="1000000" value="${state.settings.premium_character_price || 1000}"`)}${input("Premium seiyuu pack (five cards)", "premium_seiyuu", "number", `min="1" max="1000000" value="${state.settings.premium_seiyuu_price || 1000}"`)}</div><button class="button secondary" type="submit">Save pack prices →</button></form></section>`;
  if (tab === "catalog") {
    const j = state.seiyuuImport || {
      status: "idle",
      importedActors: 0,
      scannedTitles: 0,
    };
    html += `<section class="host-panel"><h2>Characters &amp; Seiyuus · Tenrai</h2><p>Imports MAL characters with documented Main/Supporting roles, bilingual anime titles, and Japanese voice actors. One request every 30 seconds, shared with favorite scans. Duplicate MAL IDs and host edits are preserved. Importing runs on Cloudflare while this page is closed.</p><p><strong>Status: ${esc(j.status)}</strong> · Source: ${esc(j.provider || "Tenrai")} · ${j.importedCharacters || 0} new characters · ${j.importedActors || 0} new actors · ${j.scannedTitles || 0}${j.totalTitles ? " / " + j.totalTitles : ""} anime checked</p><p>Access: <strong>${j.accessMode === "server-key" ? "Server Key" : "Public · Shared IP Quota"}</strong>${j.lastSuccessAt ? " · Last Successful Request " + esc(new Date(j.lastSuccessAt).toLocaleString()) : ""}</p>${j.lastStatus === 429 && j.accessMode !== "server-key" ? `<p class="host-warning">Tenrai is limiting this public connection. Add a <code>TENRAI_SERVER_KEY</code> secret to the amqtours-gatcha Worker for the official per-key quota. <a href="https://api.tenrai.org/documentation" target="_blank" rel="noopener noreferrer">Tenrai Server Key Instructions ↗</a></p>` : ""}${j.lastUpstreamMessage ? `<p class="form-hint">Upstream: ${esc(j.lastUpstreamMessage)}</p>` : ""}${j.lastRequestPath ? `<p class="form-hint">Last Request: <code>${esc(j.lastRequestPath)}</code></p>` : ""}${j.lastError ? `<p class="host-warning">${esc(j.lastError)} ${j.status === "waiting" ? "Automatic retry after " + esc(new Date(j.nextAt).toLocaleString()) + "." : ""}</p>` : ""}<form id="jikan-control" class="stack"><button class="button secondary" type="submit" name="operation" value="${importActive(j) ? "jikan-pause" : "jikan-start"}" >${importActive(j) ? "Pause import" : "Start / resume import"}</button></form><p class="form-hint space-top">Retries temporary outages with increasing delays and honors Retry-After. An upstream access refusal pauses the job. Missing portraits are skipped; actors have no Main/Supporting classification.</p></section>`;
  }
  if (tab === "catalog") {
    const a = state.seiyuuImport?.appearances;
    html +=
      '<section class="host-panel"><h2>Anime Appearances</h2><p>Characters count toward every credited anime. Their primary anime uses Main roles first, then the highest MAL member count. This enrichment shares the 30-second upstream scheduler.</p>' +
      (a
        ? "<p><strong>" +
          esc(a.status) +
          "</strong> · " +
          a.scannedTitles +
          (a.totalTitles ? " / " + a.totalTitles : "") +
          " anime enriched · " +
          a.skippedTitles +
          " unavailable</p>"
        : '<form id="appearance-control"><button class="button secondary" name="operation" value="anime-appearances-start" type="submit">Enrich Anime Appearances</button></form>') +
      "</section>";
    const f = state.seiyuuImport?.favorites;
    html += `<section class="host-panel"><h2>Rarity &amp; Portrait Scan</h2><p>Separate character and seiyuu percentiles. AG top 0.1% · Ubers 0.5% · SSS 1% · SS 2.5% · S 5% · A 10% · B 20% · C 40% · D remainder. Equal counts share a tier. Normal packs are uniform; premium doubles S-and-higher chances by reducing D. Enhancement levels are independent.</p><p>Scan: ${esc(f?.status || "Not started")} · ${f?.scannedEntries || 0} profiles checked · ${f?.portraitsRepaired || 0} portraits repaired${f?.lastCompletedAt ? " · Last completed " + esc(new Date(f.lastCompletedAt).toLocaleString()) : ""}${f?.nextRefreshAt ? " · Next refresh " + esc(new Date(f.nextRefreshAt).toLocaleString()) : ""}</p><form id="favorites-refresh" class="stack"><label>Days between completed scans<input name="intervalDays" type="number" min="1" max="90" value="${f?.intervalDays || 15}" required></label><button class="button secondary" type="submit">Save Interval / Refresh Scan →</button></form><p class="form-hint">Each scan updates rarity and checks for replacement portraits using the same character and seiyuu profiles.</p></section>`;
    if (state.catalogSummary?.source?.provider === "ACDB")
      html += `<section class="host-panel danger-panel"><h2>Replace the Retired ACDB Catalogue</h2><p class="warning-copy">Removes ACDB cards from collections and auctions, clears affected avatars, and refunds unclaimed auction holds. Other gameplay and accounts remain. Starts the MAL character import on Tenrai.</p><form id="replace-acdb" class="stack"><label>Type REPLACE ACDB WITH TENRAI<input name="confirmation" required autocomplete="off"></label><button class="button danger" type="submit">Replace ACDB with Tenrai</button></form></section>`;
  }
  if (tab === "credit-audit")
    html = creditAuditPanel(auditData, auditFilters, state.players, esc);
  if (tab === "activity")
    html = `<section class="host-panel"><h2>Every Credit Leaves a Trail.</h2><p>Latest 100 wallet movements. The CSV includes all available activity from the last 12 hours, including grants, purchases, holds, refunds and payouts.</p><button class="button secondary" id="export-ledger">Download Last 12 Hours CSV</button></section><div class="table-wrap"><table><thead><tr><th>Time</th><th>Player ID</th><th>Credits</th><th>Reason</th></tr></thead><tbody>${state.ledger.map((l) => `<tr><td>${esc(new Date(l.at).toLocaleString())}</td><td>${esc(l.player)}</td><td class="${l.delta > 0 ? "ledger-positive" : "ledger-negative"}">${l.delta > 0 ? "+" : ""}${l.delta}</td><td>${esc(l.reason)}</td></tr>`).join("")}</tbody></table></div>`;
  if (tab === "catalog")
    html += `<section class="host-panel"><h2>Character Main / Supporting Roles</h2><p>The most popular Main appearance by MAL member count is the primary series; Supporting appearances are the fallback. Host corrections take precedence. Supporting cards have weight 100. Main cards use the configured lower weight. Seiyuus have no classification.</p><form id="role-search" class="stack"><label>Find a character by name or series<input name="query" maxlength="100" placeholder="Frieren"></label><button class="button secondary" type="submit">Search catalog →</button></form><form id="role" class="stack space-top"><label>Character<select name="card" required><option value="">Choose a character</option>${state.cards
      .filter((c) => c.kind === "character")
      .map(
        (c) =>
          `<option value="${esc(c.id)}">${esc(c.name)} · ${c.role}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Role<select name="role"><option value="supporting">Supporting</option><option value="main">Main</option><option value="unknown">Unsorted</option></select></label><button class="button secondary" type="submit">Save character role →</button></form></section>`;
  if (tab === "catalog")
    html += `<section class="host-panel"><h2>Community Cards</h2><p>Host cards with fixed rarities defined in <code>community-cards.json</code> (including GGius Tours and Faker). Syncing registers newly added cards and image assets directly into the catalogue.</p><form id="sync-community" class="stack"><button class="button secondary" type="submit">Sync Community Cards to Catalogue →</button></form></section>`;
  if (tab === "resets")
    html = `<section class="host-panel danger-panel"><h2>Reset an Individual Player</h2><p class="warning-copy">WARNING: Restores 5,000 starting credits and resets lifetime earnings to 5,000. Removes cards, daily claims, tour activity, and predictions. Their showcases, gambling records, and open sale listings are cleared. Bidders on their cancelled listings are refunded. Their bids and unclaimed wins are removed; open lots restart at zero. Sessions are revoked. AMQ identity, username history, and password remain. This cannot be undone through this console.</p><form id="reset-player" class="stack"><label>Player<select name="player" required><option value="">Choose carefully</option>${players()}</select></label>${input("Type RESET PLAYER followed by their exact ID", "confirmation", "text", 'autocomplete="off" placeholder="RESET PLAYER 00123"')}<button class="button danger" type="submit">Reset this player’s gameplay</button></form></section><section class="host-panel danger-panel"><h2>Reset the Entire Community</h2><p class="warning-copy">WARNING: This impacts every player. Gameplay resets restore 5,000 starting credits. Collections, showcases, tour counts, wallet activity, pick’ems, predictions, auctions, shop listings, gambling records, and sessions will be cleared. Character and seiyuu catalogues, import progress, and rarity data are protected and always kept. Create an export or backup first. This cannot be undone through this console.</p><form id="reset-all" class="stack"><label>Reset scope<select name="scope" id="reset-scope"><option value="game">Reset gameplay · keep player registry, passwords, usernames, catalog, and prices</option><option value="everything">Delete all player data · include players, aliases, passwords, username history, and prices; keep catalogues</option></select></label><p class="form-hint">Gameplay: type <code>RESET ALL GAME DATA</code><br>Delete all player data: type <code>DELETE EVERYTHING</code>. Automatic sync recreates source player IDs as unregistered identities afterward; deleted credentials and gameplay do not return. The host token is a deployment secret and remains available.</p>${input("Exact confirmation phrase", "confirmation", "text", 'autocomplete="off"')}<button class="button danger" type="submit">Reset all selected data</button></form></section>`;
  if (tab === "catalog" && state.resourceBudget) {
    const b = state.resourceBudget;
    const sources = Object.entries(b.sources || {})
      .map(
        ([source, usage]) =>
          `<tr><td>${esc({ catalogImport: "Catalogue import & favorites", requests: "Player & host requests", indexing: "Anime indexing", aliases: "Alias synchronization", maintenance: "Scheduled maintenance", startup: "Database initialization", unattributed: "Earlier usage (not attributed)" }[source] || source)}</td><td>${usage.rowsRead.toLocaleString()}</td><td>${usage.rowsWritten.toLocaleString()}</td></tr>`,
      )
      .join("");
    html =
      `<section class="host-panel"><h2>Background Import Usage</h2><p>${b.mode === "continuous" ? "Continuous import enabled. The daily free-plan pause is disabled; saved progress and upstream backoff are retained." : b.backgroundPaused ? "Automatic scans are resting until " + esc(new Date(b.nextResumeAt).toLocaleString()) + " to leave capacity for players." : "Automatic scans are within today’s reserved budget."}</p><p class="form-hint">App-local SQL estimate since tracking began: ${b.rowsRead.toLocaleString()} rows read · ${b.rowsWritten.toLocaleString()} rows written (${esc(b.day)}, UTC). ${b.mode === "continuous" ? "The importer makes one source request at a time, at least 30 seconds apart. No daily app-level row limit is applied." : "Background work rests at 2 million reads or 30,000 writes and resumes the next UTC day."} Account-wide usage and platform overhead can differ.</p>${sources ? `<table><thead><tr><th>Source</th><th>Rows Read</th><th>Rows Written</th></tr></thead><tbody>${sources}</tbody></table><p class="form-hint">Source breakdown started ${esc(new Date(b.breakdownSince).toLocaleString())}. Earlier totals remain unattributed. Counts exclude platform storage operations and checkpoint overhead.</p>` : ""}</section>` +
      html;
  }
  if (tab === "rewards")
    html = rewardWorkspace({ tour: participationPanel(), grant: html, deduct: deductionPanel(state, esc) }, rewardTool);
  if (tab === "players") html = accessPanel(state, esc) + html;
  if (tab === "pickems")
    html =
      winnerCreatePanel() +
      settlementPanel(state, esc, settlementTour, settlementDrafts) +
      pickemManagement(state, esc) +
      html;
  participationDraft = null;
  matchDraft = null;
  managedTour = null;
  $("#host-content").innerHTML = html;
  organizeHostTools(tab);
  if(tab==='play-review')mountPlayReview($('#host-content .play-review'),state,api,esc);
  if (tab === "rewards") updateRewardDefaults($("#grant"));
}
function updateQuizLibraryPanel(status) {
  quizLibraryStatus = status;
  const region = $("#quiz-library-status");
  if (state && tab === "quiz" && region) {
    const quiz = state.quizzes.find(q => q.id === quizSelection);
    region.innerHTML = quizLibraryPanel(status, quiz, esc);
  }
}

async function pollQuizLibrary() {
  if (quizLibraryPolling) return;
  quizLibraryPolling = true;
  try {
    updateQuizLibraryPanel(await api("quiz-master"));
  } catch (error) {
    report(error.message, true);
  } finally {
    quizLibraryPolling = false;
  }
}

let loadVersion = 0;
async function load(section = tab) {
  const version = ++loadVersion;
  const next = section === 'play-review' ? await api('play-review') : section === "quiz"
    ? await api("quizzes")
    : await api("state?section=" + encodeURIComponent(section));
  if (version !== loadVersion) return false;

  if (section === "quiz") {
    const [library, pool] = await Promise.all([
      api("quiz-master").catch(error => ({ error: error.message })),
      quizSelection ? api("quiz-songs?id=" + encodeURIComponent(quizSelection)) : null,
    ]);
    if (version !== loadVersion) return false;
    quizLibraryStatus = library;
    quizPool = pool;
  }
  if (section === "pickems" && settlementTour) {
    const tour = next.pickemEvents.some(t => t.id === settlementTour.id)
      ? await api("pickem-event?event=" + settlementTour.id)
      : null;
    if (version !== loadVersion) return false;
    settlementTour = tour;
  }
  if (section === "credit-audit") {
    await loadCreditAudit(true);
    if (version !== loadVersion) return false;
  }
  state = next;
  tab = section;
  render();
  return true;
}
function settlementMatch(id) {
  return (
    settlementTour?.matches.find((p) => p.id === Number(id)) ||
    state.pickems.find((p) => p.id === Number(id))
  );
}
function renderSettlement() {
  $("#settlement-panel").outerHTML = settlementPanel(
    state,
    esc,
    settlementTour,
    settlementDrafts,
  );
  document.querySelectorAll("[data-settle-match]").forEach((form) => {
    const match = settlementMatch(form.dataset.settleMatch),
      draft = settlementDraft(match, settlementDrafts[match.id]);
    if (draft.requestKey) form.dataset.requestKey = draft.requestKey;
  });
}
function rememberSettlement(input) {
  const form = input.form;
  if (!form?.dataset.settleMatch) return;
  const match = settlementMatch(form.dataset.settleMatch),
    values = Object.fromEntries(new FormData(form));
  settlementDrafts[match.id] = {
    ...settlementDraft(match, settlementDrafts[match.id]),
    ...values,
  };
  delete settlementDrafts[match.id].requestKey;
  delete form.dataset.requestKey;
}
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (working) return;
  working = true;
  const form = ev.target,
    submit = form.querySelector("[type=submit]");
  if (submit) submit.disabled = true;
  // Retain a key after an uncertain network failure so submitting again cannot duplicate a grant/settlement.
  const savedSettlement = form.dataset.settleMatch
    ? settlementDraft(
        settlementMatch(form.dataset.settleMatch),
        settlementDrafts[form.dataset.settleMatch],
      )
    : null;
  const key =
    savedSettlement?.requestKey ||
    form.dataset.requestKey ||
    (form.dataset.requestKey = crypto.randomUUID());
  try {
    if (formIdentifier(form) === "admin-login-form") {
      const response = await fetch("api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      await readApiResponse(response);
      adminSession = true;
      await openConsole();
      form.reset();
      $("#unlock").hidden = true;
      $("#console").hidden = false;
      report("Signed in to the host console.");
      return;
    }
    const b = Object.fromEntries(new FormData(form));
    if (formIdentifier(form) === "credit-audit-filters") {
      auditFilters = {
        kind: b.kind,
        scope: b.scope,
        window: b.window,
        player: b.player,
      };
      await loadCreditAudit(true);
      render();
      report("");
      return;
    }
    let result, timerTarget;
    if (form.dataset.libraryAction) {
      const action = form.dataset.libraryAction;
      if (action === "cancel" && !confirm("Cancel this refresh? The current masterlist will remain available.")) return;
      result = await api("quiz-master-refresh", { action }, key);
      updateQuizLibraryPanel(result);
      delete form.dataset.requestKey;
      report(result.message);
      return;
    }
    if (formIdentifier(form) === "quiz-master-sync") {
      result = await api("quiz-master-sync", { quiz: b.quiz }, key);
      if (quizSelection === b.quiz) {
        quizPool = await api("quiz-songs?id=" + encodeURIComponent(b.quiz));
        const region = $("#quiz-current-pool");
        if (region) region.innerHTML = quizPoolEditor(quizPool, esc);
      }
      delete form.dataset.requestKey;
      report(result.message);
      return;
    }
    if (formIdentifier(form) === "quiz-save") {
      result = await api("quiz-save", await quizHostBody(form), key);
      quizSelection = result.id;
      if (result.rejected?.length)
        result.message +=
          " " +
          result.rejected.length +
          " rows skipped: " +
          result.rejected
            .slice(0, 5)
            .map((r) => "row " + r.row + " (" + r.reason + ")")
            .join("; ");
    }
    if (formIdentifier(form) === "tour-winner-create") {
      result = await api(
        "pickem-winner",
        {
          name: b.name,
          teams: b.teams,
          winnerReward: Number(b.winnerReward),
          ...(b.endsAutomatic ? {} : { ends: new Date(b.ends).getTime() }),
          hideVotes: !!b.hideVotes,
        },
        key,
      );
    }
    if (["reopen-pickem", "extend-pickem", "close-pickem"].includes(formIdentifier(form))) {
      if (!matchDraft) throw Error("Open a pick’em first.");
      timerTarget = { pickem: matchDraft.id, event: managedTour?.id };
      const action = { "reopen-pickem": "pickem-reopen", "extend-pickem": "pickem-extend", "close-pickem": "pickem-close" }[formIdentifier(form)];
      result = await api(
        action,
        {
          pickem: matchDraft.id,
          expected: matchDraft,
          minutes: Number(b.minutes),
        },
        key,
      );
    }
    if (formIdentifier(form) === "edit-tour-winner") {
      if (!matchDraft) throw Error("Open a tour pick’em first.");
      result = await api(
        "pickem-winner-edit",
        {
          pickem: matchDraft.id,
          expected: matchDraft,
          name: b.name,
          teams: b.teams,
          winnerReward: Number(b.winnerReward),
          hideVotes: !!b.hideVotes,
          ends:
            b.ends === localDeadline(matchDraft.ends)
              ? matchDraft.ends
              : new Date(b.ends).getTime(),
          clearPredictions: !!b.clearPredictions,
        },
        key,
      );
    }
    if (formIdentifier(form) === "manage-pickem-tour") {
      managedTour = await api("pickem-event?event=" + Number(b.event));
      if (managedTour.format === "winner")
        matchDraft = managedTour.matches[0] || null;
      $("#pickem-tour-manager").innerHTML = tourManager(managedTour, esc);
      return;
    }
    if (formIdentifier(form) === "combine-pickem-tour") {
      if (!managedTour) throw Error("Open a tour first.");
      result = await api(
        "pickem-combine",
        {
          event: managedTour.id,
          expectedMatches: managedTour.matches,
          confirmation: b.confirmation,
          clearPredictions: !!b.clearPredictions,
        },
        key,
      );
    }
    if (formIdentifier(form) === "rename-pickem-tour") {
      if (!managedTour) throw Error("Open a tour first.");
      result = await api(
        "pickem-event-edit",
        { event: managedTour.id, name: b.name, expectedName: managedTour.name },
        key,
      );
    }
    if (formIdentifier(form) === "delete-pickem-tour") {
      if (!managedTour) throw Error("Open a tour first.");
      result = await api(
        "pickem-event-delete",
        {
          event: managedTour.id,
          expectedIds: managedTour.matches.map((p) => p.id),
          expectedVotes: managedTour.matches.reduce((n, p) => n + p.votes, 0),
          confirmation: b.confirmation,
        },
        key,
      );
    }
    if (
      formIdentifier(form) === "edit-pickem" ||
      formIdentifier(form) === "delete-pickem"
    ) {
      if (!matchDraft) throw Error("Open a pick’em first.");
      const body = { ...b, pickem: matchDraft.id, expected: matchDraft };
      if (formIdentifier(form) === "edit-pickem") {
        body.ends =
          b.ends === localDeadline(matchDraft.ends)
            ? matchDraft.ends
            : new Date(b.ends).getTime();
        body.winnerReward = Number(b.winnerReward);
        body.scoreReward = Number(b.scoreReward);
        body.hideVotes = !!b.hideVotes;
        body.clearPredictions = !!b.clearPredictions;
      }
      result = await api(
        formIdentifier(form) === "edit-pickem"
          ? "pickem-edit"
          : "pickem-delete",
        body,
        key,
      );
    }
    if (formIdentifier(form) === "participation-preview") {
      const preview = await api("participation-preview", { text: b.text });
      const oldRoot = $("#participation-preview-result"),
        root = oldRoot.cloneNode(false);
      oldRoot.replaceWith(root);
      participationDraft = createTourRewardEditor(
        root,
        preview,
        {
          text: b.text,
          event: b.event.trim(),
          note: b.note.trim() || "Tour participation",
        },
        state,
        esc,
      );
      report(
        "Review rounds, substitutes, Count / Report and the total before awarding.",
      );
      return;
    }
    if (formIdentifier(form) === "participation-batch") {
      if (!participationDraft) throw Error("Review participants first.");
      result = await api(
        "participation-batch",
        participationDraft.payload(),
        key,
      );
    }
    if (["host-permissions", "quiz-maker-access"].includes(formIdentifier(form))) {
      result = await api(
        formIdentifier(form) === "quiz-maker-access" ? "quiz-maker-access" : "permissions",
        { player: b.player, enabled: b.enabled === "true" },
        key,
      );
    }
    if (formIdentifier(form) === "role-search") {
      const response = await fetch(
        "api/catalog?kind=character&q=" + encodeURIComponent(b.query),
      );
      const data = await readApiResponse(response);
      state.cards = data.cards;
      render();
      report(
        data.cards.length +
          " results shown (up to 40). Refine the search if needed.",
      );
      return;
    }
    if (formIdentifier(form) === "favorites-refresh")
      result = await api(
        "favorites-refresh",
        { intervalDays: Number(b.intervalDays) },
        key,
      );
    if (formIdentifier(form) === "replace-acdb")
      result = await api("replace-acdb", b, key);
    if (formIdentifier(form) === "sync-community") {
      const resp = await fetch("/community-cards.json");
      if (!resp.ok) throw new Error("Could not load community-cards.json");
      const cards = await resp.json();
      result = await api("catalog", { cards }, key);
    }
    if (["jikan-control", "appearance-control"].includes(formIdentifier(form)))
      result = await api(ev.submitter.value, {}, key);
    if (formIdentifier(form) === "deduct") {
      deductionDraft = await api("deduction-preview", {
        player: b.player,
        amount: Number(b.amount),
        note: b.note,
      });
      $("#deduction-review").innerHTML = deductionReview(deductionDraft, esc);
      $("#deduction-review").scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      return;
    }
    if (formIdentifier(form) === "deduct-confirm") {
      if (!deductionDraft) throw Error("Review this deduction first.");
      result = await api("deduct", deductionDraft, key);
      deductionDraft = null;
    }
    if (formIdentifier(form) === "grant") {
      b.amount = Number(b.amount);
      if (b.games) b.games = Number(b.games);
      if (b.tourSize) b.tourSize = Number(b.tourSize);
      result = await api("grant", b, key);
    }
    if (formIdentifier(form) === "registration-code") result = await api("invite", {player:b.player});
    if (formIdentifier(form) === "account-lock") result = await api("account-lock", {player:b.player,locked:b.locked === "true"},key);
    if (formIdentifier(form) === "access") {
      if (
        !confirm(
          "Reset access for " +
            b.player +
            "? This revokes their sessions and lets the new code set their password.",
        )
      )
        return;
      result = await api("reset", { player: b.player });
    }
    if (form.dataset.settleMatch) {
      const match = settlementMatch(form.dataset.settleMatch),
        body = settlementBody(match, b);
      settlementDrafts[match.id] = {
        ...settlementDraft(match, settlementDrafts[match.id]),
        ...b,
        requestKey: key,
      };
      if (
        !confirm(
          match.mode === "tour"
            ? `Post ${body.winner} as the winner of ${match.tour}? This pays correct-winner rewards and is final.`
            : `Settle ${match.title}: ${match.team_a} ${body.scoreA} : ${body.scoreB} ${match.team_b}? This pays rewards and is final.`,
        )
      )
        return;
      result = await api("settle", body, key);
      delete settlementDrafts[match.id];
    }
    if (formIdentifier(form) === "quiz-scores-reset") {
      if (
        !confirm(
          "Reset scores, active runs and completion titles for " +
            b.quizName +
            "? Credits remain, and previously claimed rewards cannot be earned again.",
        )
      )
        return;
      result = await api(
        "quiz-scores-reset",
        { quiz: b.quiz, confirmation: "RESET QUIZ SCORES AND TITLES" },
        key,
      );
    }
    if (formIdentifier(form) === "quiz-delete") {
      if (
        !confirm(
          `Permanently delete quiz "${b.quizName}"? This removes its song pool, scores, active runs, and completion titles, and cannot be undone.`,
        )
      )
        return;
      result = await api(
        "quiz-delete",
        { quiz: b.quiz, confirmation: "DELETE QUIZ" },
        key,
      );
      quizSelection = null;
      quizPool = null;
    }
    if (formIdentifier(form) === "aliases-sync") {
      if (submit) submit.textContent = "Scanning…";
      result = await api("aliases-sync", {}, key);
      if (result.aliasSync?.status !== "synced") {
        await load();
        throw Error(
          result.aliasSync?.error ||
            "An alias scan is already in progress. Try again shortly.",
        );
      }
      result.message =
        "Alias Scan Complete · " +
        result.aliasSync.players +
        " players · " +
        result.aliasSync.aliases +
        " sheet aliases · " + (result.aliasSync.removed || 0) + " removed · " +
        (result.aliasSync.moved || 0) + " moved. Issue a one-use code before a new player registers.";
    }
    if (formIdentifier(form) === "settings") {
      b.premium_character = Number(b.premium_character);
      b.premium_seiyuu = Number(b.premium_seiyuu);
      b.character = Number(b.character);
      b.seiyuu = Number(b.seiyuu);
      result = await api("settings", b, key);
    }
    if (formIdentifier(form) === "role") {
      const c = state.cards.find((c) => c.id === b.card);
      if (!c) throw new Error("Choose a character.");
      result = await api("catalog", { cards: [{ ...c, role: b.role }] }, key);
    }
    if (formIdentifier(form) === "reset-player") {
      if (b.confirmation !== `RESET PLAYER ${b.player}`)
        throw new Error(
          "The confirmation phrase must match the selected player ID.",
        );
      if (
        !confirm(
          `Permanently reset gameplay for ${b.player}? Their identity and password will remain.`,
        )
      )
        return;
      result = await api("reset-player", b, key);
    }
    if (formIdentifier(form) === "reset-all") {
      const full = b.scope === "everything";
      if (
        b.confirmation !== (full ? "DELETE EVERYTHING" : "RESET ALL GAME DATA")
      )
        throw new Error(
          "The confirmation phrase does not match the selected scope.",
        );
      if (
        !confirm(
          full
            ? "DELETE all players, aliases, usernames, passwords, and game data? Character and seiyuu catalogues, import progress, and rarity data will remain."
            : "RESET all community gameplay? Player identities and catalog will remain.",
        )
      )
        return;
      result = await api(
        "reset-all",
        { confirmation: b.confirmation, deleteRegistry: full },
        key,
      );
    }
    if (!result || typeof result.message !== "string")
      throw Error(
        "This host form could not be submitted. Reload the console and try again.",
      );
    await load();
    if (timerTarget) {
      if (timerTarget.event) {
        managedTour = await api("pickem-event?event=" + timerTarget.event);
        matchDraft = managedTour.matches.find(p => p.id === timerTarget.pickem) || null;
        $("#manage-pickem-tour select[name=event]").value = String(timerTarget.event);
        $("#pickem-tour-manager").innerHTML = tourManager(managedTour, esc);
      } else {
        matchDraft = await api("pickem-match?pickem=" + timerTarget.pickem);
        $("#pickem-editor").innerHTML = matchEditor(matchDraft, esc);
      }
    }
    delete form.dataset.requestKey;
    report(
      result.message +
        (result.code
          ? `\n\nPLAYER: ${result.player}\nONE-USE CODE: ${result.code}\n\nShare this code privately with that player. Expires in seven days.`
          : ""),
    );
    if (formIdentifier(form) === "tour-winner-create") {
      const link = document.createElement("a");
      link.href = routeHref(result.pickem ? "pickems/" + result.pickem : "pickems");
      link.className = "button secondary space-top";
      link.textContent = "Open Public Pick’em →";
      $("#result").append(document.createElement("br"), link);
      $("#result").scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } catch (err) {
    report(err.message, true, form);
  } finally {
    working = false;
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "host-quiz-search") {
    quizSearch = ev.target.value;
    for (const [id, published] of [["host-quiz-select", true], ["host-quiz-draft", false]]) {
      $("#"+id).innerHTML = quizPickerOptions(state.quizzes, published, quizSearch, quizSelection, esc);
    }
    return;
  }
  if (ev.target.dataset.creditSearch) {
    updateCreditPlayerSearch(state,ev.target,esc);
  }
  if (ev.target.closest("#deduct")) {
    deductionDraft = null;
    $("#deduction-review").innerHTML = "";
  }
  rememberSettlement(ev.target);
  const form = ev.target.closest("form");
  if(form && formIdentifier(form)==="quiz-save" && ev.target.name==="name") refreshQuizNameWarnings(form,esc);
  syncWinnerRewardDefault(form, ev.target);
  if (
    form?.getAttribute("id") === "participation-preview" &&
    participationDraft
  ) {
    participationDraft = null;
    $("#participation-preview-result").textContent =
      "Tour details changed. Review the pasted roster again.";
  }
  if (form?.getAttribute("id") === "grant" && ev.target.name === "games")
    updateRewardDefaults(form);
  if (form) delete form.dataset.requestKey;
});
document.addEventListener(
  "invalid",
  (ev) => {
    const input = ev.target;
    if (
      !["tour-winner-create", "edit-tour-winner"].includes(
        input.form?.getAttribute("id"),
      )
    )
      return;
    const label = input.labels?.[0]?.textContent.trim() || input.name;
    report(`${label}: ${input.validationMessage}`, true, input.form);
  },
  true,
);
document.addEventListener("change", (ev) => {
  if (ev.target === hostSection) {
    const next = hostSection.value;
    hostSection.value = tab;
    document.querySelector('.host-tabs [data-tab="' + next + '"]').click();
    return;
  }
  rememberSettlement(ev.target);
  if (ev.target.dataset.deadlineTarget) {
    const target = ev.target.form.elements.namedItem(
      ev.target.dataset.deadlineTarget,
    );
    target.disabled = ev.target.checked;
  }
  const form = ev.target.closest("form");
  if (form?.getAttribute("id") === "deduct") {
    deductionDraft = null;
    $("#deduction-review").innerHTML = "";
  }
  if (
    form?.getAttribute("id") === "grant" &&
    ["reason", "games", "tourSize"].includes(ev.target.name)
  )
    updateRewardDefaults(form);
  if (form) delete form.dataset.requestKey;
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest(
    "[data-tab],[data-reward-tool],[data-audit-page],#lock,#export-ledger,[data-pickem-edit],[data-settlement-tour],[data-settlement-refresh],[data-cancel-deduction]",
  );
  if (!t || working) return;
  if (t.dataset.rewardTool) {
    rewardTool = t.dataset.rewardTool;
    for (const button of document.querySelectorAll("[data-reward-tool]"))
      button.setAttribute("aria-pressed", button === t);
    for (const panel of document.querySelectorAll("[data-reward-panel]"))
      panel.hidden = panel.dataset.rewardPanel !== rewardTool;
    return;
  }
  if (t.hasAttribute("data-cancel-deduction")) {
    deductionDraft = null;
    $("#deduction-review").innerHTML = "";
    return;
  }
  if (t.dataset.settlementTour || t.hasAttribute("data-settlement-refresh")) {
    working = true;
    t.disabled = true;
    try {
      const id = Number(t.dataset.settlementTour || settlementTour?.id);
      settlementTour =
        t.dataset.settlementTour && settlementTour?.id === id
          ? null
          : await api("pickem-event?event=" + id);
      renderSettlement();
    } catch (err) {
      report(err.message, true);
    } finally {
      working = false;
      t.disabled = false;
    }
    return;
  }
  if (t.dataset.pickemEdit) {
    working = true;
    try {
      matchDraft = await api(
        "pickem-match?pickem=" + Number(t.dataset.pickemEdit),
      );
      if (matchDraft.settled) throw Error("Settled pick’ems cannot be edited.");
      $("#pickem-editor").innerHTML = matchEditor(matchDraft, esc);
      $("#pickem-editor").focus({ preventScroll: true });
      $("#pickem-editor").scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    } catch (err) {
      report(err.message, true);
    } finally {
      working = false;
    }
    return;
  }
  if (t.dataset.tab) {
    working = true;
    try {
      report("Loading…");
      await load(t.dataset.tab);
      report("");
    } catch (error) {
      report(error.message, true);
    } finally {
      working = false;
    }
    return;
  }
  if (t.id === "lock") {
    if (adminSession) {
      try {
        const response = await fetch("api/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!response.ok) throw new Error("Sign out failed.");
      } catch {
        report("Could not sign out. Please retry while connected.", true);
        return;
      }
      adminSession = false;
    }
    loadVersion++;
    tab = "rewards";
    state = null;
    settlementTour = null;
    for (const id of Object.keys(settlementDrafts)) delete settlementDrafts[id];
    $("#host-content").innerHTML = "";
    $("#console").hidden = true;
    $("#unlock").hidden = false;
    report("Console locked.");
  }
  if (t.dataset.auditPage) {
    working = true;
    try {
      if (t.dataset.auditPage === "next") {
        auditHistory.push(auditFilters.before || "");
        auditFilters.before = auditData.next;
      } else auditFilters.before = auditHistory.pop() || "";
      await loadCreditAudit();
      render();
    } catch (error) {
      report(error.message, true);
    } finally {
      working = false;
    }
  }
  if (t.id === "export-ledger") {
    working = true;
    t.disabled = true;
    try {
      const response = await fetch("api/host/activity-csv");
      if (
        !response.ok ||
        response.headers.get("Content-Type")?.includes("text/html")
      )
        await readApiResponse(response);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await response.blob());
      a.download = "amqtours-recent-activity-12h.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (error) {
      report(error.message, true);
    } finally {
      working = false;
      t.disabled = false;
    }
  }
});

// Existing administrator sessions also work when opening this page from the player site.
openConsole()
  .then(loaded => {
    if (!loaded) return;
    adminSession = true;
    $("#unlock").hidden = true;
    $("#console").hidden = false;
  })
  .catch(error => {
    if (error.status !== 401 && !working) report(error.message, true);
  });

setInterval(() => {
  if (
    state &&
    tab === "catalog" &&
    !working &&
    !document.hidden &&
    !document.activeElement?.matches("input,select,textarea")
  )
    load().catch((err) => report(err.message, true));
}, 30000);
setInterval(() => {
  if (state && tab === "quiz" && !working && !document.hidden && quizLibraryStatus?.job?.status === "running") {
    void pollQuizLibrary();
  }
}, 10000);

document.addEventListener("click", (ev) => {
  const edit = ev.target.closest("[data-new-quiz], [data-quiz-review-retry]");
  if (!edit || working) return;
  if (edit.hasAttribute("data-quiz-review-retry")) {
    previewQuizFile($("#quiz-save").elements.songsFile, api, esc);
    return;
  }
  quizSelection = null;
  quizPool = null;
  render();
});

document.addEventListener("change", (ev) => {
  if (["host-quiz-select","host-quiz-draft"].includes(ev.target.id) && !working) {
    quizSelection = ev.target.value || null;
    quizPool = null;
    render();
    if (quizSelection) {
      const selected = quizSelection;
      api("quiz-songs?id=" + encodeURIComponent(selected))
        .then((pool) => {
          if (quizSelection !== selected || tab !== "quiz") return;
          quizPool = pool;
          const region = $("#quiz-current-pool");
          if (region) {
            region.innerHTML = quizPoolEditor(pool, esc);
            $("#quiz-save").dataset.poolLoading = "false";
            $("#quiz-save button[type=submit]").disabled = false;
          }
        })
        .catch((err) => report(err.message, true));
    }
    $("#"+ev.target.id)?.focus();
  }
  if (
    ev.target.name === "songsFile" &&
    formIdentifier(ev.target.form) === "quiz-save"
  )
    previewQuizFile(ev.target, api, esc);
});

document.addEventListener("click", (event) => {
  if(event.target.closest('[data-quiz-review-sort]'))handleQuizReviewSort(event);
  if(event.target.closest('[data-quiz-pool-check]')&&!working)checkQuizPoolLinks(event,api,esc).catch(err=>report(err.message,true));
  if (event.target.closest("[data-quiz-audio-action]") && !working)
    handleQuizAudioReview(event, api, esc).catch((err) =>
      report(err.message, true),
    );
});
document.addEventListener('change',event=>{
  if(['songMode','removeSongIds'].includes(event.target.name)&&formIdentifier(event.target.form)==='quiz-save')refreshQuizReviewWarnings(event.target.form,esc);
});
