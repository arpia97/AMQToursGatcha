export function demoHeldCards(state) {
  const player = state.me?.id;
  const listed = row => row.seller === player && (!row.status || row.status === "open") && !row.paid;
  return [
    ...(state.market || []).filter(listed),
    ...(state.auctions || []).filter(row => listed(row) || (row.winner === player && !row.claimed && row.ends <= state.now)),
    ...(state.trades || []).filter(listed),
    ...(state.tradeOffers || []).filter(row => row.proposer === player && row.status === "open").flatMap(row => row.cards || [row]),
  ].map(row => ({ card:row.card, level:row.level || 1, copies:1 + (row.extra_copies || 0), acquired_at:row.created || row.created_at || row.starts || 0 }));
}

export function demoFavorites(state) {
  const owned = new Set([...(state.inventory || []), ...demoHeldCards(state)].filter(row=>row.copies>0).map(row=>row.card));
  return (state.cardFavorites || []).filter(card => owned.has(card));
}
