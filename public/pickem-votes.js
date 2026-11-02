import { pickemTeams } from "./tour-winner.js";

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

export function pickemVoteChart(p, { escape: e, number: n }) {
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
      return `<div class="pickem-vote-row ${max > 0 && choice.votes === max ? "is-leading" : ""}"><div class="pickem-vote-label"><span>${e(choice.team)}</span><strong>${n(choice.votes)} ${choice.votes === 1 ? "vote" : "votes"} · ${percentage(choice.votes)}%</strong></div><progress max="${Math.max(1, summary.total)}" value="${choice.votes}" aria-label="${e(label)}" aria-valuetext="${e(label)}">${e(label)}</progress></div>`;
    })
    .join("")}</div></section>`;
}
