export function accessPanel(state, e) {
  const hosts = state.players.filter((p) => p.is_admin);
  return `<section class="host-panel"><h2>Host Permissions</h2><p>Hosts can award credits, manage pick’ems and use the host console. Only arpia97 can grant or revoke host access, recover privileged accounts, or delete the player registry.</p><p>Current hosts: ${hosts.map((p) => `${e(p.name)} (${e(p.id)})${p.id === "368" ? " · owner" : ""}`).join(", ") || "None"}</p>${
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
export function participationPanel() {
  return `<section class="host-panel"><h2>Reward a Whole Tour</h2><p>Paste team results (<code>name (score) name (score) | Total = … | Guesses = […]</code>) or a comma-separated signup list (<code>HaruUrara (A), xeyz (B-), LordGrond (C)</code>). Scores and ranks are ignored. Aliases resolve to AMQ Tours IDs; repeated players receive one reward. Review each player’s rounds and Count / Report checkboxes before awarding. Substitutes can be selected from the full player pool.</p><form id="participation-preview" class="stack"><label>Team Results or Signup List<textarea name="text" rows="7" maxlength="60000" required placeholder="sabetin (98.893) thjalago (83.829) xeyz (82.686) ilffam (73.115) | Total = 338.523 | Guesses = [5454]"></textarea></label><div class="form-grid"><label>Unique tour identifier<input name="event" maxlength="240" placeholder="usual-2026-10-27-1" required></label></div><label>Audit note<input name="note" maxlength="240" placeholder="Tour participation"></label><button class="button secondary" type="submit">Review participants →</button></form><div id="participation-preview-result"></div><p class="form-hint space-top">A tour identifier can reward each player’s participation only once. Unknown aliases block the whole batch.</p></section>`;
}
