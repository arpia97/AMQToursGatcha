export function creditAuditPanel(data, filters, players, e) {
  const n = (value) => Number(value || 0).toLocaleString("en-US");
  const options = (values, selected) =>
    values
      .map(
        ([v, label]) =>
          `<option value="${e(v)}" ${v === selected ? "selected" : ""}>${e(label)}</option>`,
      )
      .join("");
  return `<section class="host-panel"><div class="section-head"><h2>Credit Audit</h2><button class="button secondary" id="export-ledger">Download Last 12 Hours CSV</button></div><form id="credit-audit-filters" class="audit-filters"><label>View<select name="kind">${options(
    [
      ["spent", "Credit Spending"],
      ["earned", "Credit Earnings"],
      ["host", "Host Activity Rewards"],
    ],
    filters.kind,
  )}</select></label><label>Players<select name="scope">${options(
    [
      ["all", "All Players"],
      ["hosts", "Current Hosts Only"],
    ],
    filters.scope,
  )}</select></label><label>Period<select name="window">${options(
    [
      ["12h", "Last 12 Hours"],
      ["24h", "Last 24 Hours"],
      ["7d", "Last 7 Days"],
      ["all", "All Recorded Activity"],
    ],
    filters.window,
  )}</select></label><label>Player<select name="player"><option value="">All Matching Players</option>${players.map((p) => `<option value="${e(p.id)}" ${p.id === filters.player ? "selected" : ""}>${e(p.name)} (${e(p.id)})</option>`).join("")}</select></label><button class="button secondary" type="submit">Apply Filters</button></form><p class="form-hint">Spending shows negative wallet movements; earnings shows positive movements, including refunds and gambling payouts. These are separate from lifetime earned credits. Host rewards include participation, counting, reporting and other manual awards. Older issuing-host details may be unrecorded. CSV always contains every available wallet movement from the last 12 hours, across all players.</p>${data ? `<div class="audit-totals"><div><span>Spent</span><strong>✦ ${n(data.totals.spent)}</strong></div><div><span>Received</span><strong>✦ ${n(data.totals.earned)}</strong></div><div><span>Host Rewards</span><strong>✦ ${n(data.totals.host_rewards)}</strong></div></div><p class="form-hint">${e(new Date(data.from).toLocaleString("en-GB", { timeZone: "Asia/Seoul" }))} – ${e(new Date(data.to).toLocaleString("en-GB", { timeZone: "Asia/Seoul" }))} KST · Totals use the selected period and players.</p>` : '<p role="status">Loading Credit Activity…</p>'}</section>${data ? `<div class="table-wrap"><table><thead><tr><th>Time (KST)</th><th>Player</th><th>Credits</th><th>Reason</th><th>Issuing Host</th></tr></thead><tbody>${data.rows.map((l) => `<tr><td>${e(new Date(l.at).toLocaleString("en-GB", { timeZone: "Asia/Seoul" }))}</td><td>${e(l.player_name)}<small class="audit-id">${e(l.player)}</small></td><td class="${l.delta > 0 ? "ledger-positive" : "ledger-negative"}">${l.delta > 0 ? "+" : ""}${n(l.delta)}</td><td>${e(l.reason)}${l.event ? `<small class="audit-id">${e(l.event)}</small>` : ""}</td><td>${e(l.actor === "host-token" ? "Host Tool" : l.actor_name || (l.category ? "Not recorded" : "—"))}</td></tr>`).join("") || '<tr><td colspan="5">No matching credit activity.</td></tr>'}</tbody></table></div><div class="toolbar"><button class="button secondary" data-audit-page="prev" ${filters.before ? "" : "disabled"}>← Newer</button><button class="button secondary" data-audit-page="next" ${data.hasMore ? "" : "disabled"}>Older →</button></div>` : ""}`;
}
