import { pickemOutcome } from "./pickem-formats.js";
import { pickemTeams } from "./tour-winner.js";

export function settlementDraft(match, saved) {
  return saved?.teamA === match.team_a &&
    saved?.teamB === match.team_b &&
    saved?.mode === (match.mode || "match") &&
    (match.mode !== "tour" || saved.teams === match.teams)
    ? saved
    : {
        teamA: match.team_a,
        teamB: match.team_b,
        mode: match.mode || "match",
        teams: match.teams,
        winner: "",
        result: "",
        scoreA: "",
        scoreB: "",
      };
}

export function settlementBody(match, values, now = Date.now()) {
  if (!match || match.settled || match.ends > now)
    throw Error("Choose a closed, unsettled match.");
  if (match.mode === "tour") {
    if (!pickemTeams(match).includes(values.winner))
      throw Error("Choose the winning team.");
    return {
      pickem: match.id,
      winner: values.winner,
      expectedTeams: match.teams,
    };
  }
  let scoreA, scoreB;
  if (match.mode === "pair") {
    if (!["2:0", "1:1", "0:2"].includes(values.result))
      throw Error("Choose 2:0, 1:1 or 0:2.");
    [scoreA, scoreB] = values.result.split(":").map(Number);
  } else {
    if (
      [values.scoreA, values.scoreB].some(
        (v) => v == null || String(v).trim() === "",
      )
    )
      throw Error("Enter both final scores.");
    scoreA = Number(values.scoreA);
    scoreB = Number(values.scoreB);
    if (
      [scoreA, scoreB].some(
        (n) => !Number.isSafeInteger(n) || n < 0 || n > 1000,
      )
    )
      throw Error("Scores must be whole numbers from 0 to 1,000.");
  }
  pickemOutcome(scoreA, scoreB, match.mode);
  return { pickem: match.id, scoreA, scoreB };
}

export function settlementTable(matches, e, drafts = {}, now = Date.now()) {
  if (matches.length && matches.every((p) => p.mode === "tour")) {
    return `<div class="table-wrap settlement-table-wrap"><table class="settlement-table"><thead><tr><th>Tour</th><th>Winning team</th><th>Status</th><th>Post</th></tr></thead><tbody>${matches
      .map((p) => {
        const ready = !p.settled && p.ends <= now,
          form = "settle-match-" + p.id,
          draft = settlementDraft(p, drafts[p.id]);
        return `<tr><th scope="row">${e(p.tour)}</th><td>${
          p.settled
            ? e(p.result_winner)
            : ready
              ? `<select form="${form}" name="winner" required aria-label="Winning team: ${e(p.tour)}"><option value="">Choose winner…</option>${pickemTeams(
                  p,
                )
                  .map(
                    (team) =>
                      `<option value="${e(team)}" ${draft.winner === team ? "selected" : ""}>${e(team)}</option>`,
                  )
                  .join("")}</select>`
              : "—"
        }</td><td>${p.settled ? "Settled" : ready ? "Ready" : "Voting open"}</td><td>${ready ? `<form id="${form}" data-settle-match="${p.id}"><button class="button secondary" type="submit">Confirm winner</button></form>` : p.settled ? "Final" : "Voting has not closed"}</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  }
  return `<div class="table-wrap settlement-table-wrap"><table class="settlement-table"><thead><tr><th>Round</th><th>Match (A vs B)</th><th>Final result (A : B)</th><th>Status</th><th>Post</th></tr></thead><tbody>${matches
    .map((p) => {
      const ready = !p.settled && p.ends <= now,
        draft = settlementDraft(p, drafts[p.id]),
        form = `settle-match-${p.id}`,
        label = e(`${p.team_a} vs ${p.team_b}`);
      const input = (name, team) =>
        `<input form="${form}" name="${name}" type="number" min="0" max="1000" step="1" required value="${e(draft[name])}" aria-label="${e(team)} final score">`;
      const control =
        p.mode === "pair"
          ? `<select form="${form}" name="result" required aria-label="Final result: ${label}"><option value="">Choose result…</option>${["2:0", "1:1", "0:2"].map((v) => `<option value="${v}" ${draft.result === v ? "selected" : ""}>${v.replace(":", " : ")}</option>`).join("")}</select>`
          : `<div class="settlement-score">${input("scoreA", p.team_a)}<span>:</span>${input("scoreB", p.team_b)}</div>`;
      return `<tr><td>${p.round || 1}</td><th scope="row">${label}</th><td>${p.settled ? `${p.result_a} : ${p.result_b}` : ready ? control : "—"}</td><td class="settlement-status">${p.settled ? "Settled" : ready ? "Ready" : "Voting open"}</td><td>${ready ? `<form id="${form}" data-settle-match="${p.id}"><button class="button secondary" type="submit">Confirm result</button></form>` : p.settled ? "Final" : `<small>Closes ${e(new Date(p.ends).toLocaleString("en-GB", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))} KST</small>`}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

export function settlementPanel(state, e, tour = null, drafts = {}) {
  const individual = state.pickems.filter((p) => !p.event_id);
  return `<section class="host-panel" id="settlement-panel"><h2>Post tour winners</h2><p>Open a tour, select its winning team and confirm after voting closes. Correct-winner rewards are paid once. Confirmed results are final.</p><div class="settlement-tours">${(state.pickemEvents || []).map((t) => `<section class="settlement-tour"><div class="settlement-tour-heading"><strong>${e(t.name)}</strong><button type="button" class="button secondary" data-settlement-tour="${t.id}" aria-expanded="${tour?.id === t.id}" aria-controls="settlement-tour-${t.id}">${tour?.id === t.id ? "Hide" : t.format === "winner" ? "Select winner" : "Previous match results"}</button></div>${tour?.id === t.id ? `<div id="settlement-tour-${t.id}">${settlementTable(tour.matches, e, drafts)}<button type="button" class="text-button" data-settlement-refresh>Refresh status ↻</button></div>` : `<div id="settlement-tour-${t.id}" hidden></div>`}</section>`).join("")}</div>${individual.length ? `<details class="space-top"><summary>Previous individual matches</summary>${settlementTable(individual, e, drafts)}</details>` : ""}${!state.pickemEvents?.length && !individual.length ? '<p class="form-hint">No published pick’ems yet.</p>' : ""}</section>`;
}
