import { winnerCreatePanel } from "./tour-winner-ui.js";
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
} from "./pickem-management.js";
import { updateRewardDefaults } from "./host-defaults.js";
import { accessPanel, participationPanel } from "./host-panels.js";
let participationDraft = null,
  matchDraft = null,
  managedTour = null,
  settlementTour = null;
const settlementDrafts = {};
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
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(
      "Host tools need the Cloudflare backend. This static preview does not process host actions.",
    );
  }
  if (!r.ok) throw new Error(data.error);
  return data;
}
const players = () =>
  state.players
    .map(
      (p) =>
        `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)}) · ${p.balance} credits</option>`,
    )
    .join("");
const input = (label, name, type = "text", attrs = "") =>
  `<label>${label}<input name="${name}" type="${type}" required ${attrs}></label>`;
function render() {
  document
    .querySelectorAll(".host-tabs button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  let html = "";
  if (tab === "rewards")
    html = `<section class="host-panel"><h2>Reward the work behind the tour.</h2><p>All host-awarded categories are here: reporting, counting, and tour participation. Each successful grant appears in the audit ledger and counts toward lifetime earnings.</p><form id="grant" class="stack"><label>AMQ player<select name="player" required><option value="">Choose a player</option>${players()}</select></label><div class="form-grid"><label>Category<select name="reason"><option value="reporting">Reporting</option><option value="counting">Counting</option><option value="participation">Tour participation</option><option value="other">Other</option></select></label>${input("Credit amount", "amount", "number", 'min="1" max="1000000" step="1" value="500"')}</div><label class="reporting-games"><span class="reward-games-label">Games reported</span><input name="games" type="number" min="1" max="2000" step="1" value="1" required></label><p class="form-hint">Defaults: participation 1,000 · counting 300 per game · reporting 500 per game. Credit amounts can be edited.</p>${input("Tour identifier (used once per activity count)", "event", "text", 'maxlength="240" placeholder="usual-2026-10-24-42"')}${input("Tour / explanation (audit note)", "note", "text", 'maxlength="240" placeholder="Friday Usual #42 · reporting"')}<button class="button" type="submit">Grant credits →</button></form></section>`;
  if (tab === "players")
    html = `<section class="host-panel"><h2>One player. One AMQ identity.</h2><p>Import stable AMQ Tours IDs and aliases. Upload a CSV with headers <code>id,name,aliases</code>. Separate aliases with a pipe: <code>alias1|alias2</code>. Existing aliases are retained; conflicts roll back the entire import.</p><form id="players" class="stack"><label>CSV player / alias sheet<input type="file" id="players-file" accept=".csv,text/csv" required></label><button class="button" type="submit">Import players &amp; aliases →</button></form><p class="form-hint space-top">The alias sheet remains the identity source. Manual imports supplement the automatic sheet sync. Neither operation edits AMQ Tours ratings or writes to the source sheet.</p></section><section class="host-panel"><h2>Issue account access</h2><p>Codes can be used once and expire in seven days. Deliver the code to the correct player through your usual channel. An account reset revokes sessions and preserves credits and cards.</p><form id="access" class="stack"><label>Player<select name="player" required><option value="">Choose a player</option>${players()}</select></label><label>Action<select name="operation"><option value="invite">Issue registration code</option><option value="reset">Reset existing account access</option></select></label><button class="button secondary" type="submit">Generate one-use code →</button></form></section><div class="table-wrap"><table><thead><tr><th>ID</th><th>NAME</th><th>ACCESS</th><th>ALIASES</th></tr></thead><tbody>${state.players
      .map(
        (p) =>
          `<tr><td>${esc(p.id)}</td><td>${esc(p.name)}</td><td>${p.registered ? "Registered" : "Awaiting registration"}</td><td>${state.aliases
            .filter((a) => a.player === p.id)
            .map((a) => esc(a.alias))
            .join(", ")}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  if (tab === "players") {
    html =
      '<section class="host-panel"><h2>Beta registration</h2><p>A shared beta code lets unregistered AMQ Tours players create their accounts. Existing accounts and administrator identities remain protected. Account recovery still uses individual codes.</p><form id="beta-registration" class="stack"><label>Shared beta registration<select name="enabled"><option value="true" ' +
      (state.settings.beta_registration_enabled === 1 ? "selected" : "") +
      '>Enabled</option><option value="false" ' +
      (state.settings.beta_registration_enabled !== 1 ? "selected" : "") +
      '>Disabled · individual codes only</option></select></label><button class="button secondary" type="submit">Save beta registration</button></form></section>' +
      html;
    const a = state.aliasSync || {};
    html =
      `<section class="host-panel"><h2>AMQ Tours alias sheet</h2><p>Automatically reads the IDs worksheet every six hours. The first name for each Player ID becomes its original Tours name; all names remain searchable aliases. During beta, unregistered players can use the shared registration code when enabled. Individual codes remain available.</p><p>Status: <strong>${esc(a.status || "pending")}</strong> · ${a.players || 0} player IDs · ${a.aliases || 0} aliases${a.lastAt ? " · Last synchronized " + esc(new Date(a.lastAt).toLocaleString()) : ""}</p>${a.error ? '<p class="host-warning">' + esc(a.error) + "</p>" : ""}<form id="aliases-sync"><button class="button secondary" type="submit">Sync aliases now →</button></form><a class="text-button" href="https://docs.google.com/spreadsheets/d/1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA/edit?gid=1903970832" target="_blank" rel="noopener">Open source sheet ↗</a><p class="form-hint space-top">Numeric usernames can overlap player IDs. Sign-in prioritizes an exact ID; use alias:NAME to explicitly sign in by alias. Existing accounts and collections are preserved during canonical-ID migration.</p></section>` +
      html;
  }
  if (tab === "pickems") {
    const legacy = state.pickems.filter((p) => p.mode !== "tour");
    html = legacy.length
      ? `<details class="host-panel"><summary>Previous match pick’ems</summary><div class="table-wrap"><table><thead><tr><th>Match</th><th>Result</th><th>Manage</th></tr></thead><tbody>${legacy.map((p) => `<tr><td>${esc(p.title)}</td><td>${p.settled ? p.result_a + " : " + p.result_b : "Pending"}</td><td>${p.settled ? "Final" : `<button type="button" class="text-button" data-pickem-edit="${p.id}">Edit / delete</button>`}</td></tr>`).join("")}</tbody></table></div></details>`
      : "";
  }
  if (tab === "catalog")
    html = `<section class="host-panel"><h2>Pack prices</h2><p>Normal packs are uniform within each card type, regardless of role or rarity. Premium doubles the chances S and above, taking the additional probability only from D. Daily login rewards are 300 credits. Enhancing cards consumes duplicates with no additional credit fee.</p><form id="settings" class="stack"><div class="form-grid">${input("Character pack (five cards)", "character", "number", `min="1" max="1000000" value="${state.settings.character_price}"`)}${input("Seiyuu pack (five cards)", "seiyuu", "number", `min="1" max="1000000" value="${state.settings.seiyuu_price}"`)}</div><div class="form-grid">${input("Premium character pack (five cards)", "premium_character", "number", `min="1" max="1000000" value="${state.settings.premium_character_price || 1000}"`)}${input("Premium seiyuu pack (five cards)", "premium_seiyuu", "number", `min="1" max="1000000" value="${state.settings.premium_seiyuu_price || 1000}"`)}</div><button class="button secondary" type="submit">Save pack prices →</button></form></section>`;
  if (tab === "catalog") {
    const j = state.seiyuuImport || {
      status: "idle",
      importedActors: 0,
      scannedTitles: 0,
    };
    html += `<section class="host-panel"><h2>Characters &amp; seiyuus · Tenrai</h2><p>Imports MAL characters with documented Main/Supporting roles, bilingual anime titles, and Japanese voice actors. One request every 10 seconds, shared with favorite scans. Duplicate MAL IDs and host edits are preserved. Importing runs on Cloudflare while this page is closed.</p><p><strong>Status: ${esc(j.status)}</strong> · Source: ${esc(j.provider || "Tenrai")} · ${j.importedCharacters || 0} new characters · ${j.importedActors || 0} new actors · ${j.scannedTitles || 0}${j.totalTitles ? " / " + j.totalTitles : ""} anime checked</p>${j.lastError ? `<p class="host-warning">${esc(j.lastError)} ${j.status === "waiting" ? "Automatic retry after " + esc(new Date(j.nextAt).toLocaleString()) + "." : ""}</p>` : ""}<form id="jikan-control" class="stack"><button class="button secondary" type="submit" name="operation" value="${importActive(j) ? "jikan-pause" : "jikan-start"}" >${importActive(j) ? "Pause import" : "Start / resume import"}</button></form><p class="form-hint space-top">Retries temporary outages with increasing delays and honors Retry-After. An upstream access refusal pauses the job. Missing portraits are skipped; actors have no Main/Supporting classification.</p></section>`;
  }
  if (tab === "catalog") {
    const f = state.seiyuuImport?.favorites;
    html += `<section class="host-panel"><h2>MAL favorites &amp; rarity</h2><p>Separate character and seiyuu percentiles. AG top 0.1% · Ubers 0.5% · SSS 1% · SS 2.5% · S 5% · A 10% · B 20% · C 40% · D remainder. Equal counts share a tier. Normal packs are uniform; premium doubles S-and-higher chances by reducing D. Enhancement levels are independent.</p><p>Scan: ${esc(f?.status || "Not started")} · ${f?.scannedEntries || 0} profiles checked${f?.lastCompletedAt ? " · Last completed " + esc(new Date(f.lastCompletedAt).toLocaleString()) : ""}${f?.nextRefreshAt ? " · Next refresh " + esc(new Date(f.nextRefreshAt).toLocaleString()) : ""}</p><form id="favorites-refresh" class="stack"><label>Days between completed scans<input name="intervalDays" type="number" min="1" max="90" value="${f?.intervalDays || 15}" required></label><button class="button secondary" type="submit">Refresh favorites / save interval →</button></form><p class="form-hint">Scans up to 100 profiles per request, saves progress, and retries outages. Catalogue data cannot be cleared by any host reset.</p></section>`;
    if (state.catalogSummary?.source?.provider === "ACDB")
      html += `<section class="host-panel danger-panel"><h2>Replace the retired ACDB catalogue</h2><p class="warning-copy">Removes ACDB cards from collections and auctions, clears affected avatars, and refunds unclaimed auction holds. Other gameplay and accounts remain. Starts the MAL character import on Tenrai.</p><form id="replace-acdb" class="stack"><label>Type REPLACE ACDB WITH TENRAI<input name="confirmation" required autocomplete="off"></label><button class="button danger" type="submit">Replace ACDB with Tenrai</button></form></section>`;
  }
  if (tab === "activity")
    html = `<section class="host-panel"><h2>Every credit leaves a trail.</h2><p>Latest 100 wallet movements, including grants, pack purchases, auction holds, refunds, and pick’em payouts. Refunds do not increase lifetime earnings.</p><button class="button secondary" id="export-ledger">Download recent activity CSV</button></section><div class="table-wrap"><table><thead><tr><th>TIME</th><th>PLAYER ID</th><th>CREDITS</th><th>REASON</th></tr></thead><tbody>${state.ledger.map((l) => `<tr><td>${esc(new Date(l.at).toLocaleString())}</td><td>${esc(l.player)}</td><td class="${l.delta > 0 ? "ledger-positive" : "ledger-negative"}">${l.delta > 0 ? "+" : ""}${l.delta}</td><td>${esc(l.reason)}</td></tr>`).join("")}</tbody></table></div>`;
  if (tab === "catalog")
    html += `<section class="host-panel"><h2>Character Main / Supporting roles</h2><p>The first Main appearance is preferred as the series shown on the card; later Supporting credits do not demote it. Host corrections take precedence. Supporting cards have weight 100. Main cards use the configured lower weight. Seiyuus have no classification.</p><form id="role-search" class="stack"><label>Find a character by name or series<input name="query" maxlength="100" placeholder="Frieren"></label><button class="button secondary" type="submit">Search catalog →</button></form><form id="role" class="stack space-top"><label>Character<select name="card" required><option value="">Choose a character</option>${state.cards
      .filter((c) => c.kind === "character")
      .map(
        (c) =>
          `<option value="${esc(c.id)}">${esc(c.name)} · ${c.role}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Role<select name="role"><option value="supporting">Supporting</option><option value="main">Main</option><option value="unknown">Unsorted</option></select></label><button class="button secondary" type="submit">Save character role →</button></form></section>`;
  if (tab === "resets")
    html = `<section class="host-panel danger-panel"><h2>Reset an individual player</h2><p class="warning-copy">WARNING: Removes this player’s credits, lifetime earnings, cards, daily claims, tour activity, and predictions. Their showcases, gambling records, and open sale listings are cleared. Bidders on their cancelled listings are refunded. Their bids and unclaimed wins are removed; open lots restart at zero. Sessions are revoked. AMQ identity, username history, and password remain. This cannot be undone through this console.</p><form id="reset-player" class="stack"><label>Player<select name="player" required><option value="">Choose carefully</option>${players()}</select></label>${input("Type RESET PLAYER followed by their exact ID", "confirmation", "text", 'autocomplete="off" placeholder="RESET PLAYER 00123"')}<button class="button danger" type="submit">Reset this player’s gameplay</button></form></section><section class="host-panel danger-panel"><h2>Reset the entire community</h2><p class="warning-copy">WARNING: This impacts every player. All credits, collections, showcases, tour counts, wallet activity, pick’ems, predictions, auctions, shop listings, gambling records, and sessions will be cleared. Character and seiyuu catalogues, import progress, and rarity data are protected and always kept. Create an export or backup first. This cannot be undone through this console.</p><form id="reset-all" class="stack"><label>Reset scope<select name="scope" id="reset-scope"><option value="game">Reset gameplay · keep player registry, passwords, usernames, catalog, and prices</option><option value="everything">Delete all player data · include players, aliases, passwords, username history, and prices; keep catalogues</option></select></label><p class="form-hint">Gameplay: type <code>RESET ALL GAME DATA</code><br>Delete all player data: type <code>DELETE EVERYTHING</code>. Automatic sync recreates source player IDs as unregistered identities afterward; deleted credentials and gameplay do not return. The host token is a deployment secret and remains available.</p>${input("Exact confirmation phrase", "confirmation", "text", 'autocomplete="off"')}<button class="button danger" type="submit">Reset all selected data</button></form></section>`;
  if (tab === "catalog" && state.resourceBudget) {
    const b = state.resourceBudget;
    const sources = Object.entries(b.sources || {})
      .map(
        ([source, usage]) =>
          `<tr><td>${esc({ catalogImport: "Catalogue import & favorites", requests: "Player & host requests", indexing: "Anime indexing", aliases: "Alias synchronization", maintenance: "Scheduled maintenance", startup: "Database initialization", unattributed: "Earlier usage (not attributed)" }[source] || source)}</td><td>${usage.rowsRead.toLocaleString()}</td><td>${usage.rowsWritten.toLocaleString()}</td></tr>`,
      )
      .join("");
    html =
      `<section class="host-panel"><h2>Background import usage</h2><p>${b.mode === "continuous" ? "Continuous import enabled. The daily free-plan pause is disabled; saved progress and upstream backoff are retained." : b.backgroundPaused ? "Automatic scans are resting until " + esc(new Date(b.nextResumeAt).toLocaleString()) + " to leave capacity for players." : "Automatic scans are within today’s reserved budget."}</p><p class="form-hint">App-local SQL estimate since tracking began: ${b.rowsRead.toLocaleString()} rows read · ${b.rowsWritten.toLocaleString()} rows written (${esc(b.day)}, UTC). ${b.mode === "continuous" ? "The importer makes one source request at a time, at least 10 seconds apart. No daily app-level row limit is applied." : "Background work rests at 2 million reads or 30,000 writes and resumes the next UTC day."} Account-wide usage and platform overhead can differ.</p>${sources ? `<table><thead><tr><th>Source</th><th>Rows read</th><th>Rows written</th></tr></thead><tbody>${sources}</tbody></table><p class="form-hint">Source breakdown started ${esc(new Date(b.breakdownSince).toLocaleString())}. Earlier totals remain unattributed. Counts exclude platform storage operations and checkpoint overhead.</p>` : ""}</section>` +
      html;
  }
  if (tab === "rewards") html = participationPanel() + html;
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
}
async function load() {
  state = await api("state");
  if (settlementTour) {
    if (state.pickemEvents.some((t) => t.id === settlementTour.id))
      settlementTour = await api("pickem-event?event=" + settlementTour.id);
    else settlementTour = null;
  }
  render();
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
// RFC 4180-style quoted CSV, including embedded newlines, commas and doubled quotes.
export function parseCSV(raw) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (quoted && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
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
    if (form.id === "admin-login-form") {
      const response = await fetch("api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      adminSession = true;
      await load();
      form.reset();
      $("#unlock").hidden = true;
      $("#console").hidden = false;
      report("Administrator signed in. All host tools are available.");
      return;
    }
    const b = Object.fromEntries(new FormData(form));
    let result;
    if (form.id === "tour-winner-create") {
      result = await api(
        "pickem-winner",
        {
          name: b.name,
          teams: b.teams,
          winnerReward: Number(b.winnerReward),
          ...(b.endsAutomatic ? {} : { ends: new Date(b.ends).getTime() }),
        },
        key,
      );
    }
    if (form.id === "edit-tour-winner") {
      if (!matchDraft) throw Error("Open a tour pick’em first.");
      result = await api(
        "pickem-winner-edit",
        {
          pickem: matchDraft.id,
          expected: matchDraft,
          name: b.name,
          teams: b.teams,
          winnerReward: Number(b.winnerReward),
          ends:
            b.ends === localDeadline(matchDraft.ends)
              ? matchDraft.ends
              : new Date(b.ends).getTime(),
          clearPredictions: !!b.clearPredictions,
        },
        key,
      );
    }
    if (form.id === "manage-pickem-tour") {
      managedTour = await api("pickem-event?event=" + Number(b.event));
      if (managedTour.format === "winner")
        matchDraft = managedTour.matches[0] || null;
      $("#pickem-tour-manager").innerHTML = tourManager(managedTour, esc);
      return;
    }
    if (form.id === "combine-pickem-tour") {
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
    if (form.id === "rename-pickem-tour") {
      if (!managedTour) throw Error("Open a tour first.");
      result = await api(
        "pickem-event-edit",
        { event: managedTour.id, name: b.name, expectedName: managedTour.name },
        key,
      );
    }
    if (form.id === "delete-pickem-tour") {
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
    if (form.id === "edit-pickem" || form.id === "delete-pickem") {
      if (!matchDraft) throw Error("Open a pick’em first.");
      const body = { ...b, pickem: matchDraft.id, expected: matchDraft };
      if (form.id === "edit-pickem") {
        body.ends =
          b.ends === localDeadline(matchDraft.ends)
            ? matchDraft.ends
            : new Date(b.ends).getTime();
        body.winnerReward = Number(b.winnerReward);
        body.scoreReward = Number(b.scoreReward);
        body.clearPredictions = !!b.clearPredictions;
      }
      result = await api(
        form.id === "edit-pickem" ? "pickem-edit" : "pickem-delete",
        body,
        key,
      );
    }
    if (form.id === "participation-preview") {
      const preview = await api("participation-preview", { text: b.text });
      participationDraft = {
        ...b,
        amount: Number(b.amount),
        expectedPlayers: preview.players.map((p) => p.id),
      };
      $("#participation-preview-result").innerHTML =
        `<h3 class="space-top">Review participation rewards</h3><p>${preview.players.length} players · ${Number(b.amount).toLocaleString()} each · <strong>${(preview.players.length * Number(b.amount)).toLocaleString()} credits total</strong><br>Tour: ${esc(b.event)} · ${esc(b.note)}</p><div class="host-round">${preview.players.map((p) => esc(p.name) + " (" + esc(p.id) + ")").join(" · ")}</div><form id="participation-batch" class="space-top"><button class="button" type="submit">Award reviewed participation credits →</button></form>`;
      report("Review the resolved players and total before awarding.");
      return;
    }
    if (form.id === "participation-batch") {
      if (!participationDraft) throw Error("Review participants first.");
      result = await api("participation-batch", participationDraft, key);
    }
    if (form.id === "host-permissions") {
      result = await api(
        "permissions",
        { player: b.player, enabled: b.enabled === "true" },
        key,
      );
    }
    if (form.id === "role-search") {
      const response = await fetch(
        "api/catalog?kind=character&q=" + encodeURIComponent(b.query),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      state.cards = data.cards;
      render();
      report(
        data.cards.length +
          " results shown (up to 40). Refine the search if needed.",
      );
      return;
    }
    if (form.id === "beta-registration")
      result = await api(
        "beta-registration",
        { enabled: b.enabled === "true" },
        key,
      );
    if (form.id === "favorites-refresh")
      result = await api(
        "favorites-refresh",
        { intervalDays: Number(b.intervalDays) },
        key,
      );
    if (form.id === "replace-acdb") result = await api("replace-acdb", b, key);
    if (form.id === "jikan-control")
      result = await api(ev.submitter.value, {}, key);
    if (form.id === "grant") {
      b.amount = Number(b.amount);
      if (b.games) b.games = Number(b.games);
      result = await api("grant", b, key);
    }
    if (form.id === "players") {
      const rows = parseCSV(
        (await $("#players-file").files[0].text()).replace(/^\uFEFF/, ""),
      );
      const headers = rows.shift()?.map((s) => s.trim().toLowerCase());
      if (!headers?.includes("id") || !headers.includes("name"))
        throw new Error("CSV headers must include id and name.");
      const players = rows.map((r) => ({
        id: r[headers.indexOf("id")]?.trim(),
        name: r[headers.indexOf("name")]?.trim(),
        aliases: (r[headers.indexOf("aliases")] || "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
      }));
      result = await api("players", { players }, key);
    }
    if (form.id === "access") {
      if (
        b.operation === "reset" &&
        !confirm(
          "Reset access for " +
            b.player +
            "? This revokes their sessions and lets the new code set their password.",
        )
      )
        return;
      result = await api(b.operation, { player: b.player });
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
    if (form.id === "aliases-sync") result = await api("aliases-sync", {}, key);
    if (form.id === "settings") {
      b.premium_character = Number(b.premium_character);
      b.premium_seiyuu = Number(b.premium_seiyuu);
      b.character = Number(b.character);
      b.seiyuu = Number(b.seiyuu);
      result = await api("settings", b, key);
    }
    if (form.id === "role") {
      const c = state.cards.find((c) => c.id === b.card);
      if (!c) throw new Error("Choose a character.");
      result = await api("catalog", { cards: [{ ...c, role: b.role }] }, key);
    }
    if (form.id === "reset-player") {
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
    if (form.id === "reset-all") {
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
    await load();
    delete form.dataset.requestKey;
    report(
      result.message +
        (result.code
          ? `\n\nPLAYER: ${result.player}\nONE-USE CODE: ${result.code}\n\nShare this code privately with that player. Expires in seven days.`
          : ""),
    );
    if (form.id === "tour-winner-create") {
      const link = document.createElement("a");
      link.href = "./#pickems";
      link.className = "button secondary space-top";
      link.textContent = "View public pick’ems →";
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
  rememberSettlement(ev.target);
  const form = ev.target.closest("form");
  if (form?.id === "grant" && ev.target.name === "games")
    updateRewardDefaults(form);
  if (form) delete form.dataset.requestKey;
});
document.addEventListener(
  "invalid",
  (ev) => {
    const input = ev.target;
    if (!["tour-winner-create", "edit-tour-winner"].includes(input.form?.id))
      return;
    const label = input.labels?.[0]?.textContent.trim() || input.name;
    report(`${label}: ${input.validationMessage}`, true, input.form);
  },
  true,
);
document.addEventListener("change", (ev) => {
  rememberSettlement(ev.target);
  if (ev.target.dataset.deadlineTarget) {
    const target = ev.target.form.elements.namedItem(
      ev.target.dataset.deadlineTarget,
    );
    target.disabled = ev.target.checked;
  }
  const form = ev.target.closest("form");
  if (form?.id === "grant" && ["reason", "games"].includes(ev.target.name))
    updateRewardDefaults(form);
  if (form) delete form.dataset.requestKey;
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest(
    "[data-tab],#lock,#export-ledger,[data-pickem-edit],[data-settlement-tour],[data-settlement-refresh]",
  );
  if (!t || working) return;
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
    tab = t.dataset.tab;
    render();
    report("");
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
    state = null;
    settlementTour = null;
    for (const id of Object.keys(settlementDrafts)) delete settlementDrafts[id];
    $("#host-content").innerHTML = "";
    $("#console").hidden = true;
    $("#unlock").hidden = false;
    report("Console locked.");
  }
  if (t.id === "export-ledger") {
    const cell = (s) =>
      '"' +
      String(s ?? "")
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    const csv = [
      ["time", "player", "delta", "reason"],
      ...state.ledger.map((l) => [
        new Date(l.at).toISOString(),
        l.player,
        l.delta,
        l.reason,
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "amqtours-recent-activity.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});

// Existing administrator sessions also work when opening this page from the player site.
fetch("api/state")
  .then((r) => r.json())
  .then(async (s) => {
    if (s.me?.is_admin) {
      adminSession = true;
      await load();
      $("#unlock").hidden = true;
      $("#console").hidden = false;
    }
  })
  .catch(() => {});

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
