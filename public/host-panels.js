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
  return `<section class="host-panel"><h2>Tour Participation</h2>
    <form id="participation-preview" class="stack">
      <label>Team Results or Signup List<textarea name="text" rows="3" maxlength="60000" required placeholder="HaruUrara (A), xeyz (B-), LordGrond (C)"></textarea></label>
      <div class="form-grid"><label>Tour Identifier<input name="event" maxlength="240" placeholder="usual-2026-10-27-1" required></label><label>Audit Note <small>(optional)</small><input name="note" maxlength="240" placeholder="Tour participation"></label></div>
      <div class="host-review-actions"><button class="button mint" type="submit">Review Participants →</button><details><summary>Accepted formats</summary><p>Paste team results or a comma-separated signup list. Scores and ranks are ignored. Each player can receive participation credits once per tour identifier. Resolve unknown aliases before awarding.</p></details></div>
    </form><div id="participation-preview-result"></div></section>`;
}

const rewardTools = [
  ["tour", "Tour Batch"], ["grant", "Individual Grant"], ["deduct", "Deduct Credits"],
];

export function rewardWorkspace(panels, selected) {
  return '<div class="host-reward-tools" role="group" aria-label="Credit reward tools">' + rewardTools.map(([key, label]) =>
    `<button type="button" data-reward-tool="${key}" aria-controls="reward-tool-${key}" aria-pressed="${key === selected}">${label}</button>`
  ).join("") + '</div>' + rewardTools.map(([key]) =>
    `<div id="reward-tool-${key}" data-reward-panel="${key}" ${key === selected ? "" : "hidden"}>${panels[key]}</div>`
  ).join("");
}

// Preserve the host's open tools when the catalogue polling refreshes the view.
const expandedTools = new Map();
export function organizeHostTools(tab) {
  if (tab !== "catalog" && tab !== "players") return;
  for (const panel of document.querySelectorAll("#host-content > .host-panel, #host-content > .table-wrap")) {
    const heading = panel.querySelector(":scope > h2");
    if (!heading && tab !== "players") continue;
    const title = heading?.textContent || "Player Directory";
    const key = tab + "/" + title;
    const group = document.createElement("details");
    const summary = document.createElement("summary");
    group.className = "host-tool-disclosure";
    group.open = expandedTools.get(key) ?? ["New Account Codes", "Rarity & Portrait Scan"].includes(title);
    panel.before(group);
    if (heading) summary.append(heading);
    else summary.textContent = title;
    group.append(summary, panel);
    group.addEventListener("toggle", () => {
      if (group.isConnected) expandedTools.set(key, group.open);
    });
  }
}
