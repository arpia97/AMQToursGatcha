import { winnerEditor } from "./tour-winner-ui.js";
export function localDeadline(ms) {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function pickemManagement(state, e) {
  return `<section class="host-panel"><h2>Edit or Delete Published Pick’ems</h2><p>Open a tour to edit its name, teams, reward or deadline. Settled results are protected because rewards have been paid.</p><form id="manage-pickem-tour" class="stack"><label>Published tour<select name="event" required><option value="">Choose a tour</option>${(state.pickemEvents || []).map((t) => `<option value="${t.id}">${e(t.name)}</option>`).join("")}</select></label><button class="button secondary" type="submit">Manage tour →</button></form><div id="pickem-tour-manager"></div></section><div id="pickem-editor" tabindex="-1"></div>`;
}
export function tourManager(t, e) {
  if (t.format === "winner" && t.matches[0])
    return t.matches[0].settled
      ? `<p>Winner: <strong>${e(t.matches[0].result_winner)}</strong> · rewards paid. Settled results cannot be edited or deleted.</p>`
      : winnerEditor(t.matches[0], e);
  const votes = t.matches.reduce((n, p) => n + p.votes, 0),
    settled = t.matches.some((p) => p.settled);
  const legacy =
    t.format === "double-4" &&
    t.matches.length === 12 &&
    t.matches.every((p) => p.mode !== "pair") &&
    !settled;
  return `<h3 class="space-top">${e(t.name)}</h3>${legacy ? `<details class="space-top"><summary>Combine the Two Legs into Six Matchup Predictions</summary><p>Each team pair will have one 2:0, 1:1 or 0:2 prediction. The earlier deadline is kept. ${votes} existing predictions must be cleared; no credits or paid results are changed.</p><form id="combine-pickem-tour" class="stack">${votes ? '<label class="check-label"><input type="checkbox" name="clearPredictions" required> Clear existing predictions and let players submit combined results.</label>' : ""}<label>Type COMBINE TOUR ${t.id}<input name="confirmation" required autocomplete="off"></label><button class="button secondary" type="submit">Use combined matchup results →</button></form></details>` : ""}<form id="rename-pickem-tour" class="stack"><label>Tour name<input name="name" value="${e(t.name)}" maxlength="100" required></label><button class="button secondary" type="submit">Save tour name →</button></form><div class="table-wrap"><table><thead><tr><th>Round</th><th>Match</th><th>Status</th><th>Predictions</th><th>Manage</th></tr></thead><tbody>${t.matches.map((p) => `<tr><td>${p.round}</td><td>${e(p.team_a)} vs ${e(p.team_b)}</td><td>${p.settled ? "Settled" : p.ends <= Date.now() ? "Locked" : "Open"}</td><td>${p.votes}</td><td>${p.settled ? "Final" : `<button type="button" class="text-button" data-pickem-edit="${p.id}">Edit / delete</button>`}</td></tr>`).join("")}</tbody></table></div>${settled ? '<p class="form-hint">This tour has settled results and cannot be deleted. Unsettled matches can still be edited individually.</p>' : `<details class="space-top"><summary>Delete This Tour</summary><p class="host-warning">This removes all ${t.matches.length} matches and ${votes} predictions. No credits are changed. This cannot be undone.</p><form id="delete-pickem-tour" class="stack"><label>Type DELETE TOUR ${t.id}<input name="confirmation" required autocomplete="off"></label><button class="button secondary" type="submit">Delete tour pick’ems</button></form></details>`}`;
}
export function matchEditor(p, e) {
  if (p.mode === "tour") return winnerEditor(p, e);
  return `<section class="host-panel"><h2>Edit Pick’em</h2><p>${e(p.tour)} · ${p.votes} submitted prediction${p.votes === 1 ? "" : "s"}. Changing teams clears predictions; changes to the title, deadline or rewards keep them.</p><form id="edit-pickem" class="stack"><label>Match title<input name="title" value="${e(p.title)}" maxlength="160" required></label><div class="form-grid"><label>Team A<input name="teamA" value="${e(p.team_a)}" maxlength="100" required></label><label>Team B<input name="teamB" value="${e(p.team_b)}" maxlength="100" required></label></div><label>Predictions close (your local time)<input type="datetime-local" name="ends" value="${localDeadline(p.ends)}" required></label><p class="form-hint">Keep the existing deadline, or choose a new time at least one minute ahead to reopen voting.</p><div class="form-grid"><label>Correct outcome reward<input name="winnerReward" type="number" min="0" max="100000" value="${p.winner_reward}" required></label><label>Each exact team score reward<input name="scoreReward" type="number" min="0" max="100000" value="${p.score_reward}" required></label></div>${p.votes ? '<label class="check-label"><input type="checkbox" name="clearPredictions"> If I change teams, clear the existing predictions so players can vote again.</label>' : ""}<button class="button" type="submit">Save pick’em changes →</button></form><details class="space-top"><summary>Delete This Match</summary><p class="host-warning">This permanently removes this match and its ${p.votes} predictions. No credits are changed.</p><form id="delete-pickem" class="stack"><label>Type DELETE PICKEM ${p.id}<input name="confirmation" required autocomplete="off"></label><button class="button secondary" type="submit">Delete pick’em</button></form></details></section>`;
}
