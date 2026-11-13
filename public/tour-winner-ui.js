import { routeHref } from "./site-navigation.js";
import { tourWinnerRewardDefault } from "./site-defaults.js";
import { pickemVoteChart, pickemParticipationTag, pickemShare } from "./pickem-votes.js";
import { pickemTeams } from "./tour-winner.js";
import { deadlineFields, reopenPickemForm } from "./host-defaults.js";

export function winnerCard(
  t,
  detail,
  { escape: e, number: n, now, drafts = {}, signedIn, focused },
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
  return `<article class="pickem tour-card"><div class="tour-summary"><div><span class="eyebrow">TOUR WINNER</span><h3><a href="${routeHref("pickems/" + t.newest)}">${e(t.name)}</a></h3><p class="form-hint">Pick one team to win the tour.${Number.isSafeInteger(t.voters) ? " · " + n(t.voters) + (t.voters === 1 ? " voter" : " voters") : ""}</p></div><span class="pickem-status-tags">${pickemParticipationTag(t.participated ?? (expanded ? !!p?.prediction : null), { signedIn, settled: t.settled === t.matches })}<span class="pill ${t.open ? "live" : ""}">${status}</span></span>${focused ? "" : `<button type="button" class="button secondary" data-action="pickem-tour" data-id="${t.key}" aria-expanded="${expanded}" aria-controls="tour-rounds-${t.key}">${expanded ? "Hide ↑" : "View Teams →"}</button>`}</div>${
    p
      ? `<div class="tour-winner-choice" id="tour-rounds-${t.key}"><p class="form-hint">✦ ${n(p.winner_reward)} for the correct winner · Voting closes ${e(new Date(p.ends).toLocaleString("en-GB", { timeZone: "Asia/Seoul" }))} KST</p>${
          open
            ? `<form id="tour-prediction-${p.id}" data-inline-prediction="${p.id}" class="tour-winner-form"><input type="hidden" name="pickem" value="${p.id}"><input type="hidden" name="mode" value="tour"><input type="hidden" name="expectedTeams" value="${e(p.teams)}">${pickemVoteChart(p, { escape: e, number: n, selectable: true, selected })}${signedIn ? '<span class="pickem-save-status form-hint" role="status">' + (p.prediction ? "Pick Saved" : "Select a Team to Save Your Pick") + "</span>" : '<button class="button secondary" type="button" data-action="account">Sign In</button>'}<div class="form-error" role="alert"></div></form>`
            : ""
        }${open ? "" : pickemVoteChart(p, { escape: e, number: n, selected })}</div>`
      : ""
  }${pickemShare(t.newest)}</article>`;
}

export function winnerCreatePanel() {
  return `<section class="host-panel"><h2>Create a Tour Pick’em</h2><p>Enter the tour name and teams, or paste scored team results. Ratings and totals are removed, and registered names use their main AMQ Tours aliases.</p><form id="tour-winner-create" class="stack"><label>Tour name<input name="name" required></label><label>Teams · one per line<textarea name="teams" rows="4" placeholder="Team A&#10;Team B&#10;Team C&#10;Team D" required></textarea></label><label>Correct winner reward<input name="winnerReward" type="number" min="0" max="100000" value="${tourWinnerRewardDefault()}" required></label><p class="form-hint">Defaults to 500 credits per 8 players · 4 players per team. Editable.</p>${deadlineFields("ends", "Voting closes")}<button class="button" type="submit">Publish tour pick’em →</button></form></section>`;
}

export function syncWinnerRewardDefault(form, input) {
  if (form?.getAttribute("id") !== "tour-winner-create") return;
  if (input.name === "winnerReward") form.dataset.manualWinnerReward = "1";
  if (input.name !== "teams" || form.dataset.manualWinnerReward) return;
  const count = input.value.split(/\r?\n/).filter((line) => line.trim()).length;
  form.elements.namedItem("winnerReward").value = String(tourWinnerRewardDefault(count || 4));
}

export function winnerEditor(p, e, now = Date.now()) {
  const local = new Date(p.ends - new Date(p.ends).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return `<section class="host-panel"><h2>Edit Tour Pick’em</h2><p>${p.votes} submitted picks. Changing the team list requires clearing existing picks; name, reward and deadline edits keep them.</p>${reopenPickemForm(p, now)}<form id="edit-tour-winner" class="stack"><label>Tour name<input name="name" value="${e(p.tour)}" required></label><label>Teams · one per line<textarea name="teams" rows="4" required>${e(pickemTeams(p).join("\n"))}</textarea></label><label>Voting closes (your local time)<input type="datetime-local" name="ends" value="${local}" required></label><label>Correct winner reward<input name="winnerReward" type="number" min="0" max="100000" value="${p.winner_reward}" required></label>${p.votes ? '<label class="check-label"><input type="checkbox" name="clearPredictions"> If I change teams, clear the existing picks so players can choose again.</label>' : ""}<button class="button" type="submit">Save tour pick’em →</button></form><details class="space-top"><summary>Delete This Pick’em</summary><p class="host-warning">Removes this tour pick’em and its ${p.votes} picks. No credits are changed.</p><form id="delete-pickem" class="stack"><label>Type DELETE PICKEM ${p.id}<input name="confirmation" required autocomplete="off"></label><button class="button secondary" type="submit">Delete tour pick’em</button></form></details></section>`;
}
