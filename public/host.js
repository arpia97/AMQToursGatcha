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
let secret = "",
  adminSession = false,
  state,
  tab = "rewards",
  working = false;
function report(message, error = false) {
  $("#result").textContent = message;
  $("#result").className = "host-result" + (error ? " error" : "");
}
async function api(path, body, key) {
  const r = await fetch("api/host/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + secret,
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
    html = `<section class="host-panel"><h2>Reward the work behind the tour.</h2><p>All host-awarded categories are here: reporting, counting, and tour participation. Each successful grant appears in the audit ledger and counts toward lifetime earnings.</p><form id="grant" class="stack"><label>AMQ player<select name="player" required><option value="">Choose a player</option>${players()}</select></label><div class="form-grid"><label>Category<select name="reason"><option value="reporting">Reporting</option><option value="counting">Counting</option><option value="participation">Tour participation</option><option value="other">Other</option></select></label>${input("Credit amount", "amount", "number", 'min="1" max="1000000" step="1"')}</div>${input("Tour identifier (used once per activity count)", "event", "text", 'maxlength="240" placeholder="usual-2026-10-24-42"')}${input("Tour / explanation (audit note)", "note", "text", 'maxlength="240" placeholder="Friday Usual #42 · reporting"')}<button class="button" type="submit">Grant credits →</button></form></section>`;
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
    const a = state.aliasSync || {};
    html =
      `<section class="host-panel"><h2>AMQ Tours alias sheet</h2><p>Automatically reads the IDs worksheet every six hours. The first name for each Player ID becomes its original Tours name; all names remain searchable aliases. Host-issued registration codes are still required.</p><p>Status: <strong>${esc(a.status || "pending")}</strong> · ${a.players || 0} player IDs · ${a.aliases || 0} aliases${a.lastAt ? " · Last synchronized " + esc(new Date(a.lastAt).toLocaleString()) : ""}</p>${a.error ? '<p class="host-warning">' + esc(a.error) + "</p>" : ""}<form id="aliases-sync"><button class="button secondary" type="submit">Sync aliases now →</button></form><a class="text-button" href="https://docs.google.com/spreadsheets/d/1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA/edit?gid=1903970832" target="_blank" rel="noopener">Open source sheet ↗</a><p class="form-hint space-top">Numeric usernames can overlap player IDs. Sign-in prioritizes an exact ID; use alias:NAME to explicitly sign in by alias. Existing accounts and collections are preserved during canonical-ID migration.</p></section>` +
      html;
  }
  if (tab === "pickems")
    html = `<section class="host-panel"><h2>Put the next match on the board.</h2><p>Entry is free. Rewards are additive: correct winner + exact score for team A + exact score for team B. Scores must identify a winning team.</p><form id="pickem" class="stack">${input("Match title", "title", "text", 'maxlength="160"')}${input("Active tour name", "tour", "text", 'maxlength="160"')}<div class="form-grid">${input("Team A", "teamA", "text", 'maxlength="100"')}${input("Team B", "teamB", "text", 'maxlength="100"')}</div>${input("Predictions close (your browser’s local time)", "ends", "datetime-local")}<div class="form-grid">${input("Correct winner reward", "winnerReward", "number", 'min="0" max="100000" value="300"')}${input("Each exact team score reward", "scoreReward", "number", 'min="0" max="100000" value="100"')}</div><button class="button" type="submit">Publish pick’em →</button></form></section><section class="host-panel"><h2>Post a final score</h2><p>Available after the deadline. Settlement is final and pays all correct predictions once. Verify the match and scores before submitting.</p><form id="settle" class="stack"><label>Closed pick’em<select name="pickem" required><option value="">Choose a match</option>${state.pickems
      .filter((p) => !p.settled && p.ends <= Date.now())
      .map(
        (p) =>
          `<option value="${p.id}">${esc(p.title)} · ${esc(p.team_a)} / ${esc(p.team_b)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="form-grid">${input("Team A final score", "scoreA", "number", 'min="0" max="1000"')}${input("Team B final score", "scoreB", "number", 'min="0" max="1000"')}</div><button class="button secondary" type="submit">Settle and distribute rewards →</button></form></section><div class="table-wrap"><table><thead><tr><th>MATCH</th><th>TEAMS</th><th>CLOSES</th><th>RESULT</th></tr></thead><tbody>${state.pickems.map((p) => `<tr><td>${esc(p.title)}</td><td>${esc(p.team_a)} / ${esc(p.team_b)}</td><td>${esc(new Date(p.ends).toLocaleString())}</td><td>${p.settled ? p.result_a + "–" + p.result_b : "Pending"}</td></tr>`).join("")}</tbody></table></div>`;
  if (tab === "catalog")
    html = `<section class="host-panel"><h2>Keep the card pool growing.</h2><p>Current catalog: ${state.catalog.map((c) => `${c.count} ${c.kind} cards`).join(" · ") || "Empty"}. Normal packs select every card equally, with replacement. Premium packs double AG/Ubers/SSS/SS/S chances by reducing D. Auctions select five distinct cards per type each week.</p><form id="catalog" class="stack"><label>Catalog JSON file<input type="file" id="catalog-file" accept=".json,application/json" required></label><button class="button" type="submit">Import catalog →</button></form><p class="form-hint space-top">Each record: <code>{id, kind, name, series, image, source}</code>. Kind is <code>character</code> or <code>seiyuu</code>. HTTPS image/source URLs. Characters can include a role of main or supporting. Seiyuus have no classification. Tenrai imports MAL characters with Main/Supporting roles and MAL portraits. Optional series_romaji and series_english fields preserve both title versions.</p><div class="toolbar space-top"><button class="button secondary" id="sample-catalog">Import 22-card starter catalog</button><a href="sample-catalog.json" class="text-button" download>Download sample format ↗</a></div><p class="host-warning">The starter is a small sample, not a complete anime database. Expand the pool before community launch.</p></section><section class="host-panel"><h2>Pack prices</h2><p>Normal packs are uniform within each card type, regardless of role or rarity. Premium doubles the chances S and above, taking the additional probability only from D. Daily login rewards remain 100 credits. Enhancing cards consumes duplicates with no additional credit fee.</p><form id="settings" class="stack"><div class="form-grid">${input("Character pack (five cards)", "character", "number", `min="1" max="1000000" value="${state.settings.character_price}"`)}${input("Seiyuu pack (five cards)", "seiyuu", "number", `min="1" max="1000000" value="${state.settings.seiyuu_price}"`)}</div><div class="form-grid">${input("Premium character pack (five cards)", "premium_character", "number", `min="1" max="1000000" value="${state.settings.premium_character_price || 1000}"`)}${input("Premium seiyuu pack (five cards)", "premium_seiyuu", "number", `min="1" max="1000000" value="${state.settings.premium_seiyuu_price || 1000}"`)}</div><button class="button secondary" type="submit">Save pack prices →</button></form></section>`;
  if (tab === "catalog") {
    const j = state.seiyuuImport || {
      status: "idle",
      importedActors: 0,
      scannedTitles: 0,
    };
    html += `<section class="host-panel"><h2>Characters &amp; seiyuus · Tenrai</h2><p class="host-warning">Jikan’s public API closed on October 1, 2026. This importer now uses Tenrai. <a href="https://github.com/jikan-me/jikan-rest/issues/613" target="_blank" rel="noopener">Official shutdown announcement ↗</a></p><p>Imports MAL characters with documented Main/Supporting roles, bilingual anime titles, and Japanese voice actors. One request every 10 seconds, shared with favorite scans. Duplicate MAL IDs and host edits are preserved. Importing runs on Cloudflare while this page is closed.</p><p><strong>Status: ${esc(j.status)}</strong> · Source: ${esc(j.provider || "Jikan (retired)")} · ${j.importedCharacters || 0} new characters · ${j.importedActors || 0} new actors · ${j.scannedTitles || 0}${j.totalTitles ? " / " + j.totalTitles : ""} anime checked</p>${j.lastError ? `<p class="host-warning">${esc(j.lastError)} ${j.status === "waiting" ? "Automatic retry after " + esc(new Date(j.nextAt).toLocaleString()) + "." : ""}</p>` : ""}<form id="jikan-control" class="stack"><button class="button secondary" type="submit" name="operation" value="${importActive(j) ? "jikan-pause" : "jikan-start"}" >${importActive(j) ? "Pause import" : "Start / resume import"}</button></form><p class="form-hint space-top">Retries temporary outages with increasing delays and honors Retry-After. An upstream access refusal pauses the job. Missing portraits are skipped; actors have no Main/Supporting classification.</p></section>`;
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
    html =
      `<section class="host-panel"><h2>Background import budget</h2><p>${b.backgroundPaused ? "Automatic scans are resting until " + esc(new Date(b.nextResumeAt).toLocaleString()) + " to leave capacity for players." : "Automatic scans are within today’s reserved budget."}</p><p class="form-hint">App-local SQL estimate since tracking began: ${b.rowsRead.toLocaleString()} rows read · ${b.rowsWritten.toLocaleString()} rows written (${esc(b.day)}, UTC). Background work rests at 2 million reads or 30,000 writes and resumes the next UTC day. Account-wide usage and platform overhead can differ.</p></section>` +
      html;
  }
  $("#host-content").innerHTML = html;
}
async function load() {
  state = await api("state");
  render();
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
async function importCatalog(cards) {
  if (!Array.isArray(cards)) throw new Error("Catalog must be a JSON array.");
  for (let i = 0; i < cards.length; i += 500)
    await api("catalog", { cards: cards.slice(i, i + 500) });
  return { message: `Imported ${cards.length} cards.` };
}
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (working) return;
  working = true;
  const form = ev.target,
    submit = form.querySelector("[type=submit]");
  if (submit) submit.disabled = true;
  // Retain a key after an uncertain network failure so submitting again cannot duplicate a grant/settlement.
  const key =
    form.dataset.requestKey || (form.dataset.requestKey = crypto.randomUUID());
  try {
    if (form.id === "admin-login-form") {
      const response = await fetch("api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      secret = "";
      adminSession = true;
      await load();
      form.reset();
      $("#unlock").hidden = true;
      $("#console").hidden = false;
      report("Administrator signed in. All host tools are available.");
      return;
    }
    if (form.id === "unlock-form") {
      secret = $("#host-token").value;
      await load();
      $("#host-token").value = "";
      $("#unlock").hidden = true;
      $("#console").hidden = false;
      report("Host console unlocked.");
      return;
    }
    const b = Object.fromEntries(new FormData(form));
    let result;
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
    if (form.id === "pickem") {
      b.ends = new Date(b.ends).getTime();
      b.winnerReward = Number(b.winnerReward);
      b.scoreReward = Number(b.scoreReward);
      result = await api("pickem", b, key);
    }
    if (form.id === "settle") {
      b.pickem = Number(b.pickem);
      b.scoreA = Number(b.scoreA);
      b.scoreB = Number(b.scoreB);
      const match = state.pickems.find((p) => p.id === b.pickem);
      if (!match) throw new Error("Choose a closed match.");
      if (
        !confirm(
          `Settle ${match.title}: ${match.team_a} ${b.scoreA}–${b.scoreB} ${match.team_b}? This pays rewards and is final.`,
        )
      )
        return;
      result = await api("settle", b, key);
    }
    if (form.id === "aliases-sync") result = await api("aliases-sync", {}, key);
    if (form.id === "settings") {
      b.premium_character = Number(b.premium_character);
      b.premium_seiyuu = Number(b.premium_seiyuu);
      b.character = Number(b.character);
      b.seiyuu = Number(b.seiyuu);
      result = await api("settings", b, key);
    }
    if (form.id === "catalog")
      result = await importCatalog(
        JSON.parse(await $("#catalog-file").files[0].text()),
      );
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
    delete form.dataset.requestKey;
    await load();
    report(
      result.message +
        (result.code
          ? `\n\nPLAYER: ${result.player}\nONE-USE CODE: ${result.code}\n\nShare this code privately with that player. Expires in seven days.`
          : ""),
    );
  } catch (err) {
    report(err.message, true);
    if (form.id === "unlock-form") secret = "";
  } finally {
    working = false;
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("input", (ev) => {
  const form = ev.target.closest("form");
  if (form) delete form.dataset.requestKey;
});
document.addEventListener("change", (ev) => {
  const form = ev.target.closest("form");
  if (form) delete form.dataset.requestKey;
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest(
    "[data-tab],#lock,#sample-catalog,#export-ledger",
  );
  if (!t || working) return;
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
    secret = "";
    state = null;
    $("#host-content").innerHTML = "";
    $("#console").hidden = true;
    $("#unlock").hidden = false;
    report("Console locked.");
  }
  if (t.id === "sample-catalog") {
    working = true;
    t.disabled = true;
    try {
      let cards = await (await fetch("sample-catalog.json")).json();
      if (state.catalogSummary?.source)
        cards = cards.filter((c) => c.kind === "seiyuu");
      const result = await importCatalog(cards);
      await load();
      report(result.message);
    } catch (e) {
      report(e.message, true);
    } finally {
      working = false;
      t.disabled = false;
    }
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
