import { pickemTeams } from "./tour-winner.js";
import { deadlineFields } from "./host-defaults.js";

export function winnerCard(
  t,
  detail,
  { escape: e, number: n, now, drafts = {}, signedIn },
) {
  const expanded = detail?.key === t.key,
    p = expanded ? detail.matches[0] : null;
  const status = t.open
    ? "Open"
    : t.settled === t.matches
      ? "Settled"
      : "Locked · awaiting winner";
  const selected =
    p && drafts[p.id]?.teams === p.teams
      ? drafts[p.id].winner
      : p?.prediction || "";
  const open = p && !p.settled && p.ends > now;
  return `<article class="pickem tour-card"><div class="tour-summary"><div><span class="eyebrow">TOUR WINNER</span><h3>${e(t.name)}</h3><p class="form-hint">Pick one team to win the tour.</p></div><span class="pill ${t.open ? "live" : ""}">${status}</span><button class="button secondary" data-action="pickem-tour" data-id="${t.key}" aria-expanded="${expanded}" aria-controls="tour-rounds-${t.key}">${expanded ? "Hide ↑" : "View teams →"}</button></div>${
    p
      ? `<div class="tour-winner-choice" id="tour-rounds-${t.key}"><p class="form-hint">✦ ${n(p.winner_reward)} for the correct winner · Voting closes ${e(new Date(p.ends).toLocaleString("en-GB", { timeZone: "Asia/Seoul" }))} KST</p>${
          open
            ? `<form id="tour-prediction-${p.id}" data-inline-prediction="${p.id}" class="tour-winner-form"><input type="hidden" name="pickem" value="${p.id}"><input type="hidden" name="mode" value="tour"><input type="hidden" name="expectedTeams" value="${e(p.teams)}"><label>Who will win?<select name="winner" required><option value="">Choose a team…</option>${pickemTeams(
                p,
              )
                .map(
                  (team) =>
                    `<option value="${e(team)}" ${selected === team ? "selected" : ""}>${e(team)}</option>`,
                )
                .join(
                  "",
                )}</select></label><button class="button secondary" ${signedIn ? 'type="submit"' : 'type="button" data-action="account"'}>${signedIn ? "Confirm pick" : "Sign in"}</button><div class="form-error" role="alert"></div></form>`
            : `<p>${p.prediction ? "Your pick: <strong>" + e(p.prediction) + "</strong>" : "No pick submitted."}</p>${p.settled ? `<p>Winner: <strong>${e(p.result_winner)}</strong></p>` : ""}`
        }<p class="form-hint">Teams: ${pickemTeams(p).map(e).join(" · ")}</p></div>`
      : ""
  }</article>`;
}

export function winnerCreatePanel() {
  return `<section class="host-panel"><h2>Create a tour pick’em</h2><p>Enter the tour name and teams. Players choose one team to win; only correct-winner rewards are paid.</p><form id="tour-winner-create" class="stack"><label>Tour name<input name="name" maxlength="100" required></label><label>Teams · one per line<textarea name="teams" rows="4" maxlength="6500" placeholder="Team A&#10;Team B&#10;Team C&#10;Team D" required></textarea></label><label>Correct winner reward<input name="winnerReward" type="number" min="0" max="100000" value="500" required></label>${deadlineFields("ends", "Voting closes")}<button class="button" type="submit">Publish tour pick’em →</button></form></section>`;
}

export function winnerEditor(p, e) {
  const local = new Date(p.ends - new Date(p.ends).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return `<section class="host-panel"><h2>Edit tour pick’em</h2><p>${p.votes} submitted picks. Changing the team list requires clearing existing picks; name, reward and deadline edits keep them.</p><form id="edit-tour-winner" class="stack"><label>Tour name<input name="name" value="${e(p.tour)}" maxlength="100" required></label><label>Teams · one per line<textarea name="teams" rows="4" maxlength="6500" required>${e(pickemTeams(p).join("\n"))}</textarea></label><label>Voting closes (your local time)<input type="datetime-local" name="ends" value="${local}" required></label><label>Correct winner reward<input name="winnerReward" type="number" min="0" max="100000" value="${p.winner_reward}" required></label>${p.votes ? '<label class="check-label"><input type="checkbox" name="clearPredictions"> If I change teams, clear the existing picks so players can choose again.</label>' : ""}<button class="button" type="submit">Save tour pick’em →</button></form><details class="space-top"><summary>Delete this pick’em</summary><p class="host-warning">Removes this tour pick’em and its ${p.votes} picks. No credits are changed.</p><form id="delete-pickem" class="stack"><label>Type DELETE PICKEM ${p.id}<input name="confirmation" required autocomplete="off"></label><button class="button secondary" type="submit">Delete tour pick’em</button></form></details></section>`;
}
