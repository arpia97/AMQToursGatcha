// Ledger rows are the authority for wallet movement. Trade completion is informational:
// offered credits were already debited when the offer entered escrow.
export function recentActivityRows(state) {
  const rows = (state.ledger || []).map(l => ({
    at: l.at || 0, text: l.reason, delta: l.delta,
  }));
  for (const t of state.recentTrades || []) {
    if (t.role === "seller" && t.credits > 0) continue;
    const gave = (t.givenCards || []).join(", ") || "—";
    const got = (t.receivedCards || []).join(", ") || "—";
    rows.push({
      at: t.at || 0,
      text: `Trade with ${t.partnerName}: gave ${gave} · received ${got}`,
      delta: 0,
    });
  }
  rows.sort((a, b) => (b.at || 0) - (a.at || 0));
  return rows.slice(0, 15);
}
