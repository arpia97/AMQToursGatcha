import { pickemTeams } from "./tour-winner.js";

export function pickemShare(id) {
  return `<div class="pickem-share"><button type="button" class="text-button" data-action="copy-pickem" data-id="${id}">Copy Link</button></div>`;
}

export function pickemParticipationTag(participated, { signedIn, settled }) {
  if (!signedIn || !settled || participated !== true) return "";
  return `<span class="pill pickem-participation has-participated">Participated</span>`;
}

export function pickemVoteSummary(p, tallies = []) {
  const teams =
    p.mode === "tour"
      ? pickemTeams(p).map((team) => ({ key: team, team }))
      : [
          { key: "a", team: p.team_a },
          { key: "b", team: p.team_b },
          ...(p.mode === "pair" ? [{ key: "draw", team: "Draw (1:1)" }] : []),
        ];
  const counts = new Map(tallies.map((row) => [row.winner, row.votes]));
  const choices = teams.map((choice) => ({
    ...choice,
    votes:
      Number.isSafeInteger(counts.get(choice.key)) &&
      counts.get(choice.key) >= 0
        ? counts.get(choice.key)
        : 0,
  }));
  return {
    total: choices.reduce((total, choice) => total + choice.votes, 0),
    choices,
  };
}

export function pickemVoteChart(
  p,
  { escape: e, number: n, selectable = false, selected = p.prediction || "" },
) {
  const summary = p.voteSummary || pickemVoteSummary(p);
  const max = Math.max(0, ...summary.choices.map((choice) => choice.votes));
  const percentage = (votes) =>
    summary.total
      ? ((100 * votes) / summary.total).toLocaleString("en-US", {
          maximumFractionDigits: 1,
        })
      : "0";
  return `<section class="pickem-vote-chart" aria-label="Vote Distribution"><div class="pickem-vote-heading"><h4>Vote Distribution</h4><span>${n(summary.total)} ${summary.total === 1 ? "voter" : "voters"}</span></div>${!summary.total ? '<p class="form-hint">No votes yet.</p>' : ""}<div class="pickem-vote-bars">${summary.choices
    .map((choice) => {
      const label =
        choice.team +
        ": " +
        n(choice.votes) +
        (choice.votes === 1 ? " vote" : " votes") +
        " (" +
        percentage(choice.votes) +
        "%)";
      const winner =
        p.settled &&
        choice.key ===
          (p.mode === "tour"
            ? p.result_winner
            : p.result_a > p.result_b
              ? "a"
              : p.result_b > p.result_a
                ? "b"
                : "draw");
      const classes =
        "pickem-vote-row " +
        (max > 0 && choice.votes === max ? "is-leading " : "") +
        (choice.key === selected ? "is-selected " : "") +
        (winner ? "is-winner" : "");
      const contents = `<div class="pickem-vote-content"><div class="pickem-vote-label"><span>${e(choice.team)}${winner ? '<b class="pickem-winner-label">Winner</b>' : ""}</span><strong>${n(choice.votes)} ${choice.votes === 1 ? "vote" : "votes"} · ${percentage(choice.votes)}%</strong></div><progress max="${Math.max(1, summary.total)}" value="${choice.votes}" aria-label="${e(label)}" aria-valuetext="${e(label)}">${e(label)}</progress></div><span class="pickem-vote-check" aria-hidden="true">✓</span>`;
      return selectable
        ? `<label class="${classes} is-selectable"><input type="radio" name="winner" value="${e(choice.key)}" required ${selected === choice.key ? "checked" : ""} aria-label="Pick ${e(choice.team)}">${contents}</label>`
        : `<div class="${classes}">${contents}</div>`;
    })
    .join("")}</div></section>`;
}
