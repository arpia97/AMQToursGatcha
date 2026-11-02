export function matchingCreditPlayers(state, query = "") {
  const q = query.trim().toLowerCase(),
    names = new Map();
  for (const row of [...(state.aliases || []), ...(state.usernames || [])]) {
    if (!names.has(row.player)) names.set(row.player, []);
    names.get(row.player).push(row.alias || row.label || "");
  }
  return state.players.filter((p) =>
    [p.id, p.name, ...(names.get(p.id) || [])].some((value) =>
      String(value).toLowerCase().includes(q),
    ),
  );
}
export const creditPlayerOptions = (players, escape, selected = "") =>
  '<option value="">Choose a Player</option>' +
  players
    .map(
      (p) =>
        `<option value="${escape(p.id)}" ${selected === p.id ? "selected" : ""}>${escape(p.name)} (${escape(p.id)}) · ${Number(p.balance).toLocaleString("en-US")} credits</option>`,
    )
    .join("");
export function creditPlayerPicker(state, id, escape) {
  return `<div class="form-grid host-credit-picker"><label>Find a Player<input type="search" data-credit-search="${id}" aria-label="Search Players to ${id === "grant" ? "Reward" : "Deduct Credits"}" placeholder="Username, alias or Tours ID" autocomplete="off"></label><label>AMQ Player<select name="player" id="${id}-player" required>${creditPlayerOptions(state.players, escape)}</select></label></div><p class="form-hint" data-credit-count="${id}">${state.players.length} players · Search includes aliases and past usernames.</p>`;
}
export function deductionPanel(state, escape) {
  return `<section class="host-panel"><h2>Deduct Credits</h2><p>Remove available credits from a player. Lifetime earned credits and tour statistics stay unchanged. Every deduction is recorded in the ledger.</p><form id="deduct" class="stack">${creditPlayerPicker(state, "deduct", escape)}<div class="form-grid"><label>Credit Amount<input type="number" name="amount" min="1" max="1000000" step="1" required></label><label>Reason<input name="note" maxlength="240" placeholder="Host credit deduction"></label></div><button class="button secondary" type="submit">Review Deduction →</button></form><div id="deduction-review"></div></section>`;
}
export function deductionReview(quote, escape) {
  return `<section class="notice space-top"><h3>Review Credit Deduction</h3><p><strong>${escape(quote.name)}</strong> · AMQ Tours ID ${escape(quote.player)}<br>Remove <strong>${quote.amount.toLocaleString("en-US")}</strong> credits · Balance ${quote.expectedBalance.toLocaleString("en-US")} → <strong>${quote.remaining.toLocaleString("en-US")}</strong><br>Reason: ${escape(quote.note)}</p><form id="deduct-confirm" class="stack"><div class="form-grid"><button type="button" class="button secondary" data-cancel-deduction>Cancel</button><button type="submit" class="button">Confirm Deduction</button></div></form></section>`;
}
