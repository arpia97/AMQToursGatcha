import {
  FORMAT_NAMES,
  roundRobin,
  swissRound,
  validateTeams,
} from "./pickem-formats.js";
const localInput = (time) =>
  new Date(time - new Date(time).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export function accessPanel(state, e) {
  const hosts = state.players.filter((p) => p.is_admin);
  return `<section class="host-panel"><h2>Host permissions</h2><p>Hosts can award credits, manage pick’ems and use the host console. Only arpia97 can grant or revoke host access, recover privileged accounts, or delete the player registry.</p><p>Current hosts: ${hosts.map((p) => `${e(p.name)} (${e(p.id)})${p.id === "368" ? " · owner" : ""}`).join(", ") || "None"}</p>${
    state.canManageHosts
      ? `<form id="host-permissions" class="stack"><label>Registered player<select name="player" required><option value="">Choose a player</option>${state.players
          .filter((p) => (p.registered || p.is_admin) && p.id !== "368")
          .map(
            (p) =>
              `<option value="${e(p.id)}">${e(p.name)} (${e(p.id)}) · ${p.is_admin ? "Host" : "Player"}</option>`,
          )
          .join(
            "",
          )}</select></label><label>Permission<select name="enabled"><option value="true">Grant host access</option><option value="false">Revoke host access</option></select></label><button class="button secondary" type="submit">Save host permissions →</button></form>`
      : '<p class="form-hint">Ask arpia97 to change host permissions.</p>'
  }</section>`;
}
export function participationPanel(e) {
  return `<section class="host-panel"><h2>Reward a whole tour</h2><p>Paste team results in the format <code>name (score) name (score) | Total = … | Guesses = […]</code>. Scores are ignored. Aliases resolve to AMQ Tours IDs; repeated players receive one reward. Review everyone before awarding.</p><form id="participation-preview" class="stack"><label>Team results<textarea name="text" rows="7" maxlength="60000" required placeholder="sabetin (98.893) thjalago (83.829) | Total = 182.722 | Guesses = [54]"></textarea></label><div class="form-grid"><label>Credits per player<input name="amount" type="number" min="1" max="1000000" step="1" value="500" required></label><label>Unique tour identifier<input name="event" maxlength="240" placeholder="usual-2026-10-27-1" required></label></div><label>Audit note<input name="note" maxlength="240" placeholder="Tour participation" required></label><button class="button secondary" type="submit">Review participants →</button></form><div id="participation-preview-result"></div><p class="form-hint space-top">A tour identifier can reward each player’s participation only once. Unknown aliases block the whole batch.</p></section>`;
}
export function tournamentPanel(state, e) {
  return `<section class="host-panel"><h2>Build a tour’s pick’ems</h2><p>Generate every round-robin match, or publish Swiss one round at a time. Set a voting deadline for each round before publishing. You can still publish individual matches below.</p><form id="prepare-event" class="stack"><label>Tour name<input name="name" maxlength="100" required></label><label>Format<select name="format">${Object.entries(
    FORMAT_NAMES,
  )
    .map(([key, name]) => `<option value="${key}">${name}</option>`)
    .join(
      "",
    )}</select></label><label>Teams · one per line, in seed order<textarea name="teams" rows="8" required maxlength="6500" placeholder="Team A&#10;Team B&#10;Team C&#10;Team D"></textarea></label><p class="form-hint">4-team double round robin: 6 rounds / 12 matches. 6-team single round robin: 5 rounds / 15 matches. Swiss: 8 to 64 teams; odd counts receive a bye; first round uses top-half versus bottom-half seeds. Later rounds use wins, opponents’ wins, score difference and seed order, avoiding rematches.</p><button class="button secondary" type="submit">Prepare schedule →</button></form></section><section class="host-panel"><h2>Next Swiss round</h2><p>Settle every published match first. Pairings prefer teams with similar results and never repeat an opponent.</p><form id="prepare-swiss" class="stack"><label>Swiss event<select name="event" required><option value="">Choose an event</option>${(
    state.pickemEvents || []
  )
    .filter((x) => x.format === "swiss")
    .map(
      (x) =>
        `<option value="${x.id}">${e(x.name)} · ${x.teams.length} teams</option>`,
    )
    .join(
      "",
    )}</select></label><button class="button secondary" type="submit">Prepare next round →</button></form></section><div id="schedule-preview"></div>`;
}
export function prepareSchedule(form, state) {
  if (form.event) {
    const event = state.pickemEvents.find((x) => x.id === Number(form.event));
    if (!event || event.format !== "swiss")
      throw Error("Choose a Swiss event.");
    const expectedRound = Math.max(0, ...event.matches.map((m) => m.round)) + 1;
    if (expectedRound > event.teams.length - (event.teams.length % 2 ? 0 : 1))
      throw Error("All rematch-free rounds have been played.");
    const { pairs, standings, bye } = swissRound(
      event.teams,
      event.matches,
      event.byes || [],
    );
    return {
      path: "pickem-swiss-round",
      name: event.name,
      startRound: expectedRound,
      rounds: [pairs],
      standings,
      bye,
      body: {
        event: event.id,
        expectedRound,
        expectedPairs: pairs,
        expectedBye: bye,
      },
    };
  }
  const teams = validateTeams(
    form.format,
    form.teams
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const swiss = form.format === "swiss" ? swissRound(teams) : null;
  const rounds = swiss ? [swiss.pairs] : roundRobin(form.format, teams);
  return {
    path: "pickem-event",
    name: form.name,
    startRound: 1,
    rounds,
    bye: swiss?.bye,
    body: { name: form.name, format: form.format, teams },
  };
}
export function scheduleReview(draft, e) {
  return `<section class="host-panel"><h2>Review ${e(draft.name)}</h2><p>${draft.rounds.reduce((n, r) => n + r.length, 0)} matches. All deadlines use your browser’s local time. The same deadline applies to every match in that round.</p>${draft.bye ? `<p class="notice">${e(draft.bye)} receives a bye: one standings win, no pick’em or prediction rewards. Byes go to the lowest-ranked eligible team and never repeat.</p>` : ""}${draft.standings ? `<details><summary>Swiss standings</summary><div class="table-wrap"><table><thead><tr><th>Team</th><th>Wins</th><th>Opponents’ wins</th><th>Score difference</th></tr></thead><tbody>${draft.standings.map((s) => `<tr><td>${e(s.team)}</td><td>${s.wins}</td><td>${s.buchholz}</td><td>${s.diff}</td></tr>`).join("")}</tbody></table></div></details>` : ""}<form id="publish-schedule" class="stack"><div class="host-schedule">${draft.rounds.map((pairs, i) => `<div class="host-round"><h3>Round ${draft.startRound + i}</h3><ul>${pairs.map(([a, b]) => `<li>${e(a)} vs ${e(b)}</li>`).join("")}</ul><label>Voting closes<input name="deadline-${i}" type="datetime-local" required value="${localInput(Date.now() + 3600000 + i * 86400000)}"></label></div>`).join("")}</div><div class="form-grid"><label>Correct winner reward<input type="number" name="winnerReward" min="0" max="100000" value="500" required></label><label>Each exact team score reward<input type="number" name="scoreReward" min="0" max="100000" value="500" required></label></div><p class="form-hint">Rewards add together: a correct winner and both exact team scores pay 1,500 credits with these defaults.</p><button class="button" type="submit">Publish reviewed pick’ems →</button></form></section>`;
}
